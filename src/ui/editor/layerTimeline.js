// @ts-check
/**
 * Layer timeline (3.6c, D-054): After Effects–style rows under the viewport.
 *
 * - Ruler: click / drag to scrub; the IMPACT marker (▼) can be dragged.
 * - One row per layer (top of the stack first) with its bar: drag the middle to SLIDE, an end
 *   to TRIM in / out, ⌥ + right end to STRETCH time. Dragging a bar of a selected layer moves
 *   every selected layer (3.7b). Keys of the layer show as small diamonds.
 * - Selected layers open one lane per animated parameter. Keys (3.7b): click = select,
 *   ⇧ / ⌘-click = add / remove, drag on empty lane space = box select, drag = move all selected
 *   keys (snaps to frames), ⌥-drag the first / last selected key = scale their timing.
 *   Linear / Ease / Hold / Delete act on every selected key (or ⌫).
 *
 * Graph Editor (📈, 3.7c): the track shows the value graph of the selected layers' animated
 * numbers instead of bars. Drag a key to change its time and value (⇧ = one axis only), drag a
 * handle to shape the curve (continuous keys move both handles; ⌥ breaks them), drag empty space
 * to box-select. Click a curve's name to hide / show it.
 *
 * Pen-friendly (D-028): edge grips 8 px, diamonds 14 px hit size, everything also reachable by
 * click + buttons. The drawing is a canvas; labels are DOM.
 */

import { keySides } from '../../effects/keyInterp.js';
import { compSeconds, layerSeconds } from '../../effects/layerAnimation.js';
import { h } from '../dom.js';
import { attachPointer } from '../pointer.js';
import {
  drawGraph,
  graphCurves,
  graphHit,
  graphPoints,
  graphRange,
  valueAxis,
} from './graphView.js';

export const RULER_H = 22;
export const ROW_H = 24;
export const LANE_H = 20;
/** Pixels of the bar ends that trim instead of slide. */
export const EDGE = 8;
/** Hit radius of a key diamond. */
export const KEY_HIT = 8;
/** Height of the Graph Editor area, px. */
export const GRAPH_H = 300;

/** Comp seconds → x. @param {number} s @param {number} end comp length (s) @param {number} w */
export const secondsToX = (s, end, w) => (end > 0 ? (s / end) * w : 0);
/** x → comp seconds. @param {number} x @param {number} end @param {number} w */
export const xToSeconds = (x, end, w) => (w > 0 ? (x / w) * end : 0);
/** Space kept free at both ends of the time axis, so keys on the first / last frame show whole. */
export const INSET = 10;

/**
 * Time ↔ x for a zoomed / scrolled view of the comp (3.7d).
 * @param {{ start: number, span: number }} view comp seconds shown: [start, start + span]
 * @param {number} w track width, px
 */
export function makeTimeMap(view, w) {
  const inner = Math.max(1, w - 2 * INSET);
  const span = view.span > 0 ? view.span : 1;
  return {
    X: (/** @type {number} */ s) => INSET + ((s - view.start) / span) * inner,
    S: (/** @type {number} */ x) => view.start + ((x - INSET) / inner) * span,
  };
}

/**
 * The view after zooming to `zoom` (1 = whole comp) keeping comp time `pivot` under the same x.
 * @param {{ start: number, span: number }} view @param {number} zoom @param {number} end comp length
 * @param {number} pivot comp seconds
 */
export function zoomView(view, zoom, end, pivot) {
  const span = end / Math.max(1, zoom);
  const u = view.span > 0 ? (pivot - view.start) / view.span : 0;
  return clampView({ start: pivot - u * span, span }, end);
}

/** Keep the view inside the comp. @param {{ start: number, span: number }} v @param {number} end */
export function clampView(v, end) {
  const span = Math.min(end, Math.max(1e-6, v.span));
  return { start: Math.min(Math.max(0, v.start), Math.max(0, end - span)), span };
}

/** Snap to the nearest frame. @param {number} s @param {number} fps */
export const snapToFrame = (s, fps) => Math.round(s * fps) / fps;

/**
 * New layer time after dragging its bar by `ds` seconds.
 * @param {import('../../effects/layerAnimation.js').LayerTime} t
 * @param {'slide'|'in'|'out'|'stretch'} mode @param {number} ds @param {number} end comp length
 * @param {number} fps
 * @returns {import('../../effects/layerAnimation.js').LayerTime}
 */
export function dragBar(t, mode, ds, end, fps) {
  const frame = 1 / fps;
  const out = t.out ?? end;
  if (mode === 'slide') {
    return {
      ...t,
      offset: t.offset + ds,
      in: Math.max(0, t.in + ds),
      out: t.out === null ? null : t.out + ds,
    };
  }
  if (mode === 'in') return { ...t, in: Math.min(Math.max(0, t.in + ds), out - frame) };
  if (mode === 'out') {
    const o = Math.max(t.in + frame, out + ds);
    return { ...t, out: o >= end - 1e-9 && t.out === null ? null : o };
  }
  // stretch: the right end follows the pointer; content scales around the layer start (offset)
  const span = out - t.offset;
  if (span <= 1e-9) return t;
  const newOut = Math.max(t.offset + frame, out + ds);
  const k = (newOut - t.offset) / span;
  return { ...t, stretch: Math.max(0.05, t.stretch * k), out: t.out === null ? null : newOut };
}

