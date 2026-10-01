import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_VERSION, FILE_FORMAT_VERSION } from '../../src/version.js';

describe('scaffold smoke test', () => {
  it('has the app name ELDR', () => {
    expect(APP_NAME).toBe('ELDR');
  });

  it('keeps src/version.js in sync with package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('uses an integer file-format version', () => {
    expect(Number.isInteger(FILE_FORMAT_VERSION)).toBe(true);
  });

  it('can import every source module stub', async () => {
    const modules = [
      'core',
      'schema',
      'render',
      'shapes',
      'elements',
      'effects',
      'pixel',
      'export',
      'ui',
      'project',
    ];
    for (const name of modules) {
      await expect(import(`../../src/${name}/index.js`)).resolves.toBeDefined();
    }
  });
});
