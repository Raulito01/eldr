import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createGlowPass, readGlow } from '../../src/render/glow.js';
import { createRenderer } from '../../src/render/renderer.js';
import { getDefaults } from '../../src/schema/index.js';

const backend = createCanvas2DBackend((w, h) => createCanvas(w, h));
const renderer = createRenderer({ backend, layerTypes: LAYER_TYPES });
const timing = { frameCount: 24, fps: 24, loop: false };
const blob = (extra) => ({
  id: 'g',
  timing,
  layers: [
    {
      id: 'b',
      type: 'blob',
      params: {
        ...getDefaults(LAYER_TYPES.blob.schema),
        'blob.radius': 20,
        'blob.noise': 0,
        'single.scaleOverLife': [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
        'single.opacityOverLife': [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
        ...extra,
      },
    },
  ],
});
const settings = { width: 128, height: 128 };
/** Pixel 16 px outside the blob's edge (centre 64, radius 20). */
const outside = (img) => {
  const i = (64 * 128 + 64 + 36) * 4;
  return [...img.data.slice(i, i + 4)];
};

describe('glow', () => {
  it('reads as off at amount 0, converts the tint alpha to 0–1', () => {
    expect(readGlow({ 'glow.amount': 0 })).toBeNull();
    expect(readGlow({})).toBeNull();
    const g = readGlow({
      'glow.amount': 1,
      'glow.radius': 10,
      'glow.core': 0.5,
      'glow.tint': '#ff000080',
    });
    expect(g?.tint).toEqual({ r: 255, g: 0, b: 0, a: 128 / 255 });
  });

  it('adds light outside the shape; no glow leaves it empty', () => {
    const off = renderer.renderFrameImageData(blob({}), 1, 5, settings);
    expect(outside(off)[3]).toBe(0);
    const on = renderer.renderFrameImageData(
      blob({ 'glow.amount': 1, 'glow.radius': 24 }),
      1,
      5,
      settings,
    );
    expect(outside(on)[3]).toBeGreaterThan(10);
  });

  it('more amount = brighter glow; tint colours it', () => {
    const a = outside(
      renderer.renderFrameImageData(
        blob({ 'glow.amount': 0.5, 'glow.radius': 24 }),
        1,
        5,
        settings,
      ),
    );
    const b = outside(
      renderer.renderFrameImageData(blob({ 'glow.amount': 2, 'glow.radius': 24 }), 1, 5, settings),
    );
    expect(b[3]).toBeGreaterThan(a[3]);
    const red = outside(
      renderer.renderFrameImageData(
        blob({ 'glow.amount': 1, 'glow.radius': 24, 'glow.tint': '#ff0000ff' }),
        1,
        5,
        settings,
      ),
    );
    expect(red[0]).toBeGreaterThan(200);
    expect(red[1]).toBeLessThan(40);
  });

  it('fallback blur (no ctx.filter) also spreads light and is deterministic', () => {
    const src = createCanvas(64, 64);
    const s = src.getContext('2d');
    s.fillStyle = '#ffffff';
    s.fillRect(28, 28, 8, 8);
    const run = () => {
      const pass = createGlowPass(backend, { forceFallback: true });
      const out = createCanvas(64, 64);
      const o = out.getContext('2d');
      pass.apply(o, src, readGlow({ 'glow.amount': 1, 'glow.radius': 12, 'glow.core': 0 }), {
        scale: 1,
        width: 64,
        height: 64,
      });
      expect(pass.usesFilter()).toBe(false);
      return o.getImageData(0, 0, 64, 64).data;
    };
    const a = run();
    expect(a[(32 * 64 + 16) * 4 + 3]).toBeGreaterThan(0); // 12 px left of the square's edge
    expect([...run()]).toEqual([...a]);
  });
});
