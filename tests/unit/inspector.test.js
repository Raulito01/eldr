// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getDefaults } from '../../src/schema/index.js';
import { buildInspector } from '../../src/ui/inspector.js';
import { demoSchema } from '../../test-pages/inspector-schema.js';

function setup() {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  const changes = [];
  const values = getDefaults(demoSchema);
  const inspector = buildInspector(container, demoSchema, values, {
    onChange: (id, value) => changes.push([id, value]),
  });
  const row = (label) =>
    [...container.querySelectorAll('.insp-row')].find(
      (r) => r.querySelector('.insp-label').textContent === label,
    );
  return { container, changes, inspector, row };
}

describe('buildInspector', () => {
  it('creates one row per parameter, grouped in schema order', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.insp-row').length).toBe(demoSchema.length);
    const groups = [...container.querySelectorAll('.insp-group-title')].map((g) => g.textContent);
    expect(groups).toEqual(['Shape', 'Style', 'Motion', 'Variation']);
  });

  it('emits validated values: out-of-range numbers are clamped', () => {
    const { changes, row } = setup();
    const box = row('Size').querySelector('input[type=number]');
    box.value = '50';
    box.dispatchEvent(new Event('change'));
    expect(changes.at(-1)).toEqual(['demo.size', 2]);
    expect(row('Size').classList.contains('changed')).toBe(true);
  });

  it('reset button returns a parameter to its default', () => {
    const { changes, row } = setup();
    const select = row('Shape').querySelector('select');
    select.value = 'star';
    select.dispatchEvent(new Event('change'));
    expect(changes.at(-1)).toEqual(['demo.shape', 'star']);
    row('Shape').querySelector('.insp-reset').click();
    expect(changes.at(-1)).toEqual(['demo.shape', 'circle']);
    expect(row('Shape').classList.contains('changed')).toBe(false);
  });

  it('toggle and colour widgets emit valid values', () => {
    const { changes, row } = setup();
    const toggle = row('Outline').querySelector('input[type=checkbox]');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(changes.at(-1)).toEqual(['demo.outline', false]);

    const hex = row('Fill colour').querySelector('input[type=text]');
    hex.value = '#ABC';
    hex.dispatchEvent(new Event('change'));
    expect(changes.at(-1)).toEqual(['demo.color', '#aabbcc']);
    hex.value = 'not a colour';
    hex.dispatchEvent(new Event('change'));
    expect(changes.at(-1)).toEqual(['demo.color', '#ff8a3d']);
  });

  it('setValues updates the controls from outside', () => {
    const { inspector, row } = setup();
    inspector.setValues({ ...getDefaults(demoSchema), 'demo.count': 13 });
    expect(row('Count').querySelector('[role=slider]').getAttribute('aria-valuenow')).toBe('13');
    expect(row('Count').classList.contains('changed')).toBe(true);
  });
});

describe('wide editors', async () => {
  const { LAYER_TYPES } = await import('../../src/effects/layerTypes.js');
  it('ramp and curve editors get a full-width row', () => {
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const schema = LAYER_TYPES.blob.schema;
    buildInspector(container, schema, getDefaults(schema), { onChange() {} });
    const wideLabels = [...container.querySelectorAll('.insp-row.wide .insp-label')].map(
      (l) => l.textContent,
    );
    expect(wideLabels).toEqual([
      'Colour ramp',
      'Ramp over life',
      'Dissolve over time',
      'Scale over life',
      'Opacity over life',
    ]);
  });
});

describe('ramp preset menu', async () => {
  const { RAMP_PRESETS } = await import('../../src/render/rampPresets.js');
  const { LAYER_TYPES } = await import('../../src/effects/layerTypes.js');
  it('applies a preset ramp in one step (e.g. smoke on a fire puff)', () => {
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const changes = [];
    const schema = LAYER_TYPES.puffBurst.schema;
    buildInspector(container, schema, getDefaults(schema), {
      onChange: (id, value) => changes.push([id, value]),
    });
    const select = container.querySelector('.w-ramp-presets');
    select.value = 'smoke';
    select.dispatchEvent(new Event('change'));
    expect(changes.at(-1)[0]).toBe('style.ramp');
    expect(changes.at(-1)[1]).toEqual(RAMP_PRESETS.smoke.stops);
    expect(select.value).toBe('');
  });
});
