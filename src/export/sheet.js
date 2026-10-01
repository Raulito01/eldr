// @ts-check
/**
 * Sprite sheet (brief §5): unique drawings packed in a grid + a JSON frame list.
 *
 * JSON follows the widely read "JSON Hash" layout (TexturePacker / Aseprite / Phaser / Pixi):
 *   { frames: { "<name>_000": { frame: {x,y,w,h}, rotated, trimmed, spriteSourceSize,
 *     sourceSize, duration }, … }, meta: { app, version, image, format, size, scale, … } }
 * Every PLAYBACK frame gets an entry (engines that ignore `duration` still play the right
 * timing); frames inside one hold point at the same cell, so the image stores each drawing once.
 */

import { APP_NAME, APP_VERSION } from '../version.js';

/**
 * @typedef {object} SheetOptions
 * @property {number} [columns]   cells per row (default: as square as possible)
 * @property {number} [spacing=0] empty px between cells (helps engines that filter textures)
 * @property {string} [name='effect']  frame-name prefix and image file stem
 * @property {number} [scale=1]   export scale, recorded in meta
 * @property {string|null} [background=null]
 */

/**
 * @param {import('./frames.js').RenderedSequence & { rect: import('./frames.js').Rect, sourceSize: {w: number, h: number} }} seq
 *   a prepared sequence (trimmed / flattened)
 * @param {SheetOptions} [o]
 * @returns {{ image: import('./frames.js').Pixels, json: Record<string, any>, columns: number, rows: number }}
 */
export function packSheet(seq, o = {}) {
  const count = seq.drawings.length;
  const columns = Math.max(1, Math.min(count, o.columns ?? Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / columns);
  const space = o.spacing ?? 0;
  const cw = seq.drawings[0].width;
  const ch = seq.drawings[0].height;
  const width = columns * cw + (columns - 1) * space;
  const height = rows * ch + (rows - 1) * space;
  const data = new Uint8ClampedArray(width * height * 4);
  const cells = seq.drawings.map((d, i) => {
    const x = (i % columns) * (cw + space);
    const y = Math.floor(i / columns) * (ch + space);
    for (let row = 0; row < ch; row++) {
      data.set(d.data.subarray(row * cw * 4, (row + 1) * cw * 4), ((y + row) * width + x) * 4);
    }
    return { x, y, w: cw, h: ch };
  });

  const name = o.name ?? 'effect';
  const ms = 1000 / seq.fps;
  const trimmed = seq.rect.w !== seq.sourceSize.w || seq.rect.h !== seq.sourceSize.h;
  /** @type {Record<string, any>} */
  const frames = {};
  seq.frames.forEach((drawing, i) => {
    frames[`${name}_${String(i).padStart(3, '0')}`] = {
      frame: cells[drawing],
      rotated: false,
      trimmed,
      spriteSourceSize: { x: seq.rect.x, y: seq.rect.y, w: seq.rect.w, h: seq.rect.h },
      sourceSize: { ...seq.sourceSize },
      duration: Math.round(ms * 1000) / 1000,
    };
  });
  return {
    image: { width, height, data },
    columns,
    rows,
    json: {
      frames,
      meta: {
        app: APP_NAME,
        version: APP_VERSION,
        image: `${name}.png`,
        format: 'RGBA8888',
        size: { w: width, h: height },
        scale: String(o.scale ?? 1),
        fps: seq.fps,
        loop: seq.loop,
        frameCount: seq.frames.length,
        drawings: count,
        background: o.background ?? null,
      },
    },
  };
}
