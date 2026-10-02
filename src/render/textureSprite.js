// @ts-check
/**
 * Texture sprites (4.Pb2 / D-068, D-074): draw an imported image or PNG sequence in place of a
 * layer's own shape. Used by the Texture particle layer and — as an override — by every sprite
 * layer (bursts, singles, orbits, emitters) that has a texture assigned.
 */

import { sampleRamp } from './ramp.js';
import { corePosition, readStyle, shiftStyle } from './style.js';
import { recoloured, sequenceFrame, textureFrames } from './textures.js';

/** Texture parameters (ids `tex.*`). `tex.asset` (the asset id) is injected by the build. */
export const TEXTURE_PARAMS = [
  {
    id: 'tex.size',
    label: 'Texture size',
    group: 'Texture',
    type: 'float',
    min: 1,
    max: 1024,
    step: 1,
    default: 48,
    unit: 'px',
    tooltip: 'Longest side of the texture at particle size 1',
  },
  {
    id: 'tex.play',
    label: 'Sequence',
    group: 'Texture',
    type: 'enum',
    options: [
      { value: 'loop', label: 'Loop at fps' },
      { value: 'once', label: 'Play once, hold last frame' },
      { value: 'life', label: 'Stretch over the particle’s life' },
      { value: 'random', label: 'Random still frame' },
    ],
    default: 'loop',
    tooltip: 'How a PNG sequence plays on each particle (a single image ignores this)',
  },
  {
    id: 'tex.fps',
    label: 'Sequence fps',
    group: 'Texture',
    type: 'float',
    min: 1,
    max: 60,
    step: 1,
    default: 24,
  },
  {
    id: 'tex.randomStart',
    label: 'Random start frame',
    group: 'Texture',
    type: 'bool',
    default: true,
    tooltip: 'Each particle starts the loop at a different frame',
  },
  {
    id: 'tex.color',
    label: 'Colour',
    group: 'Texture',
    type: 'enum',
    options: [
      { value: 'original', label: 'Original colours' },
      { value: 'tint', label: 'Tint by the ramp (over life)' },
      { value: 'ramp', label: 'Brightness → ramp (gradient map)' },
    ],
    default: 'original',
  },
  {
    id: 'tex.angle',
    label: 'Texture angle',
    group: 'Texture',
    type: 'float',
    min: -180,
    max: 180,
    step: 1,
    default: 0,
    unit: '°',
    tooltip: 'Turns the image on each particle (e.g. so a streak points along its motion)',
  },
];
/** @type {WeakMap<object, string>} */
const rampKeys = new WeakMap();
const rampKeyOf = (/** @type {any[]} */ ramp) => {
  let k = rampKeys.get(ramp);
  if (!k) {
    k = JSON.stringify(ramp);
    rampKeys.set(ramp, k);
  }
  return k;
};
/**
 * Draw one instance as the texture (or a soft round sprite while none is loaded).
 * @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']}
 */
