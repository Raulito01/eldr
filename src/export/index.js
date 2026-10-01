// @ts-check
// ELDR — export (3.5, 3.5b): render frames, trim, sprite sheet + JSON, GIF, PNG sequence,
// MP4 (browser only: src/export/mp4.js), matte.
export {
  crop,
  flatten,
  matteOf,
  padEven,
  prepareSequence,
  renderSequence,
  unionBounds,
} from './frames.js';
export { encodeGif, gifDelays, mergeHolds } from './gif.js';
export { packSheet } from './sheet.js';
