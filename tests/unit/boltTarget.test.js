import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import { worldMatrices } from '../../src/core/transform2d.js';
import { aimedParams, boltEnds, endForWorld } from '../../src/effects/boltTarget.js';
import { buildExplosion, createExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { addLayer, removeLayer, updateLayer } from '../../src/effects/layerStack.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';

const L = (s, id) => s.layers.find((l) => l.id === id);

function scene() {
  let s = { ...createExplosion(), layers: [] };
  let r = addLayer(s, 'null');
  s = r.state;
  const t = r.id;
  r = addLayer(s, 'bolt');
  s = r.state;
  const b = r.id;
  s = updateLayer(s, t, { transform: { ...L(s, t).transform, x: 120, y: -80 } });
  s = updateLayer(s, b, {
    transform: { ...L(s, b).transform, x: -50, y: 40, rotation: 30, scaleX: 50, scaleY: 50 },
    target: t,
  });
  return { s, t, b };
}

describe('lightning targets (D-072)', () => {
  it('aims the tip at the target, through rotation and scale', () => {
    const { s, b } = scene();
    const worlds = worldMatrices(s.layers);
    const aimed = { ...L(s, b), params: aimedParams(L(s, b), s.layers, worlds) };
    const { end } = boltEnds(aimed, worlds);
    expect(end[0]).toBeCloseTo(120, 6);
    expect(end[1]).toBeCloseTo(-80, 6);
    // endForWorld is the inverse of boltEnds
    const p = endForWorld(L(s, b), worlds, 10, 20);
    const e2 = boltEnds({ ...L(s, b), params: { ...L(s, b).params, ...p } }, worlds).end;
    expect(e2[0]).toBeCloseTo(10, 6);
    expect(e2[1]).toBeCloseTo(20, 6);
  });

  it('follows an animated target in the build', () => {
    let { s, t, b } = scene();
    s = updateLayer(s, t, {
      keys: { 'transform.x': setKey(setKey([], 0, 0, 'linear'), 1, 200, 'linear') },
    });
    const at = (sec) =>
      buildExplosion(s)
        .effect.at({ seconds: sec })
        .layers.find((l) => l.id === b);
    expect(at(0).params['bolt.endX']).not.toBeCloseTo(at(1).params['bolt.endX'], 1);
  });

  it('saves the link; a missing or deleted target is dropped', () => {
    const { s, t, b } = scene();
    const file = JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 1 })));
    const back = parseExplosion(file);
    expect(back.warnings).toEqual([]);
    expect(L(back.state, b).target).toBe(t);
    file.layers.find((l) => l.id === b).target = 'nope';
    expect(parseExplosion(file).warnings.join()).toMatch(/lightning target "nope" not found/);
    expect(L(removeLayer(s, t), b).target).toBeUndefined();
  });

  it('presets: Chain Arc ends on Point B, Lightning Strike on the Ground', () => {
    const arc = createExplosionFromPreset('chainArc');
    const b = arc.layers.find((l) => l.label === 'Point B');
    expect(arc.layers.filter((l) => l.type === 'bolt').every((l) => l.target === b.id)).toBe(true);
    const strike = createExplosionFromPreset('lightningStrike');
    const g = strike.layers.find((l) => l.label === 'Ground');
    expect(strike.layers.find((l) => l.label === 'Strike').target).toBe(g.id);
  });
});
