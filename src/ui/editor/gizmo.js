// @ts-check
/**
 * Transform handles for the selected layer (3.6b, D-053). Pure geometry + drag maths, plus a
 * painter. All drag maths happen in EFFECT pixels; the caller converts screen ↔ effect.
 *
 * Handles (pen-friendly, D-028: large hit areas, no keyboard needed):
 * - inside the box → move
 * - anchor (centre circle) → move; with ⌥ (Alt) → move the anchor only, the layer stays put
 * - round handle above → rotate (Shift: 15° steps)
 * - corner squares → scale (uniform when linked or Shift)
 */

import {
  apply,
  applyVector,
  identity,
  invert,
  localMatrix,
  worldMatrices,
} from '../../core/transform2d.js';

/** Half size of the handle box on screen, px (before layer scale). */
export const BOX = 46;
/** Distance of the rotate handle above the box, px. */
export const ROTATE_GAP = 30;
/** Hit radius of handles, px — generous for pens. */
export const HIT = 13;

/**
 * @typedef {object} ScreenMap  effect px ↔ screen (CSS) px
 * @property {(ex: number, ey: number) => [number, number]} toScreen
 * @property {(sx: number, sy: number) => [number, number]} toEffect
 */

/**
 * @typedef {object} GizmoGeometry  everything in SCREEN px
 * @property {[number, number]} anchor
 * @property {[number, number]} u   unit vector along the layer's x axis
 * @property {[number, number]} v   unit vector along the layer's y axis
 * @property {number} hx @property {number} hy  half box sizes
 * @property {[number, number][]} corners  TL, TR, BR, BL
 * @property {[number, number]} rotate
 */

/**
 * @param {import('../../effects/explosion/explosion.js').EditorLayer[]} layers
 * @param {string} id selected layer
 * @param {ScreenMap} map
 * @returns {GizmoGeometry | null}
 */
export function gizmoGeometry(layers, id, map) {
  const l = layers.find((x) => x.id === id);
  if (!l) return null;
  const m = /** @type {import('../../core/transform2d.js').Mat} */ (worldMatrices(layers).get(id));
  const a = map.toScreen(...apply(m, l.transform.anchorX, l.transform.anchorY));
  // Screen directions of the layer axes (include the render scale; we only need directions).
  const o = map.toScreen(...apply(m, l.transform.anchorX, l.transform.anchorY));
  const ux = map.toScreen(...apply(m, l.transform.anchorX + 1, l.transform.anchorY));
  const vy = map.toScreen(...apply(m, l.transform.anchorX, l.transform.anchorY + 1));
  const unit = (/** @type {number} */ x, /** @type {number} */ y) => {
    const len = Math.hypot(x, y) || 1;
    return /** @type {[number, number]} */ ([x / len, y / len]);
  };
  const u = unit(ux[0] - o[0], ux[1] - o[1]);
  const v = unit(vy[0] - o[0], vy[1] - o[1]);
  const clampH = (/** @type {number} */ s) => Math.min(160, Math.max(18, BOX * Math.abs(s / 100)));
  const hx = clampH(l.transform.scaleX);
  const hy = clampH(l.transform.scaleY);
  const pt = (/** @type {number} */ i, /** @type {number} */ j) =>
    /** @type {[number, number]} */ ([
      a[0] + u[0] * hx * i + v[0] * hy * j,
      a[1] + u[1] * hx * i + v[1] * hy * j,
    ]);
  return {
    anchor: a,
    u,
    v,
    hx,
    hy,
    corners: [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)],
    rotate: [a[0] - v[0] * (hy + ROTATE_GAP), a[1] - v[1] * (hy + ROTATE_GAP)],
  };
}

/** @typedef {'move' | 'anchor' | 'rotate' | 'scale' | null} GizmoHit */

/**
 * Which handle is at screen point (x, y)?
 * @param {GizmoGeometry} g @param {number} x @param {number} y @param {{ alt?: boolean }} [mods]
 * @returns {GizmoHit}
 */
export function hitTest(g, x, y, mods = {}) {
  const near = (/** @type {[number, number]} */ p) => Math.hypot(p[0] - x, p[1] - y) <= HIT;
  if (near(g.rotate)) return 'rotate';
  if (g.corners.some(near)) return 'scale';
  if (near(g.anchor)) return mods.alt ? 'anchor' : 'move';
  // Inside the (rotated) box?
  const dx = x - g.anchor[0];
  const dy = y - g.anchor[1];
  const along = dx * g.u[0] + dy * g.u[1];
  const across = dx * g.v[0] + dy * g.v[1];
  if (Math.abs(along) <= g.hx && Math.abs(across) <= g.hy) return 'move';
  return null;
}

/**
 * @typedef {object} DragStart  snapshot taken when a handle drag begins (effect px)
 * @property {GizmoHit} kind
 * @property {import('../../core/transform2d.js').LayerTransform} transform
 * @property {import('../../core/transform2d.js').Mat} parentWorld
 * @property {import('../../core/transform2d.js').Mat} world
 * @property {[number, number]} anchorWorld
 * @property {[number, number]} p0  pointer at the start, effect px
 */