/**
 * @typedef {object} TimelineRow
 * @property {'layer'|'lane'} kind
 * @property {string} layerId
 * @property {string} [paramId]
 * @property {string} label
 * @property {number} y top, px
 * @property {number} h
 */

/** @typedef {import('../../effects/keyEdit.js').KeyRef} KeyRef */

/**
 * @typedef {object} LayerTimelineOptions
 * @property {() => { layers: import('../../effects/explosion/explosion.js').EditorLayer[], selected: string,
 *   selection: string[], frame: number, fps: number, frameCount: number, impact: number | null,
 *   paramLabel: (layerId: string, paramId: string) => string }} get
 * @property {(frame: number) => void} onScrub
 * @property {(layerId: string, mods: { meta?: boolean, shift?: boolean }) => void} onSelect
 * @property {(times: Record<string, import('../../effects/layerAnimation.js').LayerTime>, key: string) => void} onLayerTimes
 * @property {(op: { kind: 'move', refs: KeyRef[], dComp: number, dValue?: number } | { kind: 'scale', refs: KeyRef[], anchor: number, k: number }, key: string) => KeyRef[]} onKeysRetime
 *   refs = keys at the START of the drag; returns the keys' new refs. dValue (Graph Editor):
 *   add to the keys' values too
 * @property {(refs: KeyRef[], kind: import('../../effects/keyInterp.js').InterpKind) => void} onKeysInterp
 *   Linear / Easy Ease / Ease In / Ease Out / Hold
 * @property {(refs: KeyRef[]) => void} [onVelocity]  open the Keyframe Velocity dialog
 * @property {(ref: KeyRef, which: 'in'|'out', t: number, v: number, broken: boolean, key: string) => void} [onGraphHandle]
 *   a Graph Editor handle dragged to (t layer seconds, v)
 * @property {(refs: KeyRef[]) => void} onKeysDelete
 * @property {(seconds: number, key: string) => void} [onImpact]
 * @property {(dir: -1 | 1) => void} [onJumpKey]  previous / next keyframe (3.7)
 * @property {boolean} [keyboard]  listen for ⌫ / Esc itself (default true; the editor routes keys
 *   through its shortcut list instead, 3.7d)
 */

const same = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 1e-6;
/** @param {KeyRef[]} refs @param {KeyRef} k */
const inRefs = (refs, k) =>
  refs.some((r) => r.layerId === k.layerId && r.paramId === k.paramId && same(r.t, k.t));

/**
 * @param {HTMLElement} container @param {LayerTimelineOptions} o
 */
