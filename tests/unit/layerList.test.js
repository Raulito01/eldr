// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createLayerList } from '../../src/ui/layerList.js';

describe('createLayerList', () => {
  const layers = [
    { id: 'a', label: 'Bottom', enabled: true, blend: 'normal' },
    { id: 'b', label: 'Top', enabled: false, blend: 'add' },
  ];
  function setup() {
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const log = [];
    const list = createLayerList(container, {
      layers,
      selected: 'a',
      onSelect: (id) => log.push(['select', id]),
      onToggle: (id, on) => log.push(['toggle', id, on]),
      onBlend: (id, blend) => log.push(['blend', id, blend]),
    });
    return { container, log, list };
  }

  it('lists layers top of the stack first, marks selection and hidden layers', () => {
    const { container } = setup();
    const rows = [...container.querySelectorAll('.ll-row')];
    expect(rows.map((r) => r.querySelector('.ll-name').textContent)).toEqual(['Top', 'Bottom']);
    expect(rows[1].classList.contains('selected')).toBe(true);
    expect(rows[0].classList.contains('hidden')).toBe(true);
  });

  it('reports selection, visibility and blend changes', () => {
    const { container, log } = setup();
    const top = container.querySelector('[data-id="b"]');
    top.click();
    const toggle = top.querySelector('input[type=checkbox]');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    const blend = top.querySelector('select');
    blend.value = 'screen';
    blend.dispatchEvent(new Event('change'));
    expect(log).toEqual([
      ['select', 'b'],
      ['toggle', 'b', true],
      ['blend', 'b', 'screen'],
    ]);
  });
});
