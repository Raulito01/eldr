// @ts-check
// Explosion editor (step 3.3): layer list + global controls + selected layer's inspector,
// viewport and timeline.
import {
  buildExplosion,
  createExplosion,
  EXPLOSION_SCHEMA,
} from '../src/effects/explosion/explosion.js';
import { createExplosionFromPreset, EXPLOSION_PRESETS } from '../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../src/effects/layerTypes.js';
import { createCanvas2DBackend, createRenderer } from '../src/render/index.js';
import { h } from '../src/ui/dom.js';
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
/** Base stack (no preset) has the empty id. */
let presetId = '';
$('preset').append(
  h('option', { value: '' }, ['Base (no preset)']),
  ...EXPLOSION_PRESETS.map((p) => h('option', { value: p.id, title: p.blurb }, [p.name])),
);
$('preset').addEventListener('change', () => {
  presetId = $('preset').value;
  load();
});

/** Load the chosen preset fresh (also what Reset does). */
function load() {
  state = presetId ? createExplosionFromPreset(presetId) : createExplosion();
  timeline.setTiming({ ...state.timing, phases: buildExplosion(state).effect.timing.phases });
  layerList.update(listLayers());
  mountGlobals();
  mountLayerInspector();
  show();
}
$('reset').addEventListener('click', load);

mountGlobals();
mountLayerInspector();
show();
timeline.play();
