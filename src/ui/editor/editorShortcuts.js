// @ts-check
/**
 * The editor's After Effects shortcut set (3.7d, D-060). Each entry is also a button in the
 * cheat sheet (?), so everything works with a pen too.
 */

/**
 * @typedef {object} EditorActions
 * @property {() => void} playToggle
 * @property {(n: number) => void} step         frames (±)
 * @property {(where: 'first' | 'last') => void} goEnd
 * @property {(dir: -1 | 1) => void} jumpKey
 * @property {(edge: 'in' | 'out') => void} goLayerEdge
 * @property {(edge: 'in' | 'out') => void} alignEdge   [ ]
 * @property {(edge: 'in' | 'out') => void} trimEdge    ⌥[ ⌥]
 * @property {() => void} toggleLanes
 * @property {(ids: string[], add: boolean) => void} reveal
 * @property {() => void} selectAllLayers
 * @property {() => void} selectAllKeys
 * @property {() => void} duplicate
 * @property {() => boolean} deleteSelection  keys if any are selected, else layers
 * @property {() => boolean} clearKeySelection
 * @property {() => boolean} copyKeys
 * @property {() => boolean} pasteKeys
 * @property {(kind: import('../../effects/keyInterp.js').InterpKind) => boolean} interp
 * @property {() => boolean} velocity
 * @property {() => void} toggleGraph
 * @property {(f: number | 'fit') => void} zoom
 * @property {() => void} toggleZoom
 * @property {() => void} undo
 * @property {() => void} redo
 * @property {() => void} centre
 * @property {() => void} centreAnchor
 * @property {(add: boolean) => void} revealMasks  M: lanes for the active layer's masks
 * @property {() => void} pen  pen tool on / off (draw a mask)
 * @property {() => void} precompose  selected layers → a new precomp
 * @property {() => boolean | void} openPrecomp  open the selected precomp layer
 * @property {() => boolean | void} closePrecomp  back to the comp around this one
 * @property {() => void} panBehind  toggle the Pan Behind tool (anchor-only drag)
 * @property {() => boolean} copySettings  copy the active layer's settings (D-074)
 * @property {() => boolean} pasteSettings  paste settings onto the selected layers (dialog)
 * @property {() => void} cheatSheet
 * @property {() => void} variants  the Variants grid (D-083)
 * @property {() => void} presets  the Preset Browser (D-120)
 * @property {() => void} pixelMode  Pixel Mode on / off (D-085)
 * @property {() => void} findSetting  focus the right panel's search (D-112)
 */

const PROPS = {
  P: ['transform.x', 'transform.y'],
  S: ['transform.scaleX', 'transform.scaleY'],
  R: ['transform.rotation'],
  T: ['layer.opacity'],
  A: ['transform.anchorX', 'transform.anchorY'],
};

/**
 * @param {EditorActions} a
 * @returns {import('../shortcuts.js').Shortcut[]}
 */
