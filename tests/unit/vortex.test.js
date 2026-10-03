import { describe, expect, it } from 'vitest';
import { setLoopPeriod } from '../../src/core/loopContext.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { emitterInstances, readEmitterParams } from '../../src/elements/emitter.js';
import { getDefaults } from '../../src/schema/index.js';
import { rayBeams, readRaysParams } from '../../src/shapes/rays.js';
import { readVortexParams, vortexArm } from '../../src/shapes/vortex.js';

const vp = (o = {}) =>
  readVortexParams({
    ...getDefaults(LAYER_TYPES.vortex.schema),
    ...Object.fromEntries(Object.entries(o).map(([k, v]) => [`vortex.${k}`, v])),
  });
const inst = (seconds, t = seconds / 2) => ({ seed: 5, t, seconds, age: 0.5 });

describe('vortex layer (D-115)', () => {
  it('is pure', () => {
    const a = vortexArm(vp(), 0, inst(0.4));
    const b = vortexArm(vp(), 0, inst(0.4));
    expect(a?.sample(0.5)).toEqual(b?.sample(0.5));
  });

  it('flat arms run from the inner radius out to the radius', () => {
    const p = vp({ radius: 100, inner: 0.2, variance: 0, breakup: 0 });
    const arm = vortexArm(p, 0, inst(0));
    const r = (v) => {
      const s = arm.sample(v);
      return Math.hypot(s.x, s.y);
    };
    expect(r(0)).toBeCloseTo(20, 6);
    expect(r(1)).toBeCloseTo(100, 6);
    expect(r(0.5)).toBeCloseTo(60, 6);
  });

  it('tilt squashes the spiral vertically (a portal on the ground)', () => {
    const p = vp({ radius: 100, inner: 0, tilt: 60, variance: 0, breakup: 0 });
    let maxY = 0;
    let maxX = 0;
    for (let arm = 0; arm < p.arms; arm++) {
      const a = vortexArm(p, arm, inst(0));
      for (let v = 0; v <= 1; v += 0.01) {
        const s = a.sample(v);
        maxY = Math.max(maxY, Math.abs(s.y));
        maxX = Math.max(maxX, Math.abs(s.x));
      }
    }
    expect(maxY).toBeLessThan(maxX * 0.6);
  });

  it('sphere arms stay on the ball and have a near and a far side', () => {
    const p = vp({ form: 'sphere', radius: 80, tilt: 0, variance: 0, breakup: 0 });
    const a = vortexArm(p, 0, inst(0));
    let near = 0;
    let far = 0;
    for (let v = 0; v <= 1; v += 0.02) {
      const s = a.sample(v);
      expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(80 + 1e-6);
      if (a.depth(v) >= 0) near++;
      else far++;
    }
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
  });

  it('loops: the spin comes back to the start after one loop', () => {
    setLoopPeriod(2);
    const p = vp({ speed: 0.7, breakup: 0 });
    const a = vortexArm(p, 1, { seed: 5, t: 0, seconds: 0, age: 0.5 }).sample(0.6);
    const b = vortexArm(p, 1, { seed: 5, t: 1, seconds: 2, age: 0.5 }).sample(0.6);
    setLoopPeriod(0);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it('reveal shows the arm from its outer end inward', () => {
    const half = vp({
      reveal: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
      variance: 0,
    });
    expect(vortexArm(half, 0, inst(0)).vStart).toBeCloseTo(0.5, 6);
  });
});

describe('light rays (D-115)', () => {
  const rp = (o = {}) =>
    readRaysParams({
      ...getDefaults(LAYER_TYPES.rays.schema),
      ...Object.fromEntries(Object.entries(o).map(([k, v]) => [`rays.${k}`, v])),
    });

  it('one beam per ray, pure, pointing up by default', () => {
    const p = rp({ count: 9 });
    const a = rayBeams(p, 3, 0.2);
    expect(a).toEqual(rayBeams(p, 3, 0.2));
    expect(a.length).toBe(9);
    for (const b of a) expect(Math.sin(b.angle)).toBeLessThan(0); // up (y down on screen)
  });

  it('fan 0: parallel beams; fan 1: they spread out', () => {
    const spread = (fan) => {
      const as = rayBeams(rp({ fan, flicker: 0 }), 3, 0).map((b) => b.angle);
      return Math.max(...as) - Math.min(...as);
    };
    expect(spread(0)).toBeCloseTo(0, 6);
    expect(spread(1)).toBeGreaterThan(1);
  });
});

describe('emitter pull and swirl (D-115)', () => {
  const ep = (o = {}) =>
    readEmitterParams({
      ...getDefaults(LAYER_TYPES.dotEmitter.schema),
      'emit.shape': 'ring',
      'emit.width': 300,
      'emit.speed': 0,
      'emit.rate': 20,
      'emit.life': 2,
      ...o,
    });
  const frame = (seconds) => ({
    seconds,
    seed: 4,
    timing: { frameCount: 48, fps: 24, loop: false },
  });
  const meanR = (ps) => ps.reduce((s, q) => s + Math.hypot(q.x, q.y), 0) / ps.length;

  it('pull draws particles toward the centre', () => {
    const still = emitterInstances(ep(), frame(1.5));
    const pulled = emitterInstances(ep({ 'emit.pull': 1.5 }), frame(1.5));
    expect(meanR(pulled)).toBeLessThan(meanR(still) * 0.6);
  });

  it('swirl turns them around the centre without changing their distance', () => {
    const still = emitterInstances(ep(), frame(1));
    const turned = emitterInstances(ep({ 'emit.swirl': 0.25 }), frame(1));
    expect(meanR(turned)).toBeCloseTo(meanR(still), 3);
    expect(turned[0].x).not.toBeCloseTo(still[0].x, 1);
  });

  it('tilted swirl keeps the particles on a squashed ellipse', () => {
    // born on a flat line through the centre, turned in a plane tilted 60°: |y| ≤ r · cos 60°
    const o = { 'emit.shape': 'box', 'emit.height': 0, 'emit.swirlTilt': 60 };
    const turned = emitterInstances(ep({ ...o, 'emit.swirl': 0.25 }), frame(1.2));
    const maxY = Math.max(...turned.map((q) => Math.abs(q.y)));
    expect(maxY).toBeLessThan(150 * 0.5 + 1);
    expect(maxY).toBeGreaterThan(20);
  });
});
