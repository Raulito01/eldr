// Layer stack operations + per-layer timing / solo / opacity in the build (step 3.6a).
import { describe, expect, it } from 'vitest';
import {
  buildExplosion,
  createExplosion,
  makeLayer,
} from '../../src/effects/explosion/explosion.js';
import {
  addLayer,
  duplicateLayer,
  moveLayer,
  nudgeLayer,
  parentCandidates,
  removeLayer,
  reseedLayer,
  setParent,
  uniqueId,
  updateLayer,
} from '../../src/effects/layerStack.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { sanitizeParams } from '../../src/schema/index.js';

const ids = (s) => s.layers.map((l) => l.id);
const layer = (s, id) => s.layers.find((l) => l.id === id);

describe('layer stack ops', () => {
  it('add puts a valid default layer directly above the selection (or on top)', () => {
    const s0 = createExplosion();
    const { state, id } = addLayer(s0, 'fieldFire', 'fireball');
    expect(id).toBe('fieldFire');
    expect(ids(state).indexOf(id)).toBe(ids(state).indexOf('fireball') + 1);
    const l = layer(state, id);
    expect(l).toMatchObject({
      label: 'Field fire',
      enabled: true,
      solo: false,
      opacity: 1,
      blend: 'normal',
      anchor: 'afterImpact',
    });
    expect(sanitizeParams(LAYER_TYPES.fieldFire.schema, l.params).warnings).toEqual([]);
    const top = addLayer(state, 'fieldFire');
    expect(top.id).toBe('fieldFire-2');
    expect(layer(top.state, top.id).label).toBe('Field fire 2');
    expect(ids(top.state).at(-1)).toBe('fieldFire-2');
    expect(s0.layers.length).toBe(createExplosion().layers.length); // input untouched
  });

  it('duplicate sits above the original, keeps settings AND randomness, gets a new id/label', () => {
    const s0 = updateLayer(createExplosion(), 'core', { solo: true, opacity: 0.4 });
    const { state, id } = duplicateLayer(s0, 'core');
    expect(id).toBe('core-2');
    expect(ids(state).indexOf(id)).toBe(ids(state).indexOf('core') + 1);
    const [a, b] = [layer(state, 'core'), layer(state, id)];
    expect(b.params).toEqual(a.params);
    expect(b.params).not.toBe(a.params); // deep copy
    expect(b.seedKey).toBe(a.seedKey);
    expect(b.label).toBe('Fire core copy');
    expect(b.solo).toBe(false);
    expect(b.opacity).toBe(0.4);
  });

  it('remove, move (clamped) and nudge', () => {
    const s0 = createExplosion();
    expect(ids(removeLayer(s0, 'smoke'))).not.toContain('smoke');
    expect(ids(moveLayer(s0, 'flash', 0))[0]).toBe('flash');
    expect(ids(moveLayer(s0, 'smoke', 99)).at(-1)).toBe('smoke');
    const up = nudgeLayer(s0, 'smoke', 1);
    expect(ids(up).slice(0, 2)).toEqual([ids(s0)[1], 'smoke']);
    expect(ids(nudgeLayer(s0, 'smoke', -1))).toEqual(ids(s0));
  });

  it('reseed changes only the randomness key, and changes it again each time', () => {
    const s1 = reseedLayer(createExplosion(), 'sparks');
    const s2 = reseedLayer(s1, 'sparks');
    expect(layer(s1, 'sparks').seedKey).toBe('sparks#2');
    expect(layer(s2, 'sparks').seedKey).toBe('sparks#3');
    expect(uniqueId({ layers: [{ id: 'a' }, { id: 'a-2' }] }, 'a-2')).toBe('a-3');
  });
});

describe('build: anchors, solo, opacity, seedKey', () => {
  const base = () => {
    const s = createExplosion();
    s.globals['explosion.impact'] = 0.2;
    return s;
  };
  const built = (s, id) => buildExplosion(s).effect.layers.find((l) => l.id === id);

  it('an added layer is timed after the impact by default; free ignores the impact', () => {
    const { state, id } = addLayer(base(), 'blob');
    expect(built(state, id).params['single.start']).toBeCloseTo(0.2, 12);
    const free = updateLayer(state, id, { anchor: 'free' });
    expect(built(free, id).params['single.start']).toBe(0);
  });

  it('anticipation / flash anchors work for any layer type (orbit + burst too)', () => {
    let { state, id } = addLayer(base(), 'orbitSparkle');
    state = updateLayer(state, id, { anchor: 'anticipation' });
    expect(built(state, id).params['orbit.end']).toBe(0.2);
    const b = addLayer(state, 'sparkleBurst');
    const f = updateLayer(b.state, b.id, { anchor: 'flash' });
    expect(built(f, b.id).params['burst.start']).toBe(0.2);
  });

  it('solo shows only soloed visible layers; opacity, blend and seedKey reach the renderer', () => {
    let s = updateLayer(base(), 'core', {
      enabled: true,
      solo: true,
      opacity: 0.5,
      blend: 'overlay',
    });
    const visible = buildExplosion(s)
      .effect.layers.filter((l) => l.enabled)
      .map((l) => l.id);
    expect(visible).toEqual(['core']);
    expect(built(s, 'core')).toMatchObject({ opacity: 0.5, blend: 'overlay', seedKey: 'core' });
    s = updateLayer(s, 'core', { enabled: false });
    expect(buildExplosion(s).effect.layers.filter((l) => l.enabled).length).toBeGreaterThan(3);
  });

  it('a duplicate renders identically to its original (same seedKey); reseed makes it differ', () => {
    const { state, id } = duplicateLayer(base(), 'fireball');
    expect(built(state, id).seedKey).toBe(built(state, 'fireball').seedKey);
    expect(built(reseedLayer(state, id), id).seedKey).not.toBe('fireball');
  });

  it('makeLayer fills every field', () => {
    expect(makeLayer({ id: 'x', type: 'blob' })).toMatchObject({
      label: 'x',
      seedKey: 'x',
      anchor: 'afterImpact',
      opacity: 1,
    });
  });
});

