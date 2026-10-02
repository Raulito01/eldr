import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import { apply, worldMatrices } from '../../src/core/transform2d.js';
import { centreAnchor, centreLayer, jumpKey, keyFrames } from '../../src/effects/editorOps.js';
import { createExplosion } from '../../src/effects/explosion/explosion.js';
import { layerAt } from '../../src/effects/layerAnimation.js';
import { addLayer, setParent, updateLayer } from '../../src/effects/layerStack.js';

const layer = (s, id) => s.layers.find((l) => l.id === id);

describe('keyframe navigation (J / K)', () => {
  it('collects key frames from every layer (in comp time) and jumps between them', () => {
    let s = updateLayer(createExplosion(), 'core', {
      keys: { 'transform.x': setKey(setKey([], 0, 0), 10 / 24, 5) },
    });
    s = updateLayer(s, 'fireball', {
      time: { offset: 2 / 24, stretch: 1, in: 0, out: null },
      keys: { 'glow.radius': setKey([], 4 / 24, 1) }, // layer time 4 → comp frame 6
    });
    const frames = keyFrames(s, 24, 24);
    expect(frames).toEqual([0, 6, 10]);
    expect(keyFrames(s, 24, 24, 'fireball')).toEqual([6]);
    expect(jumpKey(frames, 6, 1)).toBe(10);
    expect(jumpKey(frames, 6, -1)).toBe(0);
    expect(jumpKey(frames, 3, -1)).toBe(0);
    expect(jumpKey(frames, 10, 1)).toBeNull();
    expect(jumpKey(frames, 0, -1)).toBeNull();
  });
});

describe('centre layer / anchor', () => {
  it('centres the anchor in the frame, also under a moved, rotated parent', () => {
    let s = addLayer(createExplosion(), 'null').state;
    s = updateLayer(s, 'null', {
      transform: {
        ...layer(s, 'null').transform,
        x: 80,
        y: -30,
        rotation: 45,
        scaleX: 200,
        scaleY: 200,
      },
    });
    s = updateLayer(s, 'core', { transform: { ...layer(s, 'core').transform, x: 40, anchorX: 6 } });
    s = setParent(s, 'core', 'null');
    s = centreLayer(s, 'core', 0);
    const w = worldMatrices(s.layers).get('core');
    const [x, y] = apply(w, layer(s, 'core').transform.anchorX, layer(s, 'core').transform.anchorY);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
  });

  it('sets a key when the position is animated', () => {
    let s = updateLayer(createExplosion(), 'core', {
      keys: { 'transform.x': setKey([], 0, 100) },
    });
    s = centreLayer(s, 'core', 0.5);
    expect(layer(s, 'core').keys['transform.x'].length).toBe(2);
    expect(layerAt(layer(s, 'core'), 0.5).transform.x).toBeCloseTo(0, 9);
  });

  it('centre anchor puts the anchor on the layer origin without moving the layer', () => {
    let s = updateLayer(createExplosion(), 'core', {
      transform: { x: 30, y: 10, anchorX: 12, anchorY: -8, scaleX: 150, scaleY: 150, rotation: 30 },
    });
    const before = worldMatrices(s.layers).get('core');
    s = centreAnchor(s, 'core', 0);
    const after = worldMatrices(s.layers).get('core');
    expect([layer(s, 'core').transform.anchorX, layer(s, 'core').transform.anchorY]).toEqual([
      0, 0,
    ]);
    for (const [px, py] of [
      [0, 0],
      [9, 4],
    ]) {
      const a = apply(before, px, py);
      const b = apply(after, px, py);
      expect(b[0]).toBeCloseTo(a[0], 9);
      expect(b[1]).toBeCloseTo(a[1], 9);
    }
  });
});
