// @ts-check
/**
 * Preview cache — ELDR's RAM preview (D-077). Rendered frames are kept (as small canvases) for
 * the exact state they were rendered from; playback shows a cached frame instantly, so once a
 * loop is cached it plays in real time however heavy it is. While the editor sits idle, the
 * uncached frames are rendered in the background in small time slices (the timeline shows a
 * green bar under cached frames, as in After Effects). Any edit changes the key and starts over.
 */

/**
 * @typedef {object} PreviewCacheOptions
 * @property {(frame: number) => { canvas: any, width: number, height: number }} render
 *   renders one frame (the renderer's reused surface) for the CURRENT key
 * @property {(frame: number) => { canvas: any, width: number, height: number }} [renderBackground]
 *   the same with its OWN renderer (its surface must not be the one on screen)
 * @property {(cached: Set<number>) => void} [onChange] the set of cached frames changed
 * @property {number} [budgetBytes] memory cap (frames past it are not kept)
 * @property {(w: number, h: number) => any} [makeCanvas]
 */

/** @param {PreviewCacheOptions} o */
export function createPreviewCache(o) {
  const budget = o.budgetBytes ?? 700 * 1024 * 1024;
  const make =
    o.makeCanvas ??
    ((/** @type {number} */ w, /** @type {number} */ h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    });
  let key = '';
  /** @type {Map<number, { canvas: any }>} draw frame → copy */
  let frames = new Map();
  let bytes = 0;
  /** @type {number[]} frames that share a drawing map to the same draw frame */
  let drawOf = [];
  /** @type {any} */
  let timer = 0;
  let fillGen = 0;

  const changed = () => o.onChange?.(new Set(drawOf.flatMap((d, f) => (frames.has(d) ? [f] : []))));

  /** Copy a rendered surface into the cache. @param {number} d @param {any} surface */
  function keep(d, surface) {
    const size = surface.width * surface.height * 4;
    if (frames.has(d) || bytes + size > budget) return;
    const c = make(surface.width, surface.height);
    c.getContext('2d').drawImage(surface.canvas, 0, 0);
    frames.set(d, { canvas: c });
    bytes += size;
  }

  return {
    /**
     * Use the cache for this key (state + seed + size + resolution …). A new key empties it.
     * @param {string} k @param {number[]} draw draw frame of every frame (holds share drawings)
     */
    setKey(k, draw) {
      if (k === key && draw.length === drawOf.length) return;
      key = k;
      drawOf = draw;
      frames = new Map();
      bytes = 0;
      fillGen++;
      clearTimeout(timer);
      changed();
    },
    /** Forget everything (e.g. textures finished loading). */
    clear() {
      key = '';
      frames = new Map();
      bytes = 0;
      fillGen++;
      clearTimeout(timer);
      changed();
    },
    /**
     * The frame to show: from the cache, or rendered now (and kept).
     * @param {number} frame @returns {{ surface: { canvas: any }, cached: boolean }}
     */
    frame(frame) {
      const d = drawOf[frame] ?? frame;
      const hit = frames.get(d);
      if (hit) return { surface: hit, cached: true };
      const out = o.render(frame);
      keep(d, out);
      changed();
      // show the kept copy when there is one: the renderer's surface is reused later
      return { surface: frames.get(d) ?? out, cached: false };
    },
    /**
     * Render the missing frames in the background, a few ms at a time, after `delay` ms of
     * quiet (any new key or call restarts the wait). `busy()` pauses it (e.g. while dragging).
     * @param {{ delay?: number, slice?: number, busy?: () => boolean }} [opt]
     */
    fill(opt = {}) {
      clearTimeout(timer);
      const gen = ++fillGen;
      const slice = opt.slice ?? 14;
      const step = () => {
        if (gen !== fillGen) return;
        if (opt.busy?.()) {
          timer = setTimeout(step, 150);
          return;
        }
        const start = performance.now();
        let did = false;
        for (let f = 0; f < drawOf.length; f++) {
          const d = drawOf[f];
          if (frames.has(d)) continue;
          if (bytes >= budget) break;
          keep(d, (o.renderBackground ?? o.render)(f));
          did = true;
          if (performance.now() - start > slice) break;
        }
        if (did) {
          changed();
          timer = setTimeout(step, 0);
        }
      };
      timer = setTimeout(step, opt.delay ?? 300);
    },
    /** How many distinct drawings are cached / needed. */
    stats: () => ({ cached: frames.size, needed: new Set(drawOf).size, bytes }),
  };
}
