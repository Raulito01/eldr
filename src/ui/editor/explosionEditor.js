// @ts-check
/**
 * ELDR editor (explosion template): layer panel, layer settings + transform, inspector,
 * viewport with transform handles, timeline, undo/redo, presets, files, export.
 * Moved out of test-pages in 3.6b (D-053); the page just calls startExplosionEditor().
 */

import { animationLength } from '../../core/timing.js';
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
  removeLayer,
  removeMask,
  reseedLayer,
  setMatte,
  setParent,
  updateLayer,
  updateMask,
} from '../../effects/layerStack.js';
import { isAdjustmentType, LAYER_TYPE_LABELS, LAYER_TYPES } from '../../effects/layerTypes.js';
import { maskParamLabel } from '../../effects/maskParams.js';
import { fileStem } from '../../export/run.js';
import {
  createUserPresets,
  EFFECT_FILE_EXT,
  parseExplosion,
  serializeExplosion,
} from '../../project/index.js';
import { createCanvas2DBackend, createRenderer } from '../../render/index.js';
import { MATTE_LABELS, MATTE_MODES } from '../../render/masks.js';
import { RAMP_PRESETS, rampPreset } from '../../render/rampPresets.js';
import { h } from '../dom.js';
import { createExportPanel, download } from '../exportPanel.js';
import { bindFrameSize } from '../frameSize.js';
import { createHistory } from '../history.js';
import { buildInspector } from '../inspector.js';
import { createLayerList } from '../layerList.js';
import { createShortcuts } from '../shortcuts.js';
import { createTimeline } from '../timeline.js';
import { createViewport } from '../viewport.js';
import { openCheatSheet } from './cheatSheet.js';
import { editorShortcutList } from './editorShortcuts.js';
import { dragTo, gizmoGeometry, hitTest, paintGizmo, startDrag } from './gizmo.js';
import { createLayerTimeline } from './layerTimeline.js';
import {
  CORNERS,
  dragMask,
  insideMask,
  maskOutline,
  maskSchema,
  maskToLayer,
  maskValues,
  parseMaskFix,
} from './maskPanel.js';
import { openRampPicker } from './rampPicker.js';
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
    keyboard: false, // the editor's shortcut list handles Space / arrows / Home (3.7d)
  });

  // ── Layer timeline (3.6c): bars, keys, impact marker ───────────────────────────────────
  /** @param {string} layerId @param {string} pid */
  const paramLabel = (layerId, pid) => {
    const l = state.layers.find((x) => x.id === layerId);
    if (pid === 'layer.opacity') return 'Opacity';
    if (pid.startsWith('mask.') && l) return maskParamLabel(l, pid);
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

  // ── Layer panel ───────────────────────────────────────────────────────────────────────────
  const listLayers = () => {
    const sources = new Set(state.layers.map((l) => l.matte?.source).filter(Boolean));
    return state.layers.map(({ id, label, enabled, solo, blend, matte, masks }) => ({
      id,
      label,
      enabled,
      solo,
      blend,
      badge: [
        matte ? (matte.mode.startsWith('luma') ? '◐ luma' : '◐ matte') : '',
        sources.has(id) ? '⬓ matte src' : '',
        masks?.length ? `▭${masks.length > 1 ? masks.length : ''}` : '',
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
  ];
  /** @param {import('../../effects/explosion/explosion.js').EditorLayer} l */
  const settingsValues = (l) => ({
    ...layerSettingsValues(l),
    'layer.matte': l.matte?.source ?? '',
    'layer.matteMode': l.matte?.mode ?? 'alpha',
  });

  // ── Masks (3.6d) ─────────────────────────────────────────────────────────────────────────
  /** The mask edited with viewport handles (on the active layer), or ''. */
  let maskTarget = '';
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
      const card = h('div', { class: `mask-card${m.id === maskTarget ? ' target' : ''}` }, [
        h('div', { class: 'mask-card-head' }, [
          enabled,
          h('span', { class: 'mask-name' }, [m.name]),
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
      const insp = buildInspector(body, /** @type {any} */ (maskSchema(m)), maskValues(m), {
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
    host.replaceChildren(
      h('div', { class: 'mask-head' }, [
        h('span', { class: 'mask-title' }, ['Masks']),
        addBtn('ellipse', '＋ Ellipse'),
        addBtn('rect', '＋ Rectangle'),
      ]),
      ...cards,
    );
  }

  function mountLayerInspector() {
    const layer = selectedLayer();
    $('layer-reseed').hidden = !layer;
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
    mountMasks(layer);
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
    transformInspector?.setValues(transformValues(now, isLinked(l.id)));
    paramsInspector?.setValues(now.params);
    for (const i of inspectors) i.refreshKeys();
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
    const world = worldMatrices(lays).get(l.id) ?? [1, 0, 0, 1, 0, 0];
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
        ctx.closePath();
        ctx.setLineDash(target ? [] : [5, 4]);
        ctx.lineWidth = target ? 2 : 1.25;
        ctx.strokeStyle = !m.enabled ? '#777a85' : target ? '#4fd1ff' : '#9fe3ff';
        ctx.stroke();
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
    if (maskTarget) return; // editing a mask: no layer handles
    const g = selected && !noHandles() ? gizmoGeometry(layersNow(), selected, toMap(fm)) : null;
    if (!g) return;
    const isNull = state.layers.find((l) => l.id === selected)?.type === 'null';
    paintGizmo(ctx, g, { active: gizmoActive, isNull });
  });
  /** @type {{ m0: import('../../render/masks.js').Mask, p0: [number, number], what: any, key: string } | null} */
  let maskDrag = null;
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
      const mh = maskHit(fm, pt[0], pt[1]);
      if (mh) return mh.kind === 'move' ? 'move' : 'nwse-resize';
      if (maskTarget) return '';
      const g = selected && !noHandles() ? gizmoGeometry(layersNow(), selected, toMap(fm)) : null;
      const hit = panHit(g ? hitTest(g, pt[0], pt[1], { alt: e.altKey || panBehind }) : null);
      return hit ? CURSORS[hit] : '';
    },
    down(pt, e, fm) {
      const mh = maskHit(fm, pt[0], pt[1]);
      if (mh) {
        timeline.stop();
        maskDrag = {
          m0: { ...mh.m },
          p0: mh.v.toLayer(pt[0], pt[1]),
          what: mh.kind === 'move' ? { kind: 'move' } : { kind: 'corner', corner: mh.corner },
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
    revealMasks(add) {
      const l = selectedLayer();
      const ids = (l?.masks ?? []).flatMap((m) =>
        ['x', 'y', 'w', 'h', 'feather', 'opacity'].map((f) => `mask.${m.id}.${f}`),
      );
      if (ids.length) layerTimeline?.revealLanes(ids, add);
    },
    centreAnchor: () => centreSelectedAnchor(),
    cheatSheet: () => openCheatSheet(shortcuts.list),
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
