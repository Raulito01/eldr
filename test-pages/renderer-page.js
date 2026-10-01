// @ts-check
// Step 1.1 test page: three debug circles composited with per-layer blend mode and opacity.
import {
  BLEND_MODE_NAMES,
  createCanvas2DBackend,
  createRenderer,
  DEBUG_LAYER_TYPES,
} from '../src/render/index.js';
import { h } from '../src/ui/widgets/widgets.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

const renderer = createRenderer({
  backend: createCanvas2DBackend(),
  layerTypes: DEBUG_LAYER_TYPES,
});

/** @type {import('../src/render/renderer.js').Effect} */
const effect = {
  id: 'debug',
  timing: { frameCount: 24, fps: 24, loop: false },
  layers: [
    {
      id: 'red',
      type: 'debugCircle',
      blend: 'normal',
      opacity: 1,
      params: {
        color: '#ff3b30',
        radius: 46,
        from: { x: -60, y: 10 },
        to: { x: 40, y: -10 },
        easing: 'inOutCubic',
        jitter: 8,
      },
    },
    {
      id: 'green',
      type: 'debugCircle',
      blend: 'add',
      opacity: 1,
      params: {
        color: '#34c759',
        radius: 42,
        from: { x: 10, y: -70 },
        to: { x: -10, y: 40 },
        easing: 'outBack',
        jitter: 8,
      },
    },
    {
      id: 'blue',
      type: 'debugCircle',
      blend: 'screen',
      opacity: 1,
      params: {
        color: '#0a84ff',
        radius: 38,
        from: { x: 70, y: 60 },
        to: { x: -20, y: -20 },
        easing: 'outQuad',
        jitter: 8,
      },
    },
  ],
};

let frame = 0;
let playing = true;
const view = /** @type {HTMLCanvasElement} */ ($('view'));
const vctx = /** @type {CanvasRenderingContext2D} */ (view.getContext('2d'));

function draw() {
  const bg = $('bg').value;
  view.classList.toggle('checker', bg === 'checker');
  const start = performance.now();
  const out = renderer.renderFrame(effect, Number($('seed').value) | 0, frame, {
    width: view.width,
    height: view.height,
    background: bg === 'checker' ? null : bg,
  });
  const ms = performance.now() - start;
  vctx.clearRect(0, 0, view.width, view.height);
  vctx.drawImage(out.canvas, 0, 0);
  $('frame').value = String(frame);
  $('frame-label').textContent = `frame ${frame + 1}/${effect.timing.frameCount}`;
  $('stats').textContent = `render ${ms.toFixed(2)} ms · ${view.width}×${view.height}`;
}

// Layer controls
for (const layer of effect.layers) {
  const enabled = h('input', { type: 'checkbox', checked: true, title: 'Show layer' });
  const blend = h(
    'select',
    {},
    BLEND_MODE_NAMES.map((b) => h('option', { value: b }, [b])),
  );
  blend.value = layer.blend ?? 'normal';
  const opacity = h('input', {
    type: 'range',
    min: 0,
    max: 1,
    step: 0.01,
    value: layer.opacity ?? 1,
  });
  enabled.addEventListener('change', () => {
    layer.enabled = enabled.checked;
    draw();
  });
  blend.addEventListener('change', () => {
    layer.blend = /** @type {any} */ (blend.value);
    draw();
  });
  opacity.addEventListener('input', () => {
    layer.opacity = Number(opacity.value);
    draw();
  });
  $('layers').append(
    h('div', { class: 'layer' }, [
      enabled,
      h('span', {}, [layer.id]),
      h('span', { class: 'swatch', style: `background:${layer.params?.color}` }),
      h('div', { class: 'opts' }, [blend, h('span', { class: 'mono' }, ['opacity']), opacity]),
    ]),
  );
}

$('frame').addEventListener('input', () => {
  frame = Number($('frame').value);
  playing = false;
  $('play').textContent = '▶ Play';
  draw();
});
$('play').addEventListener('click', () => {
  playing = !playing;
  $('play').textContent = playing ? '⏸ Pause' : '▶ Play';
});
$('seed').addEventListener('change', draw);
$('bg').addEventListener('change', draw);
$('dice').addEventListener('click', () => {
  $('seed').value = String(crypto.getRandomValues(new Uint32Array(1))[0]); // UI input, not render path
  draw();
});

// Simple playback (the real timeline arrives in 1.3). Holds the last frame briefly, then repeats.
let last = performance.now();
let hold = 0;
function tick(/** @type {number} */ now) {
  if (playing && now - last >= 1000 / effect.timing.fps) {
    last = now;
    if (frame === effect.timing.frameCount - 1 && hold < 12) hold++;
    else {
      hold = 0;
      frame = (frame + 1) % effect.timing.frameCount;
    }
    draw();
  }
  requestAnimationFrame(tick);
}

draw();
requestAnimationFrame(tick);
