// @ts-check
/**
 * Preset Browser (D-120), like Particular's Designer: categories on the left (every built-in
 * family, your own families, ★ Favourites, 🕘 Recent), a search box, a grid of thumbnails, and a
 * big live preview of the selected preset on the right. Browsing never touches the creation:
 * only **Use** (or **Add as precomp**) does. Only the selected preset plays (Raul).
 *
 * Thumbnails render in the background, visible tiles first, and stay in a cache the editor
 * keeps, so the browser opens instantly the second time. Pen-friendly: big tiles, no hover.
 */

import { h } from '../dom.js';

const FAVS = 'eldr.presetFavs';
const RECENT = 'eldr.presetRecent';
const RECENT_MAX = 16;
const TILE = 124;
const PREVIEW = 300;
/** Selected presets whose animation frames stay cached. */
const ANIM_KEEP = 6;

/** @param {string} key @returns {string[]} */
const loadList = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
/** @param {string} key @param {string[]} v */
const saveList = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage blocked: not remembered
  }
};

/** Remember a preset as used (most recent first). @param {string} id */
export function markRecent(id) {
  saveList(RECENT, [id, ...loadList(RECENT).filter((x) => x !== id)].slice(0, RECENT_MAX));
}

/**
 * @typedef {object} BrowserPreset
 * @property {string} id      built-in id, or "my:Family/Name"
 * @property {string} name
 * @property {string} [blurb]
 * @property {string} [key]   My presets: the key (rename / delete)
 * @property {string} [stamp] changes when the saved preset changes (thumbnail cache)
 */
/** @typedef {{ label: string, mine?: boolean, presets: BrowserPreset[] }} BrowserGroup */

/**
 * @typedef {object} BrowserOptions
 * @property {() => BrowserGroup[]} groups  (re-read after a rename / delete)
 * @property {'use' | 'precomp'} mode  the main button: Use (load it) or Add as precomp
 * @property {string} [current]  the preset now open (selected first)
 * @property {(id: string) => { effect: any, scale: number, timing: any, seed: number } | null} build
 * @property {any} renderer  a renderer whose surface is not on screen
 * @property {{ w: number, h: number }} frame
 * @property {Map<string, any>} cache  kept by the editor between opens
 * @property {(id: string) => void} onUse
 * @property {(id: string, name: string, keepOwn: boolean) => void} onPrecomp
 * @property {(key: string, name: string) => Promise<string>} [onRename]
 * @property {(key: string) => Promise<string>} [onDelete]
 * @property {() => void} [onManage]  open the Families manager
 * @property {() => void} [onClose]
 */

