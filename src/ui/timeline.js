// @ts-check
/**
 * Timeline: transport (play/pause, step, preview loop), frame scrubber grouped by holds,
 * phase bands, and timing controls (fps, holds, frame count, one-shot/loop).
 *
 * It owns playback and reports changes; the host renders frames:
 *   onFrame(frame)          the frame to show changed
 *   onTimingChange(timing)  fps / holds / frame count / loop mode changed
 */

import { frameAtTime, frameTime, HOLD_MODES, holdFrames, phasesOf } from '../core/timing.js';
import { createPlayback } from './playback.js';
import { h } from './widgets/widgets.js';

export const FPS_OPTIONS = Object.freeze([12, 15, 24, 30, 60]);
export const FRAME_COUNT_MIN = 1;
/** Up to 25 s at 24 fps — long previews [Raul]. */
export const FRAME_COUNT_MAX = 600;

/**
 * Frame under a horizontal position on the track.
 * @param {number} x px from the track's left edge @param {number} width track width px
 * @param {number} frameCount
 */
export function frameAtX(x, width, frameCount) {
  if (width <= 0) return 0;
  return Math.min(frameCount - 1, Math.max(0, Math.floor((x / width) * frameCount)));
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   timing: import('../core/timing.js').Timing,
 *   frame?: number,
 *   onFrame: (frame: number) => void,
 *   onTimingChange?: (timing: import('../core/timing.js').Timing) => void,
 *   keyboard?: boolean,
 * }} options
 */
