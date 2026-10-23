// Procedural sailing ships: lofted plank hull, deck, bulwarks, masts/spars, animated sails, rigging, guns, helm.
// Local frame: bow = -Z, starboard = +X, up = +Y, waterline at y = 0.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { planks, sailCloth, flagTex } from './textures.js';

const TEX = {};
function T(k, f) { return TEX[k] || (TEX[k] = f()); }
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const TYPES = {
  sloop: { L: 20, B: 6.2, D: 2.2, F: 1.75, masts: [{ z: -1.2, h: 17, rig: 'gaff', top: true }], guns: 3, hull: [58, 42, 30], trim: [92, 34, 26], sail: [196, 182, 150], flag: 'pirate', sprit: 0.36, cabin: false },
  merchant: { L: 27, B: 8, D: 2.8, F: 2.2, masts: [{ z: -5.5, h: 20, rig: 'square' }, { z: 4.2, h: 18.5, rig: 'square' }], guns: 2, hull: [92, 70, 48], trim: [48, 60, 70], sail: [214, 204, 178], flag: 'trade', sprit: 0.3, cabin: true },
  hunter: { L: 25, B: 7.2, D: 2.6, F: 2.0, masts: [{ z: -4.5, h: 20, rig: 'square', top: true }, { z: 4.6, h: 18, rig: 'gaff', top: true }], guns: 4, hull: [34, 30, 28], trim: [120, 92, 40], sail: [150, 140, 125], flag: 'navy', sprit: 0.34, cabin: true, dark: 0.15 },
};

