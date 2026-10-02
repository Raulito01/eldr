import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExplosion, createExplosion } from '../../src/effects/explosion/explosion.js';
import { addLayer, updateLayer } from '../../src/effects/layerStack.js';
import { LAYER_TYPE_LABELS, LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { paletteFor, pixelate, readPixel } from '../../src/render/pixel.js';
import { createRenderer } from '../../src/render/renderer.js';
import { imageFrame } from '../../src/render/textureSprite.js';
import { setTextureCanvasFactory, setTextureFrames } from '../../src/render/textures.js';

setTextureCanvasFactory((w, h) => createCanvas(w, h));
const r = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
});

/** A "hand-drawn" sequence: 4 drawings, each a 40×30 block of its own colour. */
const COLOURS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
setTextureFrames(
  'seq',
  COLOURS.map((c) => {
    const cv = createCanvas(40, 30);
    const x = cv.getContext('2d');
    x.fillStyle = c;
    x.fillRect(0, 0, 40, 30);
    return cv;
  }),
);

/** A document with only an Image layer showing the sequence. */
function doc(params = {}) {
  const base = { ...createExplosion(), layers: [] };
  base.timing = { ...base.timing, frameCount: 24, fps: 24, loop: true };
  base.globals = { ...base.globals, 'explosion.impact': 0, 'explosion.flashFrames': 0 };
  const a = addLayer(base, 'image');
  const l = a.state.layers.find((x) => x.id === a.id);
  return updateLayer(
    {
      ...a.state,
      assets: {
        seq: {
          id: 'seq',
          name: 'seq',
          frames: ['data:image/png;base64,iVBORw0KGgo='],
          w: 40,
          h: 30,
        },
      },
    },
    a.id,
    { texture: 'seq', anchor: 'free', params: { ...l.params, ...params } },
  );
}
const centre = (state, f, w = 128) => {
  const { effect, scale } = buildExplosion(state);
  const img = r.renderFrameImageData(effect, 1, f, { width: w, height: w, scale });
  const i = ((w / 2) * w + w / 2) * 4;
  return { rgb: [img.data[i], img.data[i + 1], img.data[i + 2]], img };
};
const hex = ([r0, g, b]) => `#${[r0, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

describe('Image / Sequence layer (D-089)', () => {
  it('is a layer type in the Add layer menu', () => {
    expect(LAYER_TYPES.image).toBeTruthy();
    expect(Object.keys(LAYER_TYPE_LABELS)[0]).toBe('image');
  });

  it('playback: loop, once, ping-pong, holds, start drawing, stretch', () => {
    const at = (play, f, o = {}) => imageFrame(play, 4, f / 24, 0, 24, o.hold ?? 1, o.start ?? 0);
    expect([0, 1, 2, 3, 4, 5].map((f) => at('loop', f))).toEqual([0, 1, 2, 3, 0, 1]);
    expect([0, 3, 4, 9].map((f) => at('once', f))).toEqual([0, 3, 3, 3]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((f) => at('pingpong', f))).toEqual([
      0, 1, 2, 3, 2, 1, 0, 1,
    ]);
    expect([0, 1, 2, 3, 4].map((f) => at('loop', f, { hold: 2 }))).toEqual([0, 0, 1, 1, 2]);
    expect([0, 1].map((f) => at('loop', f, { start: 2 }))).toEqual([2, 3]);
    expect(imageFrame('stretch', 4, 0, 0.99, 24, 1, 0)).toBe(3);
  });

  it('draws the drawing for each frame at native size', () => {
    const s = doc();
    expect([0, 1, 2, 3].map((f) => hex(centre(s, f).rgb))).toEqual(COLOURS);
    // native: 40 × 30 px
    const { img } = centre(s, 0);
    let n = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 128) n++;
    expect(n).toBe(40 * 30);
  });

  it('on twos holds each drawing for 2 frames; custom size scales it', () => {
    const s = doc({ 'image.hold': 2 });
    expect([0, 1, 2, 3].map((f) => hex(centre(s, f).rgb))).toEqual([
      COLOURS[0],
      COLOURS[0],
      COLOURS[1],
      COLOURS[1],
    ]);
    const big = doc({ 'image.fit': 'custom', 'image.size': 80 });
    const { img } = centre(big, 0);
    let n = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 128) n++;
    expect(n).toBe(80 * 60);
  });

  it('works with the layer effects (dissolve) and Pixel Mode', () => {
    const s = doc({
      'dissolve.mode': 'pixels',
      'dissolve.size': 8,
      'dissolve.amount': [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
    });
    const { img } = centre(s, 0);
    let n = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 128) n++;
    expect(n).toBeGreaterThan(200);
    expect(n).toBeLessThan(1100);
    const px = { ...readPixel({ 'pixel.enabled': true }), size: 32, palette: 'pico8' };
    const art = pixelate({ width: 128, height: 128, data: img.data }, px, paletteFor(px, s));
    expect(art.width).toBe(32);
  });

  it('saves and loads with its image', () => {
    const s = doc({ 'image.play': 'pingpong', 'image.hold': 3 });
    const back = parseExplosion(serializeExplosion(s, { seed: 1, name: 'img' }));
    expect(back.warnings ?? []).toEqual([]);
    const l = back.state.layers[0];
    expect(l.type).toBe('image');
    expect(l.texture).toBe('seq');
    expect(l.params['image.play']).toBe('pingpong');
    expect(l.params['image.hold']).toBe(3);
  });

  it('Pixel Mode Auto palette takes the colours of an imported image (not only the ramps)', () => {
    const s = doc();
    const pal = paletteFor({ ...readPixel({ 'pixel.enabled': true }), colors: 8 }, s);
    for (const c of COLOURS) expect(pal).toContain(c);
  });
});