export function createTimeline(container, options) {
  let timing = {
    holdMode: /** @type {import('../core/timing.js').HoldMode} */ ('ones'),
    ...options.timing,
  };
  let frame = options.frame ?? 0;
  let repeat = true; // preview loop (looping effects always repeat)

  const playback = createPlayback({
    getTiming: () => timing,
    getFrame: () => frame,
    setFrame: (f) => setFrame(f, { fromPlayback: true }),
    repeat: () => repeat || timing.loop,
    onStateChange: (playing) => {
      playBtn.textContent = playing ? '⏸' : '▶';
      playBtn.title = playing ? 'Pause (Space)' : 'Play (Space)';
    },
  });

  // ---------- controls ----------
  const btn = (
    /** @type {string} */ label,
    /** @type {string} */ title,
    /** @type {() => void} */ onclick,
  ) => h('button', { type: 'button', class: 'tl-btn', title, onclick }, [label]);

  const playBtn = btn('▶', 'Play (Space)', () => playback.toggle());
  const repeatBtn = btn(
    '⟲',
    'Repeat the preview (playback only: the effect stays one-shot)',
    () => {
      repeat = !repeat;
      syncControls();
    },
  );
  // Seam check (D-071): play across the loop point (the last frames flowing into the first).
  const seamBtn = btn('⟲ Seam', 'Check the loop seam: plays the last frames into the first', () => {
    const n = timing.frameCount;
    setFrame(Math.max(0, n - Math.min(8, Math.floor(n / 2))));
    if (!playback.isPlaying()) playback.play();
  });
  const frameLabel = h('span', { class: 'tl-frame-label' });

  const holdButtons = HOLD_MODES.map((mode) =>
    h(
      'button',
      { type: 'button', class: 'tl-seg', onclick: () => updateTiming({ holdMode: mode }) },
      [mode[0].toUpperCase() + mode.slice(1)],
    ),
  );

  const fpsSelect = h(
    'select',
    { class: 'tl-select', title: 'Frames per second' },
    FPS_OPTIONS.map((f) => h('option', { value: String(f) }, [`${f} fps`])),
  );
  fpsSelect.addEventListener('change', () => updateTiming({ fps: Number(fpsSelect.value) }));

  const countInput = h('input', {
    type: 'number',
    class: 'tl-count',
    min: FRAME_COUNT_MIN,
    max: FRAME_COUNT_MAX,
    step: 1,
    title: 'Frame count',
  });
  countInput.addEventListener('change', () => {
    const n = Math.round(Number(countInput.value));
    const frameCount = Number.isFinite(n)
      ? Math.min(FRAME_COUNT_MAX, Math.max(FRAME_COUNT_MIN, n))
      : timing.frameCount;
    updateTiming({ frameCount });
  });

  // Animation length (D-050): the effect's speed is set in seconds, so changing frames or fps
  // adds/removes time or sampling, never slow motion.
  const lengthInput = h('input', {
    type: 'number',
    class: 'tl-count tl-length',
    min: 0.05,
    max: 60,
    step: 0.05,
    title:
      'Animation length in seconds. Frames and fps never change its speed: more frames = more time after it.',
  });
  lengthInput.addEventListener('change', () => {
    const v = Number(lengthInput.value);
    if (Number.isFinite(v) && v > 0) updateTiming({ duration: Math.min(60, Math.max(0.05, v)) });
    else syncControls();
  });
  const lengthGroup = h('span', { class: 'tl-length-group' }, [
    h('span', { class: 'tl-caption' }, ['anim']),
    lengthInput,
    h('span', { class: 'tl-caption' }, ['s']),
  ]);

  // One-shot vs seamless loop: the effect's own type (not the preview repeat ⟲).
  const modeButtons = /** @type {const} */ ([
    ['oneShot', '▸ One-shot', 'One-shot: plays once (explosions, hits, strikes)'],
    [
      'loop',
      '∞ Seamless loop',
      'Seamless loop: the last frame flows into the first (backgrounds, auras, idle FX). Particles, orbits, bolts and noise repeat exactly; a whole-loop layer keeps its life over the loop.',
    ],
  ]).map(([value, label, title]) =>
    h(
      'button',
      {
        type: 'button',
        class: 'tl-seg',
        'data-mode': value,
        title,
        onclick: () => updateTiming({ loop: value === 'loop' }),
      },
      [label],
    ),
  );

  const controls = h('div', { class: 'tl-controls' }, [
    h('span', { class: 'tl-group' }, [
      btn('⏮', 'First frame (Home)', () => setFrame(0)),
      btn('◀', 'Previous frame (←)', () => step(-1)),
      playBtn,
      btn('▶|', 'Next frame (→)', () => step(1)),
      repeatBtn,
      frameLabel,
    ]),
    h('span', { class: 'tl-group tl-holds', title: 'A new drawing every 1, 2 or 3 frames' }, [
      h('span', { class: 'tl-caption' }, ['Holds']),
      ...holdButtons,
    ]),
    h('span', { class: 'tl-group tl-holds tl-mode' }, [...modeButtons, seamBtn]),
    h('span', { class: 'tl-group' }, [
      fpsSelect,
      countInput,
      h('span', { class: 'tl-caption' }, ['frames']),
      lengthGroup,
    ]),
  ]);

  // ---------- track ----------
  const phaseBar = h('div', { class: 'tl-phases' });
  const cells = h('div', { class: 'tl-cells' });
  const track = h('div', { class: 'tl-track' }, [phaseBar, cells]);
  const root = h('div', { class: 'tl' }, [controls, track]);
  container.replaceChildren(root);

  /** @type {{ startX: number } | null} */
  let scrubbing = null;
  const scrubTo = (/** @type {PointerEvent} */ e) => {
    const rect = cells.getBoundingClientRect();
    setFrame(frameAtX(e.clientX - rect.left, rect.width, timing.frameCount));
  };
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // pen tip / left button only
    playback.stop();
    scrubbing = { startX: e.clientX };
    track.setPointerCapture(e.pointerId);
    scrubTo(e);
  });
  track.addEventListener('pointermove', (e) => {
    if (scrubbing) scrubTo(e);
  });
  const endScrub = () => {
    scrubbing = null;
  };
  track.addEventListener('pointerup', endScrub);
  track.addEventListener('pointercancel', endScrub);

  function buildTrack() {
    const n = timing.frameCount;
    const hold = holdFrames(timing);
    cells.replaceChildren(
      ...Array.from({ length: n }, (_, i) =>
        h('div', {
          class: `tl-cell${i % hold === 0 ? ' hold-start' : ''}`,
          title: `Frame ${i + 1}`,
        }),
      ),
    );
    const { impact, decay } = phasesOf(timing);
    const pct = (/** @type {number} */ f) => `${(f / n) * 100}%`;
    const fi = frameAtTime(timing, impact);
    const fd = frameAtTime(timing, decay);
    const seg = (
      /** @type {string} */ name,
      /** @type {number} */ from,
      /** @type {number} */ to,
    ) =>
      h(
        'div',
        {
          class: `tl-phase tl-phase-${name}`,
          style: `left:${pct(from)};width:${pct(to - from)}`,
          title: name,
        },
        [to - from >= 2 ? name : ''],
      );
    phaseBar.replaceChildren(
      seg('anticipation', 0, fi),
      seg('action', fi, fd),
      seg('decay', fd, n),
      h('div', { class: 'tl-impact', style: `left:${pct(fi)}`, title: `Impact (frame ${fi + 1})` }),
    );
  }

  function syncCells() {
    const { drawFrame } = frameTime(timing, frame);
    const hold = holdFrames(timing);
    cells.childNodes.forEach((node, i) => {
      const cell = /** @type {HTMLElement} */ (node);
      cell.classList.toggle('current', i === frame);
      cell.classList.toggle('same-drawing', i !== frame && i >= drawFrame && i < drawFrame + hold);
    });
    frameLabel.textContent = `${frame + 1} / ${timing.frameCount}`;
  }

  function syncControls() {
    for (const [i, b] of holdButtons.entries())
      b.classList.toggle('active', HOLD_MODES[i] === (timing.holdMode ?? 'ones'));
    fpsSelect.value = String(timing.fps);
    if (!FPS_OPTIONS.includes(timing.fps)) fpsSelect.value = '';
    if (document.activeElement !== countInput) countInput.value = String(timing.frameCount);
    for (const b of modeButtons)
      b.classList.toggle('active', (b.dataset.mode === 'loop') === !!timing.loop);
    lengthGroup.hidden = timing.loop || !timing.duration;
    if (document.activeElement !== lengthInput) {
      lengthInput.value = timing.duration ? String(Math.round(timing.duration * 1000) / 1000) : '';
    }
    seamBtn.hidden = !timing.loop;
    repeatBtn.classList.toggle('active', repeat || timing.loop);
    repeatBtn.disabled = timing.loop;
    repeatBtn.title = timing.loop
      ? 'Seamless loops always repeat'
      : 'Repeat the preview (playback only: the effect stays one-shot)';
  }

  /** @param {number} f @param {{ fromPlayback?: boolean }} [opts] */
  function setFrame(f, opts = {}) {
    const clamped = Math.min(timing.frameCount - 1, Math.max(0, Math.trunc(f)));
    const changed = clamped !== frame;
    frame = clamped;
    if (!opts.fromPlayback) playback.resync(); // keep playing from the new position
    syncCells();
    if (changed) options.onFrame(frame);
  }

  /** @param {number} dir */
  function step(dir) {
    playback.stop();
    const n = timing.frameCount;
    setFrame((frame + dir + n) % n);
  }

  /** @param {Partial<import('../core/timing.js').Timing>} patch */
  function updateTiming(patch) {
    timing = { ...timing, ...patch };
    if (frame > timing.frameCount - 1) frame = timing.frameCount - 1;
    buildTrack();
    syncControls();
    syncCells();
    playback.resync();
    options.onTimingChange?.(timing);
    options.onFrame(frame);
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target?.closest?.('input, select, textarea')) return;
    if (e.key === ' ') {
      e.preventDefault();
      playback.toggle();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'Home') {
      setFrame(0);
    }
  }
  if (options.keyboard) document.addEventListener('keydown', onKey);

  buildTrack();
  syncControls();
  syncCells();

  return {
    play: () => playback.play(),
    stop: () => playback.stop(),
    isPlaying: () => playback.isPlaying(),
    getFrame: () => frame,
    getTiming: () => timing,
    /** Mark cached frames (RAM preview, D-077): a green bar under them. @param {Set<number>} set */
    setCached(set) {
      cells.childNodes.forEach((node, i) => {
        /** @type {HTMLElement} */ (node).classList.toggle('cached', set.has(i));
      });
    },
    setFrame: (/** @type {number} */ f) => setFrame(f),
    /** Replace timing from outside (e.g. loading a project). */
    setTiming(/** @type {import('../core/timing.js').Timing} */ next) {
      timing = { holdMode: 'ones', ...next };
      if (frame > timing.frameCount - 1) frame = timing.frameCount - 1;
      buildTrack();
      syncControls();
      syncCells();
      playback.resync();
    },
    destroy() {
      playback.stop();
      document.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
