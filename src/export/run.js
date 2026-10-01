// @ts-check
/**
 * One export = render once, then build every requested file from the same frames.
 * Returns file contents; saving/downloading is the caller's job (browser: export panel; Node:
 * tests and scripts). Encoders that need a browser (PNG, MP4) are passed in as `deps`.
 *
 * Formats (3.5, 3.5b): GIF · sprite sheet (PNG + JSON) · PNG sequence (.zip) · MP4.
 * Matte (3.5b): alpha as black-and-white frames — `name_matte_####.png` in the zip and/or
 * `name_matte.mp4` — for formats or tools without transparency.
 */

import { zipSync } from 'fflate';
import { flatten, matteOf, padEven, prepareSequence, renderSequence } from './frames.js';
import { encodeGif } from './gif.js';
import { packSheet } from './sheet.js';

/**
 * @typedef {object} ExportOptions
 * @property {boolean} [gif=true]
 * @property {boolean} [sheet=true]
 * @property {boolean} [pngSequence=false]  PNG frames in one .zip
 * @property {boolean} [mp4=false]
 * @property {boolean} [matte=false]  also export the alpha matte (PNG sequence and/or MP4)
 * @property {number} [exportScale=1]   0.5 – 4
 * @property {string|null} [background=null]  null = transparent (MP4 then uses black)
 * @property {boolean} [trim=true]  crop GIF + sprite sheet to the effect (PNG sequence and MP4
 *   always keep the full frame, like a video render; D-052)
 * @property {number} [columns]         sprite-sheet columns (default: square-ish)
 * @property {number} [spacing=0]
 * @property {string} [name='effect']   file stem
 * @property {(stage: string, done: number, total: number) => void} [onProgress]
 * @property {boolean} [yieldToUi=false]
 */

/**
 * @typedef {object} ExportDeps  encoders that need a real runtime
 * @property {(p: import('./frames.js').Pixels) => Promise<Uint8Array>} [encodePng]
 * @property {(seq: { drawings: import('./frames.js').Pixels[], frames: number[], fps: number },
 *   o: { onProgress?: (done: number, total: number) => void }) => Promise<{ bytes: Uint8Array, codec: string }>} [encodeMp4]
 */

/**
 * @typedef {object} ExportFile
 * @property {string} name
 * @property {'image/gif'|'image/png'|'application/json'|'application/zip'|'video/mp4'} type
 * @property {Uint8Array} [bytes]   GIF, ZIP, MP4
 * @property {import('./frames.js').Pixels} [pixels]  PNG (encode with a canvas)
 * @property {string} [text]        JSON
 */

/** Safe file stem: letters, digits, dash, underscore. @param {string} s */
export const fileStem = (s) =>
  (s || 'effect')
    .trim()
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'effect';

/** Zero-padded frame number. @param {number} i @param {number} count */
export const frameNumber = (i, count) => String(i).padStart(Math.max(4, String(count).length), '0');

/**
 * @param {ReturnType<typeof import('../render/renderer.js').createRenderer>} renderer
 * @param {import('./frames.js').ExportSource} src
 * @param {ExportOptions} [o]
 * @param {ExportDeps} [deps]
 * @returns {Promise<{ files: ExportFile[], notes: string[], info: { width: number, height: number, fullWidth: number, fullHeight: number, frames: number, drawings: number } }>}
 */
export async function runExport(renderer, src, o = {}, deps = {}) {
  const name = fileStem(o.name ?? 'effect');
  const progress = o.onProgress ?? (() => {});
  const seq = await renderSequence(renderer, src, {
    exportScale: o.exportScale ?? 1,
    onProgress: (d, t) => progress('Rendering', d, t),
    yieldToUi: o.yieldToUi,
  });
  const background = o.background ?? null;
  // Sprite formats (GIF, sheet) may be trimmed to the effect; video formats (PNG sequence,
  // MP4) always keep the full frame the artist set, e.g. 1920×1080 (D-052).
  const sprite = prepareSequence(seq, { trim: o.trim ?? true, background: null });
  const onBg = background
    ? { ...sprite, drawings: sprite.drawings.map((d) => flatten(d, background)) }
    : sprite;
  const clear = prepareSequence(seq, { trim: false, background: null });
  const fullOnBg = background
    ? { ...clear, drawings: clear.drawings.map((d) => flatten(d, background)) }
    : clear;
  /** @type {ExportFile[]} */
  const files = [];
  /** @type {string[]} */
  const notes = [];

  if (o.gif ?? true) {
    progress('GIF', 0, 1);
    files.push({
      name: `${name}.gif`,
      type: 'image/gif',
      bytes: encodeGif(onBg, { transparent: background === null }),
    });
  }

  if (o.sheet ?? true) {
    const sheet = packSheet(onBg, {
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

  if (o.pngSequence) {
    if (!deps.encodePng) throw new Error('PNG sequence export needs a PNG encoder');
    const passes = [{ suffix: '', drawings: fullOnBg.drawings }];
    if (o.matte) passes.push({ suffix: '_matte', drawings: clear.drawings.map(matteOf) });
    /** @type {Record<string, Uint8Array>} */
    const zip = {};
    const total = passes.length * clear.drawings.length;
    let done = 0;
    for (const pass of passes) {
      // Each drawing is encoded once; held frames reuse its bytes.
      const encoded = [];
      for (const d of pass.drawings) {
        encoded.push(await deps.encodePng(d));
        progress('PNG frames', ++done, total);
      }
      clear.frames.forEach((drawing, i) => {
        zip[`${name}${pass.suffix}_${frameNumber(i, clear.frames.length)}.png`] = encoded[drawing];
      });
    }
    files.push({
      name: `${name}_png.zip`,
      type: 'application/zip',
      bytes: zipSync(zip, { level: 0 }), // PNGs are already compressed
    });
  }

  if (o.mp4) {
    if (!deps.encodeMp4) throw new Error('MP4 export needs a video encoder');
    const colour = clear.drawings.map((d) => flatten(padEven(d), background ?? '#000000'));
    const passes = [{ file: `${name}.mp4`, drawings: colour, label: 'MP4' }];
    if (o.matte) {
      passes.push({
        file: `${name}_matte.mp4`,
        drawings: clear.drawings.map((d) => padEven(matteOf(d))).map((d) => flatten(d, '#000000')),
        label: 'MP4 matte',
      });
    }
    for (const pass of passes) {
      const r = await deps.encodeMp4(
        { drawings: pass.drawings, frames: clear.frames, fps: clear.fps },
        { onProgress: (d, t) => progress(pass.label, d, t) },
      );
      files.push({ name: pass.file, type: 'video/mp4', bytes: r.bytes });
      if (r.codec !== 'avc' && pass.label === 'MP4') {
        notes.push(
          `This browser has no H.264 encoder, so the MP4 uses ${r.codec.toUpperCase()}. QuickTime / After Effects may not open it: use Chrome or Safari for H.264, or the PNG sequence.`,
        );
      }
    }
    if (!background)
      notes.push(
        'MP4 has no transparency: the colour video is on black. Use the matte (Luma Matte in After Effects) to cut it out.',
      );
  }

  return {
    files,
    notes,
    info: {
      width: (o.gif ?? true) || (o.sheet ?? true) ? sprite.rect.w : clear.rect.w,
      height: (o.gif ?? true) || (o.sheet ?? true) ? sprite.rect.h : clear.rect.h,
      fullWidth: clear.rect.w,
      fullHeight: clear.rect.h,
      frames: clear.frames.length,
      drawings: clear.drawings.length,
    },
  };
}
