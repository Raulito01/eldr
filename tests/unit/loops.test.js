import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { loopedNoise, loopRate, setLoopPeriod } from '../../src/core/loopContext.js';
import { createNoise } from '../../src/core/noise.js';
import { COMPOSED_PRESETS } from '../../src/effects/composedPresets.js';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { layerAt, loopKeyTime } from '../../src/effects/layerAnimation.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer } from '../../src/render/renderer.js';

const r = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
});
/** mean absolute pixel difference */
const diff = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.data.length; i++) d += Math.abs(a.data[i] - b.data[i]);
  return d / a.data.length;
};

describe('seamless loops (D-071)', () => {
  it('looped noise comes back to its start; one-shots are untouched', () => {
    const n = createNoise(5);
    const f = (z) => n.noise2D(0.3, z);
    setLoopPeriod(2);
    expect(loopedNoise(f, 3, 0.99999)).toBeCloseTo(loopedNoise(f, 3, 0), 3);
    setLoopPeriod(0);
    expect(loopedNoise(f, 3, 0.5)).toBe(f(1.5));
  });

  it('spins and pulses round to whole cycles per loop (never to a stop)', () => {
    setLoopPeriod(2);
    expect(loopRate(0.6)).toBe(0.5);
    expect(loopRate(-0.1)).toBe(-0.5);
    expect(loopRate(1.3)).toBe(1.5);
    setLoopPeriod(0);
    expect(loopRate(0.6)).toBe(0.6);
  });

  it('Loop keys: cycle and ping-pong after the last key (AE loopOut)', () => {
    const keys = {
      x: [
        { t: 0, v: 0 },
        { t: 1, v: 10 },
      ],
    };
    expect(loopKeyTime('off', keys, 1.25)).toBe(1.25);
    expect(loopKeyTime('cycle', keys, 1.25)).toBeCloseTo(0.25);
    expect(loopKeyTime('pingpong', keys, 1.25)).toBeCloseTo(0.75);
    expect(loopKeyTime('pingpong', keys, 2.25)).toBeCloseTo(0.25);
    const l = {
      id: 'a',
      type: 'null',
      params: {},
      keyLoop: 'cycle',
      transform: { x: 0, y: 0, anchorX: 0, anchorY: 0, scaleX: 100, scaleY: 100, rotation: 0 },
      opacity: 1,
      time: { offset: 0, stretch: 1, in: 0, out: null },
      keys: {
        'transform.x': [
          { t: 0, v: 0, ease: 'linear' },
          { t: 1, v: 100, ease: 'linear' },
        ],
      },
    };
    expect(layerAt(l, 1.5).transform.x).toBeCloseTo(50);
  });

  it.each(COMPOSED_PRESETS.filter((p) => p.build().timing.loop).map((p) => p.id))(
    '%s: no pop at the seam (last → first is like any other step)',
    (id) => {
      const p = COMPOSED_PRESETS.find((x) => x.id === id);
      const s = p.build();
      const { effect, scale } = buildExplosion(s);
      const n = s.timing.frameCount;
      const size = { width: 96, height: 96, scale: scale * 0.1875 };
      const frames = Array.from({ length: n }, (_, f) =>
        r.renderFrameImageData(effect, 1, f, size),
      );
      let inside = 0;
      for (let f = 0; f + 1 < n; f++) inside = Math.max(inside, diff(frames[f], frames[f + 1]));
      const seam = diff(frames[n - 1], frames[0]);
      expect(seam, `${p.id} seam ${seam.toFixed(3)} vs ${inside.toFixed(3)}`).toBeLessThan(
        inside * 1.5 + 0.05,
      );
    },
    30000,
  );
});
