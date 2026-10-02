// @ts-check
/**
 * Texture panel (4.Pb2, D-068): import your own image or PNG sequence for a Texture particle
 * layer, reuse one already in the document, or remove it. Every action is a button (pen).
 */

import { naturalCompare, sequenceName } from '../../render/textures.js';
import { h } from '../dom.js';

/** Longest side of an imported frame (bigger images are scaled down: files stay small). */
export const MAX_TEXTURE_SIDE = 512;
/** Most frames in one sequence. */
export const MAX_TEXTURE_FRAMES = 300;

/**
 * Image files → a texture asset (PNG data URLs, all frames at the first frame's size) plus the
 * decoded frames, ready to register. Files are sorted by name (natural order: f2 before f10).
 * @param {File[]} files
 * @returns {Promise<{ asset: import('../../render/textures.js').TextureAsset, frames: any[], skipped: number }>}
 */
export async function importTextureFiles(files) {
  const list = files
    .filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name))
    .sort((a, b) => naturalCompare(a.name, b.name));
  const used = list.slice(0, MAX_TEXTURE_FRAMES);
  if (!used.length) throw new Error('No PNG, JPEG or WebP images among the chosen files');
  const bitmaps = await Promise.all(used.map((f) => createImageBitmap(f)));
  const k = Math.min(1, MAX_TEXTURE_SIDE / Math.max(bitmaps[0].width, bitmaps[0].height));
  const w = Math.max(1, Math.round(bitmaps[0].width * k));
  const hh = Math.max(1, Math.round(bitmaps[0].height * k));
  /** @type {string[]} */
  const urls = [];
  /** @type {any[]} */
  const frames = [];
  for (const b of bitmaps) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hh;
    /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(b, 0, 0, w, hh);
    urls.push(c.toDataURL('image/png'));
    frames.push(c);
    b.close?.();
  }
  const id = `tex-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  return {
    asset: { id, name: sequenceName(used.map((f) => f.name)), frames: urls, w, h: hh },
    frames,
    skipped: files.length - used.length,
  };
}

/**
 * @typedef {object} TexturePanelOptions
 * @property {string | undefined} current  asset id the layer uses
 * @property {Record<string, import('../../render/textures.js').TextureAsset>} assets
 * @property {(files: File[]) => void} onImport
 * @property {(id: string) => void} onUse
 * @property {() => void} onClear
 */

/**
 * Fill `host` with the panel.
 * @param {HTMLElement} host @param {TexturePanelOptions} o
 */
export function mountTexturePanel(host, o) {
  const input = /** @type {HTMLInputElement} */ (
    h('input', {
      type: 'file',
      multiple: true,
      accept: 'image/png,image/jpeg,image/webp',
      style: 'display:none',
    })
  );
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) o.onImport(files);
  });
  const cur = o.current ? o.assets[o.current] : undefined;
  const others = Object.values(o.assets).filter((a) => a.id !== o.current);
  const reuse = others.length
    ? h('select', { class: 'tex-reuse', title: 'Use a texture already in this project' }, [
        h('option', { value: '' }, ['Use another texture…']),
        ...others.map((a) =>
          h('option', { value: a.id }, [
            `${a.name}${a.frames.length > 1 ? ` (${a.frames.length} frames)` : ''}`,
          ]),
        ),
      ])
    : null;
  reuse?.addEventListener('change', () => {
    const v = /** @type {HTMLSelectElement} */ (reuse).value;
    if (v) o.onUse(v);
  });
  host.replaceChildren(
    h('div', { class: 'mask-head' }, [h('span', { class: 'mask-title' }, ['Texture'])]),
    h('div', { class: 'tex-card' }, [
      cur
        ? h('img', { class: 'tex-thumb', src: cur.frames[0], alt: cur.name })
        : h('div', { class: 'tex-thumb tex-empty' }, ['●']),
      h('div', { class: 'tex-info' }, [
        h('div', { class: 'tex-name' }, [cur ? cur.name : 'No texture yet (soft dot)']),
        h('div', { class: 'tex-meta' }, [
          cur
            ? `${cur.frames.length > 1 ? `${cur.frames.length}-frame sequence` : 'Image'} · ${cur.w}×${cur.h}`
            : 'Import a PNG, or select every frame of a PNG sequence at once',
        ]),
      ]),
    ]),
    h('div', { class: 'tex-actions' }, [
      h(
        'button',
        {
          type: 'button',
          class: 'mask-add tex-import',
          title:
            'Choose one image, or all frames of a PNG sequence (they play in file-name order). Transparent PNGs work best.',
          onclick: () => input.click(),
        },
        [cur ? '🖼 Replace…' : '🖼 Import image / PNG sequence…'],
      ),
      ...(cur
        ? [
            h(
              'button',
              {
                type: 'button',
                class: 'mask-del',
                title: 'Back to the soft dot',
                onclick: () => o.onClear(),
              },
              ['✕ Remove'],
            ),
          ]
        : []),
      ...(reuse ? [reuse] : []),
      input,
    ]),
  );
}
