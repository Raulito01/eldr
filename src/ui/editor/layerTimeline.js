// @ts-check
/**
 * Layer timeline (3.6c, D-054): After Effects–style rows under the viewport.
 *
 * - Ruler: click / drag to scrub; the IMPACT marker (▼) can be dragged.
 * - One row per layer (top of the stack first) with its bar: drag the middle to SLIDE, an end
 *   to TRIM in / out, ⌥ + right end to STRETCH time. Keys of the layer show as small diamonds.
 * - The selected layer opens one lane per animated parameter: drag a key to move it (snaps to
 *   frames), click to select it, then Linear / Ease / Hold / Delete in the key bar (or ⌫).
 *
 * Pen-friendly (D-028): edge grips 8 px, diamonds 14 px hit size, everything also reachable by
 * click + buttons. The drawing is a canvas; labels are DOM.
 */

import { compSeconds, layerSeconds } from '../../effects/layerAnimation.js';
import { h } from '../dom.js';
import { attachPointer } from '../pointer.js';

export const RULER_H = 22;
export const ROW_H = 24;
export const LANE_H = 20;
/** Pixels of the bar ends that trim instead of slide. */
export const EDGE = 8;
/** Hit radius of a key diamond. */
export const KEY_HIT = 8;

/** Comp seconds → x. @param {number} s @param {number} end comp length (s) @param {number} w */
export const secondsToX = (s, end, w) => (end > 0 ? (s / end) * w : 0);
/** x → comp seconds. @param {number} x @param {number} end @param {number} w */
export const xToSeconds = (x, end, w) => (w > 0 ? (x / w) * end : 0);
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

/**
 * @typedef {object} LayerTimelineOptions
 * @property {() => { layers: import('../../effects/explosion/explosion.js').EditorLayer[], selected: string,
 *   frame: number, fps: number, frameCount: number, impact: number | null, paramLabel: (layerId: string, paramId: string) => string }} get
 * @property {(frame: number) => void} onScrub
 * @property {(layerId: string) => void} onSelect
 * @property {(layerId: string, time: import('../../effects/layerAnimation.js').LayerTime, key: string) => void} onLayerTime
 * @property {(layerId: string, paramId: string, from: number, to: number, key: string) => void} onMoveKey  layer seconds
 * @property {(layerId: string, paramId: string, t: number, ease: string) => void} onEase
 * @property {(layerId: string, paramId: string, t: number) => void} onDeleteKey
 * @property {(seconds: number, key: string) => void} [onImpact]
 */

/**
 * @param {HTMLElement} container @param {LayerTimelineOptions} o
 */
