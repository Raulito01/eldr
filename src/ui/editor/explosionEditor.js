// @ts-check
/**
 * ELDR editor (explosion template): layer panel, layer settings + transform, inspector,
 * viewport with transform handles, timeline, undo/redo, presets, files, export.
 * Moved out of test-pages in 3.6b (D-053); the page just calls startExplosionEditor().
 */
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
import { transformPatch, transformSchema, transformValues } from './transformPanel.js';

/** Start the editor in the current page (expects the explosion.html markup). */
export function startExplosionEditor() {
  /** @param {string} id */
  const $ = (id) => /** @type {any} */ (document.getElementById(id));

  const renderer = createRenderer({ backend: createCanvas2DBackend(), layerTypes: LAYER_TYPES });
  let state = createExplosion();
  let selected = 'fireball';
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
    onFrame: show,
    onTimingChange: (timing) => {
      commit({ ...state, timing: { ...timing } }, 'timing', { quiet: true });
    },
    keyboard: true,
  });

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
    if (!state.layers.some((l) => l.id === selected)) {
      selected = state.layers.at(-1)?.id ?? '';
    }
    refresh(o);
  }

  /** Redraw what depends on the state. @param {{ quiet?: boolean, remount?: boolean }} [o] */
  function refresh(o = {}) {
    layerList.update(listLayers(), selected);
    if (o.remount) {
      mountGlobals();
      mountLayerInspector();
      syncPhases();
    } else if (!o.quiet) {
      mountLayerInspector();
    }
    syncUndoButtons();
    show();
  }

  function undo() {
    const prev = history.undo(state);
    if (prev === undefined) return;
    state = prev;
    if (!state.layers.some((l) => l.id === selected)) selected = state.layers.at(-1)?.id ?? '';
    refresh({ remount: true });
  }
  function redo() {
    const next = history.redo(state);
    if (next === undefined) return;
    state = next;
    if (!state.layers.some((l) => l.id === selected)) selected = state.layers.at(-1)?.id ?? '';
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
  const layerList = createLayerList($('layers-host'), {
    layers: listLayers(),
    selected,
    types: /** @type {Record<string, string>} */ (LAYER_TYPE_LABELS),
    onSelect(id) {
      selected = id;
      layerList.update(listLayers(), selected);
      mountLayerInspector();
    },
    onToggle: (id, enabled) => commit(updateLayer(state, id, { enabled }), '', { quiet: true }),
    onSolo: (id, solo) => commit(updateLayer(state, id, { solo }), '', { quiet: true }),
    onRename: (id, label) => commit(updateLayer(state, id, { label })),
    onMove: (id, to) => commit(moveLayer(state, id, to), '', { quiet: true }),
    onAdd(type) {
      const r = addLayer(state, /** @type {any} */ (type), selected || undefined);
      selected = r.id;
      commit(r.state);
    },
    onDuplicate(id) {
      const r = duplicateLayer(state, id);
      selected = r.id;
      commit(r.state);
    },
    onDelete(id) {
      const i = state.layers.findIndex((l) => l.id === id);
      const next = removeLayer(state, id);
      // Select the layer that took its place in the list (the one below, else the new bottom).
      selected = next.layers[Math.max(0, i - 1)]?.id ?? '';
      commit(next);
    },
  });

  function mountGlobals() {
    buildInspector($('globals-host'), EXPLOSION_SCHEMA, state.globals, {
      onChange(id, value) {
        commit({ ...state, globals: { ...state.globals, [id]: value } }, `globals:${id}`, {
          quiet: true,
        });
        if (id === 'explosion.impact') syncPhases();
      },
    });
  }

  function mountLayerInspector() {
    const layer = state.layers.find((l) => l.id === selected);
    $('layer-reseed').hidden = !layer;
    if (!layer) {
      $('layer-title').textContent = 'No layer';
      $('layer-settings-host').replaceChildren();
      $('layer-transform-host').replaceChildren();
      $('layer-host').replaceChildren();
      viewport.redraw();
      return;
    }
    $('layer-title').textContent = `Layer · ${layer.label}`;
    mountTransform(layer);
    buildInspector($('layer-settings-host'), LAYER_SETTINGS_SCHEMA, layerSettingsValues(layer), {
      onChange(id, value) {
        commit(updateLayer(state, selected, layerSettingsPatch(id, value)), `${selected}:${id}`, {
          quiet: true,
        });
      },
    });
    buildInspector($('layer-host'), LAYER_TYPES[layer.type].schema, layer.params, {
      onChange(id, value) {
        const l = state.layers.find((x) => x.id === selected);
        if (!l) return;
        commit(
          updateLayer(state, selected, { params: { ...l.params, [id]: value } }),
          `${selected}:${id}`,
          { quiet: true },
        );
      },
    });
  }
  // ── Transform + parenting (3.6b) ──────────────────────────────────────────────────────
  /** "Uniform scale" per layer (editor setting, not saved). @type {Map<string, boolean>} */
  const linkedScale = new Map();
  const isLinked = (/** @type {string} */ id) => linkedScale.get(id) ?? true;
  /** @type {ReturnType<typeof buildInspector> | null} */
  let transformInspector = null;

  /** @param {import('../../effects/explosion/explosion.js').EditorLayer} layer */
  function mountTransform(layer) {
    transformInspector = buildInspector(
      $('layer-transform-host'),
      transformSchema(state, layer.id),
      transformValues(layer, isLinked(layer.id)),
      {
        onChange(id, value) {
          const l = state.layers.find((x) => x.id === selected);
          if (!l) return;
          if (id === 'transform.parent') {
            commit(setParent(state, selected, value || null));
            return;
          }
          if (id === 'transform.linked') {
            linkedScale.set(selected, value);
            return;
          }
          const transform = transformPatch(l.transform, id, value, isLinked(selected));
          commit(updateLayer(state, selected, { transform }), `${selected}:${id}`, { quiet: true });
          syncTransformFields();
        },
      },
    );
    viewport.redraw();
  }

  /** Update the Transform fields without rebuilding them (handle drags, linked scale). */
  function syncTransformFields() {
    const l = state.layers.find((x) => x.id === selected);
    if (l && transformInspector) transformInspector.setValues(transformValues(l, isLinked(l.id)));
  }

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
    const g = selected ? gizmoGeometry(state.layers, selected, toMap(fm)) : null;
    if (!g) return;
    const isNull = state.layers.find((l) => l.id === selected)?.type === 'null';
    paintGizmo(ctx, g, { active: gizmoActive, isNull });
  });
  const CURSORS = { move: 'move', anchor: 'crosshair', rotate: 'grab', scale: 'nwse-resize' };
  viewport.setInteraction({
    hover(pt, e, fm) {
      const g = selected ? gizmoGeometry(state.layers, selected, toMap(fm)) : null;
      const hit = g ? hitTest(g, pt[0], pt[1], { alt: e.altKey }) : null;
      return hit ? CURSORS[hit] : '';
    },
    down(pt, e, fm) {
      if (!selected) return false;
      const map = toMap(fm);
      const g = gizmoGeometry(state.layers, selected, map);
      const hit = g ? hitTest(g, pt[0], pt[1], { alt: e.altKey }) : null;
      if (!hit) return false;
      timeline.stop();
      // Each handle drag is ONE undo step (its own history key).
      gizmoDrag = {
        d: startDrag(state.layers, selected, hit, map.toEffect(...pt)),
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
      commit(updateLayer(state, gizmoDrag.id, { transform }), gizmoDrag.key, {
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

  $('layer-reseed').addEventListener('click', () => {
    if (selected) commit(reseedLayer(state, selected), '', { quiet: true });
  });

  bindFrameSize($('size'), frame, (size) => {
    frame.w = size.w;
    frame.h = size.h;
    viewport.setFrameSize(frame.w, frame.h);
    show();
  });
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
    }
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
    if (!myPresets.save(name, serializeExplosion(state, { seed, name }))) {
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
    const text = `${JSON.stringify(serializeExplosion(state, { seed, name }), null, 2)}\n`;
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
