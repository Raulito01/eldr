// D-050 regression [Raul]: a longer timeline must not slow the animation down.
// Bug: with 200 frames the explosion was stretched over 200 frames (slow motion).
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { animationLength, frameAtTime, frameTime, tPerFrame } from '../../src/core/timing.js';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { createCanvas2DBackend, createRenderer } from '../../src/render/index.js';

const r = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
});
const pixels = (state, frame) => {
  const { effect, scale } = buildExplosion(state);
  return Buffer.from(
    r
      .renderFrame(effect, 7, frame, { width: 96, height: 96, scale: scale * 0.2 })
      .ctx.getImageData(0, 0, 96, 96).data,
  );
};

describe('animation length (D-050)', () => {
  it('more frames = more time after the animation, never slow motion (every preset)', () => {
    for (const id of ['cartoonPop', 'animeBlast', 'smallHit', 'bigBoom']) {
      const short = createExplosionFromPreset(id);
      const long = { ...short, timing: { ...short.timing, frameCount: 200 } };
      for (const f of [0, 3, 8, 13]) {
        expect(pixels(long, f).equals(pixels(short, f)), `${id} frame ${f}`).toBe(true);
      }
    }
  });

  it('changing fps samples the same animation in seconds', () => {
    const t30 = { frameCount: 42, fps: 30, loop: false, duration: 1.4 };
    const t60 = { ...t30, frameCount: 84, fps: 60 };
    expect(frameTime(t60, 30).t).toBeCloseTo(frameTime(t30, 15).t, 12);
    expect(frameTime(t30, 42 * 2).t).toBe(frameTime(t30, 41).t); // clamped to the last frame
    expect(frameTime({ ...t30, frameCount: 200 }, 84).t).toBeCloseTo(2, 12); // after the end
  });

  it('phase markers, frame steps and length follow seconds; legacy timings still stretch', () => {
    const t = { frameCount: 200, fps: 30, loop: false, duration: 1 };
    expect(frameAtTime(t, 0.5)).toBe(15);
    expect(tPerFrame(t)).toBeCloseTo(1 / 30, 12);
    expect(animationLength(t)).toBe(1);
    const legacy = { frameCount: 25, fps: 24, loop: false };
    expect(frameTime(legacy, 24).t).toBe(1);
    expect(animationLength(legacy)).toBe(1);
  });

  it('flash still covers exactly N frames on a long timeline', () => {
    const s = createExplosionFromPreset('animeBlast');
    s.globals['explosion.flashFrames'] = 3;
    s.timing = { ...s.timing, frameCount: 200 };
    const { effect } = buildExplosion(s);
    const flash = effect.layers.find((l) => l.id === 'flash');
    const on = [];
    for (let f = 0; f < 200; f++) {
      const { t } = frameTime(effect.timing, f);
      if (t >= flash.params['single.start'] && t <= flash.params['single.end']) on.push(f);
    }
    expect(on.length).toBe(3);
  });

  it('files saved before D-050 keep their look (length = their frames)', () => {
    const s = createExplosionFromPreset('smallHit');
    const file = JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 1 })));
    delete file.timing.duration;
    file.timing.frameCount = 60;
    const loaded = parseExplosion(file).state;
    expect(loaded.timing.duration).toBeCloseTo(59 / 30, 12);
  });
});
