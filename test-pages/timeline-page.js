// @ts-check
// Step 1.3 test page: viewport + timeline driving the debug effect.
import { createCanvas2DBackend, createRenderer, DEBUG_LAYER_TYPES } from '../src/render/index.js';
import { createTimeline } from '../src/ui/timeline.js';
import { createViewport } from '../src/ui/viewport.js';
import { makeDebugEffect } from './debug-effect.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const renderer = createRenderer({
  backend: createCanvas2DBackend(),
  layerTypes: DEBUG_LAYER_TYPES,
});
const effect = makeDebugEffect();
effect.timing = { ...effect.timing, holdMode: 'ones', phases: { impact: 0.25, decay: 0.6 } };
const settings = { width: 256, height: 256 };
const viewport = createViewport($('viewport-host'), { frameW: 256, frameH: 256 });

/** @param {number} frame */
function show(frame) {
  const start = performance.now();
  const out = renderer.renderFrame(effect, 482913, frame, settings);
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

show(0);
timeline.play();
