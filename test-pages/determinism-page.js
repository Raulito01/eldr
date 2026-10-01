// @ts-check
// Browser determinism check over every test effect (same check as tests/unit/determinism.test.js).
import { checkDeterminism, createCanvas2DBackend, createRenderer } from '../src/render/index.js';
import { h } from '../src/ui/widgets/widgets.js';
import { ALL_LAYER_TYPES, TEST_EFFECTS } from './fixtures/test-effects.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));
const deps = { backend: createCanvas2DBackend(), layerTypes: ALL_LAYER_TYPES };
const SETTINGS = { width: 256, height: 256 };

async function run() {
  $('rows').replaceChildren();
  $('summary').textContent = 'Running…';
  let failed = 0;
  for (const { name, effect, seed } of TEST_EFFECTS) {
    await new Promise((r) => setTimeout(r)); // let the page update between effects
    const result = checkDeterminism(deps, effect, seed, SETTINGS);
    if (!result.ok) failed++;

    const thumb = h('canvas', { width: 64, height: 64 });
    const mid = Math.floor(effect.timing.frameCount / 2);
    const out = createRenderer(deps).renderFrame(effect, seed, mid, SETTINGS);
    thumb.getContext('2d')?.drawImage(out.canvas, 0, 0, 64, 64);

    $('rows').append(
      h('tr', {}, [
        h('td', {}, [thumb]),
        h('td', {}, [name]),
        h('td', { class: 'mono' }, [String(result.frames)]),
        h('td', { class: 'mono' }, [`${result.ms.toFixed(0)} ms`]),
        h('td', { class: result.ok ? 'pass' : 'fail' }, [
          result.ok ? 'PASS' : `FAIL (frames ${result.mismatches.map((f) => f + 1).join(', ')})`,
        ]),
      ]),
    );
  }
  $('summary').innerHTML = failed
    ? `<span class="fail">${failed} of ${TEST_EFFECTS.length} effects FAILED</span>`
    : `<span class="pass">All ${TEST_EFFECTS.length} effects deterministic ✓</span>`;
}

$('run').addEventListener('click', run);
run();
