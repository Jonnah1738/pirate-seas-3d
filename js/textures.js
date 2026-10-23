// Procedural, gritty canvas textures (no external assets).
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; }
function tex(c, rep, srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
function grain(g, w, h, r, n, a) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * n; d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.9; }
  g.putImageData(id, 0, 0);
}

// ---- PBR helpers: grayscale height canvas -> tangent-space normal map; grayscale roughness canvas ----
export function heightToNormal(hc, strength = 2) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h); for (let i = 0; i < w * h; i++) H[i] = src[i * 4] / 255;
  const [c, g] = cv(w, h), out = g.createImageData(w, h), d = out.data;
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (H[ym + xp] + 2 * H[y0 + xp] + H[yp + xp]) - (H[ym + xm] + 2 * H[y0 + xm] + H[yp + xm]);
      const dy = (H[yp + xm] + 2 * H[yp + x] + H[yp + xp]) - (H[ym + xm] + 2 * H[ym + x] + H[ym + xp]);
      const nx = -dx * strength, ny = dy * strength, il = 1 / Math.sqrt(nx * nx + ny * ny + 1), i = (y0 + x) * 4;
      d[i] = (nx * il * 0.5 + 0.5) * 255; d[i + 1] = (ny * il * 0.5 + 0.5) * 255; d[i + 2] = (il * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0); return tex(c, null, false);
}
function gray(g, v, a = 1) { g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},${a})`; }
function noiseFill(g, w, h, r, amp) { const id = g.getImageData(0, 0, w, h), d = id.data; for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * amp; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(id, 0, 0); }

// Weathered planks running along u (hull length); rows along v.  Returns the albedo texture and attaches
// .normal / .rough companions (shared layout, so the companion maps stay aligned with the colour).
export function planks({ base = [58, 42, 30], rows = 8, seed = 1, w = 512, h = 512, tar = 0.55, light = 1, pbr = true } = {}) {
  const r = rng(seed); const [c, g] = cv(w, h); const [hc, hg] = cv(w, h); const [rc, rg] = cv(w / 2, h / 2);
  gray(hg, 150); hg.fillRect(0, 0, w, h); gray(rg, 205); rg.fillRect(0, 0, w / 2, h / 2);
  const rh = h / rows;
  for (let i = 0; i < rows; i++) {
    let x = 0;
    while (x < w) {
      const len = 90 + r() * 200, k = (0.75 + r() * 0.45) * light, ph = 130 + r() * 50;
      g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
      g.fillRect(x, i * rh, len, rh);
      gray(hg, ph); hg.fillRect(x, i * rh, len, rh);
      // plank faces are slightly convex: brighter (higher) middle band
      const hgG = hg.createLinearGradient(0, i * rh, 0, i * rh + rh); hgG.addColorStop(0, 'rgba(0,0,0,.35)'); hgG.addColorStop(0.18, 'rgba(0,0,0,0)'); hgG.addColorStop(0.82, 'rgba(0,0,0,0)'); hgG.addColorStop(1, 'rgba(0,0,0,.35)');
      hg.fillStyle = hgG; hg.fillRect(x, i * rh, len, rh);
      const rk = 175 + r() * 60; gray(rg, rk); rg.fillRect(x / 2, i * rh / 2, len / 2, rh / 2);
      // grain streaks (colour + carved grooves in the height map)
      for (let s = 0; s < 14; s++) {
        const y = i * rh + r() * rh, dark = r() < 0.5, lw = 0.6 + r() * 1.4, y1 = y + (r() - 0.5) * 4, y2 = y + (r() - 0.5) * 4, y3 = y + (r() - 0.5) * 3;
        g.strokeStyle = `rgba(${dark ? '20,12,8' : '120,96,70'},${0.08 + r() * 0.12})`; g.lineWidth = lw;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y1, x + len * 0.6, y2, x + len, y3); g.stroke();
        hg.strokeStyle = `rgba(${dark ? '40,40,40' : '200,200,200'},${0.25 + r() * 0.2})`; hg.lineWidth = lw;
        hg.beginPath(); hg.moveTo(x, y); hg.bezierCurveTo(x + len * 0.3, y1, x + len * 0.6, y2, x + len, y3); hg.stroke();
      }
      g.fillStyle = `rgba(10,6,4,${tar})`; g.fillRect(x + len - 2, i * rh, 2, rh); // butt joint
      gray(hg, 20); hg.fillRect(x + len - 2, i * rh, 2.5, rh); gray(rg, 120); rg.fillRect((x + len - 2) / 2, i * rh / 2, 1.5, rh / 2);
      if (r() < 0.6) { // trenails
        g.fillStyle = 'rgba(20,14,10,.8)'; g.beginPath(); g.arc(x + 6, i * rh + rh * 0.3, 1.6, 0, 7); g.arc(x + 6, i * rh + rh * 0.7, 1.6, 0, 7); g.fill();
        gray(hg, 90); hg.beginPath(); hg.arc(x + 6, i * rh + rh * 0.3, 2, 0, 7); hg.arc(x + 6, i * rh + rh * 0.7, 2, 0, 7); hg.fill();
      }
      x += len;
    }
    g.fillStyle = `rgba(8,5,3,${tar})`; g.fillRect(0, i * rh, w, 2.5); // caulked seam (tar: glossy)
    gray(hg, 10); hg.fillRect(0, i * rh - 0.5, w, 3.5); gray(rg, 95); rg.fillRect(0, i * rh / 2, w / 2, 1.8);
  }
  // grime, salt and water stains (salt = rough & bright, wet grime = smoother)
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = r() * h, rad = 10 + r() * 60, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const salt = r() < 0.3; gr.addColorStop(0, salt ? 'rgba(170,165,150,.10)' : 'rgba(10,8,6,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    const rr = rg.createRadialGradient(x / 2, y / 2, 0, x / 2, y / 2, rad / 2); rr.addColorStop(0, salt ? 'rgba(255,255,255,.25)' : 'rgba(60,60,60,.25)'); rr.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = rr; rg.fillRect((x - rad) / 2, (y - rad) / 2, rad, rad);
  }
  grain(g, w, h, r, 26); noiseFill(hg, w, h, r, 22);
  const t = tex(c);
  if (pbr) { t.userData.normal = heightToNormal(hc, 2.2); t.userData.rough = tex(rc, null, false); }
  return t;
}

export function sailCloth({ base = [196, 182, 150], seed = 3, patches = 5, dark = 0 } = {}) {
  const r = rng(seed); const [c, g] = cv(256, 256); const [hc, hg] = cv(256, 256);
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, 256, 256); gray(hg, 128); hg.fillRect(0, 0, 256, 256);
  // panels (vertical cloths) with doubled, stitched seams
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.fillRect(x, 0, 32, 256); g.fillStyle = 'rgba(60,45,30,.35)'; g.fillRect(x, 0, 1.5, 256);
    gray(hg, 200); hg.fillRect(x - 1.5, 0, 4, 256); gray(hg, 70); hg.fillRect(x + 0.5, 0, 1, 256);
  }
  // reef bands
  for (let y = 60; y < 200; y += 60) { g.fillStyle = 'rgba(70,55,40,.35)'; g.fillRect(0, y, 256, 2); gray(hg, 210); hg.fillRect(0, y - 1, 256, 4); for (let x = 8; x < 256; x += 16) { gray(hg, 60); hg.fillRect(x, y - 2, 2, 6); } }
  for (let i = 0; i < patches; i++) {
    const x = r() * 220, y = r() * 220, w = 14 + r() * 30, h = 14 + r() * 26;
    g.fillStyle = `rgba(${r() < .5 ? '120,100,70' : '210,200,170'},.45)`; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(50,38,25,.5)'; g.strokeRect(x, y, w, h);
    gray(hg, 160); hg.fillRect(x, y, w, h); hg.strokeStyle = 'rgb(220,220,220)'; hg.lineWidth = 2; hg.strokeRect(x, y, w, h);
  }
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(0,0,0,.05)'); gr.addColorStop(1, `rgba(40,30,15,${0.35 + dark})`); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) { const x = r() * 256, y = r() * 256, rad = 6 + r() * 30, rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, 'rgba(40,30,20,.18)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  // canvas weave
  for (let y = 0; y < 256; y += 2) { gray(hg, 0, 0.08); hg.fillRect(0, y, 256, 1); }
  for (let x = 0; x < 256; x += 2) { gray(hg, 255, 0.06); hg.fillRect(x, 0, 1, 256); }
  grain(g, 256, 256, r, 22); noiseFill(hg, 256, 256, r, 18);
  const t = tex(c); t.userData.normal = heightToNormal(hc, 1.6); return t;
}

// Tarred hemp: three strands twisting along v (rope length), u around the rope.
export function ropeTex() {
  const W = 64, H = 64; const [c, g] = cv(W, H); const [hc, hg] = cv(W, H); const r = rng(17);
  const id = hg.createImageData(W, H), d = id.data, ic = g.createImageData(W, H), e = ic.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((x / W) * 3 + (y / H) * 3) % 1; const prof = Math.sin(s * Math.PI); const fib = Math.sin((x / W * 3 - y / H * 9) * Math.PI * 2) * 0.12;
    const v = Math.max(0, Math.min(1, Math.pow(prof, 0.6) * 0.85 + fib + (r() - 0.5) * 0.08)); const i = (y * W + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = v * 255; d[i + 3] = 255;
    const k = 0.55 + v * 0.45; e[i] = 52 * k; e[i + 1] = 41 * k; e[i + 2] = 28 * k; e[i + 3] = 255;
  }
  hg.putImageData(id, 0, 0); g.putImageData(ic, 0, 0);
  const t = tex(c); t.userData.normal = heightToNormal(hc, 3); return t;
}

// Tileable capillary ripples for the sea (normal in RG/B) and a foam/streak pattern in A. DataTexture: no canvas premultiply.
export function waterTex(N = 256) {
  const r = rng(91), H = new Float32Array(N * N), F = new Float32Array(N * N);
  const waves = [];
  for (let i = 0; i < 48; i++) { let kx, ky; do { kx = Math.round((r() - 0.5) * 22); ky = Math.round((r() - 0.5) * 22); } while (!kx && !ky); const k = Math.hypot(kx, ky); waves.push([kx, ky, 1 / Math.pow(k, 1.25), r() * 6.283]); }
  const fw = []; for (let i = 0; i < 30; i++) { let kx, ky; do { kx = Math.round((r() - 0.5) * 14); ky = Math.round((r() - 0.5) * 14); } while (!kx && !ky); fw.push([kx, ky, 1 / Math.hypot(kx, ky), r() * 6.283]); }
  const TAU = Math.PI * 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * TAU, v = y / N * TAU; let h = 0, f = 0;
    for (const [kx, ky, a, p] of waves) h += a * Math.sin(kx * u + ky * v + p);
    for (const [kx, ky, a, p] of fw) f += a * Math.sin(kx * u + ky * v + p);
    // sharpen crests a little (choppy capillaries)
    H[y * N + x] = h; F[y * N + x] = f;
  }
  let fmin = 1e9, fmax = -1e9; for (const v of F) { fmin = Math.min(fmin, v); fmax = Math.max(fmax, v); }
  const data = new Uint8Array(N * N * 4), s = N / 40;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, hx = H[y * N + (x + 1) % N] - H[y * N + (x - 1 + N) % N], hy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
    let nx = -hx * s, ny = -hy * s, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const foam = (F[i] - fmin) / (fmax - fmin);
    data[i * 4] = (nx * 0.5 + 0.5) * 255; data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; data[i * 4 + 3] = foam * 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
  return t;
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
