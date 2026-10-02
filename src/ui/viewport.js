// @ts-check
/**
 * Viewport: shows rendered frames over a background, with zoom/pan and debug overlays.
 * It only DISPLAYS frames; rendering happens elsewhere and is handed in via `present()`.
 *
 * Controls: toolbar (background, zoom, overlays) · trackpad pinch or ⌘/Ctrl + scroll = zoom
 * around the cursor · scroll or drag = pan · double-click / double-tap = fit (pen-friendly).
 */

import { attachPointer } from './pointer.js';
import { fitZoom, frameRect, stepZoom, ZOOM_STEPS, zoomAt } from './viewportMath.js';
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
 * @property {number | 'fit'} [zoom=1] starting zoom; 100% by default [Raul]
 */

/**
 * @typedef {object} FrameMap  frame pixels ↔ stage CSS pixels
 * @property {number} zoom
 * @property {(fx: number, fy: number) => [number, number]} toScreen
 * @property {(sx: number, sy: number) => [number, number]} toFrame
 */

/**
 * @typedef {object} Interaction  editor pointer handling (e.g. transform handles)
 * @property {(pt: [number, number], e: PointerEvent, map: FrameMap) => boolean} down  true = handled
 * @property {(pt: [number, number], e: PointerEvent, map: FrameMap) => void} move
 * @property {(pt: [number, number], e: PointerEvent, map: FrameMap) => void} [up]
 * @property {(pt: [number, number], e: PointerEvent, map: FrameMap) => string} [hover]  CSS cursor
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
    fit: options.zoom === 'fit',
    zoom: typeof options.zoom === 'number' ? options.zoom : 1,
    panX: 0,
    panY: 0,
    bg: /** @type {string} */ ('checker'),
    customColor: '#3a5a40',
    show: { bounds: true, pivot: true, stats: true, handles: true },
  };
  /** @type {{ canvas: any } | null} */
  let surface = null;
  /**
   * Editor overlay (3.6b): drawn on top in CSS px; gets the frame ↔ screen mapping.
   * @type {((ctx: CanvasRenderingContext2D, map: FrameMap) => void) | null}
   */
  let overlay = null;
  /** @type {Interaction | null} */
  let interaction = null;
  let renderMs = 0;
  /** Extra stats text (e.g. "cached", "½ res"). */
  let statsNote = '';
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

  const toggle = (
    /** @type {'bounds'|'pivot'|'stats'|'handles'} */ key,
    /** @type {string} */ label,
  ) => {
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
      toggle('handles', 'Handles'),
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
      statsText: `${statsNote || `render ${renderMs.toFixed(2)} ms`} · ${fps ? fps.toFixed(0) : '–'} fps · ${Math.round(
        view.zoom * 100,
      )}% · ${state.frameW}×${state.frameH}`,
      makeCanvas,
    });
    if (overlay && state.show.handles) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      overlay(ctx, frameMap());
      ctx.restore();
    }
  }

  /** Frame px ↔ stage CSS px for the current view. @returns {FrameMap} */
  function frameMap() {
    const v = viewState();
    const r = frameRect(v);
    return {
      zoom: v.zoom,
      toScreen: (fx, fy) => [r.x + fx * v.zoom, r.y + fy * v.zoom],
      toFrame: (sx, sy) => [(sx - r.x) / v.zoom, (sy - r.y) / v.zoom],
    };
  }

  /** Pointer position relative to the stage. @param {PointerEvent} e @returns {[number, number]} */
  function stagePoint(e) {
    const rect = stage.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
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
  let handleDrag = false;
  // Hover feedback for editor handles.
  stage.addEventListener('pointermove', (e) => {
    if (drag || handleDrag || !interaction || !state.show.handles || e.buttons) return;
    stage.style.cursor = interaction.hover?.(stagePoint(e), e, frameMap()) ?? '';
  });
  // Editor handles first; otherwise drag to pan, double-click/tap to fit. Pen-friendly: taps
  // don't nudge the view.
  attachPointer(stage, {
    down(e) {
      if (interaction && state.show.handles && interaction.down(stagePoint(e), e, frameMap())) {
        handleDrag = true;
        return true;
      }
      const v = viewState();
      drag = { x: e.clientX, y: e.clientY, panX: v.panX, panY: v.panY };
      return true;
    },
    start() {
      stage.classList.add('dragging');
    },
    move(e) {
      if (handleDrag) {
        interaction?.move(stagePoint(e), e, frameMap());
        return;
      }
      if (!drag) return;
      const v = viewState();
      applyView({
        zoom: v.zoom,
        panX: drag.panX + e.clientX - drag.x,
        panY: drag.panY + e.clientY - drag.y,
      });
    },
    up(e) {
      if (handleDrag) {
        handleDrag = false;
        interaction?.up?.(stagePoint(e), e, frameMap());
        return;
      }
      drag = null;
      stage.classList.remove('dragging');
    },
    tap(_e, isDouble) {
      if (isDouble && !handleDrag) setFit();
    },
  });

  const resizeObserver = new ResizeObserver(() => draw());
  resizeObserver.observe(stage);
  setBackground(state.bg);

  return {
    /**
     * Show a rendered frame.
     * @param {{ canvas: any }} frameSurface the renderer's output surface
     * @param {{ renderMs?: number, note?: string }} [info]
     */
    present(frameSurface, info = {}) {
      surface = frameSurface;
      renderMs = info.renderMs ?? 0;
      statsNote = info.note ?? '';
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
    /** Editor overlay painter (null to remove). @param {typeof overlay} fn */
    setOverlay(fn) {
      overlay = fn;
      draw();
    },
    /** Editor pointer handling, tried before panning (null to remove). @param {Interaction | null} i */
    setInteraction(i) {
      interaction = i;
    },
    /** Redraw (e.g. after the overlay's data changed). */
    redraw: () => draw(),
    /** Add an editor tool (button…) to the toolbar (3.7d: Pan Behind). @param {HTMLElement} el */
    addTool(el) {
      toolbar.append(h('span', { class: 'vp-group' }, [el]));
    },
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
