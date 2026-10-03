import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import {
  copyLayersClip,
  importPresetAsPrecomp,
  pasteLayers,
} from '../../src/effects/importPreset.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer, precompTime } from '../../src/render/renderer.js';

const r = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
});
const W = 96;
const px = (state, frame) => {
  const { effect, scale } = buildExplosion(state);
  return r.renderFrameImageData(effect, 11, frame, {
    width: W,
    height: W,
    scale: (scale * W) / 512,
  }).data;
};
const diff = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
};
/** only the imported precomp shows */
const alone = (s, id) => ({ ...s, layers: s.layers.map((l) => ({ ...l, enabled: l.id === id })) });

describe('import a preset as a precomp (D-119)', () => {
  it('keeps its own look and clock: a loop inside a one-shot of another length', () => {
    const host = createExplosionFromPreset('smallHit'); // 20 frames at 30 fps
    const src = createExplosionFromPreset('blackHole'); // loop, 48 frames at 24 fps
    const { state, id } = importPresetAsPrecomp(host, src, { name: 'Black Hole' });
    const s = alone(state, id);
    // same moment in seconds: host frame 15 (0.5 s at 30 fps) = source frame 12 (24 fps)
    expect(diff(px(s, 15), px(src, 12))).toBeLessThanOrEqual(3);
    expect(diff(px(s, 0), px(src, 0))).toBeLessThanOrEqual(3);
  });

  it('keeps its impact, flash and wind-up (an explosion inside a loop)', () => {
    const host = createExplosionFromPreset('blackHole'); // impact 0, no flash
    const src = createExplosionFromPreset('bigBoom'); // wind-up + 2-frame flash, size 1.1
    const sized = importPresetAsPrecomp(host, src, { name: 'Big Boom' });
    const pre = sized.state.layers.find((l) => l.id === sized.id);
    expect(pre.transform.scaleX).toBeCloseTo(110, 6); // its own size
    // (glow radii are in screen px and don't follow a layer's scale: compare at equal size)
    host.globals['explosion.size'] = src.globals['explosion.size'];
    const { state, id } = importPresetAsPrecomp(host, src, { name: 'Big Boom' });
    const s = { ...alone(state, id), timing: { ...state.timing, fps: 30 } };
    // frame 6 at 30 fps = the wind-up; frame 10 = the flash
    for (const f of [6, 10, 20])
      expect(diff(px(s, f), px(src, f)), `frame ${f}`).toBeLessThanOrEqual(3);
  });

  it('keepOwn off: it adapts to the host (no own clock, no scale)', () => {
    const host = createExplosionFromPreset('smallHit');
    const src = createExplosionFromPreset('bigBoom');
    const { state, id, compId } = importPresetAsPrecomp(host, src, {
      name: 'Boom',
      keepOwn: false,
    });
    expect(state.comps[compId].timing).toBeUndefined();
    expect(state.layers.find((l) => l.id === id).transform.scaleX).toBe(100);
  });

  it('nested precomps come along with new ids; the host is untouched; files keep it', () => {
    const host = createExplosionFromPreset('smallHit');
    const a = importPresetAsPrecomp(host, createExplosionFromPreset('voidMotes'), { name: 'A' });
    // a preset that itself has a precomp (comp1) imported into a host that also has comp1
    const b = importPresetAsPrecomp(a.state, a.state, { name: 'Again' });
    expect(Object.keys(b.state.comps).sort()).toEqual(['comp1', 'comp2', 'comp3']);
    const outer = b.state.comps[b.compId];
    const inner = outer.layers.find((l) => l.type === 'precomp');
    expect(inner.comp).not.toBe('comp1');
    expect(b.state.comps[inner.comp].layers.length).toBe(a.state.comps.comp1.layers.length);
    expect(host.comps).toBeUndefined();
    const file = JSON.parse(JSON.stringify(serializeExplosion(b.state, { seed: 1 })));
    const back = parseExplosion(file);
    expect(back.warnings).toEqual([]);
    expect(back.state.comps[b.compId].timing).toEqual(b.state.comps[b.compId].timing);
    expect(back.state.comps[b.compId].globals).toEqual(b.state.comps[b.compId].globals);
  });
});