export const drawTexture = (ctx, params, inst, frame) => {
  const style = shiftStyle(readStyle(params), /** @type {any} */ (inst).rampShift ?? 0);
  const pos = corePosition(style, inst.age);
  const id = params['tex.asset'];
  const frames = id ? textureFrames(id) : null;
  if (!frames?.length) {
    // no texture (yet): a soft round sprite, so the layer shows something
    const r = params['tex.size'] / 2;
    const [cr, cg, cb] = sampleRamp(style.ramp, pos);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const index = sequenceFrame(
    params['tex.play'],
    frames.length,
    {
      // particles know their own age; other sprites play from the effect's start
      ageS: inst.ageS ?? frame?.seconds ?? 0,
      age: inst.age ?? 0,
      seed: inst.seed ?? 0,
    },
    params['tex.fps'],
    params['tex.randomStart'],
  );
  const img = frames[index];
  const mode = params['tex.color'];
  const src =
    mode === 'tint' || mode === 'ramp'
      ? recoloured(
          id,
          index,
          img,
          mode,
          style.ramp,
          pos,
          style.spread,
          style.bands,
          rampKeyOf(style.ramp),
        )
      : img;
  const k = params['tex.size'] / Math.max(1, img.width, img.height);
  const w = img.width * k;
  const h = img.height * k;
  if (params['tex.angle']) ctx.rotate((params['tex.angle'] * Math.PI) / 180);
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
};

// ── Image / Sequence layer (D-089): an imported image or PNG sequence as a layer of its own ──

const IG = 'Image';
/** Image layer parameters (ids `image.*`; it also uses `tex.fps` / `tex.color`). */
export const IMAGE_PARAMS = [
  {
    id: 'image.fit',
    label: 'Size',
    group: IG,
    type: 'enum',
    options: [
      { value: 'native', label: 'Native (1 image px = 1 px)' },
      { value: 'custom', label: 'Custom (longest side)' },
    ],
    default: 'native',
    tooltip: 'Native keeps hand-drawn pixels 1:1. Use Scale in Transform to resize as well',
  },
  {
    id: 'image.size',
    label: 'Custom size',
    group: IG,
    type: 'float',
    min: 1,
    max: 4096,
    step: 1,
    default: 256,
    unit: 'px',
    tooltip: 'Longest side when Size is Custom',
  },
  {
    id: 'image.play',
    label: 'Playback',
    group: IG,
    type: 'enum',
    options: [
      { value: 'loop', label: 'Loop' },
      { value: 'once', label: 'Play once, hold the last drawing' },
      { value: 'pingpong', label: 'Ping-pong (forward, then back)' },
      { value: 'stretch', label: 'Stretch over the layer’s time' },
    ],
    default: 'loop',
    tooltip: 'How a PNG sequence plays (a single image ignores this)',
  },
  {
    id: 'image.fps',
    label: 'Sequence fps',
    group: IG,
    type: 'float',
    min: 1,
    max: 60,
    step: 1,
    default: 24,
  },
  {
    id: 'image.hold',
    label: 'Hold each drawing',
    group: IG,
    type: 'int',
    min: 1,
    max: 8,
    default: 1,
    unit: 'fr',
    tooltip: '1 = on ones, 2 = on twos (each drawing shows for 2 frames), 3 = on threes…',
  },
  {
    id: 'image.start',
    label: 'Start at drawing',
    group: IG,
    type: 'int',
    min: 0,
    max: 999,
    default: 0,
    tooltip: 'Skip the first drawings (0 = from the beginning)',
  },
  {
    id: 'image.color',
    label: 'Colour',
    group: IG,
    type: 'enum',
    options: [
      { value: 'original', label: 'Original colours' },
      { value: 'tint', label: 'Tint by the ramp' },
      { value: 'ramp', label: 'Brightness → ramp (gradient map)' },
    ],
    default: 'original',
  },
];

/**
 * Which drawing of an image sequence shows at a layer time.
 * @param {string} play  loop · once · pingpong · stretch
 * @param {number} n drawings @param {number} seconds layer time @param {number} age 0–1 of the layer
 * @param {number} fps @param {number} hold frames per drawing @param {number} start first drawing
 */
export function imageFrame(play, n, seconds, age, fps, hold, start) {
  if (n <= 1) return 0;
  if (play === 'stretch') return Math.min(n - 1, Math.floor(Math.max(0, age) * n));
  // holds count in frames at the sequence fps: on twos, a drawing lasts 2 frames
  const step = Math.floor((Math.max(0, seconds) * fps + 1e-6) / Math.max(1, hold)) + start;
  if (play === 'once') return Math.min(n - 1, step);
  if (play === 'pingpong') {
    const period = 2 * n - 2;
    const k = step % period;
    return k < n ? k : period - k;
  }
  return step % n;
}

/**
 * Draw an Image layer instance: the image / sequence frame, centred, at native or custom size.
 * Without an image yet: a dashed placeholder frame.
 * @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']}
 */
export const drawImageLayer = (ctx, params, inst, frame) => {
  const id = params['tex.asset'];
  const frames = id ? textureFrames(id) : null;
  if (!frames?.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(-80, -60, 160, 120);
    ctx.restore();
    return;
  }
  const index = imageFrame(
    params['image.play'],
    frames.length,
    frame?.seconds ?? 0,
    inst.age ?? 0,
    params['image.fps'] ?? 24,
    params['image.hold'] ?? 1,
    params['image.start'] ?? 0,
  );
  const img = frames[index];
  const mode = params['image.color'];
  let src = img;
  if (mode === 'tint' || mode === 'ramp') {
    const style = readStyle(params);
    src = recoloured(
      id,
      index,
      img,
      mode,
      style.ramp,
      corePosition(style, inst.age),
      style.spread,
      style.bands,
      rampKeyOf(style.ramp),
    );
  }
  const k =
    params['image.fit'] === 'custom'
      ? params['image.size'] / Math.max(1, img.width, img.height)
      : 1;
  const w = img.width * k;
  const h = img.height * k;
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
};
