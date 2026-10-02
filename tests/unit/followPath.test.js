import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import { apply, worldMatrices } from '../../src/core/transform2d.js';
import { buildExplosion, createExplosion } from '../../src/effects/explosion/explosion.js';
import { applyFollow, makeFollow, pathSources, pointOnPath } from '../../src/effects/followPath.js';
import { layerAt } from '../../src/effects/layerAnimation.js';
import { addLayer, addMask, updateLayer } from '../../src/effects/layerStack.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';

/** an open L-shaped path: (0,0) → (100,0) → (100,100), as a mask in a 100×100 box at (50,50) */
const LPATH = {
  x: 50,
  y: 50,
  w: 100,
  h: 100,
  path: [
    { x: -0.5, y: -0.5, ix: 0, iy: 0, ox: 0, oy: 0 },
    { x: 0.5, y: -0.5, ix: 0, iy: 0, ox: 0, oy: 0 },
    { x: 0.5, y: 0.5, ix: 0, iy: 0, ox: 0, oy: 0 },
  ],
  closed: false,
};
const L = (s, id) => s.layers.find((l) => l.id === id);

function scene() {
  let s = addLayer(createExplosion(), 'guide').state;
  s = addMask(s, 'guide', 'path', LPATH).state;
  s = updateLayer(s, 'core', { follow: makeFollow('guide', 'm1') });
  return s;
}

describe('Follow Path (4.Pa)', () => {
  it('points along an open path at even speed; direction', () => {
    const s = scene();
    const m = L(s, 'guide').masks[0];
    const half = pointOnPath(m, 0.5);
    expect(half.x).toBeCloseTo(100, 1);
    expect(half.y).toBeCloseTo(0, 1);
    const q = pointOnPath(m, 0.75);
    expect(q.x).toBeCloseTo(100, 1);
    expect(q.y).toBeCloseTo(50, 1);
    expect(q.angle).toBeCloseTo(Math.PI / 2, 3);
    expect(pathSources(s.layers, 'core').map((p) => p.layer.id)).toEqual(['guide']);
  });

  it('places the follower (auto-orient) also when the path layer moves; parent space', () => {
    let s = scene();
    s = updateLayer(s, 'core', { follow: { ...L(s, 'core').follow, progress: 75 } });
    let core = L({ layers: applyFollow(s.layers) }, 'core');
    expect([core.transform.x, core.transform.y]).toEqual([
      expect.closeTo(100, 1),
      expect.closeTo(50, 1),
    ]);
    expect(core.transform.rotation).toBeCloseTo(90, 2);
    // move the path layer: the follower comes along
    s = updateLayer(s, 'guide', { transform: { ...L(s, 'guide').transform, x: 30 } });
    core = L({ layers: applyFollow(s.layers) }, 'core');
    expect(core.transform.x).toBeCloseTo(130, 1);
    // parented follower: lands on the same WORLD point
    s = updateLayer(s, 'fireball', {
      transform: { ...L(s, 'fireball').transform, x: -40, rotation: 30 },
    });
    s = updateLayer(s, 'core', { parent: 'fireball' });
    const worlds = worldMatrices(applyFollow(s.layers));
    const c = L({ layers: applyFollow(s.layers) }, 'core');
    const w = apply(worlds.get('core'), c.transform.anchorX, c.transform.anchorY);
    expect(w[0]).toBeCloseTo(130, 1);
    expect(w[1]).toBeCloseTo(50, 1);
  });

  it('progress is keyframable; the renderer gets the moved layer; loop wraps', () => {
    let s = scene();
    s = updateLayer(s, 'core', {
      keys: { 'follow.progress': setKey(setKey([], 0, 0, 'linear'), 1, 100, 'linear') },
    });
    const at = layerAt(L(s, 'core'), 0.5);
    expect(at.follow.progress).toBeCloseTo(50, 6);
    const { effect } = buildExplosion(s);
    const frameLayers = effect.at({ seconds: 0.5, t: 0.5, drawFrame: 0 }).layers;
    expect(frameLayers.find((l) => l.id === 'core').matrix[4]).toBeCloseTo(100, 0);
    s = updateLayer(s, 'core', {
      keys: {},
      follow: { ...L(s, 'core').follow, progress: 150, loop: true },
    });
    expect(L({ layers: applyFollow(s.layers) }, 'core').transform.x).toBeCloseTo(100, 1);
  });

  it('files keep follow + open paths; a missing path is removed with a warning', () => {
    const s = scene();
    const file = JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 1 })));
    const back = parseExplosion(file);
    expect(back.warnings).toEqual([]);
    expect(back.state).toEqual(s);
    file.layers.find((l) => l.id === 'core').follow.mask = 'nope';
    expect(parseExplosion(file).warnings.join()).toMatch(/follow path "guide\/nope" not found/);
  });
});
