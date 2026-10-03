import { describe, expect, it } from 'vitest';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import {
  buildPack,
  cleanName,
  familiesOf,
  freeKey,
  moveKeyPlan,
  readPack,
  renameFamilyPlan,
} from '../../src/project/familyPack.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';

const keys = ['Loose', 'Dark/Orb v1', 'Dark/Orb v2', 'Hits/Pop', 'Hits/Orb v1'];

describe('families (D-118)', () => {
  it('groups keys by family, no family first', () => {
    expect(familiesOf(keys)).toEqual([
      { family: '', keys: ['Loose'] },
      { family: 'Dark', keys: ['Dark/Orb v1', 'Dark/Orb v2'] },
      { family: 'Hits', keys: ['Hits/Orb v1', 'Hits/Pop'] },
    ]);
  });

  it('renaming a family keeps the names and numbers clashes', () => {
    expect(renameFamilyPlan(keys, 'Dark', 'Hits')).toEqual([
      ['Dark/Orb v1', 'Hits/Orb v1 2'],
      ['Dark/Orb v2', 'Hits/Orb v2'],
    ]);
    expect(renameFamilyPlan(keys, 'Dark', ' Void / Magic ')).toEqual([
      ['Dark/Orb v1', 'Void - Magic/Orb v1'],
      ['Dark/Orb v2', 'Void - Magic/Orb v2'],
    ]);
    expect(renameFamilyPlan(keys, 'Dark', 'Dark')).toEqual([]);
  });

  it('moving a preset: new family, no family, or nothing to do', () => {
    expect(moveKeyPlan(keys, 'Loose', 'Hits')).toBe('Hits/Loose');
    expect(moveKeyPlan(keys, 'Hits/Pop', '')).toBe('Pop');
    expect(moveKeyPlan(keys, 'Dark/Orb v1', 'Hits')).toBe('Hits/Orb v1 2');
    expect(moveKeyPlan(keys, 'Hits/Pop', 'Hits')).toBe('Hits/Pop');
  });

  it('free keys and clean names', () => {
    expect(freeKey('Hits', 'Pop', new Set(keys))).toBe('Hits/Pop 2');
    expect(cleanName('  a/b\\c  ')).toBe('a-b-c');
  });
});

describe('.eldrpack (D-118)', () => {
  const file = serializeExplosion(createExplosionFromPreset('smallHit'), { seed: 7, name: 'Hit' });

  it('round-trips a family: names, files and thumbnails', () => {
    const thumb = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const bytes = buildPack({
      family: 'Dark Magic',
      presets: [
        { name: 'Hit', file, thumb },
        { name: 'Hit', file }, // same name twice: both kept
        { name: 'Odd: name?', file },
      ],
    });
    const r = readPack(bytes);
    expect(r.error).toBeUndefined();
    expect(r.warnings).toEqual([]);
    expect(r.family).toBe('Dark Magic');
    expect(r.presets.map((p) => p.name)).toEqual(['Hit', 'Hit', 'Odd: name?']);
    expect(r.presets[0].thumb).toEqual(thumb);
    expect(r.presets[1].thumb).toBeUndefined();
    // every preset loads like a saved file
    for (const p of r.presets) expect(parseExplosion(p.file).state).toBeTruthy();
  });

  it('bad files give an error, never throw', () => {
    expect(readPack(new Uint8Array([1, 2, 3])).error).toMatch(/not a zip/);
    const notPack = buildPack({ family: 'x', presets: [] });
    expect(readPack(notPack).error).toBeUndefined();
  });
});
