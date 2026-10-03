// @ts-check
/**
 * Variants panel (D-083, brief §7.2): a 3 × 3 grid of animated thumbnails — the current effect
 * (top left) and 8 variations of it (src/effects/variants.js). Click one to adopt it (one undo
 * step). ↻ More: 8 new ones. Variation amount nudges the number settings around their values;
 * Shape / Motion / Colour chips and per-layer 🔒 keep things as they are. Thumbnails are small
 * and render progressively in the background (a poster frame for every tile first), so the
 * editor stays responsive; every tile then plays in a loop. Big pen-friendly targets.
 *
 * Keep several (D-117): ☆ on a tile keeps it in the tray below (kept ones stay while you press
 * ↻ More, and between opens); "Save kept…" saves them all at once into a family of My presets.
 */

import { makeVariant } from '../../effects/variants.js';
import { h } from '../dom.js';

/**
 * @typedef {object} VariantPrefs
 * @property {'subtle' | 'wild'} mode
 * @property {number} amount  subtle: 0–0.5
 * @property {number} wildness  wild: 0–1
 * @property {{ shape: boolean, motion: boolean, colour: boolean }} lock  true = kept
 * @property {Set<string>} lockedLayers
 * @property {KeptVariant[]} [kept]  variations kept with ☆ (D-117)
 */

/**
 * @typedef {object} KeptVariant
 * @property {any} doc
 * @property {HTMLCanvasElement} poster  a still of it for the tray
 */

/**
 * @typedef {object} VariantsPanelOptions
 * @property {any} doc  the whole document (root)
 * @property {(doc: any) => { effect: any, scale: number }} build  the effect to preview for a doc
 * @property {any} renderer  a renderer whose surface is not on screen
 * @property {(doc: any, width: number) => Record<string, any>} [snapFor]  Pixel Mode snapping for a render width
 * @property {(out: any, doc: any) => any} [post]  e.g. Pixel Mode: the rendered surface → shown one
 * @property {number} seed
 * @property {{ w: number, h: number }} frame
 * @property {{ frameCount: number, fps: number }} timing
 * @property {{ id: string, label: string }[]} layers  the layers shown (top first) for 🔒
 * @property {VariantPrefs} prefs  (edited in place, kept by the editor between opens)
 * @property {(doc: any) => void} onAdopt
 * @property {() => void} [onClose]
 * @property {() => string[]} [families]  existing families (groups) of My presets
 * @property {string} [baseName]  suggested name for saved variations
 * @property {(docs: any[], family: string, base: string) => Promise<string>} [onSaveKept]
 *   save the kept variations; resolves to a message for the status line
 */

const TILES = 9;
const TILE = 168;