export function createLayerTimeline(container, o) {
  const names = h('div', { class: 'lt-names' });
  const canvas = h('canvas', { class: 'lt-canvas' });
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const track = h('div', { class: 'lt-track' }, [canvas]);
  const keyInfo = h('span', { class: 'lt-keyinfo' }, ['No key selected']);
  const easeBtn = (/** @type {string} */ ease, /** @type {string} */ label) =>
    h(
      'button',
      { type: 'button', class: 'lt-btn', 'data-ease': ease, onclick: () => setEase(ease) },
      [label],
    );
  const delBtn = h(
    'button',
    { type: 'button', class: 'lt-btn', onclick: () => deleteSelectedKey() },
    ['Delete key'],
  );
  const keyBar = h('div', { class: 'lt-keybar' }, [
    keyInfo,
    easeBtn('linear', 'Linear'),
    easeBtn('ease', 'Ease'),
    easeBtn('hold', 'Hold'),
    delBtn,
  ]);
  const body = h('div', { class: 'lt-body' }, [
    h('div', { class: 'lt-namecol' }, [h('div', { class: 'lt-rulerpad' }), names]),
    track,
  ]);
  container.replaceChildren(h('div', { class: 'lt' }, [keyBar, body]));

  /** @type {{ layerId: string, paramId: string, t: number } | null} */
  let selKey = null;
  /** @type {TimelineRow[]} */
  let rows = [];

  const compEnd = () => {
    const d = o.get();
    return d.frameCount / d.fps;
  };

  function layout() {
    const d = o.get();
    rows = [];
    let y = RULER_H;
    for (const l of [...d.layers].reverse()) {
      rows.push({ kind: 'layer', layerId: l.id, label: l.label, y, h: ROW_H });
      y += ROW_H;
      if (l.id === d.selected) {
        for (const [pid, keys] of Object.entries(l.keys ?? {})) {
          if (!keys?.length) continue;
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

  function draw() {
    const d = o.get();
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
    const X = (/** @type {number} */ s) => secondsToX(s, end, w);

    // Ruler with frame ticks
    ctx.fillStyle = '#1b1c21';
    ctx.fillRect(0, 0, w, RULER_H);
    ctx.strokeStyle = '#3a3b44';
    ctx.fillStyle = '#7d7f8a';
    ctx.font = '10px system-ui, sans-serif';
    const every = Math.max(1, Math.ceil(d.frameCount / Math.max(1, w / 40)));
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

    // Rows
    const byId = new Map(d.layers.map((l) => [l.id, l]));
    names.replaceChildren(
      ...rows.map((r) => {
        const el = h(
          'div',
          {
            class: `lt-name ${r.kind}${r.layerId === d.selected && r.kind === 'layer' ? ' selected' : ''}`,
            style: `height:${r.h}px`,
            title: r.label,
            onclick: () => o.onSelect(r.layerId),
          },
          [r.label],
        );
        return el;
      }),
    );
    for (const r of rows) {
      const l = byId.get(r.layerId);
      if (!l) continue;
      ctx.fillStyle =
        r.kind === 'layer' ? (r.layerId === d.selected ? '#2a221c' : '#1f2026') : '#1a1b20';
      ctx.fillRect(0, r.y, w, r.h);
      ctx.fillStyle = '#121317';
      ctx.fillRect(0, r.y + r.h - 1, w, 1);
      if (r.kind === 'layer') {
        const x0 = X(l.time.in);
        const x1 = X(l.time.out ?? end);
        ctx.fillStyle = l.enabled ? (r.layerId === d.selected ? '#c9692a' : '#5b6378') : '#3a3b44';
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
      } else {
        for (const k of l.keys?.[/** @type {string} */ (r.paramId)] ?? []) {
          const sel =
            !!selKey &&
            selKey.layerId === r.layerId &&
            selKey.paramId === r.paramId &&
            Math.abs(selKey.t - k.t) < 1e-6;
          diamond(
            X(compSeconds(l.time, k.t)),
            r.y + r.h / 2,
            6,
            k.ease === 'hold' ? '#9ec5ff' : '#ffd166',
            sel,
          );
        }
      }
    }
    // Playhead
    const px = Math.round(X(d.frame / d.fps)) + 0.5;
    ctx.strokeStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();

    // Key bar
    const k = selectedKey();
    keyInfo.textContent = k
      ? `Key: ${d.paramLabel(selKey?.layerId ?? '', selKey?.paramId ?? '')} @ frame ${Math.round(compSeconds(byId.get(selKey?.layerId ?? '')?.time, k.t) * d.fps)}`
      : 'No key selected';
    for (const b of keyBar.querySelectorAll('[data-ease]')) {
      /** @type {HTMLButtonElement} */ (b).disabled = !k;
      b.classList.toggle('active', !!k && k.ease === /** @type {HTMLElement} */ (b).dataset.ease);
    }
    delBtn.disabled = !k;
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

  function selectedKey() {
    if (!selKey) return null;
    const s = selKey;
    const l = o.get().layers.find((x) => x.id === s.layerId);
    return l?.keys?.[s.paramId]?.find((k) => Math.abs(k.t - s.t) < 1e-6) ?? null;
  }
  /** @param {string} ease */
  function setEase(ease) {
    if (selKey && selectedKey()) o.onEase(selKey.layerId, selKey.paramId, selKey.t, ease);
  }
  function deleteSelectedKey() {
    if (!selKey || !selectedKey()) return;
    o.onDeleteKey(selKey.layerId, selKey.paramId, selKey.t);
    selKey = null;
  }

  // ── Interaction ──
  /** @type {null | { kind: 'scrub' } | { kind: 'impact', key: string } | { kind: 'bar', layerId: string, mode: 'slide'|'in'|'out'|'stretch', s0: number, time0: any, key: string } | { kind: 'key', layerId: string, paramId: string, t0: number, s0: number, cur: number, key: string }} */
  let drag = null;
  let drags = 0;
  const pos = (/** @type {PointerEvent} */ e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const scrubTo = (/** @type {number} */ x) => {
    const d = o.get();
    const f = Math.floor(xToSeconds(x, compEnd(), track.clientWidth) * d.fps);
    o.onScrub(Math.min(d.frameCount - 1, Math.max(0, f)));
  };

  attachPointer(canvas, {
    down(e) {
      const [x, y] = pos(e);
      const d = o.get();
      const w = track.clientWidth;
      const end = compEnd();
      const X = (/** @type {number} */ s) => secondsToX(s, end, w);
      const key = `lt:${++drags}`;
      if (y < RULER_H) {
        if (d.impact !== null && Math.abs(x - X(d.impact)) <= 9 && o.onImpact)
          drag = { kind: 'impact', key };
        else {
          drag = { kind: 'scrub' };
          scrubTo(x);
        }
        return true;
      }
      const r = rows.find((row) => y >= row.y && y < row.y + row.h);
      if (!r) return false;
      const l = d.layers.find((x2) => x2.id === r.layerId);
      if (!l) return false;
      if (r.kind === 'lane') {
        const keys = l.keys?.[/** @type {string} */ (r.paramId)] ?? [];
        const hit = keys.find((k) => Math.abs(X(compSeconds(l.time, k.t)) - x) <= KEY_HIT);
        if (hit) {
          selKey = { layerId: l.id, paramId: /** @type {string} */ (r.paramId), t: hit.t };
          drag = {
            kind: 'key',
            layerId: l.id,
            paramId: /** @type {string} */ (r.paramId),
            t0: hit.t,
            s0: xToSeconds(x, end, w),
            cur: hit.t,
            key,
          };
          draw();
          return true;
        }
        selKey = null;
        draw();
        return false;
      }
      if (l.id !== d.selected) o.onSelect(l.id);
      const x0 = X(l.time.in);
      const x1 = X(l.time.out ?? end);
      let mode = /** @type {'slide'|'in'|'out'|'stretch' | null} */ (null);
      if (Math.abs(x - x0) <= EDGE) mode = 'in';
      else if (Math.abs(x - x1) <= EDGE) mode = e.altKey ? 'stretch' : 'out';
      else if (x > x0 && x < x1) mode = 'slide';
      if (!mode) return false;
      drag = {
        kind: 'bar',
        layerId: l.id,
        mode,
        s0: xToSeconds(x, end, w),
        time0: { ...l.time },
        key,
      };
      return true;
    },
    move(e) {
      if (!drag) return;
      const [x] = pos(e);
      const d = o.get();
      const end = compEnd();
      const s = xToSeconds(x, end, track.clientWidth);
      if (drag.kind === 'scrub') scrubTo(x);
      else if (drag.kind === 'impact')
        o.onImpact?.(Math.min(end, Math.max(0, snapToFrame(s, d.fps))), drag.key);
      else if (drag.kind === 'bar') {
        const ds = snapToFrame(s - drag.s0, d.fps);
        o.onLayerTime(drag.layerId, dragBar(drag.time0, drag.mode, ds, end, d.fps), drag.key);
      } else if (drag.kind === 'key') {
        const l = d.layers.find((x2) => x2.id === drag?.layerId);
        if (!l) return;
        // target comp time snapped to frames, then back to layer time
        const startComp = compSeconds(l.time, drag.t0);
        const comp = snapToFrame(startComp + (s - drag.s0), d.fps);
        const to = layerSeconds(l.time, comp);
        if (Math.abs(to - drag.cur) < 1e-6) return;
        o.onMoveKey(drag.layerId, drag.paramId, drag.cur, to, drag.key);
        drag.cur = to;
        selKey = { layerId: drag.layerId, paramId: drag.paramId, t: to };
      }
    },
    up() {
      drag = null;
      draw();
    },
  });

  document.addEventListener('keydown', (e) => {
    const typing = /** @type {HTMLElement} */ (e.target)?.closest?.('input, select, textarea');
    if (!typing && selKey && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      deleteSelectedKey();
    }
  });

  const resize = new ResizeObserver(() => draw());
  resize.observe(track);

  return {
    update: () => draw(),
    /** The selected key (for tests / the editor). */
    selectedKey: () => (selKey ? { ...selKey } : null),
  };
}
