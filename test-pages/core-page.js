// @ts-check
// Visual check page for step 0.2. Not part of the app — it only exercises src/core.
import { createNoise, createRng, EASING_NAMES, EASINGS, TAU } from '../src/core/index.js';

/** @param {string} id */
const $ = (id) => /** @type {any} */ (document.getElementById(id));

// ---------- Noise ----------
const noiseCanvas = /** @type {HTMLCanvasElement} */ ($('noise'));
const nctx = /** @type {CanvasRenderingContext2D} */ (noiseCanvas.getContext('2d'));
const image = nctx.createImageData(noiseCanvas.width, noiseCanvas.height);
const LOOP_SECONDS = 4; // one full loop always takes 4 s; fps only changes how many frames it has
let noise = createNoise(Number($('noise-seed').value));
let frame = 0;
const fps = () => Number($('noise-fps').value);
const loopFrames = () => fps() * LOOP_SECONDS;

function drawNoise() {
  const mode = $('noise-mode').value;
  const scale = Number($('noise-scale').value);
  const { width, height } = noiseCanvas;
  const t = frame / loopFrames(); // 0–1 over one loop
  const a = TAU * t;
  const radius = 0.6; // size of the circle in noise space — bigger = more change per loop
  const cz = Math.cos(a) * radius;
  const cw = Math.sin(a) * radius;
  const start = performance.now();
  const data = image.data;
  for (let py = 0; py < height; py++) {
    const y = (py / width) * scale;
    for (let px = 0; px < width; px++) {
      const x = (px / width) * scale;
      let v;
      if (mode === '2d') v = noise.noise2D(x, y);
      else if (mode === '3d') v = noise.noise3D(x, y, t * 2);
      else v = noise.noise4D(x, y, cz, cw);
      const c = Math.round((v * 0.5 + 0.5) * 255);
      const i = (py * width + px) * 4;
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  nctx.putImageData(image, 0, 0);
  const ms = (performance.now() - start).toFixed(1);
  const frameLabel = mode === '2d' ? '' : ` · ${fps()} fps · frame ${frame + 1}/${loopFrames()}`;
  $('noise-info').textContent = `${ms} ms${frameLabel}`;
}

function setNoiseSeed(/** @type {number} */ seed) {
  $('noise-seed').value = String(seed);
  noise = createNoise(seed);
  drawNoise();
}

$('noise-seed').addEventListener('change', () => setNoiseSeed(Number($('noise-seed').value) | 0));
$('noise-dice').addEventListener('click', () => setNoiseSeed(Math.floor(Math.random() * 1e6)));
$('noise-mode').addEventListener('change', drawNoise);
$('noise-scale').addEventListener('input', drawNoise);

// Playback is driven by elapsed time, so the chosen fps is accurate (frames are never "late").
let playStart = performance.now();
let lastFps = fps();
function tickNoise(/** @type {number} */ now) {
  if (fps() !== lastFps) {
    // Keep the same point in the loop when the fps changes.
    lastFps = fps();
    playStart = now - (frame / loopFrames()) * LOOP_SECONDS * 1000;
  }
  if ($('noise-play').checked && $('noise-mode').value !== '2d') {
    const next = Math.floor(((now - playStart) / 1000) * fps()) % loopFrames();
    if (next !== frame) {
      frame = next;
      drawNoise();
    }
  } else {
    playStart = now - (frame / fps()) * 1000; // resume from the current frame
  }
  requestAnimationFrame(tickNoise);
}

// ---------- Easings ----------
const easingCanvases = EASING_NAMES.map((name) => {
  const box = document.createElement('div');
  box.className = 'easing';
  const canvas = document.createElement('canvas');
  canvas.width = 140;
  canvas.height = 110;
  box.append(canvas, name);
  $('easings').append(box);
  return { name, canvas };
});

function drawEasings(/** @type {number} */ now) {
  const t = ((now / 1600) % 1.25) / 1; // move 0→1, then hold briefly at the end
  const dotT = Math.min(t, 1);
  for (const { name, canvas } of easingCanvases) {
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    const fn = EASINGS[name];
    const w = canvas.width;
    const h = canvas.height;
    const pad = 22; // room above/below for overshoot
    const toY = (/** @type {number} */ v) => h - pad - v * (h - 2 * pad);
    const toX = (/** @type {number} */ u) => 8 + u * (w - 16);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#3a3b44';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, toY(0));
    ctx.lineTo(w, toY(0));
    ctx.moveTo(0, toY(1));
    ctx.lineTo(w, toY(1));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#d9dae0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      if (i === 0) ctx.moveTo(toX(u), toY(fn(u)));
      else ctx.lineTo(toX(u), toY(fn(u)));
    }
    ctx.stroke();
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.arc(toX(dotT), toY(fn(dotT)), 4, 0, TAU);
    ctx.fill();
  }
  requestAnimationFrame(drawEasings);
}

// ---------- Random ----------
function drawRng() {
  const seed = Number($('rng-seed').value) | 0;
  const rng = createRng(seed);
  const first = Array.from({ length: 6 }, () => rng.next().toFixed(8));
  $('rng-first').innerHTML = `seed ${seed}<br>${first.join('<br>')}`;

  const bins = new Array(40).fill(0);
  const n = 200_000;
  for (let i = 0; i < n; i++) bins[Math.floor(rng.next() * bins.length)]++;
  const canvas = /** @type {HTMLCanvasElement} */ ($('hist'));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const expected = n / bins.length;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bw = canvas.width / bins.length;
  ctx.fillStyle = '#ff8a3d';
  bins.forEach((count, i) => {
    const bh = (count / (expected * 1.5)) * canvas.height;
    ctx.fillRect(i * bw + 1, canvas.height - bh, bw - 2, bh);
  });
  ctx.strokeStyle = '#d9dae0';
  ctx.setLineDash([4, 4]);
  const ey = canvas.height - canvas.height / 1.5;
  ctx.beginPath();
  ctx.moveTo(0, ey);
  ctx.lineTo(canvas.width, ey);
  ctx.stroke();
  ctx.setLineDash([]);
}

$('rng-seed').addEventListener('change', drawRng);
$('rng-dice').addEventListener('click', () => {
  $('rng-seed').value = String(Math.floor(Math.random() * 1e6)); // UI only, not render path
  drawRng();
});

drawNoise();
drawRng();
requestAnimationFrame(tickNoise);
requestAnimationFrame(drawEasings);
