// Port island: rocky terrain, wooden pier, harbour town with lit windows, stone lighthouse, palms.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { planks, ground, stoneWall } from './textures.js';

export const ISLAND = { x: 0, z: 0, R: 190 };
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x, z) { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (hash(ix, iz) * (1 - u) + hash(ix + 1, iz) * u) * (1 - v) + (hash(ix, iz + 1) * (1 - u) + hash(ix + 1, iz + 1) * u) * v; }
export function islandH(x, z) {
  const dx = x - ISLAND.x, dz = z - ISLAND.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  const edge = ISLAND.R * (0.86 + 0.14 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 7));
  const t = r / edge;
  let h = t < 1 ? 34 * Math.pow(1 - t * t, 1.3) : -10 * Math.min(1, (t - 1) * 3.2) ;
  if (t < 1) h += (noise(x * 0.03, z * 0.03) - 0.5) * 16 * (1 - t) + (noise(x * 0.11, z * 0.11) - 0.5) * 3;
  // harbour flat near the pier (south side, +z)
  const hx = x - 0, hz = z - (ISLAND.R * 0.82);
  const hd = Math.hypot(hx * 0.8, hz);
  if (hd < 55) h = h * Math.min(1, hd / 55) + 2.2 * (1 - Math.min(1, hd / 55));
  return h - 1.2;
}
export const PIER = { x: 0, z0: ISLAND.R * 0.82 + 10, z1: ISLAND.R * 0.82 + 78, w: 6 };
export const DOCK = { x: 10.5, z: PIER.z1 - 14, heading: 0 }; // berth alongside the pier, bow toward shore

