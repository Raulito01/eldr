import { describe, expect, it } from 'vitest';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { burstInstances, motion1D, readBurstParams } from '../../src/elements/burst.js';
import { getDefaults } from '../../src/schema/index.js';
import { stretchedLength } from '../../src/shapes/streak.js';

const P = (over = {}) => ({
  ...readBurstParams(getDefaults(LAYER_TYPES.puffBurst.schema)),
  lifeVariance: 0,
  life: 1,
  window: 0,
  start: 0,
  ...over,
});

describe('motion1D (closed-form drag + acceleration)', () => {
  it('without drag it is ordinary ballistic motion', () => {
    expect(motion1D(10, 4, 0, 2)).toEqual({ x: 28, v: 18 });
  });

  it('tiny drag ≈ no drag (no precision blow-up)', () => {
    const a = motion1D(10, 4, 1e-7, 2);
    expect(a.x).toBeCloseTo(28, 4);
    expect(a.v).toBeCloseTo(18, 4);
    const b = motion1D(10, 4, 1e-4, 2);
    expect(b.x).toBeCloseTo(28, 1);
  });

  it('velocity is the derivative of position', () => {
    const h = 1e-6;
    for (const [v0, a, k, t] of [
      [300, 0, 3, 0.4],
      [-120, 500, 1.5, 0.7],
      [50, -300, 8, 0.2],
    ]) {
      const dx = (motion1D(v0, a, k, t + h).x - motion1D(v0, a, k, t - h).x) / (2 * h);
      expect(dx).toBeCloseTo(motion1D(v0, a, k, t).v, 3);
    }
  });

  it('drag brings velocity to the terminal value a/k', () => {
    expect(motion1D(500, 300, 6, 10).v).toBeCloseTo(50, 6);
  });
});

describe('burstInstances', () => {
  it('spawns `count` elements, all deterministic', () => {
    const p = P({ count: 10 });
    const a = burstInstances(p, 0.3, 42);
    expect(a).toHaveLength(10);
    expect(burstInstances(p, 0.3, 42)).toEqual(a);
    expect(burstInstances(p, 0.3, 43)).not.toEqual(a);
  });

  it('adding elements never changes the existing ones (per-element seeds)', () => {
    const few = burstInstances(P({ count: 5 }), 0.4, 7);
    const many = burstInstances(P({ count: 12 }), 0.4, 7);
    expect(many.slice(0, 5)).toEqual(few);
  });

  it('respects spawn start/window and life', () => {
    expect(burstInstances(P({ start: 0.5 }), 0.4, 1)).toEqual([]);
    expect(burstInstances(P({ life: 0.2 }), 0.5, 1)).toEqual([]);
    const spread = burstInstances(P({ count: 40, window: 0.5 }), 0.1, 1);
    expect(spread.length).toBeGreaterThan(0);
    expect(spread.length).toBeLessThan(40);
  });

  it('gravity pulls down, buoyancy pushes up', () => {
    const still = { speed: 0, spawnRadius: 0, count: 1 };
    const [down] = burstInstances(P({ ...still, gravity: 400 }), 0.5, 1);
    const [up] = burstInstances(P({ ...still, buoyancy: 400 }), 0.5, 1);
    expect(down.y).toBeGreaterThan(0);
    expect(up.y).toBeLessThan(0);
  });

  it('cone 0 sends everything in the set direction (0° = up)', () => {
    for (const inst of burstInstances(
      P({ cone: 0, direction: 0, count: 8, spawnRadius: 0 }),
      0.3,
      3,
    )) {
      expect(inst.x).toBeCloseTo(0, 9);
      expect(inst.y).toBeLessThan(0);
    }
  });

  it('align to motion points each element along its velocity', () => {
    for (const inst of burstInstances(
      P({ alignToVelocity: true, gravity: 600, count: 6 }),
      0.4,
      9,
    )) {
      expect(inst.rotation).toBeCloseTo(Math.atan2(inst.vy, inst.vx), 12);
    }
  });

  it('elements slow down with drag (speed ratio falls toward 0)', () => {
    const [early] = burstInstances(P({ count: 1, drag: 6 }), 0.05, 2);
    const [late] = burstInstances(P({ count: 1, drag: 6 }), 0.8, 2);
    expect(late.speedRatio).toBeLessThan(early.speedRatio);
    expect(late.speedRatio).toBeLessThan(0.05);
  });
});

describe('streak stretch', () => {
  it('length follows speed by the stretch amount', () => {
    expect(stretchedLength(100, 0, 0.2)).toBe(100);
    expect(stretchedLength(100, 1, 0.2)).toBeCloseTo(20, 12);
    expect(stretchedLength(100, 0.5, 0)).toBe(50);
  });
});