export function createLayerTimeline(container, o) {
  const names = h('div', { class: 'lt-names' });
  const canvas = h('canvas', { class: 'lt-canvas' });
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const track = h('div', { class: 'lt-track' }, [canvas]);
  const keyInfo = h('span', { class: 'lt-keyinfo' }, ['No key selected']);
  const interpBtn = (
    /** @type {import('../../effects/keyInterp.js').InterpKind} */ kind,
    /** @type {string} */ label,
    /** @type {string} */ title,
  ) =>
    h(
      'button',
      { type: 'button', class: 'lt-btn', 'data-interp': kind, title, onclick: () => interp(kind) },
      [label],
    );
  const graphBtn = h(
    'button',
    {
      type: 'button',
      class: 'lt-btn lt-graph',
      title: 'Graph Editor (⇧F3): value curves with bezier handles',
      onclick: () => setMode(mode === 'graph' ? 'layers' : 'graph'),
    },
    ['📈 Graph'],
  );
  const velBtn = h(
    'button',
    {
      type: 'button',
      class: 'lt-btn',
      title: 'Keyframe Velocity… (⌘⇧K): exact speed and influence',
      onclick: () => selKeys.length && o.onVelocity?.([...selKeys]),
    },
    ['Velocity…'],
  );
  const delBtn = h(
    'button',
    { type: 'button', class: 'lt-btn', onclick: () => deleteSelectedKeys() },
    ['Delete'],
  );
  const navBtn = (
    /** @type {-1 | 1} */ dir,
    /** @type {string} */ label,
    /** @type {string} */ title,
  ) =>
    h(
      'button',
      { type: 'button', class: 'lt-btn lt-nav', title, onclick: () => o.onJumpKey?.(dir) },
      [label],
    );
  const keyBar = h('div', { class: 'lt-keybar' }, [
    navBtn(-1, '◀◆', 'Previous keyframe (J)'),
    navBtn(1, '◆▶', 'Next keyframe (K)'),
    graphBtn,
    keyInfo,
    interpBtn('linear', 'Linear', 'Linear in and out'),
    interpBtn('easy', 'Easy Ease', 'Easy Ease (F9): slow in and out'),
    interpBtn('easeIn', 'Ease In', 'Easy Ease In (⇧F9): slow into the key'),
    interpBtn('easeOut', 'Ease Out', 'Easy Ease Out (⌘⇧F9): slow out of the key'),
    interpBtn('toggleHold', 'Hold', 'Toggle Hold (⌘⌥H): keep the value until the next key'),
    velBtn,
    delBtn,
  ]);
  // Zoom (3.7d): − / slider / + / Fit, and a slider to scroll the zoomed view (pen-friendly).
  const zoomSlider = h('input', {
    type: 'range',
    class: 'lt-zoom',
    min: '0',
    max: '1000',
    step: '1',
    value: '0',
    title: 'Timeline zoom (− / = keys, ⌘ / Ctrl + scroll)',
  });
  const panSlider = h('input', {
    type: 'range',
    class: 'lt-pan',
    min: '0',
    max: '1000',
    step: '1',
    value: '0',
    title: 'Scroll the zoomed timeline (or scroll sideways / ⇧ + scroll)',
  });
  const zbtn = (
    /** @type {string} */ label,
    /** @type {string} */ title,
    /** @type {() => void} */ fn,
  ) => h('button', { type: 'button', class: 'lt-btn lt-zbtn', title, onclick: fn }, [label]);
  const zoomBar = h('div', { class: 'lt-zoombar' }, [
    h('span', { class: 'lt-zlabel' }, ['Zoom']),
    zbtn('−', 'Zoom out (−)', () => zoomBy(1 / 1.5)),
    zoomSlider,
    zbtn('+', 'Zoom in (=)', () => zoomBy(1.5)),
    zbtn('Fit', 'Show the whole comp (;)', () => setZoom(1)),
    panSlider,
  ]);
  keyBar.append(zoomBar);
  const body = h('div', { class: 'lt-body' }, [
    h('div', { class: 'lt-namecol' }, [h('div', { class: 'lt-rulerpad' }), names]),
    track,
  ]);
  container.replaceChildren(h('div', { class: 'lt' }, [keyBar, body]));

  /** Selected keys. @type {KeyRef[]} */
  let selKeys = [];
  /**
   * @type {null | { kind: 'scrub' } | { kind: 'impact', key: string }
   *   | { kind: 'bar', mode: 'slide'|'in'|'out'|'stretch', s0: number, times0: Record<string, any>, key: string }
   *   | { kind: 'keys', mode: 'move'|'scale', s0: number, refs0: KeyRef[], grabComp: number, anchor: number, key: string, collapse: KeyRef | null, graph?: { x0: number, y0: number, V: (y: number) => number } }
   *   | { kind: 'handle', ref: KeyRef, which: 'in'|'out', key: string, S: (x: number) => number, V: (y: number) => number, time: import('../../effects/layerAnimation.js').LayerTime }
   *   | { kind: 'box', add: KeyRef[] }}
   */
  let drag = null;
  let drags = 0;
  /** @type {'layers' | 'graph'} */
  let mode = 'layers';
  /** Curves hidden in the Graph Editor (layerId|paramId). @type {Set<string>} */
  const hiddenCurves = new Set();
  /** Value range frozen while dragging in the graph (so it doesn't jump). @type {{ min: number, max: number } | null} */
  let frozenRange = null;

  /** @param {'layers' | 'graph'} m */
  function setMode(m) {
    mode = m;
    graphBtn.classList.toggle('active', m === 'graph');
    container.classList.toggle('graph-mode', m === 'graph');
    draw();
  }

  /** Graph geometry for the current size. */
  function graphGeom() {
    const d = o.get();
    const w = Math.max(10, track.clientWidth);
    const end = compEnd();
    const all = graphCurves(d.layers, d.selection, d.paramLabel);
    const curves = all.filter((c) => !hiddenCurves.has(c.id));
    const range = frozenRange ?? graphRange(curves, end);
    const top = RULER_H;
    const bottom = RULER_H + GRAPH_H;
    const axis = valueAxis(range, top, bottom);
    /** @type {import('./graphView.js').GraphGeom} */
    const g = {
      w,
      top,
      bottom,
      X: tmap().X,
      S: tmap().S,
      Y: axis.y,
      V: axis.v,
    };
    return { g, all, curves, range, pts: graphPoints(g, curves, selKeys) };
  }
  /** @type {TimelineRow[]} */
  let rows = [];
  /** Box selection rectangle while dragging (canvas px). @type {{ x0: number, y0: number, x1: number, y1: number } | null} */
  let box = null;

  /**
   * Which lanes the selected layers show (3.7d): null = every animated parameter (default),
   * 'none' = collapsed (U), or a set of param ids revealed with P / S / R / T / A.
   * @type {null | 'none' | Set<string>}
   */
  let laneFilter = null;
  /** Timeline zoom (1 = whole comp) and the first second shown. */
  let zoom = 1;
  let viewStart = 0;
  /** The comp seconds shown. */
  const view = () => {
    const end = compEnd();
    const v = clampView({ start: viewStart, span: end / zoom }, end);
    viewStart = v.start;
    return v;
  };
  const maxZoom = () => Math.max(1, o.get().frameCount / 6);
  const playheadSeconds = () => {
    const d = o.get();
    return d.frame / d.fps;
  };
  /** @param {number} z @param {number} [pivot] comp seconds kept in place (default: playhead) */
  function setZoom(z, pivot) {
    const end = compEnd();
    const v = zoomView(
      view(),
      Math.min(maxZoom(), Math.max(1, z)),
      end,
      pivot ?? playheadSeconds(),
    );
    zoom = end / v.span;
    viewStart = v.start;
    draw();
  }
  /** @param {number} f @param {number} [pivot] */
  const zoomBy = (f, pivot) => setZoom(zoom * f, pivot);
  /** Scroll the view by comp seconds. @param {number} ds */
  function panBy(ds) {
    viewStart += ds;
    draw();
  }
  zoomSlider.addEventListener('input', () => {
    setZoom(maxZoom() ** (Number(zoomSlider.value) / 1000));
  });
  panSlider.addEventListener('input', () => {
    const v = view();
    viewStart = (Number(panSlider.value) / 1000) * Math.max(0, compEnd() - v.span);
    draw();
  });
  function syncZoomUI() {
    const mz = maxZoom();
    zoomSlider.value = String(mz > 1 ? Math.round((Math.log(zoom) / Math.log(mz)) * 1000) : 0);
    const v = view();
    const room = compEnd() - v.span;
    panSlider.disabled = room <= 1e-9;
    panSlider.value = String(room > 1e-9 ? Math.round((v.start / room) * 1000) : 0);
  }
  // ⌘ / Ctrl + scroll zooms around the pointer; sideways (or ⇧) scroll pans when zoomed.
  track.addEventListener(
    'wheel',
    (e) => {
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, tmap().S(e.clientX - r.left));
      } else if (zoom > 1 && Math.abs(dx) > 0) {
        e.preventDefault();
        panBy((dx / Math.max(1, track.clientWidth)) * view().span);
      }
    },
    { passive: false },
  );

  /** Time ↔ x for the current zoom and width. */
  const tmap = () => makeTimeMap(view(), Math.max(10, track.clientWidth));

  const compEnd = () => {
    const d = o.get();
    return d.frameCount / d.fps;
  };

  function layout() {
    const d = o.get();
    rows = [];
    if (mode === 'graph') return RULER_H + GRAPH_H;
    let y = RULER_H;
    for (const l of [...d.layers].reverse()) {
      rows.push({ kind: 'layer', layerId: l.id, label: l.label, y, h: ROW_H });
      y += ROW_H;
      if (d.selection.includes(l.id) && laneFilter !== 'none') {
        const pids =
          laneFilter === null
            ? Object.keys(l.keys ?? {}).filter((pid) => l.keys[pid]?.length)
            : [...laneFilter].filter(
                (pid) =>
                  pid.startsWith('transform.') ||
                  pid === 'layer.opacity' ||
                  !!l.keys?.[pid]?.length ||
                  !!l.masks?.some((m) => pid.startsWith(`mask.${m.id}.`)),
              );
        for (const pid of pids) {
          rows.push({
            kind: 'lane',
            layerId: l.id,
            paramId: pid,
            label: d.paramLabel(l.id, pid),
            y,
            h: LANE_H,
          });
          y += LANE_H;
        }
      }
    }
    return y;
  }

  /** Drop selected keys that no longer exist. */
  function pruneKeys() {
    const d = o.get();
    selKeys = selKeys.filter((r) =>
      d.layers.find((l) => l.id === r.layerId)?.keys?.[r.paramId]?.some((k) => same(k.t, r.t)),
    );
  }

  /** Every lane key with its screen position. */
  function laneKeys() {
    const d = o.get();
    const tm = tmap();
    const out = [];
    for (const r of rows) {
      if (r.kind !== 'lane') continue;
      const l = d.layers.find((x) => x.id === r.layerId);
      for (const k of l?.keys?.[/** @type {string} */ (r.paramId)] ?? []) {
        out.push({
          ref: { layerId: r.layerId, paramId: /** @type {string} */ (r.paramId), t: k.t },
          key: k,
          x: tm.X(compSeconds(l?.time, k.t)),
          y: r.y + r.h / 2,
        });
      }
    }
    return out;
  }

  function draw() {
    const d = o.get();
    pruneKeys();
    const height = layout() + 4;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(10, track.clientWidth);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    const end = compEnd();
    // Keep the playhead in view when it moves outside a zoomed view (J / K, arrows, playback).
    const v0 = view();
    const ph = playheadSeconds();
    if (zoom > 1 && !drag && (ph < v0.start || ph > v0.start + v0.span)) {
      viewStart = ph - v0.span * 0.1;
    }
    syncZoomUI();
    const { X } = tmap();

    // Ruler with frame ticks
    ctx.fillStyle = '#1b1c21';
    ctx.fillRect(0, 0, w, RULER_H);
    ctx.strokeStyle = '#3a3b44';
    ctx.fillStyle = '#7d7f8a';
    ctx.font = '10px system-ui, sans-serif';
    const every = Math.max(1, Math.ceil(d.frameCount / zoom / Math.max(1, w / 40)));
    for (let f = 0; f <= d.frameCount; f++) {
      const x = Math.round(X(f / d.fps)) + 0.5;
      const major = f % every === 0;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - (major ? 9 : 4));
      ctx.lineTo(x, RULER_H);
      ctx.stroke();
      if (major && f < d.frameCount) ctx.fillText(String(f), x + 2, 10);
    }
    // Impact marker
    if (d.impact !== null) {
      const x = X(d.impact);
      ctx.fillStyle = '#ff5a3d';
      ctx.beginPath();
      ctx.moveTo(x - 6, 2);
      ctx.lineTo(x + 6, 2);
      ctx.lineTo(x, 12);
      ctx.closePath();
      ctx.fill();
    }

    const byId = new Map(d.layers.map((l) => [l.id, l]));
    if (mode === 'graph') {
      const gg = graphGeom();
      names.replaceChildren(
        ...gg.all.map((c) => {
          const off = hiddenCurves.has(c.id);
          const el = h(
            'div',
            {
              class: `lt-name lane lt-curve${off ? ' off' : ''}`,
              title: `${c.label} — click to ${off ? 'show' : 'hide'}`,
            },
            [h('span', { class: 'lt-swatch', style: `background:${c.color}` }), c.label],
          );
          el.addEventListener('click', () => {
            if (off) hiddenCurves.delete(c.id);
            else hiddenCurves.add(c.id);
            draw();
          });
          return el;
        }),
      );
      drawGraph(ctx, gg.g, gg.curves, gg.pts, gg.range);
    } else {
      // Names
      names.replaceChildren(
        ...rows.map((r) => {
          const inSel = d.selection.includes(r.layerId) && r.kind === 'layer';
          const el = h(
            'div',
            {
              class: `lt-name ${r.kind}${inSel ? ' in-selection' : ''}${r.layerId === d.selected && r.kind === 'layer' ? ' selected' : ''}`,
              style: `height:${r.h}px`,
              title: r.label,
            },
            [r.label],
          );
          el.addEventListener('click', (e) =>
            o.onSelect(r.layerId, { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey }),
          );
          return el;
        }),
      );
      // Rows
      for (const r of rows) {
        const l = byId.get(r.layerId);
        if (!l) continue;
        const inSel = d.selection.includes(r.layerId);
        ctx.fillStyle = r.kind === 'layer' ? (inSel ? '#2a221c' : '#1f2026') : '#1a1b20';
        ctx.fillRect(0, r.y, w, r.h);
        ctx.fillStyle = '#121317';
        ctx.fillRect(0, r.y + r.h - 1, w, 1);
        if (r.kind === 'layer') {
          const x0 = X(l.time.in);
          const x1 = X(l.time.out ?? end);
          ctx.fillStyle = l.enabled ? (inSel ? '#c9692a' : '#5b6378') : '#3a3b44';
          ctx.fillRect(x0, r.y + 4, Math.max(2, x1 - x0), r.h - 8);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(x0, r.y + 4, 3, r.h - 8);
          ctx.fillRect(x1 - 3, r.y + 4, 3, r.h - 8);
          if (l.time.stretch !== 1) {
            ctx.fillStyle = '#e8e8ec';
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillText(`${Math.round(l.time.stretch * 100)}%`, x0 + 6, r.y + 15);
          }
          // all keys of the layer, small
          const ts = new Set();
          for (const keys of Object.values(l.keys ?? {}))
            for (const k of keys ?? []) ts.add(compSeconds(l.time, k.t));
          for (const t of ts) diamond(X(t), r.y + r.h / 2, 4, '#ffd166', false);
        }
      }
      for (const lk of laneKeys()) {
        const l = byId.get(lk.ref.layerId);
        const list = l?.keys?.[lk.ref.paramId] ?? [];
        const sides = keySides(list, list.indexOf(lk.key));
        keyIcon(lk.x, lk.y, 6, sides, inRefs(selKeys, lk.ref));
      }
    }
    // Box selection
    if (box) {
      ctx.fillStyle = 'rgba(255,138,61,0.12)';
      ctx.strokeStyle = '#ff8a3d';
      const bx = Math.min(box.x0, box.x1);
      const by = Math.min(box.y0, box.y1);
      ctx.fillRect(bx, by, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
      ctx.strokeRect(bx + 0.5, by + 0.5, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
    }
    // Playhead
    const px = Math.round(X(d.frame / d.fps)) + 0.5;
    ctx.strokeStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();

    // Key bar
    const n = selKeys.length;
    // Which interpolation all selected keys share (lights that button).
    const kinds = new Set(
      selKeys.map((r) => {
        const list = byId.get(r.layerId)?.keys?.[r.paramId] ?? [];
        const sd = keySides(
          list,
          list.findIndex((k) => same(k.t, r.t)),
        );
        if (sd.out === 'hold') return 'toggleHold';
        if (sd.in === 'linear' && sd.out === 'linear') return 'linear';
        if (sd.in === 'bezier' && sd.out === 'bezier') return 'easy';
        return sd.in === 'bezier' ? 'easeIn' : 'easeOut';
      }),
    );
    if (n === 1) {
      const r = selKeys[0];
      const f = Math.round(compSeconds(byId.get(r.layerId)?.time, r.t) * d.fps);
      keyInfo.textContent = `Key: ${byId.get(r.layerId)?.label} · ${d.paramLabel(r.layerId, r.paramId)} @ frame ${f}`;
    } else keyInfo.textContent = n ? `${n} keys selected` : 'No key selected';
    for (const b of keyBar.querySelectorAll('[data-interp]')) {
      /** @type {HTMLButtonElement} */ (b).disabled = !n;
      b.classList.toggle(
        'active',
        kinds.size === 1 &&
          kinds.has(/** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.interp)) &&
          n > 0,
      );
    }
    delBtn.disabled = !n;
    velBtn.disabled = !n;
  }

  /** @param {number} x @param {number} y @param {number} r @param {string} fill @param {boolean} sel */
  function diamond(x, y, r, fill, sel) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (sel) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  /**
   * After Effects key icon: each half shows that side's interpolation — linear = diamond half,
   * bezier = round half, hold = square half.
   * @param {number} x @param {number} y @param {number} r
   * @param {{ in: string | null, out: string | null }} sides @param {boolean} sel
   */
  function keyIcon(x, y, r, sides, sel) {
    const color = sides.out === 'hold' ? '#9ec5ff' : '#ffd166';
    ctx.beginPath();
    // left half (in), drawn top → bottom
    if (sides.in === 'bezier') ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, true);
    else if (sides.in === 'hold') {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x - r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.lineTo(x, y + r);
    } else {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x - r, y);
      ctx.lineTo(x, y + r);
    }
    // right half (out), bottom → top
    if (sides.out === 'bezier') ctx.arc(x, y, r, Math.PI / 2, -Math.PI / 2, true);
    else if (sides.out === 'hold') {
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x + r, y - r);
      ctx.lineTo(x, y - r);
    } else {
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y - r);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (sel) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  /** @param {import('../../effects/keyInterp.js').InterpKind} kind */
  function interp(kind) {
    if (selKeys.length) o.onKeysInterp([...selKeys], kind);
  }
  function deleteSelectedKeys() {
    if (!selKeys.length) return;
    o.onKeysDelete([...selKeys]);
    selKeys = [];
    draw();
  }

  /**
   * Pointer down in the Graph Editor area: handle, key (select / drag time + value), or box.
   * @param {PointerEvent} e @param {number} x @param {number} y @param {string} key
   */
  function graphDown(e, x, y, key) {
    const d = o.get();
    const gg = graphGeom();
    frozenRange = gg.range; // keep the scale steady while dragging
    const hit = graphHit(gg.pts, x, y);
    const meta = e.metaKey || e.ctrlKey;
    if (hit?.kind === 'handle') {
      const l = d.layers.find((q) => q.id === hit.ref.layerId);
      if (!l) return false;
      drag = {
        kind: 'handle',
        ref: hit.ref,
        which: hit.which,
        key,
        S: gg.g.S,
        V: gg.g.V,
        time: l.time,
      };
      return true;
    }
    if (hit?.kind === 'key') {
      const was = inRefs(selKeys, hit.ref);
      if (e.shiftKey || meta) {
        selKeys = was ? selKeys.filter((k) => !inRefs([hit.ref], k)) : [...selKeys, { ...hit.ref }];
        draw();
        return true;
      }
      if (!was) selKeys = [{ ...hit.ref }];
      const l = d.layers.find((q) => q.id === hit.ref.layerId);
      const grabComp = compSeconds(l?.time, hit.ref.t);
      drag = {
        kind: 'keys',
        mode: 'move',
        s0: gg.g.S(x),
        refs0: [...selKeys],
        grabComp,
        anchor: grabComp,
        key,
        collapse: was ? hit.ref : null,
        graph: { x0: x, y0: y, V: gg.g.V },
      };
      draw();
      return true;
    }
    drag = { kind: 'box', add: e.shiftKey || meta ? [...selKeys] : [] };
    box = { x0: x, y0: y, x1: x, y1: y };
    if (!drag.add.length) selKeys = [];
    draw();
    return true;
  }

  // ── Interaction ──
  const pos = (/** @type {PointerEvent} */ e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const scrubTo = (/** @type {number} */ x) => {
    const d = o.get();
    const f = Math.round(tmap().S(x) * d.fps);
    o.onScrub(Math.min(d.frameCount - 1, Math.max(0, f)));
  };

  attachPointer(canvas, {
    down(e) {
      const [x, y] = pos(e);
      const d = o.get();
      const end = compEnd();
      const { X } = tmap();
      const key = `lt:${++drags}`;
      const meta = e.metaKey || e.ctrlKey;
      if (y < RULER_H) {
        if (d.impact !== null && Math.abs(x - X(d.impact)) <= 9 && o.onImpact)
          drag = { kind: 'impact', key };
        else {
          drag = { kind: 'scrub' };
          scrubTo(x);
        }
        return true;
      }
      if (mode === 'graph') return graphDown(e, x, y, key);
      const r = rows.find((row) => y >= row.y && y < row.y + row.h);
      if (!r) return false;
      const l = d.layers.find((x2) => x2.id === r.layerId);
      if (!l) return false;
      if (r.kind === 'lane') {
        const hit = laneKeys().find(
          (lk) =>
            lk.ref.layerId === r.layerId &&
            lk.ref.paramId === r.paramId &&
            Math.abs(lk.x - x) <= KEY_HIT,
        );
        if (hit) {
          const was = inRefs(selKeys, hit.ref);
          if (e.shiftKey || meta) {
            selKeys = was
              ? selKeys.filter(
                  (k) =>
                    !(
                      k.layerId === hit.ref.layerId &&
                      k.paramId === hit.ref.paramId &&
                      same(k.t, hit.ref.t)
                    ),
                )
              : [...selKeys, hit.ref];
            draw();
            return true;
          }
          if (!was) selKeys = [hit.ref];
          // ⌥ on the first / last selected key scales the group's timing around the other end.
          const comps = selKeys.map((k) => {
            const kl = d.layers.find((q) => q.id === k.layerId);
            return compSeconds(kl?.time, k.t);
          });
          const grabComp = compSeconds(l.time, hit.ref.t);
          const first = Math.min(...comps);
          const last = Math.max(...comps);
          const scale =
            e.altKey && selKeys.length > 1 && (same(grabComp, first) || same(grabComp, last));
          drag = {
            kind: 'keys',
            mode: scale ? 'scale' : 'move',
            s0: tmap().S(x),
            refs0: [...selKeys],
            grabComp,
            anchor: same(grabComp, first) ? last : first,
            key,
            collapse: was && !scale ? hit.ref : null,
          };
          draw();
          return true;
        }
        // empty lane space: box select (⇧ / ⌘ adds to the selection)
        drag = { kind: 'box', add: e.shiftKey || meta ? [...selKeys] : [] };
        box = { x0: x, y0: y, x1: x, y1: y };
        if (!drag.add.length) selKeys = [];
        draw();
        return true;
      }
      // layer row: select (with modifiers) and maybe drag the bar(s)
      if (meta || e.shiftKey) {
        o.onSelect(l.id, { meta, shift: e.shiftKey });
        return false;
      }
      if (!d.selection.includes(l.id)) o.onSelect(l.id, {});
      const x0 = X(l.time.in);
      const x1 = X(l.time.out ?? end);
      let barMode = /** @type {'slide'|'in'|'out'|'stretch' | null} */ (null);
      if (Math.abs(x - x0) <= EDGE) barMode = 'in';
      else if (Math.abs(x - x1) <= EDGE) barMode = e.altKey ? 'stretch' : 'out';
      else if (x > x0 && x < x1) barMode = 'slide';
      if (!barMode) return false;
      const sel = o.get().selection;
      const ids = sel.includes(l.id) ? sel : [l.id];
      /** @type {Record<string, any>} */
      const times0 = {};
      for (const id of ids) {
        const t = o.get().layers.find((q) => q.id === id)?.time;
        if (t) times0[id] = { ...t };
      }
      drag = { kind: 'bar', mode: barMode, s0: tmap().S(x), times0, key };
      return true;
    },
    move(e) {
      if (!drag) return;
      const [x, y] = pos(e);
      const d = o.get();
      const end = compEnd();
      const s = tmap().S(x);
      if (drag.kind === 'scrub') scrubTo(x);
      else if (drag.kind === 'impact')
        o.onImpact?.(Math.min(end, Math.max(0, snapToFrame(s, d.fps))), drag.key);
      else if (drag.kind === 'bar') {
        const ds = snapToFrame(s - drag.s0, d.fps);
        /** @type {Record<string, any>} */
        const times = {};
        for (const [id, t0] of Object.entries(drag.times0)) {
          times[id] = dragBar(t0, drag.mode, ds, end, d.fps);
        }
        o.onLayerTimes(times, drag.key);
      } else if (drag.kind === 'handle') {
        const t = layerSeconds(drag.time, drag.S(x));
        o.onGraphHandle?.(drag.ref, drag.which, t, drag.V(y), e.altKey, drag.key);
        draw();
      } else if (drag.kind === 'keys') {
        drag.collapse = null; // it moved: keep the group
        if (drag.mode === 'move') {
          let dComp = snapToFrame(s - drag.s0, d.fps);
          let dValue = 0;
          const gr = drag.graph;
          if (gr) {
            dValue = gr.V(y) - gr.V(gr.y0);
            // ⇧ = one axis only (whichever moved more)
            if (e.shiftKey) {
              if (Math.abs(x - gr.x0) >= Math.abs(y - gr.y0)) dValue = 0;
              else dComp = 0;
            }
          }
          selKeys = o.onKeysRetime(
            { kind: 'move', refs: drag.refs0, dComp, ...(gr ? { dValue } : {}) },
            drag.key,
          );
        } else {
          const target = snapToFrame(drag.grabComp + (s - drag.s0), d.fps);
          const span = drag.grabComp - drag.anchor;
          const k = Math.abs(span) > 1e-9 ? (target - drag.anchor) / span : 1;
          selKeys = o.onKeysRetime(
            { kind: 'scale', refs: drag.refs0, anchor: drag.anchor, k: Math.max(0, k) },
            drag.key,
          );
        }
      } else if (drag.kind === 'box' && box) {
        box.x1 = x;
        box.y1 = y;
        const x0 = Math.min(box.x0, box.x1);
        const x1b = Math.max(box.x0, box.x1);
        const y0 = Math.min(box.y0, box.y1);
        const y1b = Math.max(box.y0, box.y1);
        const pts = mode === 'graph' ? graphGeom().pts : laneKeys();
        const inside = pts
          .filter((lk) => lk.x >= x0 - 3 && lk.x <= x1b + 3 && lk.y >= y0 && lk.y <= y1b)
          .map((lk) => lk.ref);
        selKeys = [
          ...drag.add,
          ...inside.filter((k) => !inRefs(drag?.kind === 'box' ? drag.add : [], k)),
        ];
        draw();
      }
    },
    up() {
      // A plain click on a key that was already part of a group selects just that key.
      if (drag?.kind === 'keys' && drag.collapse) selKeys = [drag.collapse];
      drag = null;
      box = null;
      frozenRange = null;
      draw();
    },
  });

  if (o.keyboard !== false)
    document.addEventListener('keydown', (e) => {
      const typing = /** @type {HTMLElement} */ (e.target)?.closest?.('input, select, textarea');
      if (typing) return;
      if (selKeys.length && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteSelectedKeys();
      } else if (selKeys.length && e.key === 'Escape') {
        selKeys = [];
        draw();
      }
    });

  const resize = new ResizeObserver(() => draw());
  resize.observe(track);

  return {
    update: () => draw(),
    /** Delete the selected keys (⌫). Returns false when none are selected. */
    deleteSelectedKeys() {
      if (!selKeys.length) return false;
      deleteSelectedKeys();
      return true;
    },
    /**
     * Reveal lanes like After Effects' P / S / R / T / A: only these params (even without keys).
     * @param {string[]} ids @param {boolean} [add] with shift: add to what is shown
     */
    revealLanes(ids, add = false) {
      const base = add && laneFilter instanceof Set ? laneFilter : new Set();
      laneFilter = new Set([...base, ...ids]);
      if (mode === 'graph') setMode('layers');
      else draw();
    },
    /** U: animated lanes ↔ collapsed. */
    toggleLanes() {
      laneFilter = laneFilter === null ? 'none' : null;
      draw();
    },
    /** Zoom: factor (> 1 = in), 'fit', or an exact level. @param {number | 'fit'} f */
    zoom(f) {
      if (f === 'fit') setZoom(1);
      else zoomBy(f);
    },
    /** ; — toggle between the whole comp and frame-level zoom around the playhead. */
    toggleZoom() {
      setZoom(zoom > 1 ? 1 : maxZoom());
    },
    /** Show the Graph Editor ('graph') or the layer bars ('layers'). @param {'layers'|'graph'} m */
    setMode: (m) => setMode(m),
    mode: () => mode,
    /** Selected keys (copy / paste, tests). */
    selectedKeys: () => selKeys.map((k) => ({ ...k })),
    /** Replace the key selection (after paste, select all…). @param {KeyRef[]} refs */
    selectKeys(refs) {
      selKeys = refs.map((k) => ({ ...k }));
      draw();
    },
  };
}
