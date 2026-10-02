// @ts-check
/**
 * ELDR editor (explosion template): layer panel, layer settings + transform, inspector,
 * viewport with transform handles, timeline, undo/redo, presets, files, export.
 * Moved out of test-pages in 3.6b (D-053); the page just calls startExplosionEditor().
 */

import { animationLength } from '../../core/timing.js';
import {
  applyValues,
  applyValuesMany,
  isAnimatedParam,
  keyHere,
  layerHasParam,
  mixedParams,
  toggleKeyMany,
  toggleStopwatchMany,
} from '../../effects/animEdit.js';
import { centreAnchor, centreLayer, jumpKey, keyFrames } from '../../effects/editorOps.js';
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
  duplicateLayer,
  moveLayer,
  removeLayer,
  reseedLayer,
  setParent,
  updateLayer,
} from '../../effects/layerStack.js';
import { LAYER_TYPE_LABELS, LAYER_TYPES } from '../../effects/layerTypes.js';
import { fileStem } from '../../export/run.js';
import {
  createUserPresets,
  EFFECT_FILE_EXT,
  parseExplosion,
  serializeExplosion,
} from '../../project/index.js';
import { createCanvas2DBackend, createRenderer } from '../../render/index.js';
import { h } from '../dom.js';
import { createExportPanel, download } from '../exportPanel.js';
import { bindFrameSize } from '../frameSize.js';
import { createHistory } from '../history.js';
import { buildInspector } from '../inspector.js';
import { createLayerList } from '../layerList.js';
import { createTimeline } from '../timeline.js';
import { createViewport } from '../viewport.js';
import { dragTo, gizmoGeometry, hitTest, paintGizmo, startDrag } from './gizmo.js';
import { createLayerTimeline } from './layerTimeline.js';
import { cleanSelection, clickSelect } from './selection.js';
import { transformPatch, transformSchema, transformValues } from './transformPanel.js';
import { openVelocityDialog } from './velocityDialog.js';