export function editorShortcutList(a) {
  const T = 'Time';
  const K = 'Keyframes';
  const L = 'Layers';
  const V = 'View';
  const E = 'Edit';
  /** @type {import('../shortcuts.js').Shortcut[]} */
  const list = [
    { id: 'play', group: T, label: 'Play / pause', keys: ['Space'], run: () => a.playToggle() },
    {
      id: 'prev',
      group: T,
      label: 'Previous frame',
      keys: ['ArrowLeft', 'PageUp', 'mod+ArrowLeft'],
      run: () => a.step(-1),
    },
    {
      id: 'next',
      group: T,
      label: 'Next frame',
      keys: ['ArrowRight', 'PageDown', 'mod+ArrowRight'],
      run: () => a.step(1),
    },
    {
      id: 'prev10',
      group: T,
      label: '10 frames back',
      keys: ['shift+PageUp', 'shift+ArrowLeft', 'mod+shift+ArrowLeft'],
      run: () => a.step(-10),
    },
    {
      id: 'next10',
      group: T,
      label: '10 frames forward',
      keys: ['shift+PageDown', 'shift+ArrowRight', 'mod+shift+ArrowRight'],
      run: () => a.step(10),
    },
    { id: 'first', group: T, label: 'First frame', keys: ['Home'], run: () => a.goEnd('first') },
    { id: 'last', group: T, label: 'Last frame', keys: ['End'], run: () => a.goEnd('last') },
    {
      id: 'prevKey',
      group: T,
      label: 'Previous keyframe',
      keys: ['KeyJ'],
      run: () => a.jumpKey(-1),
    },
    { id: 'nextKey', group: T, label: 'Next keyframe', keys: ['KeyK'], run: () => a.jumpKey(1) },
    {
      id: 'layerIn',
      group: T,
      label: 'Go to the layer’s in point',
      keys: ['KeyI'],
      run: () => a.goLayerEdge('in'),
    },
    {
      id: 'layerOut',
      group: T,
      label: 'Go to the layer’s out point',
      keys: ['KeyO'],
      run: () => a.goLayerEdge('out'),
    },

    {
      id: 'alignIn',
      group: L,
      label: 'Move layer: in point to here',
      keys: ['BracketLeft'],
      run: () => a.alignEdge('in'),
    },
    {
      id: 'alignOut',
      group: L,
      label: 'Move layer: out point to here',
      keys: ['BracketRight'],
      run: () => a.alignEdge('out'),
    },
    {
      id: 'trimIn',
      group: L,
      label: 'Trim in point to here',
      keys: ['alt+BracketLeft'],
      run: () => a.trimEdge('in'),
    },
    {
      id: 'trimOut',
      group: L,
      label: 'Trim out point to here',
      keys: ['alt+BracketRight'],
      run: () => a.trimEdge('out'),
    },
    {
      id: 'allLayers',
      group: L,
      label: 'Select all layers',
      keys: ['mod+KeyA'],
      run: () => a.selectAllLayers(),
    },
    {
      id: 'dup',
      group: L,
      label: 'Duplicate selected layers',
      keys: ['mod+KeyD'],
      run: () => a.duplicate(),
    },
    {
      id: 'delete',
      group: L,
      label: 'Delete selected keys (or layers)',
      keys: ['Backspace', 'Delete'],
      run: () => a.deleteSelection(),
    },
    {
      id: 'centre',
      group: L,
      label: 'Centre layer in the frame',
      keys: ['shift+KeyC', 'mod+Home'],
      run: () => a.centre(),
    },
    {
      id: 'centreAnchor',
      group: L,
      label: 'Centre anchor point in the layer',
      keys: ['alt+shift+KeyC', 'mod+alt+Home'],
      run: () => a.centreAnchor(),
    },

    {
      id: 'precompose',
      group: L,
      label: 'Precompose selected layers',
      keys: ['mod+shift+KeyC'],
      run: () => a.precompose(),
    },
    {
      id: 'openPrecomp',
      group: L,
      label: 'Open the selected precomp',
      keys: ['Tab'],
      run: () => a.openPrecomp(),
    },
    {
      id: 'closePrecomp',
      group: L,
      label: 'Back out of this precomp',
      keys: ['shift+Tab'],
      run: () => a.closePrecomp(),
    },
    {
      id: 'pen',
      group: L,
      label: 'Pen tool: draw a mask (click = corner, drag = curve, Enter = close)',
      keys: ['KeyG'],
      run: () => a.pen(),
    },
    {
      id: 'panBehind',
      group: L,
      label: 'Pan Behind tool on / off (move only the anchor point)',
      keys: ['KeyY'],
      run: () => a.panBehind(),
    },
    {
      id: 'copySettings',
      group: L,
      label: 'Copy layer settings',
      keys: ['mod+alt+KeyC'],
      run: () => a.copySettings(),
    },
    {
      id: 'pasteSettings',
      group: L,
      label: 'Paste layer settings… (choose groups)',
      keys: ['mod+alt+KeyV'],
      run: () => a.pasteSettings(),
    },
    {
      id: 'lanes',
      group: K,
      label: 'Show / hide animated properties',
      keys: ['KeyU'],
      run: () => a.toggleLanes(),
    },
    ...Object.entries(PROPS).flatMap(([letter, ids]) => {
      const name = {
        P: 'Position',
        S: 'Scale',
        R: 'Rotation',
        T: 'Opacity',
        A: 'Anchor point',
      }[letter];
      return [
        {
          id: `reveal${letter}`,
          group: K,
          label: `Show ${name}`,
          keys: [`Key${letter}`],
          run: () => a.reveal(ids, false),
        },
        {
          id: `add${letter}`,
          group: K,
          label: `Also show ${name}`,
          keys: [`shift+Key${letter}`],
          run: () => a.reveal(ids, true),
        },
      ];
    }),
    {
      id: 'revealMasks',
      group: K,
      label: 'Show mask properties',
      keys: ['KeyM'],
      run: () => a.revealMasks(false),
    },
    {
      id: 'addMasks',
      group: K,
      label: 'Also show mask properties',
      keys: ['shift+KeyM'],
      run: () => a.revealMasks(true),
    },
    {
      id: 'allKeys',
      group: K,
      label: 'Select all keys of the selected layers',
      keys: ['mod+alt+KeyA'],
      run: () => a.selectAllKeys(),
    },
    {
      id: 'deselectKeys',
      group: K,
      label: 'Deselect keys',
      keys: ['Escape'],
      run: () => a.clearKeySelection(),
    },
    {
      id: 'copy',
      group: K,
      label: 'Copy keys (no keys selected: the selected layers)',
      keys: ['mod+KeyC'],
      run: () => a.copyKeys(),
    },
    {
      id: 'paste',
      group: K,
      label: 'Paste keys at the playhead (or copied layers)',
      keys: ['mod+KeyV'],
      run: () => a.pasteKeys(),
    },
    { id: 'easy', group: K, label: 'Easy Ease', keys: ['F9'], run: () => a.interp('easy') },
    {
      id: 'easeIn',
      group: K,
      label: 'Easy Ease In',
      keys: ['shift+F9'],
      run: () => a.interp('easeIn'),
    },
    {
      id: 'easeOut',
      group: K,
      label: 'Easy Ease Out',
      keys: ['mod+shift+F9'],
      run: () => a.interp('easeOut'),
    },
    {
      id: 'hold',
      group: K,
      label: 'Toggle Hold keyframe',
      keys: ['mod+alt+KeyH'],
      run: () => a.interp('toggleHold'),
    },
    {
      id: 'velocity',
      group: K,
      label: 'Keyframe Velocity…',
      keys: ['mod+shift+KeyK'],
      run: () => a.velocity(),
    },

    {
      id: 'graph',
      group: V,
      label: 'Graph Editor on / off',
      keys: ['shift+F3'],
      run: () => a.toggleGraph(),
    },
    { id: 'zoomIn', group: V, label: 'Zoom timeline in', keys: ['=', '+'], run: () => a.zoom(1.5) },
    {
      id: 'zoomOut',
      group: V,
      label: 'Zoom timeline out',
      keys: ['-'],
      run: () => a.zoom(1 / 1.5),
    },
    {
      id: 'zoomToggle',
      group: V,
      label: 'Zoom to frames / whole comp',
      keys: [';'],
      run: () => a.toggleZoom(),
    },
    {
      id: 'findSetting',
      group: V,
      label: 'Find a setting (right panel)',
      keys: ['/'],
      run: () => a.findSetting(),
    },
    {
      id: 'help',
      group: V,
      label: 'Shortcut sheet',
      keys: ['?'],
      run: () => a.cheatSheet(),
    },
    {
      id: 'presets',
      group: E,
      label: 'Preset Browser… (categories, thumbnails, preview)',
      keys: ['KeyB'],
      run: () => a.presets(),
    },
    {
      id: 'variants',
      group: E,
      label: 'Variants… (a grid of variations)',
      keys: ['KeyV'],
      run: () => a.variants(),
    },
    {
      id: 'pixelMode',
      group: E,
      label: 'Pixel Mode on / off',
      keys: ['alt+KeyP'],
      run: () => a.pixelMode(),
    },

    { id: 'undo', group: E, label: 'Undo', keys: ['mod+KeyZ'], run: () => a.undo() },
    {
      id: 'redo',
      group: E,
      label: 'Redo',
      keys: ['mod+shift+KeyZ', 'mod+KeyY'],
      run: () => a.redo(),
    },
  ];
  return list;
}