/** @param {BrowserOptions} o */
export function openPresetBrowser(o) {
  let groups = o.groups();
  const favs = new Set(loadList(FAVS));
  /** category shown: a group label, '★' favourites, '🕘' recent, '' everything */
  let category = '';
  let query = '';
  /** @type {BrowserPreset | null} */
  let sel = null;
  let closed = false;
  const aspect = o.frame.w / o.frame.h;
  const size = (/** @type {number} */ s) =>
    aspect >= 1 ? { w: s, h: Math.round(s / aspect) } : { w: Math.round(s * aspect), h: s };
  const tile = size(TILE);
  const big = size(PREVIEW);

  const all = () => groups.flatMap((g) => g.presets.map((p) => ({ p, g })));
  const byId = (/** @type {string} */ id) => all().find((x) => x.p.id === id) ?? null;
  const cacheKey = (/** @type {BrowserPreset} */ p) =>
    `${p.id}|${p.stamp ?? ''}|${o.frame.w}x${o.frame.h}`;

  // ── layout ───────────────────────────────────────────────────────────────────────────────
  const search = /** @type {HTMLInputElement} */ (
    h('input', {
      type: 'search',
      class: 'fam-input pb-search',
      placeholder: 'Find a preset…',
      'aria-label': 'Find a preset',
    })
  );
  const cats = h('nav', { class: 'pb-cats', 'aria-label': 'Categories' }, []);
  const grid = h('div', { class: 'pb-grid' }, []);
  const view = /** @type {HTMLCanvasElement} */ (
    h('canvas', { class: 'pb-view', width: big.w, height: big.h })
  );
  const title = h('div', { class: 'pb-title' }, []);
  const blurb = h('p', { class: 'hint pb-blurb' }, []);
  const status = h('p', { class: 'xp-status pb-status' }, []);
  const keep = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: true }));
  const useBtn = /** @type {HTMLButtonElement} */ (
    h(
      'button',
      { type: 'button', class: 'xp-go', title: 'Load it (⌘Z brings your creation back)' },
      ['Use'],
    )
  );
  const preBtn = /** @type {HTMLButtonElement} */ (
    h('button', { type: 'button', title: 'Put it into your creation as ONE layer' }, [
      'Add as precomp',
    ])
  );
  const cancel = h('button', { type: 'button' }, ['Cancel']);
  const manage = o.onManage
    ? h('button', { type: 'button', class: 'fam-btn', title: 'Rename, move, export packs' }, [
        'Manage families…',
      ])
    : null;
  const primary = o.mode === 'use' ? [preBtn, useBtn] : [useBtn, preBtn];
  if (o.mode === 'precomp') {
    preBtn.className = 'xp-go';
    useBtn.className = '';
  }
  const dialog = /** @type {HTMLDialogElement} */ (
    h('dialog', { class: 'xp pb' }, [
      h('div', { class: 'pb-head' }, [
        h('h2', {}, [o.mode === 'use' ? 'Presets' : 'Add a preset as a precomp']),
        search,
        ...(manage ? [manage] : []),
      ]),
      h('div', { class: 'pb-body' }, [
        cats,
        grid,
        h('aside', { class: 'pb-side' }, [
          h('div', { class: 'pb-viewbox' }, [view]),
          title,
          blurb,
          h(
            'label',
            {
              class: 'pp-keep',
              title:
                'For Add as precomp: it keeps its own speed, length (loops keep looping), wind-up, flash and size.',
            },
            [keep, ' Precomp keeps its own timing and size'],
          ),
          status,
          h('div', { class: 'xp-buttons pb-buttons' }, [cancel, ...primary]),
        ]),
      ]),
    ])
  );

  // ── categories ───────────────────────────────────────────────────────────────────────────
  function drawCats() {
    const recent = loadList(RECENT).filter((id) => byId(id));
    /** @type {[string, string, number][]} */
    const items = [
      ['', 'All', all().length],
      ['★', '★ Favourites', [...favs].filter((id) => byId(id)).length],
      ['🕘', '🕘 Recent', recent.length],
      ...groups.map(
        (g) => /** @type {[string, string, number]} */ ([g.label, g.label, g.presets.length]),
      ),
    ];
    let mineHeader = false;
    cats.replaceChildren(
      ...items.flatMap(([id, label, n]) => {
        const g = groups.find((x) => x.label === id);
        const out = [];
        if (g?.mine && !mineHeader) {
          mineHeader = true;
          out.push(h('div', { class: 'vx-label pb-sep' }, ['My presets']));
        }
        const b = h('button', { type: 'button', class: `pb-cat${id === category ? ' on' : ''}` }, [
          h('span', {}, [
            g?.mine ? label.replace(/^My presets(?: · )?/, '') || 'No family' : label,
          ]),
          h('span', { class: 'fam-count' }, [String(n)]),
        ]);
        b.addEventListener('click', () => {
          category = id;
          drawCats();
          drawGrid();
        });
        out.push(b);
        return out;
      }),
    );
  }

  // ── grid ─────────────────────────────────────────────────────────────────────────────────
  /** @type {Map<string, HTMLCanvasElement>} tile canvases by preset id */
  let tiles = new Map();
  function shown() {
    const q = query.trim().toLowerCase();
    let list = all();
    if (category === '★') list = list.filter((x) => favs.has(x.p.id));
    else if (category === '🕘') {
      const r = loadList(RECENT);
      list = r.map((id) => byId(id)).filter((x) => x !== null);
    } else if (category) list = list.filter((x) => x.g.label === category);
    if (q)
      list = list.filter(({ p, g }) =>
        `${g.label} ${p.name} ${p.blurb ?? ''}`.toLowerCase().includes(q),
      );
    return list;
  }
  function drawGrid() {
    tiles = new Map();
    const list = shown();
    if (!list.length) {
      grid.replaceChildren(h('p', { class: 'hint' }, ['Nothing here.']));
      return;
    }
    grid.replaceChildren(
      ...list.map(({ p, g }) => {
        const c = /** @type {HTMLCanvasElement} */ (h('canvas', { width: tile.w, height: tile.h }));
        tiles.set(p.id, c);
        paintPoster(p, c);
        const card = h(
          'button',
          {
            type: 'button',
            class: `pb-tile${sel?.id === p.id ? ' on' : ''}`,
            title: p.blurb ?? p.name,
          },
          [c, h('span', { class: 'pb-name' }, [p.name])],
        );
        card.dataset.id = p.id;
        card.addEventListener('click', () => select(p));
        card.addEventListener('dblclick', () => (o.mode === 'use' ? use() : addPre()));
        const fav = h(
          'button',
          {
            type: 'button',
            class: `pb-fav${favs.has(p.id) ? ' on' : ''}`,
            title: favs.has(p.id) ? 'Favourite (tap to remove)' : 'Add to Favourites',
          },
          [favs.has(p.id) ? '★' : '☆'],
        );
        fav.addEventListener('click', () => {
          if (favs.has(p.id)) favs.delete(p.id);
          else favs.add(p.id);
          saveList(FAVS, [...favs]);
          drawCats();
          if (category === '★') drawGrid();
          else {
            fav.textContent = favs.has(p.id) ? '★' : '☆';
            fav.classList.toggle('on', favs.has(p.id));
          }
        });
        const tools = [fav];
        if (g.mine && p.key) {
          const key = p.key;
          if (o.onRename) {
            const ren = h('button', { type: 'button', class: 'pb-mini', title: 'Rename' }, ['✎']);
            ren.addEventListener('click', async () => {
              const to = prompt('New name:', p.name)?.trim();
              if (!to || to === p.name || !o.onRename) return;
              status.textContent = await o.onRename(key, to);
              refresh();
            });
            tools.push(ren);
          }
          if (o.onDelete) {
            const del = h('button', { type: 'button', class: 'pb-mini', title: 'Delete' }, ['✕']);
            del.addEventListener('click', async () => {
              if (!o.onDelete || !confirm(`Delete “${p.name}”?`)) return;
              status.textContent = await o.onDelete(key);
              if (sel?.id === p.id) sel = null;
              refresh();
            });
            tools.push(del);
          }
        }
        return h('div', { class: 'pb-cell' }, [card, h('div', { class: 'pb-tools' }, tools)]);
      }),
    );
    queuePosters(list.map((x) => x.p));
  }
  function refresh() {
    groups = o.groups();
    if (sel && !byId(sel.id)) sel = null;
    drawCats();
    drawGrid();
    showSelected();
  }

  // ── rendering ────────────────────────────────────────────────────────────────────────────
  /** @type {Map<string, { effect: any, scale: number, timing: any, seed: number } | null>} */
  const built = new Map();
  const buildOf = (/** @type {BrowserPreset} */ p) => {
    if (!built.has(p.id)) {
      let b = null;
      try {
        b = o.build(p.id);
      } catch {
        b = null;
      }
      built.set(p.id, b);
    }
    return built.get(p.id) ?? null;
  };
  /** Render one frame of a preset into a new canvas. @param {BrowserPreset} p @param {number} f @param {{ w: number, h: number }} s */
  function renderAt(p, f, s) {
    const b = buildOf(p);
    const c = /** @type {HTMLCanvasElement} */ (h('canvas', { width: s.w, height: s.h }));
    if (!b) return c;
    const out = o.renderer.renderFrame(b.effect, b.seed, f, {
      width: s.w,
      height: s.h,
      scale: (b.scale * s.w) / o.frame.w,
    });
    c.getContext('2d')?.drawImage(out.canvas, 0, 0, out.width, out.height, 0, 0, s.w, s.h);
    return c;
  }
  const posterFrame = (/** @type {any} */ timing) => Math.floor(timing.frameCount * 0.4);
  /** @param {BrowserPreset} p @param {HTMLCanvasElement} c */
  function paintPoster(p, c) {
    const hit = o.cache.get(`poster|${cacheKey(p)}`);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#24222b';
    ctx.fillRect(0, 0, c.width, c.height);
    if (hit) ctx.drawImage(hit, 0, 0);
  }
  /** @type {BrowserPreset[]} */
  let posterQueue = [];
  let posterTimer = 0;
  /** Posters of the tiles shown, in order (visible first: the grid order is top to bottom). */
  function queuePosters(/** @type {BrowserPreset[]} */ list) {
    posterQueue = list.filter((p) => !o.cache.has(`poster|${cacheKey(p)}`));
    clearTimeout(posterTimer);
    posterTimer = window.setTimeout(stepPosters, 30);
  }
  function stepPosters() {
    if (closed) return;
    const t0 = performance.now();
    while (posterQueue.length && performance.now() - t0 < 24) {
      const p = /** @type {BrowserPreset} */ (posterQueue.shift());
      const b = buildOf(p);
      const img = b ? renderAt(p, posterFrame(b.timing), tile) : null;
      if (img) o.cache.set(`poster|${cacheKey(p)}`, img);
      const c = tiles.get(p.id);
      if (c) paintPoster(p, c);
    }
    status.textContent = posterQueue.length ? `Drawing previews… ${posterQueue.length} left` : '';
    if (posterQueue.length) posterTimer = window.setTimeout(stepPosters, 0);
  }

  // ── the selected preset: big live preview (and its tile plays) ───────────────────────────
  /** @type {{ p: BrowserPreset, frames: (HTMLCanvasElement | null)[], list: number[], fps: number } | null} */
  let anim = null;
  let animTimer = 0;
  let raf = 0;
  /** @param {BrowserPreset} p */
  function select(p) {
    sel = p;
    for (const el of grid.querySelectorAll('.pb-tile'))
      el.classList.toggle('on', /** @type {HTMLElement} */ (el).dataset.id === p.id);
    showSelected();
  }
  function showSelected() {
    useBtn.disabled = !sel;
    preBtn.disabled = !sel;
    title.textContent = sel?.name ?? 'Pick a preset';
    blurb.textContent =
      sel?.blurb ?? (sel ? '' : 'Tap a preset to preview it. Nothing changes until you press Use.');
    clearTimeout(animTimer);
    if (!sel) {
      anim = null;
      return;
    }
    const b = buildOf(sel);
    if (!b) {
      anim = null;
      blurb.textContent = 'This preset could not be loaded.';
      return;
    }
    const k = `anim|${cacheKey(sel)}`;
    let a = o.cache.get(k);
    if (!a) {
      const fc = b.timing.frameCount;
      const stride = Math.max(1, Math.ceil(fc / 36));
      const list = Array.from({ length: Math.ceil(fc / stride) }, (_, i) => i * stride);
      a = { frames: list.map(() => null), list, fps: b.timing.fps / stride };
      o.cache.set(k, a);
      // keep only the last few animations
      const anims = [...o.cache.keys()].filter((x) => x.startsWith('anim|'));
      for (const old of anims.slice(0, Math.max(0, anims.length - ANIM_KEEP))) o.cache.delete(old);
    }
    anim = { p: sel, ...a };
    const p = sel;
    const fill = () => {
      if (closed || !anim || anim.p !== p) return;
      const t0 = performance.now();
      while (performance.now() - t0 < 20) {
        const i = anim.frames.findIndex((f) => !f);
        if (i < 0) return;
        anim.frames[i] = renderAt(p, anim.list[i], big);
      }
      animTimer = window.setTimeout(fill, 0);
    };
    fill();
  }
  const t0 = performance.now();
  const play = () => {
    if (closed) return;
    const vctx = view.getContext('2d');
    if (vctx) {
      vctx.fillStyle = '#1b1c22';
      vctx.fillRect(0, 0, view.width, view.height);
      if (anim) {
        const n = anim.frames.length;
        const i = Math.floor(((performance.now() - t0) / 1000) * anim.fps) % n;
        // the nearest frame already drawn (the animation fills in as it renders)
        let f = anim.frames[i];
        for (let k = 1; !f && k < n; k++) f = anim.frames[(i - k + n) % n];
        if (f) {
          vctx.drawImage(f, 0, 0);
          const tc = tiles.get(anim.p.id)?.getContext('2d');
          if (tc) {
            tc.fillStyle = '#24222b';
            tc.fillRect(0, 0, tile.w, tile.h);
            tc.drawImage(f, 0, 0, big.w, big.h, 0, 0, tile.w, tile.h);
          }
        }
      }
    }
    raf = requestAnimationFrame(play);
  };

  // ── actions ──────────────────────────────────────────────────────────────────────────────
  function finish() {
    if (closed) return;
    closed = true;
    clearTimeout(posterTimer);
    clearTimeout(animTimer);
    cancelAnimationFrame(raf);
    dialog.close();
  }
  function use() {
    if (!sel) return;
    const id = sel.id;
    markRecent(id);
    finish();
    o.onUse(id);
  }
  function addPre() {
    if (!sel) return;
    const { id, name } = sel;
    markRecent(id);
    finish();
    o.onPrecomp(id, name, keep.checked);
  }
  useBtn.addEventListener('click', use);
  preBtn.addEventListener('click', addPre);
  cancel.addEventListener('click', finish);
  manage?.addEventListener('click', () => {
    finish();
    o.onManage?.();
  });
  search.addEventListener('input', () => {
    query = search.value;
    drawGrid();
  });
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation(); // the editor's shortcuts stay off while browsing
    if (e.key === 'Enter' && sel && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (o.mode === 'use') use();
      else addPre();
    }
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    finish();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    o.onClose?.();
  });

  // start on the current preset's category, with it selected
  const cur = o.current ? byId(o.current) : null;
  if (cur) {
    category = cur.g.label;
    sel = cur.p;
  }
  document.body.append(dialog);
  dialog.showModal();
  drawCats();
  drawGrid();
  showSelected();
  raf = requestAnimationFrame(play);
  search.focus();
  // the selected tile scrolled into view
  grid.querySelector('.pb-tile.on')?.scrollIntoView({ block: 'nearest' });
  return { element: dialog, close: finish };
}