export function buildIsland(scene, low) {
  const group = new THREE.Group();
  // terrain
  const rings = low ? 50 : 90, segs = low ? 72 : 128, RR = ISLAND.R * 1.45;
  const pos = [], col = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j < segs; j++) {
    const r = RR * Math.pow(i / rings, 0.85), a = j / segs * Math.PI * 2, x = ISLAND.x + Math.cos(a) * r, z = ISLAND.z + Math.sin(a) * r, y = islandH(x, z);
    pos.push(x, y, z); uv.push(x * 0.02, z * 0.02);
    const n = noise(x * 0.2, z * 0.2);
    let c = y < 1.2 ? [0.62, 0.55, 0.42] : y < 3 ? [0.5, 0.46, 0.36] : [0.36 + n * 0.1, 0.36 + n * 0.06, 0.24];
    if (y > 3 && n > 0.55) c = [0.26, 0.31, 0.18];
    if (y > 16) c = [0.42, 0.4, 0.37];
    if (y < -0.5) c = [0.3, 0.3, 0.26];
    col.push(...c);
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * segs + j, b = i * segs + (j + 1) % segs, c = a + segs, d = b + segs; idx.push(a, b, c, b, d, c); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
  const gt = ground();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: gt, vertexColors: true, roughness: 0.97 })); group.add(terrain);

  const wood = new THREE.MeshStandardMaterial({ map: planks({ base: [84, 70, 54], rows: 6, seed: 41, tar: 0.6 }), roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ map: stoneWall(), roughness: 0.95 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x4a2f22, roughness: 0.9, map: planks({ base: [110, 70, 50], rows: 14, seed: 5, tar: 0.7 }) });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffa64a });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2d3a1e, roughness: 0.9, side: THREE.DoubleSide });
  const B = { wood: [], stone: [], roof: [], glow: [], leaf: [] };
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), cyl = new THREE.CylinderGeometry(1, 1, 1, 8).toNonIndexed();
  const prism = (() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 0.6); s.lineTo(-0.5, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g.index ? g.toNonIndexed() : g; })();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const put = (k, g, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => { q.setFromEuler(e.set(rx, ry, rz)); m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)); const c = g.clone(); c.applyMatrix4(m4); if (!c.attributes.uv) return; B[k].push(c); };
  // pier
  const pl = PIER.z1 - PIER.z0 + 30, pz = (PIER.z0 - 30 + PIER.z1) / 2;
  put('wood', box, PIER.x, 1.6, pz, PIER.w, 0.35, pl);
  for (let z = PIER.z0 - 25; z <= PIER.z1; z += 5) for (const sx of [-1, 1]) { put('wood', cyl, PIER.x + sx * (PIER.w / 2 + 0.1), -2, z, 0.28, 8, 0.28); if ((z | 0) % 15 === 0) { put('wood', cyl, PIER.x + sx * (PIER.w / 2 + 0.1), 2.6, z, 0.06, 1.8, 0.06); put('glow', box, PIER.x + sx * (PIER.w / 2 + 0.1), 3.6, z, 0.3, 0.4, 0.3); } }
  put('wood', box, PIER.x + 2, 2.2, PIER.z1 - 6, 1.2, 0.9, 1.2, 0.4); put('wood', cyl, PIER.x - 1.8, 2.2, PIER.z1 - 10, 0.45, 1.1, 0.45);
  // town on the harbour flat
  const houses = [[-28, 0, 8, 6, 9], [-12, -6, 7, 5, 7], [18, -2, 10, 6, 8], [34, 6, 7, 5, 7], [-40, 14, 6, 4, 6], [5, -22, 12, 7, 10]];
  for (const [hx, hz, w, h, d] of houses) {
    const x = hx, z = ISLAND.R * 0.82 + hz - 20, y = Math.max(islandH(x, z), 1.5); const ry = Math.atan2(-x, 60) * 0.3;
    put('stone', box, x, y + h / 2 - 1, z, w, h + 2, d, ry);
    put('roof', prism, x, y + h - 0.95, z, w + 1.2, (w + 1.2) * 0.8, d + 1, ry);
    for (let k = -1; k <= 1; k += 2) put('glow', box, x + k * w * 0.25, y + h * 0.45, z + d / 2 + 0.06, 0.9, 1.1, 0.06, ry);
  }
  // lighthouse on the headland
  const lx = 95, lz = 60, ly = islandH(lx, lz);
  put('stone', cyl, lx, ly + 11, lz, 4, 24, 4); put('stone', cyl, lx, ly + 23.5, lz, 5, 1, 5); put('glow', cyl, lx, ly + 25.5, lz, 2.2, 3, 2.2); put('roof', cyl, lx, ly + 27.6, lz, 3, 1.2, 3);
  // palms
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < (low ? 14 : 30); i++) {
    const a = rnd() * 6.28, r = ISLAND.R * (0.45 + rnd() * 0.4), x = Math.cos(a) * r, z = Math.sin(a) * r, y = islandH(x, z);
    if (y < 1.5 || y > 20 || (Math.abs(x) < 50 && z > ISLAND.R * 0.5)) continue;
    const hgt = 9 + rnd() * 6, lean = (rnd() - 0.5) * 0.35;
    put('wood', cyl, x + lean * hgt * 0.5, y + hgt / 2, z, 0.35, hgt, 0.35, 0, 0, lean);
    for (let k = 0; k < 7; k++) put('leaf', box, x + lean * hgt + Math.cos(k * 0.9) * 2.6, y + hgt - 0.6, z + Math.sin(k * 0.9) * 2.6, 5.5, 0.05, 1.1, -k * 0.9, 0, -0.45);
  }
  const mats = { wood, stone, roof, glow, leaf };
  for (const k in B) if (B[k].length) group.add(new THREE.Mesh(mergeGeometries(B[k]), mats[k]));
  // real lights: harbour lantern + lighthouse
  const pierLight = new THREE.PointLight(0xffa24a, low ? 0 : 60, 70, 1.6); pierLight.position.set(PIER.x, 5, PIER.z1 - 12); group.add(pierLight);
  scene.add(group);
  return { group, lights: [pierLight], lighthouse: new THREE.Vector3(lx, ly + 25.5, lz) };
}
