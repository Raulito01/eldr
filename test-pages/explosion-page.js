// @ts-check
// Explosion editor (step 3.3): layer list + global controls + selected layer's inspector,
// viewport and timeline.
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
import { LAYER_TYPES } from '../src/effects/layerTypes.js';
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
const frame = { size: 512 };

const viewport = createViewport($('viewport-host'), { frameW: frame.size, frameH: frame.size });

function show() {
  const start = performance.now();
  const { effect, scale } = buildExplosion(state);
  const out = renderer.renderFrame(effect, seed, timeline.getFrame(), {
    width: frame.size,
    height: frame.size,
    scale,
  });
  viewport.present(out, { renderMs: performance.now() - start });
}

const timeline = createTimeline($('timeline-host'), {
  timing: { ...state.timing, phases: buildExplosion(state).effect.timing.phases },
  onFrame: show,
  onTimingChange: (timing) => {
    state = { ...state, timing: { ...timing } };
  },
  keyboard: true,
});

/** Keep the timeline's phase markers in sync with the impact time. */
function syncPhases() {
  timeline.setTiming({
    ...timeline.getTiming(),
    phases: buildExplosion(state).effect.timing.phases,
  });
}

const listLayers = () =>
  state.layers.map(({ id, label, enabled, blend }) => ({ id, label, enabled, blend }));
const layerList = createLayerList($('layers-host'), {
  layers: listLayers(),
  selected,
  onSelect(id) {
    selected = id;
    layerList.update(listLayers(), selected);
    mountLayerInspector();
  },
  onToggle(id, enabled) {
    state.layers = state.layers.map((l) => (l.id === id ? { ...l, enabled } : l));
    layerList.update(listLayers());
    show();
  },
  onBlend(id, blend) {
    state.layers = state.layers.map((l) =>
      l.id === id ? { ...l, blend: /** @type {any} */ (blend) } : l,
    );
    show();
  },
});

function mountGlobals() {
  buildInspector($('globals-host'), EXPLOSION_SCHEMA, state.globals, {
    onChange(id, value) {
      state.globals = { ...state.globals, [id]: value };
      if (id === 'explosion.impact') syncPhases();
      show();
    },
  });
}

function mountLayerInspector() {
  const layer = state.layers.find((l) => l.id === selected);
  if (!layer) return;
  $('layer-title').textContent = `Layer · ${layer.label}`;
  buildInspector($('layer-host'), LAYER_TYPES[layer.type].schema, layer.params, {
    onChange(id, value) {
      state.layers = state.layers.map((l) =>
        l.id === selected ? { ...l, params: { ...l.params, [id]: value } } : l,
      );
      show();
    },
  });
}

$('size').addEventListener('change', () => {
  frame.size = Number($('size').value);
  viewport.setFrameSize(frame.size, frame.size);
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

/** Put a loaded state on screen. @param {import('../src/effects/explosion/explosion.js').ExplosionState} next */
function apply(next) {
  state = next;
  timeline.setTiming({ ...state.timing, phases: buildExplosion(state).effect.timing.phases });
  layerList.update(listLayers());
  mountGlobals();
  mountLayerInspector();
  show();
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

mountGlobals();
mountLayerInspector();
show();
timeline.play();

const exportPanel = createExportPanel({
  renderer,
  getSource: () => {
    const { effect, scale } = buildExplosion(state);
    return { effect, seed, width: frame.size, height: frame.size, scale };
  },
  getName: currentName,
  onBeforeExport: () => timeline.stop(),
});
$('export').addEventListener('click', () => exportPanel.open());
