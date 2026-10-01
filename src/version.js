// @ts-check
/**
 * Single source of truth for the app's identity and version.
 * Keep `APP_VERSION` in sync with package.json (checked by tests/unit/smoke.test.js).
 */
export const APP_NAME = 'ELDR';
export const APP_VERSION = '0.0.5';

/** Project file format id and version (§3.7). Bumped only with a migration in /src/project/migrate.js. */
export const FILE_FORMAT = 'eldr-vfx';
export const FILE_FORMAT_VERSION = 1;
