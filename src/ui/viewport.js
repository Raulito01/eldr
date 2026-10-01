// @ts-check
/**
 * Viewport: shows rendered frames over a background, with zoom/pan and debug overlays.
 * It only DISPLAYS frames; rendering happens elsewhere and is handed in via `present()`.
 *
 * Controls: toolbar (background, zoom, overlays) · trackpad pinch or ⌘/Ctrl + scroll = zoom
 * around the cursor · scroll or drag = pan · double-click = fit.
 */

import { fitZoom, stepZoom, ZOOM_STEPS, zoomAt } from './viewportMath.js';
import { paintViewport } from './viewportPaint.js';
import { h } from './widgets/widgets.js';

/** Background presets. `checker` = transparency checkerboard. */
export const BACKGROUNDS = Object.freeze({
  checker: { label: 'Checker', color: null },
  dark: { label: 'Dark', color: '#16161a' },
  light: { label: 'Light', color: '#e8e8ec' },
});

/**
 * @typedef {object} ViewportOptions
 * @property {number} frameW
 * @property {number} frameH
 * @property {{x: number, y: number}} [pivot] normalized, default centre
 */

/**
 * @param {HTMLElement} container
 * @param {ViewportOptions} options
 */
export function createViewport(container, options) {
  const state = {
    frameW: options.frameW,
    frameH: options.frameH,
    pivot: options.pivot ?? { x: 0.5, y: 0.5 },
    fit: true,
    zoom: 1,
    panX: 0,
    panY: 0,
    bg: /** @type {string} */ ('checker'),
    customColor: '#3a5a40',
    show: { bounds: true, pivot: true, stats: true },
  };
  /** @type {{ canvas: any } | null} */
  let surface = null;
  let renderMs = 0;
  let fps = 0;
  let lastPresent = 0;

  // ---------- DOM ----------
  const canvas = h('canvas', { class: 'vp-canvas' });
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const stage = h('div', { class: 'vp-stage' }, [canvas]);

  const bgButtons = Object.entries(BACKGROUNDS).map(([key, b]) =>
    h('button', {
      type: 'button',
      class: `vp-swatch vp-swatch-${key}`,
      title: b.label,
      onclick: () => setBackground(key),
    }),
  );
  const customInput = h('input', {
    type: 'color',
    class: 'vp-custom',
    title: 'Custom background',
    value: state.customColor,
  });
  customInput.addEventListener('input', () => {
    state.customColor = customInput.value;
    setBackground('custom');
  });

  const zoomSelect = h('select', { class: 'vp-zoom', title: 'Zoom' }, [
    h('option', { value: 'fit' }, ['Fit']),
    ...ZOOM_STEPS.map((z) => h('option', { value: String(z) }, [`${Math.round(z * 100)}%`])),
    h('option', { value: 'custom', hidden: true }, ['']),
  ]);
  zoomSelect.addEventListener('change', () => {
    if (zoomSelect.value === 'fit') setFit();
    else if (zoomSelect.value !== 'custom') setZoom(Number(zoomSelect.value));
  });

  const toggle = (/** @type {'bounds'|'pivot'|'stats'} */ key, /** @type {string} */ label) => {
    const input = h('input', { type: 'checkbox', checked: state.show[key] });
    input.addEventListener('change', () => {
      state.show[key] = input.checked;
      draw();
    });
    return h('label', { class: 'vp-toggle' }, [input, label]);
  };

  const toolbar = h('div', { class: 'vp-toolbar' }, [
    h('span', { class: 'vp-group' }, [...bgButtons, customInput]),
    h('span', { class: 'vp-group' }, [zoomSelect]),
    h('span', { class: 'vp-group' }, [
      toggle('bounds', 'Bounds'),
      toggle('pivot', 'Pivot'),
      toggle('stats', 'Stats'),
    ]),
  ]);
  const root = h('div', { class: 'vp' }, [toolbar, stage]);
  container.replaceChildren(root);

  // ---------- state helpers ----------
  const viewSize = () => ({ viewW: stage.clientWidth, viewH: stage.clientHeight });

  function viewState() {
    const { viewW, viewH } = viewSize();
    const zoom = state.fit ? fitZoom(state.frameW, state.frameH, viewW, viewH) : state.zoom;
    const pan = state.fit ? { panX: 0, panY: 0 } : { panX: state.panX, panY: state.panY };
    return { frameW: state.frameW, frameH: state.frameH, viewW, viewH, zoom, ...pan };
  }

  /** @param {{zoom: number, panX: number, panY: number}} v */
  function applyView(v) {
    state.fit = false;
    state.zoom = v.zoom;
    state.panX = v.panX;
    state.panY = v.panY;
    syncZoomSelect();
    draw();
  }

  function setFit() {
    state.fit = true;
    syncZoomSelect();
    draw();
  }

  /** Zoom around the viewport centre. @param {number} z */
  function setZoom(z) {
    const v = viewState();
    applyView(zoomAt(v, v.viewW / 2, v.viewH / 2, z));
  }

  /** @param {string} key 'checker' | 'dark' | 'light' | 'custom' */
  function setBackground(key) {
    state.bg = key;
    const keys = Object.keys(BACKGROUNDS);
    for (const [i, b] of bgButtons.entries()) b.classList.toggle('active', keys[i] === key);
    customInput.classList.toggle('active', key === 'custom');
    draw();
  }

  function syncZoomSelect() {
    if (state.fit) {
      zoomSelect.value = 'fit';
      return;
    }
    const preset = ZOOM_STEPS.find((z) => Math.abs(z - state.zoom) < 1e-6);
    if (preset !== undefined) zoomSelect.value = String(preset);
    else {
      const custom = /** @type {HTMLOptionElement} */ (zoomSelect.lastElementChild);
      custom.textContent = `${Math.round(state.zoom * 100)}%`;
      zoomSelect.value = 'custom';
    }
  }

  /** Background colour currently shown, or null for checker. */
  function bgColor() {
    if (state.bg === 'custom') return state.customColor;
    return BACKGROUNDS[/** @type {keyof typeof BACKGROUNDS} */ (state.bg)]?.color ?? null;
  }

  // ---------- drawing ----------
  const makeCanvas = (/** @type {number} */ w, /** @type {number} */ hgt) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    return c;
  };

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const { viewW, viewH } = viewSize();
    if (viewW === 0 || viewH === 0) return;
    const pw = Math.round(viewW * dpr);
    const ph = Math.round(viewH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const view = viewState();
    paintViewport(ctx, {
      dpr,
      view,
      surface,
      background: bgColor(),
      pivot: state.pivot,
      show: state.show,
      statsText: `render ${renderMs.toFixed(2)} ms · ${fps ? fps.toFixed(0) : '–'} fps · ${Math.round(
        view.zoom * 100,
      )}% · ${state.frameW}×${state.frameH}`,
      makeCanvas,
    });
  }

  // ---------- interaction ----------
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const v = viewState();
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch arrives as ctrl+wheel; ⌘/Ctrl + mouse wheel also zooms.
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
        applyView(zoomAt(v, e.clientX - rect.left, e.clientY - rect.top, v.zoom * factor));
      } else {
        applyView({ zoom: v.zoom, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY });
      }
    },
    { passive: false },
  );

  /** @type {{ x: number, y: number, panX: number, panY: number } | null} */
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    const v = viewState();
    drag = { x: e.clientX, y: e.clientY, panX: v.panX, panY: v.panY };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const v = viewState();
    applyView({
      zoom: v.zoom,
      panX: drag.panX + e.clientX - drag.x,
      panY: drag.panY + e.clientY - drag.y,
    });
  });
  const endDrag = () => {
    drag = null;
    stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', setFit);

  const resizeObserver = new ResizeObserver(() => draw());
  resizeObserver.observe(stage);
  setBackground(state.bg);

  return {
    /**
     * Show a rendered frame.
     * @param {{ canvas: any }} frameSurface the renderer's output surface
     * @param {{ renderMs?: number }} [info]
     */
    present(frameSurface, info = {}) {
      surface = frameSurface;
      renderMs = info.renderMs ?? 0;
      const now = performance.now();
      if (lastPresent) {
        const instant = 1000 / Math.max(1, now - lastPresent);
        fps = fps ? fps * 0.9 + instant * 0.1 : instant; // smoothed
      }
      lastPresent = now;
      draw();
    },
    /** @param {number} w @param {number} hgt */
    setFrameSize(w, hgt) {
      state.frameW = w;
      state.frameH = hgt;
      draw();
    },
    /** @param {{x: number, y: number}} p normalized */
    setPivot(p) {
      state.pivot = p;
      draw();
    },
    setBackground,
    setFit,
    setZoom,
    zoomIn: () => setZoom(stepZoom(viewState().zoom, 1)),
    zoomOut: () => setZoom(stepZoom(viewState().zoom, -1)),
    /** Background colour behind the effect (null = transparent / checker). */
    backgroundColor: bgColor,
    destroy() {
      resizeObserver.disconnect();
      root.remove();
    },
  };
}
