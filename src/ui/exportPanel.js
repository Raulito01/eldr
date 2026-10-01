// @ts-check
/**
 * Export dialog (3.5, 3.5b): GIF, sprite sheet (PNG + JSON), PNG sequence (.zip), MP4 and an
 * optional alpha matte, of what's on screen.
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

/** Encode raw pixels as PNG bytes (browser canvas). @param {import('../export/frames.js').Pixels} p */
async function pngBytes(p) {
  return new Uint8Array(await (await pngBlob(p)).arrayBuffer());
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
  const check = (
    /** @type {string} */ label,
    /** @type {boolean} */ on,
    /** @type {string} */ title,
  ) => {
    const box = h('input', { type: 'checkbox', checked: on });
    return { box, row: h('label', { class: 'xp-check', title }, [box, h('span', {}, [label])]) };
  };

  const name = h('input', { type: 'text', value: 'effect', spellcheck: false });
  const fmt = {
    gif: check('GIF', true, 'Animated GIF (1-bit transparency)'),
    sheet: check('Sprite sheet', true, 'PNG grid + JSON frame list for game engines'),
    png: check('PNG sequence (.zip)', false, 'Numbered PNG frames with full transparency'),
    mp4: check('MP4 video', false, 'H.264 video (no transparency: on the background colour)'),
  };
  const matte = check(
    'Matte (alpha as black & white)',
    false,
    'Also export the alpha as a black-and-white sequence / video (Luma Matte in After Effects)',
  );
  const scale = h('select', {}, [
    h('option', { value: '0.5' }, ['0.5×']),
    h('option', { value: '1', selected: true }, ['1× (frame size)']),
    h('option', { value: '2' }, ['2×']),
    h('option', { value: '4' }, ['4×']),
  ]);
  const sizeInfo = h('span', { class: 'xp-size' });
  const bgMode = h('select', {}, [
    h('option', { value: 'transparent' }, ['Transparent']),
    h('option', { value: 'color' }, ['Colour']),
  ]);
  const bgColor = h('input', { type: 'color', value: '#2a2633' });
  const trim = h('input', {
    type: 'checkbox',
    checked: true,
    title:
      'Crop GIF and sprite sheet to the effect. PNG sequence and MP4 always keep the full frame.',
  });
  const columns = h('input', { type: 'number', min: 0, max: 128, value: 0, title: '0 = auto' });
  const note = h('p', { class: 'xp-note' });
  const status = h('p', { class: 'xp-status' });
  const go = h('button', { type: 'button', class: 'xp-go' }, ['Export']);
  const cancel = h('button', { type: 'button' }, ['Close']);

  const syncNote = () => {
    bgColor.disabled = bgMode.value !== 'color';
    const src = o.getSource();
    const k = Number(scale.value);
    sizeInfo.textContent = `→ ${Math.round(src.width * k)} × ${Math.round(src.height * k)} px`;
    const msgs = [];
    if (bgMode.value === 'transparent' && fmt.gif.box.checked) {
      msgs.push(
        'GIF can only be fully see-through or fully solid: soft glow gets a hard edge. Export glowing GIFs on a colour; PNG formats keep full transparency.',
      );
    }
    if (fmt.mp4.box.checked && bgMode.value === 'transparent') {
      msgs.push(
        'MP4 has no transparency: it is rendered on black. Tick Matte to get the alpha as a second video.',
      );
    }
    if (Math.round(src.width * k) * Math.round(src.height * k) > 1500 * 1500) {
      msgs.push('Large size: rendering can take about a second per frame.');
    }
    note.textContent = msgs.join(' ');
  };
  for (const el of [bgMode, scale, fmt.gif.box, fmt.mp4.box])
    el.addEventListener('change', syncNote);

  const dialog = h('dialog', { class: 'xp' }, [
    h('h2', {}, ['Export']),
    field('File name', name),
    h('div', { class: 'xp-formats' }, [
      h('span', { class: 'xp-label' }, ['Formats']),
      h('div', { class: 'xp-checks' }, [
        fmt.gif.row,
        fmt.sheet.row,
        fmt.png.row,
        fmt.mp4.row,
        matte.row,
      ]),
    ]),
    field('Size', h('span', { class: 'xp-inline' }, [scale, sizeInfo])),
    field('Background', h('span', { class: 'xp-inline' }, [bgMode, bgColor])),
    field('Trim empty space (GIF + sheet)', trim),
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
    const any = Object.values(fmt).some((f) => f.box.checked);
    if (!any) {
      status.textContent = 'Pick at least one format.';
      return;
    }
    busy = true;
    go.disabled = true;
    o.onBeforeExport?.();
    const start = performance.now();
    try {
      const { files, info, notes } = await runExport(
        o.renderer,
        o.getSource(),
        {
          name: name.value,
          gif: fmt.gif.box.checked,
          sheet: fmt.sheet.box.checked,
          pngSequence: fmt.png.box.checked,
          mp4: fmt.mp4.box.checked,
          matte: matte.box.checked,
          exportScale: Number(scale.value),
          background: bgMode.value === 'color' ? bgColor.value : null,
          trim: trim.checked,
          columns: Number(columns.value) > 0 ? Number(columns.value) : undefined,
          yieldToUi: true,
          onProgress: (stage, done, total) => {
            status.textContent = `${stage} ${done} / ${total}…`;
          },
        },
        {
          encodePng: pngBytes,
          // Loaded only when needed (keeps the editor light).
          encodeMp4: async (seq, opts) => (await import('../export/mp4.js')).encodeMp4(seq, opts),
        },
      );
      status.textContent = 'Saving…';
      for (const f of files) download(await toBlob(f), f.name);
      const s = ((performance.now() - start) / 1000).toFixed(1);
      const video = fmt.png.box.checked || fmt.mp4.box.checked;
      const sprite = fmt.gif.box.checked || fmt.sheet.box.checked;
      const sizes = [
        sprite ? `GIF/sheet ${info.width}×${info.height}` : '',
        video ? `PNG/MP4 ${info.fullWidth}×${info.fullHeight}` : '',
      ].filter(Boolean);
      status.textContent = `Done in ${s} s: ${files.map((f) => f.name).join(', ')} · ${sizes.join(' · ')} px, ${info.frames} frames.`;
      if (notes.length) note.textContent = notes.join(' ');
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
