// Viewport painting on real pixels (Node canvas): background, crisp zoom, overlays.
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { isLightColor, paintViewport } from '../../src/ui/viewportPaint.js';

const makeCanvas = (w, h) => createCanvas(w, h);
const px = (ctx, x, y) => [...ctx.getImageData(x, y, 1, 1).data];

/** 4×4 frame: left half red, right half blue, top-left pixel transparent. */
function tinyFrame() {
  const c = createCanvas(4, 4);
  const g = c.getContext('2d');
  g.fillStyle = '#ff0000';
  g.fillRect(0, 0, 2, 4);
  g.fillStyle = '#0000ff';
  g.fillRect(2, 0, 2, 4);
  g.clearRect(0, 0, 1, 1);
  return { canvas: c };
}

function paint({
  dpr = 1,
  zoom = 10,
  background = '#16161a',
  show = {},
  viewW = 100,
  viewH = 100,
} = {}) {
  const canvas = createCanvas(viewW * dpr, viewH * dpr);
  const ctx = canvas.getContext('2d');
  paintViewport(ctx, {
    dpr,
    view: { frameW: 4, frameH: 4, viewW, viewH, zoom, panX: 0, panY: 0 },
    surface: tinyFrame(),
    background,
    pivot: { x: 0.5, y: 0.5 },
    show: { bounds: false, pivot: false, stats: false, ...show },
    statsText: 'stats',
    makeCanvas,
  });
  return ctx;
}

describe('paintViewport', () => {
  it('draws the background and the frame centred, with transparency showing the background', () => {
    const ctx = paint(); // frame is 40×40 at (30,30)
    expect(px(ctx, 2, 2)).toEqual([0x16, 0x16, 0x1a, 255]);
    expect(px(ctx, 35, 35)).toEqual([0x16, 0x16, 0x1a, 255]); // transparent frame pixel
    expect(px(ctx, 35, 50)).toEqual([255, 0, 0, 255]);
    expect(px(ctx, 65, 50)).toEqual([0, 0, 255, 255]);
  });

  it('zoomed in, pixels stay hard-edged (no blur across the red/blue edge)', () => {
    const ctx = paint();
    expect(px(ctx, 49, 50)).toEqual([255, 0, 0, 255]);
    expect(px(ctx, 50, 50)).toEqual([0, 0, 255, 255]);
  });

  it('works at Retina density (dpr 2)', () => {
    const ctx = paint({ dpr: 2 });
    expect(px(ctx, 99, 100)).toEqual([255, 0, 0, 255]);
    expect(px(ctx, 100, 100)).toEqual([0, 0, 255, 255]);
  });

  it('checker background when no colour is set', () => {
    const ctx = paint({ background: null });
    const a = px(ctx, 2, 2);
    const b = px(ctx, 10, 2);
    expect(a).not.toEqual(b);
    expect(a[3]).toBe(255);
  });

  it('pivot crosshair is drawn at the pivot', () => {
    const ctx = paint({ show: { pivot: true } });
    const [r, g, b] = px(ctx, 50, 42); // on the vertical arm, above the centre
    expect([r, g, b]).toEqual([0xff, 0x8a, 0x3d]);
  });

  it('isLightColor', () => {
    expect(isLightColor('#e8e8ec')).toBe(true);
    expect(isLightColor('#16161a')).toBe(false);
    expect(isLightColor(null)).toBe(false);
  });
});
