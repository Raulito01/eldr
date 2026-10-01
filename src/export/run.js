// @ts-check
/**
 * One export = render once, then build every requested file from the same frames.
 * Pure apart from rendering: returns file contents; saving/downloading is the caller's job
 * (browser: export panel; Node: tests and scripts).
 */

import { prepareSequence, renderSequence } from './frames.js';
import { encodeGif } from './gif.js';
import { packSheet } from './sheet.js';

/**
 * @typedef {object} ExportOptions
 * @property {boolean} [gif=true]
 * @property {boolean} [sheet=true]
 * @property {number} [exportScale=1]   1 = frame size, 2 = double
 * @property {string|null} [background=null]  null = transparent
 * @property {boolean} [trim=true]
 * @property {number} [columns]         sprite-sheet columns (default: square-ish)
 * @property {number} [spacing=0]
 * @property {string} [name='effect']   file stem
 * @property {(done: number, total: number) => void} [onProgress]
 * @property {boolean} [yieldToUi=false]
 */

/**
 * @typedef {object} ExportFile
 * @property {string} name
 * @property {'image/gif'|'image/png'|'application/json'} type
 * @property {Uint8Array} [bytes]   GIF
 * @property {import('./frames.js').Pixels} [pixels]  PNG (encode with a canvas)
 * @property {string} [text]        JSON
 */

/** Safe file stem: letters, digits, dash, underscore. @param {string} s */
export const fileStem = (s) =>
  (s || 'effect')
    .trim()
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'effect';

/**
 * @param {ReturnType<typeof import('../render/renderer.js').createRenderer>} renderer
 * @param {import('./frames.js').ExportSource} src
 * @param {ExportOptions} [o]
 * @returns {Promise<{ files: ExportFile[], info: { width: number, height: number, frames: number, drawings: number } }>}
 */
export async function runExport(renderer, src, o = {}) {
  const name = fileStem(o.name ?? 'effect');
  const seq = await renderSequence(renderer, src, {
    exportScale: o.exportScale ?? 1,
    onProgress: o.onProgress,
    yieldToUi: o.yieldToUi,
  });
  const background = o.background ?? null;
  const prep = prepareSequence(seq, { trim: o.trim ?? true, background });
  /** @type {ExportFile[]} */
  const files = [];
  if (o.gif ?? true) {
    files.push({
      name: `${name}.gif`,
      type: 'image/gif',
      bytes: encodeGif(prep, { transparent: background === null }),
    });
  }
  if (o.sheet ?? true) {
    const sheet = packSheet(prep, {
      columns: o.columns,
      spacing: o.spacing,
      name,
      scale: o.exportScale ?? 1,
      background,
    });
    files.push({ name: `${name}.png`, type: 'image/png', pixels: sheet.image });
    files.push({
      name: `${name}.json`,
      type: 'application/json',
      text: `${JSON.stringify(sheet.json, null, 2)}\n`,
    });
  }
  return {
    files,
    info: {
      width: prep.rect.w,
      height: prep.rect.h,
      frames: prep.frames.length,
      drawings: prep.drawings.length,
    },
  };
}
