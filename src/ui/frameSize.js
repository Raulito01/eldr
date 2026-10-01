// @ts-check
/**
 * Frame size menu (3.5b [Raul]: up to 2K): square sizes, common wide sizes and a custom size.
 * The frame is the render canvas = the exported cell before export scale and trim.
 */

import { h } from './dom.js';

/** Largest side a frame may have. */
export const MAX_FRAME = 4096;

export const FRAME_SIZES = Object.freeze([
  { w: 256, h: 256 },
  { w: 384, h: 384 },
  { w: 512, h: 512 },
  { w: 768, h: 768 },
  { w: 1024, h: 1024 },
  { w: 1536, h: 1536 },
  { w: 2048, h: 2048 },
  { w: 1280, h: 720, label: '1280 × 720 (HD)' },
  { w: 1920, h: 1080, label: '1920 × 1080 (Full HD)' },
  { w: 2048, h: 1080, label: '2048 × 1080 (2K DCI)' },
]);

/**
 * "W×H", "W x H" or "N" (square) → size, clamped to 16 … MAX_FRAME; null when unreadable.
 * @param {string} text @returns {{ w: number, h: number } | null}
 */
export function parseFrameSize(text) {
  const m = /^\s*(\d+)\s*(?:[x×*]\s*(\d+))?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const clamp = (/** @type {number} */ v) => Math.min(MAX_FRAME, Math.max(16, Math.round(v)));
  const w = clamp(Number(m[1]));
  return { w, h: m[2] ? clamp(Number(m[2])) : w };
}

const key = (/** @type {{w: number, h: number}} */ s) => `${s.w}x${s.h}`;

/**
 * Fill a <select> with the sizes and handle "Custom…".
 * @param {HTMLSelectElement} select
 * @param {{ w: number, h: number }} initial
 * @param {(size: { w: number, h: number }) => void} onChange
 */
export function bindFrameSize(select, initial, onChange) {
  let current = initial;
  const fill = () => {
    const known = FRAME_SIZES.some((s) => key(s) === key(current));
    select.replaceChildren(
      ...FRAME_SIZES.map((s) => h('option', { value: key(s) }, [s.label ?? `${s.w} × ${s.h}`])),
      ...(known ? [] : [h('option', { value: key(current) }, [`${current.w} × ${current.h}`])]),
      h('option', { value: 'custom' }, ['Custom…']),
    );
    select.value = key(current);
  };
  fill();
  select.addEventListener('change', () => {
    let next = select.value === 'custom' ? null : parseFrameSize(select.value);
    if (select.value === 'custom') {
      next = parseFrameSize(
        prompt('Frame size (width × height, e.g. 1600x900):', `${current.w}x${current.h}`) ?? '',
      );
    }
    if (next) {
      current = next;
      onChange(next);
    }
    fill();
  });
}
