import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExplosion, createExplosion } from '../../src/effects/explosion/explosion.js';
import { addLayer, updateLayer } from '../../src/effects/layerStack.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer } from '../../src/render/renderer.js';
import {
  naturalCompare,
  recoloured,
  sequenceFrame,
  sequenceName,
  setTextureCanvasFactory,
  setTextureFrames,
} from '../../src/render/textures.js';
import { getDefaults } from '../../src/schema/index.js';

setTextureCanvasFactory((w, h) => createCanvas(w, h));

/** a w×h canvas filled with one colour */
const solid = (color, w = 16, h = 16) => {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c;
};

const renderer = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
});

/** render a single texture emitter layer, return the average colour of the visible pixels */
function renderTex(params, seconds = 1) {
  const img = renderer.renderFrameImageData(
    {
      id: 'x',
      timing: { frameCount: 48, fps: 24, loop: false },
      layers: [
        {
          id: 'x',
          type: 'textureEmitter',
          params: {
            ...getDefaults(LAYER_TYPES.textureEmitter.schema),
            'emit.prewarm': true,
            'glow.amount': 0,
            ...params,
          },
        },
      ],
    },
    1,
    Math.round(seconds * 24),
    { width: 200, height: 200 },
  );
  let n = 0;
  const sum = [0, 0, 0];
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] > 200) {
      n++;
      sum[0] += img.data[i];
      sum[1] += img.data[i + 1];
      sum[2] += img.data[i + 2];
    }
  }
  return { n, rgb: sum.map((v) => (n ? v / n : 0)) };
}

describe('texture particles (4.Pb2)', () => {
  it('plays sequences: loop, once, over life, random still', () => {
    const p = { ageS: 0.5, age: 0.25, seed: 77 };
    expect(sequenceFrame('loop', 10, p, 24, false)).toBe(12 % 10);
    expect(sequenceFrame('once', 10, p, 24, false)).toBe(9);
    expect(sequenceFrame('life', 10, p, 24, false)).toBe(2);
    const r = sequenceFrame('random', 10, p, 24, false);
    expect(r).toBe(sequenceFrame('random', 10, { ...p, ageS: 3 }, 24, false));
    expect(sequenceFrame('loop', 1, p, 24, true)).toBe(0);
    // random start differs between particles
    const starts = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => sequenceFrame('loop', 10, { ...p, seed }, 24, true)),
    );
    expect(starts.size).toBeGreaterThan(2);
  });

  it('names and orders sequences', () => {
    expect(sequenceName(['fire_0001.png', 'fire_0002.png'])).toBe('fire');
    expect(sequenceName(['spark.png'])).toBe('spark');
    expect(['f10.png', 'f2.png', 'f1.png'].sort(naturalCompare)).toEqual([
      'f1.png',
      'f2.png',
      'f10.png',
    ]);
  });

  it('draws the image; a missing texture falls back to a soft dot', () => {
    setTextureFrames('red', [solid('#ff0000')]);
    const red = renderTex({ 'tex.asset': 'red', 'tex.size': 30 });
    expect(red.n).toBeGreaterThan(100);
    expect(red.rgb[0]).toBeGreaterThan(240);
    expect(red.rgb[2]).toBeLessThan(15);
    const none = renderTex({ 'tex.asset': 'nope' });
    expect(none.n).toBeGreaterThan(10);
  });

  it('a sequence stretched over life shows its frames in order', () => {
    setTextureFrames('seq', [solid('#ff0000'), solid('#0000ff')]);
    // one particle, life 2 s: first half red, second half blue
    const base = {
      'tex.asset': 'seq',
      'tex.play': 'life',
      'emit.prewarm': false,
      'emit.pulseEvery': 10,
      'emit.pulseCount': 1,
      'emit.life': 2,
      'emit.lifeVariance': 0,
      'emit.speed': 0,
      'emit.scaleOverLife': [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
      'emit.opacityOverLife': [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
    };
    const early = renderTex(base, 0.5);
    const late = renderTex(base, 1.5);
    expect(early.rgb[0]).toBeGreaterThan(200);
    expect(late.rgb[2]).toBeGreaterThan(200);
  });

  it('recolours: tint multiplies by the ramp, ramp maps brightness', () => {
    const ramp = [
      { pos: 0, color: '#00ff00' },
      { pos: 1, color: '#00ff00' },
    ];
    const t = recoloured('white', 0, solid('#ffffff', 4, 4), 'tint', ramp, 0, 0, 0, 'g');
    const d = t.getContext('2d').getImageData(0, 0, 1, 1).data;
    expect([d[0], d[1], d[2]]).toEqual([0, 255, 0]);
    const r = recoloured('white', 0, solid('#000000', 4, 4), 'ramp', ramp, 0, 1, 0, 'g');
    expect(r.getContext('2d').getImageData(0, 0, 1, 1).data[1]).toBe(255);
    // tinted layer renders in the ramp colour
    setTextureFrames('white', [solid('#ffffff')]);
    const out = renderTex({
      'tex.asset': 'white',
      'tex.color': 'tint',
      'style.ramp': ramp,
      'tex.size': 30,
    });
    expect(out.rgb[1]).toBeGreaterThan(240);
    expect(out.rgb[0]).toBeLessThan(15);
  });

  it('files keep used textures (only) and the layer link; build passes the asset id', () => {
    let r = addLayer(createExplosion(), 'textureEmitter');
    let s = r.state;
    const id = r.id;
    const asset = {
      id: 'tex-a',
      name: 'spark',
      w: 1,
      h: 1,
      frames: ['data:image/png;base64,iVBORw0KGgo='],
    };
    const unused = { ...asset, id: 'tex-b' };
    s = updateLayer({ ...s, assets: { 'tex-a': asset, 'tex-b': unused } }, id, {
      texture: 'tex-a',
    });
    const layer = buildExplosion(s).effect.layers.find((l) => l.id === id);
    expect(layer.params['tex.asset']).toBe('tex-a');
    const file = JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 1 })));
    expect(file.assets.map((a) => a.id)).toEqual(['tex-a']);
    const back = parseExplosion(file);
    expect(back.warnings).toEqual([]);
    expect(back.state.assets).toEqual({ 'tex-a': asset });
    expect(back.state.layers.find((l) => l.id === id).texture).toBe('tex-a');
    // a missing texture is dropped with a warning; non-image data is refused
    const bad = structuredClone(file);
    bad.assets[0].frames = ['javascript:alert(1)'];
    const b = parseExplosion(bad);
    expect(b.warnings.join()).toMatch(/texture "tex-a" not found/);
    expect(b.state.layers.find((l) => l.id === id).texture).toBeUndefined();
    r = null;
  });
});
