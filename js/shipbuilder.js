// Procedural sailing ships: lofted plank hull with tumblehome, wales and rails, bevelled deck furniture,
// masts/spars with iron hoops, GPU-billowed sail cloth (one draw call per ship), tarred rope rigging, guns, helm.
// Local frame: bow = -Z, starboard = +X, up = +Y, waterline at y = 0.
// Draw calls per ship: hull, deck, wood, metal, sails, rigging, wheel, glow, flag (was ~27).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { planks, sailCloth, flagTex, ropeTex } from './textures.js';

const TEX = {};
function T(k, f) { return TEX[k] || (TEX[k] = f()); }
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// shared per-frame uniforms for every sail (view-space sun for translucency)
export const SAIL_U = { uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunTint: { value: new THREE.Color(1.0, 0.62, 0.32) } };

export const TYPES = {
  sloop: { L: 20, B: 6.2, D: 2.2, F: 1.75, masts: [{ z: -1.2, h: 17, rig: 'gaff', top: true }], guns: 3, hull: [58, 42, 30], trim: [92, 34, 26], sail: [196, 182, 150], flag: 'pirate', sprit: 0.36, cabin: false },
  merchant: { L: 27, B: 8, D: 2.8, F: 2.2, masts: [{ z: -5.5, h: 20, rig: 'square' }, { z: 4.2, h: 18.5, rig: 'square' }], guns: 2, hull: [92, 70, 48], trim: [48, 60, 70], sail: [214, 204, 178], flag: 'trade', sprit: 0.3, cabin: true },
  hunter: { L: 25, B: 7.2, D: 2.6, F: 2.0, masts: [{ z: -4.5, h: 20, rig: 'square', top: true }, { z: 4.6, h: 18, rig: 'gaff', top: true }], guns: 4, hull: [34, 30, 28], trim: [120, 92, 40], sail: [150, 140, 125], flag: 'navy', sprit: 0.34, cabin: true, dark: 0.15 },
};

function mats(kind, P, seed) {
  return T('mats' + kind, () => {
    const hullTex = planks({ base: P.hull, rows: 10, seed: seed + 3, tar: 0.6 });
    const deckTex = T('deck', () => planks({ base: [96, 82, 64], rows: 10, seed: 21, tar: 0.75, light: 0.95 }));
    const sparTex = T('spar', () => planks({ base: [70, 52, 36], rows: 4, seed: 33, tar: 0.3 }));
    const rope = T('rope', ropeTex);
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ metalness: 0, envMapIntensity: 0.7 }, o));
    const pb = (t, o) => std(Object.assign({ map: t, normalMap: t.userData.normal, roughnessMap: t.userData.rough, roughness: 1 }, o));
    return {
      hull: pb(hullTex, { vertexColors: true, normalScale: new THREE.Vector2(1.1, 1.1), side: THREE.DoubleSide }),
      deck: pb(deckTex, { normalScale: new THREE.Vector2(0.9, 0.9) }),
      wood: pb(sparTex, { color: 0xc4b098, vertexColors: true }),
      metal: std({ vertexColors: true, roughness: 0.42, metalness: 0.8, envMapIntensity: 1 }),
      rope: std({ map: rope, normalMap: rope.userData.normal, roughness: 0.85, color: 0x9a8a78 }),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.15, 0.32) }),
      sailTex: sailCloth({ base: P.sail, seed: seed + 7, patches: kind === 'merchant' ? 3 : 7, dark: P.dark || 0 }),
      flagTex: flagTex(P.flag),
    };
  });
}

