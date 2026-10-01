import { describe, expect, it } from 'vitest';
import { mixRgba, parseHex, toCss, toHex } from '../../src/core/color.js';
import { rampBreakpoints, sampleRamp } from '../../src/render/ramp.js';
import { corePosition } from '../../src/render/style.js';
import { addStop, moveStop, removeStop, setStopColor } from '../../src/ui/widgets/rampOps.js';

const ramp = [
  { pos: 0, color: '#ffffff' },
  { pos: 0.5, color: '#ff0000' },
  { pos: 1, color: '#00000000' },
];

describe('colour', () => {
  it('parses and formats hex (with alpha)', () => {
    expect(parseHex('#ff8000')).toEqual([255, 128, 0, 255]);
    expect(parseHex('#ff800080')).toEqual([255, 128, 0, 128]);
    expect(parseHex('#fff')).toEqual([255, 255, 255, 255]);
    expect(parseHex('nope')).toEqual([255, 0, 255, 255]);
    expect(toHex([255, 128, 0, 255])).toBe('#ff8000');
    expect(toHex([255, 128, 0, 128])).toBe('#ff800080');
    expect(toHex([300, -5, 12.4, 255])).toBe('#ff000c');
    expect(toCss([255, 0, 0, 51])).toBe('rgba(255,0,0,0.2)');
    expect(mixRgba([0, 0, 0, 0], [200, 100, 50, 255], 0.5)).toEqual([100, 50, 25, 127.5]);
  });
});

describe('sampleRamp', () => {
  it('hits stops exactly and interpolates between them', () => {
    expect(sampleRamp(ramp, 0)).toEqual([255, 255, 255, 255]);
    expect(sampleRamp(ramp, 0.5)).toEqual([255, 0, 0, 255]);
    expect(sampleRamp(ramp, 0.25)).toEqual([255, 127.5, 127.5, 255]);
    expect(sampleRamp(ramp, 0.75)).toEqual([127.5, 0, 0, 127.5]); // fades to transparent
  });

  it('clamps outside the stops', () => {
    const inner = [
      { pos: 0.2, color: '#000000' },
      { pos: 0.8, color: '#ffffff' },
    ];
    expect(sampleRamp(inner, 0)).toEqual([0, 0, 0, 255]);
    expect(sampleRamp(inner, 1)).toEqual([255, 255, 255, 255]);
  });

  it('breakpoints include every stop inside a segment', () => {
    expect(rampBreakpoints(ramp, 0.2, 0.9)).toEqual([0.2, 0.5, 0.9]);
    expect(rampBreakpoints(ramp, 0.6, 0.9)).toEqual([0.6, 0.9]);
  });
});

describe('style', () => {
  it('ramp position follows the ramp-over-life curve, clamped to 0–1', () => {
    const s = {
      ramp,
      spread: 0,
      rampOverLife: [
        { x: 0, y: 0.2 },
        { x: 1, y: 1 },
      ],
    };
    expect(corePosition(s, 0)).toBeCloseTo(0.2, 12);
    expect(corePosition(s, 0.5)).toBeCloseTo(0.6, 12);
  });
});

describe('ramp editing', () => {
  it('moving a stop past another keeps the ramp sorted and tracks the selection', () => {
    const { stops, index } = moveStop(ramp, 0, 0.7);
    expect(stops.map((s) => s.pos)).toEqual([0.5, 0.7, 1]);
    expect(index).toBe(1);
    expect(stops[index].color).toBe('#ffffff');
  });

  it('adding a stop takes the colour already at that spot (no visible change)', () => {
    const { stops, index } = addStop(ramp, 0.25);
    expect(index).toBe(1);
    expect(stops[1]).toEqual({ pos: 0.25, color: '#ff8080' });
  });

  it('removing keeps at least two stops; colour edits replace one stop', () => {
    expect(removeStop(ramp, 1).stops).toHaveLength(2);
    const two = removeStop(ramp, 1).stops;
    expect(removeStop(two, 0).stops).toBe(two);
    expect(setStopColor(ramp, 2, '#123456').stops[2].color).toBe('#123456');
  });

  it('never mutates the input; positions are tidied to 0.1%', () => {
    const copy = structuredClone(ramp);
    expect(moveStop(ramp, 1, 0.33333).stops[0].pos).toBe(0); // stop 0 unchanged
    expect(moveStop(ramp, 1, 0.33333).stops[1].pos).toBe(0.333);
    expect(ramp).toEqual(copy);
  });
});
