// @ts-check
/**
 * Ready-made colour ramps (3.8, D-061), by family. Left = hot / start (the bright core),
 * right = cool / end (what an element fades to). Tuned for stylized, cel-shaded game VFX:
 * a near-white core, a saturated body, and a dark but still COLOURED end (not grey), so bands
 * read clearly on light and dark backgrounds. Fire = option A from step 2.1.
 *
 * Keys are stable ids (presets and files may refer to them); labels and groups are for menus.
 */

import { DEFAULT_FIRE_RAMP } from './style.js';

/** @typedef {{ pos: number, color: string }} Stop */
/** @typedef {{ label: string, group: string, stops: ReadonlyArray<Stop> }} RampPreset */

/** Ramp families in menu order. */
export const RAMP_GROUPS = Object.freeze([
  'Fire',
  'Smoke & dust',
  'Sparks & debris',
  'Water',
  'Ice',
  'Lightning',
  'Magic · arcane',
  'Magic · holy',
  'Magic · shadow',
  'Magic · nature',
  'Poison',
  'Lava',
  'Plasma',
  'Blood',
  'Gold & treasure',
]);

/** Even stops from a list of colours. @param {string[]} colors @returns {Stop[]} */
const even = (colors) =>
  colors.map((color, i) => ({ pos: Math.round((i / (colors.length - 1)) * 1000) / 1000, color }));
/** Stops at given positions. @param {[number, string][]} list @returns {Stop[]} */
const at = (list) => list.map(([pos, color]) => ({ pos, color }));

