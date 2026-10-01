// @ts-check
// Step 1.4 playground: one blob layer, live-edited through the auto-generated inspector,
// shown in the viewport and driven by the timeline.
import { LAYER_TYPES } from '../src/effects/layerTypes.js';
import { createCanvas2DBackend, createRenderer } from '../src/render/index.js';
import { getDefaults, randomizeParams } from '../src/schema/index.js';
import { buildInspector } from '../src/ui/inspector.js';
import { createTimeline } from '../src/ui/timeline.js';
import { createViewport } from '../src/ui/viewport.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

const schema = LAYER_TYPES.blob.schema;
const renderer = createRenderer({ backend: createCanvas2DBackend(), layerTypes: LAYER_TYPES });

/** @type {import('../src/render/renderer.js').Effect} */
const effect = {
  id: 'blob-playground',
  timing: {
    frameCount: 24,
    fps: 24,
    loop: false,
    holdMode: 'twos',
    phases: { impact: 0.2, decay: 0.6 },
  },
  layers: [{ id: 'blob', type: 'blob', params: getDefaults(schema) }],
};
let seed = 482913;
let variantSeed = 0;
const settings = { width: 256, height: 256 };

const viewport = createViewport($('viewport-host'), { frameW: 256, frameH: 256 });

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

const inspector = buildInspector($('inspector-host'), schema, effect.layers[0].params, {
  onChange(id, value) {
    effect.layers[0].params = { ...effect.layers[0].params, [id]: value };
    show();
  },
});

/** @param {Record<string, any>} params */
function setParams(params) {
  effect.layers[0].params = params;
  inspector.setValues(params);
  show();
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
$('variant').addEventListener('click', () => {
  variantSeed++;
  setParams(randomizeParams(schema, effect.layers[0].params, variantSeed));
});
$('reset').addEventListener('click', () => setParams(getDefaults(schema)));

show();
timeline.play();
