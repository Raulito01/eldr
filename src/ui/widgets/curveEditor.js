// @ts-check
/**
 * Curve editor widget: drag points (press near a point to grab it), double-click/tap empty
 * space to add a point, double-click/tap a point — or right-click / pen side button — to remove
 * it. The first/last points stay at the start/end of life. Works with mouse, trackpad and pen
 * (see ../pointer.js): taps don't nudge points, grabbed points keep their offset.
 */

import { evalCurve } from '../../core/curve.js';
import { attachPointer, attachSecondaryClick } from '../pointer.js';
import { addPoint, movePoint, nearestIndex, removePoint } from './curveOps.js';

const NS = 'http://www.w3.org/2000/svg';
/** Default height in px; the editor uses its real on-screen height when it differs. */
export const CURVE_EDITOR_HEIGHT = 96; // keep equal to .w-curve-edit height in inspector.css
const PAD = 14; // room around the graph so edge points are never clipped
const GRAB = 14; // px: how close a click must be to grab a point

/**
 * @param {import('../../schema/schema.js').ParamDef} def
 * @param {{x:number,y:number}[]} value
 * @param {(value: any) => void} emit
 */
export function createCurveEditor(def, value, emit) {
  const yMin = def.yMin ?? 0;
  const yMax = def.yMax ?? 1;
  let pts = value;
  let dragging = -1;
  let hover = -1;

  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('w-curve', 'w-curve-edit');
  svg.setAttribute('height', String(CURVE_EDITOR_HEIGHT));
  const width = () => Math.max(80, svg.clientWidth || 220);
  // Always draw and hit-test in the box's REAL size (a CSS height change once squeezed the
  // graph and pushed points outside the visible box).
  const height = () => svg.clientHeight || CURVE_EDITOR_HEIGHT;

  const toX = (/** @type {number} */ x) => PAD + x * (width() - 2 * PAD);
  const toY = (/** @type {number} */ y) =>
    height() - PAD - ((y - yMin) / (yMax - yMin)) * (height() - 2 * PAD);
  const local = (/** @type {MouseEvent} */ e) => {
    const r = svg.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top, w: r.width };
  };
  const toValue = (/** @type {{sx:number, sy:number, w:number}} */ l) => ({
    x: (l.sx - PAD) / Math.max(1, l.w - 2 * PAD),
    y: yMin + ((height() - PAD - l.sy) / (height() - 2 * PAD)) * (yMax - yMin),
  });
  const screenPts = () => pts.map((p) => ({ x: toX(p.x), y: toY(p.y) }));

  function render() {
    const w = width();
    const parts = [
      `<rect class="w-curve-area" x="${PAD}" y="${PAD}" width="${w - 2 * PAD}" height="${height() - 2 * PAD}"/>`,
    ];
    for (const ref of [0, 1]) {
      if (ref >= yMin && ref <= yMax) {
        parts.push(
          `<line class="w-curve-ref" x1="${PAD}" x2="${w - PAD}" y1="${toY(ref)}" y2="${toY(ref)}"/>`,
        );
      }
    }
    const line = Array.from({ length: 65 }, (_, i) => {
      const x = i / 64;
      return `${toX(x).toFixed(2)},${toY(evalCurve(pts, x)).toFixed(2)}`;
    }).join(' ');
    parts.push(`<polyline points="${line}"/>`);
    pts.forEach((p, i) => {
      const cls = `w-curve-pt${i === dragging || i === hover ? ' active' : ''}`;
      parts.push(`<circle class="${cls}" cx="${toX(p.x)}" cy="${toY(p.y)}" r="6"/>`);
    });
    svg.innerHTML = parts.join('');
  }

  const grab = (/** @type {MouseEvent} */ e) => {
    const { sx, sy } = local(e);
    return nearestIndex(screenPts(), sx, sy, GRAB);
  };

  /** Offset (value units) between the pointer and the grabbed point, so it doesn't jump. */
  let grabOffset = { x: 0, y: 0 };
  /** Point pressed but not yet dragged (taps never move it). */
  let pressed = -1;

  attachPointer(svg, {
    down(e) {
      pressed = grab(e);
      if (pressed >= 0) {
        const v = toValue(local(e));
        grabOffset = { x: pts[pressed].x - v.x, y: pts[pressed].y - v.y };
      }
      return true; // empty-space presses still count, for double-tap to add
    },
    start() {
      dragging = pressed;
      render();
    },
    move(e) {
      if (dragging < 0) return;
      const v = toValue(local(e));
      pts = movePoint(pts, dragging, v.x + grabOffset.x, v.y + grabOffset.y, yMin, yMax);
      render();
      emit(pts);
    },
    up() {
      pressed = -1;
      if (dragging < 0) return;
      dragging = -1;
      render();
    },
    tap(e, isDouble) {
      if (!isDouble) return;
      const i = grab(e);
      if (i >= 0) pts = removePoint(pts, i);
      else {
        const { x, y } = toValue(local(e));
        pts = addPoint(pts, x, y, yMin, yMax).points;
      }
      render();
      emit(pts);
    },
  });

  // Right-click or pen side button on a point removes it.
  attachSecondaryClick(svg, (e) => {
    const i = grab(e);
    if (i < 0) return;
    const next = removePoint(pts, i);
    if (next === pts) return;
    pts = next;
    render();
    emit(pts);
  });

  // Hover highlight (pen hover works too): shows which point a press would grab.
  svg.addEventListener('pointermove', (e) => {
    if (dragging >= 0) return;
    const h = grab(e);
    if (h !== hover) {
      hover = h;
      svg.style.cursor = h >= 0 ? 'grab' : 'crosshair';
      render();
    }
  });
  svg.addEventListener('pointerleave', () => {
    if (hover >= 0 && dragging < 0) {
      hover = -1;
      render();
    }
  });

  new ResizeObserver(render).observe(svg);
  render();

  return {
    el: /** @type {any} */ (svg),
    set(/** @type {{x:number,y:number}[]} */ v) {
      if (dragging >= 0) return; // don't fight the user's drag
      pts = v;
      render();
    },
  };
}
