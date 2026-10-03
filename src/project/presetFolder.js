// @ts-check
/**
 * Presets folder (D-098): "My presets" kept as files in a folder Raul picks once, instead of
 * only in the browser (which can be cleared, does not travel and holds ~5 MB).
 *
 * - One preset = one `Name.eldr.json` (the same format as Save file…, imported images inside).
 * - Subfolders are groups: `Fire/Torch.eldr.json` is "Torch" in the Fire group. Keys are the
 *   path without the extension ("Fire/Torch"); the file name is the preset name, so renaming a
 *   file in Finder renames the preset.
 * - Uses the File System Access API (Chrome / Edge). Reads are served from a cache filled by
 *   `scan()`, so the editor's menus stay synchronous; writes go to disk, then the cache.
 * - The folder handle is remembered (IndexedDB). Browsers ask again for permission in each new
 *   session; that needs a click (`reconnect()`), which the editor offers as a button.
 */

import { EFFECT_FILE_EXT } from './explosionFile.js';

/** How deep subfolders are read (Presets/Group/Sub/…). */
const MAX_DEPTH = 3;
/** Files larger than this are skipped (a broken or unrelated file). */
const MAX_FILE_BYTES = 64 * 1024 * 1024;

/** Is folder access available in this browser? */
export const folderAccessSupported = () => typeof globalThis.showDirectoryPicker === 'function';

/**
 * A safe file / folder name: no path characters, not empty, not too long.
 * @param {string} s
 */
export function safeName(s) {
  const t = [...String(s)]
    .map((c) => (c.charCodeAt(0) < 32 ? '-' : c)) // control characters
    .join('')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100);
  return t || 'preset';
}

/**
 * Split a typed name into folder parts + file name ("Fire/My torch" → [["Fire"], "My torch"]).
 * @param {string} key
 * @returns {[string[], string]}
 */
export function splitKey(key) {
  const parts = String(key)
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .map(safeName);
  const name = parts.pop() ?? 'preset';
  return [parts.slice(0, MAX_DEPTH), name];
}

/** The group (folder path) of a key, '' for the top folder. @param {string} key */
export const groupOf = (key) => {
  const i = key.lastIndexOf('/');
  return i < 0 ? '' : key.slice(0, i);
};
/** The display name of a key. @param {string} key */
export const nameOf = (key) => key.slice(key.lastIndexOf('/') + 1);

/**
 * @typedef {object} HandleStore  where the folder handle is remembered
 * @property {() => Promise<any>} get
 * @property {(h: any) => Promise<void>} set
 * @property {() => Promise<void>} clear
 */

/** IndexedDB-backed handle store (handles can't go into localStorage). @returns {HandleStore} */
export function idbHandleStore() {
  const DB = 'eldr';
  const STORE = 'handles';
  const KEY = 'presetsFolder';
  /** @returns {Promise<IDBDatabase | null>} */
  const open = () =>
    new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  /** @param {'readonly' | 'readwrite'} mode @param {(s: IDBObjectStore) => IDBRequest} fn */
  const run = async (mode, fn) => {
    const db = await open();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  };
  return {
    get: () => run('readonly', (s) => s.get(KEY)),
    set: async (h) => {
      await run('readwrite', (s) => s.put(h, KEY));
    },
    clear: async () => {
      await run('readwrite', (s) => s.delete(KEY));
    },
  };
}

/**
 * @typedef {'none' | 'needs-permission' | 'ready' | 'missing'} FolderState
 *   none: no folder chosen · needs-permission: remembered, waiting for a click ·
 *   ready: reading and writing · missing: the folder can't be read any more
 */

/**
 * @param {{ handles?: HandleStore, pick?: () => Promise<any> }} [deps]
 */