/** @param {VariantsPanelOptions} o */
export function openVariantsPanel(o) {
  const fc = o.timing.frameCount;
  const stride = Math.max(1, Math.ceil(fc / 24));
  const frameList = Array.from({ length: Math.ceil(fc / stride) }, (_, i) => i * stride);
  const poster = Math.floor(frameList.length / 2);
  const posterAt = poster;
  const aspect = o.frame.w / o.frame.h;
  const tw = aspect >= 1 ? TILE : Math.round(TILE * aspect);
  const th = aspect >= 1 ? Math.round(TILE / aspect) : TILE;
  let base = (crypto.getRandomValues(new Uint32Array(1))[0] >>> 8) * 16; // UI input, not render path

  /** @type {{ canvas: HTMLCanvasElement, doc: any, effect: any, scale: number, frames: (HTMLCanvasElement | null)[] }[]} */
  let tiles = [];
  let gen = 0;
  /** @type {any} */
  let timer = 0;
  let raf = 0;
  let closed = false;

  // ── controls ──────────────────────────────────────────────────────────────────────────
  const amountIn = /** @type {HTMLInputElement} */ (
    h('input', { type: 'range', min: '0', step: '1' })
  );
  const amountOut = h('span', { class: 'vx-amount' }, []);
  const sliderLabel = h('div', { class: 'vx-label' }, []);
  const sliderHint = h('p', { class: 'hint vx-small' }, []);
  const wildOn = () => o.prefs.mode === 'wild';
  const showAmount = () => {
    const n = Number(amountIn.value);
    amountOut.textContent = wildOn() ? `${n} %` : n ? `±${n} %` : 'seed only';
  };
  const syncSlider = () => {
    amountIn.max = wildOn() ? '100' : '50';
    amountIn.value = String(Math.round((wildOn() ? o.prefs.wildness : o.prefs.amount) * 100));
    sliderLabel.textContent = wildOn() ? 'Wildness' : 'Variation';
    sliderHint.textContent = wildOn()
      ? 'Very different takes: numbers × ⅓…3, effects may switch on, new ramps from the library (with Colour on). 🔒 a layer to keep it.'
      : 'Seed only = new randomness, same settings. Higher = settings nudged around yours. Colour on = sister colours.';
    showAmount();
  };
  amountIn.addEventListener('input', () => {
    const v = Number(amountIn.value) / 100;
    if (wildOn()) o.prefs.wildness = v;
    else o.prefs.amount = v;
    showAmount();
    regenerate(true);
  });
  const modeBtn = (
    /** @type {'subtle' | 'wild'} */ m,
    /** @type {string} */ label,
    /** @type {string} */ title,
  ) => {
    const b = h('button', { type: 'button', class: 'vx-chip vx-mode', title }, [label]);
    b.dataset.mode = m;
    b.addEventListener('click', () => {
      // Wild is about very different looks: switching to it turns Colour on (new ramps)
      if (m === 'wild' && o.prefs.mode !== 'wild') o.prefs.lock.colour = false;
      o.prefs.mode = m;
      syncModes();
      for (const f of chipSyncs) f();
      syncSlider();
      regenerate(true);
    });
    return b;
  };
  const modes = [
    modeBtn('subtle', 'Subtle', 'Same style, small differences (for packs)'),
    modeBtn('wild', 'Wild', 'Explore very different variations'),
  ];
  const syncModes = () => {
    for (const b of modes) b.classList.toggle('on', b.dataset.mode === o.prefs.mode);
  };
  syncModes();
  syncSlider();
  /** @type {(() => void)[]} */
  const chipSyncs = [];
  const chip = (/** @type {'shape' | 'motion' | 'colour'} */ k, /** @type {string} */ label) => {
    const b = h(
      'button',
      { type: 'button', class: 'vx-chip', title: `Vary ${label.toLowerCase()} (off = keep it)` },
      [label],
    );
    const sync = () => b.classList.toggle('on', !o.prefs.lock[k]);
    sync();
    chipSyncs.push(sync);
    b.addEventListener('click', () => {
      o.prefs.lock[k] = !o.prefs.lock[k];
      sync();
      regenerate(true);
    });
    return b;
  };
  const layerLocks = o.layers.map((l) => {
    const b = h('button', { type: 'button', class: 'vx-lock' }, []);
    const sync = () => {
      const on = o.prefs.lockedLayers.has(l.id);
      b.textContent = `${on ? '🔒' : '🔓'} ${l.label}`;
      b.classList.toggle('on', on);
      b.title = on ? 'Locked: kept exactly as it is' : 'Varied';
    };
    sync();
    b.addEventListener('click', () => {
      if (o.prefs.lockedLayers.has(l.id)) o.prefs.lockedLayers.delete(l.id);
      else o.prefs.lockedLayers.add(l.id);
      sync();
      regenerate(true);
    });
    return b;
  });

  const grid = h('div', { class: 'vx-grid' }, []);
  const status = h('p', { class: 'xp-status' }, []);
  const more = h('button', { type: 'button', title: '8 new variations (R)' }, ['↻ More']);
  const tray = h('div', { class: 'vx-tray' }, []);
  const saveBtn = /** @type {HTMLButtonElement} */ (
    h(
      'button',
      { type: 'button', class: 'vx-go', title: 'Save every kept variation to My presets' },
      ['Save kept…'],
    )
  );
  const clearBtn = /** @type {HTMLButtonElement} */ (
    h('button', { type: 'button', title: 'Empty the tray' }, ['Clear'])
  );
  const famIn = /** @type {HTMLInputElement} */ (
    h('input', {
      type: 'text',
      class: 'vx-family',
      placeholder: 'Family (e.g. Dark Magic)',
      'aria-label': 'Family',
    })
  );
  famIn.setAttribute('list', 'vx-families'); // `list` is read-only as a property
  const nameIn = /** @type {HTMLInputElement} */ (
    h('input', { type: 'text', class: 'vx-name', placeholder: 'Name', 'aria-label': 'Name' })
  );
  nameIn.value = o.baseName ?? 'Variation';
  const famList = h(
    'datalist',
    { id: 'vx-families' },
    (o.families?.() ?? []).map((f) => h('option', { value: f }, [])),
  );
  const doSave = /** @type {HTMLButtonElement} */ (
    h('button', { type: 'button', class: 'vx-go' }, ['Save'])
  );
  const saveForm = h('div', { class: 'vx-save', hidden: true }, [
    famIn,
    famList,
    nameIn,
    h('span', { class: 'hint vx-small' }, ['→ Family / Name v1, v2, …']),
    doSave,
  ]);
  const saveMsg = h('p', { class: 'hint vx-small vx-saved' }, []);
  const trayBox = h('div', { class: 'vx-traybox', hidden: true }, [
    h('div', { class: 'vx-label' }, ['Kept']),
    tray,
    h('div', { class: 'xp-inline' }, [saveBtn, clearBtn]),
    saveForm,
  ]);
  const savedBox = h('div', {}, [saveMsg]);
  saveBtn.addEventListener('click', () => {
    saveForm.hidden = !saveForm.hidden;
    if (!saveForm.hidden) famIn.focus();
  });
  clearBtn.addEventListener('click', () => {
    kept.length = 0;
    saveForm.hidden = true;
    syncStars();
    buildTray();
  });
  doSave.addEventListener('click', async () => {
    if (!o.onSaveKept || !kept.length) return;
    doSave.disabled = true;
    saveMsg.textContent = 'Saving…';
    const msg = await o.onSaveKept(
      kept.map((k) => k.doc),
      famIn.value.trim(),
      nameIn.value.trim() || 'Variation',
    );
    doSave.disabled = false;
    saveMsg.textContent = msg;
    saveForm.hidden = true;
    if (msg.startsWith('Saved')) {
      // saved: the tray empties (no double saves); the stars go back to ☆
      kept.length = 0;
      syncStars();
      buildTray();
    }
  });
  const close = h('button', { type: 'button' }, ['Close']);
  const dialog = h('dialog', { class: 'xp vx' }, [
    h('h2', {}, ['Variants']),
    h('div', { class: 'vx-body' }, [
      grid,
      h('div', { class: 'vx-side' }, [
        h('p', { class: 'hint' }, [
          'Click a variation to use it (⌘Z undoes). ☆ keeps one in the tray — keep several, then Save kept. Top left is your current effect.',
        ]),
        h('div', { class: 'vx-label' }, ['Mode']),
        h('div', { class: 'vx-chips' }, modes),
        sliderLabel,
        h('div', { class: 'xp-inline' }, [amountIn, amountOut]),
        sliderHint,
        h('div', { class: 'vx-label' }, ['Vary']),
        h('div', { class: 'vx-chips' }, [
          chip('shape', 'Shape'),
          chip('motion', 'Motion'),
          chip('colour', 'Colour'),
        ]),
        h('div', { class: 'vx-label' }, ['Layers']),
        h('div', { class: 'vx-locks' }, layerLocks),
      ]),
    ]),
    trayBox,
    savedBox,
    status,
    h('div', { class: 'xp-buttons' }, [more, close]),
  ]);

  // ── variants + progressive rendering ──────────────────────────────────────────────────
  function regenerate(soon = false) {
    clearTimeout(timer);
    if (soon) {
      timer = setTimeout(() => regenerate(false), 220);
      return;
    }
    gen++;
    const opts = {
      mode: o.prefs.mode,
      amount: o.prefs.amount,
      wildness: o.prefs.wildness,
      lock: o.prefs.lock,
      lockedLayers: o.prefs.lockedLayers,
    };
    const docs = [
      o.doc,
      ...Array.from({ length: TILES - 1 }, (_, i) => makeVariant(o.doc, base + i, opts)),
    ];
    const keep = tiles;
    tiles = docs.map((doc, i) => {
      const old = keep[i];
      if (old && old.doc === doc) return old; // the current effect never changes
      const canvas =
        old?.canvas ?? /** @type {HTMLCanvasElement} */ (h('canvas', { width: tw, height: th }));
      const { effect, scale } = o.build(doc);
      return { canvas, doc, effect, scale, frames: frameList.map(() => null) };
    });
    if (!grid.childElementCount) {
      tiles.forEach((t, i) => {
        const tile = h(
          'button',
          {
            type: 'button',
            class: `vx-tile${i === 0 ? ' current' : ''}`,
            title: i === 0 ? 'Your current effect' : 'Use this variation',
          },
          [t.canvas, h('span', {}, [i === 0 ? 'Current' : `#${i}`])],
        );
        tile.addEventListener('click', () => {
          if (i === 0) return finish();
          o.onAdopt(tiles[i].doc);
          finish();
        });
        const cell = h('div', { class: 'vx-cell' }, [tile]);
        if (i > 0) {
          const star = h(
            'button',
            { type: 'button', class: 'vx-star', title: 'Keep this one (☆ → tray below)' },
            ['☆'],
          );
          star.addEventListener('click', () => toggleKeep(i));
          cell.append(star);
        }
        grid.append(cell);
      });
    }
    syncStars();
    fill(gen);
  }

  // ── keep several (D-117) ──────────────────────────────────────────────────────────────
  if (!o.prefs.kept) o.prefs.kept = [];
  const kept = o.prefs.kept;
  /** Is this tile's variation kept? @param {number} i */
  const keptIndex = (i) => kept.findIndex((k) => k.doc === tiles[i]?.doc);
  function syncStars() {
    grid.querySelectorAll('.vx-cell').forEach((cell, i) => {
      const on = i > 0 && keptIndex(i) >= 0;
      cell.classList.toggle('kept', on);
      const star = cell.querySelector('.vx-star');
      if (star) {
        star.textContent = on ? '★' : '☆';
        star.title = on ? 'Kept (tap to let it go)' : 'Keep this one (☆ → tray below)';
      }
    });
  }
  /** @param {number} i */
  function toggleKeep(i) {
    const at = keptIndex(i);
    if (at >= 0) kept.splice(at, 1);
    else {
      const t = tiles[i];
      const poster = /** @type {HTMLCanvasElement} */ (h('canvas', { width: tw, height: th }));
      const src = t.frames[posterAt] ?? t.frames.find(Boolean);
      const pc = /** @type {CanvasRenderingContext2D} */ (poster.getContext('2d'));
      pc.fillStyle = '#24222b';
      pc.fillRect(0, 0, tw, th);
      if (src) pc.drawImage(src, 0, 0);
      kept.push({ doc: t.doc, poster });
    }
    syncStars();
    buildTray();
  }
  function buildTray() {
    tray.replaceChildren(
      ...kept.map((k, j) => {
        const use = h('button', { type: 'button', class: 'vx-kept', title: 'Use this one' }, [
          k.poster,
        ]);
        use.addEventListener('click', () => {
          o.onAdopt(k.doc);
          finish();
        });
        const drop = h('button', { type: 'button', class: 'vx-drop', title: 'Let it go' }, ['✕']);
        drop.addEventListener('click', () => {
          kept.splice(j, 1);
          syncStars();
          buildTray();
        });
        return h('div', { class: 'vx-kept-cell' }, [use, drop]);
      }),
    );
    trayBox.hidden = !kept.length;
    saveBtn.textContent = `Save ${kept.length} kept…`;
    saveBtn.disabled = !kept.length || !o.onSaveKept;
    clearBtn.disabled = !kept.length;
  }

  /** Render one frame of one tile. @param {number} t @param {number} k */
  function renderOne(t, k) {
    const tile = tiles[t];
    const out = o.renderer.renderFrame(tile.effect, o.seed, frameList[k], {
      width: tw,
      height: th,
      scale: (tile.scale * tw) / o.frame.w,
      ...(o.snapFor?.(tile.doc, tw) ?? {}),
    });
    const shown = o.post ? o.post(out, tile.doc) : out;
    const c = /** @type {HTMLCanvasElement} */ (h('canvas', { width: tw, height: th }));
    const cx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    cx.imageSmoothingEnabled = shown === out; // pixel art stays hard-edged
    cx.drawImage(shown.canvas, 0, 0, shown.width, shown.height, 0, 0, tw, th);
    tile.frames[k] = c;
  }

  /** Posters first (every tile shows something fast), then the rest round robin. */
  function fill(/** @type {number} */ g) {
    /** @type {[number, number][]} */
    const todo = [];
    tiles.forEach((t, i) => {
      if (!t.frames[poster]) todo.push([i, poster]);
    });
    for (let k = 0; k < frameList.length; k++)
      tiles.forEach((t, i) => {
        if (k !== poster && !t.frames[k]) todo.push([i, k]);
      });
    const total = tiles.length * frameList.length;
    const step = () => {
      if (closed || g !== gen) return;
      const t0 = performance.now();
      while (todo.length && performance.now() - t0 < 14) {
        const [i, k] = /** @type {[number, number]} */ (todo.shift());
        renderOne(i, k);
      }
      status.textContent = todo.length
        ? `Rendering previews… ${Math.round(((total - todo.length) / total) * 100)} %`
        : '';
      if (todo.length) setTimeout(step, 0);
    };
    step();
  }

  /** Play every tile (the nearest rendered frame; the poster until more are ready). */
  const t0 = performance.now();
  const play = () => {
    if (closed) return;
    const f = Math.floor(((performance.now() - t0) / 1000) * o.timing.fps) % fc;
    const k = Math.min(frameList.length - 1, Math.floor(f / stride));
    for (const tile of tiles) {
      const src = tile.frames[k] ?? tile.frames[poster];
      const c = /** @type {CanvasRenderingContext2D} */ (tile.canvas.getContext('2d'));
      c.fillStyle = '#24222b';
      c.fillRect(0, 0, tw, th);
      if (src) c.drawImage(src, 0, 0);
    }
    raf = requestAnimationFrame(play);
  };

  function finish() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    dialog.close();
    dialog.remove();
    o.onClose?.();
  }
  more.addEventListener('click', () => {
    base += TILES;
    regenerate();
  });
  close.addEventListener('click', finish);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    finish();
  });
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation(); // the editor's shortcuts stay off while the grid is open
    if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
    if (e.key === 'r' || e.key === 'R') more.click();
  });
  document.body.append(dialog);
  /** @type {HTMLDialogElement} */ (dialog).showModal();
  regenerate();
  buildTray();
  raf = requestAnimationFrame(play);
  return { element: dialog, close: finish, more: () => more.click() };
}
