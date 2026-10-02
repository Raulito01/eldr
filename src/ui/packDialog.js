// @ts-check
/**
 * Pack dialog (D1, D-087): choose effects (this one, built-in presets, My presets), how many
 * variations of each, the target engines and the sheet options, then build one ZIP laid out
 * like a professional VFX pack (src/export/pack.js). Pen-friendly: big targets, no tiny inputs.
 */

import { ENGINES, PIVOTS } from '../export/engines.js';
import { buildPack } from '../export/pack.js';
import { h } from './dom.js';
import { canvasOf, download, pngBytes } from './exportPanel.js';

/**
 * @typedef {object} PackSource  one effect that can go into the pack
 * @property {string} id @property {string} label @property {string} group
 */

/**
 * @typedef {object} PackDialogOptions
 * @property {ReturnType<typeof import('../render/renderer.js').createRenderer>} renderer
 * @property {() => PackSource[]} sources  ("current" first)
 * @property {(ids: string[], variations: number, mode: 'subtle' | 'wild') => import('../export/pack.js').PackItem[]} items
 * @property {() => string} defaultName
 * @property {() => void} [onBeforeExport]
 */

const STORE = 'eldr.packPrefs';

/** @param {PackDialogOptions} o */
export function createPackDialog(o) {
  /** @type {{ engines: string[], pivot: string, padding: number, pot: boolean, onBlack: boolean, gif: boolean, variations: number, mode: 'subtle' | 'wild' }} */
  let prefs = {
    engines: ENGINES.map((e) => e.id),
    pivot: 'center',
    padding: 2,
    pot: false,
    onBlack: false,
    gif: true,
    variations: 0,
    mode: 'subtle',
  };
  try {
    prefs = { ...prefs, ...JSON.parse(localStorage.getItem(STORE) ?? '{}') };
  } catch {
    // storage blocked: defaults
  }
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(prefs));
    } catch {
      // not remembered
    }
  };

  const check = (/** @type {string} */ label, /** @type {boolean} */ on, title = '') => {
    const box = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: on }));
    return { box, row: h('label', { class: 'xp-check', title }, [box, h('span', {}, [label])]) };
  };
  const field = (/** @type {string} */ label, /** @type {HTMLElement} */ input) =>
    h('label', { class: 'xp-row' }, [h('span', {}, [label]), input]);

  const name = /** @type {HTMLInputElement} */ (h('input', { type: 'text', spellcheck: false }));
  const list = h('div', { class: 'pk-list' }, []);
  const variations = /** @type {HTMLInputElement} */ (
    h('input', { type: 'number', min: 0, max: 12, value: String(prefs.variations) })
  );
  const mode = /** @type {HTMLSelectElement} */ (
    h('select', {}, [
      h('option', { value: 'subtle' }, ['Subtle (same style)']),
      h('option', { value: 'wild' }, ['Wild (very different)']),
    ])
  );
  mode.value = prefs.mode;
  const engines = ENGINES.map((e) => ({
    id: e.id,
    ...check(e.label, prefs.engines.includes(e.id)),
  }));
  const pivot = /** @type {HTMLSelectElement} */ (
    h(
      'select',
      {},
      Object.entries(PIVOTS).map(([value, p]) => h('option', { value }, [p.label])),
    )
  );
  pivot.value = prefs.pivot;
  const padding = /** @type {HTMLInputElement} */ (
    h('input', { type: 'number', min: 0, max: 16, value: String(prefs.padding) })
  );
  const pot = check(
    'Power-of-two sheet sizes',
    prefs.pot,
    'e.g. 1024 × 512 (older engines / mobile GPUs)',
  );
  const onBlack = check(
    'Additive versions (on black)',
    prefs.onBlack,
    'Also <effect>_additive.png: the sheet on black, for additive blending',
  );
  const gif = check('Preview GIF per effect', prefs.gif);
  const status = h('p', { class: 'xp-status' }, []);
  const count = h('span', { class: 'xp-size' }, []);
  const go = h('button', { type: 'button', class: 'xp-go' }, ['Build pack']);
  const cancel = h('button', { type: 'button' }, ['Close']);

  /** @type {HTMLInputElement[]} */
  let boxes = [];
  const selected = () => boxes.filter((b) => b.checked).map((b) => b.value);
  const syncCount = () => {
    const n = selected().length * (1 + Math.max(0, Number(variations.value) || 0));
    count.textContent = n
      ? `${n} effect${n === 1 ? '' : 's'} in the pack`
      : 'Pick at least one effect';
  };
  variations.addEventListener('input', syncCount);

  function fillList() {
    const groups = new Map();
    for (const s of o.sources()) {
      if (!groups.has(s.group)) groups.set(s.group, []);
      groups.get(s.group).push(s);
    }
    boxes = [];
    list.replaceChildren(
      ...[...groups].map(([group, items], gi) => {
        const rows = items.map((/** @type {PackSource} */ s) => {
          const box = /** @type {HTMLInputElement} */ (
            h('input', { type: 'checkbox', value: s.id, checked: s.id === 'current' })
          );
          box.addEventListener('change', syncCount);
          boxes.push(box);
          return h('label', { class: 'xp-check pk-item' }, [box, h('span', {}, [s.label])]);
        });
        const all = h('button', { type: 'button', class: 'pk-all' }, ['All']);
        all.addEventListener('click', (e) => {
          e.preventDefault();
          const on = !rows.every((r) => /** @type {HTMLInputElement} */ (r.firstChild).checked);
          for (const r of rows) /** @type {HTMLInputElement} */ (r.firstChild).checked = on;
          syncCount();
        });
        return h('details', { class: 'pk-group', open: gi === 0 }, [
          h('summary', {}, [group, all]),
          h('div', { class: 'pk-items' }, rows),
        ]);
      }),
    );
    syncCount();
  }

  const dialog = h('dialog', { class: 'xp pk' }, [
    h('h2', {}, ['Export pack']),
    h('p', { class: 'hint' }, [
      'One ZIP like a professional VFX pack: a folder per effect (sheet, JSON, GIF, engine files), a README with import steps, a licence and a preview sheet.',
    ]),
    field('Pack name', name),
    h('div', { class: 'pk-cols' }, [
      h('div', {}, [h('div', { class: 'vx-label' }, ['Effects']), list]),
      h('div', { class: 'pk-side' }, [
        h('div', { class: 'vx-label' }, ['Variations']),
        field('Per effect', variations),
        field('Kind', mode),
        h('div', { class: 'vx-label' }, ['Engines']),
        h(
          'div',
          { class: 'xp-checks pk-engines' },
          engines.map((e) => e.row),
        ),
        h('div', { class: 'vx-label' }, ['Sheets']),
        field('Pivot', pivot),
        field('Padding (px)', padding),
        pot.row,
        onBlack.row,
        gif.row,
      ]),
    ]),
    h('p', { class: 'xp-note' }, [count]),
    status,
    h('div', { class: 'xp-buttons' }, [cancel, go]),
  ]);
  document.body.append(dialog);

  let busy = false;
  cancel.addEventListener('click', () => {
    if (!busy) dialog.close();
  });
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  go.addEventListener('click', async () => {
    if (busy) return;
    const ids = selected();
    if (!ids.length) {
      status.textContent = 'Pick at least one effect.';
      return;
    }
    prefs = {
      engines: engines.filter((e) => e.box.checked).map((e) => e.id),
      pivot: pivot.value,
      padding: Math.max(0, Math.min(16, Number(padding.value) || 0)),
      pot: pot.box.checked,
      onBlack: onBlack.box.checked,
      gif: gif.box.checked,
      variations: Math.max(0, Math.min(12, Math.round(Number(variations.value) || 0))),
      mode: /** @type {'subtle' | 'wild'} */ (mode.value),
    };
    save();
    busy = true;
    go.disabled = true;
    o.onBeforeExport?.();
    const start = performance.now();
    try {
      const items = o.items(ids, prefs.variations, prefs.mode);
      const pv = PIVOTS[/** @type {'center'|'bottom'} */ (prefs.pivot)] ?? PIVOTS.center;
      const pack = await buildPack(
        o.renderer,
        items,
        {
          name: name.value || 'ELDR Pack',
          engines: prefs.engines,
          pivot: pv,
          pivotLabel: pv.label,
          padding: prefs.padding,
          extrude: Math.min(1, prefs.padding),
          pot: prefs.pot,
          onBlack: prefs.onBlack,
          gif: prefs.gif,
          yieldToUi: true,
          onProgress: (stage, done, total) => {
            status.textContent = `${stage} ${done} / ${total}…`;
          },
        },
        { encodePng: pngBytes, makeCanvas: canvasOf },
      );
      download(
        new Blob([/** @type {BlobPart} */ (pack.bytes)], { type: 'application/zip' }),
        pack.name,
      );
      const s = ((performance.now() - start) / 1000).toFixed(1);
      const mb = (pack.bytes.length / 1024 / 1024).toFixed(1);
      status.textContent = `Done in ${s} s: ${pack.name} (${mb} MB, ${items.length} effects, ${pack.paths.length} files).`;
    } catch (err) {
      status.textContent = `Pack failed: ${/** @type {Error} */ (err).message}`;
    } finally {
      busy = false;
      go.disabled = false;
    }
  });

  return {
    open() {
      name.value = o.defaultName();
      status.textContent = '';
      fillList();
      dialog.showModal();
    },
    element: dialog,
  };
}
