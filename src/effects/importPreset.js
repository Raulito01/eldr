// @ts-check
/**
 * Bring layers from one creation into another (D-119): a whole preset as ONE precomp layer,
 * or copied layers pasted as layers or as a precomp. Everything they depend on comes along —
 * precomps (nested too), imported textures, parents / mattes / lightning targets / follow paths
 * inside the set — with new ids where the target already uses one, so nothing there changes.
 *
 * "Keep its own timing": the new precomp gets the source's clock (length, loop, speed) and its
 * impact / flash / wind-up, and is scaled to the source's size, so it looks exactly as it did.
 */

import { makeLayer } from './explosion/explosion.js';
import { setParent, uniqueId, uniqueLabel } from './layerStack.js';

/** @typedef {import('./explosion/explosion.js').ExplosionState} State */
/** @typedef {import('./explosion/explosion.js').EditorLayer} EditorLayer */

/** The timing globals a precomp carries (D-119). */
const CLOCK_GLOBALS = ['explosion.impact', 'explosion.flashFrames', 'explosion.anticipation'];

/** A comp id not used in `comps` yet: comp1, comp2, … @param {Record<string, any>} comps */
function freeCompId(comps) {
  let n = 1;
  while (comps[`comp${n}`]) n++;
  return `comp${n}`;
}

/**
 * Precomps a layer list uses, directly or deeper (ids, in `src.comps`).
 * @param {State} src @param {EditorLayer[]} layers @returns {string[]}
 */
export function compsUsed(src, layers) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {EditorLayer[]} */ list) => {
    for (const l of list) {
      if (l.type === 'precomp' && l.comp && src.comps?.[l.comp] && !out.includes(l.comp)) {
        out.push(l.comp);
        walk(src.comps[l.comp].layers);
      }
    }
  };
  walk(layers);
  return out;
}

/**
 * Bring the source's precomps and textures that `layers` need into `host`, under ids free
 * there. Returns the host with them added and the layers rewritten to the new ids.
 * @param {State} host @param {State} src @param {EditorLayer[]} layers
 * @returns {{ host: State, layers: EditorLayer[] }}
 */
export function mergeDeps(host, src, layers) {
  const comps = { ...(host.comps ?? {}) };
  const assets = { ...(host.assets ?? {}) };
  /** @type {Map<string, string>} */
  const compMap = new Map();
  for (const id of compsUsed(src, layers)) {
    const nid = freeCompId(comps);
    compMap.set(id, nid);
    comps[nid] = { id: nid, name: '', layers: [] }; // reserve
  }
  /** @type {Map<string, string>} */
  const assetMap = new Map();
  const allLayers = [
    ...layers,
    ...[...compMap.keys()].flatMap((id) => src.comps?.[id]?.layers ?? []),
  ];
  for (const l of allLayers) {
    const a = l.texture ? src.assets?.[l.texture] : undefined;
    if (!a || assetMap.has(a.id)) continue;
    const same = assets[a.id] && JSON.stringify(assets[a.id]) === JSON.stringify(a);
    let nid = a.id;
    for (let i = 2; assets[nid] && !same; i++) nid = `${a.id}-${i}`;
    assetMap.set(a.id, nid);
    if (!same) assets[nid] = { ...structuredClone(a), id: nid };
  }
  const rewrite = (/** @type {EditorLayer[]} */ list) =>
    list.map((l) => {
      const c = structuredClone(l);
      if (c.comp && compMap.has(c.comp)) c.comp = compMap.get(c.comp);
      if (c.texture && assetMap.has(c.texture)) c.texture = assetMap.get(c.texture);
      return c;
    });
  for (const [id, nid] of compMap) {
    const sc = /** @type {any} */ (src.comps)[id];
    comps[nid] = { ...structuredClone(sc), id: nid, layers: rewrite(sc.layers) };
  }
  return {
    host: {
      ...host,
      ...(Object.keys(comps).length ? { comps } : {}),
      ...(Object.keys(assets).length ? { assets } : {}),
    },
    layers: rewrite(layers),
  };
}

/**
 * Put `layers` into `host` as ONE precomp layer above `aboveId` (or on top).
 * @param {State} host @param {State} src where the layers come from (its precomps / textures /
 *   clock) @param {EditorLayer[]} layers
 * @param {{ name: string, aboveId?: string, keepOwn?: boolean }} o keepOwn (default on): the
 *   precomp keeps the source's clock, impact / flash / wind-up and size
 * @returns {{ state: State, id: string, compId: string }}
 */