export function buildShip(kind, seed = 1) {
  const P = TYPES[kind]; const { L, B, D, F } = P;
  const group = new THREE.Group(); group.name = kind;
  const hullTex = T('hull' + kind, () => planks({ base: P.hull, rows: 10, seed: seed + 3, tar: 0.6 }));
  const deckTex = T('deck', () => planks({ base: [96, 82, 64], rows: 10, seed: 21, tar: 0.75, light: 0.95 }));
  const sparTex = T('spar', () => planks({ base: [70, 52, 36], rows: 4, seed: 33, tar: 0.3 }));
  const sailTex = T('sail' + kind, () => sailCloth({ base: P.sail, seed: seed + 7, patches: kind === 'merchant' ? 3 : 7, dark: P.dark || 0 }));
  const M = {
    hull: new THREE.MeshStandardMaterial({ map: hullTex, bumpMap: hullTex, bumpScale: 1.2, vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ map: deckTex, bumpMap: deckTex, bumpScale: 0.8, roughness: 0.9, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ map: sparTex, color: 0xb8a48c, roughness: 0.85 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.55, metalness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 1 }),
    brass: new THREE.MeshStandardMaterial({ color: 0x9c7a3c, roughness: 0.4, metalness: 0.85 }),
    sail: new THREE.MeshStandardMaterial({ map: sailTex, roughness: 0.95, side: THREE.DoubleSide }),
  };
  // ---------- hull loft ----------
  const NS = 30, MK = 10;
  const halfB = t => { let w = 1; if (t < 0.42) w = Math.pow(Math.sin(t / 0.42 * Math.PI / 2), 0.8); else if (t > 0.8) w = 1 - 0.3 * Math.pow((t - 0.8) / 0.2, 1.6); return Math.max(0.015, w) * B / 2; };
  const sheer = t => F + 1.1 * Math.pow(Math.max(0, 1 - t / 0.33), 2) + 0.9 * Math.pow(Math.max(0, (t - 0.68) / 0.32), 2);
  const bottom = t => -D * (0.2 + 0.8 * ss(0, 0.24, t)) * (1 - 0.12 * ss(0.86, 1, t));
  const zAt = t => -L / 2 + t * L;
  const pos = [], uv = [], col = [], idx = [];
  const tr = P.trim.map(v => v / 255 * 2.2);
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, b = halfB(t), sh = sheer(t), bo = bottom(t), z = zAt(t);
    const pts = [];
    for (let k = 0; k <= MK; k++) { const a = k / MK * Math.PI / 2; let x = b * Math.pow(Math.cos(a), 0.42); const y = sh - (sh - bo) * Math.pow(Math.sin(a), 1.5); if (k < 2) x *= 0.97 + k * 0.015; pts.push([x, y]); }
    const ring = [...pts, ...pts.slice(0, MK).reverse().map(([x, y]) => [-x, y])];
    let g = 0;
    ring.forEach(([x, y], j) => {
      if (j) g += Math.hypot(x - ring[j - 1][0], y - ring[j - 1][1]);
      pos.push(x, y, z); uv.push(z * 0.16, g * 0.28);
      let c = [1, 1, 1];
      if (y < 0.25) c = [0.42, 0.45, 0.36]; // weed & grime below the waterline
      else if (y < 0.55) c = [0.7, 0.68, 0.6];
      if (y > sh - 0.95 && y < sh - 0.72) c = [0.28, 0.26, 0.25]; // black wale
      if (y > sh - 0.38) c = tr; // painted top strake
      col.push(...c);
    });
  }
  const RW = 2 * MK + 1;
  for (let i = 0; i < NS; i++) for (let j = 0; j < RW - 1; j++) {
    const a = i * RW + j, b2 = (i + 1) * RW + j, c = i * RW + j + 1, d = (i + 1) * RW + j + 1;
    idx.push(a, b2, c, b2, d, c);
  }
  // transom
  const base = pos.length / 3, tz = zAt(1), last = NS * RW;
  pos.push(0, (sheer(1) + bottom(1)) / 2, tz); uv.push(0, 0); col.push(0.8, 0.8, 0.8);
  for (let j = 0; j < RW - 1; j++) idx.push(base, last + j + 1, last + j);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); hg.setIndex(idx); hg.computeVertexNormals();
  const hull = new THREE.Mesh(hg, M.hull); group.add(hull);
  // ---------- deck ----------
  const dY = t => sheer(t) - 0.95;
  const dp = [], du = [], di = [];
  for (let i = 0; i <= NS; i++) { const t = i / NS, b = halfB(t) * 0.955, z = zAt(t); dp.push(-b, dY(t), z, b, dY(t), z); du.push(z * 0.2, -b * 0.3, z * 0.2, b * 0.3); if (i) { const a = (i - 1) * 2; di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2)); dg.setIndex(di); dg.computeVertexNormals();
  group.add(new THREE.Mesh(dg, M.deck));

  // ---------- static parts, merged per material ----------
  const bucket = { wood: [], iron: [], dark: [], brass: [] };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function add(key, geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _q.setFromEuler(_e.set(rx, ry, rz)); _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(_m); if (!g.attributes.uv) return; bucket[key].push(g);
  }
  function rod(key, a, b, r0, r1 = r0, seg = 7) { // cylinder from a to b
    const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1).toNonIndexed();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().addScaledVector(dir, 0.5), q, new THREE.Vector3(1, 1, 1))); bucket[key].push(g);
  }
  // cap rails along the sheer + stanchions
  for (const sd of [1, -1]) {
    let prev = null;
    for (let i = 0; i <= NS; i++) { const t = i / NS, p = new THREE.Vector3(sd * halfB(t) * 0.985, sheer(t) + 0.05, zAt(t)); if (prev) rod('wood', prev, p, 0.11, 0.11, 5); prev = p; if (i % 3 === 1 && t > 0.08) rod('wood', new THREE.Vector3(sd * halfB(t) * 0.94, dY(t), zAt(t)), p, 0.06, 0.06, 4); }
  }
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 10), cylLo = new THREE.CylinderGeometry(1, 1, 1, 6);
  // guns
  const muzzles = { port: [], star: [] };
  const gz0 = -L * 0.22, gz1 = L * 0.2;
  for (let g = 0; g < P.guns; g++) {
    const z = P.guns === 1 ? 0 : gz0 + (gz1 - gz0) * g / (P.guns - 1), t = (z + L / 2) / L, b = halfB(t), y = dY(t) + 0.55;
    for (const sd of [1, -1]) {
      add('dark', box, sd * (b + 0.02), y, z, 0, 0, 0, 0.12, 0.62, 0.68); // gunport
      add('wood', box, sd * (b - 0.85), dY(t) + 0.25, z, 0, 0, 0, 1.1, 0.4, 0.75); // carriage
      add('iron', cyl, sd * (b - 0.2), y, z, 0, 0, Math.PI / 2, 0.15, 1.9, 0.15); // barrel
      add('iron', cyl, sd * (b + 0.72), y, z, 0, 0, Math.PI / 2, 0.19, 0.18, 0.19); // muzzle ring
      (sd > 0 ? muzzles.star : muzzles.port).push(new THREE.Vector3(sd * (b + 0.9), y, z));
    }
  }
  // deck furniture
  const tMid = 0.5, dm = dY(tMid);
  add('wood', box, 0, dm + 0.2, -L * 0.08 + 2.2, 0, 0, 0, 1.8, 0.45, 1.6); // hatch
  add('dark', box, 0, dm + 0.43, -L * 0.08 + 2.2, 0, 0, 0, 1.5, 0.03, 1.3);
  for (let i = 0; i < 4; i++) add('wood', cylLo, (i % 2 ? 1 : -1) * (B * 0.3), dm + 0.45, L * 0.1 + i * 0.7, 0, 0, 0, 0.32, 0.9, 0.32); // barrels
  add('wood', box, -B * 0.22, dm + 0.35, -L * 0.25, 0, 0.3, 0, 1, 0.7, 0.8); // crate
  const coil = new THREE.TorusGeometry(0.35, 0.09, 5, 12);
  add('wood', coil, B * 0.25, dm + 0.1, -L * 0.15, Math.PI / 2, 0, 0); add('wood', coil, -B * 0.25, dm + 0.1, L * 0.25, Math.PI / 2, 0, 0);
  // stern cabin for bigger ships
  if (P.cabin) {
    const t0 = 0.8, z = zAt(0.9), y0 = dY(t0);
    add('wood', box, 0, y0 + 0.8, z, 0, 0, 0, B * 0.62, 1.6, L * 0.16);
    add('wood', box, 0, y0 + 1.65, z, 0, 0, 0, B * 0.68, 0.12, L * 0.17);
  }
  // helm
  const tH = P.cabin ? 0.72 : 0.8, helmZ = zAt(tH), helmY = dY(tH);
  add('wood', box, 0, helmY + 0.55, helmZ + 0.25, 0, 0, 0, 0.35, 1.1, 0.35);
  // masts, spars
  const sails = [], rig = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const deckAtZ = z => dY((z + L / 2) / L);
  let foreTop = null;
  P.masts.forEach((m, mi) => {
    const y0 = deckAtZ(m.z), top = y0 + m.h;
    rod('wood', V(0, y0 - 1, m.z), V(0, top - 3, m.z), 0.32, 0.22, 9);
    rod('wood', V(0, top - 4, m.z), V(0, top + (m.top ? 1.5 : 0), m.z), 0.17, 0.1, 7);
    add('wood', box, 0, top - 3.6, m.z, 0, 0, 0, 1.4, 0.18, 1.0); // top
    add('wood', cyl, 0, top + 1.6, m.z, 0, 0, 0, 0.18, 0.2, 0.18);
    if (mi === 0) foreTop = V(0, top - 1, m.z);
    const hb = halfB((m.z + L / 2) / L);
    // shrouds + ratlines
    for (const sd of [1, -1]) {
      const pts = [-0.9, 0, 0.9].map(dz => V(sd * hb * 0.98, deckAtZ(m.z + dz) + 0.9, m.z + dz + 0.8));
      const head = V(sd * 0.25, top - 3.8, m.z);
      pts.forEach(p => rig.push(p, head));
      for (let k = 1; k < 9; k++) { const f = k / 9; const a = pts[0].clone().lerp(head, f), b = pts[2].clone().lerp(head, f); rig.push(a, b); }
    }
    if (m.rig === 'square') {
      const yards = [[y0 + m.h * 0.52, B * 1.25, y0 + 2.2], [y0 + m.h * 0.82, B * 0.95, y0 + m.h * 0.55]];
      if (m.top) yards.push([top + 0.8, B * 0.62, y0 + m.h * 0.85]);
      yards.forEach(([yy, w, foot], k) => {
        rod('wood', V(-w / 2, yy, m.z - 0.35), V(w / 2, yy, m.z - 0.35), 0.1, 0.1, 6);
        const fw = w * (k === 0 ? 1.08 : 1.02);
        sails.push(sail([V(-fw / 2, foot, m.z - 0.45), V(fw / 2, foot, m.z - 0.45), V(-w / 2 + 0.1, yy - 0.15, m.z - 0.4), V(w / 2 - 0.1, yy - 0.15, m.z - 0.4)], V(0, 0, -1), 0.9 + w * 0.08, 6, 6));
        rig.push(V(-w / 2, yy, m.z - 0.35), V(0, top - 3.6, m.z), V(w / 2, yy, m.z - 0.35), V(0, top - 3.6, m.z));
      });
    } else { // gaff + boom + optional topsail
      const boomY = y0 + 2.4, boomL = Math.min(L * 0.48, (L / 2 - m.z) - 0.6);
      rod('wood', V(0, boomY, m.z + 0.3), V(0, boomY + 0.3, m.z + boomL), 0.13, 0.1, 6);
      const throat = V(0, y0 + m.h * 0.68, m.z + 0.3), peak = V(0, y0 + m.h * 0.9, m.z + boomL * 0.85);
      rod('wood', throat, peak, 0.11, 0.08, 6);
      sails.push(sail([V(0, boomY + 0.2, m.z + 0.45), V(0, boomY + 0.45, m.z + boomL - 0.2), throat.clone().add(V(0, -0.2, 0.15)), peak.clone().add(V(0, -0.25, 0))], V(1, 0, 0), 1.3, 7, 7));
      rig.push(peak, V(0, top - 1, m.z), V(0, boomY + 0.3, m.z + boomL), V(0, top - 3, m.z));
      if (m.top) {
        const yy = top - 0.6; rod('wood', V(-B * 0.42, yy, m.z - 0.3), V(B * 0.42, yy, m.z - 0.3), 0.08, 0.08, 6);
        sails.push(sail([V(-B * 0.5, top - 3.5, m.z - 0.4), V(B * 0.5, top - 3.5, m.z - 0.4), V(-B * 0.4, yy - 0.1, m.z - 0.38), V(B * 0.4, yy - 0.1, m.z - 0.38)], V(0, 0, -1), 0.6, 5, 4));
      }
    }
  });
  // bowsprit + jib
  const bowY = sheer(0), spritL = L * P.sprit, spA = V(0, bowY - 0.4, -L / 2 + 1.6), spB = V(0, bowY + spritL * 0.28, -L / 2 - spritL);
  rod('wood', spA, spB, 0.2, 0.11, 7);
  const jibHead = foreTop.clone().add(V(0, -1.4, 0));
  sails.push(sail([V(0, bowY + 0.3, -L / 2 + 0.6), spB.clone().add(V(0, 0.1, 0.4)), jibHead.clone().add(V(0, -0.8, 0.4)), jibHead.clone().add(V(0, -0.8, 0.4))], V(1, 0, 0), 0.9, 6, 6, true));
  rig.push(spB, foreTop, spB, V(0, 0.2, -L / 2 + 0.2)); // forestay + bobstay
  // backstays
  const lastM = P.masts[P.masts.length - 1], lt = deckAtZ(lastM.z) + lastM.h - 2;
  for (const sd of [1, -1]) rig.push(V(0, lt, lastM.z), V(sd * halfB(0.92) * 0.95, sheer(0.92), zAt(0.92)));
  P.masts.slice(1).forEach((m, k) => rig.push(V(0, deckAtZ(m.z) + m.h - 3.7, m.z), V(0, deckAtZ(P.masts[k].z) + P.masts[k].h * 0.5, P.masts[k].z)));

  for (const k in bucket) if (bucket[k].length) { const g = mergeGeometries(bucket[k]); const mesh = new THREE.Mesh(g, M[k]); group.add(mesh); }
  const rigMesh = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rig), new THREE.LineBasicMaterial({ color: 0x17120d, transparent: true, opacity: 0.85 }));
  group.add(rigMesh);
  sails.forEach(s => group.add(s.mesh));
  // helm wheel (separate so it can turn)
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 6, 22), M.wood); wheel.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 8), M.brass); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  for (let k = 0; k < 8; k++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.5, 5), M.wood); sp.rotation.z = k * Math.PI / 4; wheel.add(sp); }
  wheel.position.set(0, helmY + 1.25, helmZ); group.add(wheel);
  // flag
  const flagG = new THREE.PlaneGeometry(2.2, 1.4, 10, 4); flagG.translate(1.1, 0, 0);
  const flag = new THREE.Mesh(flagG, new THREE.MeshStandardMaterial({ map: flagTex(P.flag), side: THREE.DoubleSide, roughness: 1 }));
  const fm = P.masts[0]; flag.position.set(0, deckAtZ(fm.z) + fm.h + 1.1, fm.z); flag.rotation.y = Math.PI / 2; group.add(flag);
  flag.userData.base = Float32Array.from(flagG.attributes.position.array);
  // stern lantern
  const lanternPos = V(0, sheer(1) + 0.75, zAt(1) - 0.3);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.45, 0.32), new THREE.MeshStandardMaterial({ color: 0x2a1e10, emissive: 0xffa040, emissiveIntensity: 2.2 }));
  lamp.position.copy(lanternPos); group.add(lamp);
  // transom windows glow
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
  for (let k = -1; k <= 1; k++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.45), winMat); w.position.set(k * B * 0.22, sheer(1) - 0.6, zAt(1) + 0.03); group.add(w); }

  return {
    group, sails, wheel, flag, muzzles, rig: rigMesh, lamp,
    helmEye: V(0, helmY + 1.75, helmZ + 0.95), lanternPos,
    dims: { L, B, D, F, deckY: dY(0.5), halfB: B / 2, halfL: L / 2 },
    sheer, dY, halfB, zAt,
  };

  // sail surface: corners [foot-a, foot-b, head-a, head-b], billow direction, depth
  function sail(c, dir, depth, nu, nv, tri = false) {
    const g = new THREE.PlaneGeometry(1, 1, nu, nv); const p = g.attributes.position; const base = new Float32Array(p.count * 3), w = new Float32Array(p.count);
    const uvA = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const u = uvA.getX(i), v = uvA.getY(i);
      const a = c[0].clone().lerp(c[1], u), b = c[2].clone().lerp(c[3], u), q = a.lerp(b, v);
      if (tri) { const apex = c[2]; const f = c[0].clone().lerp(c[1], u); q.copy(f.lerp(apex, v)); }
      base[i * 3] = q.x; base[i * 3 + 1] = q.y; base[i * 3 + 2] = q.z;
      w[i] = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 0.85 + 0.12)) * (tri ? (1 - v) : 1);
    }
    p.array.set(base); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, M.sail);
    return { mesh, base, w, dir: dir.clone(), depth, ph: Math.random() * 6 };
  }
}

