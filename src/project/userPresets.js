// @ts-check
/**
 * "My presets": Raul's saved explosions, kept in this browser (D-047).
 *
 * Each preset is a full saved-effect object (same as a .eldr.json file), stored under one key.
 * Browser storage can be unavailable or cleared (private window, cleared site data), so every
 * access is guarded and the editor works without it. To keep a preset safe or move it to another
 * machine, save it as a file.
 */

const KEY = 'eldr.explosion.myPresets.v1';

/**
 * @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} StorageLike
 */

/** @returns {StorageLike | null} */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {StorageLike | null} [storage]
 */
export function createUserPresets(storage = defaultStorage()) {
  /** @returns {Record<string, any>} name → saved effect */
  const readAll = () => {
    try {
      const raw = storage?.getItem(KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    } catch {
      return {};
    }
  };
  /** @param {Record<string, any>} all @returns {boolean} saved */
  const writeAll = (all) => {
    try {
      if (!storage) return false;
      storage.setItem(KEY, JSON.stringify(all));
      return true;
    } catch {
      return false;
    }
  };

  return {
    available: () => storage !== null,
    /** Preset names, sorted. */
    names: () => Object.keys(readAll()).sort((a, b) => a.localeCompare(b)),
    /** @param {string} name */
    get: (name) => readAll()[name] ?? null,
    /** @param {string} name @param {Record<string, any>} file @returns {boolean} saved */
    save(name, file) {
      const all = readAll();
      all[name] = file;
      return writeAll(all);
    },
    /** @param {string} name @returns {boolean} */
    remove(name) {
      const all = readAll();
      delete all[name];
      return writeAll(all);
    },
  };
}
