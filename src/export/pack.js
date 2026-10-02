// @ts-check
/**
 * Pack export (D1, D-087): several effects (presets, saved effects, variations) → one ZIP laid
 * out like a professional VFX pack:
 *
 *   <Pack>/README.md            effects table (frame size, frames, fps, loop, grid, blend) +
 *                               import steps for every chosen engine
 *   <Pack>/LICENSE.txt          placeholder for the author's terms
 *   <Pack>/preview.png          contact sheet (one frame of every effect, labelled)
 *   <Pack>/<effect>/…           engine-ready files (src/export/engines.js) + <effect>.gif
 *   <Pack>/Unity/Editor/EldrSpriteImporter.cs   (when Unity is chosen)
 *
 * Rendering reuses the normal export path (renderSequence + prepareSequence), so a pack frame is
 * pixel-identical to a single export and to the preview.
 */

import { zipSync } from 'fflate';
import { effectFiles, licenseText, packReadme, UNITY_IMPORTER } from './engines.js';
import { flatten, prepareSequence, renderSequence } from './frames.js';
import { encodeGif } from './gif.js';
import { fileStem } from './run.js';

/**
 * @typedef {object} PackItem
 * @property {string} name
 * @property {import('./frames.js').ExportSource} source
 * @property {boolean} [pixel]  Pixel Mode effect (README tip)
 */

/**
 * @typedef {object} PackOptions
 * @property {string} [name='ELDR Pack']
 * @property {string[]} engines
 * @property {{ x: number, y: number }} [pivot]
 * @property {string} [pivotLabel]
 * @property {number} [padding] @property {number} [extrude] @property {boolean} [pot]
 * @property {boolean} [gif=true]  a preview GIF per effect
 * @property {boolean} [onBlack=false]  also `<effect>_additive.png`: the sheet on black, for
 *   additive blending
 * @property {(stage: string, done: number, total: number) => void} [onProgress]
 * @property {boolean} [yieldToUi]
 */

/**
 * @typedef {object} PackDeps
 * @property {(p: import('./frames.js').Pixels) => Promise<Uint8Array>} encodePng
 * @property {(w: number, h: number) => any} [makeCanvas]  for the labelled contact sheet
 */

/** Unique stems: "Fire", "Fire_2", … @param {string[]} names */
export function uniqueStems(names) {
  const seen = new Map();
  return names.map((n) => {
    const base = fileStem(n);
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    return k === 1 ? base : `${base}_${k}`;
  });
}

/**
 * @param {ReturnType<typeof import('../render/renderer.js').createRenderer>} renderer
 * @param {PackItem[]} items @param {PackOptions} o @param {PackDeps} deps
 * @returns {Promise<{ bytes: Uint8Array, paths: string[], effects: Record<string, any>[], name: string }>}
 */
