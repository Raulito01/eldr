// @ts-check
import { APP_NAME, APP_VERSION } from './version.js';

/**
 * App entry point. In 0.1 it only proves the module pipeline works:
 * it shows the version and draws a test pattern into the viewport canvas.
 */
function boot() {
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = `v${APP_VERSION}`;
  document.title = `${APP_NAME} v${APP_VERSION}`;

  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('viewport'));
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  // Scaffold test pattern: a centered circle with a crosshair at the pivot.
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.fillStyle = '#ff8a3d';
  ctx.beginPath();
  ctx.arc(cx, cy, canvas.width * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy + 0.5);
  ctx.lineTo(cx + 8, cy + 0.5);
  ctx.moveTo(cx + 0.5, cy - 8);
  ctx.lineTo(cx + 0.5, cy + 8);
  ctx.stroke();
}

boot();
