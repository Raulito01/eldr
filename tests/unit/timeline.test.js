// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createTimeline, FRAME_COUNT_MAX, frameAtX } from '../../src/ui/timeline.js';

function setup(timing = { frameCount: 12, fps: 24, loop: false }) {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  const frames = [];
  const timings = [];
  const tl = createTimeline(container, {
    timing,
    onFrame: (f) => frames.push(f),
    onTimingChange: (t) => timings.push(t),
    keyboard: true,
  });
  const button = (text) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === text);
  const cells = () => [...container.querySelectorAll('.tl-cell')];
  return { container, tl, frames, timings, button, cells };
}

describe('frameAtX', () => {
  it('maps track positions to frames and clamps', () => {
    expect(frameAtX(0, 120, 12)).toBe(0);
    expect(frameAtX(59, 120, 12)).toBe(5);
    expect(frameAtX(119.9, 120, 12)).toBe(11);
    expect(frameAtX(500, 120, 12)).toBe(11);
    expect(frameAtX(-5, 120, 12)).toBe(0);
  });
});

describe('createTimeline', () => {
  it('builds one cell per frame and labels the current frame', () => {
    const { cells, container } = setup();
    expect(cells().length).toBe(12);
    expect(cells()[0].classList.contains('current')).toBe(true);
    expect(container.querySelector('.tl-frame-label').textContent).toBe('1 / 12');
  });

  it('step buttons and arrow keys move one frame and wrap', () => {
    const { tl, frames, button } = setup();
    button('▶|').click();
    expect(tl.getFrame()).toBe(1);
    button('◀').click();
    button('◀').click();
    expect(tl.getFrame()).toBe(11);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(tl.getFrame()).toBe(0);
    expect(frames).toEqual([1, 0, 11, 0]);
  });

  it('hold buttons change timing and group the cells', () => {
    const { tl, timings, button, cells } = setup();
    button('Twos').click();
    expect(tl.getTiming().holdMode).toBe('twos');
    expect(timings.at(-1).holdMode).toBe('twos');
    const starts = cells().map((c) => c.classList.contains('hold-start'));
    expect(starts.slice(0, 4)).toEqual([true, false, true, false]);
    tl.setFrame(5); // shares the drawing of frame 4
    expect(cells()[4].classList.contains('same-drawing')).toBe(true);
    expect(cells()[5].classList.contains('current')).toBe(true);
  });

  it('frame count changes are clamped and keep the frame in range', () => {
    const { tl, container } = setup();
    tl.setFrame(11);
    const input = container.querySelector('.tl-count');
    input.value = '6';
    input.dispatchEvent(new Event('change'));
    expect(tl.getTiming().frameCount).toBe(6);
    expect(tl.getFrame()).toBe(5);
    input.value = '9999';
    input.dispatchEvent(new Event('change'));
    expect(tl.getTiming().frameCount).toBe(FRAME_COUNT_MAX);
    // Regression [Raul]: long previews (e.g. 200 frames) must not be cut back.
    input.value = '200';
    input.dispatchEvent(new Event('change'));
    expect(tl.getTiming().frameCount).toBe(200);
    expect(FRAME_COUNT_MAX).toBeGreaterThanOrEqual(600);
  });

  it('shows phase bands and an impact marker', () => {
    const { container } = setup({
      frameCount: 20,
      fps: 24,
      loop: false,
      phases: { impact: 0.25, decay: 0.75 },
    });
    const names = [...container.querySelectorAll('.tl-phase')].map((p) => p.title);
    expect(names).toEqual(['anticipation', 'action', 'decay']);
    expect(container.querySelector('.tl-impact')).not.toBeNull();
  });

  it('loop effects always repeat (preview-loop button disabled)', () => {
    const { container } = setup({ frameCount: 8, fps: 24, loop: true });
    expect(container.querySelector('button[title="Loop effects always repeat"]').disabled).toBe(
      true,
    );
  });
});
