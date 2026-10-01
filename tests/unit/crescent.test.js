import { describe, expect, it } from 'vitest';
import {
  crescentProfile,
  crescentStrip,
  stripOutline,
  stripRange,
} from '../../src/shapes/crescent.js';

const flat = [
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];
/** Crescent params with a few overrides. */
const P = (over = {}) => ({
  radius: 100,
  sweep: 180,
  thickness: 20,
  thicknessOverLife: flat,
  balance: 0,
  sharpness: 0.6,
  hook: 0,
  hotEdge: 0,
  wobble: 0,
  wobbleSpeed: 0,
  reverse: false,
  reveal: flat,
  ...over,
});
const O = { seed: 1, t: 0, age: 0 };
const strip = (over = {}, o = {}) => /** @type {any} */ (crescentStrip(P(over), { ...O, ...o }));

describe('crescent profile', () => {
  it('is zero at both tips and 1 at the widest point', () => {
    expect(crescentProfile(0, 0, 0.6)).toBe(0);
    expect(crescentProfile(1, 0, 0.6)).toBe(0);
    expect(crescentProfile(0.5, 0, 0.6)).toBeCloseTo(1, 9);
  });

  it('balance moves the widest point toward the head (+) or tail (−)', () => {
    const peakAt = (b) => {
      let best = 0;
      let at = 0;
      for (let i = 1; i < 1000; i++) {
        const w = crescentProfile(i / 1000, b, 0.6);
        if (w > best) [best, at] = [w, i / 1000];
      }
      return at;
    };
    expect(peakAt(0.5)).toBeGreaterThan(0.6);
    expect(peakAt(-0.5)).toBeLessThan(0.4);
  });

  it('sharper tips are thinner near the ends', () => {
    expect(crescentProfile(0.05, 0, 1)).toBeLessThan(crescentProfile(0.05, 0, 0));
  });
});

describe('crescent strip', () => {
  it('centreline lies on the arc, around the top by default (anchor circle)', () => {
    const s = strip();
    const mid = s.sample(0.5);
    expect(mid.x).toBeCloseTo(0, 6);
    expect(mid.y).toBeCloseTo(-100, 6);
    for (const v of [0, 0.25, 0.75, 1]) {
      const p = s.sample(v);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(100, 6);
    }
    // normal points away from the arc centre
    expect(mid.ny).toBeCloseTo(-1, 6);
  });

  it('head runs clockwise (toward +x at the top); reverse flips it', () => {
    expect(strip().sample(1).x).toBeGreaterThan(0);
    expect(strip({ reverse: true }).sample(1).x).toBeLessThan(0);
  });

  it('anchor "arc" puts the midpoint at the origin with the head toward +x', () => {
    const s = strip({}, { anchor: 'arc' });
    const m = s.sample(0.5);
    expect(Math.hypot(m.x, m.y)).toBeLessThan(1e-6);
    expect(s.sample(0.6).x).toBeGreaterThan(0);
  });

  it('a positive hook pulls the head toward the arc centre; negative pushes it out', () => {
    const r = (h) => {
      const p = strip({ hook: h }).sample(1);
      return Math.hypot(p.x, p.y);
    };
    expect(r(0.8)).toBeLessThan(90);
    expect(r(-0.8)).toBeGreaterThan(110);
    // the tail is untouched
    const tail = strip({ hook: 0.8 }).sample(0);
    expect(Math.hypot(tail.x, tail.y)).toBeCloseTo(100, 6);
  });

  it('reveal draws the swoosh on from the tail: same tail, shorter reach', () => {
    const full = strip();
    const half = strip({
      reveal: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
    });
    expect(half.sample(0).x).toBeCloseTo(full.sample(0).x, 6);
    expect(half.sample(1).x).toBeCloseTo(full.sample(0.5).x, 6);
    expect(
      crescentStrip(
        P({
          reveal: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        }),
        O,
      ),
    ).toBeNull();
  });

  it('thickness over life and width scale multiply the half-width', () => {
    expect(strip().sample(0.5).hw).toBeCloseTo(10, 6);
    expect(strip({}, { widthScale: 0.5 }).sample(0.5).hw).toBeCloseTo(5, 6);
    const thin = [
      { x: 0, y: 0.25 },
      { x: 1, y: 0.25 },
    ];
    expect(strip({ thicknessOverLife: thin }).sample(0.5).hw).toBeCloseTo(2.5, 6);
  });

  it('wobble changes the width but is deterministic per seed', () => {
    const a = strip({ wobble: 0.5 }).sample(0.4).hw;
    expect(strip({ wobble: 0.5 }).sample(0.4).hw).toBe(a);
    expect(a).not.toBeCloseTo(strip().sample(0.4).hw, 3);
  });
});

describe('strip outline', () => {
  it('tips are sharp points; the full band spans the thickness', () => {
    const s = strip();
    const vs = stripRange(0, 1);
    const pts = stripOutline(s.sample, vs, 1, 0);
    const n = vs.length;
    // outer and inner edge meet at both tips
    const o0 = [pts[0], pts[1]];
    const i0 = [pts[(2 * n - 1) * 2], pts[(2 * n - 1) * 2 + 1]];
    expect(Math.hypot(o0[0] - i0[0], o0[1] - i0[1])).toBeLessThan(1e-9);
    const mid = Math.floor(n / 2);
    const om = [pts[mid * 2], pts[mid * 2 + 1]];
    const im = [pts[(2 * n - 1 - mid) * 2], pts[(2 * n - 1 - mid) * 2 + 1]];
    expect(Math.hypot(om[0] - im[0], om[1] - im[1])).toBeCloseTo(20, 1);
  });

  it('hot edge shifts inner bands toward the outer edge', () => {
    const s = strip();
    const vs = [0.5];
    const centred = stripOutline(s.sample, vs, 0.5, 0);
    const outer = stripOutline(s.sample, vs, 0.5, 1);
    // y of the band's outer edge at the top: more negative = further out
    expect(outer[1]).toBeLessThan(centred[1]);
    // a full band (f = 1) ignores the hot edge
    expect(stripOutline(s.sample, vs, 1, 1)[1]).toBeCloseTo(stripOutline(s.sample, vs, 1, 0)[1], 9);
  });
});
