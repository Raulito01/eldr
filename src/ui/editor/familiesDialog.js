// @ts-check
/**
 * Your own families (D-118): the Save-as-my-preset dialog (pick a family + a name) and the
 * Families manager (rename / delete a family, move presets between families, delete presets,
 * export a family as one `.eldrpack` file, import a pack). Pen-friendly: big targets, no hover.
 * Storage is the editor's business (browser or presets folder): every change goes through the
 * callbacks, then the dialog redraws from `names()`.
 */

import { familiesOf, familyOf, PACK_EXT, presetNameOf } from '../../project/familyPack.js';
import { h } from '../dom.js';

/** A modal dialog that closes on Esc and keeps the editor's shortcuts off while open. */
function modal(/** @type {string} */ cls, /** @type {Node[]} */ children) {
  const dialog = /** @type {HTMLDialogElement} */ (h('dialog', { class: `xp ${cls}` }, children));
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

const datalist = (/** @type {string} */ id, /** @type {string[]} */ values) =>
  h(
    'datalist',
    { id },
    values.map((v) => h('option', { value: v }, [])),
  );

/**
 * Save as my preset: Family (pick or type a new one) + Name.
 * @param {{ families: string[], family?: string, name?: string, where: string,
 *   exists: (family: string, name: string) => boolean,
 *   onSave: (family: string, name: string) => Promise<string | null> }} o
 *   onSave resolves to an error message, or null when saved
 */
export function openSavePresetDialog(o) {
  const fam = /** @type {HTMLInputElement} */ (
    h('input', {
      type: 'text',
      class: 'fam-input',
      placeholder: 'No family',
      value: o.family ?? '',
    })
  );
  fam.setAttribute('list', 'fam-save-list');
  const name = /** @type {HTMLInputElement} */ (
    h('input', { type: 'text', class: 'fam-input', placeholder: 'Name', value: o.name ?? '' })
  );
  const msg = h('p', { class: 'xp-status' }, []);
  const save = /** @type {HTMLButtonElement} */ (
    h('button', { type: 'button', class: 'xp-go' }, ['Save'])
  );
  const cancel = h('button', { type: 'button' }, ['Cancel']);
  const dialog = modal('fam-save', [
    h('h2', {}, ['Save as my preset']),
    h('p', { class: 'hint' }, [
      `Saved in ${o.where}. A family is a group in the My presets menu — and a pack you can export.`,
    ]),
    h('label', { class: 'fam-field' }, ['Family', fam]),
    datalist('fam-save-list', o.families),
    h('label', { class: 'fam-field' }, ['Name', name]),
    msg,
    h('div', { class: 'xp-buttons' }, [cancel, save]),
  ]);
  const go = async () => {
    const f = fam.value.trim();
    const n = name.value.trim();
    if (!n) {
      msg.textContent = 'Give it a name.';
      name.focus();
      return;
    }
    if (o.exists(f, n) && !confirm(`Replace your preset "${f ? `${f}/` : ''}${n}"?`)) return;
    save.disabled = true;
    const err = await o.onSave(f, n);
    save.disabled = false;
    if (err) msg.textContent = err;
    else dialog.close();
  };
  save.addEventListener('click', go);
  cancel.addEventListener('click', () => dialog.close());
  for (const inp of [fam, name])
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      // no default: focus goes back to "Save as my preset…", and Enter would press it again
      e.preventDefault();
      go();
    });
  (o.name ? name : fam).focus();
  return dialog;
}

/**
 * @typedef {object} FamiliesOptions
 * @property {() => string[]} names  every My preset key ("Family/Name")
 * @property {string} where  "this browser" / "folder …"
 * @property {(from: string, to: string) => Promise<string>} rename
 * @property {(family: string) => Promise<string>} removeFamily
 * @property {(key: string, family: string) => Promise<string>} move
 * @property {(key: string) => Promise<string>} removePreset
 * @property {(family: string) => Promise<string>} exportPack
 * @property {(file: File) => Promise<string>} importPack
 * @property {(key: string) => void} open  load a preset into the editor
 * @property {() => void} [onClose]
 */

