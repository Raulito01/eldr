import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import {
  duplicateLayer,
  nestedComps,
  precompose,
  setCompLayers,
  updateLayer,
} from '../../src/effects/layerStack.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer } from '../../src/render/renderer.js';

const r = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
});
const px = (state, frame = 10) => {
  const { effect, scale } = buildExplosion(state);
  return r.renderFrameImageData(effect, 482913, frame, {
    width: 128,
    height: 128,
    scale: scale / 4,
  }).data;
};
const diff = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
};
const alpha = (d) => {
  let s = 0;
  for (let i = 3; i < d.length; i += 4) s += d[i];
  return s;
};

describe('precomps (3.6e)', () => {
  const base = createExplosionFromPreset('smallHit');
  const ids = ['core', 'fireball'];

  it('precomposing normal layers changes nothing on screen', () => {
    const r1 = precompose(base, ids, 'Hot core');
    const s = r1.state;
    expect(s.layers.some((l) => ids.includes(l.id))).toBe(false);
    const pre = s.layers.find((l) => l.id === r1.id);
    expect(pre).toMatchObject({ type: 'precomp', comp: r1.compId, label: 'Hot core' });
    expect(s.comps[r1.compId].layers.map((l) => l.id)).toEqual(ids);
    // the precomp sits where the topmost moved layer was
    expect(s.layers.indexOf(pre)).toBe(base.layers.findIndex((l) => l.id === 'fireball') - 1);
    expect(diff(px(base), px(s))).toBeLessThanOrEqual(2);
  });

  it('the precomp layer moves, fades and retimes its whole group', () => {
    const r1 = precompose(base, ids);
    const plain = px(r1.state);
    const moved = updateLayer(r1.state, r1.id, {
      transform: { ...r1.state.layers.find((l) => l.id === r1.id).transform, x: 60 },
    });
    expect(diff(plain, px(moved))).toBeGreaterThan(50);
    const faded = updateLayer(r1.state, r1.id, { opacity: 0 });
    const onlyOthers = { ...r1.state, layers: r1.state.layers.filter((l) => l.id !== r1.id) };
    expect(diff(px(faded), px(onlyOthers))).toBe(0);
    const late = updateLayer(r1.state, r1.id, {
      time: { offset: 0.2, stretch: 1, in: 0.2, out: null },
    });
    expect(diff(px(late), px(r1.state))).toBeGreaterThan(20);
  });

  it('duplicating a precomp layer reuses the same precomp; nesting and loops', () => {
    let { state: s, id, compId } = precompose(base, ids);
    s = duplicateLayer(s, id).state;
    expect(s.layers.filter((l) => l.comp === compId).length).toBe(2);
    // nest: precompose the precomp layer itself
    const outer = precompose(s, [id], 'Outer');
    expect(nestedComps(outer.state, outer.compId).has(compId)).toBe(true);
    expect(alpha(px(outer.state))).toBeGreaterThan(0);
    // a loop (comp containing itself) renders nothing for that layer and does not hang
    const loop = setCompLayers(outer.state, compId, [
      ...outer.state.comps[compId].layers,
      { ...outer.state.layers.find((l) => l.id === outer.id), id: 'self' },
    ]);
    expect(() => px(loop)).not.toThrow();
  });

  it('files keep precomps; bad references are fixed with a warning', () => {
    const { state: s, id } = precompose(base, ids, 'Hot core');
    const file = JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 1 })));
    const back = parseExplosion(file);
    expect(back.warnings).toEqual([]);
    expect(back.state).toEqual(s);
    file.layers.find((l) => l.id === id).comp = 'missing';
    const bad = parseExplosion(file);
    expect(bad.warnings.join()).toMatch(/precomp "missing" not found/);
  });
});
