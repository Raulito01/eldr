// @ts-check
/**
 * Export dialog (step 3.5): GIF and/or sprite sheet (PNG + JSON) of what's on screen.
 * Pen-friendly (D-028): native buttons/selects/checkboxes only, large targets, kept clear of
 * the window edges (D-027).
 */

import { runExport } from '../export/run.js';
import { h } from './dom.js';

/**
 * Encode raw pixels as a PNG blob (browser canvas).
 * @param {import('../export/frames.js').Pixels} p @returns {Promise<Blob>}
 */
function pngBlob(p) {
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
}

/** Trigger a download of a blob. @param {Blob} blob @param {string} name */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** @param {import('../export/run.js').ExportFile} f @returns {Promise<Blob>} */
async function toBlob(f) {
  if (f.bytes) return new Blob([/** @type {BlobPart} */ (f.bytes)], { type: f.type });
  if (f.pixels) return pngBlob(f.pixels);
  return new Blob([f.text ?? ''], { type: f.type });
}

/**
 * @param {object} o
 * @param {ReturnType<typeof import('../render/renderer.js').createRenderer>} o.renderer
 * @param {() => import('../export/frames.js').ExportSource} o.getSource  what's on screen now
 * @param {() => string} o.getName  default file name
 * @param {() => void} [o.onBeforeExport]  e.g. stop playback
 */
export function createExportPanel(o) {
  const field = (/** @type {string} */ label, /** @type {HTMLElement} */ input) =>
    h('label', { class: 'xp-row' }, [h('span', {}, [label]), input]);

  const name = h('input', { type: 'text', value: 'effect', spellcheck: false });
  const format = h('select', {}, [
    h('option', { value: 'both' }, ['GIF + sprite sheet']),
    h('option', { value: 'gif' }, ['GIF only']),
    h('option', { value: 'sheet' }, ['Sprite sheet only (PNG + JSON)']),
  ]);
  const scale = h('select', {}, [
    h('option', { value: '1' }, ['1× (frame size)']),
    h('option', { value: '2' }, ['2×']),
  ]);
  const bgMode = h('select', {}, [
    h('option', { value: 'transparent' }, ['Transparent']),
    h('option', { value: 'color' }, ['Colour']),
  ]);
  const bgColor = h('input', { type: 'color', value: '#2a2633' });
  const trim = h('input', { type: 'checkbox', checked: true });
  const columns = h('input', { type: 'number', min: 0, max: 128, value: 0, title: '0 = auto' });
  const note = h('p', { class: 'xp-note' });
  const status = h('p', { class: 'xp-status' });
  const go = h('button', { type: 'button', class: 'xp-go' }, ['Export']);
  const cancel = h('button', { type: 'button' }, ['Close']);

  const syncNote = () => {
    bgColor.disabled = bgMode.value !== 'color';
    note.textContent =
      bgMode.value === 'transparent' && format.value !== 'sheet'
        ? 'GIF can only be fully see-through or fully solid: soft glow gets a hard edge. For glowing effects, export the GIF on a colour. The sprite sheet PNG keeps full transparency.'
        : '';
  };
  bgMode.addEventListener('change', syncNote);
  format.addEventListener('change', syncNote);

  const dialog = h('dialog', { class: 'xp' }, [
    h('h2', {}, ['Export']),
    field('File name', name),
    field('Format', format),
    field('Size', scale),
    field('Background', h('span', { class: 'xp-inline' }, [bgMode, bgColor])),
    field('Trim empty space', trim),
    field('Sheet columns (0 = auto)', columns),
    note,
    status,
    h('div', { class: 'xp-buttons' }, [cancel, go]),
  ]);
  document.body.append(dialog);

  let busy = false;
  cancel.addEventListener('click', () => {
    if (!busy) dialog.close();
  });
  go.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    go.disabled = true;
    o.onBeforeExport?.();
    const start = performance.now();
    try {
      const { files, info } = await runExport(o.renderer, o.getSource(), {
        name: name.value,
        gif: format.value !== 'sheet',
        sheet: format.value !== 'gif',
        exportScale: Number(scale.value),
        background: bgMode.value === 'color' ? bgColor.value : null,
        trim: trim.checked,
        columns: Number(columns.value) > 0 ? Number(columns.value) : undefined,
        yieldToUi: true,
        onProgress: (done, total) => {
          status.textContent = `Rendering ${done} / ${total}…`;
        },
      });
      status.textContent = 'Encoding…';
      for (const f of files) download(await toBlob(f), f.name);
      const s = ((performance.now() - start) / 1000).toFixed(1);
      status.textContent = `Done in ${s} s: ${files.map((f) => f.name).join(', ')} · ${info.width}×${info.height} px, ${info.frames} frames (${info.drawings} drawings).`;
    } catch (err) {
      status.textContent = `Export failed: ${/** @type {Error} */ (err).message}`;
    } finally {
      busy = false;
      go.disabled = false;
    }
  });

  return {
    open() {
      name.value = o.getName();
      status.textContent = '';
      syncNote();
      dialog.showModal();
    },
    element: dialog,
  };
}
