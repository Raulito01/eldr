import { describe, expect, it } from 'vitest';
import { createExplosion } from '../../src/effects/explosion/explosion.js';
import { addLayer, setParent } from '../../src/effects/layerStack.js';
import { sanitizeParams } from '../../src/schema/index.js';
import {
  transformPatch,
  transformSchema,
  transformValues,
} from '../../src/ui/editor/transformPanel.js';

describe('transform panel (3.6b)', () => {
  it('parent menu lists None + possible parents, never the layer itself or its children', () => {
    let s = addLayer(createExplosion(), 'null').state;
    s = setParent(s, 'core', 'null');
    const opts = (id) =>
      transformSchema(s, id)
        .find((d) => d.id === 'transform.parent')
        .options.map((o) => o.value);
    expect(opts('null')).not.toContain('null');
    expect(opts('null')).not.toContain('core'); // core is its child
    expect(opts('core')).toContain('null');
    expect(opts('core')[0]).toBe('');
  });

  it('values are valid for the schema; linked scale keeps the X : Y ratio', () => {
    const s = createExplosion();
    const l = s.layers[0];
    expect(sanitizeParams(transformSchema(s, l.id), transformValues(l, true)).warnings).toEqual([]);
    const t = { ...l.transform, scaleX: 200, scaleY: 100 };
    expect(transformPatch(t, 'transform.scaleX', 100, true)).toMatchObject({
      scaleX: 100,
      scaleY: 50,
    });
    expect(transformPatch(t, 'transform.scaleY', 50, false)).toMatchObject({
      scaleX: 200,
      scaleY: 50,
    });
    expect(transformPatch(t, 'transform.rotation', 45, true).rotation).toBe(45);
  });
});
