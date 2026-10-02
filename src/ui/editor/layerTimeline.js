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
 * Pen-friendly (D-028): edge grips 8 px, diamonds 14 px hit size, everything also reachable by
 * click + buttons. The drawing is a canvas; labels are DOM.
 */

import { compSeconds } from '../../effects/layerAnimation.js';
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

/** @typedef {import('../../effects/keyEdit.js').KeyRef} KeyRef */

/**
 * @typedef {object} LayerTimelineOptions
 * @property {() => { layers: import('../../effects/explosion/explosion.js').EditorLayer[], selected: string,
 *   selection: string[], frame: number, fps: number, frameCount: number, impact: number | null,
 *   paramLabel: (layerId: string, paramId: string) => string }} get
 * @property {(frame: number) => void} onScrub
 * @property {(layerId: string, mods: { meta?: boolean, shift?: boolean }) => void} onSelect
 * @property {(times: Record<string, import('../../effects/layerAnimation.js').LayerTime>, key: string) => void} onLayerTimes
 * @property {(op: { kind: 'move', refs: KeyRef[], dComp: number } | { kind: 'scale', refs: KeyRef[], anchor: number, k: number }, key: string) => KeyRef[]} onKeysRetime
 *   refs = keys at the START of the drag; returns the keys' new refs
 * @property {(refs: KeyRef[], patch: Record<string, any>) => void} onKeysPatch
 * @property {(refs: KeyRef[]) => void} onKeysDelete
 * @property {(seconds: number, key: string) => void} [onImpact]
 * @property {(dir: -1 | 1) => void} [onJumpKey]  previous / next keyframe (3.7)
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
  const easeBtn = (/** @type {string} */ ease, /** @type {string} */ label) =>
    h(
      'button',
      { type: 'button', class: 'lt-btn', 'data-ease': ease, onclick: () => setEase(ease) },
      [label],
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

  /** Selected keys. @type {KeyRef[]} */
  let selKeys = [];
  /** @type {TimelineRow[]} */
  let rows = [];
  /** Box selection rectangle while dragging (canvas px). @type {{ x0: number, y0: number, x1: number, y1: number } | null} */
  let box = null;

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
      if (d.selection.includes(l.id)) {
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
    const w = track.clientWidth;
    const end = compEnd();
    const out = [];
    for (const r of rows) {
      if (r.kind !== 'lane') continue;
      const l = d.layers.find((x) => x.id === r.layerId);
      for (const k of l?.keys?.[/** @type {string} */ (r.paramId)] ?? []) {
        out.push({
          ref: { layerId: r.layerId, paramId: /** @type {string} */ (r.paramId), t: k.t },
          key: k,
          x: secondsToX(compSeconds(l?.time, k.t), end, w),
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

    // Names
    const byId = new Map(d.layers.map((l) => [l.id, l]));
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
      diamond(
        lk.x,
        lk.y,
        6,
        lk.key.ease === 'hold' ? '#9ec5ff' : '#ffd166',
        inRefs(selKeys, lk.ref),
      );
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
    const eases = new Set(
      selKeys.map(
        (r) => byId.get(r.layerId)?.keys?.[r.paramId]?.find((k) => same(k.t, r.t))?.ease ?? 'ease',
      ),
    );
    if (n === 1) {
      const r = selKeys[0];
      const f = Math.round(compSeconds(byId.get(r.layerId)?.time, r.t) * d.fps);
      keyInfo.textContent = `Key: ${byId.get(r.layerId)?.label} · ${d.paramLabel(r.layerId, r.paramId)} @ frame ${f}`;
    } else keyInfo.textContent = n ? `${n} keys selected` : 'No key selected';
    for (const b of keyBar.querySelectorAll('[data-ease]')) {
      /** @type {HTMLButtonElement} */ (b).disabled = !n;
      b.classList.toggle(
        'active',
        eases.size === 1 &&
          eases.has(/** @type {any} */ (/** @type {HTMLElement} */ (b).dataset.ease)) &&
          n > 0,
      );
    }
    delBtn.disabled = !n;
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

  /** @param {string} ease */
  function setEase(ease) {
    if (selKeys.length) o.onKeysPatch([...selKeys], { ease });
  }
  function deleteSelectedKeys() {
    if (!selKeys.length) return;
    o.onKeysDelete([...selKeys]);
    selKeys = [];
    draw();
  }

  // ── Interaction ──
  /**
   * @type {null | { kind: 'scrub' } | { kind: 'impact', key: string }
   *   | { kind: 'bar', mode: 'slide'|'in'|'out'|'stretch', s0: number, times0: Record<string, any>, key: string }
   *   | { kind: 'keys', mode: 'move'|'scale', s0: number, refs0: KeyRef[], grabComp: number, anchor: number, key: string, collapse: KeyRef | null }
   *   | { kind: 'box', add: KeyRef[] }}
   */
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
            s0: xToSeconds(x, end, w),
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
      let mode = /** @type {'slide'|'in'|'out'|'stretch' | null} */ (null);
      if (Math.abs(x - x0) <= EDGE) mode = 'in';
      else if (Math.abs(x - x1) <= EDGE) mode = e.altKey ? 'stretch' : 'out';
      else if (x > x0 && x < x1) mode = 'slide';
      if (!mode) return false;
      const sel = o.get().selection;
      const ids = sel.includes(l.id) ? sel : [l.id];
      /** @type {Record<string, any>} */
      const times0 = {};
      for (const id of ids) {
        const t = o.get().layers.find((q) => q.id === id)?.time;
        if (t) times0[id] = { ...t };
      }
      drag = { kind: 'bar', mode, s0: xToSeconds(x, end, w), times0, key };
      return true;
    },
    move(e) {
      if (!drag) return;
      const [x, y] = pos(e);
      const d = o.get();
      const end = compEnd();
      const s = xToSeconds(x, end, track.clientWidth);
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
      } else if (drag.kind === 'keys') {
        drag.collapse = null; // it moved: keep the group
        if (drag.mode === 'move') {
          const dComp = snapToFrame(s - drag.s0, d.fps);
          selKeys = o.onKeysRetime({ kind: 'move', refs: drag.refs0, dComp }, drag.key);
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
        const inside = laneKeys()
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
      draw();
    },
  });

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
    /** Selected keys (copy / paste, tests). */
    selectedKeys: () => selKeys.map((k) => ({ ...k })),
    /** Replace the key selection (after paste, select all…). @param {KeyRef[]} refs */
    selectKeys(refs) {
      selKeys = refs.map((k) => ({ ...k }));
      draw();
    },
  };
}
