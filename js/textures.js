// Procedural, gritty canvas textures (no external assets).
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rep, srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
function grain(g, w, h, r, n, a) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * n; d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.9; }
  g.putImageData(id, 0, 0);
}

// Weathered planks running along u (hull length); rows along v.
export function planks({ base = [58, 42, 30], rows = 8, seed = 1, w = 512, h = 512, tar = 0.55, light = 1 } = {}) {
  const r = rng(seed); const [c, g] = cv(w, h);
  const rh = h / rows;
  for (let i = 0; i < rows; i++) {
    let x = 0;
    while (x < w) {
      const len = 90 + r() * 200, k = (0.75 + r() * 0.45) * light;
      g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
      g.fillRect(x, i * rh, len, rh);
      // grain streaks
      for (let s = 0; s < 14; s++) {
        const y = i * rh + r() * rh; g.strokeStyle = `rgba(${r() < 0.5 ? '20,12,8' : '120,96,70'},${0.08 + r() * 0.12})`;
        g.lineWidth = 0.6 + r() * 1.4; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 4, x + len * 0.6, y + (r() - 0.5) * 4, x + len, y + (r() - 0.5) * 3); g.stroke();
      }
      g.fillStyle = `rgba(10,6,4,${tar})`; g.fillRect(x + len - 2, i * rh, 2, rh); // butt joint
      if (r() < 0.6) { g.fillStyle = 'rgba(20,14,10,.8)'; g.beginPath(); g.arc(x + 6, i * rh + rh * 0.3, 1.6, 0, 7); g.arc(x + 6, i * rh + rh * 0.7, 1.6, 0, 7); g.fill(); } // trenails
      x += len;
    }
    g.fillStyle = `rgba(8,5,3,${tar})`; g.fillRect(0, i * rh, w, 2.5); // caulked seam
  }
  // grime, salt and water stains
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = r() * h, rad = 10 + r() * 60, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const salt = r() < 0.3; gr.addColorStop(0, salt ? 'rgba(170,165,150,.10)' : 'rgba(10,8,6,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  grain(g, w, h, r, 26);
  return tex(c);
}

export function sailCloth({ base = [196, 182, 150], seed = 3, patches = 5, dark = 0 } = {}) {
  const r = rng(seed); const [c, g] = cv(256, 256);
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, 256, 256);
  // panels (vertical cloths) with seams
  for (let x = 0; x < 256; x += 32) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.fillRect(x, 0, 32, 256); g.fillStyle = 'rgba(60,45,30,.35)'; g.fillRect(x, 0, 1.5, 256); }
  // reef bands
  for (let y = 60; y < 200; y += 60) { g.fillStyle = 'rgba(70,55,40,.35)'; g.fillRect(0, y, 256, 2); }
  for (let i = 0; i < patches; i++) { const x = r() * 220, y = r() * 220, w = 14 + r() * 30, h = 14 + r() * 26; g.fillStyle = `rgba(${r() < .5 ? '120,100,70' : '210,200,170'},.45)`; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(50,38,25,.5)'; g.strokeRect(x, y, w, h); }
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(0,0,0,.05)'); gr.addColorStop(1, `rgba(40,30,15,${0.35 + dark})`); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) { const x = r() * 256, y = r() * 256, rad = 6 + r() * 30, rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, 'rgba(40,30,20,.18)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  grain(g, 256, 256, r, 22);
  return tex(c);
}

export function flagTex(kind) {
  const [c, g] = cv(128, 80);
  if (kind === 'pirate') {
    g.fillStyle = '#121010'; g.fillRect(0, 0, 128, 80);
    g.fillStyle = '#d8d0bb'; g.beginPath(); g.arc(64, 32, 14, 0, 7); g.fill(); g.fillRect(56, 40, 16, 9);
    g.fillStyle = '#121010'; g.beginPath(); g.arc(58, 31, 4, 0, 7); g.arc(70, 31, 4, 0, 7); g.fill(); g.fillRect(62, 38, 4, 4);
    g.strokeStyle = '#d8d0bb'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(38, 52); g.lineTo(90, 70); g.moveTo(90, 52); g.lineTo(38, 70); g.stroke();
  } else if (kind === 'navy') {
    g.fillStyle = '#e9e3d2'; g.fillRect(0, 0, 128, 80); g.fillStyle = '#8c1d18'; g.fillRect(52, 0, 24, 80); g.fillRect(0, 28, 128, 24);
  } else {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e3d9bf' : '#9b2d20'; g.fillRect(0, i * 10, 128, 10); } g.fillStyle = '#23324a'; g.fillRect(0, 0, 52, 40);
  }
  g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * 128, Math.random() * 80, 3 + Math.random() * 8, 2);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function softDot() {
  const [c, g] = cv(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
}
export function puff() {
  const r = rng(9); const [c, g] = cv(128, 128);
  for (let i = 0; i < 26; i++) { const x = 64 + (r() - 0.5) * 60, y = 64 + (r() - 0.5) * 60, rad = 14 + r() * 24, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const m = g.createRadialGradient(64, 64, 30, 64, 64, 64); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = m; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
export function foamTex() {
  const r = rng(5); const [c, g] = cv(256, 256); g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { const x = r() * 256, y = r() * 256, rad = 1 + r() * 7; g.fillStyle = `rgba(235,240,235,${0.15 + r() * 0.5})`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export function ground(seed = 7) {
  const r = rng(seed); const [c, g] = cv(256, 256);
  g.fillStyle = '#857a68'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) { const x = r() * 256, y = r() * 256, rad = 2 + r() * 14; g.fillStyle = `rgba(${r() < .5 ? '30,28,24' : '120,110,92'},${0.1 + r() * 0.2})`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
  grain(g, 256, 256, r, 40); return tex(c, [24, 24]);
}
export function stoneWall(seed = 11) {
  const r = rng(seed); const [c, g] = cv(256, 256); g.fillStyle = '#3d3a35'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 24) for (let x = (y / 24 % 2) * 20 - 20; x < 256; x += 40) { const k = 0.7 + r() * 0.5; g.fillStyle = `rgb(${110 * k | 0},${104 * k | 0},${94 * k | 0})`; g.fillRect(x + 2, y + 2, 36, 20); }
  grain(g, 256, 256, r, 40); return tex(c);
}
