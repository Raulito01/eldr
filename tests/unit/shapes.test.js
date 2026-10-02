import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer } from '../../src/render/renderer.js';
import { getDefaults } from '../../src/schema/index.js';
import { debrisPoints } from '../../src/shapes/debris.js';
import { puffParts, readPuffParams } from '../../src/shapes/puff.js';
import { readRingParams, ringArcs } from '../../src/shapes/ring.js';
import { streakPoints } from '../../src/shapes/streak.js';

describe('puff', () => {
  const p = readPuffParams(getDefaults(LAYER_TYPES.puff.schema));

  it('has one part per bump; same seed → same puff; different seed → different puff', () => {
    const a = puffParts(p, 7, 0.3);
    expect(a).toHaveLength(p.count);
    expect(puffParts(p, 7, 0.3)).toEqual(a);
    expect(puffParts(p, 8, 0.3)).not.toEqual(a);
  });

  it('central bump is the largest, and the puff stays within ~1.3× its radius', () => {
    const parts = puffParts({ ...p, count: 12 }, 3, 0);
    const centre = parts.find((q) => q.x === 0 && q.y === 0);
    for (const q of parts) {
      expect(q.r).toBeLessThanOrEqual(centre.r + 1e-9);
      expect(Math.hypot(q.x, q.y) + q.r).toBeLessThan(p.radius * 1.3);
    }
  });
});

describe('streak', () => {
  it('spans its length, is symmetric about its axis, and widest at the origin', () => {
    const pts = streakPoints({ length: 100, thickness: 10, taper: 0.7 });
    const xs = [];
    const ys = [];
    for (let i = 0; i < pts.length; i += 2) {
      xs.push(pts[i]);
      ys.push(pts[i + 1]);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 9);
    expect(Math.max(...ys)).toBeCloseTo(-Math.min(...ys), 9);
    expect(Math.max(...ys)).toBeLessThanOrEqual(5 + 1e-9);
  });

  it('taper moves the widest point toward the head (+x)', () => {
    const tip = (taper) =>
      Math.max(
        ...streakPoints({ length: 100, thickness: 10, taper }).filter((_, i) => i % 2 === 0),
      );
    expect(tip(0.9)).toBeLessThan(tip(0.1)); // head extends less in front of the widest point
  });
});

describe('ring', () => {
  const base = readRingParams(getDefaults(LAYER_TYPES.ring.schema));
  it('closed by default; N breaks → N arcs that never overlap', () => {
    expect(ringArcs(base, 1)).toEqual([{ a0: 0, a1: Math.PI * 2, full: true }]);
    const arcs = ringArcs({ ...base, breaks: 5, gap: 0.3 }, 1);
    expect(arcs).toHaveLength(5);
    const total = arcs.reduce((s, a) => s + (a.a1 - a.a0), 0);
    expect(total).toBeLessThan(Math.PI * 2);
    expect(total).toBeGreaterThan(Math.PI);
  });
});

describe('debris', () => {
  it('has the requested corners within its size; seeded', () => {
    const pts = debrisPoints({ size: 10, vertices: 6, irregularity: 0.8 }, 4);
    expect(pts.length).toBe(12);
    for (let i = 0; i < pts.length; i += 2)
      expect(Math.hypot(pts[i], pts[i + 1])).toBeLessThanOrEqual(10 + 1e-9);
    expect(debrisPoints({ size: 10, vertices: 6, irregularity: 0.8 }, 4)).toEqual(pts);
    expect(debrisPoints({ size: 10, vertices: 6, irregularity: 0.8 }, 5)).not.toEqual(pts);
  });
});

describe('every shape layer renders something, with all style features on', () => {
  const r = createRenderer({
    backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
    layerTypes: LAYER_TYPES,
  });
  // The Null layer (3.6b) is invisible by design; adjustment layers (3.8b) only recolour.
  it.each(
    Object.keys(LAYER_TYPES).filter(
      (t) => t !== 'null' && !LAYER_TYPES[t].adjustment && !LAYER_TYPES[t].precomp,
    ),
  )('%s', (type) => {
    const params = {
      ...getDefaults(LAYER_TYPES[type].schema),
      'single.scaleOverLife': [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
      'style.bands': 3,
      'shade.shadow': 0.3,
      'shade.highlight': 0.2,
      'outline.mode': 'both',
    };
    const img = r.renderFrameImageData(
      {
        id: 'x',
        timing: { frameCount: 3, fps: 24, loop: false },
        layers: [{ id: 'x', type, params }],
      },
      1,
      1,
      { width: 256, height: 256 },
    );
    let visible = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) visible++;
    expect(visible).toBeGreaterThan(100);
  });
});

describe('null layer (3.6b)', () => {
  it('renders nothing and has no parameters', () => {
    const r = createRenderer({
      backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
      layerTypes: LAYER_TYPES,
    });
    const img = r.renderFrameImageData(
      {
        id: 'n',
        timing: { frameCount: 1, fps: 24, loop: false },
        layers: [{ id: 'n', type: 'null' }],
      },
      1,
      0,
      { width: 16, height: 16 },
    );
    expect(img.data.every((v) => v === 0)).toBe(true);
    expect(LAYER_TYPES.null.schema.length).toBe(0);
  });
});