export function addAsPrecomp(host, src, layers, o) {
  const keep = o.keepOwn !== false;
  const m = mergeDeps(host, src, layers);
  const comps = { ...(m.host.comps ?? {}) };
  const compId = freeCompId(comps);
  /** @type {Record<string, any>} */
  const globals = {};
  for (const k of CLOCK_GLOBALS) if (k in src.globals) globals[k] = src.globals[k];
  comps[compId] = {
    id: compId,
    name: o.name,
    layers: m.layers,
    ...(keep ? { timing: structuredClone(src.timing), globals } : {}),
  };
  const id = uniqueId(m.host, 'precomp');
  const k = keep
    ? ((src.globals['explosion.size'] ?? 1) / (host.globals['explosion.size'] ?? 1)) * 100
    : 100;
  const pre = makeLayer({
    id,
    type: 'precomp',
    label: uniqueLabel(m.host, o.name),
    comp: compId,
    anchor: 'free',
    params: {},
    transform: { x: 0, y: 0, anchorX: 0, anchorY: 0, scaleX: k, scaleY: k, rotation: 0 },
  });
  const list = [...m.host.layers];
  const at = o.aboveId ? list.findIndex((l) => l.id === o.aboveId) + 1 : list.length;
  list.splice(at < 1 ? list.length : at, 0, pre);
  return { state: { ...m.host, comps, layers: list }, id, compId };
}

/**
 * A whole preset as one precomp layer (its name; keeps its own look and timing by default).
 * @param {State} host @param {State} preset @param {{ name: string, aboveId?: string, keepOwn?: boolean }} o
 */
export const importPresetAsPrecomp = (host, preset, o) =>
  addAsPrecomp(host, preset, preset.layers, o);

/**
 * Copy layers (D-119): a small creation holding just them — with the source's clock, globals,
 * and the precomps / textures they use. Parents, mattes, lightning targets and follow paths
 * that point outside the copied set are let go (layers keep their place on screen).
 * @param {State} state @param {string[]} ids in stack order @returns {State}
 */
export function copyLayersClip(state, ids) {
  const set = new Set(ids);
  let s = state;
  for (const l of state.layers)
    if (set.has(l.id) && l.parent && !set.has(l.parent)) s = setParent(s, l.id, null);
  const layers = s.layers
    .filter((l) => set.has(l.id))
    .map((l) => {
      const c = structuredClone(l);
      if (c.matte && !set.has(c.matte.source)) c.matte = null;
      if (c.target && !set.has(c.target)) delete c.target;
      if (c.follow && !set.has(c.follow.layer)) delete c.follow;
      return c;
    });
  const m = mergeDeps({ ...state, layers: [], comps: undefined, assets: undefined }, state, layers);
  return {
    family: 'explosion',
    globals: structuredClone(state.globals),
    timing: structuredClone(state.timing),
    layers: m.layers,
    ...(m.host.comps ? { comps: m.host.comps } : {}),
    ...(m.host.assets ? { assets: m.host.assets } : {}),
  };
}

/**
 * Paste copied layers into `host` as layers, above `aboveId` (or on top), in their order.
 * Ids already used in the host get new ones; links inside the set follow. They take the
 * host's clock (as layers they live on its timeline).
 * @param {State} host @param {State} clip @param {string} [aboveId]
 * @returns {{ state: State, ids: string[] }}
 */
export function pasteLayers(host, clip, aboveId) {
  const m = mergeDeps(host, clip, clip.layers);
  /** @type {Map<string, string>} */
  const idMap = new Map();
  /** @type {{ layers: { id: string, label: string }[] }} */
  const used = { layers: [...m.host.layers] };
  for (const l of m.layers) {
    const nid = uniqueId(used, l.id);
    idMap.set(l.id, nid);
    used.layers.push({ id: nid, label: l.label });
  }
  const labels = { layers: [...m.host.layers] };
  const pasted = m.layers.map((l) => {
    const c = { ...l, id: /** @type {string} */ (idMap.get(l.id)) };
    c.label = uniqueLabel(labels, l.label);
    labels.layers.push(c);
    if (c.parent) c.parent = idMap.get(c.parent) ?? null;
    if (c.matte) c.matte = { ...c.matte, source: idMap.get(c.matte.source) ?? c.matte.source };
    if (c.target) c.target = idMap.get(c.target) ?? c.target;
    if (c.follow) c.follow = { ...c.follow, layer: idMap.get(c.follow.layer) ?? c.follow.layer };
    return c;
  });
  const list = [...m.host.layers];
  const at = aboveId ? list.findIndex((l) => l.id === aboveId) + 1 : list.length;
  list.splice(at < 1 ? list.length : at, 0, ...pasted);
  return { state: { ...m.host, layers: list }, ids: pasted.map((l) => l.id) };
}
