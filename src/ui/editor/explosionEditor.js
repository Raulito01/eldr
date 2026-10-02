// @ts-check
/**
 * ELDR editor (explosion template): layer panel, layer settings + transform, inspector,
 * viewport with transform handles, timeline, undo/redo, presets, files, export.
 * Moved out of test-pages in 3.6b (D-053); the page just calls startExplosionEditor().
 */

import { animationLength, frameTime } from '../../core/timing.js';
import { apply as applyMat, invert, worldMatrices } from '../../core/transform2d.js';
import {
  applyValues,
  applyValuesMany,
  isAnimatedParam,
  keyHere,
  layerHasParam,
  mixedParams,
  toggleKey,
  toggleKeyMany,
  toggleStopwatch,
  toggleStopwatchMany,
} from '../../effects/animEdit.js';
import {
  aimedParams,
  boltEnds,
  endForWorld,
  isBoltType,
  targetCandidates,
  targetPoint,
} from '../../effects/boltTarget.js';
import { COMPOSED_PRESET_GROUPS } from '../../effects/composedPresets.js';
import {
  alignLayerTime,
  centreAnchor,
  centreLayer,
  jumpKey,
  keyFrames,
  layerFrames,
  trimLayerTime,
} from '../../effects/editorOps.js';
import {
  buildExplosion,
  createExplosion,
  EXPLOSION_SCHEMA,
} from '../../effects/explosion/explosion.js';
import {
  createExplosionFromPreset,
  EXPLOSION_PRESETS,
  explosionPreset,
} from '../../effects/explosion/presets.js';
import { applyFollow, makeFollow, pathSources } from '../../effects/followPath.js';
import {
  allKeys,
  copyKeys,
  deleteKeys,
  moveKeys,
  pasteKeys,
  scaleKeys,
} from '../../effects/keyEdit.js';
import {
  applyInterp,
  defOf,
  dragKeyHandle,
  isNumericParam,
  keyVelocity,
  offsetKeyValues,
  setVelocity,
} from '../../effects/keyInterp.js';
import { layerAt } from '../../effects/layerAnimation.js';
import {
  LAYER_SETTINGS_SCHEMA,
  layerSettingsPatch,
  layerSettingsValues,
} from '../../effects/layerSettings.js';
import {
  addLayer,
  addMask,
  duplicateLayer,
  matteCandidates,
  moveLayer,
  precompose,
  removeLayer,
  removeMask,
  reseedLayer,
  setCompLayers,
  setMatte,
  setParent,
  updateLayer,
  updateMask,
} from '../../effects/layerStack.js';
import {
  isAdjustmentType,
  isEmitterType,
  LAYER_TYPE_LABELS,
  LAYER_TYPES,
} from '../../effects/layerTypes.js';
import { maskParamLabel } from '../../effects/maskParams.js';
import {
  copyLayerSettings,
  pasteGroups,
  pasteLayerSettings,
} from '../../effects/settingsClipboard.js';
import { fileStem } from '../../export/run.js';
import {
  createUserPresets,
  EFFECT_FILE_EXT,
  parseExplosion,
  serializeExplosion,
} from '../../project/index.js';
import { createCanvas2DBackend, createRenderer } from '../../render/index.js';
import { MATTE_LABELS, MATTE_MODES } from '../../render/masks.js';
import {
  paletteFor,
  paletteToStops,
  parseHexPalette,
  pixelate,
  pixelGrid,
  readPixel,
  shimmerMap,
  snapSettings,
  upscaleNearest,
} from '../../render/pixel.js';
import { RAMP_PRESETS, rampPreset } from '../../render/rampPresets.js';
import { decodeAssets, setTextureFrames } from '../../render/textures.js';
import { h } from '../dom.js';
import { createExportPanel, download } from '../exportPanel.js';
import { bindFrameSize } from '../frameSize.js';
import { createHistory } from '../history.js';
import { buildInspector } from '../inspector.js';
import { createLayerList } from '../layerList.js';
import { createShortcuts } from '../shortcuts.js';
import { clampSize, makeSplitter } from '../splitters.js';
import { createTimeline } from '../timeline.js';
import { createViewport } from '../viewport.js';
import { openCheatSheet } from './cheatSheet.js';
import { editorShortcutList } from './editorShortcuts.js';
import { dragTo, gizmoGeometry, hitTest, paintGizmo, startDrag } from './gizmo.js';
import { createLayerTimeline } from './layerTimeline.js';
import {
  CORNERS,
  dragMask,
  handleAt,
  insideMask,
  maskOutline,
  maskSchema,
  maskToLayer,
  maskValues,
  moveHandle,
  moveVertex,
  parseMaskFix,
  pathFromPoints,
  toggleSmooth,
  vertexAt,
} from './maskPanel.js';
import { openPasteDialog } from './pasteDialog.js';
import { createPreviewCache } from './previewCache.js';
import { openRampPicker } from './rampPicker.js';
import { cleanSelection, clickSelect } from './selection.js';
import { importTextureFiles, mountTexturePanel } from './texturePanel.js';
import { transformPatch, transformSchema, transformValues } from './transformPanel.js';
import { openVariantsPanel } from './variantsPanel.js';
import { openVelocityDialog } from './velocityDialog.js';

