import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import { buildExplosion, createExplosion } from '../../src/effects/explosion/explosion.js';
import { addLayer, setParent, updateLayer } from '../../src/effects/layerStack.js';
import { EMITTER_PARAMS, emitterInstances, readEmitterParams } from '../../src/elements/emitter.js';
import { getDefaults } from '../../src/schema/index.js';
import { defineSchema } from '../../src/schema/schema.js';

const DEF = getDefaults(defineSchema(EMITTER_PARAMS));
/** @param {Record<string, any>} o */
const P = (o = {}) => readEmitterParams({ ...DEF, ...o });
const LOOP = { frameCount: 48, fps: 24, loop: true };
const ONCE = { frameCount: 48, fps: 24, loop: false };
const still = (o = {}) => ({ 'emit.speed': 0, 'emit.gravity': 0, 'emit.turbulence': 0, ...o });
const xy = (list) => list.map((i) => [i.x, i.y]);

describe('emitter (4.Pb)', () => {
  it('is deterministic and seed-dependent', () => {
    const p = P();
    const a = emitterInstances(p, { seconds: 1.3, seed: 7, timing: ONCE });
    const b = emitterInstances(p, { seconds: 1.3, seed: 7, timing: ONCE });
    expect(a.length).toBeGreaterThan(3);
    expect(b).toEqual(a);
    expect(emitterInstances(p, { seconds: 1.3, seed: 8, timing: ONCE })).not.toEqual(a);
  });

  it('loops seamlessly: the end of the loop is its start', () => {
    const p = P({ 'emit.rate': 23, 'emit.life': 1.4 });
    const at0 = emitterInstances(p, { seconds: 0, seed: 3, timing: LOOP });
    const atP = emitterInstances(p, { seconds: 2, seed: 3, timing: LOOP });
    expect(at0.length).toBeGreaterThan(10);
    expect(xy(atP).flat()).toEqual(
      xy(at0)
        .flat()
        .map((v) => expect.closeTo(v, 6)),
    );
  });

  it('pre-warm fills frame 0; start delays a one-shot', () => {
    expect(emitterInstances(P(), { seconds: 0, seed: 1, timing: ONCE }).length).toBeLessThan(2);
    const warm = emitterInstances(P({ 'emit.prewarm': true }), {
      seconds: 0,
      seed: 1,
      timing: ONCE,
    });
    expect(warm.length).toBeGreaterThan(5);
    const late = P({ 'emit.start': 1 });
    expect(emitterInstances(late, { seconds: 0.9, seed: 1, timing: ONCE })).toHaveLength(0);
  });

  it('caps particles (trail copies are extra), newest kept', () => {
    const p = P({ 'emit.rate': 200, 'emit.maxParticles': 5, 'trail.count': 2 });
    const list = emitterInstances(p, { seconds: 1, seed: 1, timing: ONCE });
    expect(list.filter((i) => i.scale > 0).length).toBeLessThanOrEqual(15);
    const solo = emitterInstances(P({ 'emit.rate': 200, 'emit.maxParticles': 5 }), {
      seconds: 1,
      seed: 1,
      timing: ONCE,
    });
    expect(solo).toHaveLength(5);
    expect(Math.max(...solo.map((i) => i.age))).toBeLessThan(0.1);
  });

  it('pulses: particles come in bursts', () => {
    const p = P({ 'emit.pulseEvery': 0.5, 'emit.pulseCount': 6, 'emit.life': 0.3 });
    const between = emitterInstances(p, { seconds: 0.4, seed: 1, timing: ONCE });
    const after = emitterInstances(p, { seconds: 0.55, seed: 1, timing: ONCE });
    expect(between).toHaveLength(0);
    expect(after).toHaveLength(6);
  });

  it('world space: particles stay where they were born (a trail behind a moving emitter)', () => {
    const matrixAt = (s) => [1, 0, 0, 1, s * 200, 0];
    const p = P(still({ 'emit.life': 2, 'emit.rate': 30 }));
    const list = emitterInstances(p, { seconds: 1, seed: 2, timing: ONCE, matrixAt });
    expect(list.worldSpace).toBe(true);
    const xs = list.map((i) => i.x);
    expect(Math.min(...xs)).toBeLessThan(20);
    expect(Math.max(...xs)).toBeGreaterThan(180);
    // "Move with emitter": everything in the layer's own space
    const local = emitterInstances(P(still({ 'emit.local': true, 'emit.life': 2 })), {
      seconds: 1,
      seed: 2,
      timing: ONCE,
      matrixAt,
    });
    expect(local.worldSpace).toBeUndefined();
    for (const i of local) expect(Math.abs(i.x)).toBeLessThan(1e-9);
  });

  it('inherits the emitter velocity', () => {
    const matrixAt = (s) => [1, 0, 0, 1, s * 100, 0];
    const p = P(still({ 'emit.inherit': 50, 'emit.drag': 0 }));
    const list = emitterInstances(p, { seconds: 1, seed: 2, timing: ONCE, matrixAt });
    for (const i of list) expect(i.vx).toBeCloseTo(50, 3);
  });

  it('emits along the layer’s open pen path', () => {
    const path = {
      id: 'm1',
      shape: 'path',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      closed: false,
      path: [
        { x: -0.5, y: 0, ix: 0, iy: 0, ox: 0, oy: 0 },
        { x: 0.5, y: 0, ix: 0, iy: 0, ox: 0, oy: 0 },
      ],
    };
    const p = P(still({ 'emit.shape': 'path', 'emit.rate': 60 }));
    const list = emitterInstances(p, { seconds: 1, seed: 4, timing: ONCE, path });
    expect(list.length).toBeGreaterThan(20);
    for (const i of list) {
      expect(Math.abs(i.y)).toBeLessThan(1e-6);
      expect(Math.abs(i.x)).toBeLessThanOrEqual(50 + 1e-6);
    }
    const xs = list.map((i) => i.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(60);
  });

  it('the build gives emitters their motion over time (parent null keyframed)', () => {
    let s = createExplosion();
    let r = addLayer(s, 'null');
    s = r.state;
    const nullId = r.id;
    r = addLayer(s, 'sparkEmitter');
    s = r.state;
    const em = r.id;
    s = setParent(s, em, nullId);
    const n = s.layers.find((l) => l.id === nullId);
    s = updateLayer(s, nullId, {
      keys: { 'transform.x': setKey(setKey([], 0, 0, 'linear'), 1, 300, 'linear') },
      transform: { ...n.transform, x: 0 },
    });
    const built = buildExplosion(s);
    const layer = built.effect.at({ seconds: 0.5 }).layers.find((l) => l.id === em);
    expect(typeof layer.matrixAt).toBe('function');
    const m0 = layer.matrixAt(0);
    const m1 = layer.matrixAt(1);
    const mid = layer.matrixAt(0.5 + 1 / 480);
    expect(m1[4] - m0[4]).toBeCloseTo(300, 3);
    expect(mid[4] - m0[4]).toBeCloseTo(150 + 300 / 480, 3);
    // a still comp: no sampler
    const plain = buildExplosion(addLayer(createExplosion(), 'dotEmitter').state);
    expect(plain.effect.layers.every((l) => !l.matrixAt)).toBe(true);
  });
});
