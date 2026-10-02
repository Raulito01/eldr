import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import { applyValues } from '../../src/effects/animEdit.js';
import { buildExplosion, createExplosion } from '../../src/effects/explosion/explosion.js';
import { layerAt } from '../../src/effects/layerAnimation.js';
import {
  addLayer,
  addMask,
  matteCandidates,
  removeLayer,
  removeMask,
  setMatte,
  updateLayer,
  updateMask,
} from '../../src/effects/layerStack.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer } from '../../src/render/renderer.js';
import { getDefaults } from '../../src/schema/schema.js';

const r = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
});
const W = 64;
const blob = (id, x, radius = 14, extra = {}) => ({
  id,
  type: 'blob',
  params: {
    ...getDefaults(LAYER_TYPES.blob.schema),
    'blob.radius': radius,
    'blob.bumps': 0,
    'blob.noise': 0,
    'single.scaleOverLife': [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  },
  matrix: [1, 0, 0, 1, x, 0],
  ...extra,
});
const render = (layers) =>
  r.renderFrameImageData(
    { id: 'x', timing: { frameCount: 5, fps: 30, loop: false, holdMode: 'ones' }, layers },
    1,
    2,
    { width: W, height: W },
  ).data;
const alphaAt = (d, x, y) => d[(y * W + x) * 4 + 3];

describe('track mattes (3.6d)', () => {
  // big blob at the centre, a small matte blob to its right (hidden itself)
  const base = blob('big', 0, 24);
  const m = blob('m', 14, 8, { enabled: false });
  it('alpha matte shows the layer only where the matte is; inverted the opposite', () => {
    const plain = render([m, base]);
    expect(alphaAt(plain, 32, 32)).toBeGreaterThan(200);
    const a = render([m, { ...base, matte: { source: 'm', mode: 'alpha' } }]);
    expect(alphaAt(a, 46, 32)).toBeGreaterThan(200); // inside the matte
    expect(alphaAt(a, 22, 32)).toBe(0); // outside it
    const inv = render([m, { ...base, matte: { source: 'm', mode: 'alphaInverted' } }]);
    expect(alphaAt(inv, 46, 32)).toBe(0);
    expect(alphaAt(inv, 22, 32)).toBeGreaterThan(200);
    // the hidden matte layer itself is not drawn
    expect(alphaAt(render([m]), 46, 32)).toBe(0);
  });

  it('luma matte uses brightness', () => {
    const black = blob('k', 14, 8, { enabled: false });
    black.params['style.ramp'] = [
      { pos: 0, color: '#000000' },
      { pos: 1, color: '#000000' },
    ];
    black.params['outline.mode'] = 'off';
    const l = render([black, { ...base, matte: { source: 'k', mode: 'luma' } }]);
    expect(alphaAt(l, 46, 32)).toBe(0); // black matte → hidden
    const li = render([black, { ...base, matte: { source: 'k', mode: 'lumaInverted' } }]);
    expect(alphaAt(li, 46, 32)).toBeGreaterThan(200);
  });
});

describe('masks (3.6d)', () => {
  const mask = (o) => ({
    id: 'm1',
    name: 'Mask 1',
    enabled: true,
    shape: 'rect',
    mode: 'add',
    inverted: false,
    x: 0,
    y: 0,
    w: 20,
    h: 64,
    rotation: 0,
    feather: 0,
    expansion: 0,
    opacity: 100,
    ...o,
  });
  const big = blob('big', 0, 26);
  it('add keeps the inside; subtract cuts it; inverted flips; masks move with the layer', () => {
    const add = render([{ ...big, masks: [mask({})] }]);
    expect(alphaAt(add, 32, 32)).toBeGreaterThan(200);
    expect(alphaAt(add, 50, 32)).toBe(0);
    const sub = render([{ ...big, masks: [mask({ mode: 'subtract' })] }]);
    expect(alphaAt(sub, 32, 32)).toBe(0);
    expect(alphaAt(sub, 50, 32)).toBeGreaterThan(200);
    const inv = render([{ ...big, masks: [mask({ inverted: true })] }]);
    expect(alphaAt(inv, 32, 32)).toBe(0);
    expect(alphaAt(inv, 50, 32)).toBeGreaterThan(200);
    const moved = render([{ ...big, matrix: [1, 0, 0, 1, 6, 0], masks: [mask({})] }]);
    expect(alphaAt(moved, 26, 32)).toBe(0); // mask moved right with the layer
    expect(alphaAt(moved, 46, 32)).toBeGreaterThan(200);
  });

  it('feather softens the edge; intersect keeps the overlap', () => {
    const soft = render([{ ...big, masks: [mask({ feather: 12 })] }]);
    const edge = alphaAt(soft, 42, 32);
    expect(edge).toBeGreaterThan(10);
    expect(edge).toBeLessThan(245);
    const both = render([
      {
        ...big,
        masks: [mask({}), mask({ id: 'm2', shape: 'rect', mode: 'intersect', w: 64, h: 10 })],
      },
    ]);
    expect(alphaAt(both, 32, 32)).toBeGreaterThan(200);
    expect(alphaAt(both, 32, 20)).toBe(0);
  });
});

describe('editing masks and mattes (3.6d)', () => {
  it('add / update / animate / remove a mask; set a matte; files keep it all', () => {
    let s = createExplosion();
    const r1 = addMask(s, 'fireball', 'ellipse');
    s = r1.state;
    expect(r1.maskId).toBe('m1');
    s = addMask(s, 'fireball', 'rect').state;
    s = updateMask(s, 'fireball', 'm2', { mode: 'subtract', inverted: true });
    // keyframe the first mask's feather
    s = updateLayer(s, 'fireball', {
      keys: { 'mask.m1.feather': setKey(setKey([], 0, 0), 1, 40) },
    });
    const half = layerAt(
      s.layers.find((l) => l.id === 'fireball'),
      0.5,
    );
    expect(half.masks[0].feather).toBeGreaterThan(0);
    s = applyValues(s, 'fireball', { 'mask.m2.w': 77 }, 0);
    expect(s.layers.find((l) => l.id === 'fireball').masks[1].w).toBe(77);
    // matte: picking a source hides it
    s = setMatte(s, 'fireball', 'smoke', 'luma');
    expect(s.layers.find((l) => l.id === 'smoke').enabled).toBe(false);
    expect(matteCandidates(s, 'fireball').some((l) => l.id === 'fireball')).toBe(false);
    // save / open
    const file = JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 1 })));
    const back = parseExplosion(file);
    expect(back.warnings).toEqual([]);
    expect(back.state).toEqual(s);
    expect(buildExplosion(back.state).effect.layers.find((l) => l.id === 'fireball').matte).toEqual(
      { source: 'smoke', mode: 'luma' },
    );
    // removing the matte layer clears the matte; removing a mask drops its keys
    let t = removeLayer(s, 'smoke');
    expect(t.layers.find((l) => l.id === 'fireball').matte).toBeNull();
    t = removeMask(t, 'fireball', 'm1');
    expect(t.layers.find((l) => l.id === 'fireball').keys['mask.m1.feather']).toBeUndefined();
    // a file pointing at a missing matte is fixed with a warning
    file.layers.find((l) => l.id === 'fireball').matte.source = 'nope';
    expect(parseExplosion(file).warnings.join()).toMatch(/track matte "nope" not found/);
    expect(addLayer(s, 'blob').state.layers.at(-1).masks).toEqual([]);
  });
});

describe('adjustment layer limited by a mask (3.6d)', () => {
  it('a Gradient Map with a mask recolours only inside it', () => {
    const big = blob('big', 0, 26);
    const g = {
      id: 'g',
      type: 'gradientMap',
      params: {
        ...getDefaults(LAYER_TYPES.gradientMap.schema),
        'gmap.ramp': [
          { pos: 0, color: '#00ff00' },
          { pos: 1, color: '#00ff00' },
        ],
      },
      masks: [
        {
          id: 'm1',
          name: 'Mask 1',
          enabled: true,
          shape: 'rect',
          mode: 'add',
          inverted: false,
          x: 0,
          y: 0,
          w: 20,
          h: 64,
          rotation: 0,
          feather: 0,
          expansion: 0,
          opacity: 100,
        },
      ],
    };
    const plain = render([big]);
    const d = render([big, g]);
    const px = (a, x) => [...a.slice((32 * W + x) * 4, (32 * W + x) * 4 + 4)];
    expect(px(d, 32)).toEqual([0, 255, 0, px(plain, 32)[3]]);
    expect(px(d, 50)).toEqual(px(plain, 50));
  });
});