/** Start the editor in the current page (expects the explosion.html markup). */
export function startExplosionEditor() {
  /** @param {string} id */
  const $ = (id) => /** @type {any} */ (document.getElementById(id));

  const renderer = createRenderer({ backend: createCanvas2DBackend(), layerTypes: LAYER_TYPES });
  /** The whole document (main comp + precomps). */
  let root = createExplosion();
  /** Precomps opened, outermost first (3.6e); empty = editing the main comp. @type {string[]} */
  let compPath = [];
  /**
   * What the editor works on: the main comp, or the opened precomp's layers (with everything
   * else of the document). Every edit goes through commit(), which writes it back into `root`.
   */
  let state = root;
  /** View of the document for the opened comp. @param {typeof root} r */
  const viewOf = (r) => {
    const id = compPath.at(-1);
    const c = id ? r.comps?.[id] : undefined;
    return c ? { ...r, layers: c.layers } : r;
  };
  /** Write an edited view back into the document. @param {typeof root} view */
  const rootOf = (view) => {
    const id = compPath.at(-1);
    if (!id) return view;
    return setCompLayers({ ...view, layers: root.layers }, id, view.layers);
  };
  /** The ACTIVE layer (inspector, handles). */
  let selected = 'fireball';
  /** Every selected layer, active included (3.7b multi-select). @type {string[]} */
  let selIds = ['fireball'];
  let seed = 482913;
  const frame = { w: 512, h: 512 };

  // View settings are remembered in this browser (D-079): resolution, background, overlays.
  const VIEW_PREFS = 'eldr.viewPrefs';
  /** @type {{ res?: number, bg?: string, customColor?: string, show?: Record<string, boolean>, panels?: Record<string, number> }} */
  let viewPrefs = {};
  try {
    viewPrefs = JSON.parse(localStorage.getItem(VIEW_PREFS) ?? '{}') ?? {};
  } catch {
    viewPrefs = {};
  }
  const saveViewPrefs = (/** @type {Record<string, any>} */ patch) => {
    viewPrefs = { ...viewPrefs, ...patch };
    try {
      localStorage.setItem(VIEW_PREFS, JSON.stringify(viewPrefs));
    } catch {
      // storage blocked: settings just aren't remembered
    }
  };
  // ── Resizable panels (D-080) ───────────────────────────────────────────────────────────
  const layoutEl = /** @type {HTMLElement} */ (document.querySelector('.layout'));
  const PANEL_DEFAULTS = { left: 280, right: 360, timeline: 220 };
  /** @type {{ left: number, right: number, timeline: number }} */
  const panels = { ...PANEL_DEFAULTS, ...(viewPrefs.panels ?? {}) };
  const applyPanels = () => {
    if (!layoutEl) return;
    layoutEl.style.setProperty('--left-w', `${panels.left}px`);
    layoutEl.style.setProperty('--right-w', `${panels.right}px`);
    layoutEl.style.setProperty('--ltl-h', `${panels.timeline}px`);
  };
  applyPanels();
  if (layoutEl) {
    const MIN_VIEW_W = 440;
    const MIN_VIEW_H = 200;
    const side = (
      /** @type {'left' | 'right' | 'timeline'} */ key,
      /** @type {number} */ sign,
    ) => ({
      get: () => panels[key],
      set: (/** @type {number} */ px) => {
        panels[key] = px;
        applyPanels();
      },
      reset: () => {
        panels[key] = PANEL_DEFAULTS[key];
        applyPanels();
      },
      done: () => saveViewPrefs({ panels: { ...panels } }),
      sign,
    });
    const room = () => layoutEl.getBoundingClientRect();
    makeSplitter(/** @type {HTMLElement} */ ($('split-left')), {
      axis: 'x',
      ...side('left', 1),
      limits: () => [160, room().width - panels.right - MIN_VIEW_W - 12],
    });
    makeSplitter(/** @type {HTMLElement} */ ($('split-right')), {
      axis: 'x',
      ...side('right', -1),
      limits: () => [260, room().width - panels.left - MIN_VIEW_W - 12],
    });
    // a smaller window never pushes the canvas off screen: panels give way
    window.addEventListener('resize', () => {
      const r = room();
      panels.left = clampSize(panels.left, 160, r.width - panels.right - MIN_VIEW_W - 12);
      panels.right = clampSize(panels.right, 260, r.width - panels.left - MIN_VIEW_W - 12);
      panels.timeline = clampSize(panels.timeline, 48, r.height - MIN_VIEW_H - 120);
      applyPanels();
    });
    makeSplitter(/** @type {HTMLElement} */ ($('split-timeline')), {
      axis: 'y',
      ...side('timeline', -1),
      limits: () => [
        48,
        room().height - MIN_VIEW_H - 6 - ($('timeline-host')?.getBoundingClientRect().height ?? 0),
      ],
    });
  }

  const viewport = createViewport($('viewport-host'), {
    frameW: frame.w,
    frameH: frame.h,
    prefs: viewPrefs,
    onPrefsChange: (p) => {
      saveViewPrefs(p);
      if (!!p.show.shimmer !== shimmerOn) {
        shimmerOn = !!p.show.shimmer;
        show();
      }
    },
  });

  // ── Preview: RAM-preview cache + preview resolution (D-077) ────────────────────────────
  /** Second renderer for background caching (its surface is never the one on screen). */
  const bgRenderer = createRenderer({ backend: createCanvas2DBackend(), layerTypes: LAYER_TYPES });
  /** Preview resolution: 1 = Full, 0.5 = Half, 0.25 = Quarter (exports are always full). */
  let previewRes = [1, 0.5, 0.25].includes(Number(viewPrefs.res)) ? Number(viewPrefs.res) : 1;
  /** @type {WeakMap<object, number>} */
  const rootIds = new WeakMap();
  let nextRootId = 1;
  /** The built effect for the current key (built once, reused by every frame). */
  let built = /** @type {{ key: string, effect: any, scale: number, pixel: any } | null} */ (null);
  const previewKey = () => {
    let id = rootIds.get(root);
    if (!id) {
      id = nextRootId++;
      rootIds.set(root, id);
    }
    return `${id}|${compPath.join('/')}|${seed}|${frame.w}x${frame.h}|${previewRes}`;
  };
  // ── Pixel Mode (C1, D-085): the finished frame → pixel art (preview, variants, export) ──
  /**
   * Pixel settings + palette of a document (the palette is fixed per effect: no flicker).
   * @param {any} doc @returns {{ p: ReturnType<typeof readPixel>, palette: string[] | null } | null}
   */
  /** @type {WeakMap<object, any>} */
  const pixelCache = new WeakMap();
  /** Shimmer check view (C2, a viewport toggle shown in Pixel Mode). */
  let shimmerOn = !!viewPrefs.show?.shimmer;
  const pixelOf = (/** @type {any} */ doc) => {
    if (pixelCache.has(doc)) return pixelCache.get(doc);
    const p = readPixel(doc.globals ?? {});
    const px = p.enabled ? { p, palette: paletteFor(p, doc) } : null;
    pixelCache.set(doc, px);
    return px;
  };
  /** @type {WeakMap<object, HTMLCanvasElement>} one scratch canvas per renderer */
  const pixelCanvases = new WeakMap();
  /**
   * A rendered surface → its pixel-art version at the native pixel size.
   * @param {{ ctx: any, width: number, height: number }} out @param {NonNullable<ReturnType<typeof pixelOf>>} px
   * @param {object} owner whose scratch canvas to use
   */
  const toPixelSurface = (out, px, owner) => {
    const img = out.ctx.getImageData(0, 0, out.width, out.height);
    const art = pixelate(
      { width: out.width, height: out.height, data: img.data },
      px.p,
      px.palette,
    );
    let c = pixelCanvases.get(owner);
    if (!c) {
      c = document.createElement('canvas');
      pixelCanvases.set(owner, c);
    }
    c.width = art.width;
    c.height = art.height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    ctx.putImageData(new ImageData(art.data, art.width, art.height), 0, 0);
    return { canvas: c, ctx, width: art.width, height: art.height };
  };
  /** @param {ReturnType<typeof createRenderer>} r @param {number} f */
  const renderWith = (r, f) => {
    const key = previewKey();
    if (built?.key !== key) {
      const b = buildExplosion(state);
      built = { key, effect: b.effect, scale: b.scale, pixel: pixelOf(root) };
    }
    const w = Math.max(1, Math.round(frame.w * previewRes));
    const out = r.renderFrame(built.effect, seed, f, {
      width: w,
      height: Math.max(1, Math.round(frame.h * previewRes)),
      scale: built.scale * previewRes,
      ...(built.pixel ? snapSettings(built.pixel.p, w) : {}),
    });
    return built.pixel ? toPixelSurface(out, built.pixel, r) : out;
  };
  const previewCache = createPreviewCache({
    render: (f) => renderWith(renderer, f),
    renderBackground: (f) => renderWith(bgRenderer, f),
    onChange: (set) => timeline?.setCached(set),
  });
  /** Pointer drags in progress (no background caching meanwhile). */
  const dragging = () => !!(gizmoDrag || maskDrag || boltDrag || penDragging);

  // Resolution menu (AE style): faster previews at lower resolution; exports stay full.
  const resSelect = /** @type {HTMLSelectElement} */ (
    h(
      'select',
      {
        class: 'vp-res',
        title:
          'Preview resolution: Half / Quarter render 4× / 16× fewer pixels — much faster playback. Exports are always full resolution.',
      },
      [
        h('option', { value: '1' }, ['Full']),
        h('option', { value: '0.5' }, ['Half']),
        h('option', { value: '0.25' }, ['Quarter']),
      ],
    )
  );
  resSelect.value = String(previewRes);
  resSelect.addEventListener('change', () => {
    previewRes = Number(resSelect.value) || 1;
    saveViewPrefs({ res: previewRes });
    show();
  });
  viewport.addTool(resSelect);

  function show() {
    // imported textures (4.Pb2) are decoded once; redraw when they are ready
    decodeAssets(root.assets, () => {
      previewCache.clear();
      show();
    });
    const start = performance.now();
    const t = state.timing;
    previewCache.setKey(
      previewKey(),
      Array.from({ length: t.frameCount }, (_, f) => frameTime(t, f).drawFrame),
    );
    const px = readPixel(root.globals);
    // Shimmer check (C2): neighbours first (the renderer's surface is reused), then this frame
    const flicker = px.enabled && shimmerOn ? neighbourArt() : null;
    const { surface, cached } = previewCache.frame(timeline.getFrame());
    const res = previewRes === 1 ? '' : previewRes === 0.5 ? ' · ½ res' : ' · ¼ res';
    let shown = surface;
    let shimmerNote = '';
    if (flicker) {
      const r = shimmerOverlay(surface, flicker.prev, flicker.next);
      shown = r.surface;
      shimmerNote = `shimmer ${r.count} px`;
    }
    viewport.present(shown, {
      pixelGrid: px.enabled ? pixelGrid(frame.w, frame.h, px.size) : null,
      renderMs: performance.now() - start,
      note: [
        cached
          ? `cached${res}`
          : res
            ? `render ${(performance.now() - start).toFixed(1)} ms${res}`
            : '',
        shimmerNote,
      ]
        .filter(Boolean)
        .join(' · '),
    });
    if (!timeline.isPlaying())
      previewCache.fill({
        busy: () =>
          timeline.isPlaying() || dragging() || !!document.querySelector('dialog.vx[open]'),
      });
  }

  /** The art of the drawings before and after the current one (loops wrap), or null. */
  function neighbourArt() {
    const t = state.timing;
    const fc = t.frameCount;
    const f = timeline.getFrame();
    const d = frameTime(t, f).drawFrame;
    /** @param {number} dir */
    const find = (dir) => {
      for (let k = 1; k < fc; k++) {
        let i = f + dir * k;
        if (i < 0 || i >= fc) {
          if (!t.loop) return -1;
          i = (i + fc) % fc;
        }
        if (frameTime(t, i).drawFrame !== d) return i;
      }
      return -1;
    };
    const a = find(-1);
    const b = find(1);
    if (a < 0 || b < 0) return null;
    const grab = (/** @type {number} */ i) => {
      const s = previewCache.frame(i).surface;
      const c = s.canvas.getContext('2d');
      const img = c.getImageData(0, 0, s.canvas.width, s.canvas.height);
      return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
    };
    return { prev: grab(a), next: grab(b) };
  }
  /** @type {HTMLCanvasElement | null} */
  let shimmerCanvas = null;
  /**
   * This frame with its flickering pixels in magenta (the rest dimmed).
   * @param {any} surface @param {any} prev @param {any} next
   */
  function shimmerOverlay(surface, prev, next) {
    const c = surface.canvas;
    const img = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const cur = { width: img.width, height: img.height, data: img.data };
    if (prev.width !== cur.width || next.width !== cur.width) return { surface, count: 0 };
    const { mask, count } = shimmerMap(prev, cur, next);
    for (let i = 0; i < mask.length; i++) {
      const q = i * 4;
      if (mask[i]) img.data.set([255, 0, 255, 255], q);
      else img.data[q + 3] = Math.round(img.data[q + 3] * 0.45);
    }
    shimmerCanvas ??= document.createElement('canvas');
    shimmerCanvas.width = img.width;
    shimmerCanvas.height = img.height;
    /** @type {CanvasRenderingContext2D} */ (shimmerCanvas.getContext('2d')).putImageData(
      img,
      0,
      0,
    );
    return { surface: { canvas: shimmerCanvas }, count };
  }

  const timeline = createTimeline($('timeline-host'), {
    timing: { ...state.timing, phases: buildExplosion(state).effect.timing.phases },
    onFrame: () => {
      show();
      if (layerTimeline) syncLayerFields();
    },
    onTimingChange: (timing) => {
      commit({ ...state, timing: { ...timing } }, 'timing', { quiet: true });
    },
    keyboard: false, // the editor's shortcut list handles Space / arrows / Home (3.7d)
  });

  // ── Layer timeline (3.6c): bars, keys, impact marker ───────────────────────────────────
  /** @param {string} layerId @param {string} pid */
  const paramLabel = (layerId, pid) => {
    const l = state.layers.find((x) => x.id === layerId);
    if (pid === 'layer.opacity') return 'Opacity';
    if (pid.startsWith('mask.') && l) return maskParamLabel(l, pid);
    if (pid === 'follow.progress') return 'Follow · Progress';
    if (pid === 'follow.offset') return 'Follow · Offset';
    if (pid.startsWith('transform.') && l) {
      return transformSchema(state, l.id).find((d) => d.id === pid)?.label ?? pid;
    }
    return (l && LAYER_TYPES[l.type].schema.find((d) => d.id === pid)?.label) ?? pid;
  };
  /** @type {ReturnType<typeof createLayerTimeline> | null} */
  let layerTimeline = null;
  layerTimeline = createLayerTimeline($('layertl-host'), {
    get: () => ({
      layers: state.layers,
      selected,
      selection: selIds,
      frame: timeline.getFrame(),
      fps: state.timing.fps,
      frameCount: state.timing.frameCount,
      impact: state.globals['explosion.impact'] * animationLength(state.timing),
      paramLabel,
    }),
    onScrub: (f) => timeline.setFrame(f),
    onSelect: (id, mods) => selectLayer(id, mods),
    onLayerTimes: (times, key) => {
      let next = state;
      for (const [id, time] of Object.entries(times)) next = updateLayer(next, id, { time });
      commit(next, key, { quiet: true });
    },
    onKeysRetime: (op, key) => {
      // The timeline gives the keys as they were when the drag started: re-apply from that state.
      if (retimeBase?.key !== key) retimeBase = { key, state };
      const base = retimeBase.state;
      const fps = state.timing.fps;
      const r =
        op.kind === 'move'
          ? moveKeys(base, op.refs, op.dComp, fps)
          : scaleKeys(base, op.refs, op.anchor, op.k, fps);
      // Graph Editor: the keys' values move too.
      if (op.kind === 'move' && op.dValue) r.state = offsetKeyValues(r.state, r.refs, op.dValue);
      commit(r.state, key, { quiet: true });
      syncLayerFields();
      return r.refs;
    },
    onKeysInterp: (refs, kind) => interpKeys(refs, kind),
    onVelocity: (refs) => openVelocity(refs),
    onGraphHandle: (ref, which, t, v, broken, key) => {
      if (retimeBase?.key !== key) retimeBase = { key, state };
      commit(dragKeyHandle(retimeBase.state, ref, which, t, v, { broken }), key, { quiet: true });
      syncLayerFields();
    },
    onKeysDelete: (refs) => {
      commit(deleteKeys(state, refs), '', { quiet: true });
      syncLayerFields();
    },
    onJumpKey: (dir) => jumpToKey(dir),
    keyboard: false,
    onImpact: (seconds, key) => {
      const impact = Math.min(0.8, Math.max(0, seconds / animationLength(state.timing)));
      commit({ ...state, globals: { ...state.globals, 'explosion.impact': impact } }, key, {
        quiet: true,
      });
      globalsInspector?.setValues(state.globals);
      syncPhases();
    },
  });

  /** State at the start of the current key drag (moves are re-applied to it). @type {{ key: string, state: typeof state } | null} */
  let retimeBase = null;

  /** Keep the timeline's phase markers in sync with the impact time. */
  function syncPhases() {
    timeline.setTiming({
      ...state.timing,
      phases: buildExplosion(state).effect.timing.phases,
    });
  }

  // ── Edits and undo ────────────────────────────────────────────────────────────────────────
  /** @type {ReturnType<typeof createHistory<typeof state>>} */
  const history = createHistory();

  /**
   * Apply an edit: remember the old state for undo, then show the new one.
   * @param {typeof state} next
   * @param {string} [key] same key in quick succession = one undo step (slider drags)
   * @param {{ quiet?: boolean, remount?: boolean }} [o] quiet: the control already shows the new
   *   value (don't rebuild it); remount: rebuild the inspectors (structure changed)
   */
  function commit(next, key = '', o = {}) {
    if (next === state) return;
    history.record(root, key);
    root = rootOf(next);
    state = viewOf(root);
    tidySelection();
    refresh(o);
  }

  /** After undo / load: drop opened precomps that no longer exist, rebuild the view. */
  function reopen() {
    while (compPath.length && !root.comps?.[/** @type {string} */ (compPath.at(-1))])
      compPath.pop();
    state = viewOf(root);
    syncCrumbs();
  }

  // ── Precomps (3.6e): open / close, breadcrumbs, precompose ───────────────────────────────
  const crumbs = h('span', { class: 'vp-crumbs', title: 'Which comp you are editing' });
  viewport.addTool(crumbs);
  function syncCrumbs() {
    const parts = [
      { id: '', name: 'Main' },
      ...compPath.map((id) => ({ id, name: root.comps?.[id]?.name ?? id })),
    ];
    crumbs.replaceChildren(
      ...parts.flatMap((p, i) => [
        ...(i ? [h('span', { class: 'vp-crumb-sep' }, ['›'])] : []),
        h(
          'button',
          {
            type: 'button',
            class: `vp-crumb${i === parts.length - 1 ? ' current' : ''}`,
            title: i === parts.length - 1 ? 'Editing this comp' : `Back to ${p.name}`,
            onclick: () => closeCompTo(i),
          },
          [i ? `▣ ${p.name}` : '◉ Main'],
        ),
      ]),
    );
  }
  syncCrumbs();
  /** Open a precomp layer's precomp (After Effects: double-click). @param {string} layerId */
  function openPrecomp(layerId) {
    const l = state.layers.find((x) => x.id === layerId);
    const compId = l?.type === 'precomp' ? l.comp : undefined;
    if (!compId || !root.comps?.[compId]) return;
    compPath = [...compPath, compId];
    state = viewOf(root);
    selected = state.layers.at(-1)?.id ?? '';
    selIds = selected ? [selected] : [];
    syncCrumbs();
    refresh({ remount: true });
  }
  /** Go back to the comp at breadcrumb index i (0 = main). @param {number} i */
  function closeCompTo(i) {
    if (i >= compPath.length) return;
    const leaving = compPath[i];
    compPath = compPath.slice(0, i);
    state = viewOf(root);
    // select the precomp layer we came out of
    const back = state.layers.find((l) => l.type === 'precomp' && l.comp === leaving);
    selected = back?.id ?? state.layers.at(-1)?.id ?? '';
    selIds = selected ? [selected] : [];
    syncCrumbs();
    refresh({ remount: true });
  }
  /** ⌘⇧C: the selected layers into a new precomp (asks for a name). */
  function precomposeSelection() {
    const ids = selectionInStack();
    if (!ids.length) return;
    const n = Object.keys(root.comps ?? {}).length + 1;
    const name = prompt('Precomp name:', `Precomp ${n}`);
    if (name === null) return;
    const r = precompose(state, ids, name);
    selected = r.id;
    selIds = [r.id];
    commit(r.state);
    notify(
      `Precomposed ${ids.length} layer${ids.length === 1 ? '' : 's'} into "${root.comps?.[r.compId]?.name}". ⤵ on the layer (or Tab) opens it.`,
    );
  }

  /** Keep the selection to layers that exist (after delete, undo, load…). */
  function tidySelection() {
    const r = cleanSelection(
      { active: selected, ids: selIds },
      state.layers.map((l) => l.id),
    );
    selected = r.active;
    selIds = r.ids;
  }

  /** Set the layer selection (active + all). @param {string} active @param {string[]} [ids] */
  function setSelection(active, ids = active ? [active] : []) {
    selected = active;
    selIds = ids;
    layerList.update(listLayers(), selected, selIds);
    mountLayerInspector();
  }

  /**
   * Click on a layer (panel or timeline): plain = only it, ⌘ = add / remove, ⇧ = range.
   * @param {string} id @param {{ meta?: boolean, shift?: boolean }} [mods]
   */
  function selectLayer(id, mods = {}) {
    const order = [...state.layers].reverse().map((l) => l.id); // as displayed, top first
    const r = clickSelect({ active: selected, ids: selIds }, id, mods, order);
    setSelection(r.active, r.ids);
  }

  /** Selected layer ids in stack order (bottom first). */
  const selectionInStack = () => state.layers.filter((l) => selIds.includes(l.id)).map((l) => l.id);

  /** Redraw what depends on the state. @param {{ quiet?: boolean, remount?: boolean }} [o] */
  function refresh(o = {}) {
    layerList.update(listLayers(), selected, selIds);
    if (o.remount) {
      mountGlobals();
      mountLayerInspector();
      syncPhases();
    } else if (!o.quiet) {
      mountLayerInspector();
    }
    syncUndoButtons();
    show();
    layerTimeline?.update();
  }

  function undo() {
    const prev = history.undo(root);
    if (prev === undefined) return;
    root = prev;
    reopen();
    tidySelection();
    refresh({ remount: true });
  }
  function redo() {
    const next = history.redo(root);
    if (next === undefined) return;
    root = next;
    reopen();
    tidySelection();
    refresh({ remount: true });
  }
  function syncUndoButtons() {
    $('undo').disabled = !history.canUndo();
    $('redo').disabled = !history.canRedo();
  }
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);

  // ── Layer panel ───────────────────────────────────────────────────────────────────────────
  const listLayers = () => {
    const sources = new Set(state.layers.map((l) => l.matte?.source).filter(Boolean));
    return state.layers.map(({ id, label, enabled, solo, blend, matte, masks, type, follow }) => ({
      id,
      label,
      enabled,
      solo,
      blend,
      openable: type === 'precomp',
      badge: [
        matte ? (matte.mode.startsWith('luma') ? '◐ luma' : '◐ matte') : '',
        sources.has(id) ? '⬓ matte src' : '',
        masks?.length ? `▭${masks.length > 1 ? masks.length : ''}` : '',
        follow ? '➰ path' : '',
      ]
        .filter(Boolean)
        .join(' '),
    }));
  };
  /** The layers an action on `id` applies to: the whole selection if `id` is in it. @param {string} id */
  const targetsOf = (id) => (selIds.includes(id) ? selectionInStack() : [id]);
  const layerList = createLayerList($('layers-host'), {
    layers: listLayers(),
    selected,
    selection: selIds,
    types: /** @type {Record<string, string>} */ (
      Object.fromEntries(Object.entries(LAYER_TYPE_LABELS).filter(([t]) => t !== 'precomp'))
    ),
    onOpen: (id) => openPrecomp(id),
    onPrecompose: () => precomposeSelection(),
    onSelect: (id, mods) => selectLayer(id, mods),
    onToggle(id, enabled) {
      let next = state;
      for (const t of targetsOf(id)) next = updateLayer(next, t, { enabled });
      commit(next, '', { quiet: true });
    },
    onSolo(id, solo) {
      let next = state;
      for (const t of targetsOf(id)) next = updateLayer(next, t, { solo });
      commit(next, '', { quiet: true });
    },
    onRename: (id, label) => commit(updateLayer(state, id, { label })),
    onMove(id, to) {
      const ids = targetsOf(id);
      if (ids.length < 2) {
        commit(moveLayer(state, id, to), '', { quiet: true });
        return;
      }
      commit(moveSelection(to > indexOf(id) ? 1 : -1), '', { quiet: true });
    },
    onAdd(type) {
      const r = addLayer(state, /** @type {any} */ (type), selected || undefined);
      selected = r.id;
      selIds = [r.id];
      commit(r.state);
    },
    onDuplicate: () => duplicateSelection(),
    onDelete: () => deleteSelection(),
  });

  /** @param {string} id */
  const indexOf = (id) => state.layers.findIndex((l) => l.id === id);

  /**
   * Move every selected layer one step up (+1) or down (−1), keeping their order. Stops at the
   * top / bottom of the stack (the block doesn't wrap).
   * @param {1 | -1} dir
   */
  function moveSelection(dir) {
    const ids = selectionInStack();
    const idx = ids.map(indexOf);
    if (dir > 0 && Math.max(...idx) >= state.layers.length - 1) return state;
    if (dir < 0 && Math.min(...idx) <= 0) return state;
    let next = state;
    const order = dir > 0 ? [...ids].reverse() : ids;
    for (const id of order) {
      next = moveLayer(next, id, next.layers.findIndex((l) => l.id === id) + dir);
    }
    return next;
  }

  /** ⌘D / ⧉: duplicate every selected layer; the copies become the selection. */
  function duplicateSelection() {
    let next = state;
    /** @type {string[]} */
    const copies = [];
    /** @type {string} */
    let active = '';
    for (const id of selectionInStack()) {
      const r = duplicateLayer(next, id);
      next = r.state;
      copies.push(r.id);
      if (id === selected) active = r.id;
    }
    if (!copies.length) return;
    selected = active || copies[copies.length - 1];
    selIds = copies;
    commit(next);
  }

  /** 🗑 / ⌫ (no keys selected): delete every selected layer. */
  function deleteSelection() {
    const ids = selectionInStack();
    if (!ids.length) return;
    const first = Math.min(...ids.map(indexOf));
    let next = state;
    for (const id of ids) next = removeLayer(next, id);
    // Select the layer that took the place of the lowest deleted one (or the new bottom).
    const keep = next.layers[Math.max(0, first - 1)]?.id ?? '';
    selected = keep;
    selIds = keep ? [keep] : [];
    commit(next);
  }

  /** @type {ReturnType<typeof buildInspector> | null} */
  let globalsInspector = null;
  function mountGlobals() {
    globalsInspector = buildInspector(
      $('globals-host'),
      EXPLOSION_SCHEMA.filter((d) => !(/** @type {any} */ (d).hidden)),
      state.globals,
      {
        onChange(id, value) {
          commit({ ...state, globals: { ...state.globals, [id]: value } }, `globals:${id}`, {
            quiet: true,
          });
          if (id === 'explosion.impact') syncPhases();
          if (id.startsWith('pixel.')) syncPixelUi();
        },
      },
    );
    $('globals-host').append(pixelExtras);
    syncPixelUi();
  }

  // Pixel Mode extras: palette swatches + import a Lospec .hex palette; top-bar toggle (⇧P)
  const swatches = h('div', { class: 'px-swatches' }, []);
  const hexInput = /** @type {HTMLInputElement} */ (
    h('input', { type: 'file', accept: '.hex,.txt,text/plain', hidden: true })
  );
  const importBtn = h(
    'button',
    {
      type: 'button',
      class: 'px-import',
      title: 'Import a palette (.hex from lospec.com: one colour per line)',
    },
    ['Import .hex…'],
  );
  importBtn.addEventListener('click', () => hexInput.click());
  hexInput.addEventListener('change', async () => {
    const file = hexInput.files?.[0];
    hexInput.value = '';
    if (!file) return;
    const colors = parseHexPalette(await file.text());
    if (colors.length < 2) {
      notify('That file has no palette colours (expected one RRGGBB per line).');
      return;
    }
    setPixel({ 'pixel.customPalette': paletteToStops(colors), 'pixel.palette': 'custom' });
    notify(`Imported ${colors.length} colours from “${file.name}”.`);
  });
  const pixelExtras = h('div', { class: 'px-extras' }, [
    h('span', { class: 'px-label' }, ['Palette']),
    swatches,
    importBtn,
    hexInput,
  ]);
  /** @param {Record<string, any>} patch */
  function setPixel(patch) {
    commit({ ...state, globals: { ...state.globals, ...patch } }, '', { remount: true });
  }
  function syncPixelUi() {
    const px = pixelOf(root);
    $('pixel-toggle')?.classList.toggle('on', !!px);
    pixelExtras.hidden = !px;
    if (!px) return;
    const colors = px.palette ?? [];
    swatches.replaceChildren(
      ...(colors.length
        ? colors.map((c) =>
            h('span', { class: 'px-swatch', title: c, style: `background:${c}` }, []),
          )
        : [h('span', { class: 'hint' }, ['Keeps the effect’s colours'])]),
    );
  }
  const togglePixel = () => setPixel({ 'pixel.enabled': !readPixel(root.globals).enabled });
  $('pixel-toggle')?.addEventListener('click', togglePixel);

  // ── Selected layer: settings, transform, params (all keyframable, 3.6c) ───────────────
  /** Comp time of the current frame, seconds (keys are placed on frames, not held drawings). */
  const nowSeconds = () => timeline.getFrame() / state.timing.fps;
  const selectedLayer = () => state.layers.find((l) => l.id === selected);
  /** Every layer as it is at the current frame (keyframes resolved). */
  const layersNow = () => applyFollow(state.layers.map((l) => layerAt(l, nowSeconds())));
  /** "Uniform scale" per layer (editor setting, not saved). @type {Map<string, boolean>} */
  const linkedScale = new Map();
  const isLinked = (/** @type {string} */ id) => linkedScale.get(id) ?? true;
  /** @type {ReturnType<typeof buildInspector>[]} */
  let inspectors = [];
  /** @type {ReturnType<typeof buildInspector> | null} */
  let transformInspector = null;
  /** @type {ReturnType<typeof buildInspector> | null} */
  let settingsInspector = null;
  /** @type {ReturnType<typeof buildInspector> | null} */
  let paramsInspector = null;

  /** Stopwatch / key buttons, shared by the three inspectors (act on the whole selection). @param {(id: string) => boolean} canAnimate */
  const keyHooks = (canAnimate) => ({
    canAnimate,
    isAnimated: (/** @type {string} */ id) => {
      const l = selectedLayer();
      return !!l && isAnimatedParam(l, id);
    },
    hasKey: (/** @type {string} */ id) => {
      const l = selectedLayer();
      return !!l && keyHere(l, id, nowSeconds());
    },
    onStopwatch: (/** @type {string} */ id) => {
      commit(toggleStopwatchMany(state, selected, selIds, id, nowSeconds()), '', { quiet: true });
      syncLayerFields();
    },
    onKey: (/** @type {string} */ id) => {
      commit(toggleKeyMany(state, selected, selIds, id, nowSeconds()), '', { quiet: true });
      syncLayerFields();
    },
  });

  /**
   * Set values on every selected layer that has them (keys where animated).
   * @param {Record<string, any>} changes @param {string} key
   */
  function setValues(changes, key) {
    commit(applyValuesMany(state, selIds, changes, nowSeconds()), key, { quiet: true });
    syncLayerFields();
  }

  /** "—" on params whose values differ across the selected layers. */
  function markMixed() {
    const ids = selIds.length > 1 ? selIds : [];
    for (const [insp, schema] of /** @type {const} */ ([
      [settingsInspector, LAYER_SETTINGS_SCHEMA],
      [transformInspector, transformSchema(state, selected)],
      [paramsInspector, LAYER_TYPES[selectedLayer()?.type ?? 'blob']?.schema ?? []],
    ])) {
      if (!insp) continue;
      const params = schema.map((d) => d.id).filter((p) => p !== 'transform.parent');
      const mixed = mixedParams(state.layers, ids, params, nowSeconds());
      for (const p of ['layer.blend', 'layer.anchor']) {
        if (!params.includes(p) || ids.length < 2) continue;
        const field = p === 'layer.blend' ? 'blend' : 'anchor';
        const vals = new Set(
          state.layers.filter((l) => ids.includes(l.id)).map((l) => /** @type {any} */ (l)[field]),
        );
        if (vals.size > 1) mixed.add(p);
      }
      insp.markMixed(mixed);
    }
  }

  /** "Ends on" option that makes a new target null (D-072). */
  const NEW_TARGET = '__new';
  /** @param {import('../../effects/explosion/explosion.js').EditorLayer | undefined} l */
  const hasRampLayer = (l) => !!l && !!rampParamOf(l);
  /** The layer's ramp param: 'style.ramp' on drawing layers, 'gmap.ramp' on Gradient Maps. @param {import('../../effects/explosion/explosion.js').EditorLayer} l */
  const rampParamOf = (l) => LAYER_TYPES[l.type].schema.find((d) => d.type === 'ramp')?.id ?? null;
  /** Layer settings + track matte (3.6d). @param {import('../../effects/explosion/explosion.js').EditorLayer} l */
  const settingsSchema = (l) => [
    ...LAYER_SETTINGS_SCHEMA,
    {
      id: 'layer.matte',
      label: 'Track matte',
      group: 'Layer',
      type: 'enum',
      options: [
        { value: '', label: 'None' },
        ...[...matteCandidates(state, l.id)]
          .reverse()
          .map((x) => ({ value: x.id, label: x.label })),
      ],
      default: '',
      tooltip:
        'Use another layer as this layer’s visibility (After Effects track matte). Picking one hides it.',
    },
    {
      id: 'layer.matteMode',
      label: 'Matte mode',
      group: 'Layer',
      type: 'enum',
      options: MATTE_MODES.map((v) => ({ value: v, label: /** @type {any} */ (MATTE_LABELS)[v] })),
      default: 'alpha',
      tooltip: 'Alpha = where the matte is · Luma = where it is bright · Inverted = the opposite',
    },
    ...(isBoltType(l)
      ? [
          {
            id: 'layer.boltTarget',
            label: 'Ends on',
            group: 'Layer',
            type: 'enum',
            options: [
              { value: '', label: 'Its own tip (drag the ◆ handle)' },
              { value: NEW_TARGET, label: '＋ New null at the tip' },
              ...[...targetCandidates(state.layers, l.id)]
                .reverse()
                .map((x) => ({ value: x.id, label: x.label })),
            ],
            default: '',
            tooltip:
              'Lightning target: the bolt’s tip ends on this layer (its anchor point) every frame — move or animate the target and the bolt follows.',
          },
        ]
      : []),
    {
      id: 'layer.keyLoop',
      label: 'Loop keys',
      group: 'Layer',
      type: 'enum',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'cycle', label: 'Cycle (repeat)' },
        { value: 'pingpong', label: 'Ping-pong (back and forth)' },
      ],
      default: 'off',
      tooltip:
        'After the last keyframe the keys repeat, like After Effects loopOut(). For seamless loops: make the last key match the first, or key one cycle and pick Cycle.',
    },
  ];
  /** @param {import('../../effects/explosion/explosion.js').EditorLayer} l */
  const settingsValues = (l) => ({
    ...layerSettingsValues(l),
    'layer.matte': l.matte?.source ?? '',
    'layer.matteMode': l.matte?.mode ?? 'alpha',
    'layer.keyLoop': l.keyLoop ?? 'off',
    'layer.boltTarget': l.target ?? '',
  });

  // ── Follow Path (4.Pa): rows added to the Transform section ─────────────────────────────
  /** @param {import('../../effects/explosion/explosion.js').EditorLayer} l */
  const followSchema = (l) => {
    const group = 'Follow path';
    return [
      {
        id: 'follow.source',
        label: 'Path',
        group,
        type: 'enum',
        options: [
          { value: '', label: 'None' },
          ...pathSources(state.layers, l.id).map(({ layer, mask }) => ({
            value: `${layer.id}|${mask.id}`,
            label: `${layer.label} › ${mask.name}${mask.closed === false ? '' : ' (closed)'}`,
          })),
        ],
        default: '',
        tooltip:
          'Ride along a pen path (draw one with ✒ Pen, Enter = open path — best on a Path layer). The anchor point sits on the path.',
      },
      {
        id: 'follow.progress',
        label: 'Progress',
        group,
        type: 'float',
        min: -100,
        max: 200,
        step: 0.1,
        default: 0,
        unit: '%',
        tooltip: 'Where along the path (0 = start, 100 = end). Keyframe it to move.',
      },
      {
        id: 'follow.offset',
        label: 'Offset',
        group,
        type: 'float',
        min: -100,
        max: 100,
        step: 0.1,
        default: 0,
        unit: '%',
        tooltip: 'Added to Progress — e.g. to space copies along the same path',
      },
      {
        id: 'follow.orient',
        label: 'Auto-orient',
        group,
        type: 'bool',
        default: true,
        tooltip: 'Turn with the path (After Effects Auto-Orient)',
      },
      {
        id: 'follow.even',
        label: 'Even speed',
        group,
        type: 'bool',
        default: true,
        tooltip: 'Constant speed along the curve (off = equal time per segment)',
      },
      {
        id: 'follow.loop',
        label: 'Loop',
        group,
        type: 'bool',
        default: false,
        tooltip: 'Past 100 % start again (around and around a closed path)',
      },
    ];
  };
  /** @param {import('../../effects/explosion/explosion.js').EditorLayer} l */
  const followValues = (l) => ({
    'follow.source': l.follow ? `${l.follow.layer}|${l.follow.mask}` : '',
    'follow.progress': l.follow?.progress ?? 0,
    'follow.offset': l.follow?.offset ?? 0,
    'follow.orient': l.follow?.orient ?? true,
    'follow.even': l.follow?.even ?? true,
    'follow.loop': l.follow?.loop ?? false,
  });
  /** A Follow Path control changed (transform inspector). @param {string} id @param {any} value */
  function onFollowChange(id, value) {
    if (id === 'follow.progress' || id === 'follow.offset') {
      setValues({ [id]: value }, `${selected}:${id}`);
      return;
    }
    let next = state;
    for (const t of selIds) {
      const l = next.layers.find((x) => x.id === t);
      if (!l) continue;
      if (id === 'follow.source') {
        if (!value) {
          const { 'follow.progress': _p, 'follow.offset': _o, ...keys } = l.keys ?? {};
          const { follow: _f, ...rest } = l;
          next = { ...next, layers: next.layers.map((x) => (x.id === t ? { ...rest, keys } : x)) };
        } else {
          const [layerId, maskId] = String(value).split('|');
          if (layerId === t) continue;
          next = updateLayer(next, t, {
            follow: { ...(l.follow ?? makeFollow(layerId, maskId)), layer: layerId, mask: maskId },
          });
        }
      } else if (l.follow) {
        next = updateLayer(next, t, { follow: { ...l.follow, [id.slice(7)]: value } });
      }
    }
    commit(next, '', { quiet: id !== 'follow.source' });
    viewport.redraw();
  }

  // ── Masks (3.6d) ─────────────────────────────────────────────────────────────────────────
  /** The mask edited with viewport handles (on the active layer), or ''. */
  let maskTarget = '';
  // Pen tool state (declared early: the viewport overlay reads it on its first draw).
  let penTool = false;
  /** Points being drawn, layer px; ox / oy = out handle (the in handle mirrors it). @type {{ x: number, y: number, ox: number, oy: number }[]} */
  let penPts = [];
  /** @type {[number, number] | null} pointer, layer px (rubber band to the next point) */
  let penHover = null;
  let penDragging = false;

  /** @type {{ maskId: string, insp: ReturnType<typeof buildInspector> }[]} */
  let maskInspectors = [];
  /** Keys on mask numbers: this layer only (another layer may have a mask with the same id). */
  const maskKeyHooks = {
    canAnimate: (/** @type {string} */ id) => id.startsWith('mask.'),
    isAnimated: (/** @type {string} */ id) => {
      const l = selectedLayer();
      return !!l && isAnimatedParam(l, id);
    },
    hasKey: (/** @type {string} */ id) => {
      const l = selectedLayer();
      return !!l && keyHere(l, id, nowSeconds());
    },
    onStopwatch: (/** @type {string} */ id) => {
      commit(toggleStopwatch(state, selected, id, nowSeconds()), '', { quiet: true });
      syncLayerFields();
    },
    onKey: (/** @type {string} */ id) => {
      commit(toggleKey(state, selected, id, nowSeconds()), '', { quiet: true });
      syncLayerFields();
    },
  };
  /** Set mask numbers on the active layer (keys where animated). @param {Record<string, number>} changes @param {string} key */
  function setMaskValues(changes, key) {
    commit(applyValues(state, selected, changes, nowSeconds()), key, { quiet: true });
    syncLayerFields();
    viewport.redraw();
  }
  /**
   * Texture panel (4.Pb2): import an image / PNG sequence for a Texture particle layer.
   * @param {import('../../effects/explosion/explosion.js').EditorLayer | undefined} layer
   */
  function mountTexture(layer) {
    const host = $('layer-texture-host');
    if (!host) return;
    if (!layer || !hasTexture(layer)) {
      host.replaceChildren();
      return;
    }
    const id = layer.id;
    const setTexture = (/** @type {string | undefined} */ tex, /** @type {any} */ extra = {}) => {
      const next = updateLayer({ ...state, ...extra }, id, { texture: tex });
      commit(
        tex
          ? next
          : { ...next, layers: next.layers.map((l) => (l.id === id ? dropTexture(l) : l)) },
      );
    };
    mountTexturePanel(host, {
      current: layer.texture,
      replacesShape: layer.type !== 'textureEmitter',
      assets: state.assets ?? {},
      async onImport(files) {
        notify('Importing…');
        try {
          const r = await importTextureFiles(files);
          setTextureFrames(r.asset.id, r.frames);
          setTexture(r.asset.id, { assets: { ...(state.assets ?? {}), [r.asset.id]: r.asset } });
          notify(
            `Texture “${r.asset.name}”: ${r.frames.length > 1 ? `${r.frames.length} frames` : 'image'}${
              r.skipped ? ` (${r.skipped} files skipped)` : ''
            }`,
          );
        } catch (err) {
          notify(`Couldn’t import: ${/** @type {Error} */ (err).message}`);
        }
      },
      onUse: (tex) => setTexture(tex),
      onClear: () => setTexture(undefined),
    });
  }
  /**
   * The params shown in the inspector: the Texture controls only once a texture is in use
   * (always on Texture particle layers). @param {import('../../effects/explosion/explosion.js').EditorLayer} l
   */
  function inspectorSchema(l) {
    return LAYER_TYPES[l.type].schema.filter(
      (d) => d.group !== 'Texture' || l.type === 'textureEmitter' || !!l.texture,
    );
  }
  /** Can this layer show an imported texture? (D-074) @param {{ type: string }} l */
  function hasTexture(l) {
    return LAYER_TYPES[l.type].schema.some((d) => d.id === 'tex.size');
  }
  /** @param {import('../../effects/explosion/explosion.js').EditorLayer} l */
  const dropTexture = (l) => {
    const { texture: _t, ...rest } = l;
    return rest;
  };
  /** @param {import('../../effects/explosion/explosion.js').EditorLayer | undefined} layer */
  function mountMasks(layer) {
    const host = $('layer-masks-host');
    maskInspectors = [];
    if (!host) return;
    if (!layer || layer.type === 'null') {
      host.replaceChildren();
      return;
    }
    const now = layerAt(layer, nowSeconds());
    if (!now.masks?.some((m) => m.id === maskTarget)) maskTarget = '';
    const addBtn = (/** @type {'ellipse'|'rect'} */ shape, /** @type {string} */ label) =>
      h(
        'button',
        {
          type: 'button',
          class: 'mask-add',
          title: `Add a ${shape === 'rect' ? 'rectangle' : 'ellipse'} mask (edit it with the handles in the viewport)`,
          onclick: () => {
            const r = addMask(state, layer.id, shape);
            maskTarget = r.maskId;
            commit(r.state);
          },
        },
        [label],
      );
    const cards = (now.masks ?? []).map((m) => {
      const body = h('div', { class: 'mask-body' });
      const enabled = h('input', { type: 'checkbox', checked: m.enabled, title: 'Mask on / off' });
      enabled.addEventListener('change', () =>
        commit(updateMask(state, layer.id, m.id, { enabled: enabled.checked }), '', {
          quiet: true,
        }),
      );
      // Mask Path keyframes (pen masks): stopwatch + ◆, like the inspector rows.
      const pathId = `mask.${m.id}.path`;
      const pathKeys =
        m.shape === 'path'
          ? [
              h(
                'button',
                {
                  type: 'button',
                  class: 'mask-path-watch',
                  'data-param': pathId,
                  title: 'Animate the mask path (stopwatch): edits then set path keys',
                  onclick: () => maskKeyHooks.onStopwatch(pathId),
                },
                ['◷ Path'],
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'mask-path-key',
                  'data-param': pathId,
                  title: 'Add / remove a path key here',
                  onclick: () => maskKeyHooks.onKey(pathId),
                },
                ['◆'],
              ),
            ]
          : [];
      const card = h('div', { class: `mask-card${m.id === maskTarget ? ' target' : ''}` }, [
        h('div', { class: 'mask-card-head' }, [
          enabled,
          h('span', { class: 'mask-name' }, [m.name]),
          ...pathKeys,
          h(
            'button',
            {
              type: 'button',
              class: `mask-edit${m.id === maskTarget ? ' active' : ''}`,
              title:
                'Edit this mask with handles in the viewport (drag inside to move, a corner to resize)',
              onclick: () => {
                maskTarget = maskTarget === m.id ? '' : m.id;
                mountMasks(selectedLayer());
                viewport.redraw();
              },
            },
            ['✥ Edit'],
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'mask-del',
              title: 'Delete this mask',
              onclick: () => {
                if (maskTarget === m.id) maskTarget = '';
                commit(removeMask(state, layer.id, m.id));
              },
            },
            ['✕'],
          ),
        ]),
        body,
      ]);
      // open paths / Path layers: only the shape's place and size matter (they never cut)
      const placeOnly = layer.type === 'guide' || m.closed === false;
      const schema = maskSchema(m).filter((d) => !placeOnly || /\.(x|y|w|h|rotation)$/.test(d.id));
      const insp = buildInspector(body, /** @type {any} */ (schema), maskValues(m), {
        onChange(id, value) {
          const fx = parseMaskFix(id);
          if (fx) {
            commit(updateMask(state, layer.id, fx.maskId, { [fx.field]: value }), '', {
              quiet: true,
            });
            viewport.redraw();
          } else setMaskValues({ [id]: value }, `${selected}:${id}`);
        },
        keys: maskKeyHooks,
      });
      maskInspectors.push({ maskId: m.id, insp });
      return card;
    });
    const guide = layer.type === 'guide';
    host.replaceChildren(
      h('div', { class: 'mask-head' }, [
        h('span', { class: 'mask-title' }, [guide ? 'Paths' : 'Masks']),
        ...(guide
          ? [
              h(
                'button',
                {
                  type: 'button',
                  class: 'mask-add',
                  title:
                    'Draw a motion path with the pen (G). Enter = open path, click the first point = closed.',
                  onclick: () => setPenTool(true),
                },
                ['✒ Draw path'],
              ),
            ]
          : [addBtn('ellipse', '＋ Ellipse'), addBtn('rect', '＋ Rectangle')]),
      ]),
      ...cards,
    );
  }

  function mountLayerInspector() {
    const layer = selectedLayer();
    $('layer-reseed').hidden = !layer;
    $('layer-copy-settings').hidden = !layer;
    $('layer-paste-settings').hidden = !layer;
    if ($('layer-ramps')) $('layer-ramps').hidden = !hasRampLayer(layer);
    $('layer-centre').hidden = !layer || isAdjustmentType(layer.type);
    $('layer-centre-anchor').hidden = !layer;
    if (!layer) {
      $('layer-title').textContent = 'No layer';
      $('layer-settings-host').replaceChildren();
      $('layer-transform-host').replaceChildren();
      $('layer-host').replaceChildren();
      mountMasks(undefined);
      inspectors = [];
      viewport.redraw();
      return;
    }
    const now = layerAt(layer, nowSeconds());
    $('layer-title').textContent = `Layer · ${layer.label}`;
    settingsInspector = buildInspector(
      $('layer-settings-host'),
      /** @type {any} */ (settingsSchema(layer)),
      settingsValues(now),
      {
        onChange(id, value) {
          if (id === 'layer.opacity') setValues({ [id]: value }, `${selected}:${id}`);
          else if (id === 'layer.matte') {
            let next = state;
            for (const t of selIds) {
              const mode = next.layers.find((x) => x.id === t)?.matte?.mode ?? 'alpha';
              next = setMatte(next, t, value || null, mode);
            }
            commit(next);
          } else if (id === 'layer.boltTarget') {
            setBoltTarget(selected, value);
          } else if (id === 'layer.keyLoop') {
            let next = state;
            for (const t of selIds) next = updateLayer(next, t, { keyLoop: value });
            commit(next, '', { quiet: true });
          } else if (id === 'layer.matteMode') {
            let next = state;
            for (const t of selIds) {
              const m = next.layers.find((x) => x.id === t)?.matte;
              if (m) next = updateLayer(next, t, { matte: { ...m, mode: value } });
            }
            commit(next, '', { quiet: true });
          } else {
            let next = state;
            for (const t of selIds) next = updateLayer(next, t, layerSettingsPatch(id, value));
            commit(next, '', { quiet: true });
            markMixed();
          }
        },
        keys: keyHooks((id) => id === 'layer.opacity'),
      },
    );
    if (isAdjustmentType(layer.type)) {
      // Adjustment layers have no position / size: they recolour everything below them.
      transformInspector = null;
      $('layer-transform-host').replaceChildren(
        h('p', { class: 'hint adj-note' }, [
          'Adjustment layer: it recolours every layer BELOW it in the stack (move it up or down to choose which). Its opacity, blend mode and timing still work.',
        ]),
      );
    } else
      transformInspector = buildInspector(
        $('layer-transform-host'),
        /** @type {any} */ ([
          ...transformSchema(state, layer.id),
          ...(layer.type === 'guide' ? [] : followSchema(layer)),
        ]),
        { ...transformValues(now, isLinked(layer.id)), ...followValues(now) },
        {
          onChange(id, value) {
            if (id.startsWith('follow.')) {
              onFollowChange(id, value);
              return;
            }
            if (id === 'transform.parent') {
              let next = state;
              for (const t of selIds) next = setParent(next, t, t === value ? null : value || null);
              commit(next);
              return;
            }
            if (id === 'transform.linked') {
              for (const t of selIds) linkedScale.set(t, value);
              return;
            }
            const cur = /** @type {any} */ (
              layerAt(/** @type {any} */ (selectedLayer()), nowSeconds())
            );
            const next = transformPatch(cur.transform, id, value, isLinked(selected));
            /** @type {Record<string, any>} */
            const changes = {};
            for (const [k, v] of Object.entries(next)) {
              if (v !== cur.transform[k]) changes[`transform.${k}`] = v;
            }
            setValues(selIds.length > 1 ? pickEdited(next, id) : changes, `${selected}:${id}`);
          },
          keys: keyHooks(
            (id) =>
              id !== 'transform.parent' &&
              id !== 'transform.linked' &&
              (!id.startsWith('follow.') || id === 'follow.progress' || id === 'follow.offset'),
          ),
        },
      );
    paramsInspector = buildInspector($('layer-host'), inspectorSchema(layer), now.params, {
      onChange(id, value) {
        setValues({ [id]: value }, `${selected}:${id}`);
      },
      keys: keyHooks(
        (id) => LAYER_TYPES[layer.type].schema.find((d) => d.id === id)?.type !== 'seed',
      ),
    });
    mountMasks(layer);
    mountTexture(layer);
    inspectors = /** @type {ReturnType<typeof buildInspector>[]} */ (
      [settingsInspector, transformInspector, paramsInspector].filter(Boolean)
    );
    $('layer-title').textContent =
      selIds.length > 1
        ? `${selIds.length} layers · ${layer.label} active`
        : `Layer · ${layer.label}`;
    markMixed();
    viewport.redraw();
    layerTimeline?.update();
  }

  /** Show the selected layer's values at the current frame + key buttons (no rebuild). */
  function syncLayerFields() {
    const l = selectedLayer();
    if (!l || !inspectors.length) return;
    const now = layerAt(l, nowSeconds());
    settingsInspector?.setValues(settingsValues(now));
    transformInspector?.setValues({
      ...transformValues(now, isLinked(l.id)),
      ...followValues(now),
    });
    paramsInspector?.setValues(now.params);
    for (const i of inspectors) i.refreshKeys();
    for (const b of document.querySelectorAll('.mask-path-watch, .mask-path-key')) {
      const pid = /** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.param);
      const animated = isAnimatedParam(l, pid);
      b.classList.toggle(
        'active',
        b.classList.contains('mask-path-watch')
          ? animated
          : animated && keyHere(l, pid, nowSeconds()),
      );
    }
    for (const { maskId, insp } of maskInspectors) {
      const m = now.masks?.find((x) => x.id === maskId);
      if (m) insp.setValues(maskValues(m));
      insp.refreshKeys();
    }
    markMixed();
    layerTimeline?.update();
  }

  /**
   * With several layers selected, a transform edit sends only the field the user touched (uniform
   * scale: both X and Y), so each layer keeps its other values — even if the active layer
   * already had that value.
   * @param {Record<string, any>} transform the active layer's new transform @param {string} id
   */
  function pickEdited(transform, id) {
    const field = id.slice('transform.'.length);
    const fields = field.startsWith('scale') && isLinked(selected) ? ['scaleX', 'scaleY'] : [field];
    return Object.fromEntries(
      fields.filter((f) => f in transform).map((f) => [`transform.${f}`, transform[f]]),
    );
  }
  /** Back-compat name used by the handles code. */
  const syncTransformFields = syncLayerFields;

  // Viewport handles: effect px ↔ screen px goes through the frame (pivot centre, render scale).
  const toMap = (/** @type {import('../viewport.js').FrameMap} */ fm) => {
    const s = buildExplosion(state).scale;
    return {
      toScreen: (/** @type {number} */ ex, /** @type {number} */ ey) =>
        fm.toScreen(frame.w / 2 + ex * s, frame.h / 2 + ey * s),
      toEffect: (/** @type {number} */ sx, /** @type {number} */ sy) => {
        const [fx, fy] = fm.toFrame(sx, sy);
        return /** @type {[number, number]} */ ([(fx - frame.w / 2) / s, (fy - frame.h / 2) / s]);
      },
    };
  };
  /** Adjustment layers have no position or size: no handles. */
  const noHandles = () => isAdjustmentType(selectedLayer()?.type ?? '');
  /** @type {{ d: import('./gizmo.js').DragStart, id: string, key: string } | null} */
  let gizmoDrag = null;
  let gizmoDrags = 0;
  /** @type {import('./gizmo.js').GizmoHit} */
  let gizmoActive = null;
  // Masks in the viewport (3.6d): outlines of the active layer's masks; the targeted one
  // ("✥ Edit") gets handles and replaces the layer handles while it is targeted.
  /** Active layer's masks now + layer → screen mapping. @param {import('../viewport.js').FrameMap} fm */
  const maskView = (fm) => {
    const l = selectedLayer();
    if (!l?.masks?.length) return null;
    const lays = layersNow();
    const now = lays.find((x) => x.id === l.id);
    const world = worldMatrices(lays).get(l.id) ?? [1, 0, 0, 1, 0, 0]; // lays: follow applied
    const map = toMap(fm);
    return {
      masks: now?.masks ?? [],
      toScreen: (/** @type {number} */ x, /** @type {number} */ y) =>
        map.toScreen(...applyMat(world, x, y)),
      toLayer: (/** @type {number} */ sx, /** @type {number} */ sy) =>
        /** @type {[number, number]} */ (applyMat(invert(world), ...map.toEffect(sx, sy))),
    };
  };
  const MASK_HIT = 10;
  /** @param {import('../viewport.js').FrameMap} fm @param {number} x @param {number} y */
  function maskHit(fm, x, y) {
    if (!maskTarget) return null;
    const v = maskView(fm);
    const m = v?.masks.find((q) => q.id === maskTarget);
    if (!v || !m) return null;
    const near = (/** @type {[number, number]} */ p) => {
      const sp = v.toScreen(p[0], p[1]);
      return Math.hypot(sp[0] - x, sp[1] - y) <= MASK_HIT;
    };
    if (m.shape === 'path' && m.path) {
      // pen path: vertices, then their handles
      for (let i = 0; i < m.path.length; i++) {
        if (near(vertexAt(m, i))) return { kind: 'vertex', index: i, m, v };
      }
      for (let i = 0; i < m.path.length; i++) {
        const q = m.path[i];
        if ((q.ox || q.oy) && near(handleAt(m, i, 'out')))
          return { kind: 'handle', index: i, which: 'out', m, v };
        if ((q.ix || q.iy) && near(handleAt(m, i, 'in')))
          return { kind: 'handle', index: i, which: 'in', m, v };
      }
    }
    for (let c = 0; c < 4; c++) {
      const [sx, sy] = CORNERS[c];
      const p = v.toScreen(...maskToLayer(m, (sx * m.w) / 2, (sy * m.h) / 2));
      if (Math.hypot(p[0] - x, p[1] - y) <= MASK_HIT) return { kind: 'corner', corner: c, m, v };
    }
    if (insideMask(m, ...v.toLayer(x, y))) return { kind: 'move', m, v };
    return null;
  }
  viewport.setOverlay((ctx, fm) => {
    const v = maskView(fm);
    if (v) {
      ctx.save();
      for (const m of v.masks) {
        const target = m.id === maskTarget;
        const pts = maskOutline(m).map(([x, y]) => v.toScreen(x, y));
        ctx.beginPath();
        for (const [i, [x, y]] of pts.entries()) {
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        if (m.closed !== false) ctx.closePath();
        ctx.setLineDash(target ? [] : [5, 4]);
        ctx.lineWidth = target ? 2 : 1.25;
        ctx.strokeStyle = !m.enabled ? '#777a85' : target ? '#4fd1ff' : '#9fe3ff';
        ctx.stroke();
        if (target && m.shape === 'path' && m.path) {
          ctx.setLineDash([]);
          m.path.forEach((q, i) => {
            const vp = v.toScreen(...vertexAt(m, i));
            for (const which of /** @type {const} */ (['in', 'out'])) {
              const has = which === 'in' ? q.ix || q.iy : q.ox || q.oy;
              if (!has) continue;
              const hp = v.toScreen(...handleAt(m, i, which));
              ctx.strokeStyle = '#4fd1ff';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(vp[0], vp[1]);
              ctx.lineTo(hp[0], hp[1]);
              ctx.stroke();
              ctx.fillStyle = '#4fd1ff';
              ctx.beginPath();
              ctx.arc(hp[0], hp[1], 4, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#4fd1ff';
            ctx.fillRect(vp[0] - 4.5, vp[1] - 4.5, 9, 9);
            ctx.strokeRect(vp[0] - 4.5, vp[1] - 4.5, 9, 9);
          });
        }
        if (target) {
          ctx.setLineDash([]);
          for (const [sx, sy] of CORNERS) {
            const [x, y] = v.toScreen(...maskToLayer(m, (sx * m.w) / 2, (sy * m.h) / 2));
            ctx.fillStyle = '#111216';
            ctx.strokeStyle = '#4fd1ff';
            ctx.fillRect(x - 5, y - 5, 10, 10);
            ctx.strokeRect(x - 5.5, y - 5.5, 11, 11);
          }
        }
      }
      ctx.restore();
    }
    paintFollowPath(ctx, fm);
    paintEmitterShape(ctx, fm);
    if (!maskTarget && !penTool) paintBoltTip(ctx, fm);
    if (penPts.length) paintPen(ctx, fm);
    if (maskTarget || penTool) return; // editing a mask / drawing one: no layer handles
    const g = selected && !noHandles() ? gizmoGeometry(layersNow(), selected, toMap(fm)) : null;
    if (!g) return;
    const isNull = state.layers.find((l) => l.id === selected)?.type === 'null';
    paintGizmo(ctx, g, { active: gizmoActive, isNull });
  });
  /** @type {{ m0: import('../../render/masks.js').Mask, p0: [number, number], what: any, key: string } | null} */
  let maskDrag = null;
  /** Dragging a bolt's tip (D-072). @type {{ id: string, key: string } | null} */
  let boltDrag = null;
  // ── Lightning targets (D-072) ──────────────────────────────────────────────────────────
  /** World matrices of the layers as they are now (keys + Follow Path). */
  function worldsNow() {
    const lays = layersNow();
    return { lays, worlds: /** @type {Map<string, number[]>} */ (worldMatrices(lays)) };
  }
  /** The bolt's tip in world px now (aimed at its target when it has one). @param {string} id */
  function boltTip(id) {
    const { lays, worlds } = worldsNow();
    const l = lays.find((x) => x.id === id);
    if (!l || !isBoltType(l)) return null;
    const aimed = { ...l, params: aimedParams(l, lays, worlds) };
    return { ...boltEnds(aimed, worlds), layer: l, lays, worlds };
  }
  /**
   * Point a bolt at a layer, at a new null made at its tip, or back at its own tip (the current
   * tip is kept: End X / Y take the aimed values).
   * @param {string} id @param {string} value
   */
  function setBoltTarget(id, value) {
    const tip = boltTip(id);
    if (!tip) return;
    let next = state;
    let target = value;
    if (value === NEW_TARGET) {
      const r = addLayer(state, 'null', id);
      const n = /** @type {any} */ (r.state.layers.find((x) => x.id === r.id));
      next = updateLayer(r.state, r.id, {
        label: `${tip.layer.label} target`,
        anchor: 'free',
        transform: { ...n.transform, x: tip.end[0], y: tip.end[1] },
      });
      target = r.id;
    }
    // keep the tip where it is now
    const baked = endForWorld(tip.layer, tip.worlds, tip.end[0], tip.end[1]);
    next = applyValues(next, id, baked, nowSeconds());
    const cur = /** @type {any} */ (next.layers.find((x) => x.id === id));
    const { target: _old, ...rest } = cur;
    next = {
      ...next,
      layers: next.layers.map((x) => (x.id === id ? (target ? { ...rest, target } : rest) : x)),
    };
    commit(next, '', { remount: false });
  }
  /**
   * Drag the tip: moves the target layer (keys where animated) or the bolt's own End X / Y.
   * @param {string} id @param {number} wx @param {number} wy @param {string} key
   */
  function dragBoltTip(id, wx, wy, key) {
    const tip = boltTip(id);
    if (!tip) return;
    const t = tip.layer.target ? tip.lays.find((x) => x.id === tip.layer.target) : null;
    if (t) {
      // the target's position in its parent's space puts its anchor point on the cursor
      const pw = t.parent ? (tip.worlds.get(t.parent) ?? [1, 0, 0, 1, 0, 0]) : [1, 0, 0, 1, 0, 0];
      const [px, py] = applyMat(invert(/** @type {any} */ (pw)), wx, wy);
      const [ax, ay] = targetPoint(t, tip.worlds);
      const [cx, cy] = applyMat(invert(/** @type {any} */ (pw)), ax, ay);
      commit(
        applyValues(
          state,
          t.id,
          { 'transform.x': t.transform.x + (px - cx), 'transform.y': t.transform.y + (py - cy) },
          nowSeconds(),
        ),
        key,
        { quiet: true },
      );
    } else {
      commit(
        applyValues(state, id, endForWorld(tip.layer, tip.worlds, wx, wy), nowSeconds()),
        key,
        {
          quiet: true,
        },
      );
    }
    syncLayerFields();
  }
  /** Is the screen point on the selected bolt's tip handle? @param {any} fm @param {number[]} pt */
  function onBoltTip(fm, pt) {
    if (!selected || noHandles()) return false;
    const tip = boltTip(selected);
    if (!tip) return false;
    const [x, y] = toMap(fm).toScreen(tip.end[0], tip.end[1]);
    return Math.hypot(x - pt[0], y - pt[1]) <= 11;
  }
  /**
   * The selected bolt's tip handle (◆) and a dashed line to it; linked to its target.
   * @param {CanvasRenderingContext2D} ctx @param {import('../viewport.js').FrameMap} fm
   */
  function paintBoltTip(ctx, fm) {
    if (!selected) return;
    const tip = boltTip(selected);
    if (!tip) return;
    const map = toMap(fm);
    const [sx, sy] = map.toScreen(tip.start[0], tip.start[1]);
    const [ex, ey] = map.toScreen(tip.end[0], tip.end[1]);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#7fd8ff';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = tip.layer.target ? '#7fd8ff' : '#111216';
    ctx.strokeStyle = '#7fd8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex, ey - 8);
    ctx.lineTo(ex + 8, ey);
    ctx.lineTo(ex, ey + 8);
    ctx.lineTo(ex - 8, ey);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  /**
   * The active emitter's spawn shape (dotted) and its direction arrow (4.Pb).
   * @param {CanvasRenderingContext2D} ctx @param {import('../viewport.js').FrameMap} fm
   */
  function paintEmitterShape(ctx, fm) {
    const l = selectedLayer();
    if (!l || !isEmitterType(l.type)) return;
    const lays = layersNow();
    const me = lays.find((x) => x.id === l.id);
    if (!me) return;
    const W = worldMatrices(lays).get(me.id) ?? [1, 0, 0, 1, 0, 0];
    const map = toMap(fm);
    const P = me.params;
    const w = P['emit.width'] ?? 0;
    const hh = P['emit.height'] ?? 0;
    const S = (/** @type {number} */ x, /** @type {number} */ y) =>
      map.toScreen(...applyMat(W, x, y));
    /** @type {[number, number][]} */
    let pts = [];
    let closed = false;
    const shape = P['emit.shape'];
    if (shape === 'line') pts = [S(-w / 2, 0), S(w / 2, 0)];
    else if (shape === 'circle' || shape === 'ring') {
      closed = true;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push(S((Math.cos(a) * w) / 2, (Math.sin(a) * w) / 2));
      }
    } else if (shape === 'box') {
      closed = true;
      pts = [S(-w / 2, -hh / 2), S(w / 2, -hh / 2), S(w / 2, hh / 2), S(-w / 2, hh / 2)];
    }
    ctx.save();
    ctx.strokeStyle = '#ffd34d';
    ctx.fillStyle = '#ffd34d';
    ctx.lineWidth = 1.5;
    if (pts.length) {
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      for (const [i, [x, y]] of pts.entries()) {
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      if (closed) ctx.closePath();
      ctx.stroke();
    }
    // direction (0 = up), 40 screen px long
    const [ox, oy] = S(0, 0);
    const a = (((P['emit.direction'] ?? 0) - 90) * Math.PI) / 180;
    const [tx, ty] = S(Math.cos(a), Math.sin(a));
    const len = Math.hypot(tx - ox, ty - oy) || 1;
    const dx = (tx - ox) / len;
    const dy = (ty - oy) / len;
    const ex = ox + dx * 40;
    const ey = oy + dy * 40;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex + dx * 6, ey + dy * 6);
    ctx.lineTo(ex - dy * 5, ey + dx * 5);
    ctx.lineTo(ex + dy * 5, ey - dx * 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  /**
   * The motion path the active layer follows (dashed), with a dot where it is now.
   * @param {CanvasRenderingContext2D} ctx @param {import('../viewport.js').FrameMap} fm
   */
  function paintFollowPath(ctx, fm) {
    const l = selectedLayer();
    if (!l?.follow) return;
    const lays = layersNow();
    const src = lays.find((x) => x.id === l.follow?.layer);
    const m = src?.masks?.find((x) => x.id === l.follow?.mask);
    if (!src || !m) return;
    const worlds = worldMatrices(lays);
    const W = worlds.get(src.id) ?? [1, 0, 0, 1, 0, 0];
    const map = toMap(fm);
    const pts = maskOutline(m).map(([x, y]) => map.toScreen(...applyMat(W, x, y)));
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ff8a3d';
    ctx.beginPath();
    for (const [i, [x, y]] of pts.entries()) {
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    if (m.closed !== false) ctx.closePath();
    ctx.stroke();
    const me = lays.find((x) => x.id === l.id);
    if (me) {
      const [x, y] = map.toScreen(
        ...applyMat(
          worlds.get(me.id) ?? [1, 0, 0, 1, 0, 0],
          me.transform.anchorX,
          me.transform.anchorY,
        ),
      );
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  /** Last click on a vertex (double-click converts corner ↔ smooth). */
  let lastVertexClick = { i: -1, t: 0 };

  // ── Pen tool (After Effects' G): click = corner point, click-drag = smooth point, click the
  // first point / Enter = close the path into a mask, ⌫ = remove the last point, Esc = cancel.
  const penBtn = h(
    'button',
    {
      type: 'button',
      class: 'vp-tool',
      title:
        'Pen tool (G): draw your own mask on the selected layer. Click = corner, click-drag = smooth curve, click the first point or Enter = close.',
      onclick: () => setPenTool(!penTool),
    },
    ['✒ Pen'],
  );
  viewport.addTool(penBtn);
  /** @param {boolean} on */
  function setPenTool(on) {
    penTool = on;
    penPts = [];
    penHover = null;
    penBtn.classList.toggle('active', on);
    penBtn.setAttribute('aria-pressed', String(on));
    if (on) maskTarget = '';
    viewport.redraw();
    if (on)
      notify(
        'Pen: click to add points, drag for curves. Click the first point = closed mask · Enter = open path (motion path). Esc cancels.',
      );
    else notify('');
  }
  /** Layer px ↔ screen for the active layer (pen drawing). @param {import('../viewport.js').FrameMap} fm */
  const layerView = (fm) => {
    const lays = layersNow();
    const world = worldMatrices(lays).get(selected) ?? [1, 0, 0, 1, 0, 0];
    const map = toMap(fm);
    return {
      toScreen: (/** @type {number} */ x, /** @type {number} */ y) =>
        map.toScreen(...applyMat(world, x, y)),
      toLayer: (/** @type {number} */ sx, /** @type {number} */ sy) =>
        /** @type {[number, number]} */ (applyMat(invert(world), ...map.toEffect(sx, sy))),
    };
  };
  /** @param {CanvasRenderingContext2D} ctx @param {import('../viewport.js').FrameMap} fm */
  function paintPen(ctx, fm) {
    const v = layerView(fm);
    ctx.save();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    penPts.forEach((p, i) => {
      const [x, y] = v.toScreen(p.x, p.y);
      if (!i) ctx.moveTo(x, y);
      else {
        const a = penPts[i - 1];
        ctx.bezierCurveTo(
          ...v.toScreen(a.x + a.ox, a.y + a.oy),
          ...v.toScreen(p.x - p.ox, p.y - p.oy),
          x,
          y,
        );
      }
    });
    // dark under-stroke so the line reads on bright fire too
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (penHover && penPts.length && !penDragging) {
      const a = penPts[penPts.length - 1];
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(...v.toScreen(a.x, a.y));
      ctx.lineTo(...v.toScreen(...penHover));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    penPts.forEach((p, i) => {
      const [x, y] = v.toScreen(p.x, p.y);
      if (p.ox || p.oy) {
        for (const s of [1, -1]) {
          const [hx, hy] = v.toScreen(p.x + s * p.ox, p.y + s * p.oy);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          ctx.fillStyle = '#ffd166';
          ctx.beginPath();
          ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const r = i === 0 && penPts.length >= 3 ? 7 : 4.5; // the first point is the close target
      ctx.fillStyle = i === 0 ? '#ffd166' : '#ffffff';
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    ctx.restore();
  }
  /** @param {boolean} [closed] Enter = open path (2+ points), click the first point = closed */
  function finishPen(closed = false) {
    if (penPts.length < (closed ? 3 : 2) || !selected) return;
    const shape = pathFromPoints(penPts);
    const r = addMask(state, selected, 'path', { ...shape, ...(closed ? {} : { closed: false }) });
    penPts = [];
    setPenTool(false);
    maskTarget = r.maskId;
    commit(r.state);
  }
  // Pen keys come first while drawing (Enter / Esc / ⌫).
  document.addEventListener(
    'keydown',
    (e) => {
      if (!penPts.length) return;
      if (e.key === 'Enter') finishPen();
      else if (e.key === 'Escape') setPenTool(false);
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        penPts = penPts.slice(0, -1);
        viewport.redraw();
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  const CURSORS = { move: 'move', anchor: 'crosshair', rotate: 'grab', scale: 'nwse-resize' };
  // Pan Behind (After Effects' Y tool): dragging the centre moves only the anchor point —
  // the same as ⌥-drag, but without holding a key (pen-friendly).
  let panBehind = false;
  const panBtn = h(
    'button',
    {
      type: 'button',
      class: 'vp-tool',
      title: 'Pan Behind (Y): drag the centre to move only the anchor point. Same as ⌥-drag.',
      onclick: () => setPanBehind(!panBehind),
    },
    ['✥ Pan Behind'],
  );
  viewport.addTool(panBtn);
  /** With Pan Behind on, dragging anywhere in the box moves the anchor (AE Y tool). @param {import('./gizmo.js').GizmoHit} hit */
  const panHit = (hit) => (panBehind && hit === 'move' ? 'anchor' : hit);
  /** @param {boolean} on */
  function setPanBehind(on) {
    panBehind = on;
    panBtn.classList.toggle('active', on);
    panBtn.setAttribute('aria-pressed', String(on));
  }
  viewport.setInteraction({
    hover(pt, e, fm) {
      if (penTool) {
        penHover = selected ? layerView(fm).toLayer(pt[0], pt[1]) : null;
        if (penPts.length) viewport.redraw();
        return 'crosshair';
      }
      const mh = maskHit(fm, pt[0], pt[1]);
      if (mh)
        return mh.kind === 'move'
          ? 'move'
          : mh.kind === 'vertex' || mh.kind === 'handle'
            ? 'pointer'
            : 'nwse-resize';
      if (maskTarget) return '';
      if (onBoltTip(fm, pt)) return 'move';
      const g = selected && !noHandles() ? gizmoGeometry(layersNow(), selected, toMap(fm)) : null;
      const hit = panHit(g ? hitTest(g, pt[0], pt[1], { alt: e.altKey || panBehind }) : null);
      return hit ? CURSORS[hit] : '';
    },
    down(pt, e, fm) {
      if (penTool) {
        if (!selected || noHandles()) {
          notify('Pick a layer first — the pen draws a mask on the selected layer.');
          return true;
        }
        timeline.stop();
        const v = layerView(fm);
        if (penPts.length >= 3) {
          const [fx, fy] = v.toScreen(penPts[0].x, penPts[0].y);
          if (Math.hypot(fx - pt[0], fy - pt[1]) <= 10) {
            finishPen(true);
            return true;
          }
        }
        const [x, y] = v.toLayer(pt[0], pt[1]);
        penPts = [...penPts, { x, y, ox: 0, oy: 0 }];
        penDragging = true;
        viewport.redraw();
        return true;
      }
      const mh = maskHit(fm, pt[0], pt[1]);
      if (mh && mh.kind === 'vertex') {
        const now = performance.now();
        if (lastVertexClick.i === mh.index && now - lastVertexClick.t < 400) {
          // double-click: corner ↔ smooth
          lastVertexClick = { i: -1, t: 0 };
          setMaskValues(
            { [`mask.${mh.m.id}.path`]: /** @type {any} */ (toggleSmooth(mh.m, mh.index)) },
            '',
          );
          return true;
        }
        lastVertexClick = { i: mh.index, t: now };
      }
      if (mh) {
        timeline.stop();
        maskDrag = {
          m0: { ...mh.m },
          p0: mh.v.toLayer(pt[0], pt[1]),
          what:
            mh.kind === 'move'
              ? { kind: 'move' }
              : mh.kind === 'vertex'
                ? { kind: 'vertex', index: mh.index }
                : mh.kind === 'handle'
                  ? { kind: 'handle', index: mh.index, which: mh.which }
                  : { kind: 'corner', corner: mh.corner },
          key: `${selected}:mask:${++gizmoDrags}`,
        };
        return true;
      }
      if (maskTarget) {
        // clicked away from the targeted mask: stop editing it, back to the layer handles
        maskTarget = '';
        mountMasks(selectedLayer());
        viewport.redraw();
      }
      if (!selected || noHandles()) return false;
      if (onBoltTip(fm, pt)) {
        timeline.stop();
        boltDrag = { id: selected, key: `${selected}:tip:${++gizmoDrags}` };
        return true;
      }
      const map = toMap(fm);
      const g = gizmoGeometry(layersNow(), selected, map);
      const hit = panHit(g ? hitTest(g, pt[0], pt[1], { alt: e.altKey || panBehind }) : null);
      if (!hit) return false;
      timeline.stop();
      // Each handle drag is ONE undo step (its own history key).
      gizmoDrag = {
        d: startDrag(layersNow(), selected, hit, map.toEffect(...pt)),
        id: selected,
        key: `${selected}:gizmo:${++gizmoDrags}`,
      };
      gizmoActive = hit;
      return true;
    },
    move(pt, e, fm) {
      if (penTool) {
        if (!penDragging || !penPts.length) return;
        // click-drag: pull out symmetric bezier handles
        const [x, y] = layerView(fm).toLayer(pt[0], pt[1]);
        const last = penPts[penPts.length - 1];
        penPts = [...penPts.slice(0, -1), { ...last, ox: x - last.x, oy: y - last.y }];
        viewport.redraw();
        return;
      }
      if (maskDrag && (maskDrag.what.kind === 'vertex' || maskDrag.what.kind === 'handle')) {
        const v = maskView(fm);
        if (!v) return;
        const p = v.toLayer(pt[0], pt[1]);
        const w = maskDrag.what;
        const path =
          w.kind === 'vertex'
            ? moveVertex(maskDrag.m0, w.index, p)
            : moveHandle(maskDrag.m0, w.index, w.which, p, e.altKey);
        setMaskValues({ [`mask.${maskDrag.m0.id}.path`]: /** @type {any} */ (path) }, maskDrag.key);
        return;
      }
      if (maskDrag) {
        const v = maskView(fm);
        if (!v) return;
        const r = dragMask(maskDrag.m0, maskDrag.p0, v.toLayer(pt[0], pt[1]), maskDrag.what, {
          shift: e.shiftKey,
        });
        const id = maskDrag.m0.id;
        /** @type {Record<string, number>} */
        const changes = {};
        for (const [k, val] of Object.entries(r)) {
          if (val !== /** @type {any} */ (maskDrag.m0)[k]) changes[`mask.${id}.${k}`] = val;
        }
        if (Object.keys(changes).length) setMaskValues(changes, maskDrag.key);
        return;
      }
      if (boltDrag) {
        dragBoltTip(boltDrag.id, ...toMap(fm).toEffect(...pt), boltDrag.key);
        return;
      }
      if (!gizmoDrag) return;
      const transform = dragTo(gizmoDrag.d, toMap(fm).toEffect(...pt), {
        shift: e.shiftKey,
        linked: isLinked(gizmoDrag.id),
      });
      /** @type {Record<string, any>} */
      const changes = {};
      for (const [k, v] of Object.entries(transform)) {
        if (v !== /** @type {any} */ (gizmoDrag.d.transform)[k]) changes[`transform.${k}`] = v;
      }
      commit(applyValues(state, gizmoDrag.id, changes, nowSeconds()), gizmoDrag.key, {
        quiet: true,
      });
      syncTransformFields();
    },
    up() {
      penDragging = false;
      boltDrag = null;
      maskDrag = null;
      gizmoDrag = null;
      gizmoActive = null;
      viewport.redraw();
    },
  });

  // ── 3.7 quick wins: keyframe navigation, centre layer / anchor ──────────────────────────
  /** @param {-1 | 1} dir */
  function jumpToKey(dir) {
    const f = jumpKey(
      keyFrames(state, state.timing.fps, state.timing.frameCount),
      timeline.getFrame(),
      dir,
    );
    if (f === null) return;
    timeline.stop();
    timeline.setFrame(f);
  }
  function centreSelected() {
    if (selected) commit(centreLayer(state, selected, nowSeconds()), '', { quiet: true });
    syncLayerFields();
  }
  function centreSelectedAnchor() {
    if (selected) commit(centreAnchor(state, selected, nowSeconds()), '', { quiet: true });
    syncLayerFields();
  }
  $('layer-centre').addEventListener('click', centreSelected);
  $('layer-centre-anchor').addEventListener('click', centreSelectedAnchor);
  // ── Shortcuts (3.7d): one After Effects–style list for keys + the ? sheet ───────────────
  /** Frame clamped to the comp (no wrap, as in After Effects). @param {number} f */
  const goFrame = (f) => {
    timeline.stop();
    timeline.setFrame(Math.max(0, Math.min(state.timing.frameCount - 1, f)));
  };
  const end = () => state.timing.frameCount / state.timing.fps;
  /** Change the time of every selected layer. @param {(t: any) => any} fn */
  const retimeSelection = (fn) => {
    let next = state;
    for (const id of selectionInStack()) {
      const l = next.layers.find((x) => x.id === id);
      if (l) next = updateLayer(next, id, { time: fn(l.time) });
    }
    commit(next, '', { quiet: true });
  };
  /** @type {import('./editorShortcuts.js').EditorActions} */
  const actions = {
    playToggle: () => (timeline.isPlaying() ? timeline.stop() : timeline.play()),
    step: (n) => goFrame(timeline.getFrame() + n),
    goEnd: (where) => goFrame(where === 'first' ? 0 : state.timing.frameCount - 1),
    jumpKey: (dir) => jumpToKey(dir),
    goLayerEdge(edge) {
      const l = selectedLayer();
      if (!l) return;
      const f = layerFrames(l.time, state.timing.fps, state.timing.frameCount);
      goFrame(edge === 'in' ? f.first : f.last);
    },
    alignEdge: (edge) =>
      retimeSelection((t) => alignLayerTime(t, edge, nowSeconds(), end(), state.timing.fps)),
    trimEdge: (edge) =>
      retimeSelection((t) => trimLayerTime(t, edge, nowSeconds(), end(), state.timing.fps)),
    toggleLanes: () => layerTimeline?.toggleLanes(),
    reveal(ids, add) {
      layerTimeline?.revealLanes(ids, add);
      // bring the first matching inspector row into view, like AE twirling the property open
      const row = [
        ...document.querySelectorAll(
          '#layer-transform-host .insp-row, #layer-settings-host .insp-row',
        ),
      ].find((r) => r.textContent?.includes(paramLabel(selected, ids[0])));
      row?.scrollIntoView({ block: 'nearest' });
    },
    selectAllLayers: () =>
      setSelection(
        selected || state.layers.at(-1)?.id || '',
        state.layers.map((l) => l.id),
      ),
    selectAllKeys: () => layerTimeline?.selectKeys(allKeys(state, selIds)),
    duplicate: () => duplicateSelection(),
    deleteSelection() {
      if (layerTimeline?.deleteSelectedKeys()) return true;
      deleteSelection();
      return true;
    },
    clearKeySelection() {
      if (!layerTimeline?.selectedKeys().length) return false;
      layerTimeline.selectKeys([]);
      return true;
    },
    copyKeys: () => copySelectedKeys(),
    pasteKeys: () => pasteKeysHere(),
    interp: (kind) => interpKeys(layerTimeline?.selectedKeys() ?? [], kind),
    velocity() {
      const refs = layerTimeline?.selectedKeys() ?? [];
      if (refs.length) openVelocity(refs);
      return true;
    },
    toggleGraph: () =>
      layerTimeline?.setMode(layerTimeline.mode() === 'graph' ? 'layers' : 'graph'),
    zoom: (f) => layerTimeline?.zoom(f),
    toggleZoom: () => layerTimeline?.toggleZoom(),
    undo: () => undo(),
    redo: () => redo(),
    centre: () => centreSelected(),
    panBehind: () => setPanBehind(!panBehind),
    copySettings: () => copySettings(),
    pasteSettings: () => pasteSettings(),
    pen: () => setPenTool(!penTool),
    precompose: () => precomposeSelection(),
    openPrecomp() {
      if (selectedLayer()?.type !== 'precomp') return false;
      openPrecomp(selected);
    },
    closePrecomp() {
      if (!compPath.length) return false;
      closeCompTo(compPath.length - 1);
    },
    revealMasks(add) {
      const l = selectedLayer();
      const ids = (l?.masks ?? []).flatMap((m) =>
        ['x', 'y', 'w', 'h', 'feather', 'opacity'].map((f) => `mask.${m.id}.${f}`),
      );
      if (ids.length) layerTimeline?.revealLanes(ids, add);
    },
    centreAnchor: () => centreSelectedAnchor(),
    cheatSheet: () => openCheatSheet(shortcuts.list),
    variants: () => openVariants(),
    pixelMode: () => togglePixel(),
  };
  const shortcuts = createShortcuts(editorShortcutList(actions));
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return; // dialogs handle their own keys
    shortcuts.handle(e);
  });
  $('shortcuts')?.addEventListener('click', () => openCheatSheet(shortcuts.list));

  // ── Interpolation (3.7c): Easy Ease, Linear, Hold, Keyframe Velocity ────────────────────
  /** @param {import('../../effects/keyEdit.js').KeyRef[]} refs @param {import('../../effects/keyInterp.js').InterpKind} kind */
  function interpKeys(refs, kind) {
    if (!refs.length) return false;
    commit(applyInterp(state, refs, kind), '', { quiet: true });
    syncLayerFields();
    return true;
  }
  const UNIT_OF = /** @type {Record<string, string>} */ ({
    'layer.opacity': '%',
    'transform.scaleX': '%',
    'transform.scaleY': '%',
    'transform.rotation': '°',
  });
  /** Keyframe Velocity dialog for the selected keys (values from the first one). @param {import('../../effects/keyEdit.js').KeyRef[]} refs */
  function openVelocity(refs) {
    const first = refs[0];
    const l = first && state.layers.find((x) => x.id === first.layerId);
    if (!l) return;
    const list = l.keys?.[first.paramId] ?? [];
    const i = list.findIndex((k) => Math.abs(k.t - first.t) < 1e-4);
    if (i < 0) return;
    const numeric = isNumericParam(l, first.paramId);
    const vel = keyVelocity(list, i, numeric);
    const unit = numeric
      ? (UNIT_OF[first.paramId] ??
        (first.paramId.startsWith('transform.')
          ? 'px'
          : (defOf(l, first.paramId)?.unit ?? 'units')))
      : 'progress';
    const params = new Set(refs.map((r) => `${r.layerId}|${r.paramId}`));
    openVelocityDialog(
      {
        in: vel.in && { speed: vel.in.speed, influence: vel.in.influence },
        out: vel.out && { speed: vel.out.speed, influence: vel.out.influence },
        units: `${unit} / s`,
        title:
          refs.length === 1
            ? `${l.label} · ${paramLabel(l.id, first.paramId)}`
            : `${refs.length} keys on ${params.size} propert${params.size === 1 ? 'y' : 'ies'} (values from the first)`,
      },
      (r) => {
        commit(setVelocity(state, refs, r), '', { quiet: true });
        syncLayerFields();
      },
    );
  }

  // ── Copy / paste keys (3.7b) ─────────────────────────────────────────────────────────────
  /** @type {import('../../effects/keyEdit.js').KeyClip | null} */
  let keyClip = null;
  function copySelectedKeys() {
    const refs = layerTimeline?.selectedKeys() ?? [];
    if (!refs.length) return false;
    keyClip = copyKeys(state, refs);
    notify(`Copied ${refs.length} key${refs.length === 1 ? '' : 's'}. ⌘V pastes at the playhead.`);
    return true;
  }
  function pasteKeysHere() {
    if (!keyClip) return false;
    const r = pasteKeys(state, keyClip, selIds, nowSeconds(), state.timing.fps, layerHasParam);
    if (!r.refs.length) {
      notify('Nothing pasted: the selected layers don’t have those parameters.');
      return true;
    }
    commit(r.state, '', { quiet: true });
    syncLayerFields();
    layerTimeline?.selectKeys(r.refs);
    notify('');
    return true;
  }

  // ── Colour ramp library (3.8): contact sheet previewed on the active layer ───────────────
  const thumbRenderer = createRenderer({
    backend: createCanvas2DBackend(),
    layerTypes: LAYER_TYPES,
  });
  /**
   * Bounding box of solid-ish pixels (alpha > 48, so soft glows don't shrink the view), with a small margin; null when empty.
   * @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} hh
   */
  function alphaBounds(ctx, w, hh) {
    const d = ctx.getImageData(0, 0, w, hh).data;
    let x0 = w;
    let y0 = hh;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 48) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    const m = Math.max(6, Math.round(Math.max(x1 - x0, y1 - y0) * 0.08));
    const x = Math.max(0, x0 - m);
    const y = Math.max(0, y0 - m);
    return { x, y, w: Math.min(w, x1 + m + 1) - x, h: Math.min(hh, y1 + m + 1) - y };
  }
  function openRamps() {
    const l = selectedLayer();
    if (!l || !hasRampLayer(l)) {
      notify('This layer has no colour ramp (pick a layer that draws something).');
      return;
    }
    timeline.stop();
    // Each tile shows the layer at three moments of its life (early / middle / late), so the
    // whole ramp is visible, zoomed onto what the layer draws.
    const cw = 72;
    const tw = cw * 3;
    const th = 84;
    const others = selIds.filter(
      (id) => id !== l.id && hasRampLayer(state.layers.find((x) => x.id === id)),
    ).length;
    const rampId = /** @type {string} */ (rampParamOf(l));
    // A Gradient Map recolours what is below it, so preview it on the whole comp (no solo).
    const adjust = isAdjustmentType(l.type);
    const now = JSON.stringify(layerAt(l, nowSeconds()).params[rampId]);
    const currentKey = Object.keys(RAMP_PRESETS).find(
      (k) => JSON.stringify(RAMP_PRESETS[k].stops) === now,
    );
    /** Frames to show (found on the first preview: where the layer actually draws). @type {number[] | null} */
    let moments = null;
    /** @param {any} effect @param {number} scale */
    const findMoments = (effect, scale) => {
      const fc = state.timing.frameCount;
      const step = Math.max(1, Math.floor(fc / 48));
      const seen = [];
      for (let f = 0; f < fc; f += step) {
        const out = thumbRenderer.renderFrame(effect, seed, f, {
          width: 48,
          height: 48,
          scale: (scale * 48) / Math.max(frame.w, frame.h),
        });
        if (alphaBounds(out.ctx, 48, 48)) seen.push(f);
      }
      if (!seen.length) return [timeline.getFrame()];
      return [0.12, 0.45, 0.8].map((u) => seen[Math.round(u * (seen.length - 1))]);
    };
    const k = 3; // render bigger, then crop
    const rw = Math.round(cw * k * (frame.w / Math.max(frame.w, frame.h)) * 2);
    const rh = Math.round((rw * frame.h) / frame.w);
    /** Crop per moment, from the first preview, so every tile is framed the same. @type {({ x: number, y: number, w: number, h: number } | null | undefined)[]} */
    const crops = [];
    openRampPicker({
      title: others ? `${l.label} (and ${others} more selected)` : l.label,
      thumbW: tw,
      thumbH: th,
      currentKey,
      thumb(stops, canvas) {
        const base = state.layers.find((x) => x.id === l.id) ?? l;
        const { [rampId]: _anim, ...keys } = base.keys ?? {};
        const preview = {
          ...state,
          layers: state.layers.map((x) =>
            x.id === l.id
              ? {
                  ...x,
                  solo: !adjust,
                  enabled: true,
                  keys,
                  params: { ...x.params, [rampId]: stops.map((st) => ({ ...st })) },
                }
              : adjust
                ? x
                : { ...x, solo: false },
          ),
        };
        const { effect, scale } = buildExplosion(preview);
        const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
        c.fillStyle = '#24222b';
        c.fillRect(0, 0, tw, th);
        moments ??= findMoments(effect, scale);
        moments.forEach((f, i) => {
          const out = thumbRenderer.renderFrame(effect, seed, f, {
            width: rw,
            height: rh,
            scale: (scale * rw) / frame.w,
          });
          if (crops[i] === undefined) crops[i] = alphaBounds(out.ctx, rw, rh);
          const box = crops[i];
          if (!box) return;
          const fit = Math.min((cw - 6) / box.w, (th - 6) / box.h, 2);
          const dw = box.w * fit;
          const dh = box.h * fit;
          c.drawImage(
            out.canvas,
            box.x,
            box.y,
            box.w,
            box.h,
            i * cw + (cw - dw) / 2,
            (th - dh) / 2,
            dw,
            dh,
          );
        });
      },
      onPick(key) {
        // every selected layer gets it in its own ramp (drawing layers and Gradient Maps)
        setValues({ 'style.ramp': rampPreset(key), 'gmap.ramp': rampPreset(key) }, '');
      },
    });
  }
  $('layer-ramps')?.addEventListener('click', openRamps);

  // ── Variants (D-083): a grid of variations of the whole effect; click one to use it ─────
  /** @type {import('./variantsPanel.js').VariantPrefs} */
  const variantPrefs = {
    mode: 'subtle',
    amount: 0,
    wildness: 0.6,
    lock: { shape: false, motion: false, colour: true },
    lockedLayers: new Set(),
  };
  function openVariants() {
    timeline.stop();
    openVariantsPanel({
      doc: root,
      build: (doc) => buildExplosion(viewOf(doc)),
      renderer: thumbRenderer,
      snapFor: (doc, w) => {
        const px = pixelOf(doc);
        return px ? snapSettings(px.p, w) : {};
      },
      post: (out, doc) => {
        const px = pixelOf(doc);
        return px ? toPixelSurface(out, px, thumbRenderer) : out;
      },
      seed,
      frame,
      timing: state.timing,
      layers: [...state.layers].reverse().map((l) => ({ id: l.id, label: l.label })),
      prefs: variantPrefs,
      onAdopt(doc) {
        history.record(root, '');
        root = doc;
        state = viewOf(root);
        tidySelection();
        refresh({ remount: true });
        notify('Variation applied (⌘Z to go back).');
      },
      onClose: () => show(),
    });
  }
  $('variants')?.addEventListener('click', openVariants);

  $('layer-reseed').addEventListener('click', () => {
    if (selected) commit(reseedLayer(state, selected), '', { quiet: true });
  });

  // ── Copy / paste layer settings (D-074) ────────────────────────────────────────────────
  /** @type {import('../../effects/settingsClipboard.js').SettingsClip | null} */
  let settingsClip = null;
  function copySettings() {
    const l = selectedLayer();
    if (!l) return false;
    settingsClip = copyLayerSettings(l);
    /** @type {HTMLButtonElement} */ ($('layer-paste-settings')).disabled = false;
    notify(`Copied the settings of “${l.label}”. Select layers and press 📥 Paste…`);
    return true;
  }
  function pasteSettings() {
    const clip = settingsClip;
    if (!clip) {
      notify('Copy a layer’s settings first (📋 Copy).');
      return false;
    }
    const targets = selectionInStack();
    if (!targets.length) return false;
    const types = state.layers.filter((l) => targets.includes(l.id)).map((l) => l.type);
    const groups = pasteGroups(clip, types);
    openPasteDialog(
      {
        from: clip.label,
        to: targets.length > 1 ? `${targets.length} layers` : `“${selectedLayer()?.label ?? ''}”`,
        groups,
      },
      (chosen) => {
        commit(pasteLayerSettings(state, targets, clip, chosen));
        notify(`Pasted ${chosen.length} group${chosen.length > 1 ? 's' : ''} of settings.`);
      },
    );
    return true;
  }
  $('layer-copy-settings').addEventListener('click', copySettings);
  $('layer-paste-settings').addEventListener('click', pasteSettings);

  const frameSizeMenu = bindFrameSize(
    $('size'),
    frame,
    (size) => {
      frame.w = size.w;
      frame.h = size.h;
      viewport.setFrameSize(frame.w, frame.h);
      show();
    },
    { w: $('frame-w'), h: $('frame-h') },
  );
  /** Frame size from a file / preset (3.7). @param {{ w: number, h: number }} size */
  function applyCanvas(size) {
    frame.w = size.w;
    frame.h = size.h;
    frameSizeMenu.set(frame);
    viewport.setFrameSize(frame.w, frame.h);
  }
  $('seed').value = String(seed);
  $('seed').addEventListener('change', () => {
    seed = Math.trunc(Number($('seed').value)) >>> 0;
    show();
  });
  $('dice').addEventListener('click', () => {
    seed = crypto.getRandomValues(new Uint32Array(1))[0]; // UI input, not render path
    $('seed').value = String(seed);
    show();
  });
  /** Base stack (no preset) has the empty id; my presets are "my:<name>". */
  let presetId = '';
  const myPresets = createUserPresets();
  const MY = 'my:';

  /**
   * (Re)build the two preset menus: built-in presets (base + families) and My presets. The one
   * that is not in use shows its placeholder.
   */
  function fillPresetMenu() {
    const mine = myPresets.names();
    const isMine = presetId.startsWith(MY);
    $('preset').replaceChildren(
      h('option', { value: '' }, [isMine ? '— (using My presets)' : 'Base (no preset)']),
      h(
        'optgroup',
        { label: 'Explosions' },
        EXPLOSION_PRESETS.map((p) => h('option', { value: p.id, title: p.blurb }, [p.name])),
      ),
      ...COMPOSED_PRESET_GROUPS.map((g) =>
        h(
          'optgroup',
          { label: g.label },
          g.presets.map((p) => h('option', { value: p.id, title: p.blurb }, [p.name])),
        ),
      ),
    );
    $('my-preset').replaceChildren(
      h('option', { value: '' }, [mine.length ? 'Choose…' : 'None saved yet']),
      ...mine.map((n) => h('option', { value: MY + n }, [n])),
    );
    /** @type {HTMLSelectElement} */ ($('my-preset')).disabled = !mine.length;
    $('preset').value = isMine ? '' : presetId;
    $('my-preset').value = isMine ? presetId : '';
    $('delete-preset').disabled = !isMine;
  }
  fillPresetMenu();
  $('preset').addEventListener('change', () => {
    presetId = $('preset').value;
    fillPresetMenu();
    load();
  });
  $('my-preset').addEventListener('change', () => {
    const v = $('my-preset').value;
    if (!v) return;
    presetId = v;
    fillPresetMenu();
    load();
  });

  /** Put a loaded state on screen (a fresh start: undo history is cleared). @param {typeof state} next */
  function apply(next) {
    root = next;
    compPath = [];
    reopen();
    history.clear();
    if (!state.layers.some((l) => l.id === selected)) {
      selected = state.layers.find((l) => l.id === 'fireball')?.id ?? state.layers.at(-1)?.id ?? '';
      selIds = selected ? [selected] : [];
    }
    tidySelection();
    timeline.setTiming({ ...state.timing, phases: buildExplosion(state).effect.timing.phases });
    refresh({ remount: true });
  }

  /** Short message under the top bar (load warnings, save results). @param {string} text */
  let noticeTimer = 0;
  function notify(text) {
    $('notice').textContent = text;
    $('notice').hidden = !text;
    // messages fade out on their own (they float over the editor)
    clearTimeout(noticeTimer);
    if (text) {
      noticeTimer = window.setTimeout(() => {
        if ($('notice').textContent === text) $('notice').hidden = true;
      }, 8000);
    }
  }

  /** Load the chosen preset fresh (also what Reset does). */
  function load() {
    notify('');
    if (presetId.startsWith(MY)) {
      const r = parseExplosion(myPresets.get(presetId.slice(MY.length)) ?? {});
      if (r.state) {
        if (r.canvas) applyCanvas(r.canvas);
        if (r.seed !== undefined) {
          seed = r.seed;
          $('seed').value = String(seed);
        }
        apply(r.state);
        if (r.warnings.length) notify(`Loaded with fixes: ${r.warnings.join(' · ')}`);
        return;
      }
      notify(`Could not load "${presetId.slice(MY.length)}": ${r.error}`);
    }
    apply(
      presetId && !presetId.startsWith(MY)
        ? createExplosionFromPreset(presetId)
        : createExplosion(),
    );
  }

  const currentName = () =>
    presetId.startsWith(MY)
      ? presetId.slice(MY.length)
      : (explosionPreset(presetId)?.name ?? 'explosion');

  // Save as my preset (kept in this browser)
  $('save-preset').addEventListener('click', () => {
    const name = prompt(
      'Name for this preset:',
      presetId.startsWith(MY) ? currentName() : '',
    )?.trim();
    if (!name) return;
    if (myPresets.names().includes(name) && !confirm(`Replace your preset "${name}"?`)) return;
    if (!myPresets.save(name, serializeExplosion(root, { seed, name, canvas: frame }))) {
      notify(
        root.assets && Object.keys(root.assets).length
          ? 'Could not save in this browser: imported textures may be too big for its storage. Use "Save file…" instead.'
          : 'Could not save in this browser (storage is blocked). Use "Save file…" instead.',
      );
      return;
    }
    presetId = MY + name;
    fillPresetMenu();
    notify(
      `Saved "${name}" to My presets (in this browser). Use "Save file…" for a copy you can keep.`,
    );
  });
  $('delete-preset').addEventListener('click', () => {
    if (!presetId.startsWith(MY)) return;
    const name = presetId.slice(MY.length);
    if (!confirm(`Delete your preset "${name}"?`)) return;
    myPresets.remove(name);
    presetId = '';
    fillPresetMenu();
    load();
  });

  // Save / open files
  $('save-file').addEventListener('click', () => {
    const name = currentName();
    const text = `${JSON.stringify(serializeExplosion(root, { seed, name, canvas: frame }), null, 2)}\n`;
    download(new Blob([text], { type: 'application/json' }), `${fileStem(name)}${EFFECT_FILE_EXT}`);
  });
  $('open-file').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', async () => {
    const file = $('file-input').files?.[0];
    $('file-input').value = '';
    if (!file) return;
    const r = parseExplosion(await file.text());
    if (!r.state) {
      notify(`Could not open ${file.name}: ${r.error}`);
      return;
    }
    if (r.canvas) applyCanvas(r.canvas);
    if (r.seed !== undefined) {
      seed = r.seed;
      $('seed').value = String(seed);
    }
    presetId = '';
    fillPresetMenu();
    apply(r.state);
    notify(
      r.warnings.length
        ? `Opened ${file.name} with fixes: ${r.warnings.join(' · ')}`
        : `Opened ${file.name}. Use "Save as my preset…" to add it to the menu.`,
    );
  });
  $('reset').addEventListener('click', load);

  refresh({ remount: true });
  timeline.play();

  const exportPanel = createExportPanel({
    renderer,
    getSource: () => {
      // always the whole effect (main comp), also while a precomp is open
      const { effect, scale } = buildExplosion(root);
      const px = pixelOf(root);
      if (!px) return { effect, seed, width: frame.w, height: frame.h, scale };
      return {
        effect,
        seed,
        width: frame.w,
        height: frame.h,
        scale,
        pixelSize: pixelGrid(frame.w, frame.h, px.p.size),
        snap: snapSettings(px.p, frame.w),
        post: (/** @type {any} */ pixels, /** @type {number} */ k) =>
          upscaleNearest(pixelate(pixels, px.p, px.palette), Math.max(1, Math.round(k))),
      };
    },
    getName: currentName,
    onBeforeExport: () => timeline.stop(),
  });
  $('export').addEventListener('click', () => exportPanel.open());
}
