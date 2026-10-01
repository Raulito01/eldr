import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { checkDeterminism } from '../../src/render/determinism.js';
import { createRenderer } from '../../src/render/renderer.js';
import { getDefaults } from '../../src/schema/index.js';
import { fieldBounds, heatToRampPos, readFieldParams } from '../../src/shapes/field.js';

const backend = createCanvas2DBackend((w, h) => createCanvas(w, h));
const deps = { backend, layerTypes: LAYER_TYPES };
const renderer = createRenderer(deps);
const timing = { frameCount: 12, fps: 24, loop: false };
const defaults = getDefaults(LAYER_TYPES.fieldFire.schema);
const effect = (extra = {}) => ({
  id: 'f',
  timing,
  layers: [{ id: 'f', type: 'fieldFire', params: { ...defaults, ...extra } }],
});
const SIZE = 160;
const settings = { width: SIZE, height: SIZE, scale: 0.4, pivot: { x: 0.5, y: 0.85 } };

describe('field fire', () => {
  it('maps heat onto the ramp: hot → start, cold → end, shifted by ramp-over-life', () => {
    expect(heatToRampPos(1, 0)).toBe(0);
    expect(heatToRampPos(0, 0)).toBe(1);
    expect(heatToRampPos(-3, 0)).toBe(1);
    expect(heatToRampPos(1, 0.5)).toBe(0.5);
  });

  it('draws something, and only inside its bounds', () => {
    const img = renderer.renderFrameImageData(effect(), 3, 5, settings);
    const [x0, y0, x1, y1] = fieldBounds(readFieldParams(defaults));
    const px = (v, axis) => settings.pivot[axis] * SIZE + v * settings.scale;
    let inside = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (img.data[(y * SIZE + x) * 4 + 3] === 0) continue;
        inside++;
        expect(x).toBeGreaterThanOrEqual(Math.floor(px(x0, 'x')));
        expect(x).toBeLessThanOrEqual(Math.ceil(px(x1, 'x')));
        expect(y).toBeGreaterThanOrEqual(Math.floor(px(y0, 'y')));
        expect(y).toBeLessThanOrEqual(Math.ceil(px(y1, 'y')));
      }
    }
    expect(inside).toBeGreaterThan(300);
  });

  it('regression: no faint phantom lines where the field drops off steeply (above the tip)', () => {
    // Before the fix, cells with every corner outside still got partial coverage → faint lines
    // floating in empty space. A real anti-aliased rim pixel always touches a solid pixel.
    const W = 384;
    const big = { width: W, height: W, scale: 0.75, pivot: { x: 0.5, y: 0.88 } };
    for (const f of [3, 6]) {
      const d = renderer.renderFrameImageData(effect(), 482913, f, big).data;
      const a = (x, y) => (x < 0 || y < 0 || x >= W || y >= W ? 0 : d[(y * W + x) * 4 + 3]);
      let isolated = 0;
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const v = a(x, y);
          if (v === 0 || v > 128) continue;
          let touchesSolid = false;
          for (let j = -2; j <= 2 && !touchesSolid; j++)
            for (let i = -2; i <= 2; i++) if (a(x + i, y + j) > 128) touchesSolid = true;
          if (!touchesSolid) isolated++;
        }
      }
      expect(isolated, `frame ${f}`).toBeLessThan(20);
    }
  });

  it('with bands, fully covered pixels use only the band colours', () => {
    const img = renderer.renderFrameImageData(effect({ 'style.bands': 3 }), 7, 4, settings);
    const colours = new Map();
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] !== 255) continue;
      const k = `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
      colours.set(k, (colours.get(k) ?? 0) + 1);
    }
    // 3 flat band colours dominate; any others are 1-px anti-aliased band edges.
    const top3 = [...colours.values()].sort((a, b) => b - a).slice(0, 3);
    const total = [...colours.values()].reduce((s, n) => s + n, 0);
    expect(top3.reduce((s, n) => s + n, 0) / total).toBeGreaterThan(0.75);
  });

  it('ball form and flame form both render deterministically, frame by frame', () => {
    for (const form of ['flame', 'ball']) {
      const r = checkDeterminism(deps, effect({ 'field.form': form }), 11, {
        width: 96,
        height: 96,
        scale: 0.25,
      });
      expect(r.ok, form).toBe(true);
      expect(new Set(r.hashes).size, form).toBeGreaterThan(8);
    }
  });
});