/** Start the editor in the current page (expects the explosion.html markup). */
export function startExplosionEditor() {
  /** @param {string} id */
  const $ = (id) => /** @type {any} */ (document.getElementById(id));

  const renderer = createRenderer({ backend: createCanvas2DBackend(), layerTypes: LAYER_TYPES });
  let state = createExplosion();
  /** The ACTIVE layer (inspector, handles). */
  let selected = 'fireball';
  /** Every selected layer, active included (3.7b multi-select). @type {string[]} */
  let selIds = ['fireball'];
  let seed = 482913;
  const frame = { w: 512, h: 512 };

  const viewport = createViewport($('viewport-host'), { frameW: frame.w, frameH: frame.h });

  function show() {
    const start = performance.now();
    const { effect, scale } = buildExplosion(state);
    const out = renderer.renderFrame(effect, seed, timeline.getFrame(), {
      width: frame.w,
      height: frame.h,
      scale,
    });
    viewport.present(out, { renderMs: performance.now() - start });
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
    keyboard: true,
  });

  // ── Layer timeline (3.6c): bars, keys, impact marker ───────────────────────────────────
  /** @param {string} layerId @param {string} pid */
  const paramLabel = (layerId, pid) => {
    const l = state.layers.find((x) => x.id === layerId);
    if (pid === 'layer.opacity') return 'Opacity';
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
    history.record(state, key);
    state = next;
    tidySelection();
    refresh(o);
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
    const prev = history.undo(state);
    if (prev === undefined) return;
    state = prev;
    tidySelection();
    refresh({ remount: true });
  }
  function redo() {
    const next = history.redo(state);
    if (next === undefined) return;
    state = next;
    tidySelection();
    refresh({ remount: true });
  }
  function syncUndoButtons() {
    $('undo').disabled = !history.canUndo();
    $('redo').disabled = !history.canRedo();
  }
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  document.addEventListener('keydown', (e) => {
    const typing = /** @type {HTMLElement} */ (e.target)?.closest?.('input, select, textarea');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y' && !typing) {
      e.preventDefault();
      redo();
    }
  });

  // ── Layer panel ───────────────────────────────────────────────────────────────────────────
  const listLayers = () =>
    state.layers.map(({ id, label, enabled, solo, blend }) => ({
      id,
      label,
      enabled,
      solo,
      blend,
    }));
  /** The layers an action on `id` applies to: the whole selection if `id` is in it. @param {string} id */
  const targetsOf = (id) => (selIds.includes(id) ? selectionInStack() : [id]);
  const layerList = createLayerList($('layers-host'), {
    layers: listLayers(),
    selected,
    selection: selIds,
    types: /** @type {Record<string, string>} */ (LAYER_TYPE_LABELS),
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
    globalsInspector = buildInspector($('globals-host'), EXPLOSION_SCHEMA, state.globals, {
      onChange(id, value) {
        commit({ ...state, globals: { ...state.globals, [id]: value } }, `globals:${id}`, {
          quiet: true,
        });
        if (id === 'explosion.impact') syncPhases();
      },
    });
  }

  // ── Selected layer: settings, transform, params (all keyframable, 3.6c) ───────────────
  /** Comp time of the current frame, seconds (keys are placed on frames, not held drawings). */
  const nowSeconds = () => timeline.getFrame() / state.timing.fps;
  const selectedLayer = () => state.layers.find((l) => l.id === selected);
  /** Every layer as it is at the current frame (keyframes resolved). */
  const layersNow = () => state.layers.map((l) => layerAt(l, nowSeconds()));
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

  function mountLayerInspector() {
    const layer = selectedLayer();
    $('layer-reseed').hidden = !layer;
    $('layer-centre').hidden = !layer;
    $('layer-centre-anchor').hidden = !layer;
    if (!layer) {
      $('layer-title').textContent = 'No layer';
      $('layer-settings-host').replaceChildren();
      $('layer-transform-host').replaceChildren();
      $('layer-host').replaceChildren();
      inspectors = [];
      viewport.redraw();
      return;
    }
    const now = layerAt(layer, nowSeconds());
    $('layer-title').textContent = `Layer · ${layer.label}`;
    settingsInspector = buildInspector(
      $('layer-settings-host'),
      LAYER_SETTINGS_SCHEMA,
      layerSettingsValues(now),
      {
        onChange(id, value) {
          if (id === 'layer.opacity') setValues({ [id]: value }, `${selected}:${id}`);
          else {
            let next = state;
            for (const t of selIds) next = updateLayer(next, t, layerSettingsPatch(id, value));
            commit(next, '', { quiet: true });
            markMixed();
          }
        },
        keys: keyHooks((id) => id === 'layer.opacity'),
      },
    );
    transformInspector = buildInspector(
      $('layer-transform-host'),
      transformSchema(state, layer.id),
      transformValues(now, isLinked(layer.id)),
      {
        onChange(id, value) {
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
        keys: keyHooks((id) => id !== 'transform.parent' && id !== 'transform.linked'),
      },
    );
    paramsInspector = buildInspector($('layer-host'), LAYER_TYPES[layer.type].schema, now.params, {
      onChange(id, value) {
        setValues({ [id]: value }, `${selected}:${id}`);
      },
      keys: keyHooks(
        (id) => LAYER_TYPES[layer.type].schema.find((d) => d.id === id)?.type !== 'seed',
      ),
    });
    inspectors = [settingsInspector, transformInspector, paramsInspector];
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
    settingsInspector?.setValues(layerSettingsValues(now));
    transformInspector?.setValues(transformValues(now, isLinked(l.id)));
    paramsInspector?.setValues(now.params);
    for (const i of inspectors) i.refreshKeys();
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
  /** @type {{ d: import('./gizmo.js').DragStart, id: string, key: string } | null} */
  let gizmoDrag = null;
  let gizmoDrags = 0;
  /** @type {import('./gizmo.js').GizmoHit} */
  let gizmoActive = null;
  viewport.setOverlay((ctx, fm) => {
    const g = selected ? gizmoGeometry(layersNow(), selected, toMap(fm)) : null;
    if (!g) return;
    const isNull = state.layers.find((l) => l.id === selected)?.type === 'null';
    paintGizmo(ctx, g, { active: gizmoActive, isNull });
  });
  const CURSORS = { move: 'move', anchor: 'crosshair', rotate: 'grab', scale: 'nwse-resize' };
  viewport.setInteraction({
    hover(pt, e, fm) {
      const g = selected ? gizmoGeometry(layersNow(), selected, toMap(fm)) : null;
      const hit = g ? hitTest(g, pt[0], pt[1], { alt: e.altKey }) : null;
      return hit ? CURSORS[hit] : '';
    },
    down(pt, e, fm) {
      if (!selected) return false;
      const map = toMap(fm);
      const g = gizmoGeometry(layersNow(), selected, map);
      const hit = g ? hitTest(g, pt[0], pt[1], { alt: e.altKey }) : null;
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
  document.addEventListener('keydown', (e) => {
    const typing = /** @type {HTMLElement} */ (e.target)?.closest?.('input, select, textarea');
    if (typing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod && !e.altKey && !e.shiftKey && (e.code === 'KeyJ' || e.code === 'KeyK')) {
      e.preventDefault();
      jumpToKey(e.code === 'KeyJ' ? -1 : 1);
    } else if ((e.shiftKey && !mod && e.code === 'KeyC') || (mod && e.code === 'Home')) {
      // ⇧C or ⌘/Ctrl + Home = centre the layer; add ⌥ = centre the anchor point.
      e.preventDefault();
      if (e.altKey) centreSelectedAnchor();
      else centreSelected();
    } else if (e.code === 'F9' && !e.altKey) {
      // F9 Easy Ease · ⇧F9 Ease In · ⌘⇧F9 Ease Out (After Effects)
      const kind = mod && e.shiftKey ? 'easeOut' : e.shiftKey ? 'easeIn' : 'easy';
      if (interpKeys(layerTimeline?.selectedKeys() ?? [], kind)) e.preventDefault();
    } else if (mod && e.altKey && e.code === 'KeyH') {
      if (interpKeys(layerTimeline?.selectedKeys() ?? [], 'toggleHold')) e.preventDefault();
    } else if (mod && e.shiftKey && e.code === 'KeyK') {
      e.preventDefault();
      const refs = layerTimeline?.selectedKeys() ?? [];
      if (refs.length) openVelocity(refs);
    } else if (e.shiftKey && !mod && e.code === 'F3') {
      e.preventDefault();
      layerTimeline?.setMode(layerTimeline.mode() === 'graph' ? 'layers' : 'graph');
    } else if (mod && !e.altKey && e.code === 'KeyC') {
      if (copySelectedKeys()) e.preventDefault();
    } else if (mod && !e.altKey && e.code === 'KeyV') {
      if (pasteKeysHere()) e.preventDefault();
    } else if (mod && e.code === 'KeyA') {
      // ⌘A = every layer; ⌘⌥A = every key of the selected layers (lanes shown).
      e.preventDefault();
      if (e.altKey) layerTimeline?.selectKeys(allKeys(state, selIds));
      else
        setSelection(
          selected || state.layers.at(-1)?.id || '',
          state.layers.map((l) => l.id),
        );
    } else if (mod && !e.altKey && e.code === 'KeyD') {
      e.preventDefault();
      duplicateSelection();
    } else if (
      !mod &&
      (e.key === 'Delete' || e.key === 'Backspace') &&
      !e.defaultPrevented && // the timeline deleted selected keys
      !layerTimeline?.selectedKeys().length
    ) {
      e.preventDefault();
      deleteSelection();
    }
  });

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

  $('layer-reseed').addEventListener('click', () => {
    if (selected) commit(reseedLayer(state, selected), '', { quiet: true });
  });

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

  /** (Re)build the preset menu: base, built-in presets, my presets. */
  function fillPresetMenu() {
    const mine = myPresets.names();
    $('preset').replaceChildren(
      h('option', { value: '' }, ['Base (no preset)']),
      h(
        'optgroup',
        { label: 'Built-in' },
        EXPLOSION_PRESETS.map((p) => h('option', { value: p.id, title: p.blurb }, [p.name])),
      ),
      ...(mine.length
        ? [
            h(
              'optgroup',
              { label: 'My presets' },
              mine.map((n) => h('option', { value: MY + n }, [n])),
            ),
          ]
        : []),
    );
    $('preset').value = presetId;
    $('delete-preset').disabled = !presetId.startsWith(MY);
  }
  fillPresetMenu();
  $('preset').addEventListener('change', () => {
    presetId = $('preset').value;
    $('delete-preset').disabled = !presetId.startsWith(MY);
    load();
  });

  /** Put a loaded state on screen (a fresh start: undo history is cleared). @param {typeof state} next */
  function apply(next) {
    state = next;
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
  function notify(text) {
    $('notice').textContent = text;
    $('notice').hidden = !text;
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
    if (!myPresets.save(name, serializeExplosion(state, { seed, name, canvas: frame }))) {
      notify('Could not save in this browser (storage is blocked). Use "Save file…" instead.');
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
    const text = `${JSON.stringify(serializeExplosion(state, { seed, name, canvas: frame }), null, 2)}\n`;
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
      const { effect, scale } = buildExplosion(state);
      return { effect, seed, width: frame.w, height: frame.h, scale };
    },
    getName: currentName,
    onBeforeExport: () => timeline.stop(),
  });
  $('export').addEventListener('click', () => exportPanel.open());
}