/** The Families manager. @param {FamiliesOptions} o */
export function openFamiliesDialog(o) {
  const list = h('div', { class: 'fam-list' }, []);
  const msg = h('p', { class: 'xp-status' }, []);
  const fileIn = /** @type {HTMLInputElement} */ (
    h('input', { type: 'file', accept: `${PACK_EXT},application/zip`, hidden: true })
  );
  const importBtn = h(
    'button',
    { type: 'button', class: 'fam-btn', title: `Add the presets of a ${PACK_EXT} file` },
    ['⬆ Import pack…'],
  );
  const close = h('button', { type: 'button' }, ['Close']);
  /** families the user opened (stay open across redraws) */
  const opened = new Set();

  /** Run a change, show its message, redraw. @param {() => Promise<string>} fn */
  const run = async (fn) => {
    msg.textContent = 'Working…';
    try {
      msg.textContent = await fn();
    } catch (err) {
      msg.textContent = `Something went wrong: ${/** @type {Error} */ (err).message}`;
    }
    draw();
  };

  function draw() {
    const fams = familiesOf(o.names());
    const names = fams.map((f) => f.family).filter(Boolean);
    if (!fams.length) {
      list.replaceChildren(
        h('p', { class: 'hint' }, [
          'No presets yet. Save one (Save as my preset…), keep variations (Variants → ☆ → Save kept), or import a pack.',
        ]),
      );
      return;
    }
    list.replaceChildren(
      ...fams.map(({ family, keys }) => {
        const title = h('span', { class: 'fam-title' }, [family || 'No family']);
        const count = h('span', { class: 'fam-count' }, [`${keys.length}`]);
        const btn = (
          /** @type {string} */ label,
          /** @type {string} */ tip,
          /** @type {() => void} */ fn,
        ) => h('button', { type: 'button', class: 'fam-btn', title: tip, onclick: fn }, [label]);
        const tools = h('div', { class: 'fam-tools' }, [
          btn('⬇ Export pack', `Save “${family || 'No family'}” as one ${PACK_EXT} file`, () =>
            run(() => o.exportPack(family)),
          ),
          ...(family
            ? [
                btn('Rename', 'Rename this family', () => {
                  const inp = /** @type {HTMLInputElement} */ (
                    h('input', { type: 'text', class: 'fam-input', value: family })
                  );
                  const ok = h('button', { type: 'button', class: 'fam-btn' }, ['OK']);
                  const done = () => {
                    const to = inp.value.trim();
                    if (!to || to === family) return draw();
                    opened.delete(family);
                    opened.add(to);
                    run(() => o.rename(family, to));
                  };
                  ok.addEventListener('click', done);
                  inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      done();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      draw();
                    }
                  });
                  title.replaceWith(h('span', { class: 'fam-rename' }, [inp, ok]));
                  inp.focus();
                  inp.select();
                }),
                btn('Delete', 'Delete this family and its presets', () => {
                  if (
                    confirm(
                      `Delete the family “${family}” and its ${keys.length} preset${keys.length === 1 ? '' : 's'}?`,
                    )
                  )
                    run(() => o.removeFamily(family));
                }),
              ]
            : []),
        ]);
        const rows = keys.map((key) => {
          const move = /** @type {HTMLSelectElement} */ (
            h('select', { class: 'fam-move', title: 'Move to another family' }, [
              h('option', { value: '' }, ['Move to…']),
              ...(family ? [h('option', { value: '\u0000none' }, ['No family'])] : []),
              ...names.filter((n) => n !== family).map((n) => h('option', { value: n }, [n])),
              h('option', { value: '\u0000new' }, ['New family…']),
            ])
          );
          move.addEventListener('change', () => {
            let to = move.value;
            if (!to) return;
            if (to === '\u0000new') {
              to = prompt('Name of the new family:')?.trim() ?? '';
              if (!to) {
                move.value = '';
                return;
              }
            }
            if (to === '\u0000none') to = '';
            run(() => o.move(key, to));
          });
          const openBtn = h(
            'button',
            { type: 'button', class: 'fam-preset', title: 'Open it in the editor' },
            [presetNameOf(key)],
          );
          openBtn.addEventListener('click', () => {
            o.open(key);
            dialog.close();
          });
          const del = h(
            'button',
            { type: 'button', class: 'fam-btn fam-x', title: 'Delete this preset' },
            ['✕'],
          );
          del.addEventListener('click', () => {
            if (confirm(`Delete “${presetNameOf(key)}”?`)) run(() => o.removePreset(key));
          });
          return h('div', { class: 'fam-row' }, [openBtn, move, del]);
        });
        const det = /** @type {HTMLDetailsElement} */ (
          h('details', { class: 'fam-family', open: opened.has(family) || fams.length === 1 }, [
            h('summary', {}, [title, count]),
            tools,
            h('div', { class: 'fam-rows' }, rows),
          ])
        );
        det.addEventListener('toggle', () => {
          if (det.open) opened.add(family);
          else opened.delete(family);
        });
        return det;
      }),
    );
  }

  importBtn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (f) run(() => o.importPack(f));
  });
  const dialog = modal('fam', [
    h('h2', {}, ['My families']),
    h('p', { class: 'hint' }, [
      `Your presets in ${o.where}, by family. Export a family as one ${PACK_EXT} file to share, back up or sell it; import packs from others.`,
    ]),
    h('div', { class: 'fam-top' }, [importBtn, fileIn]),
    list,
    msg,
    h('div', { class: 'xp-buttons' }, [close]),
  ]);
  dialog.addEventListener('close', () => o.onClose?.());
  close.addEventListener('click', () => dialog.close());
  draw();
  return { element: dialog, redraw: draw, family: familyOf };
}
