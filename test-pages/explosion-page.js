// @ts-check
// Explosion editor: layer panel (3.6a: add / remove / duplicate / reorder / rename / solo),
// global controls, selected layer's settings + inspector, viewport, timeline, undo/redo.
import {
  buildExplosion,
  createExplosion,
  EXPLOSION_SCHEMA,
} from '../src/effects/explosion/explosion.js';
import {
  createExplosionFromPreset,
  EXPLOSION_PRESETS,
  explosionPreset,
} from '../src/effects/explosion/presets.js';
import {
  LAYER_SETTINGS_SCHEMA,
  layerSettingsPatch,
  layerSettingsValues,
} from '../src/effects/layerSettings.js';
import {
  addLayer,
  duplicateLayer,
  moveLayer,
  removeLayer,
  reseedLayer,
  updateLayer,
} from '../src/effects/layerStack.js';
import { LAYER_TYPE_LABELS, LAYER_TYPES } from '../src/effects/layerTypes.js';
import { fileStem } from '../src/export/run.js';
import {
  createUserPresets,
  EFFECT_FILE_EXT,
  parseExplosion,
  serializeExplosion,
} from '../src/project/index.js';
import { createCanvas2DBackend, createRenderer } from '../src/render/index.js';
import { h } from '../src/ui/dom.js';
import { createExportPanel, download } from '../src/ui/exportPanel.js';
import { bindFrameSize } from '../src/ui/frameSize.js';
import { createHistory } from '../src/ui/history.js';
import { buildInspector } from '../src/ui/inspector.js';
import { createLayerList } from '../src/ui/layerList.js';
import { createTimeline } from '../src/ui/timeline.js';
import { createViewport } from '../src/ui/viewport.js';

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
  state.layers.map(({ id, label, enabled, solo, blend }) => ({ id, label, enabled, solo, blend }));
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
    $('layer-host').replaceChildren();
    return;
  }
  $('layer-title').textContent = `Layer · ${layer.label}`;
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
    presetId && !presetId.startsWith(MY) ? createExplosionFromPreset(presetId) : createExplosion(),
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