describe('copy / paste layers (D-119)', () => {
  it('pastes into another creation with new ids and the links inside the set', () => {
    const src = createExplosionFromPreset('smallHit');
    // core is parented to hitParent: copy both, plus the star
    const clip = copyLayersClip(src, ['core', 'hitParent', 'star']);
    expect(clip.layers.map((l) => l.id)).toEqual(['core', 'hitParent', 'star']);
    const host = createExplosionFromPreset('bigBoom'); // also has core
    const { state, ids } = pasteLayers(host, clip, 'smoke');
    expect(ids).toEqual(['core-2', 'hitParent', 'star']);
    const core = state.layers.find((l) => l.id === 'core-2');
    expect(core.parent).toBe('hitParent');
    expect(core.label).toBe('Hot core 2');
    // inserted above smoke, in their order; nothing in the host changed
    const order = state.layers.map((l) => l.id);
    expect(order.indexOf('core-2')).toBe(order.indexOf('smoke') + 1);
    expect(state.layers.find((l) => l.id === 'core').parent).toBe('boomParent');
  });

  it('links outside the copied set are let go; the layer keeps its place on screen', () => {
    const src = createExplosionFromPreset('smallHit');
    const clip = copyLayersClip(src, ['core']);
    expect(clip.layers[0].parent).toBeNull();
    // a layer pasted into a creation with the same clock looks the same
    const ring = copyLayersClip(src, ['shockwave']);
    const a = pasteLayers({ ...src, layers: [] }, ring).state;
    const only = {
      ...src,
      layers: src.layers.map((l) => ({ ...l, enabled: l.id === 'shockwave' })),
    };
    expect(diff(px(a, 6), px(only, 6))).toBeLessThanOrEqual(3);
  });

  it('copied precomps come along', () => {
    const host0 = createExplosionFromPreset('smallHit');
    const a = importPresetAsPrecomp(host0, createExplosionFromPreset('voidMotes'), { name: 'M' });
    const clip = copyLayersClip(a.state, [a.id]);
    expect(Object.keys(clip.comps)).toEqual(['comp1']);
    const b = pasteLayers(a.state, clip);
    const pasted = b.state.layers.find((l) => l.id === b.ids[0]);
    expect(pasted.comp).toBe('comp2');
    expect(b.state.comps.comp2.timing).toEqual(a.state.comps.comp1.timing);
  });
});

describe('precomp loop and scale (D-121)', () => {
  const ft = (seconds) => ({ seconds, t: 0, frame: 0, drawFrame: 0 });
  const oneShot = { frameCount: 20, fps: 30, loop: false, holdMode: 'ones', duration: 0.5 };
  const loop2s = { frameCount: 48, fps: 24, loop: true, holdMode: 'ones' };

  it('repeat, ping-pong, start at and every', () => {
    const at = (params, s, host = oneShot) => precompTime(params, ft(s), oneShot, host).seconds;
    expect(at({}, 1.3)).toBeCloseTo(1.3, 9); // off: plays once
    expect(at({ 'precomp.loop': 'repeat' }, 1.3)).toBeCloseTo(0.3, 9); // its own 0.5 s
    expect(at({ 'precomp.loop': 'repeat', 'precomp.every': 0.8 }, 1.3)).toBeCloseTo(0.5, 9);
    expect(at({ 'precomp.loop': 'pingpong' }, 0.7)).toBeCloseTo(0.3, 9);
    expect(at({ 'precomp.loop': 'repeat', 'precomp.offset': 0.2 }, 0.4)).toBeCloseTo(0.1, 9);
  });

  it('fit to the loop: whole repeats per loop, so the seam does not pop', () => {
    const p = { 'precomp.loop': 'repeat', 'precomp.every': 0.7, 'precomp.fit': true };
    // a 2 s loop: 0.7 s rounds to 2/3 s (3 repeats)
    const at = (s) => precompTime(p, ft(s), oneShot, loop2s).seconds;
    expect(at(2 / 3 + 0.1)).toBeCloseTo(0.1, 9);
    expect(at(1.999999)).toBeCloseTo(2 / 3, 4); // just before the seam = the end of a repeat
    expect(at(0)).toBe(0);
  });

  it('a precomp at 50 % looks like the effect at half size (glows and outlines follow)', () => {
    const src = createExplosionFromPreset('smallHit');
    const host = { ...src, layers: [] };
    const r = importPresetAsPrecomp(host, src, { name: 'Hit' });
    const half = {
      ...r.state,
      layers: r.state.layers.map((l) => ({
        ...l,
        transform: { ...l.transform, scaleX: 50, scaleY: 50 },
      })),
    };
    const small = {
      ...src,
      globals: { ...src.globals, 'explosion.size': src.globals['explosion.size'] * 0.5 },
    };
    for (const f of [3, 6, 10])
      expect(diff(px(half, f), px(small, f)), `frame ${f}`).toBeLessThanOrEqual(6);
  });
});
