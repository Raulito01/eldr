// @ts-check
/**
 * Canvas 2D backend. A "surface" is a canvas plus its 2D context, sized in device pixels.
 *
 * Works in the browser (OffscreenCanvas, falling back to <canvas>) and in Node tests
 * (pass `createCanvas` from @napi-rs/canvas).
 */

/**
 * @typedef {object} Surface
 * @property {any} canvas  HTMLCanvasElement | OffscreenCanvas | node canvas
 * @property {CanvasRenderingContext2D} ctx
 * @property {number} width  px
 * @property {number} height px
 */

/**
 * @typedef {object} Backend
 * @property {string} name
 * @property {(width: number, height: number) => Surface} createSurface
 * @property {(surface: Surface, width: number, height: number) => void} resize
 */

/** Default canvas factory for browsers. @param {number} w @param {number} h */
function browserCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * @param {(width: number, height: number) => any} [createCanvas] canvas factory (Node tests)
 * @returns {Backend}
 */
export function createCanvas2DBackend(createCanvas = browserCanvas) {
  return {
    name: 'canvas2d',
    createSurface(width, height) {
      const canvas = createCanvas(width, height);
      // willReadFrequently: we read pixels back for export, tests and (later) Pixel Mode.
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas 2D is not available');
      // Keep a pristine state on the stack; every layer render is wrapped in save/restore so
      // nothing a layer sets (alpha, transform, styles) can leak into the next one.
      return { canvas, ctx, width, height };
    },
    resize(surface, width, height) {
      if (surface.width === width && surface.height === height) return;
      surface.canvas.width = width; // resizing also resets the context state
      surface.canvas.height = height;
      surface.width = width;
      surface.height = height;
    },
  };
}
