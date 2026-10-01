// @ts-check
// ELDR — export (step 3.5): render frames, trim, sprite sheet + JSON, animated GIF.
export { crop, flatten, prepareSequence, renderSequence, unionBounds } from './frames.js';
export { encodeGif, gifDelays, mergeHolds } from './gif.js';
export { packSheet } from './sheet.js';