describe('layer transform in the build + renderer (3.6b)', () => {
  it('a moved / rotated / parented layer renders exactly where its world matrix says', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const { createCanvas2DBackend, createRenderer } = await import('../../src/render/index.js');
    const dot = {
      schema: [],
      render(ctx) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(10, -1, 2, 2); // a dot at (11, 0) in layer space
      },
    };
    const r = createRenderer({
      backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
      layerTypes: { dot, null: { schema: [], render() {} } },
    });
    const at = (layers) => {
      const effect = {
        id: 'x',
        timing: { frameCount: 1, fps: 24, loop: false },
        layers: layers.map((l) => ({ id: l.id, type: l.type, matrix: l.matrix })),
      };
      const img = r.renderFrameImageData(effect, 1, 0, { width: 100, height: 100 });
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3] > 200) return [(i / 4) % 100, Math.floor(i / 4 / 100)];
      }
      return null;
    };
    const { worldMatrices } = await import('../../src/core/transform2d.js');
    const stack = [
      { id: 'n', type: 'null', transform: { x: -20, y: 10, rotation: 90 } },
      { id: 'd', type: 'dot', parent: 'n', transform: { x: 5 } },
    ];
    const w = worldMatrices(stack);
    // centre (50,50) + null (−20,10) + rotate 90°: child x 5 → +y 5, dot x 11 → +y 11 ⇒ (30, 76)
    const p = at(stack.map((l) => ({ ...l, matrix: w.get(l.id) })));
    expect(p[0]).toBeGreaterThanOrEqual(28);
    expect(p[0]).toBeLessThanOrEqual(31);
    expect(p[1]).toBeGreaterThanOrEqual(75);
    expect(p[1]).toBeLessThanOrEqual(77);
  });

  it('buildExplosion passes world matrices (identity layers stay matrix-free)', () => {
    let s = createExplosion();
    s = addLayer(s, 'null').state;
    s = updateLayer(s, 'null', { transform: { ...layer(s, 'null').transform, x: 40 } });
    s = updateLayer(s, 'core', { parent: 'null' });
    const b = (id) => buildExplosion(s).effect.layers.find((l) => l.id === id);
    expect(b('core').matrix).toEqual([1, 0, 0, 1, 40, 0]);
    expect(b('smoke').matrix).toBeUndefined();
  });
});

describe('parenting ops (3.6b)', () => {
  const rig = () => {
    let s = createExplosion();
    s = addLayer(s, 'null').state;
    s = updateLayer(s, 'null', {
      transform: { ...layer(s, 'null').transform, x: 30, rotation: 45, scaleX: 150, scaleY: 150 },
    });
    return s;
  };
  const world = async (s, id) => {
    const { worldMatrices, apply } = await import('../../src/core/transform2d.js');
    return apply(worldMatrices(s.layers).get(id), 7, 3);
  };

  it('setParent keeps the layer in place; refuses loops and unknown parents', async () => {
    const s0 = rig();
    const before = await world(s0, 'core');
    const s1 = setParent(s0, 'core', 'null');
    expect(layer(s1, 'core').parent).toBe('null');
    const after = await world(s1, 'core');
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
    expect(setParent(s1, 'null', 'core')).toBe(s1); // loop
    expect(setParent(s1, 'core', 'nope')).toBe(s1);
    expect(parentCandidates(s1, 'null').map((l) => l.id)).not.toContain('core');
  });

  it('deleting a parent keeps its children in place and hands them to the grand-parent', async () => {
    let s = rig();
    s = addLayer(s, 'null').state; // null-2 on top
    s = setParent(s, 'null', 'null-2');
    s = setParent(s, 'core', 'null');
    const before = await world(s, 'core');
    const s2 = removeLayer(s, 'null');
    expect(layer(s2, 'core').parent).toBe('null-2');
    const after = await world(s2, 'core');
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });

  it('a duplicate keeps the same parent', () => {
    const s = setParent(rig(), 'core', 'null');
    const d = duplicateLayer(s, 'core');
    expect(layer(d.state, d.id).parent).toBe('null');
  });
});