function sailMaterial(tex) {
  const u = { uT: { value: 0 }, uFill: { value: 0.5 }, uSide: { value: 1 }, uSunV: SAIL_U.uSunV, uSunTint: SAIL_U.uSunTint };
  const m = new THREE.MeshStandardMaterial({ map: tex, normalMap: tex.userData.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.93, side: THREE.DoubleSide, envMapIntensity: 0.5 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute vec4 aDir; attribute vec4 aWave; attribute vec4 aTu; attribute vec3 aTv; uniform float uT, uFill, uSide;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        float sW = aWave.x, amp = aWave.w * (0.25 + 0.75*uFill), sd = aDir.w > 0.5 ? uSide : 1.0, fl = (1.1 - uFill)*0.18;
        float flut = (sin(uT*7.0 + position.y*1.3 + position.z*0.9 + aTu.w)*fl + sin(uT*2.1 + aTu.w)*0.05) * sW;
        float dd = (amp*sW + flut)*sd;
        vec3 dPu = aTu.xyz + aDir.xyz*(amp*aWave.y*sd), dPv = aTv + aDir.xyz*(amp*aWave.z*sd);
        vec3 cn = cross(dPu, dPv);
        vec3 objectNormal = dot(cn, cn) > 1e-10 ? normalize(cn) : normal;
        #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = position + aDir.xyz*dd;');
    sh.fragmentShader = 'uniform vec3 uSunV; uniform vec3 uSunTint;\n' + sh.fragmentShader
      .replace('#include <opaque_fragment>', '// light through the cloth when the sun is behind the sail\n  outgoingLight += diffuseColor.rgb * uSunTint * pow(max(0.0, -dot(normal, uSunV)), 1.5) * 0.6;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'ps3d-sail';
  return { m, u };
}

export function buildShip(kind, seed = 1) {
  const P = TYPES[kind]; const { L, B, D, F } = P;
  const group = new THREE.Group(); group.name = kind;
  const M = mats(kind, P, seed);
  // ---------- hull loft (tumblehome: widest a little above the waterline) ----------
  const NS = 40, MK = 14;
  const halfB = t => { let w = 1; if (t < 0.42) w = Math.pow(Math.sin(t / 0.42 * Math.PI / 2), 0.8); else if (t > 0.8) w = 1 - 0.3 * Math.pow((t - 0.8) / 0.2, 1.6); return Math.max(0.015, w) * B / 2; };
  const sheer = t => F + 1.1 * Math.pow(Math.max(0, 1 - t / 0.33), 2) + 0.9 * Math.pow(Math.max(0, (t - 0.68) / 0.32), 2);
  const bottom = t => -D * (0.2 + 0.8 * ss(0, 0.24, t)) * (1 - 0.12 * ss(0.86, 1, t));
  const zAt = t => -L / 2 + t * L;
  const section = t => { // half-section points from the sheer (k=0) down to the keel (k=MK)
    const b = halfB(t), sh = sheer(t), bo = bottom(t), pts = [];
    for (let k = 0; k <= MK; k++) {
      const a = k / MK * Math.PI / 2, fall = Math.pow(Math.sin(a), 1.5);
      let x = b * Math.pow(Math.cos(a), 0.42) * (0.93 + 0.07 * ss(0, 0.32, fall)); const y = sh - (sh - bo) * fall;
      pts.push([x, y]);
    }
    return pts;
  };
  const xAt = (t, y) => { const p = section(t); for (let k = 1; k < p.length; k++) if (p[k][1] <= y) { const f = (y - p[k][1]) / (p[k - 1][1] - p[k][1] || 1); return p[k][0] + (p[k - 1][0] - p[k][0]) * f; } return p[p.length - 1][0]; };
  const pos = [], uv = [], col = [], idx = [];
  const tr = P.trim.map(v => v / 255 * 2.2);
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, sh = sheer(t), z = zAt(t), pts = section(t);
    const ring = [...pts, ...pts.slice(0, MK).reverse().map(([x, y]) => [-x, y])];
    let g = 0;
    ring.forEach(([x, y], j) => {
      if (j) g += Math.hypot(x - ring[j - 1][0], y - ring[j - 1][1]);
      pos.push(x, y, z); uv.push(z * 0.16, g * 0.28);
      let c = [1, 1, 1];
      if (y < 0.2) c = [0.36, 0.4, 0.31]; // weed & grime below the waterline
      else if (y < 0.5) c = [0.66, 0.64, 0.56];
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
  for (let i = 0; i <= NS; i++) { const t = i / NS, b = xAt(t, dY(t)) * 0.97, z = zAt(t); dp.push(-b, dY(t), z, b, dY(t), z); du.push(z * 0.2, -b * 0.3, z * 0.2, b * 0.3); if (i) { const a = (i - 1) * 2; di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2)); dg.setIndex(di); dg.computeVertexNormals();
  const deck = new THREE.Mesh(dg, M.deck); group.add(deck);

  // ---------- static parts, merged per material (vertex colours carry tar-black / brass tints) ----------
  const bucket = { wood: [], metal: [], rope: [] };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const tint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const prep = g => { g = g.index ? g.toNonIndexed() : g.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; };
  function add(key, geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, c = [1, 1, 1]) {
    _q.setFromEuler(_e.set(rx, ry, rz)); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    const g = prep(geo); g.applyMatrix4(_m); bucket[key].push(tint(g, c));
  }
  function rod(key, a, b, r0, r1 = r0, seg = 7, c = [1, 1, 1], uvLen = 0) { // cylinder from a to b
    const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
    const g = prep(new THREE.CylinderGeometry(r1, r0, len, seg, 1, key === 'rope'));
    if (uvLen) { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setY(i, u.getY(i) * len * uvLen); }
    _q.setFromUnitVectors(UP, dir.normalize()); g.applyMatrix4(_m.compose(_p.copy(a).addScaledVector(dir, len / 2), _q, _s.set(1, 1, 1))); bucket[key].push(tint(g, c));
  }
  const rope = (a, b, r = 0.035) => rod('rope', a, b, r, r, 4, [1, 1, 1], 6);
  const chamfer = {}; // bevelled boxes (catch highlights on their edges instead of reading as flat cubes)
  const cbox = (w, h, d) => { const k = [w, h, d].map(v => v.toFixed(2)).join(); if (chamfer[k]) return chamfer[k]; const bv = Math.min(0.06, Math.min(w, h, d) * 0.18), s = new THREE.Shape();
    s.moveTo(-w / 2 + bv, -h / 2 + bv); s.lineTo(w / 2 - bv, -h / 2 + bv); s.lineTo(w / 2 - bv, h / 2 - bv); s.lineTo(-w / 2 + bv, h / 2 - bv); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - 2 * bv), bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 1, curveSegments: 1 }); g.translate(0, 0, -(d - 2 * bv) / 2);
    g.scale(1, 1, 1); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 0.25, u.getY(i) * 0.25); return (chamfer[k] = g); };
  const BLACK = [0.08, 0.06, 0.05], BRASS = [0.62, 0.46, 0.2], IRON = [0.13, 0.13, 0.135];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // cap rails along the sheer, stanchions, wales and a rubbing strake
  const railX = t => section(t)[0][0] * 0.985;
  for (const sd of [1, -1]) {
    let prev = null, pw = null, pr = null;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS, z = zAt(t), sh = sheer(t), p = V(sd * railX(t), sh + 0.06, z);
      const wy = sh - 0.85, w = V(sd * (xAt(t, wy) + 0.05), wy, z), ry = 0.62, r = V(sd * (xAt(t, ry) + 0.04), ry, z);
      if (prev) { rod('wood', prev, p, 0.12, 0.12, 6); rod('wood', pw, w, 0.13, 0.13, 6, BLACK); if (t > 0.08 && t < 0.95) rod('wood', pr, r, 0.07, 0.07, 5, [0.5, 0.45, 0.4]); }
      prev = p; pw = w; pr = r;
      if (i % 3 === 1 && t > 0.08) rod('wood', V(sd * xAt(t, dY(t)) * 0.95, dY(t), z), p, 0.06, 0.06, 5);
    }
  }
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12), cylLo = new THREE.CylinderGeometry(1, 1, 1, 8);
  // guns
  const muzzles = { port: [], star: [] };
  const gz0 = -L * 0.22, gz1 = L * 0.2;
  for (let g = 0; g < P.guns; g++) {
    const z = P.guns === 1 ? 0 : gz0 + (gz1 - gz0) * g / (P.guns - 1), t = (z + L / 2) / L, y = dY(t) + 0.55, b = xAt(t, y);
    for (const sd of [1, -1]) {
      add('wood', cbox(0.14, 0.66, 0.72), sd * (b + 0.02), y, z, 0, 0, 0, 1, 1, 1, BLACK); // gunport
      add('wood', cbox(0.08, 0.7, 0.8), sd * (b + 0.08), y + 0.38, z + 0.05, 0, 0, sd * 0.6, 1, 1, 1, [0.55, 0.2, 0.15]); // port lid, propped open
      add('wood', cbox(1.1, 0.4, 0.75), sd * (b - 0.85), dY(t) + 0.25, z); // carriage
      for (const wz of [-0.32, 0.32]) add('wood', cylLo, sd * (b - 0.85 + 0.3 * (wz > 0 ? 1 : -1) * 0), dY(t) + 0.12, z + wz, 0, 0, Math.PI / 2, 0.15, 1.15, 0.15, [0.5, 0.42, 0.35]); // trucks
      add('metal', cyl, sd * (b - 0.2), y, z, 0, 0, Math.PI / 2, 0.15, 1.9, 0.15, IRON); // barrel
      add('metal', cyl, sd * (b + 0.72), y, z, 0, 0, Math.PI / 2, 0.19, 0.18, 0.19, IRON); // muzzle ring
      add('metal', cyl, sd * (b - 1.08), y, z, 0, 0, Math.PI / 2, 0.2, 0.14, 0.2, IRON); // breech
      (sd > 0 ? muzzles.star : muzzles.port).push(new THREE.Vector3(sd * (b + 0.9), y, z));
    }
  }
  // deck furniture
  const tMid = 0.5, dm = dY(tMid);
  add('wood', cbox(1.8, 0.45, 1.6), 0, dm + 0.2, -L * 0.08 + 2.2); // hatch
  add('wood', cbox(1.5, 0.04, 1.3), 0, dm + 0.43, -L * 0.08 + 2.2, 0, 0, 0, 1, 1, 1, BLACK);
  for (let k = 0; k < 5; k++) add('wood', cbox(0.08, 0.05, 1.3), -0.6 + k * 0.3, dm + 0.46, -L * 0.08 + 2.2, 0, 0, 0, 1, 1, 1, [0.7, 0.62, 0.55]); // grating
  for (let i = 0; i < 4; i++) { // barrels with iron hoops
    const bx = (i % 2 ? 1 : -1) * (B * 0.3), bz = L * 0.1 + i * 0.7;
    add('wood', cylLo, bx, dm + 0.45, bz, 0, 0, 0, 0.32, 0.9, 0.32);
    for (const hy of [0.15, 0.75]) add('metal', cylLo, bx, dm + hy, bz, 0, 0, 0, 0.335, 0.05, 0.335, IRON);
  }
  add('wood', cbox(1, 0.7, 0.8), -B * 0.22, dm + 0.35, -L * 0.25, 0, 0.3, 0); // crate
  const coil = new THREE.TorusGeometry(0.35, 0.09, 6, 14);
  add('rope', coil, B * 0.25, dm + 0.1, -L * 0.15, Math.PI / 2, 0, 0); add('rope', coil, -B * 0.25, dm + 0.1, L * 0.25, Math.PI / 2, 0, 0);
  // stern cabin for bigger ships
  if (P.cabin) {
    const t0 = 0.8, z = zAt(0.9), y0 = dY(t0);
    add('wood', cbox(B * 0.62, 1.6, L * 0.16), 0, y0 + 0.8, z);
    add('wood', cbox(B * 0.68, 0.12, L * 0.17), 0, y0 + 1.65, z, 0, 0, 0, 1, 1, 1, [0.7, 0.62, 0.55]);
    for (const sd of [1, -1]) add('wood', cbox(0.06, 0.5, 0.6), sd * B * 0.31, y0 + 0.95, z, 0, 0, 0, 1, 1, 1, BLACK);
  }
  // helm
  const tH = P.cabin ? 0.72 : 0.8, helmZ = zAt(tH), helmY = dY(tH);
  add('wood', cbox(0.35, 1.1, 0.35), 0, helmY + 0.55, helmZ + 0.25);
  // masts, spars
  const deckAtZ = z => dY((z + L / 2) / L);
  let foreTop = null;
  const sailParts = [];
  P.masts.forEach((m, mi) => {
    const y0 = deckAtZ(m.z), top = y0 + m.h;
    rod('wood', V(0, y0 - 1, m.z), V(0, top - 3, m.z), 0.32, 0.22, 12);
    rod('wood', V(0, top - 4, m.z), V(0, top + (m.top ? 1.5 : 0), m.z), 0.17, 0.1, 9);
    for (let k = 1; k < 6; k++) { const yy = y0 + k * (m.h - 4) / 6; add('metal', cylLo, 0, yy, m.z, 0, 0, 0, 0.33 - k * 0.018, 0.12, 0.33 - k * 0.018, IRON); } // mast hoops
    add('wood', cbox(1.4, 0.18, 1.0), 0, top - 3.6, m.z); // top
    add('wood', cyl, 0, top + 1.6, m.z, 0, 0, 0, 0.18, 0.2, 0.18);
    if (mi === 0) foreTop = V(0, top - 1, m.z);
    const t = (m.z + L / 2) / L, rx = railX(t), sh = sheer(t);
    // shrouds to the channels, with deadeyes and ratlines
    for (const sd of [1, -1]) {
      add('wood', cbox(0.5, 0.12, 2.6), sd * (rx + 0.22), sh - 0.25, m.z + 0.8); // channel
      const pts = [-0.9, 0, 0.9].map(dz => V(sd * (rx + 0.38), sh - 0.1, m.z + dz + 0.8));
      const head = V(sd * 0.25, top - 3.8, m.z);
      pts.forEach(p => { rope(p, head, 0.04); add('wood', cylLo, p.x, p.y + 0.35, p.z, 0, 0, Math.PI / 2, 0.13, 0.08, 0.13, BLACK); });
      for (let k = 1; k < 9; k++) { const f = k / 9; rope(pts[0].clone().lerp(head, f), pts[2].clone().lerp(head, f), 0.018); }
    }
    if (m.rig === 'square') {
      const yards = [[y0 + m.h * 0.52, B * 1.25, y0 + 2.2], [y0 + m.h * 0.82, B * 0.95, y0 + m.h * 0.55]];
      if (m.top) yards.push([top + 0.8, B * 0.62, y0 + m.h * 0.85]);
      yards.forEach(([yy, w, foot], k) => {
        rod('wood', V(-w / 2, yy, m.z - 0.35), V(0, yy, m.z - 0.35), 0.06, 0.12, 7); rod('wood', V(0, yy, m.z - 0.35), V(w / 2, yy, m.z - 0.35), 0.12, 0.06, 7);
        const fw = w * (k === 0 ? 1.08 : 1.02);
        sailParts.push(sail([V(-fw / 2, foot, m.z - 0.45), V(fw / 2, foot, m.z - 0.45), V(-w / 2 + 0.1, yy - 0.15, m.z - 0.4), V(w / 2 - 0.1, yy - 0.15, m.z - 0.4)], V(0, 0, -1), 0.9 + w * 0.08, 10, 8));
        rope(V(-w / 2, yy, m.z - 0.35), V(0, top - 3.6, m.z), 0.03); rope(V(w / 2, yy, m.z - 0.35), V(0, top - 3.6, m.z), 0.03);
        for (const sd of [1, -1]) rope(V(sd * fw / 2, foot, m.z - 0.45), V(sd * (rx + 0.1), sh, m.z + 1.8), 0.025); // sheets
      });
    } else { // gaff + boom + optional topsail
      const boomY = y0 + 2.4, boomL = Math.min(L * 0.48, (L / 2 - m.z) - 0.6);
      rod('wood', V(0, boomY, m.z + 0.3), V(0, boomY + 0.3, m.z + boomL), 0.13, 0.1, 8);
      const throat = V(0, y0 + m.h * 0.68, m.z + 0.3), peak = V(0, y0 + m.h * 0.9, m.z + boomL * 0.85);
      rod('wood', throat, peak, 0.11, 0.08, 8);
      sailParts.push(sail([V(0, boomY + 0.2, m.z + 0.45), V(0, boomY + 0.45, m.z + boomL - 0.2), throat.clone().add(V(0, -0.2, 0.15)), peak.clone().add(V(0, -0.25, 0))], V(1, 0, 0), 1.3, 12, 10));
      rope(peak, V(0, top - 1, m.z), 0.03); rope(V(0, boomY + 0.3, m.z + boomL), V(0, top - 3, m.z), 0.03);
      rope(V(0, boomY + 0.3, m.z + boomL - 0.4), V(0, sheer(1) + 0.1, zAt(0.97)), 0.03); // main sheet
      if (m.top) {
        const yy = top - 0.6; rod('wood', V(-B * 0.42, yy, m.z - 0.3), V(B * 0.42, yy, m.z - 0.3), 0.08, 0.08, 6);
        sailParts.push(sail([V(-B * 0.5, top - 3.5, m.z - 0.4), V(B * 0.5, top - 3.5, m.z - 0.4), V(-B * 0.4, yy - 0.1, m.z - 0.38), V(B * 0.4, yy - 0.1, m.z - 0.38)], V(0, 0, -1), 0.6, 8, 6));
      }
    }
  });
  // bowsprit + jib
  const bowY = sheer(0), spritL = L * P.sprit, spA = V(0, bowY - 0.4, -L / 2 + 1.6), spB = V(0, bowY + spritL * 0.28, -L / 2 - spritL);
  rod('wood', spA, spB, 0.2, 0.11, 9);
  add('metal', cylLo, 0, spA.y + (spB.y - spA.y) * 0.25, spA.z + (spB.z - spA.z) * 0.25, Math.PI / 2 - Math.atan2(spB.y - spA.y, spA.z - spB.z), 0, 0, 0.2, 0.1, 0.2, IRON);
  const jibHead = foreTop.clone().add(V(0, -1.4, 0));
  sailParts.push(sail([V(0, bowY + 0.3, -L / 2 + 0.6), spB.clone().add(V(0, 0.1, 0.4)), jibHead.clone().add(V(0, -0.8, 0.4)), jibHead.clone().add(V(0, -0.8, 0.4))], V(1, 0, 0), 0.9, 9, 8, true));
  rope(spB, foreTop, 0.045); rope(spB, V(0, 0.2, -L / 2 + 0.2), 0.045); // forestay + bobstay
  // backstays
  const lastM = P.masts[P.masts.length - 1], lt = deckAtZ(lastM.z) + lastM.h - 2;
  for (const sd of [1, -1]) rope(V(0, lt, lastM.z), V(sd * railX(0.92) * 0.95, sheer(0.92), zAt(0.92)), 0.04);
  P.masts.slice(1).forEach((m, k) => rope(V(0, deckAtZ(m.z) + m.h - 3.7, m.z), V(0, deckAtZ(P.masts[k].z) + P.masts[k].h * 0.5, P.masts[k].z), 0.035));

  const parts = {};
  for (const k in bucket) if (bucket[k].length) { const mesh = new THREE.Mesh(mergeGeometries(bucket[k]), M[k]); parts[k] = mesh; group.add(mesh); }
  const rigMesh = parts.rope;
  // all sails in one geometry, billowed on the GPU
  const sm = sailMaterial(M.sailTex);
  const sails = new THREE.Mesh(mergeGeometries(sailParts), sm.m); group.add(sails);
  // helm wheel (separate so it can turn): rim, spokes with handles, hub — one mesh
  const wg = [];
  const wadd = (g, m4) => { g = prep(g); g.applyMatrix4(m4); wg.push(g); };
  wadd(new THREE.TorusGeometry(0.55, 0.045, 8, 28), new THREE.Matrix4());
  wadd(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10), new THREE.Matrix4().makeRotationX(Math.PI / 2));
  for (let k = 0; k < 8; k++) wadd(new THREE.CylinderGeometry(0.022, 0.034, 1.5, 6), new THREE.Matrix4().makeRotationZ(k * Math.PI / 4));
  const wheel = new THREE.Mesh(mergeGeometries(wg), M.wood);
  wheel.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(wheel.geometry.attributes.position.count * 3).fill(0.9), 3));
  wheel.position.set(0, helmY + 1.25, helmZ); group.add(wheel);
  // flag
  const flagG = new THREE.PlaneGeometry(2.2, 1.4, 10, 4); flagG.translate(1.1, 0, 0);
  const flag = new THREE.Mesh(flagG, new THREE.MeshStandardMaterial({ map: M.flagTex, side: THREE.DoubleSide, roughness: 1 }));
  const fm = P.masts[0]; flag.position.set(0, deckAtZ(fm.z) + fm.h + 1.1, fm.z); flag.rotation.y = Math.PI / 2; group.add(flag);
  flag.userData.base = Float32Array.from(flagG.attributes.position.array);
  // stern lantern + transom windows: one emissive mesh (HDR colour, so bloom picks it up)
  const lanternPos = V(0, sheer(1) + 0.75, zAt(1) - 0.3);
  const gl = [prep(new THREE.BoxGeometry(0.3, 0.42, 0.3)).translate(lanternPos.x, lanternPos.y, lanternPos.z)];
  for (let k = -1; k <= 1; k++) gl.push(prep(new THREE.PlaneGeometry(0.55, 0.45)).translate(k * B * 0.22, sheer(1) - 0.6, zAt(1) + 0.03));
  const lamp = new THREE.Mesh(mergeGeometries(gl), M.glow); group.add(lamp);
  add('metal', cylLo, lanternPos.x, lanternPos.y + 0.28, lanternPos.z, 0, 0, 0, 0.2, 0.12, 0.2, IRON);

  // shadows (only rendered when the renderer's shadow map is on, i.e. High)
  for (const o of [hull, deck, parts.wood, parts.metal, sails, wheel]) if (o) { o.castShadow = true; o.receiveShadow = true; }
  if (parts.metal && !parts.metal.parent) group.add(parts.metal);

  return {
    group, sails, sailU: sm.u, wheel, flag, muzzles, rig: rigMesh || new THREE.Object3D(), lamp,
    helmEye: V(0, helmY + 1.75, helmZ + 0.95), lanternPos,
    dims: { L, B, D, F, deckY: dY(0.5), halfB: B / 2, halfL: L / 2 },
    sheer, dY, halfB, zAt,
  };

  // sail surface: corners [foot-a, foot-b, head-a, head-b], billow direction, depth.  Per-vertex tangents and
  // the derivatives of the billow weight let the vertex shader rebuild the bent normal without CPU work.
  function sail(c, dir, depth, nu, nv, tri = false) {
    const g = new THREE.PlaneGeometry(1, 1, nu, nv); const uvA = g.attributes.uv, n = uvA.count;
    const at = (u, v, out) => { if (tri) { out.copy(c[0]).lerp(c[1], u).lerp(c[2], v); return out; } const a = _a.copy(c[0]).lerp(c[1], u), b = _b.copy(c[2]).lerp(c[3], u); return out.copy(a).lerp(b, v); };
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), p = new THREE.Vector3(), p1 = new THREE.Vector3(), p0 = new THREE.Vector3();
    const wf = (u, v) => Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 0.85 + 0.12)) * (tri ? (1 - v) : 1);
    const pos = new Float32Array(n * 3), aDir = new Float32Array(n * 4), aWave = new Float32Array(n * 4), aTu = new Float32Array(n * 4), aTv = new Float32Array(n * 3);
    const ph = Math.random() * 6, e = 0.01, fa = dir.x !== 0 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const u = uvA.getX(i), v = uvA.getY(i);
      at(u, v, p); pos.set([p.x, p.y, p.z], i * 3);
      const vu = Math.min(v, 0.96); // avoid the degenerate apex of a jib
      at(Math.min(1, u + e), vu, p1); at(Math.max(0, u - e), vu, p0); const du = (Math.min(1, u + e) - Math.max(0, u - e));
      aTu.set([(p1.x - p0.x) / du, (p1.y - p0.y) / du, (p1.z - p0.z) / du, ph], i * 4);
      at(u, Math.min(1, v + e), p1); at(u, Math.max(0, v - e), p0); const dv = (Math.min(1, v + e) - Math.max(0, v - e));
      aTv.set([(p1.x - p0.x) / dv, (p1.y - p0.y) / dv, (p1.z - p0.z) / dv], i * 3);
      const w = wf(u, v), dwu = (wf(Math.min(1, u + e), v) - wf(Math.max(0, u - e), v)) / du, dwv = (wf(u, Math.min(1, v + e)) - wf(u, Math.max(0, v - e))) / dv;
      aWave.set([w, dwu, dwv, depth], i * 4); aDir.set([dir.x, dir.y, dir.z, fa], i * 4);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
    g.setAttribute('aDir', new THREE.BufferAttribute(aDir, 4)); g.setAttribute('aWave', new THREE.BufferAttribute(aWave, 4));
    g.setAttribute('aTu', new THREE.BufferAttribute(aTu, 4)); g.setAttribute('aTv', new THREE.BufferAttribute(aTv, 3));
    return g;
  }
}

// per-frame cloth motion: fill 0..1 (throttle), side (+1/-1 which way fore-and-aft sails bulge). Sails: uniforms only.
export function animateShip(S, t, fill, side, near) {
  const u = S.sailU; u.uT.value = t; u.uFill.value += (fill - u.uFill.value) * 0.05; u.uSide.value += (side - u.uSide.value) * 0.04;
  if (!near) return;
  const fg = S.flag.geometry.attributes.position, fb = S.flag.userData.base, a = fg.array;
  for (let i = 0; i < fg.count; i++) { const x = fb[i * 3]; a[i * 3 + 2] = Math.sin(t * 6 - x * 2.2) * 0.18 * x; }
  fg.needsUpdate = true;
}
