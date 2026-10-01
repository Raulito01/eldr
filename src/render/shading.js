// @ts-check
/**
 * Toon shading parameters and light maths (brief §3.3). The painting itself lives in
 * style.js → paintStyled(), which combines fill, cel bands and shading.
 */

/** Shading parameters (ids `shade.*`). Defaults are provisional [Raul]. */
export const SHADE_PARAMS = [
  {
    id: 'shade.light',
    label: 'Light from',
    group: 'Shading',
    type: 'float',
    min: 0,
    max: 360,
    step: 1,
    default: 315,
    unit: '°',
    tooltip: 'Direction the light comes from: 0° = above, 90° = right, 315° = top-left',
  },
  {
    id: 'shade.shadow',
    label: 'Shadow depth',
    group: 'Shading',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.25,
    randomize: { min: 0.15, max: 0.4 },
    tooltip: 'How much darker the shadow is: how far along the ramp it shifts (0 = no shadow)',
  },
  {
    id: 'shade.shadowOffset',
    label: 'Shadow offset',
    group: 'Shading',
    type: 'float',
    min: 0,
    max: 0.6,
    step: 0.01,
    default: 0.18,
    randomize: { min: 0.1, max: 0.3 },
    tooltip: 'Width of the shadow crescent, as a fraction of the element size',
  },
  {
    id: 'shade.highlight',
    label: 'Highlight',
    group: 'Shading',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    randomize: { min: 0, max: 0.3 },
    tooltip: 'How much hotter the highlight is: ramp shift toward the start (0 = no highlight)',
  },
  {
    id: 'shade.highlightSize',
    label: 'Highlight size',
    group: 'Shading',
    type: 'float',
    min: 0.1,
    max: 0.8,
    step: 0.01,
    default: 0.35,
    tooltip: 'Size of the highlight relative to the element',
  },
  {
    id: 'shade.highlightOffset',
    label: 'Highlight offset',
    group: 'Shading',
    type: 'float',
    min: 0,
    max: 0.8,
    step: 0.01,
    default: 0.35,
    tooltip: 'How far toward the light the highlight sits, as a fraction of the element size',
  },
];

/**
 * @typedef {object} Shade
 * @property {number} light            degrees, 0 = from above, clockwise
 * @property {number} shadow           ramp shift (0 = off)
 * @property {number} shadowOffset     fraction of radius
 * @property {number} highlight        ramp shift toward the start (0 = off)
 * @property {number} highlightSize
 * @property {number} highlightOffset  fraction of radius
 */

/** @param {Record<string, any>} v @returns {Shade} */
export const readShade = (v) => ({
  light: v['shade.light'] ?? 315,
  shadow: v['shade.shadow'] ?? 0,
  shadowOffset: v['shade.shadowOffset'] ?? 0,
  highlight: v['shade.highlight'] ?? 0,
  highlightSize: v['shade.highlightSize'] ?? 0.35,
  highlightOffset: v['shade.highlightOffset'] ?? 0.35,
});

/**
 * Unit vector pointing from the element TOWARD the light, in the element's local space.
 * The light is fixed in the world, so the element's own rotation is undone.
 * @param {number} lightDeg 0 = light from above (screen up), clockwise
 * @param {number} rotation element rotation in radians
 * @returns {{ x: number, y: number }}
 */
export function lightVector(lightDeg, rotation) {
  const a = (lightDeg * Math.PI) / 180 - rotation;
  return { x: Math.sin(a), y: -Math.cos(a) };
}