/** @type {Readonly<Record<string, RampPreset>>} */
export const RAMP_PRESETS = Object.freeze({
  // ── Fire ──
  fire: { label: 'Fire', group: 'Fire', stops: DEFAULT_FIRE_RAMP },
  fireAnime: {
    label: 'Fire · anime white-hot',
    group: 'Fire',
    stops: at([
      [0, '#ffffff'],
      [0.25, '#fffbd6'],
      [0.4, '#ffd23f'],
      [0.6, '#ff7a1a'],
      [0.8, '#e0331b'],
      [1, '#6b1424'],
    ]),
  },
  fireCartoon: {
    label: 'Fire · cartoon',
    group: 'Fire',
    stops: even(['#fff6b0', '#ffd43a', '#ff9a1f', '#ff5a1f', '#b8261c']),
  },
  fireBlue: {
    label: 'Fire · blue',
    group: 'Fire',
    stops: at([
      [0, '#ffffff'],
      [0.15, '#d8f6ff'],
      [0.35, '#5fd0ff'],
      [0.6, '#2a6dff'],
      [0.8, '#2a2fb8'],
      [1, '#1a1648'],
    ]),
  },
  fireGreen: {
    label: 'Fire · fel green',
    group: 'Fire',
    stops: at([
      [0, '#ffffff'],
      [0.15, '#f0ffc4'],
      [0.35, '#a6ff3d'],
      [0.6, '#35c21f'],
      [0.8, '#11702a'],
      [1, '#0d2a1e'],
    ]),
  },
  firePurple: {
    label: 'Fire · purple',
    group: 'Fire',
    stops: at([
      [0, '#ffffff'],
      [0.15, '#ffd6ff'],
      [0.35, '#ff6bf0'],
      [0.6, '#b22ee8'],
      [0.8, '#5a1aa8'],
      [1, '#22123f'],
    ]),
  },

  // ── Smoke & dust ──
  smoke: {
    label: 'Smoke',
    group: 'Smoke & dust',
    stops: at([
      [0, '#f2efe9'],
      [0.35, '#c4c2c8'],
      [0.7, '#8a8996'],
      [1, '#3c3a46'],
    ]),
  },
  smokeDark: {
    label: 'Smoke · dark',
    group: 'Smoke & dust',
    stops: even(['#8d8794', '#5e5866', '#3d3843', '#24212a']),
  },
  smokeWarm: {
    label: 'Smoke · fire-lit',
    group: 'Smoke & dust',
    stops: at([
      [0, '#ffd9a0'],
      [0.25, '#d99a72'],
      [0.55, '#8a6066'],
      [0.8, '#4e3e4c'],
      [1, '#2a2430'],
    ]),
  },
  smokeToxic: {
    label: 'Smoke · toxic',
    group: 'Smoke & dust',
    stops: even(['#e6ffb8', '#a8c96a', '#6b8a4a', '#3f5236', '#22291f']),
  },
  steam: {
    label: 'Steam · cold',
    group: 'Smoke & dust',
    stops: even(['#ffffff', '#e6f2fa', '#bcd2e2', '#8aa3ba', '#56687d']),
  },
  dust: {
    label: 'Dust · sand',
    group: 'Smoke & dust',
    stops: even(['#fff1cf', '#e2c48f', '#bb9763', '#86694a', '#4a3b30']),
  },

  // ── Sparks & debris ──
  sparks: {
    label: 'Sparks',
    group: 'Sparks & debris',
    stops: at([
      [0, '#ffffff'],
      [0.35, '#ffe066'],
      [0.7, '#ff8a2a'],
      [1, '#c7281e'],
    ]),
  },
  sparksBlue: {
    label: 'Sparks · blue',
    group: 'Sparks & debris',
    stops: at([
      [0, '#ffffff'],
      [0.35, '#a8f0ff'],
      [0.7, '#3aa8ff'],
      [1, '#2a3ac7'],
    ]),
  },
  debris: {
    label: 'Debris',
    group: 'Sparks & debris',
    stops: at([
      [0, '#ffb35c'],
      [0.45, '#7a4a3a'],
      [1, '#2e2630'],
    ]),
  },
  rock: {
    label: 'Rock · cool',
    group: 'Sparks & debris',
    stops: even(['#c9c3bd', '#8f8780', '#5c5552', '#2f2b2e']),
  },

  // ── Water ──
  water: {
    label: 'Water',
    group: 'Water',
    stops: at([
      [0, '#ffffff'],
      [0.15, '#d9f6ff'],
      [0.4, '#6fd2ff'],
      [0.7, '#2386e0'],
      [1, '#163f8f'],
    ]),
  },
  waterDeep: {
    label: 'Water · deep ocean',
    group: 'Water',
    stops: even(['#bff1ff', '#3fb4e8', '#1e6fbf', '#17438a', '#101f4a']),
  },
  waterTropical: {
    label: 'Water · tropical',
    group: 'Water',
    stops: at([
      [0, '#ffffff'],
      [0.2, '#c8fff4'],
      [0.45, '#3fe0d0'],
      [0.75, '#1aa3b8'],
      [1, '#0f5a7a'],
    ]),
  },
  foam: {
    label: 'Foam · splash',
    group: 'Water',
    stops: at([
      [0, '#ffffff'],
      [0.5, '#eaf9ff'],
      [0.8, '#a6dcf5'],
      [1, '#5aa6d6'],
    ]),
  },

  // ── Ice ──
  ice: {
    label: 'Ice',
    group: 'Ice',
    stops: at([
      [0, '#ffffff'],
      [0.25, '#e4fbff'],
      [0.5, '#9fe6ff'],
      [0.75, '#56a8e6'],
      [1, '#2d5aa8'],
    ]),
  },
  frost: {
    label: 'Frost · pale',
    group: 'Ice',
    stops: even(['#ffffff', '#f0fbff', '#cdeefc', '#9ccbe8', '#7096bf']),
  },
  glacier: {
    label: 'Ice · glacier',
    group: 'Ice',
    stops: even(['#e8ffff', '#7ff0f0', '#2fb8d6', '#1e6ea8', '#1b3566']),
  },

  // ── Lightning ──
  electric: {
    label: 'Electric · blue',
    group: 'Lightning',
    stops: at([
      [0, '#ffffff'],
      [0.25, '#e0faff'],
      [0.45, '#7fe8ff'],
      [0.7, '#3a7dff'],
      [1, '#3a22b8'],
    ]),
  },
  electricPurple: {
    label: 'Electric · purple',
    group: 'Lightning',
    stops: at([
      [0, '#ffffff'],
      [0.25, '#f3e0ff'],
      [0.45, '#c88aff'],
      [0.7, '#8a3aff'],
      [1, '#3d1a8f'],
    ]),
  },
  electricYellow: {
    label: 'Electric · yellow',
    group: 'Lightning',
    stops: at([
      [0, '#ffffff'],
      [0.25, '#fffbd0'],
      [0.45, '#fff05a'],
      [0.7, '#ffb21f'],
      [1, '#b8561a'],
    ]),
  },

  // ── Magic ──
  arcane: {
    label: 'Arcane · violet',
    group: 'Magic · arcane',
    stops: at([
      [0, '#ffffff'],
      [0.2, '#f1d9ff'],
      [0.45, '#c47bff'],
      [0.7, '#7d3cf0'],
      [1, '#2e1a7a'],
    ]),
  },
  mana: {
    label: 'Arcane · mana blue',
    group: 'Magic · arcane',
    stops: at([
      [0, '#ffffff'],
      [0.2, '#d6ecff'],
      [0.45, '#7aa8ff'],
      [0.7, '#4a5ef0'],
      [1, '#25207a'],
    ]),
  },
  arcanePink: {
    label: 'Arcane · pink',
    group: 'Magic · arcane',
    stops: even(['#ffffff', '#ffd6f4', '#ff7ad9', '#d43aa8', '#5e1a5a']),
  },
  holy: {
    label: 'Holy · gold',
    group: 'Magic · holy',
    stops: at([
      [0, '#ffffff'],
      [0.25, '#fffbe0'],
      [0.5, '#ffe58a'],
      [0.75, '#ffc23d'],
      [1, '#c27a1f'],
    ]),
  },
  holyWhite: {
    label: 'Holy · radiant white',
    group: 'Magic · holy',
    stops: even(['#ffffff', '#fffdf2', '#fff2c4', '#ffe0a0', '#e8b878']),
  },
  heal: {
    label: 'Heal',
    group: 'Magic · holy',
    stops: at([
      [0, '#ffffff'],
      [0.25, '#eaffdc'],
      [0.5, '#9dff8a'],
      [0.75, '#3ed67a'],
      [1, '#1a8a6a'],
    ]),
  },
  shadow: {
    label: 'Shadow · void',
    group: 'Magic · shadow',
    stops: at([
      [0, '#d9c4ff'],
      [0.2, '#8a5adb'],
      [0.45, '#4a2a8f'],
      [0.7, '#24164f'],
      [1, '#0d0a1c'],
    ]),
  },
  shadowRed: {
    label: 'Shadow · blood moon',
    group: 'Magic · shadow',
    stops: even(['#ffb8c0', '#e0405a', '#8f1a3a', '#4a0f2a', '#180812']),
  },
  necrotic: {
    label: 'Shadow · necrotic',
    group: 'Magic · shadow',
    stops: even(['#e8ffd0', '#9adb6a', '#3f8a5a', '#1f3f3a', '#0c1418']),
  },
  nature: {
    label: 'Nature · leaf',
    group: 'Magic · nature',
    stops: at([
      [0, '#ffffff'],
      [0.2, '#f2ffd0'],
      [0.45, '#b6f05a'],
      [0.7, '#4cb33a'],
      [1, '#1f5a2e'],
    ]),
  },
  natureBloom: {
    label: 'Nature · bloom',
    group: 'Magic · nature',
    stops: even(['#ffffff', '#fff0f6', '#ffb8d9', '#e078b8', '#7a3a8a']),
  },
  earth: {
    label: 'Nature · earth',
    group: 'Magic · nature',
    stops: even(['#fff0c4', '#d9b46a', '#a87a3f', '#6b4a2e', '#33241f']),
  },

  // ── Poison ──
  poison: {
    label: 'Poison',
    group: 'Poison',
    stops: at([
      [0, '#f6ffd6'],
      [0.25, '#d0ff4a'],
      [0.5, '#7bd11f'],
      [0.75, '#3a8a2a'],
      [1, '#1a3a22'],
    ]),
  },
  acid: {
    label: 'Acid',
    group: 'Poison',
    stops: even(['#ffffff', '#fbff9a', '#e6ff1f', '#9ad100', '#4a6b0f']),
  },
  venom: {
    label: 'Venom · purple-green',
    group: 'Poison',
    stops: even(['#eaffc4', '#9be04a', '#5a9a5a', '#5a3a7a', '#2a1440']),
  },

  // ── Lava ──
  lava: {
    label: 'Lava',
    group: 'Lava',
    stops: at([
      [0, '#fffbd0'],
      [0.15, '#ffd23a'],
      [0.35, '#ff7a1a'],
      [0.6, '#d42a1a'],
      [0.8, '#6b1418'],
      [1, '#2a1416'],
    ]),
  },
  magma: {
    label: 'Magma · crust',
    group: 'Lava',
    stops: at([
      [0, '#ffb43a'],
      [0.2, '#ff5a1a'],
      [0.4, '#a81e1a'],
      [0.65, '#4a1a1f'],
      [1, '#1c1418'],
    ]),
  },

  // ── Plasma ──
  plasma: {
    label: 'Plasma · cyan-magenta',
    group: 'Plasma',
    stops: at([
      [0, '#ffffff'],
      [0.2, '#c8ffff'],
      [0.4, '#3ae6ff'],
      [0.65, '#c43aff'],
      [0.85, '#ff2a9a'],
      [1, '#5a0f4a'],
    ]),
  },
  plasmaPink: {
    label: 'Plasma · pink',
    group: 'Plasma',
    stops: even(['#ffffff', '#ffe0f0', '#ff6ac8', '#e01a8a', '#6b0f4a']),
  },
  plasmaGreen: {
    label: 'Plasma · sci-fi green',
    group: 'Plasma',
    stops: even(['#ffffff', '#d6fff0', '#3affb8', '#1ab87a', '#0f4a4a']),
  },

  // ── Blood ──
  blood: {
    label: 'Blood',
    group: 'Blood',
    stops: at([
      [0, '#ff6a6a'],
      [0.3, '#e01a2a'],
      [0.6, '#a8101f'],
      [0.85, '#5a0a18'],
      [1, '#2a0510'],
    ]),
  },
  bloodDark: {
    label: 'Blood · dark',
    group: 'Blood',
    stops: even(['#c4303a', '#8a1424', '#5a0a18', '#2e0610']),
  },
  bloodCartoon: {
    label: 'Blood · cartoon',
    group: 'Blood',
    stops: even(['#ffd0d0', '#ff4a4a', '#d4141f', '#7a0a1a']),
  },

  // ── Gold & treasure ──
  gold: {
    label: 'Gold · coins',
    group: 'Gold & treasure',
    stops: at([
      [0, '#ffffff'],
      [0.2, '#fff6c4'],
      [0.45, '#ffd23a'],
      [0.7, '#e09a1a'],
      [1, '#8a4a14'],
    ]),
  },
  goldRose: {
    label: 'Gold · rose',
    group: 'Gold & treasure',
    stops: even(['#ffffff', '#ffe6d6', '#ffb88a', '#e0785a', '#8a3a3a']),
  },
  silver: {
    label: 'Silver',
    group: 'Gold & treasure',
    stops: even(['#ffffff', '#eef2f8', '#bcc6d6', '#7d879a', '#3f4454']),
  },
  gem: {
    label: 'Gem · emerald',
    group: 'Gold & treasure',
    stops: even(['#ffffff', '#c4ffe6', '#3ae0a0', '#14996a', '#0a4a3a']),
  },
  ruby: {
    label: 'Gem · ruby',
    group: 'Gold & treasure',
    stops: even(['#ffffff', '#ffd0dc', '#ff3a6a', '#b80f3a', '#4a061a']),
  },
});

/** Deep copy of a preset's stops (safe to put into params). @param {string} key */
export const rampPreset = (key) => RAMP_PRESETS[key].stops.map((s) => ({ ...s }));

/** Presets of a family, in definition order. @param {string} group */
export const rampsInGroup = (group) =>
  Object.entries(RAMP_PRESETS)
    .filter(([, p]) => p.group === group)
    .map(([key, p]) => ({ key, ...p }));

/** The same ramp backwards (cool → hot). @param {ReadonlyArray<Stop>} stops @returns {Stop[]} */
export const reverseRamp = (stops) =>
  stops.map((s) => ({ pos: Math.round((1 - s.pos) * 1e6) / 1e6, color: s.color })).reverse();
