import { describe, expect, it } from 'vitest';
import {
  createPresetFolder,
  groupOf,
  nameOf,
  safeName,
  splitKey,
} from '../../src/project/presetFolder.js';

/** A tiny in-memory stand-in for a FileSystemDirectoryHandle. */
function fakeDir(name = 'Presets', permission = 'granted') {
  const files = new Map(); // name → text
  const dirs = new Map(); // name → fakeDir
  const d = {
    kind: 'directory',
    name,
    perm: permission,
    files,
    dirs,
    async queryPermission() {
      return d.perm;
    },
    async requestPermission() {
      d.perm = 'granted';
      return 'granted';
    },
    async *entries() {
      for (const [n, sub] of dirs) yield [n, sub];
      for (const [n] of files) yield [n, fileHandle(n)];
    },
    async getDirectoryHandle(n, o = {}) {
      if (!dirs.has(n)) {
        if (!o.create) throw new Error('NotFound');
        dirs.set(n, fakeDir(n));
      }
      return dirs.get(n);
    },
    async getFileHandle(n, o = {}) {
      if (!files.has(n) && !o.create) throw new Error('NotFound');
      if (!files.has(n)) files.set(n, '');
      return fileHandle(n);
    },
    async removeEntry(n) {
      if (!files.delete(n)) throw new Error('NotFound');
    },
  };
  const fileHandle = (n) => ({
    kind: 'file',
    name: n,
    async getFile() {
      const text = files.get(n) ?? '';
      return { size: text.length, text: async () => text };
    },
    async createWritable() {
      let buf = '';
      return {
        write: async (t) => {
          buf += t;
        },
        close: async () => {
          files.set(n, buf);
        },
      };
    },
  });
  return d;
}

const memHandles = (h = null) => {
  let v = h;
  return {
    get: async () => v,
    set: async (x) => {
      v = x;
    },
    clear: async () => {
      v = null;
    },
  };
};

const effect = (n) => ({ format: 'eldr-vfx', name: n, layers: [] });

describe('presets folder (D-098)', () => {
  it('names and keys: safe file names, subfolders as groups', () => {
    expect(safeName('a/b:c*?')).toBe('a-b-c--');
    expect(safeName('  ..  ')).toBe('preset');
    expect(splitKey(' Fire / Big: torch ')).toEqual([['Fire'], 'Big- torch']);
    expect(groupOf('Fire/Torch')).toBe('Fire');
    expect(nameOf('Fire/Torch')).toBe('Torch');
    expect(groupOf('Torch')).toBe('');
  });

  it('choose → save (subfolders created) → rescan reads them back → remove', async () => {
    const root = fakeDir();
    const f = createPresetFolder({ handles: memHandles(), pick: async () => root });
    expect(f.state()).toBe('none');
    expect(await f.choose()).toBe(true);
    expect(f.state()).toBe('ready');
    expect(await f.save('Torch', effect('Torch'))).toBe('Torch');
    expect(await f.save('Fire/Big torch', effect('Big'))).toBe('Fire/Big torch');
    expect(root.files.has('Torch.eldr.json')).toBe(true);
    expect(root.dirs.get('Fire').files.has('Big torch.eldr.json')).toBe(true);
    // files dropped in from outside, junk and hidden files
    root.dirs.get('Fire').files.set('Copied.eldr.json', JSON.stringify(effect('Copied')));
    root.files.set('notes.txt', 'hi');
    root.files.set('broken.eldr.json', '{not json');
    root.files.set('.hidden.eldr.json', JSON.stringify(effect('x')));
    await f.rescan();
    expect(f.names()).toEqual(['Torch', 'Fire/Big torch', 'Fire/Copied']);
    expect(f.get('Fire/Copied').name).toBe('Copied');
    expect(f.has('Fire/Big torch')).toBe(true);
    expect(await f.remove('Fire/Big torch')).toBe(true);
    expect(f.names()).toEqual(['Torch', 'Fire/Copied']);
    expect(await f.remove('Nope')).toBe(false);
  });

  it('a remembered folder: ready if allowed, otherwise waits for a click to reconnect', async () => {
    const root = fakeDir('P', 'prompt');
    root.files.set('A.eldr.json', JSON.stringify(effect('A')));
    const f = createPresetFolder({ handles: memHandles(root) });
    expect(await f.restore()).toBe('needs-permission');
    expect(f.names()).toEqual([]);
    expect(await f.save('B', effect('B'))).toBe(null); // no writes before permission
    expect(await f.reconnect()).toBe(true);
    expect(f.state()).toBe('ready');
    expect(f.names()).toEqual(['A']);
    expect(f.label()).toBe('P');
  });

  it('cancelled picker changes nothing; disconnect forgets the folder', async () => {
    const handles = memHandles();
    const f = createPresetFolder({
      handles,
      pick: async () => {
        throw new Error('AbortError');
      },
    });
    expect(await f.choose()).toBe(false);
    expect(f.state()).toBe('none');
    const g = createPresetFolder({ handles, pick: async () => fakeDir() });
    await g.choose();
    expect(await handles.get()).not.toBe(null);
    await g.disconnect();
    expect(g.state()).toBe('none');
    expect(await handles.get()).toBe(null);
  });

  it('a folder that disappears is reported as missing', async () => {
    const root = fakeDir();
    const f = createPresetFolder({ handles: memHandles(), pick: async () => root });
    await f.choose();
    root.entries = async function* () {
      throw new Error('NotFoundError');
      // biome-ignore lint/correctness/noUnreachable: generator shape
      yield [];
    };
    expect(await f.rescan()).toBe(false);
    expect(f.state()).toBe('missing');
  });
});
