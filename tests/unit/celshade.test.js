import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import {
  bandOutline,
  bandPositions,
  bandScales,
  nearestStopColor,
} from '../../src/render/celshade.js';
import { createRenderer } from '../../src/render/renderer.js';
import { getDefaults } from '../../src/schema/index.js';

const ramp = [
  { pos: 0, color: '#ffffff' },
  { pos: 0.5, color: '#ff0000' },
  { pos: 1, color: '#0000ff' },
];

describe('band maths', () => {
  it('band positions run from the edge (outer) to the core (inner)', () => {
    expect(bandPositions(3, 0.2, 0.6)).toEqual([0.6, 0.4, 0.2]);
    expect(bandPositions(1, 0.2, 0.6)).toEqual([0.2]);
  });

  it('band sizes shrink evenly from the full outline', () => {
    expect(bandScales(4)).toEqual([1, 0.75, 0.5, 0.25]);
  });

  it('snap picks the nearest ramp stop colour', () => {
    expect(nearestStopColor(ramp, 0.3)).toEqual([255, 0, 0, 255]);
    expect(nearestStopColor(ramp, 0.2)).toEqual([255, 255, 255, 255]);
  });

  it('band outlines are scaled copies; edge noise wobbles them but stays inside the band', () => {
    const circle = new Float64Array(64 * 2);
    for (let i = 0; i < 64; i++) {
      circle[i * 2] = Math.cos((i / 64) * Math.PI * 2) * 100;
      circle[i * 2 + 1] = Math.sin((i / 64) * Math.PI * 2) * 100;
    }
    const plain = bandOutline(circle, 0.5, 0, 1, 0, 4);
    expect(Math.hypot(plain[0], plain[1])).toBeCloseTo(50, 9);
    const noisy = bandOutline(circle, 0.5, 1, 1, 0, 4);
    const radii = [];
    for (let i = 0; i < noisy.length; i += 2) radii.push(Math.hypot(noisy[i], noisy[i + 1]));
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(1); // it wobbles
    for (const r of radii) {
      expect(r).toBeGreaterThan(50 - 25 * 0.45 - 1e-9); // within ±45% of one band (25 px)
      expect(r).toBeLessThan(50 + 25 * 0.45 + 1e-9);
    }
  });
});

describe('cel bands on real pixels', () => {
  const r = createRenderer({
    backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
    layerTypes: LAYER_TYPES,
  });
  const base = getDefaults(LAYER_TYPES.blob.schema);
  const render = (over) =>
    r.renderFrameImageData(
      {
        id: 'b',
        timing: { frameCount: 1, fps: 24, loop: false },
        layers: [
          {
            id: 'b',
            type: 'blob',
            params: {
              ...base,
              'blob.radius': 50,
              'blob.noise': 0,
              'single.scaleOverLife': [
                { x: 0, y: 1 },
                { x: 1, y: 1 },
              ],
              'style.ramp': ramp,
              'style.spread': 1,
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
  /** Colours covering more than 3% of the opaque area (ignores anti-aliased edge pixels). */
  const mainColors = (img) => {
    const counts = new Map();
    let opaque = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 255) continue;
      opaque++;
      const key = `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts].filter(([, n]) => n > opaque * 0.03).map(([k]) => k);
  };

  it('N bands → exactly N flat colours (hard edges, no gradient)', () => {
    expect(mainColors(render({ 'style.bands': 3 })).length).toBe(3);
    expect(mainColors(render({ 'style.bands': 5 })).length).toBe(5);
  });

  it('bands 0 = smooth gradient (many colours)', () => {
    const img = render({ 'style.bands': 0 });
    const distinct = new Set();
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] === 255)
        distinct.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`);
    }
    expect(distinct.size).toBeGreaterThan(20);
  });

  it('snap → only exact ramp colours', () => {
    const colors = mainColors(render({ 'style.bands': 4, 'style.snapColors': true }));
    const rampColors = ['255,255,255', '255,0,0', '0,0,255'];
    for (const c of colors) expect(rampColors).toContain(c);
  });
});
