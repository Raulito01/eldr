// @ts-check
// Step 0.3 demo: auto-generated inspector driving a throwaway preview + JSON save/load.
import { subSeed } from '../src/core/hash.js';
import { createRng } from '../src/core/prng.js';
import {
  generateParamDocs,
  getDefaults,
  parseParams,
  randomizeParams,
  serializeParams,
} from '../src/schema/index.js';
import { buildInspector } from '../src/ui/inspector.js';
import { demoSchema } from './inspector-schema.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

let values = getDefaults(demoSchema);
let variantSeed = 1;

const inspector = buildInspector($('inspector'), demoSchema, values, {
  onChange(id, value) {
    values = { ...values, [id]: value };
    refresh();
  },
});

function refresh({ warnings = /** @type {string[]} */ ([]) } = {}) {
  draw();
  $('json').value = JSON.stringify(serializeParams(demoSchema, values), null, 2);
  $('warnings').textContent = warnings.length ? `Fixed on load:\n${warnings.join('\n')}` : '';
}

/** Replace all values (variant, reset, load) and sync the inspector. @param {Record<string, any>} next */
function setAll(next, warnings = /** @type {string[]} */ ([])) {
  values = next;
  inspector.setValues(values);
  refresh({ warnings });
}

$('variant').addEventListener('click', () => {
  variantSeed++;
  setAll(randomizeParams(demoSchema, values, variantSeed));
});
$('reset').addEventListener('click', () => setAll(getDefaults(demoSchema)));
$('apply').addEventListener('click', () => {
  const { values: loaded, warnings } = parseParams(demoSchema, $('json').value);
  setAll(loaded, warnings);
});
$('docs').addEventListener('click', () => {
  $('json').value = generateParamDocs(demoSchema, 'Demo parameters');
  $('warnings').textContent =
    'Showing generated docs. Press "Load JSON" only after pasting JSON back.';
});

// ---------- Throwaway preview drawing (not the real renderer) ----------
const canvas = /** @type {HTMLCanvasElement} */ ($('preview'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

/** @param {string} shape @param {number} r */
function shapePath(shape, r) {
  ctx.beginPath();
  if (shape === 'square') {
    ctx.rect(-r, -r, r * 2, r * 2);
  } else if (shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r * 1.25 : r * 0.55;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
  } else {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
}

function draw() {
  const v = values;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const count = v['demo.count'];
  for (let i = 0; i < count; i++) {
    const rng = createRng(subSeed(v['demo.seed'], 'demoShape', i)); // per-shape seed
    const angle = (i / count) * Math.PI * 2 + (v['demo.rotation'] * Math.PI) / 180;
    const dist = v['demo.spread'] * 110;
    const r = 18 * v['demo.size'] * rng.range(0.7, 1.3);
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist);
    ctx.rotate((v['demo.rotation'] * Math.PI) / 180);
    shapePath(v['demo.shape'], r);
    ctx.fillStyle = v['demo.color'];
    ctx.fill();
    if (v['demo.outline'] && v['demo.outlinePx'] > 0) {
      ctx.lineWidth = v['demo.outlinePx'];
      ctx.strokeStyle = '#1a0d08';
      ctx.stroke();
    }
    ctx.restore();
  }
}

refresh();
