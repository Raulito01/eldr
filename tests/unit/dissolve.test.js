import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { createNoise } from '../../src/core/noise.js';
import { dissolveLayer, survival } from '../../src/render/dissolve.js';

const W = 96;
/** A layer surface with a solid square in the middle. */
function square() {
  const c = createCanvas(W, W);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff8000';
  ctx.fillRect(16, 16, 64, 64);
  return ctx;
}
const flat = (y) => [
  { x: 0, y },
  { x: 1, y },
];
const run = (params, t = 0.5) => {
  const ctx = square();
  dissolveLayer(ctx, params, { scale: 1, width: W, height: W, t, seconds: t, seed: 7 });
  return ctx.getImageData(0, 0, W, W).data;
};
const alphaSum = (d) => {
  let s = 0;
  for (let i = 3; i < d.length; i += 4) s += d[i];
  return s;
};
const FULL = 64 * 64 * 255;

describe('dissolve', () => {
  it('survival values stay in 0–1 for every mode', () => {
    const N = createNoise(3);
    for (const mode of ['curls', 'shards', 'holes']) {
      for (let i = 0; i < 400; i++) {
        const v = survival(mode, N, i * 0.137, i * 0.071, 0.3, 3);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('off, or amount 0, leaves the layer untouched; amount 1 removes it', () => {
    expect(alphaSum(run({ 'dissolve.mode': 'off', 'dissolve.amount': flat(1) }))).toBe(FULL);
    expect(alphaSum(run({ 'dissolve.mode': 'curls', 'dissolve.amount': flat(0) }))).toBe(FULL);
    expect(alphaSum(run({ 'dissolve.mode': 'shards', 'dissolve.amount': flat(1) }))).toBe(0);
  });

  it('more amount = less left, in every mode', () => {
    for (const mode of ['curls', 'shards', 'holes']) {
      const left = [0.2, 0.5, 0.8].map((a) =>
        alphaSum(run({ 'dissolve.mode': mode, 'dissolve.amount': flat(a), 'dissolve.size': 20 })),
      );
      expect(left[0], mode).toBeLessThan(FULL);
      expect(left[1], mode).toBeLessThan(left[0]);
      expect(left[2], mode).toBeLessThan(left[1]);
    }
  });

  it('follows the curve over effect time', () => {
    const p = {
      'dissolve.mode': 'holes',
      'dissolve.size': 20,
      'dissolve.amount': [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    expect(alphaSum(run(p, 0))).toBe(FULL);
    expect(alphaSum(run(p, 0.6))).toBeLessThan(alphaSum(run(p, 0.3)));
  });

  it('burn edge colours the pixels along dissolving edges', () => {
    const base = { 'dissolve.mode': 'holes', 'dissolve.amount': flat(0.5), 'dissolve.size': 24 };
    const plain = run(base);
    const burnt = run({ ...base, 'dissolve.edgePx': 3, 'dissolve.edgeColor': '#0000ffff' });
    let blue = 0;
    for (let i = 0; i < burnt.length; i += 4) {
      if (burnt[i + 3] > 0 && burnt[i + 2] > 128) blue++;
      expect(burnt[i + 3]).toBe(plain[i + 3]); // the edge colours, it never changes coverage
    }
    expect(blue).toBeGreaterThan(50);
  });

  it('is deterministic for the same seed and time', () => {
    const p = { 'dissolve.mode': 'shards', 'dissolve.amount': flat(0.5), 'dissolve.size': 18 };
    expect([...run(p)]).toEqual([...run(p)]);
  });

  it('new modes (D-088): survival in 0–1, and each mode removes more as the amount grows', () => {
    const N = createNoise(3);
    for (const mode of ['pixels', 'dots', 'sand']) {
      for (let i = 0; i < 300; i++) {
        const v = survival(mode, N, i * 0.137, i * 0.071, 0.3, 3);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    for (const mode of ['pixels', 'dots', 'lines', 'wipe', 'radialOut', 'radialIn', 'sand']) {
      const p = { 'dissolve.mode': mode, 'dissolve.size': 12 };
      const a = alphaSum(run({ ...p, 'dissolve.amount': flat(0.25) }));
      const b = alphaSum(run({ ...p, 'dissolve.amount': flat(0.6) }));
      expect(a, mode).toBeLessThan(FULL);
      expect(b, mode).toBeLessThan(a);
    }
  });

  it('pixels: whole square blocks go at once', () => {
    const d = run({ 'dissolve.mode': 'pixels', 'dissolve.size': 16, 'dissolve.amount': flat(0.5) });
    // inside one 16-px block (away from its anti-aliased edge) alpha is all-or-nothing and equal
    const block = new Set();
    for (let y = 50; y < 60; y++) for (let x = 50; x < 60; x++) block.add(d[(y * W + x) * 4 + 3]);
    expect(block.size).toBe(1);
  });

  it('wipe at 0°: the left side goes first', () => {
    const d = run({
      'dissolve.mode': 'wipe',
      'dissolve.roughness': 0,
      'dissolve.amount': flat(0.5),
    });
    expect(d[(48 * W + 20) * 4 + 3]).toBe(0);
    expect(d[(48 * W + 75) * 4 + 3]).toBe(255);
  });

  it('reveal is the same pattern backwards: shown + gone = the whole shape', () => {
    for (const mode of ['shards', 'pixels', 'wipe']) {
      const p = { 'dissolve.mode': mode, 'dissolve.size': 12, 'dissolve.roughness': 0 };
      const gone = run({ ...p, 'dissolve.amount': flat(0.7) });
      const shown = run({ ...p, 'dissolve.direction': 'reveal', 'dissolve.amount': flat(0.3) });
      // reveal 30 % shown == dissolve 70 % gone: identical pixels
      expect(Buffer.from(shown).equals(Buffer.from(gone)), mode).toBe(true);
    }
    // reveal at 0: nothing shown yet
    expect(
      alphaSum(
        run({
          'dissolve.mode': 'holes',
          'dissolve.direction': 'reveal',
          'dissolve.amount': flat(0),
        }),
      ),
    ).toBe(0);
  });
});
