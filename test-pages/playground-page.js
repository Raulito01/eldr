// @ts-check
// Layer playground: pick a shape layer type, edit it live in the auto-generated inspector,
// watch it in the viewport, drive it with the timeline.
import { LAYER_TYPE_LABELS, LAYER_TYPES } from '../src/effects/layerTypes.js';
import { createCanvas2DBackend, createRenderer } from '../src/render/index.js';
import { getDefaults, randomizeParams } from '../src/schema/index.js';
import { h } from '../src/ui/dom.js';
import { createExportPanel } from '../src/ui/exportPanel.js';
import { bindFrameSize } from '../src/ui/frameSize.js';
import { buildInspector } from '../src/ui/inspector.js';
import { createTimeline } from '../src/ui/timeline.js';
import { createViewport } from '../src/ui/viewport.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));
/** @typedef {keyof typeof LAYER_TYPES} TypeName */

const renderer = createRenderer({ backend: createCanvas2DBackend(), layerTypes: LAYER_TYPES });
const startType = /** @type {TypeName} */ (
  new URLSearchParams(location.search).get('type') in LAYER_TYPES
    ? new URLSearchParams(location.search).get('type')
    : 'puff'
);

/** @type {import('../src/render/renderer.js').Effect} */
const effect = {
  id: 'playground',
  timing: {
    frameCount: 24,
    fps: 24,
    loop: false,
    holdMode: 'ones',
    duration: 23 / 24, // animation length in seconds (D-050): more frames = more time, not slow-mo
    phases: { impact: 0.2, decay: 0.6 },
  },
  layers: [{ id: 'layer', type: startType, params: getDefaults(LAYER_TYPES[startType].schema) }],
};
let seed = 482913;
let variantSeed = 0;
const settings = { width: 512, height: 512 };

const viewport = createViewport($('viewport-host'), { frameW: 512, frameH: 512 });
const schema = () => LAYER_TYPES[/** @type {TypeName} */ (effect.layers[0].type)].schema;

function show() {
  const start = performance.now();
  const out = renderer.renderFrame(effect, seed, timeline.getFrame(), settings);
  viewport.present(out, { renderMs: performance.now() - start });
}

const timeline = createTimeline($('timeline-host'), {
  timing: effect.timing,
  onFrame: show,
  onTimingChange: (timing) => {
    effect.timing = timing;
  },
  keyboard: true,
});

/** @type {ReturnType<typeof buildInspector>} */
let inspector;
function mountInspector() {
  inspector = buildInspector($('inspector-host'), schema(), effect.layers[0].params, {
    onChange(id, value) {
      effect.layers[0].params = { ...effect.layers[0].params, [id]: value };
      show();
    },
  });
}

/** @param {Record<string, any>} params */
function setParams(params) {
  effect.layers[0].params = params;
  inspector.setValues(params);
  show();
}

// Shape selector
for (const [name, label] of Object.entries(LAYER_TYPE_LABELS)) {
  $('type').append(h('option', { value: name }, [label]));
}
$('type').value = startType;
$('type').addEventListener('change', () => {
  const type = /** @type {TypeName} */ ($('type').value);
  effect.layers[0] = { id: 'layer', type, params: getDefaults(LAYER_TYPES[type].schema) };
  history.replaceState(null, '', `?type=${type}`);
  mountInspector();
  show();
});

// Frame size: the render canvas (what the exported sprite cell will be).
bindFrameSize($('size'), { w: settings.width, h: settings.height }, (size) => {
  settings.width = size.w;
  settings.height = size.h;
  viewport.setFrameSize(size.w, size.h);
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
$('variant').addEventListener('click', () => {
  variantSeed++;
  setParams(randomizeParams(schema(), effect.layers[0].params, variantSeed));
});
$('reset').addEventListener('click', () => setParams(getDefaults(schema())));

const exportPanel = createExportPanel({
  renderer,
  getSource: () => ({ effect, seed, width: settings.width, height: settings.height }),
  getName: () => effect.layers[0].type,
  onBeforeExport: () => timeline.stop(),
});
$('export').addEventListener('click', () => exportPanel.open());

mountInspector();
show();
timeline.play();
