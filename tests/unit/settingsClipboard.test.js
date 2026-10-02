import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import { buildExplosion, createExplosion } from '../../src/effects/explosion/explosion.js';
import { addLayer, updateLayer } from '../../src/effects/layerStack.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import {
  copyLayerSettings,
  LOOK_GROUP,
  pasteGroups,
  pasteLayerSettings,
} from '../../src/effects/settingsClipboard.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer } from '../../src/render/renderer.js';
import { setTextureCanvasFactory, setTextureFrames } from '../../src/render/textures.js';

setTextureCanvasFactory((w, h) => createCanvas(w, h));
const L = (s, id) => s.layers.find((l) => l.id === id);
const empty = () => ({ ...createExplosion(), layers: [] });
const add = (s, type) => {
  const r = addLayer(s, type);
  return [r.state, r.id];
};

describe('copy / paste layer settings (D-074)', () => {
  it('emitter → emitter of another shape: shared groups go across, the shape stays', () => {
    const [s1, a] = add(empty(), 'sparkEmitter');
    const [s2, b] = add(s1, 'dotEmitter');
    let [s, c] = add(s2, 'dotEmitter');
    s = updateLayer(s, a, {
      blend: 'add',
      params: { ...L(s, a).params, 'emit.rate': 77, 'glow.amount': 1.5, 'streak.length': 99 },
      keys: { 'emit.speed': setKey(setKey([], 0, 10, 'linear'), 1, 500, 'linear') },
    });
    const clip = copyLayerSettings(L(s, a));
    const groups = pasteGroups(clip, ['dotEmitter']).map((g) => g.group);
    expect(groups).toContain('Emitter');
    expect(groups).toContain('Glow');
    expect(groups).toContain(LOOK_GROUP);
    expect(groups).not.toContain('Shape'); // streak params don't exist on dots
    const out = pasteLayerSettings(s, [b, c], clip, ['Emitter', 'Particle motion', LOOK_GROUP]);
    for (const id of [b, c]) {
      expect(L(out, id).params['emit.rate']).toBe(77);
      expect(L(out, id).keys['emit.speed']).toHaveLength(2);
      expect(L(out, id).params['glow.amount']).toBe(L(s, id).params['glow.amount']); // not chosen
      expect(L(out, id).blend).toBe('add');
      expect(L(out, id).params['streak.length']).toBeUndefined();
    }
    // seeds never travel
    expect(pasteGroups(clip, ['sparkEmitter']).flatMap((g) => g.ids)).not.toContain('emit.seed');
  });
});

describe('texture on any sprite layer (D-074)', () => {
  it('a burst draws the imported image instead of its shape; files keep the link', () => {
    setTextureFrames('green', [
      (() => {
        const cv = createCanvas(16, 16);
        const x = cv.getContext('2d');
        x.fillStyle = '#00ff00';
        x.fillRect(0, 0, 16, 16);
        return cv;
      })(),
    ]);
    let [s, id] = add(empty(), 'blobBurst');
    s = updateLayer(s, id, {
      anchor: 'free',
      texture: 'green',
      params: { ...L(s, id).params, 'glow.amount': 0, 'outline.mode': 'off' },
    });
    s = {
      ...s,
      assets: {
        green: { id: 'green', name: 'g', w: 16, h: 16, frames: ['data:image/png;base64,AA=='] },
      },
    };
    const { effect, scale } = buildExplosion(s);
    expect(effect.layers[0].params['tex.asset']).toBe('green');
    const r = createRenderer({
      backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
      layerTypes: LAYER_TYPES,
    });
    const img = r.renderFrameImageData(effect, 1, 4, { width: 256, height: 256, scale });
    let green = 0;
    let other = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 200) continue;
      if (img.data[i + 1] > 200 && img.data[i] < 40) green++;
      else other++;
    }
    expect(green).toBeGreaterThan(200);
    expect(other).toBeLessThan(green / 10);
    const back = parseExplosion(JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 1 }))));
    expect(back.warnings).toEqual([]);
    expect(L(back.state, id).texture).toBe('green');
  });
});
