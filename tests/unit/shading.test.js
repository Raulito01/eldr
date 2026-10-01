import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer } from '../../src/render/renderer.js';
import { lightVector } from '../../src/render/shading.js';
import { getDefaults } from '../../src/schema/index.js';

describe('lightVector', () => {
  it('0° = light from above, 90° = from the right (screen y points down)', () => {
    const up = lightVector(0, 0);
    expect(up.x).toBeCloseTo(0, 12);
    expect(up.y).toBeCloseTo(-1, 12);
    const right = lightVector(90, 0);
    expect(right.x).toBeCloseTo(1, 12);
    expect(right.y).toBeCloseTo(0, 12);
  });

  it('stays fixed in the world when the element rotates', () => {
    // Element rotated 90° clockwise: world "up" is local "−x".
    const v = lightVector(0, Math.PI / 2);
    expect(v.x).toBeCloseTo(-1, 12);
    expect(v.y).toBeCloseTo(0, 12);
  });
});

describe('toon shading on real pixels', () => {
  const r = createRenderer({
    backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
    layerTypes: LAYER_TYPES,
  });
  const base = getDefaults(LAYER_TYPES.blob.schema);
  const ramp = [
    { pos: 0, color: '#ffffff' },
    { pos: 0.5, color: '#ff0000' },
    { pos: 1, color: '#000000' },
  ];
  const render = (over) =>
    r.renderFrameImageData(
      {
        id: 's',
        timing: { frameCount: 1, fps: 24, loop: false },
        layers: [
          {
            id: 's',
            type: 'blob',
            params: {
              ...base,
              'blob.radius': 40,
              'blob.noise': 0,
              'single.scaleOverLife': [
                { x: 0, y: 1 },
                { x: 1, y: 1 },
              ],
              'style.ramp': ramp,
              'style.spread': 0,
              'style.bands': 1,
              'shade.light': 270, // light from the left
              'shade.shadow': 0.5,
              'shade.shadowOffset': 0.3,
              'shade.highlight': 0,
              ...over,
            },
          },
        ],
      },
      1,
      0,
      { width: 128, height: 128 },
    );
  const px = (img, x, y) => [...img.data.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 4)];

  it('shadow crescent appears on the side away from the light, lit side keeps its colour', () => {
    const img = render({});
    expect(px(img, 64 - 30, 64)).toEqual([255, 255, 255, 255]); // lit (left)
    expect(px(img, 64 + 34, 64)).toEqual([255, 0, 0, 255]); // shadow (right) = ramp shifted +0.5
    expect(px(img, 64, 64)).toEqual([255, 255, 255, 255]); // centre still lit
  });

  it('nothing is painted outside the silhouette (shading is clipped)', () => {
    const img = render({ 'shade.shadowOffset': 0.6 });
    expect(px(img, 64 + 44, 64)[3]).toBe(0);
    expect(px(img, 64 - 44, 64)[3]).toBe(0);
  });

  it('highlight sits toward the light in a hotter colour', () => {
    const img = render({
      'style.rampOverLife': [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
      'shade.shadow': 0,
      'shade.highlight': 0.5,
      'shade.highlightSize': 0.3,
      'shade.highlightOffset': 0.5,
    });
    expect(px(img, 64 - 20, 64)).toEqual([255, 255, 255, 255]); // highlight (left, toward light)
    expect(px(img, 64 + 20, 64)).toEqual([255, 0, 0, 255]); // body colour
  });

  it('shadow 0 and highlight 0 = identical to no shading', () => {
    const a = render({ 'shade.shadow': 0 });
    const b = render({ 'shade.shadow': 0, 'shade.light': 90, 'shade.shadowOffset': 0.5 });
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });
});

describe('shadow never cuts the core (regression: core was shifted and clipped)', () => {
  const r = createRenderer({
    backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
    layerTypes: LAYER_TYPES,
  });
  const base = getDefaults(LAYER_TYPES.blob.schema);
  const ramp = [
    { pos: 0, color: '#ffffff' },
    { pos: 0.5, color: '#ff0000' },
    { pos: 1, color: '#000000' },
  ];
  const render = (over) =>
    r.renderFrameImageData(
      {
        id: 'c',
        timing: { frameCount: 1, fps: 24, loop: false },
        layers: [
          {
            id: 'c',
            type: 'blob',
            params: {
              ...base,
              'blob.radius': 40,
              'blob.noise': 0,
              'single.scaleOverLife': [
                { x: 0, y: 1 },
                { x: 1, y: 1 },
              ],
              'style.ramp': ramp,
              'style.spread': 0.5,
              'style.bands': 2,
              'style.bandNoise': 0,
              ...over,
            },
          },
        ],
      },
      1,
      0,
      { width: 128, height: 128 },
    );

  it('inner bands are identical with and without a strong shadow', () => {
    const plain = render({ 'shade.shadow': 0 });
    const shaded = render({ 'shade.shadow': 0.5, 'shade.shadowOffset': 0.6, 'shade.light': 270 });
    // The inner band (radius 20 around the centre) must not move or be cut.
    for (let y = 64 - 15; y <= 64 + 15; y += 3) {
      for (let x = 64 - 15; x <= 64 + 15; x += 3) {
        if ((x - 64) ** 2 + (y - 64) ** 2 > 15 * 15) continue;
        const i = (y * 128 + x) * 4;
        expect([...shaded.data.slice(i, i + 4)]).toEqual([...plain.data.slice(i, i + 4)]);
      }
    }
  });

  it('smooth mode: the gradient centre stays on the element', () => {
    const plain = render({ 'style.bands': 0, 'shade.shadow': 0 });
    const shaded = render({
      'style.bands': 0,
      'shade.shadow': 0.5,
      'shade.shadowOffset': 0.3,
      'shade.light': 270,
    });
    const i = (64 * 128 + 64) * 4;
    expect([...shaded.data.slice(i, i + 4)]).toEqual([...plain.data.slice(i, i + 4)]);
  });
});
