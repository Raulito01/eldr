// @ts-check
// Step 1.2 test page: the debug effect rendered and shown in the viewport.
import { createCanvas2DBackend, createRenderer, DEBUG_LAYER_TYPES } from '../src/render/index.js';
import { createViewport } from '../src/ui/viewport.js';
import { makeDebugEffect } from './debug-effect.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

const renderer = createRenderer({
  backend: createCanvas2DBackend(),
  layerTypes: DEBUG_LAYER_TYPES,
});
const effect = makeDebugEffect();
const settings = { width: 256, height: 256, pivot: { x: 0.5, y: 0.5 } };
const viewport = createViewport($('viewport-host'), { frameW: 256, frameH: 256 });

let frame = 0;
let playing = true;

function renderAndShow() {
  const start = performance.now();
  // Rendered on transparency; the viewport draws its background behind it (D-019).
  const out = renderer.renderFrame(effect, 482913, frame, settings);
  viewport.present(out, { renderMs: performance.now() - start });
}

$('play').addEventListener('click', () => {
  playing = !playing;
  $('play').textContent = playing ? '⏸ Pause' : '▶ Play';
});

$('size').addEventListener('change', () => {
  const [w, hgt] = $('size').value.split('x').map(Number);
  settings.width = w;
  settings.height = hgt ?? w;
  // The debug effect is authored for 256 px; scale it so it fills other sizes too.
  /** @type {any} */ (settings).scale = Math.min(settings.width, settings.height) / 256;
  viewport.setFrameSize(settings.width, settings.height);
  renderAndShow();
});

$('pivot').addEventListener('change', () => {
  settings.pivot = $('pivot').value === 'bottom' ? { x: 0.5, y: 0.85 } : { x: 0.5, y: 0.5 };
  viewport.setPivot(settings.pivot);
  renderAndShow();
});

let last = 0;
let hold = 0;
function tick(/** @type {number} */ now) {
  if (playing && now - last >= 1000 / effect.timing.fps) {
    last = now;
    if (frame === effect.timing.frameCount - 1 && hold < 12) hold++;
    else {
      hold = 0;
      frame = (frame + 1) % effect.timing.frameCount;
    }
    renderAndShow();
  }
  requestAnimationFrame(tick);
}

renderAndShow();
requestAnimationFrame(tick);