// per-frame cloth motion: fill 0..1 (throttle), side (+1/-1 which way fore-and-aft sails bulge)
export function animateShip(S, t, fill, side, near) {
  if (near) for (const s of S.sails) {
    const p = s.mesh.geometry.attributes.position, a = p.array, n = s.w.length;
    const amp = s.depth * (0.25 + 0.75 * fill), fl = (1.1 - fill) * 0.18;
    const sd = s.dir.x !== 0 ? side : 1;
    for (let i = 0; i < n; i++) {
      const w = s.w[i], k = i * 3, bx = s.base[k], by = s.base[k + 1], bz = s.base[k + 2];
      const flut = Math.sin(t * 7 + by * 1.3 + bz * 0.9 + s.ph) * fl * w + Math.sin(t * 2.1 + s.ph) * 0.05 * w;
      const d = (amp * w + flut) * sd;
      a[k] = bx + s.dir.x * d; a[k + 1] = by; a[k + 2] = bz + s.dir.z * d;
    }
    p.needsUpdate = true; s.mesh.geometry.computeVertexNormals();
  }
  const fg = S.flag.geometry.attributes.position, fb = S.flag.userData.base;
  if (near) { for (let i = 0; i < fg.count; i++) { const x = fb[i * 3]; fg.array[i * 3 + 2] = Math.sin(t * 6 - x * 2.2) * 0.18 * x; } fg.needsUpdate = true; }
}