export async function buildPack(renderer, items, o, deps) {
  const packStem = fileStem(o.name ?? 'ELDR Pack');
  const progress = o.onProgress ?? (() => {});
  const stems = uniqueStems(items.map((i) => i.name));
  /** @type {Record<string, Uint8Array>} */
  const zip = {};
  const enc = new TextEncoder();
  /** @type {Record<string, any>[]} */
  const effects = [];
  /** @type {{ name: string, poster: import('./frames.js').Pixels }[]} */
  const posters = [];

  for (let k = 0; k < items.length; k++) {
    const item = items[k];
    const stem = stems[k];
    const seq = await renderSequence(renderer, item.source, {
      onProgress: (d, t) => progress(`Rendering ${stem} (${k + 1}/${items.length})`, d, t),
      yieldToUi: o.yieldToUi,
    });
    const sprite = prepareSequence(seq, { trim: true, background: null });
    const files = effectFiles(sprite, { ...o, stem, engines: o.engines });
    const dir = `${packStem}/${stem}/`;
    // each drawing is encoded once, even when it appears in several files (sequence, holds)
    /** @type {Map<object, Uint8Array>} */
    const encoded = new Map();
    const pngOf = async (/** @type {import('./frames.js').Pixels} */ p) => {
      let b = encoded.get(p);
      if (!b) {
        b = await deps.encodePng(p);
        encoded.set(p, b);
      }
      return b;
    };
    const pngs = Object.entries(files.png);
    for (let i = 0; i < pngs.length; i++) {
      progress(`Writing ${stem}`, i, pngs.length);
      zip[dir + pngs[i][0]] = await pngOf(pngs[i][1]);
      if (o.yieldToUi && i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    for (const [path, t] of Object.entries(files.text)) zip[dir + path] = enc.encode(t);
    if (o.onBlack) {
      const sheet = files.png[`${stem}.png`];
      zip[`${dir}${stem}_additive.png`] = await deps.encodePng(flatten(sheet, '#000000'));
    }
    if (o.gif ?? true) zip[`${dir}${stem}.gif`] = encodeGif(sprite, { transparent: true });
    effects.push({ ...files.info, pixel: !!item.pixel });
    posters.push({ name: stem, poster: sprite.drawings[posterOf(sprite)] });
  }

  if (o.engines.includes('unity'))
    zip[`${packStem}/Unity/Editor/EldrSpriteImporter.cs`] = enc.encode(UNITY_IMPORTER);
  zip[`${packStem}/README.md`] = enc.encode(
    packReadme({
      name: o.name ?? 'ELDR Pack',
      effects,
      engines: o.engines,
      pivotLabel: o.pivotLabel ?? 'centre',
      pixel: effects.some((e) => e.pixel),
    }),
  );
  zip[`${packStem}/LICENSE.txt`] = enc.encode(licenseText(o.name ?? 'ELDR Pack'));
  if (deps.makeCanvas && posters.length)
    zip[`${packStem}/preview.png`] = await deps.encodePng(contactSheet(posters, deps.makeCanvas));

  progress('Zipping', 0, 1);
  return {
    bytes: zipSync(zip, { level: 6 }),
    paths: Object.keys(zip),
    effects,
    name: `${packStem}.zip`,
  };
}

/** The drawing with the most visible pixels (a good poster frame). @param {import('./frames.js').RenderedSequence} seq */
export function posterOf(seq) {
  let best = 0;
  let bestN = -1;
  seq.drawings.forEach((d, i) => {
    let n = 0;
    for (let p = 3; p < d.data.length; p += 16) if (d.data[p] > 32) n++;
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  });
  return best;
}

/**
 * Labelled contact sheet: one poster frame per effect on a dark checker-free background.
 * @param {{ name: string, poster: import('./frames.js').Pixels }[]} list
 * @param {(w: number, h: number) => any} makeCanvas
 * @returns {import('./frames.js').Pixels}
 */
export function contactSheet(list, makeCanvas) {
  const cell = 200;
  const label = 22;
  const cols = Math.min(4, list.length);
  const rows = Math.ceil(list.length / cols);
  const W = cols * cell;
  const H = rows * (cell + label);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1c22';
  ctx.fillRect(0, 0, W, H);
  list.forEach((e, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + label);
    const p = e.poster;
    const tmp = makeCanvas(p.width, p.height);
    const t = tmp.getContext('2d');
    const img = t.createImageData(p.width, p.height);
    img.data.set(p.data);
    t.putImageData(img, 0, 0);
    const fit = Math.min((cell - 16) / p.width, (cell - 16) / p.height);
    const w = p.width * fit;
    const h = p.height * fit;
    ctx.imageSmoothingEnabled = fit < 1;
    ctx.drawImage(tmp, x + (cell - w) / 2, y + (cell - h) / 2, w, h);
    ctx.fillStyle = '#16171b';
    ctx.fillRect(x, y + cell, cell, label);
    ctx.fillStyle = '#e6e6ea';
    ctx.font = '13px sans-serif';
    ctx.fillText(e.name, x + 8, y + cell + 15);
  });
  const data = ctx.getImageData(0, 0, W, H);
  return { width: W, height: H, data: new Uint8ClampedArray(data.data) };
}
