// @ts-check
/**
 * MP4 video export (3.5b, D-051): encoded in the browser with WebCodecs through `mediabunny`
 * (MPL-2.0, used unmodified). H.264 when the browser has it (Chrome, Safari, Edge on Mac/Windows:
 * plays everywhere and imports into After Effects); otherwise the first available of HEVC / VP9
 * / AV1, and the caller warns that QuickTime / After Effects may not open it.
 *
 * MP4 has no transparency: the colour video is composited on a background colour, and the
 * alpha can be exported as a separate black-and-white MATTE video (Luma Matte in After Effects).
 */

import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_VERY_HIGH,
} from 'mediabunny';

/** Preferred codecs, best compatibility first. */
export const MP4_CODECS = /** @type {const} */ (['avc', 'hevc', 'vp9', 'av1']);

/**
 * @param {number} width @param {number} height
 * @returns {Promise<string | null>} the codec the browser can encode at this size, or null
 */
export async function mp4Codec(width, height) {
  if (typeof VideoEncoder === 'undefined') return null;
  return getFirstEncodableVideoCodec([...MP4_CODECS], {
    width,
    height,
    quality: QUALITY_VERY_HIGH,
  });
}

/**
 * Encode a sequence as MP4. Every playback frame is written (holds repeat the drawing).
 * @param {{ drawings: import('./frames.js').Pixels[], frames: number[], fps: number }} seq
 *   opaque, even-sized drawings
 * @param {{ onProgress?: (done: number, total: number) => void }} [o]
 * @returns {Promise<{ bytes: Uint8Array, codec: string }>}
 */
export async function encodeMp4(seq, o = {}) {
  const { width, height } = seq.drawings[0];
  const codec = await mp4Codec(width, height);
  if (!codec)
    throw new Error('This browser cannot encode video (no WebCodecs). Try Chrome or Safari.');
  const canvas = new OffscreenCanvas(width, height);
  const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, {
    codec: /** @type {any} */ (codec),
    quality: QUALITY_VERY_HIGH,
    keyFrameInterval: 1,
  });
  output.addVideoTrack(source, { frameRate: seq.fps });
  await output.start();
  const images = seq.drawings.map(
    (d) => new ImageData(new Uint8ClampedArray(d.data), d.width, d.height),
  );
  for (let i = 0; i < seq.frames.length; i++) {
    ctx.putImageData(images[seq.frames[i]], 0, 0);
    await source.add(i / seq.fps, 1 / seq.fps);
    o.onProgress?.(i + 1, seq.frames.length);
  }
  await output.finalize();
  const buffer = /** @type {BufferTarget} */ (output.target).buffer;
  if (!buffer) throw new Error('MP4 encoding produced no data');
  return { bytes: new Uint8Array(buffer), codec };
}