export function createPresetFolder(deps = {}) {
  const handles = deps.handles ?? idbHandleStore();
  const pick =
    deps.pick ??
    (() =>
      /** @type {any} */ (globalThis).showDirectoryPicker({
        id: 'eldr-presets',
        mode: 'readwrite',
      }));
  /** @type {any} */
  let dir = null;
  /** @type {FolderState} */
  let state = 'none';
  /** @type {Map<string, any>} key → saved effect */
  let cache = new Map();

  /** @param {any} h @param {boolean} ask */
  async function permitted(h, ask) {
    const opts = { mode: 'readwrite' };
    try {
      if ((await h.queryPermission?.(opts)) === 'granted') return true;
      if (!ask) return false;
      return (await h.requestPermission?.(opts)) === 'granted';
    } catch {
      return false;
    }
  }

  /** Read every preset file into the cache. @returns {Promise<boolean>} */
  async function scan() {
    if (!dir) return false;
    /** @type {Map<string, any>} */
    const next = new Map();
    /** @param {any} d @param {string} prefix @param {number} depth */
    const walk = async (d, prefix, depth) => {
      for await (const [name, entry] of d.entries()) {
        if (name.startsWith('.')) continue;
        if (entry.kind === 'directory') {
          if (depth < MAX_DEPTH) await walk(entry, `${prefix}${name}/`, depth + 1);
          continue;
        }
        if (!name.toLowerCase().endsWith(EFFECT_FILE_EXT)) continue;
        try {
          const file = await entry.getFile();
          if (file.size > MAX_FILE_BYTES) continue;
          const data = JSON.parse(await file.text());
          if (data && typeof data === 'object') {
            next.set(`${prefix}${name.slice(0, -EFFECT_FILE_EXT.length)}`, data);
          }
        } catch {
          // not a readable effect file: skip it
        }
      }
    };
    try {
      await walk(dir, '', 0);
    } catch {
      state = 'missing';
      return false;
    }
    cache = next;
    state = 'ready';
    return true;
  }

  /** The folder handle for a key's group (created when `create`). @param {string[]} parts @param {boolean} create */
  async function folderFor(parts, create) {
    let d = dir;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return d;
  }

  return {
    supported: folderAccessSupported,
    /** @returns {FolderState} */
    state: () => state,
    /** Folder name for the button. */
    label: () => (dir?.name ? String(dir.name) : ''),
    /**
     * Startup: pick up a remembered folder. Ready if the browser still allows it, otherwise
     * 'needs-permission' (call reconnect() from a click).
     */
    async restore() {
      const h = await handles.get().catch(() => null);
      if (!h) return state;
      dir = h;
      if (await permitted(h, false)) await scan();
      else state = 'needs-permission';
      return state;
    },
    /** From a click: ask the browser again for the remembered folder. */
    async reconnect() {
      if (!dir) return false;
      if (!(await permitted(dir, true))) return false;
      return scan();
    },
    /** From a click: choose a (new) folder. @returns {Promise<boolean>} false = cancelled */
    async choose() {
      let h;
      try {
        h = await pick();
      } catch {
        return false; // cancelled
      }
      if (!h || !(await permitted(h, true))) return false;
      dir = h;
      await handles.set(h).catch(() => {});
      return scan();
    },
    /** Stop using the folder (files stay on disk). */
    async disconnect() {
      dir = null;
      cache = new Map();
      state = 'none';
      await handles.clear().catch(() => {});
    },
    rescan: scan,
    /** Preset keys ("Group/Name"), sorted by group then name. */
    names: () =>
      [...cache.keys()].sort(
        (a, b) => groupOf(a).localeCompare(groupOf(b)) || nameOf(a).localeCompare(nameOf(b)),
      ),
    /** @param {string} key */
    get: (key) => cache.get(key) ?? null,
    /** @param {string} key */
    has: (key) => cache.has(splitKey(key).flat().join('/')),
    /** Normalised key for a typed name ("Fire / my:torch" → "Fire/my-torch"). @param {string} key */
    keyOf: (key) => {
      const [parts, name] = splitKey(key);
      return [...parts, name].join('/');
    },
    /**
     * Write a preset file. @param {string} key @param {any} file
     * @returns {Promise<string | null>} the key it was saved under, or null on failure
     */
    async save(key, file) {
      if (state !== 'ready' || !dir) return null;
      const [parts, name] = splitKey(key);
      try {
        const d = await folderFor(parts, true);
        const fh = await d.getFileHandle(`${name}${EFFECT_FILE_EXT}`, { create: true });
        const w = await fh.createWritable();
        await w.write(`${JSON.stringify(file, null, 2)}\n`);
        await w.close();
      } catch {
        return null;
      }
      const k = [...parts, name].join('/');
      cache.set(k, file);
      return k;
    },
    /** Delete a preset file. @param {string} key @returns {Promise<boolean>} */
    async remove(key) {
      if (state !== 'ready' || !dir) return false;
      const [parts, name] = splitKey(key);
      try {
        const d = await folderFor(parts, false);
        await d.removeEntry(`${name}${EFFECT_FILE_EXT}`);
      } catch {
        return false;
      }
      cache.delete([...parts, name].join('/'));
      return true;
    },
  };
}