/**
 * @param {import('../../effects/explosion/explosion.js').EditorLayer[]} layers
 * @param {string} id @param {GizmoHit} kind @param {[number, number]} p0 effect px
 * @returns {DragStart}
 */
export function startDrag(layers, id, kind, p0) {
  const worlds = worldMatrices(layers);
  const l = /** @type {import('../../effects/explosion/explosion.js').EditorLayer} */ (
    layers.find((x) => x.id === id)
  );
  const world = /** @type {import('../../core/transform2d.js').Mat} */ (worlds.get(id));
  const parentWorld = (l.parent && worlds.get(l.parent)) || identity();
  return {
    kind,
    transform: { ...l.transform },
    parentWorld,
    world,
    anchorWorld: apply(world, l.transform.anchorX, l.transform.anchorY),
    p0,
  };
}

/**
 * New transform for a drag to effect point p.
 * @param {DragStart} d @param {[number, number]} p
 * @param {{ shift?: boolean, linked?: boolean }} [mods]
 * @returns {import('../../core/transform2d.js').LayerTransform}
 */
export function dragTo(d, p, mods = {}) {
  const t = d.transform;
  if (d.kind === 'move') {
    const target = /** @type {[number, number]} */ ([
      d.anchorWorld[0] + p[0] - d.p0[0],
      d.anchorWorld[1] + p[1] - d.p0[1],
    ]);
    const [x, y] = apply(invert(d.parentWorld), ...target);
    return { ...t, x, y };
  }
  if (d.kind === 'rotate') {
    const ang = (/** @type {[number, number]} */ q) =>
      Math.atan2(q[1] - d.anchorWorld[1], q[0] - d.anchorWorld[0]);
    let rotation = t.rotation + ((ang(p) - ang(d.p0)) * 180) / Math.PI;
    if (mods.shift) rotation = Math.round(rotation / 15) * 15;
    return { ...t, rotation };
  }
  if (d.kind === 'scale') {
    // Pointer offsets from the anchor, measured along the layer's own axes.
    const inv = invert(d.world);
    const a0 = applyVector(inv, d.p0[0] - d.anchorWorld[0], d.p0[1] - d.anchorWorld[1]);
    const a1 = applyVector(inv, p[0] - d.anchorWorld[0], p[1] - d.anchorWorld[1]);
    if (mods.shift || mods.linked) {
      const k = Math.hypot(...a1) / (Math.hypot(...a0) || 1);
      return { ...t, scaleX: t.scaleX * k, scaleY: t.scaleY * k };
    }
    const kx = Math.abs(a0[0]) > 1e-6 ? a1[0] / a0[0] : 1;
    const ky = Math.abs(a0[1]) > 1e-6 ? a1[1] / a0[1] : 1;
    return { ...t, scaleX: t.scaleX * kx, scaleY: t.scaleY * ky };
  }
  if (d.kind === 'anchor') {
    // Move the anchor to the pointer without moving the layer: x' = x + R·S·(a' − a).
    const [ax, ay] = apply(invert(d.world), ...p);
    const [dx, dy] = applyVector(localMatrix(t), ax - t.anchorX, ay - t.anchorY);
    return { ...t, anchorX: ax, anchorY: ay, x: t.x + dx, y: t.y + dy };
  }
  return t;
}

/**
 * Paint the handles (screen px, CSS units).
 * @param {CanvasRenderingContext2D} ctx @param {GizmoGeometry} g
 * @param {{ active?: GizmoHit, isNull?: boolean }} [o]
 */
export function paintGizmo(ctx, g, o = {}) {
  const accent = '#ff8a3d';
  ctx.save();
  ctx.lineWidth = 1.5;
  // Box
  ctx.strokeStyle = accent;
  ctx.setLineDash(o.isNull ? [5, 4] : []);
  ctx.beginPath();
  for (const [i, [x, y]] of g.corners.entries()) {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  // Rotate handle + stem
  const top = /** @type {[number, number]} */ ([
    g.anchor[0] - g.v[0] * g.hy,
    g.anchor[1] - g.v[1] * g.hy,
  ]);
  ctx.beginPath();
  ctx.moveTo(...top);
  ctx.lineTo(...g.rotate);
  ctx.stroke();
  const dot = (
    /** @type {[number, number]} */ p,
    /** @type {number} */ r,
    /** @type {boolean} */ on,
  ) => {
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = on ? accent : '#16171b';
    ctx.fill();
    ctx.stroke();
  };
  dot(g.rotate, 7, o.active === 'rotate');
  // Corners
  for (const [x, y] of g.corners) {
    ctx.fillStyle = o.active === 'scale' ? accent : '#16171b';
    ctx.fillRect(x - 5, y - 5, 10, 10);
    ctx.strokeRect(x - 5, y - 5, 10, 10);
  }
  // Anchor: circle + cross
  dot(g.anchor, 8, o.active === 'anchor');
  ctx.beginPath();
  ctx.moveTo(g.anchor[0] - 13, g.anchor[1]);
  ctx.lineTo(g.anchor[0] + 13, g.anchor[1]);
  ctx.moveTo(g.anchor[0], g.anchor[1] - 13);
  ctx.lineTo(g.anchor[0], g.anchor[1] + 13);
  ctx.stroke();
  ctx.restore();
}
