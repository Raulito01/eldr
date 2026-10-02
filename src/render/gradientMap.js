// @ts-check
/**
 * Gradient Map adjustment layer (3.8b, D-063), like Photoshop's gradient map / an After Effects
 * adjustment layer: it recolours EVERYTHING BELOW it in the stack by brightness, through a ramp.
 * Alpha is never changed. Bright → the ramp's LEFT end (ELDR ramps are hot / bright on the
 * left, so every library ramp works as-is); "Dark → left" gives Photoshop's direction.
 *
 * Mix and the layer's opacity fade the effect; the layer's blend mode decides how the mapped
 * colour combines with the original (blendMath.js — alpha stays put).
 */

import { defineSchema } from '../schema/schema.js';
import { blendRgb } from './blendMath.js';
import { sampleRamp } from './ramp.js';
import { RAMP_PRESETS } from './rampPresets.js';

export const GRADIENT_MAP_PARAMS = defineSchema([
  {
    id: 'gmap.ramp',
    label: 'Ramp',
    group: 'Gradient map',
    type: 'ramp',
    default: RAMP_PRESETS.fire.stops.map((s) => ({ ...s })),
    tooltip: 'Brightness → colour. Left = bright (hot), right = dark — like every ELDR ramp.',
  },
  {
    id: 'gmap.mix',
    label: 'Mix',
    group: 'Gradient map',
    type: 'float',
    min: 0,
    max: 100,
    step: 1,
    default: 100,
    unit: '%',
    tooltip: 'How much of the mapped colour (0 = original colours)',
  },
  {
    id: 'gmap.black',
    label: 'Black point',
    group: 'Gradient map',
    type: 'float',
    min: 0,
    max: 100,
    step: 0.5,
    default: 0,
    unit: '%',
    tooltip: 'Brightness that maps to the dark end of the ramp (like Levels input black)',
  },
  {
    id: 'gmap.white',
    label: 'White point',
    group: 'Gradient map',
    type: 'float',
    min: 0,
    max: 100,
    step: 0.5,
    default: 100,
    unit: '%',
    tooltip: 'Brightness that maps to the bright end of the ramp (like Levels input white)',
  },
  {
    id: 'gmap.bands',
    label: 'Bands',
    group: 'Gradient map',
    type: 'int',
    min: 0,
    max: 16,
    step: 1,
    default: 0,
    tooltip: 'Posterize into this many hard cel steps (0 = smooth)',
  },
  {
    id: 'gmap.darkLeft',
    label: 'Dark → left',
    group: 'Gradient map',
    type: 'bool',
    default: false,
    tooltip: 'Flip the direction: dark pixels take the ramp’s left end (Photoshop’s way)',
  },
]);

/** @param {Record<string, any>} v */
export const readGradientMap = (v) => ({
  ramp: v['gmap.ramp'],
  mix: v['gmap.mix'] / 100,
  black: v['gmap.black'] / 100,
  white: v['gmap.white'] / 100,
  bands: v['gmap.bands'],
  darkLeft: !!v['gmap.darkLeft'],
});

const LUT = 1024;

/**
 * Colour for each brightness step (LUT entries 0 … LUT−1), straight RGBA 0–255.
 * @param {ReturnType<typeof readGradientMap>} g @returns {Float32Array}
 */
export function gradientLut(g) {
  const out = new Float32Array(LUT * 4);
  const span = Math.max(1e-4, g.white - g.black);
  for (let i = 0; i < LUT; i++) {
    const l = i / (LUT - 1);
    const t = Math.min(1, Math.max(0, (l - g.black) / span));
    let pos = g.darkLeft ? t : 1 - t;
    if (g.bands > 0) {
      const q = Math.min(g.bands - 1, Math.floor(pos * g.bands));
      pos = g.bands === 1 ? 0.5 : q / (g.bands - 1);
    }
    const c = sampleRamp(g.ramp, pos);
    out.set(c, i * 4);
  }
  return out;
}

/**
 * Apply the gradient map to a whole surface in place (identity transform, straight alpha).
 * @param {CanvasRenderingContext2D} ctx the composite so far
 * @param {Record<string, any>} params
 * @param {{ width: number, height: number, blend: string, opacity: number }} info
 */
export function applyGradientMap(ctx, params, info) {
  const g = readGradientMap(params);
  const strength = g.mix * info.opacity;
  if (strength <= 0) return;
  const lut = gradientLut(g);
  const img = ctx.getImageData(0, 0, info.width, info.height);
  const d = img.data;
  const normal = info.blend === 'normal';
  for (let o = 0; o < d.length; o += 4) {
    if (d[o + 3] === 0) continue;
    const r = d[o];
    const gg = d[o + 1];
    const b = d[o + 2];
    const l = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
    const k = Math.round(l * (LUT - 1)) * 4;
    const w = strength * (lut[k + 3] / 255);
    if (w <= 0) continue;
    let mr = lut[k];
    let mg = lut[k + 1];
    let mb = lut[k + 2];
    if (!normal) {
      const c = blendRgb(info.blend, [r / 255, gg / 255, b / 255], [mr / 255, mg / 255, mb / 255]);
      mr = c[0] * 255;
      mg = c[1] * 255;
      mb = c[2] * 255;
    }
    d[o] = r + (mr - r) * w;
    d[o + 1] = gg + (mg - gg) * w;
    d[o + 2] = b + (mb - b) * w;
  }
  ctx.putImageData(img, 0, 0);
}
