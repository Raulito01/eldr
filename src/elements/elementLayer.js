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
 */

/**
 * @param {ElementLayerSpec} spec
 * @returns {import('../render/renderer.js').LayerType & { schema: ElementLayerSpec['schema'] }}
 */
export function createElementLayerType(spec) {
  return {
    schema: spec.schema,
    render(ctx, params, frame) {
      for (const inst of spec.instances(params, frame)) {
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
  };
}
