// @ts-check
/**
 * Single source of truth for the app's identity and version.
 * Keep `APP_VERSION` in sync with package.json (checked by tests/unit/smoke.test.js).
 */
export const APP_NAME = 'ELDR';
export const APP_VERSION = '0.0.80';

/** Project file format id and version (§3.7). Bump it when the file layout changes, and keep older versions loading (see src/project/explosionFile.js: v1 → v2). */
export const FILE_FORMAT = 'eldr-vfx';
export const FILE_FORMAT_VERSION = 4;
