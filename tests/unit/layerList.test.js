// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createLayerList, dropIndex } from '../../src/ui/layerList.js';

describe('layer panel', () => {
  const layers = [
    { id: 'a', label: 'Bottom', enabled: true, blend: 'normal' },
    { id: 'm', label: 'Middle', enabled: true, solo: true, blend: 'multiply' },
    { id: 'b', label: 'Top', enabled: false, blend: 'add' },
  ];
  function setup(selected = 'm') {
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const log = [];
    const list = createLayerList(container, {
      layers,
      selected,
      types: { blob: 'Blob', ring: 'Ring' },
      onSelect: (id) => log.push(['select', id]),
      onToggle: (id, on) => log.push(['toggle', id, on]),
      onSolo: (id, on) => log.push(['solo', id, on]),
      onRename: (id, label) => log.push(['rename', id, label]),
      onMove: (id, to) => log.push(['move', id, to]),
      onAdd: (type) => log.push(['add', type]),
      onDuplicate: (id) => log.push(['dup', id]),
      onDelete: (id) => log.push(['delete', id]),
    });
    return { container, log, list };
  }
  const rowOf = (c, id) => c.querySelector(`[data-id="${id}"]`);
  const tool = (c, title) => c.querySelector(`button[title="${title}"]`);

  it('lists layers top of the stack first; marks selection, hidden, solo and blend', () => {
    const { container } = setup();
    const rows = [...container.querySelectorAll('.ll-row')];
    expect(rows.map((r) => r.querySelector('.ll-name').textContent)).toEqual([
      'Top',
      'Middle',
      'Bottom',
    ]);
    expect(rows[1].classList.contains('selected')).toBe(true);
    expect(rows[0].classList.contains('hidden')).toBe(true);
    expect(rows[1].querySelector('.ll-solo').classList.contains('on')).toBe(true);
    expect(rows[1].querySelector('.ll-tag').textContent).toBe('Multiply');
    expect(rows[2].querySelector('.ll-tag').textContent).toBe('');
  });

  it('reports select, visibility and solo', () => {
    const { container, log } = setup();
    const top = rowOf(container, 'b');
    top.click();
    const toggle = top.querySelector('input[type=checkbox]');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    top.querySelector('.ll-solo').click();
    expect(log).toEqual([
      ['select', 'b'],
      ['toggle', 'b', true],
      ['solo', 'b', true],
    ]);
  });

  it('toolbar: add, move up/down (stack index), duplicate, delete act on the selection', () => {
    const { container, log } = setup('m');
    const add = container.querySelector('.ll-add');
    add.value = 'ring';
    add.dispatchEvent(new Event('change'));
    expect(add.value).toBe('');
    tool(container, 'Move up').click();
    tool(container, 'Move down').click();
    tool(container, 'Duplicate').click();
    tool(container, 'Delete').click();
    expect(log).toEqual([
      ['add', 'ring'],
      ['move', 'm', 2],
      ['move', 'm', 0],
      ['dup', 'm'],
      ['delete', 'm'],
    ]);
  });

  it('rename: double-click or ✎, Enter commits, Escape cancels, unchanged is ignored', async () => {
    const { container, log } = setup('a');
    rowOf(container, 'm').querySelector('.ll-name').dispatchEvent(new Event('dblclick'));
    let input = container.querySelector('.ll-rename');
    input.value = '  Glow core ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    tool(container, 'Rename').click();
    input = container.querySelector('.ll-rename');
    input.value = 'Nope';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    tool(container, 'Rename').click();
    container
      .querySelector('.ll-rename')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(log).toEqual([['rename', 'm', 'Glow core']]);
    expect(container.querySelector('.ll-rename')).toBeNull();
  });

  it('drop gap → stack index (display is reversed, dragged row not counted)', () => {
    // 3 layers; gap 0 = above the top row → top of the stack.
    expect(dropIndex(3, 0)).toBe(2);
    expect(dropIndex(3, 1)).toBe(1);
    expect(dropIndex(3, 2)).toBe(0);
  });
});
