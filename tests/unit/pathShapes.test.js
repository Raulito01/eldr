import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { flattenPath, motionPath, pathSources, pointOnPath } from '../../src/effects/followPath.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { compose, oneShot } from '../../src/effects/presetKit.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { createCanvas2DBackend, createRenderer } from '../../src/render/index.js';
import { makeMask } from '../../src/render/masks.js';

const total = (m) => {
  const f = flattenPath(m);
  return f.len[f.len.length - 1];
};

describe('ellipses and rectangles as paths (D-111)', () => {
  it('an ellipse path has the ellipse’s length and comes back to its start', () => {
    const m = makeMask('m1', { shape: 'ellipse', w: 200, h: 100 });
    const a = 100;
    const b = 50;
    const ram = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    expect(Math.abs(total(m) - ram) / ram).toBeLessThan(0.01);
    const p0 = pointOnPath(m, 0);
    const p1 = pointOnPath(m, 1);
    expect(Math.hypot(p0.x - p1.x, p0.y - p1.y)).toBeLessThan(1e-6);
    expect(p0.y).toBeCloseTo(-50, 6); // starts at the top
    expect(pointOnPath(m, 0.25).x).toBeGreaterThan(90); // clockwise: right side next
  });

  it('a rectangle path runs round its corners', () => {
    const m = makeMask('m1', { shape: 'rect', w: 200, h: 100 });
    expect(total(m)).toBeCloseTo(600, 6);
    const c = pointOnPath(m, 200 / 600);
    expect(c.x).toBeCloseTo(100, 6);
    expect(c.y).toBeCloseTo(-50, 6);
  });

  it('the layer’s motion path is a Path-only shape, never a normal mask', () => {
    const cut = makeMask('m1', { shape: 'ellipse' });
    const only = makeMask('m2', { shape: 'rect', pathOnly: true });
    expect(motionPath([cut])).toBe(null);
    expect(motionPath([cut, only])?.id).toBe('m2');
  });

  it('Follow Path lists ellipses on Path layers and Path-only shapes, not normal masks', () => {
    const layers = /** @type {any} */ ([
      { id: 'g', type: 'guide', masks: [makeMask('a', { shape: 'ellipse' })] },
      { id: 'b', type: 'blob', masks: [makeMask('c', { shape: 'rect' })] },
      { id: 'd', type: 'blob', masks: [makeMask('e', { shape: 'rect', pathOnly: true })] },
    ]);
    expect(pathSources(layers).map((s) => s.mask.id)).toEqual(['a', 'e']);
  });

  it('a Path-only shape never cuts its layer; a normal mask does; the setting is saved', () => {
    const r = createRenderer({
      backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
      layerTypes: LAYER_TYPES,
    });
    const coverage = (pathOnly) => {
      const c = compose({ timing: oneShot(4) });
      const id = c.add('blob', 'B', { params: { 'blob.radius': 80 } });
      c.set(id, { masks: [makeMask('m1', { shape: 'ellipse', w: 30, h: 30, pathOnly })] });
      let st = c.done();
      st = parseExplosion(serializeExplosion(st, { name: 't', seed: 1 })).state;
      expect(st.layers[0].masks[0].pathOnly === true).toBe(pathOnly);
      const { effect, scale } = buildExplosion(st);
      const img = r.renderFrameImageData(effect, 1, 1, { width: 256, height: 256, scale });
      let n = 0;
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) n++;
      return n;
    };
    expect(coverage(true)).toBeGreaterThan(coverage(false) * 4);
  });
});
