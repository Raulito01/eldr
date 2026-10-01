// @ts-check
// Shared debug effect for test pages (three moving circles). Not effect art.

/** @returns {import('../src/render/renderer.js').Effect} */
export function makeDebugEffect() {
  return {
    id: 'debug',
    timing: { frameCount: 24, fps: 24, loop: false },
    layers: [
      {
        id: 'red',
        type: 'debugCircle',
        blend: 'normal',
        params: {
          color: '#ff3b30',
          radius: 46,
          from: { x: -60, y: 10 },
          to: { x: 40, y: -10 },
          easing: 'inOutCubic',
          jitter: 8,
        },
      },
      {
        id: 'green',
        type: 'debugCircle',
        blend: 'add',
        params: {
          color: '#34c759',
          radius: 42,
          from: { x: 10, y: -70 },
          to: { x: -10, y: 40 },
          easing: 'outBack',
          jitter: 8,
        },
      },
      {
        id: 'blue',
        type: 'debugCircle',
        blend: 'screen',
        params: {
          color: '#0a84ff',
          radius: 38,
          from: { x: 70, y: 60 },
          to: { x: -20, y: -20 },
          easing: 'outQuad',
          jitter: 8,
        },
      },
    ],
  };
}
