// @ts-check
/**
 * Families and packs (D-118). A family is a group of My presets ("Family/Name" keys, D-098).
 * A pack is ONE `.eldrpack` file holding a whole family: a zip with a manifest, every preset as
 * its normal `.eldr.json` file, and a small preview PNG per preset — to share, back up or sell.
 *
 * Pure helpers (no storage, no DOM): key planning for rename / move, and pack build / read.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const PACK_EXT = '.eldrpack';
export const PACK_FORMAT = 'eldr-pack';
export const PACK_VERSION = 1;

/** The family of a key ('' = no family). @param {string} key */
export const familyOf = (key) => {
  const i = key.lastIndexOf('/');
  return i < 0 ? '' : key.slice(0, i);
};
/** The preset name of a key. @param {string} key */
export const presetNameOf = (key) => key.slice(key.lastIndexOf('/') + 1);
/** Key of a name in a family. @param {string} family @param {string} name */
export const keyIn = (family, name) => (family ? `${family}/${name}` : name);

/** A family or preset name made safe (no slashes, trimmed). @param {string} s */
export const cleanName = (s) =>
  String(s ?? '')
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Families with their keys, sorted by name ('' = presets without a family, first).
 * @param {string[]} keys @returns {{ family: string, keys: string[] }[]}
 */
export function familiesOf(keys) {
  /** @type {Map<string, string[]>} */
  const m = new Map();
  for (const k of keys) {
    const f = familyOf(k);
    if (!m.has(f)) m.set(f, []);
    m.get(f)?.push(k);
  }
  return [...m]
    .map(([family, ks]) => ({ family, keys: ks.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) =>
      a.family === '' ? -1 : b.family === '' ? 1 : a.family.localeCompare(b.family),
    );
}

/**
 * A key not taken yet: "Name", then "Name 2", "Name 3", …
 * @param {string} family @param {string} name @param {Set<string>} taken
 */
export function freeKey(family, name, taken) {
  let k = keyIn(family, name);
  for (let i = 2; taken.has(k); i++) k = keyIn(family, `${name} ${i}`);
  return k;
}

/**
 * Rename a family: [old key, new key] for each of its presets (names kept; clashes with
 * presets already in the target family get a number).
 * @param {string[]} keys all keys @param {string} from @param {string} to
 * @returns {[string, string][]}
 */
export function renameFamilyPlan(keys, from, to) {
  const target = cleanName(to);
  if (target === from) return [];
  const moving = keys.filter((k) => familyOf(k) === from);
  const taken = new Set(keys.filter((k) => familyOf(k) !== from));
  return moving.map((k) => {
    const nk = freeKey(target, presetNameOf(k), taken);
    taken.add(nk);
    return [k, nk];
  });
}

/**
 * Move one preset to another family. @param {string[]} keys @param {string} key
 * @param {string} family @returns {string} its new key (the same key if nothing changes)
 */
export function moveKeyPlan(keys, key, family) {
  const f = cleanName(family);
  if (familyOf(key) === f) return key;
  return freeKey(f, presetNameOf(key), new Set(keys));
}

/** A file name safe on every system. @param {string} s */
const fileSafe = (s) =>
  [...cleanName(s)].map((ch) => (ch < ' ' || '<>:"|?*'.includes(ch) ? '_' : ch)).join('') ||
  'preset';

/**
 * Build a pack. @param {{ family: string, presets: { name: string, file: any, thumb?: Uint8Array }[],
 *   app?: string, appVersion?: string }} o
 * @returns {Uint8Array} the `.eldrpack` bytes (a zip)
 */
export function buildPack(o) {
  /** @type {Record<string, Uint8Array>} */
  const zip = {};
  const used = new Set();
  const presets = o.presets.map((p) => {
    let base = fileSafe(p.name);
    for (let i = 2; used.has(base.toLowerCase()); i++) base = `${fileSafe(p.name)} ${i}`;
    used.add(base.toLowerCase());
    const file = `presets/${base}.eldr.json`;
    zip[file] = strToU8(JSON.stringify(p.file, null, 1));
    /** @type {{ name: string, file: string, thumb?: string }} */
    const entry = { name: p.name, file };
    if (p.thumb?.length) {
      entry.thumb = `thumbs/${base}.png`;
      zip[entry.thumb] = p.thumb;
    }
    return entry;
  });
  const manifest = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    family: o.family,
    app: o.app ?? 'ELDR',
    appVersion: o.appVersion ?? '',
    presets,
  };
  zip['manifest.json'] = strToU8(JSON.stringify(manifest, null, 1));
  return zipSync(zip, { level: 6 });
}

/**
 * Read a pack. Never throws: bad content gives `error`, small problems `warnings`.
 * @param {Uint8Array} bytes
 * @returns {{ family?: string, presets: { name: string, file: any, thumb?: Uint8Array }[],
 *   warnings: string[], error?: string }}
 */
export function readPack(bytes) {
  /** @type {string[]} */
  const warnings = [];
  /** @type {Record<string, Uint8Array>} */
  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    return { presets: [], warnings, error: 'Not an ELDR pack (not a zip file)' };
  }
  /** @type {any} */
  let manifest;
  try {
    manifest = JSON.parse(strFromU8(files['manifest.json']));
  } catch {
    return { presets: [], warnings, error: 'Not an ELDR pack (no manifest)' };
  }
  if (manifest?.format !== PACK_FORMAT) {
    return { presets: [], warnings, error: 'Not an ELDR pack' };
  }
  if (typeof manifest.version === 'number' && manifest.version > PACK_VERSION) {
    warnings.push('Made by a newer ELDR; some presets may load with fixes');
  }
  /** @type {{ name: string, file: any, thumb?: Uint8Array }[]} */
  const presets = [];
  for (const e of Array.isArray(manifest.presets) ? manifest.presets : []) {
    const raw = files[e?.file];
    if (!raw) {
      warnings.push(`“${e?.name ?? e?.file}” is missing from the pack`);
      continue;
    }
    try {
      presets.push({
        name: cleanName(e.name) || 'Preset',
        file: JSON.parse(strFromU8(raw)),
        ...(e.thumb && files[e.thumb] ? { thumb: files[e.thumb] } : {}),
      });
    } catch {
      warnings.push(`“${e?.name}” could not be read`);
    }
  }
  return { family: cleanName(manifest.family), presets, warnings };
}
