// @ts-check
/**
 * Builds a renderer layer type from an element (motion: which instances exist, where, how big)
 * and a shape (what each instance looks like). Every layer in ELDR follows this pattern
 * (brief §3.1): single + blob now; burst + puff, burst + streak, … later.
 */

/** @typedef {import('./single.js').Instance} Instance */

/**
 * @typedef {object} ElementLayerSpec
 * @property {ReadonlyArray<import('../schema/schema.js').ParamDef>} schema  all params of the layer
 * @property {(params: Record<string, any>, frame: import('../render/renderer.js').LayerFrame) => Instance[]} instances
 * @property {(ctx: CanvasRenderingContext2D, params: Record<string, any>, instance: Instance, frame: import('../render/renderer.js').LayerFrame) => void} drawInstance
 *   draws one instance around (0, 0); position, rotation, scale and opacity are already applied
 * @property {import('../render/renderer.js').LayerType['postProcess']} [postProcess]
 * @property {import('../render/renderer.js').LayerType['glow']} [glow]
 */

/**
 * @param {ElementLayerSpec} spec
 * @returns {import('../render/renderer.js').LayerType & { schema: ElementLayerSpec['schema'] }}
 */
export function createElementLayerType(spec) {
  return {
    schema: spec.schema,
    render(ctx, params, frame) {
      const list = spec.instances(params, frame);
      // World-space instances (emitter particles, 4.Pb): undo the layer's own transform, so they
      // stay where they were born while the emitter moves on.
      if (/** @type {any} */ (list).worldSpace && frame.matrix) {
        const m = frame.matrix;
        const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
        ctx.transform(
          m[3] / det,
          -m[1] / det,
          -m[2] / det,
          m[0] / det,
          (m[2] * m[5] - m[3] * m[4]) / det,
          (m[1] * m[4] - m[0] * m[5]) / det,
        );
      }
      for (const inst of list) {
        ctx.save();
        ctx.translate(inst.x, inst.y);
        if (inst.rotation) ctx.rotate(inst.rotation);
        ctx.scale(inst.scale, inst.scale);
        ctx.globalAlpha *= inst.opacity;
        spec.drawInstance(ctx, params, inst, frame);
        ctx.restore();
      }
    },
    postProcess: spec.postProcess,
    glow: spec.glow,
  };
}
