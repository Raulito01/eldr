// @ts-check
/**
 * Curve editor widget: drag points, double-click empty space to add a point, double-click an
 * inner point to remove it. The first/last points stay at the start/end of life.
 */

import { evalCurve } from '../../core/curve.js';
import { addPoint, movePoint, removePoint } from './curveOps.js';

const NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 84;
const PAD = 7;

/**
 * @param {import('../../schema/schema.js').ParamDef} def
 * @param {{x:number,y:number}[]} value
 * @param {(value: any) => void} emit
 */
export function createCurveEditor(def, value, emit) {
  const yMin = def.yMin ?? 0;
  const yMax = def.yMax ?? 1;
  let pts = value;
  /** @type {number} */
  let dragging = -1;

  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('w-curve', 'w-curve-edit');
  svg.setAttribute('height', String(HEIGHT));
  const width = () => Math.max(60, svg.clientWidth || 200);

  const toX = (/** @type {number} */ x) => PAD + x * (width() - 2 * PAD);
  const toY = (/** @type {number} */ y) =>
    HEIGHT - PAD - ((y - yMin) / (yMax - yMin)) * (HEIGHT - 2 * PAD);
  /** @param {PointerEvent | MouseEvent} e */
  const fromEvent = (e) => {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left - PAD) / Math.max(1, r.width - 2 * PAD);
    const y = yMin + ((HEIGHT - PAD - (e.clientY - r.top)) / (HEIGHT - 2 * PAD)) * (yMax - yMin);
    return { x, y };
  };

  function render() {
    const w = width();
    const parts = [];
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
      parts.push(
        `<circle class="w-curve-pt" data-i="${i}" cx="${toX(p.x)}" cy="${toY(p.y)}" r="4.5"/>`,
      );
    });
    svg.innerHTML = parts.join('');
  }

  const pointIndex = (/** @type {Event} */ e) => {
    const target = /** @type {Element} */ (e.target);
    return target?.classList?.contains('w-curve-pt') ? Number(target.getAttribute('data-i')) : -1;
  };

  svg.addEventListener('pointerdown', (e) => {
    const i = pointIndex(e);
    if (i < 0) return;
    dragging = i;
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (dragging < 0) return;
    const { x, y } = fromEvent(e);
    pts = movePoint(pts, dragging, x, y, yMin, yMax);
    render();
    emit(pts);
  });
  const end = () => {
    dragging = -1;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('dblclick', (e) => {
    const i = pointIndex(e);
    if (i >= 0) pts = removePoint(pts, i);
    else {
      const { x, y } = fromEvent(e);
      pts = addPoint(pts, x, y, yMin, yMax).points;
    }
    render();
    emit(pts);
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
