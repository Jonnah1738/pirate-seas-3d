// Pirate Seas 3D — first playable slice.
import * as THREE from 'three';
import { makeOcean, makeSky, waveHeight, OCEAN_U, MAXS } from './ocean.js';
import { buildShip, animateShip, TYPES } from './shipbuilder.js';
import { makeFX, Wake } from './fx.js';
import { buildIsland, islandH, ISLAND, PIER, DOCK } from './island.js';
import { audioInit, sfx, setSound, soundOn } from './audio.js';
import { planks } from './textures.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const R = Math.random;

// ---------- persistence (own keys: never touches the 2D game's pirateSeas_* keys) ----------
const SKEY = 'ps3d_save_v1', OKEY = 'ps3d_settings_v1';
const ld = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const settings = Object.assign({ gfx: 'auto', cam: 'third', sound: true, sens: 1 }, ld(OKEY) || {});
const saveSettings = () => { try { localStorage.setItem(OKEY, JSON.stringify(settings)); } catch (e) { } };
const fresh = () => ({ v: 1, gold: 150, cargo: {}, hp: 160, kills: 0, hints: {}, play: 0 });
let save = ld(SKEY);
const writeSave = () => { save.hp = Math.round(player ? player.hp : save.hp); try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) { } };

// ---------- renderer / scene ----------
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const FOGC = new THREE.Color(0x7d7a70);
scene.fog = new THREE.FogExp2(FOGC, 0.0011);
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 6000);
const sunDir = OCEAN_U.uSunDir.value;
const hemi = new THREE.HemisphereLight(0x9aa0a4, 0x2a2118, 1.15); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc79a, 2.3); sun.position.copy(sunDir).multiplyScalar(100); scene.add(sun);
const lantern = new THREE.PointLight(0xffa040, 18, 30, 1.7); scene.add(lantern);
const sky = makeSky(scene);
let LOW = false;
let ocean = makeOcean(false); scene.add(ocean);
const island = buildIsland(scene, false);
let fx = makeFX(scene, false);

// ---------- ships ----------
const STATS = {
  sloop: { hp: 160, spd: 12, turn: 0.4, reload: 3.2, dmg: 11, ball: 118, name: 'Your sloop' },
  merchant: { hp: 170, spd: 7.2, turn: 0.22, reload: 6.5, dmg: 6, ball: 105 },
  hunter: { hp: 240, spd: 10.4, turn: 0.31, reload: 4.6, dmg: 8.5, ball: 112 },
};
const NAMES = { merchant: ['Santa Lucia', 'Good Hope', 'Mary Rose', 'Fair Wind', 'San Felipe', 'Golden Hind'], hunter: ['HMS Relentless', 'HMS Vigilant', 'HMS Gallows', 'HMS Retribution'] };
const ships = []; let player = null; let seedN = 1;
class Ship {
  constructor(kind, x, z, h) {
    this.kind = kind; this.st = STATS[kind]; this.S = buildShip(kind, seedN++); scene.add(this.S.group);
    this.x = x; this.z = z; this.h = h; this.y = 0; this.pitch = 0; this.roll = 0; this.speed = 0; this.throttle = 0; this.rudder = 0;
    this.hp = this.maxHp = this.st.hp; this.reload = { port: 0, star: 0 }; this.sinking = 0; this.dead = false; this.smokeT = 0;
    this.wake = new Wake(scene, LOW ? 40 : 70); this.vel = new THREE.Vector3(); this.queue = [];
    this.name = kind === 'sloop' ? 'Your sloop' : NAMES[kind][(R() * NAMES[kind].length) | 0];
    this.ai = kind !== 'sloop' ? { wp: null, aggro: 0, t: R() * 5 } : null;
    ships.push(this);
  }
  get L() { return this.S.dims.L; }
  fwd() { return [-Math.sin(this.h), -Math.cos(this.h)]; }
  toWorld(lx, lz) { const c = Math.cos(this.h), s = Math.sin(this.h); return [this.x + lx * c + lz * s, this.z - lx * s + lz * c]; }
  toLocal(wx, wz) { const dx = wx - this.x, dz = wz - this.z, c = Math.cos(this.h), s = Math.sin(this.h); return [dx * c - dz * s, dx * s + dz * c]; }
  update(dt, t) {
    const d = this.S.dims;
    if (this.sinking) {
      this.sinking += dt; const k = Math.min(1, this.sinking / 11);
      this.speed *= 1 - dt * 0.5; this.x += this.fwd()[0] * this.speed * dt; this.z += this.fwd()[1] * this.speed * dt;
      this.y = waveHeight(this.x, this.z, t) - k * k * (d.D + d.F + 14); this.roll += (0.55 * this.sinkSide - this.roll) * dt * 0.4; this.pitch += (0.22 - this.pitch) * dt * 0.3;
      this.place();
      if (R() < (LOW ? 0.3 : 0.7)) fx.burn(this.x, this.y + d.F + 1, this.z, true);
      if (this.sinking > 13) this.remove();
      return;
    }
    const maxS = this.st.spd * (this.hp < this.maxHp * 0.3 ? 0.78 : 1);
    const target = this.throttle * maxS, acc = target > this.speed ? 1.5 : 2.6;
    this.speed += clamp(target - this.speed, -acc * dt, acc * dt);
    const tf = 0.3 + 0.7 * Math.min(1, this.speed / (maxS * 0.45));
    this.h = wrap(this.h - this.rudder * this.st.turn * tf * dt);
    const [fx_, fz] = this.fwd(); const ox = this.x, oz = this.z;
    this.x += fx_ * this.speed * dt; this.z += fz * this.speed * dt;
    // grounding on the island / pier
    const [bx, bz] = this.toWorld(0, -d.L * 0.45);
    if (islandH(bx, bz) > -d.D * 0.8 || islandH(this.x, this.z) > -d.D * 0.8) {
      this.x = ox; this.z = oz; const a = Math.atan2(this.z - ISLAND.z, this.x - ISLAND.x); this.x += Math.cos(a) * 0.6; this.z += Math.sin(a) * 0.6;
      if (this.speed > 5 && this === player) { damage(this, (this.speed - 4) * 2.5, null); toast('Ran aground!'); sfx.hit(0); }
      this.speed *= 0.3;
      if (this.ai) this.ai.wp = null;
    }
    if (Math.abs(this.x - PIER.x) < PIER.w / 2 + d.B * 0.45 && this.z > PIER.z0 - 30 && this.z < PIER.z1 + d.L * 0.4) {
      this.x = PIER.x + Math.sign(this.x - PIER.x || 1) * (PIER.w / 2 + d.B * 0.45); this.speed *= 0.9;
    }
    // edge of the charts
    const er = Math.hypot(this.x, this.z); if (er > 2900) { this.x *= 2900 / er; this.z *= 2900 / er; if (this === player && R() < 0.02) toast('Thick fog — the charts end here'); }
    this.vel.set(fx_ * this.speed, 0, fz * this.speed);
    // buoyancy: four hull points
    const pB = this.toWorld(0, -d.L * 0.4), pS = this.toWorld(0, d.L * 0.4), pP = this.toWorld(-d.B * 0.45, 0), pR = this.toWorld(d.B * 0.45, 0);
    const hB = waveHeight(pB[0], pB[1], t), hS = waveHeight(pS[0], pS[1], t), hP = waveHeight(pP[0], pP[1], t), hR = waveHeight(pR[0], pR[1], t);
    const ty = (hB + hS + hP + hR) / 4 - (this.kind === 'sloop' ? 0.05 : 0.1);
    const k = Math.min(1, dt * 4);
    this.y += (ty - this.y) * k;
    this.pitch += (Math.atan2(hB - hS, d.L * 0.8) - this.pitch) * Math.min(1, dt * 2.5);
    this.roll += (Math.atan2(hR - hP, d.B * 0.9) * 0.8 - this.rudder * this.speed * 0.006 - this.roll) * Math.min(1, dt * 2);
    this.place();
    // reloads & queued shots
    this.reload.port = Math.max(0, this.reload.port - dt); this.reload.star = Math.max(0, this.reload.star - dt);
    for (let i = this.queue.length - 1; i >= 0; i--) { const q = this.queue[i]; q.t -= dt; if (q.t <= 0) { this.queue.splice(i, 1); shoot(this, q); } }
    if (this.hp < this.maxHp * 0.5) { this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = LOW ? 0.3 : 0.14; fx.burn(this.x, this.y + d.deckY + 0.5, this.z, this.hp < this.maxHp * 0.25); } }
  }
  place() { const g = this.S.group; g.position.set(this.x, this.y, this.z); g.rotation.set(this.pitch, this.h, this.roll, 'YXZ'); g.updateMatrixWorld(true); }
  remove() { this.dead = true; scene.remove(this.S.group); this.wake.dispose(scene); this.S.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); if (this.plate) this.plate.remove(); }
}

// ---------- cannonballs ----------
const ballGeo = new THREE.SphereGeometry(0.17, 8, 6), ballMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.6 });
const balls = [];
function fire(s, side) {
  if (s.reload[side] > 0 || s.sinking) return false;
  s.reload[side] = s.st.reload;
  const sx = side === 'star' ? 1 : -1, ms = s.S.muzzles[side];
  let aim = null;
  if (s === player) aim = aimFor(s, side); else if (s.ai && s.ai.aim) aim = s.ai.aim;
  ms.forEach((m, i) => s.queue.push({ t: i * 0.09 + R() * 0.05, m, sx, aim }));
  if (s === player) { shake = Math.max(shake, 0.25); if (camMode === 'third' && lookIdle > 1) camSwing = { sx, t: 2.6 }; }
  return true;
}
function aimFor(s, side) { // aim assist: elevation for the nearest enemy in the broadside arc, with lead
  const sx = side === 'star' ? 1 : -1; let best = null, bd = 1e9;
  for (const e of ships) {
    if (e === s || e.sinking || e.dead) continue;
    const [lx, lz] = s.toLocal(e.x, e.z), dist = Math.hypot(lx, lz);
    if (lx * sx <= 0 || dist > 460) continue; const off = Math.atan2(lz, Math.abs(lx)); if (Math.abs(off) > 0.62) continue;
    if (dist < bd) { bd = dist; best = e; }
  }
  if (!best) return null;
  return solve(s, best, s.st.ball, 0);
}
function solve(s, e, V, err) {
  let px = e.x, pz = e.z, tt = 0;
  for (let i = 0; i < 3; i++) { const d = Math.hypot(px - s.x, pz - s.z); tt = d / (V * 0.98); px = e.x + e.vel.x * tt - s.vel.x * tt; pz = e.z + e.vel.z * tt - s.vel.z * tt; }
  const d = Math.hypot(px - s.x, pz - s.z); const el = 0.5 * Math.asin(clamp(9.81 * d / (V * V), 0, 1)) + 0.004;
  return { el: el * (1 + err * (R() - 0.5)), yaw: Math.atan2(px - s.x, pz - s.z) + err * 0.08 * (R() - 0.5), target: e };
}
function shoot(s, q) {
  const p = s.S.group.localToWorld(q.m.clone());
  const c = Math.cos(s.h), sn = Math.sin(s.h);
  let dx = q.sx * c, dz = -q.sx * sn, el = 0.07;
  if (q.aim) { // turn toward the solution but never leave the broadside arc
    const want = q.aim.yaw, base = Math.atan2(dx, dz), dy = clamp(wrap(want - base), -0.45, 0.45);
    dx = Math.sin(base + dy); dz = Math.cos(base + dy); el = clamp(q.aim.el, -0.02, 0.38);
  }
  el += s.roll * -q.sx * 0.5 * 0; // (cannons are leveled by the gun crews)
  const V = s.st.ball * (0.98 + R() * 0.04);
  const v = new THREE.Vector3(dx * Math.cos(el) * V + s.vel.x, Math.sin(el) * V, dz * Math.cos(el) * V + s.vel.z);
  let mesh = null; for (const b of balls) if (!b.on) { mesh = b.mesh; balls.splice(balls.indexOf(b), 1); break; }
  if (!mesh) { mesh = new THREE.Mesh(ballGeo, ballMat); scene.add(mesh); }
  mesh.visible = true; mesh.position.copy(p);
  balls.push({ on: true, mesh, p: p.clone(), v, owner: s, dmg: s.st.dmg, t: 0 });
  fx.muzzle(p, new THREE.Vector3(dx, 0, dz), s.vel);
  sfx.cannon(p.distanceTo(camera.position));
}
function updateBalls(dt, t) {
  for (const b of balls) {
    if (!b.on) continue;
    b.t += dt; b.v.y -= 9.81 * dt; b.p.addScaledVector(b.v, dt); b.mesh.position.copy(b.p);
    if (!LOW && b.owner === player && (b.t * 60 | 0) % 3 === 0) fx.smoke.emit(b.p.x, b.p.y, b.p.z, 0, 0.3, 0, { life: 0.7, s0: 0.5, s1: 1.4, col: [0.8, 0.8, 0.78], a: 0.25 });
    let hit = null;
    for (const s of ships) {
      if (s === b.owner || s.dead || s.sinking > 2) continue;
      const dx = b.p.x - s.x, dz = b.p.z - s.z; if (dx * dx + dz * dz > (s.L * 0.6) ** 2) continue;
      const [lx, lz] = s.toLocal(b.p.x, b.p.z), d = s.S.dims, tt = (lz + d.L / 2) / d.L;
      if (tt < 0 || tt > 1) continue; const hb = s.S.halfB(tt), ly = b.p.y - s.y;
      if (Math.abs(lx) < hb * 1.05 && ly > -1.5 && ly < s.S.sheer(tt) + 0.6) { hit = s; break; }
    }
    if (hit) {
      b.on = false; b.mesh.visible = false;
      const n = new THREE.Vector3(b.p.x - hit.x, 0, b.p.z - hit.z).normalize();
      fx.hit(b.p.x, b.p.y, b.p.z, n.x, n.z); sfx.hit(b.p.distanceTo(camera.position));
      damage(hit, b.dmg * (0.8 + R() * 0.45), b.owner);
      continue;
    }
    const wh = waveHeight(b.p.x, b.p.z, t);
    if (b.p.y < wh || b.t > 7) { b.on = false; b.mesh.visible = false; if (b.p.y < wh + 1) { fx.splash(b.p.x, wh, b.p.z, 1); sfx.splash(b.p.distanceTo(camera.position)); } }
  }
}
function damage(s, d, by) {
  if (s.sinking || s.dead) return;
  s.hp -= d;
  if (s === player) { shake = Math.max(shake, 0.6); flashHit(); }
  if (s.ai && by === player) { s.ai.aggro = 40; s.ai.hitT = 3; }
  if (s.hp <= 0) { s.hp = 0; sink(s, by); }
}
function sink(s, by) {
  s.sinking = 0.001; s.sinkSide = R() < 0.5 ? 1 : -1; s.throttle = 0;
  sfx.hit(s === player ? 0 : 60);
  if (s === player) { setTimeout(() => showSunk(), 3500); return; }
  if (by === player) {
    save.kills++; const bounty = s.kind === 'hunter' ? 140 : 40; save.gold += bounty; sfx.coin();
    toast(`${s.name} is sinking! +${bounty} gold`);
    spawnLoot(s); respawnT.push({ kind: s.kind, t: 25 });
  } else respawnT.push({ kind: s.kind, t: 25 });
}

// ---------- loot ----------
const GOODS = { rum: { n: 'Rum', p: 22 }, sugar: { n: 'Sugar', p: 14 }, spice: { n: 'Spice', p: 36 }, silk: { n: 'Silk', p: 52 }, tobacco: { n: 'Tobacco', p: 26 } };
const CAP = 30;
const loot = [];
const crateGeo = new THREE.BoxGeometry(1.2, 0.9, 1.2), crateMat = new THREE.MeshStandardMaterial({ map: planks({ base: [110, 86, 56], rows: 4, seed: 77, tar: 0.6 }), roughness: 0.9 });
const chestMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.6, metalness: 0.3, emissive: 0x3a2400, emissiveIntensity: 0.6 });
const barrelGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10);
function spawnLoot(s) {
  const n = s.kind === 'merchant' ? 4 + (R() * 2 | 0) : 2;
  for (let i = 0; i < n; i++) {
    const keys = Object.keys(GOODS), k = s.kind === 'merchant' ? keys[(R() * keys.length) | 0] : keys[(R() * 2) | 0];
    const chest = s.kind === 'hunter' && i === 0;
    const mesh = new THREE.Mesh(chest ? crateGeo : (R() < 0.5 ? crateGeo : barrelGeo), chest ? chestMat : crateMat);
    if (chest) mesh.scale.set(1.1, 0.8, 0.8);
    scene.add(mesh);
    const a = R() * 6.28, r = 4 + R() * 10;
    loot.push({ x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r, mesh, g: chest ? null : k, q: chest ? 0 : 1 + (R() * 3 | 0), gold: chest ? 80 + (R() * 80 | 0) : 0, t: 0, sp: R() * 6 });
  }
  if (!save.hints.loot) showHint('loot');
}
function updateLoot(dt, t) {
  for (let i = loot.length - 1; i >= 0; i--) {
    const l = loot[i]; l.t += dt;
    const y = waveHeight(l.x, l.z, t); l.mesh.position.set(l.x, y + 0.15, l.z); l.mesh.rotation.set(Math.sin(t * 1.3 + l.sp) * 0.25, l.t * 0.2 + l.sp, Math.cos(t * 1.1 + l.sp) * 0.2);
    let gone = l.t > 120;
    if (player && !player.sinking && Math.hypot(l.x - player.x, l.z - player.z) < 15) {
      if (l.gold) { save.gold += l.gold; toast(`+${l.gold} gold`); sfx.coin(); gone = true; }
      else { const have = cargoN(); if (have < CAP) { const q = Math.min(l.q, CAP - have); save.cargo[l.g] = (save.cargo[l.g] || 0) + q; toast(`+${q} ${GOODS[l.g].n}`); sfx.coin(); gone = true; } else if (!l.full) { l.full = 1; toast('The hold is full'); } }
      if (gone) save.hints.loot = 1;
    }
    if (gone) { scene.remove(l.mesh); loot.splice(i, 1); }
  }
}
const cargoN = () => Object.values(save.cargo).reduce((a, b) => a + b, 0);

// ---------- AI ----------
const respawnT = [];
function inHarbour(x, z) { return Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.R + 170; }
function steerTo(s, hd) { const err = wrap(hd - s.h); s.rudder = clamp(-err * 2.2, -1, 1); return err; }
const headingTo = (dx, dz) => Math.atan2(-dx, -dz);
function avoidIsland(s) {
  const [fx_, fz] = s.fwd(); const lx = s.x + fx_ * 90, lz = s.z + fz * 90;
  if (islandH(lx, lz) > -6 || Math.hypot(lx - ISLAND.x, lz - ISLAND.z) < ISLAND.R * 1.15) {
    const a = Math.atan2(s.z - ISLAND.z, s.x - ISLAND.x); return headingTo(Math.cos(a), Math.sin(a));
  }
  return null;
}
function ai(s, dt) {
  const A = s.ai, P = player; A.t += dt; A.aim = null;
  const dx = P.x - s.x, dz = P.z - s.z, dist = Math.hypot(dx, dz);
  const pAlive = P && !P.sinking && state === 'play';
  const safe = inHarbour(P.x, P.z) || inHarbour(s.x, s.z);
  let hd = null;
  if (s.kind === 'hunter' && pAlive && dist < 1100 && !inHarbour(P.x, P.z)) {
    const [lx, lz] = s.toLocal(P.x, P.z), b = Math.atan2(lx, -lz); // bearing: 0 ahead, +starboard
    if (dist > 280) { const tt = dist / 20; hd = headingTo(dx + P.vel.x * tt, dz + P.vel.z * tt); s.throttle = 0.95; }
    else if (dist < 80) { hd = headingTo(-dx, -dz); s.throttle = 0.9; }
    else { const want = b > 0 ? Math.PI / 2 : -Math.PI / 2; hd = s.h - (want - b) * 0.9; s.throttle = 0.6; }
    A.engaged = true;
  } else if (s.kind === 'merchant' && A.aggro > 0 && pAlive) {
    A.aggro -= dt; hd = headingTo(-dx, -dz); s.throttle = 1;
  } else {
    A.engaged = false;
    if (!A.wp || Math.hypot(A.wp[0] - s.x, A.wp[1] - s.z) < 60) { const a = R() * 6.28, r = 650 + R() * 1300; A.wp = [Math.cos(a) * r, Math.sin(a) * r]; }
    hd = headingTo(A.wp[0] - s.x, A.wp[1] - s.z); s.throttle = s.kind === 'merchant' ? 0.55 : 0.7;
    if (s.kind === 'hunter' && inHarbour(s.x, s.z)) hd = headingTo(s.x - ISLAND.x, s.z - ISLAND.z);
  }
  const av = avoidIsland(s); if (av !== null) hd = av;
  steerTo(s, hd);
  // fire when the player sits on a beam
  if (pAlive && !safe && dist < (s.kind === 'hunter' ? 340 : 230) && (s.kind === 'hunter' || A.aggro > 0)) {
    const [lx, lz] = s.toLocal(P.x, P.z), side = lx > 0 ? 'star' : 'port', off = Math.atan2(lz, Math.abs(lx));
    if (Math.abs(off) < 0.32 && s.reload[side] <= 0) { A.aim = solve(s, P, s.st.ball, s.kind === 'hunter' ? 0.16 : 0.3); fire(s, side); }
  }
}
function spawnEnemy(kind, nearPlayer) {
  let x, z;
  for (let k = 0; k < 40; k++) {
    const a = R() * 6.28, r = nearPlayer ? 950 + R() * 450 : 700 + R() * 900;
    const cx = nearPlayer && player ? player.x : 0, cz = nearPlayer && player ? player.z : 0;
    x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r;
    if (Math.hypot(x, z) < 2600 && !inHarbour(x, z) && Math.hypot(x - ISLAND.x, z - ISLAND.z) > ISLAND.R + 400) break;
  }
  const s = new Ship(kind, x, z, R() * 6.28); s.throttle = 0.6; s.speed = 4; s.place(); makePlate(s); return s;
}

// ---------- camera ----------
let camMode = settings.cam === 'first' ? 'first' : 'third';
let lyaw = 0, lpitch = 0, lookIdle = 9, camDist = 44, shake = 0, camSwing = { sx: 0, t: 0 };
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
function setCam(m) {
  camMode = m; settings.cam = m; saveSettings(); lyaw = 0; lpitch = 0;
  $('camIco').textContent = m === 'first' ? '1st' : '3rd';
  camera.fov = m === 'first' ? 72 : 55; camera.near = m === 'first' ? 0.1 : 0.5; camera.updateProjectionMatrix();
  document.querySelectorAll('#camSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === m));
  if (player) player.S.group.visible = true;
}
function updateCamera(dt, t) {
  const s = player; if (!s) return;
  lookIdle += dt;
  if (state === 'title') {
    const a = t * 0.05 + 2.2; camPos.set(s.x + Math.cos(a) * 52, s.y + 13, s.z + Math.sin(a) * 52);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 2)); camera.lookAt(s.x, s.y - 3, s.z); return;
  }
  if (state === 'port') { // frame the berth and the harbour town
    camPos.set(DOCK.x + 62, 17, DOCK.z + 34); if (camera.position.distanceTo(camPos) > 150) camera.position.copy(camPos); else camera.position.lerp(camPos, 1 - Math.exp(-dt * 2)); camera.lookAt(DOCK.x - 38, 8, DOCK.z - 28); return;
  }
  if (camMode === 'third') {
    if (camSwing.t > 0) { // swing the chase cam behind the opposite quarter so the broadside and its target are in view
      camSwing.t -= dt; if (lookIdle < 0.5 && dt > 0 && camSwing.t < 2.5) camSwing.t = 0;
      else { lyaw += (-camSwing.sx * 0.85 - lyaw) * (1 - Math.exp(-dt * 3)); lookIdle = 2.4; }
    } else if (lookIdle > 2.5) { lyaw *= Math.exp(-dt * 1.2); lpitch *= Math.exp(-dt * 1.2); }
    const yaw = s.h + lyaw, p = clamp(0.24 + lpitch, -0.05, 1.2);
    const tx = s.x, ty = s.y + 5, tz = s.z;
    camPos.set(tx + Math.sin(yaw) * Math.cos(p) * camDist, ty + Math.sin(p) * camDist, tz + Math.cos(yaw) * Math.cos(p) * camDist);
    const wh = waveHeight(camPos.x, camPos.z, t) + 2; if (camPos.y < wh) camPos.y = wh;
    camera.position.lerp(camPos, 1 - Math.exp(-dt * (state === 'play' ? 6 : 2)));
    camLook.set(tx - Math.sin(yaw) * 10, ty, tz - Math.cos(yaw) * 10);
    camera.lookAt(camLook);
  } else {
    _e.set(s.pitch * 0.6, s.h, s.roll * 0.6, 'YXZ'); _q.setFromEuler(_e);
    _v.copy(s.S.helmEye).applyQuaternion(_q); camera.position.set(s.x + _v.x, s.y + _v.y + Math.sin(t * 1.7) * 0.03, s.z + _v.z);
    camera.quaternion.setFromEuler(_e.set(clamp(lpitch, -1.1, 1.2) + s.pitch * 0.5, s.h + lyaw, s.roll * 0.5, 'YXZ'));
  }
  if (shake > 0) { camera.position.x += (R() - 0.5) * shake; camera.position.y += (R() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.5); }
}

// ---------- graphics quality ----------
let fpsNow = 60, fpsLowRun = 0, fpsAcc = 0, fpsN = 0;
function applyGfx() {
  const want = settings.gfx === 'low' ? true : settings.gfx === 'high' ? false : LOW;
  setLow(want, true);
  document.querySelectorAll('#gfxSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.gfx));
  $('gfxNote').textContent = `Now: ${LOW ? 'Low' : 'High'} · ${fpsNow | 0} fps` + (settings.gfx === 'auto' ? ' · Auto drops to Low if fps stays low' : '');
}
function setLow(l, force) {
  if (l === LOW && !force) return;
  const changed = l !== LOW; LOW = l;
  if (changed) { scene.remove(ocean); ocean.geometry.dispose(); ocean = makeOcean(LOW); scene.add(ocean); }
  island.lights.forEach(li => li.intensity = LOW ? 0 : 60);
  OCEAN_U.uDetail.value = LOW ? 0 : 1;
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight, dpr = devicePixelRatio || 1;
  const pr = LOW ? Math.min(dpr, 1) * (isTouch ? 1 : 0.9) : Math.min(dpr, isTouch ? 1.75 : 1.5);
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  camera.aspect = w / h; camera.updateProjectionMatrix(); fx.setScale(h * pr);
}
addEventListener('resize', resize);
// save when the tab is hidden or closed (phones kill background tabs)
addEventListener('pagehide', () => { if (save && state !== 'title') writeSave(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && save && state !== 'title') writeSave(); });

// ---------- UI ----------
let state = 'title';
const hud = $('hud');
function toast(msg) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; $('toasts').appendChild(d); setTimeout(() => d.remove(), 2700); while ($('toasts').children.length > 4) $('toasts').firstChild.remove(); }
let hitFlash = 0; function flashHit() { hitFlash = 0.35; }
const HINTS = {
  sail: () => isTouch ? 'Push the brass lever up to make sail' : 'Raise the throttle with W / ↑ (or + −)',
  steer: () => isTouch ? 'Steer with the HELM stick' : 'Steer with A / D or ← / →',
  cam: () => isTouch ? 'Tap 3rd/1st to take the helm in first person · drag to look' : 'V switches first / third person · drag to look around',
  fight: () => isTouch ? 'Sail spotted! Turn your side to it — ◀ PORT / STBD ▶ fire' : 'Sail spotted! Turn your side to it — Q / E fire port / starboard',
  loot: () => 'Sail through the floating cargo to haul it aboard',
  port: () => isTouch ? 'Back at the pier: slow down and tap ⚓ Dock to sell & repair' : 'Back at the pier: slow down and press F (or ⚓ Dock) to sell & repair',
};
let hintKey = null, hintT = 0;
function showHint(k) { if (save.hints[k] || hintKey === k) return; hintKey = k; hintT = 0; $('hint').textContent = HINTS[k](); $('hint').classList.remove('hidden'); }
function doneHint(k) { save.hints[k] = 1; if (hintKey === k) { hintKey = null; $('hint').classList.add('hidden'); } }
function hintTick(dt) {
  if (state !== 'play') return; hintT += dt;
  if (hintKey && hintT > 12 && hintKey !== 'sail') doneHint(hintKey);
  if (!save.hints.sail) { showHint('sail'); if (player.throttle > 0.15) doneHint('sail'); return; }
  if (!save.hints.steer) { showHint('steer'); if (Math.abs(player.rudder) > 0.3) { steerT += dt; if (steerT > 0.8) doneHint('steer'); } return; }
  if (!save.hints.cam && save.play > 25) { showHint('cam'); return; }
  if (!save.hints.fight) { for (const e of ships) if (e !== player && !e.sinking && Math.hypot(e.x - player.x, e.z - player.z) < 480) { showHint('fight'); break; } }
  if (!save.hints.port && (cargoN() > 0 || player.hp < player.maxHp * 0.6) && Math.hypot(player.x - DOCK.x, player.z - DOCK.z) < 400) showHint('port');
}
let steerT = 0;
function updateHUD() {
  const p = player, f = p.hp / p.maxHp;
  $('hpBar').style.width = (f * 100) + '%'; $('hpBar').classList.toggle('low', f < 0.35); $('hpTxt').textContent = Math.ceil(p.hp);
  $('gold').textContent = save.gold; $('cargo').textContent = cargoN() + '/' + CAP; $('kills').textContent = save.kills;
  $('spd').textContent = (p.speed * 1.944).toFixed(1);
  const pct = Math.round(p.throttle * 100); $('thPct').textContent = pct + '%';
  $('handle').style.bottom = (p.throttle * 100) + '%'; $('fillT').style.height = `calc(${p.throttle * 100}% - 4px)`;
  for (const [side, id, ring] of [['port', 'fireP', 'ringP'], ['star', 'fireS', 'ringS']]) {
    const r = p.reload[side] / p.st.reload; $(ring).style.strokeDashoffset = (r * 100.5).toFixed(1); $(id).classList.toggle('reload', r > 0);
    $(id).classList.toggle('aim', r <= 0 && !!aimFor(p, side));
  }
  const nearDock = Math.hypot(p.x - DOCK.x, p.z - DOCK.z) < 55 && p.speed < 5 && !p.sinking;
  $('dockBtn').classList.toggle('hidden', !nearDock || state !== 'play'); canDock = nearDock;
  const z = inHarbour(p.x, p.z); $('zone').classList.toggle('hidden', !z); $('zone').textContent = '⚓ Harbour waters — safe';
}
let canDock = false;
// nameplates
const _p = new THREE.Vector3();
function makePlate(s) { const d = document.createElement('div'); d.className = 'plate ' + s.kind; d.innerHTML = `<span>${s.kind === 'hunter' ? '⚔ ' : ''}${s.name}</span><div class="bar"><i></i></div>`; $('labels').appendChild(d); s.plate = d; }
function updatePlates() {
  const W = innerWidth, H = innerHeight;
  for (const s of ships) {
    if (!s.plate) continue; const d = Math.hypot(s.x - camera.position.x, s.z - camera.position.z);
    _p.set(s.x, s.y + s.S.dims.F + 22, s.z).project(camera);
    const vis = d < 700 && _p.z < 1 && !s.sinking && state === 'play';
    s.plate.style.display = vis ? '' : 'none'; if (!vis) continue;
    s.plate.style.left = ((_p.x + 1) / 2 * W).toFixed(0) + 'px'; s.plate.style.top = ((1 - _p.y) / 2 * H).toFixed(0) + 'px';
    s.plate.style.opacity = d > 500 ? (700 - d) / 200 : 1;
    s.plate.lastChild.firstChild.style.width = (s.hp / s.maxHp * 100) + '%';
  }
}
// minimap
const mctx = $('map').getContext('2d');
function drawMap() {
  const c = mctx, W = 220, S = W / 2 / 900, p = player; c.clearRect(0, 0, W, W);
  c.save(); c.beginPath(); c.arc(110, 110, 108, 0, 7); c.clip();
  const g = c.createRadialGradient(110, 110, 10, 110, 110, 110); g.addColorStop(0, '#2a3634'); g.addColorStop(1, '#141a19'); c.fillStyle = g; c.fillRect(0, 0, W, W);
  c.strokeStyle = 'rgba(200,180,130,.12)'; c.lineWidth = 1; for (let r = 30; r < 110; r += 36) { c.beginPath(); c.arc(110, 110, r, 0, 7); c.stroke(); }
  const P = (x, z) => [110 + (x - p.x) * S, 110 + (z - p.z) * S];
  const [ix, iz] = P(ISLAND.x, ISLAND.z); c.fillStyle = '#7a6a48'; c.beginPath(); c.arc(ix, iz, ISLAND.R * 0.95 * S, 0, 7); c.fill();
  c.strokeStyle = 'rgba(160,220,170,.35)'; c.setLineDash([3, 3]); c.beginPath(); c.arc(ix, iz, (ISLAND.R + 170) * S, 0, 7); c.stroke(); c.setLineDash([]);
  const [dx, dz] = P(DOCK.x, DOCK.z); c.fillStyle = '#e8c070'; c.font = 'bold 16px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⚓', dx, dz);
  for (const l of loot) { const [x, z] = P(l.x, l.z); c.fillStyle = '#f0c95a'; c.fillRect(x - 2, z - 2, 4, 4); }
  for (const s of ships) {
    if (s === player || s.sinking) continue; let [x, z] = P(s.x, s.z); const dd = Math.hypot(x - 110, z - 110);
    if (dd > 100) { x = 110 + (x - 110) / dd * 100; z = 110 + (z - 110) / dd * 100; }
    c.fillStyle = s.kind === 'hunter' ? '#ff5a46' : '#f1e3b8'; c.beginPath(); c.arc(x, z, dd > 100 ? 4 : 6, 0, 7); c.fill();
  }
  c.restore();
  c.save(); c.translate(110, 110); c.rotate(-p.h); c.fillStyle = '#ffe2a0'; c.strokeStyle = '#2a1a0c'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, -13); c.lineTo(8, 10); c.lineTo(0, 5); c.lineTo(-8, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
  c.fillStyle = '#d9c391'; c.font = 'bold 15px Georgia'; c.fillText('N', 110, 14);
}

// ---------- port ----------
const price = k => Math.round(GOODS[k].p * (0.9 + 0.2 * Math.abs(Math.sin(Math.floor(Date.now() / 3.6e6) * 7.3 + k.length))));
function dock() {
  if (!canDock || state !== 'play') return;
  const p = player; p.x = DOCK.x; p.z = DOCK.z; p.h = DOCK.heading; p.speed = 0; p.throttle = 0; p.rudder = 0;
  state = 'port'; doneHint('port'); sfx.bell(); renderPort(); $('port').classList.remove('hidden'); writeSave();
}
function renderPort() {
  const p = player, miss = Math.ceil(p.maxHp - p.hp), cost = miss * 2;
  $('pHp').style.width = (p.hp / p.maxHp * 100) + '%'; $('pHpT').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  const can = Math.min(miss, Math.floor(save.gold / 2));
  $('repBtn').textContent = miss <= 0 ? 'Hull is sound' : can >= miss ? `Repair hull — ${cost} gold` : can > 0 ? `Patch ${can} hull — ${can * 2} gold` : `Repair hull — ${cost} gold (not enough)`;
  $('repBtn').disabled = miss <= 0 || can <= 0;
  const m = $('mkt'); m.innerHTML = ''; let tot = 0;
  for (const k in save.cargo) { const q = save.cargo[k]; if (!q) continue; const pr = price(k); tot += pr * q; const d = document.createElement('div'); d.className = 'it'; d.innerHTML = `<b>${GOODS[k].n} ×${q}</b><span>${pr}g ea</span><button data-k="${k}">Sell</button>`; m.appendChild(d); }
  if (!tot) m.innerHTML = '<div class="empty">Your hold is empty. Plunder merchant ships and haul their floating cargo aboard.</div>';
  $('sellAll').textContent = tot ? `Sell all cargo — ${tot} gold` : 'Nothing to sell'; $('sellAll').disabled = !tot;
  $('pGold').textContent = save.gold;
}
function sell(k) { const q = save.cargo[k] || 0; if (!q) return; save.gold += price(k) * q; delete save.cargo[k]; sfx.coin(); renderPort(); writeSave(); }
$('mkt').addEventListener('click', e => { const k = e.target.dataset && e.target.dataset.k; if (k) sell(k); });
$('sellAll').onclick = () => { for (const k of Object.keys(save.cargo)) sell(k); };
$('repBtn').onclick = () => { const p = player, miss = Math.ceil(p.maxHp - p.hp), can = Math.min(miss, Math.floor(save.gold / 2)); if (can <= 0) return; p.hp = Math.min(p.maxHp, p.hp + can); save.gold -= can * 2; sfx.creak(); renderPort(); writeSave(); };
$('castOff').onclick = () => { $('port').classList.add('hidden'); state = 'play'; player.x += 2; toast('Cast off! Raise the throttle'); writeSave(); };
$('dockBtn').onclick = dock;

// ---------- sinking / respawn ----------
function showSunk() { state = 'sunk'; $('sunk').classList.remove('hidden'); }
$('reBtn').onclick = () => {
  save.cargo = {}; save.gold = Math.floor(save.gold * 0.9);
  player.remove(); ships.splice(ships.indexOf(player), 1);
  newPlayer(); player.hp = player.maxHp; $('sunk').classList.add('hidden'); state = 'play'; canDock = true; writeSave();
  setTimeout(() => { canDock = true; dock(); }, 50);
};

// ---------- input ----------
const keys = {}; let lastS = 0;
const cap = (el, id) => { try { el.setPointerCapture(id); } catch (_) { /* synthetic or already-released pointer */ } };
addEventListener('keydown', e => {
  if (e.repeat && !['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'].includes(e.code)) return;
  keys[e.code] = true; audioInit();
  if (window.PSEASVote && PSEASVote.isOpen()) return;
  if (state === 'title' && (e.code === 'Enter' || e.code === 'Space')) { startGame(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play' || state === 'paused') toggleSettings(); return; }
  if (state !== 'play') return;
  const p = player;
  if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Equal' || e.code === 'NumpadAdd') setThrottle(p.throttle + 0.1);
  if (e.code === 'KeyS' || e.code === 'ArrowDown' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
    const now = performance.now(); if (!e.repeat && (e.code === 'KeyS' || e.code === 'ArrowDown') && now - lastS < 280) setThrottle(0); else setThrottle(p.throttle - 0.1); lastS = now;
  }
  if (e.code === 'KeyX') setThrottle(0);
  if (e.code === 'KeyQ') fire(p, 'port');
  if (e.code === 'KeyE') fire(p, 'star');
  if (e.code === 'Space') { fire(p, 'port'); fire(p, 'star'); e.preventDefault(); }
  if (e.code === 'KeyV') setCam(camMode === 'first' ? 'third' : 'first');
  if (e.code === 'KeyF') dock();
  if (e.code === 'KeyM') { settings.sound = !settings.sound; setSound(settings.sound); saveSettings(); toast(settings.sound ? 'Sound on' : 'Sound off'); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
function setThrottle(v) { player.throttle = clamp(Math.round(v * 20) / 20, 0, 1); }
// steering stick
let stickX = 0, stickId = null;
(() => {
  const el = $('stick'), knob = $('knob');
  const mv = e => { const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = e.clientX - cx, dy = e.clientY - cy; const m = r.width * 0.36, l = Math.hypot(dx, dy); if (l > m) { dx *= m / l; dy *= m / l; } knob.style.transform = `translate(${dx}px,${dy * 0.35}px)`; stickX = clamp(dx / m, -1, 1); };
  el.addEventListener('pointerdown', e => { audioInit(); stickId = e.pointerId; cap(el, e.pointerId); mv(e); e.preventDefault(); });
  el.addEventListener('pointermove', e => { if (e.pointerId === stickId) mv(e); });
  const up = e => { if (e.pointerId !== stickId) return; stickId = null; stickX = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
})();
// throttle lever
(() => {
  const tr = $('track'); let id = null, lastTap = 0;
  const mv = e => { const r = tr.getBoundingClientRect(); setThrottle(1 - (e.clientY - r.top) / r.height); };
  const down = e => { audioInit(); const now = performance.now(); if (now - lastTap < 300) { setThrottle(0); lastTap = 0; return; } lastTap = now; id = e.pointerId; cap($('lever'), e.pointerId); mv(e); e.preventDefault(); };
  tr.addEventListener('pointerdown', down); $('handle').addEventListener('pointerdown', down);
  $('lever').addEventListener('pointermove', e => { if (e.pointerId === id) mv(e); });
  $('lever').addEventListener('pointerup', e => { if (e.pointerId === id) id = null; });
  $('thFull').addEventListener('click', () => setThrottle(1)); $('thStop').addEventListener('click', () => setThrottle(0));
})();
$('fireP').addEventListener('pointerdown', e => { audioInit(); e.preventDefault(); if (state === 'play') fire(player, 'port'); });
$('fireS').addEventListener('pointerdown', e => { audioInit(); e.preventDefault(); if (state === 'play') fire(player, 'star'); });
$('camBtn').addEventListener('click', () => setCam(camMode === 'first' ? 'third' : 'first'));
// drag to look / pinch zoom on the canvas
const ptrs = new Map(); let pinch0 = 0, dist0 = 44;
canvas.addEventListener('pointerdown', e => { audioInit(); cap(canvas, e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = camDist; } });
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) camDist = clamp(dist0 * pinch0 / d, 22, 110); return; }
  const k = settings.sens * (isTouch ? 0.0065 : 0.005);
  lyaw -= dx * k; lpitch = clamp(lpitch + (camMode === 'first' ? -dy : dy) * k * 0.8, -1.1, 1.1); lookIdle = 0;
  if (camMode === 'third') lyaw = wrap(lyaw);
  else lyaw = clamp(lyaw, -2.9, 2.9);
});
const pend = e => { ptrs.delete(e.pointerId); pinch0 = 0; };
canvas.addEventListener('pointerup', pend); canvas.addEventListener('pointercancel', pend);
canvas.addEventListener('wheel', e => { camDist = clamp(camDist * (1 + Math.sign(e.deltaY) * 0.1), 22, 110); e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

// ---------- settings panel ----------
function toggleSettings(force) {
  const open = force ?? $('settings').classList.contains('hidden');
  $('settings').classList.toggle('hidden', !open);
  if (open) { if (state === 'play') state = 'paused'; refreshSettings(); voteRow(); }
  else if (state === 'paused') state = 'play';
}
function refreshSettings() {
  applyGfx();
  document.querySelectorAll('#camSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === camMode));
  document.querySelectorAll('#sndSeg button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === !!settings.sound));
  $('sens').value = settings.sens;
  $('helpTxt').innerHTML = isTouch
    ? '<b>Helm stick</b> steer · <b>brass lever</b> throttle (FULL / STOP, double-tap = stop) · <b>◀ PORT / STBD ▶</b> fire broadsides (they glow when a target is in the arc) · <b>drag</b> the sea to look · <b>pinch</b> to zoom · <b>3rd/1st</b> camera'
    : '<b>A/D ←/→</b> steer · <b>W/S ↑/↓ + −</b> throttle (X or double-tap S = stop) · <b>Q / E</b> fire port / starboard · <b>Space</b> both · <b>V</b> first/third person · <b>drag</b> to look · <b>wheel</b> zoom · <b>F</b> dock · <b>M</b> mute · <b>Esc</b> settings';
}
$('setBtn').onclick = () => toggleSettings(true);
$('tSetBtn').onclick = () => toggleSettings(true);
$('setClose').onclick = () => toggleSettings(false);
$('gfxSeg').onclick = e => { const v = e.target.dataset.v; if (!v) return; settings.gfx = v; saveSettings(); if (v === 'auto') { fpsLowRun = 0; setLow(false); } applyGfx(); };
$('camSeg').onclick = e => { const v = e.target.dataset.v; if (v) { setCam(v); refreshSettings(); } };
$('sndSeg').onclick = e => { const v = e.target.dataset.v; if (!v) return; settings.sound = v === '1'; setSound(settings.sound); saveSettings(); refreshSettings(); };
$('sens').oninput = e => { settings.sens = +e.target.value; saveSettings(); };

// ---------- 2D/3D preference vote (shared js/pseas-vote.js; results are never shown in-game) ----------
const LIVE = location.hostname === 'jonnah1738.github.io' && (!navigator.webdriver || /[?&]ct=1\b/.test(location.search));
let votePaused = false;
function voteRow() { const V = window.PSEASVote; if (!V) return; const r = V.settingsRow(); $('voteBtn').textContent = r.button; $('voteNote').textContent = r.text; }
function voteCalm() {
  if (state === 'port') return true;
  if (state !== 'play' || !player || player.sinking || player.hp < player.maxHp * 0.4) return false;
  for (const s of ships) if (s !== player && !s.sinking && (s.kind === 'hunter' || (s.ai && s.ai.aggro > 0)) && Math.hypot(s.x - player.x, s.z - player.z) < 700) return false;
  return true;
}
$('voteBtn').onclick = () => { if (window.PSEASVote) PSEASVote.open(true); };
if (window.PSEASVote) PSEASVote.init({
  game: '3d', countOn: LIVE, otherUrl: 'https://jonnah1738.github.io/pirate-game/', settingsName: 'Settings',
  isPlaying: () => state === 'play' || state === 'port', isCalm: voteCalm,
  onOpen: () => { if (state === 'play') { state = 'paused'; votePaused = true; } },
  onClose: () => { if (votePaused && state === 'paused' && $('settings').classList.contains('hidden')) state = 'play'; votePaused = false; voteRow(); },
});
// private reach counters (live site only): unique devices + sessions (one per tab session)
function hit3d(k, flag, store) {
  if (!LIVE) return; try { if (flag && store.getItem(flag)) return; } catch (e) { return; }
  fetch('https://abacus.jasoncameron.dev/hit/jonnah1738-pirate-seas/' + k, { method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true })
    .then(r => { if (r.ok && flag) try { store.setItem(flag, '1'); } catch (e) { } }, () => { });
}
hit3d('3d-devices', 'ps3d_counted_v1', localStorage); hit3d('3d-sessions', 'ps3d_session_v1', sessionStorage);

// ---------- game flow ----------
function newPlayer() {
  player = new Ship('sloop', DOCK.x + 12, DOCK.z + 45, Math.PI); player.place();
  player.hp = clamp(save ? save.hp : 160, 20, 160);
}
function startGame(isNew) {
  audioInit(); setSound(settings.sound);
  if (isNew || !save) { save = fresh(); player.hp = player.maxHp; }
  $('title').classList.add('hidden'); hud.classList.remove('hidden'); state = 'play'; writeSave();
}
$('playBtn').onclick = () => startGame(false);
$('newBtn').onclick = () => startGame(true);

function initTitle() {
  if (save) { $('playBtn').textContent = `Continue — ${save.gold} gold`; $('newBtn').classList.remove('hidden'); }
  $('tKeys').innerHTML = isTouch ? 'Helm stick to steer · brass lever for sail · ◀ ▶ broadsides · drag to look · 3rd/1st camera' : 'A/D steer · W/S throttle · Q/E broadsides · V first/third person · drag to look · Esc settings';
}

// ---------- main loop ----------
let last = performance.now(), simT = 0, frame = 0, saveT = 0, creakT = 4;
const clock = { fpsT: 0, n: 0 };
function step(dt) {
  simT += dt; const t = simT;
  OCEAN_U.uTime.value = t;
  const run = state === 'play' || state === 'port' || state === 'title' || state === 'sunk';
  if (run) {
    if (state === 'play') {
      const p = player;
      let r = stickX; if (keys.KeyA || keys.ArrowLeft) r -= 1; if (keys.KeyD || keys.ArrowRight) r += 1; p.rudder = clamp(r, -1, 1);
      save.play += dt;
    } else if (state !== 'sunk') { player.rudder = 0; }
    if (state === 'port') { player.x = DOCK.x; player.z = DOCK.z; player.h = DOCK.heading; player.speed = 0; player.throttle = 0; }
    for (const s of ships) if (s.ai && !s.sinking && !s.dead && state !== 'title') ai(s, dt);
    for (const s of ships) if (!s.dead) s.update(dt, t);
    for (let i = ships.length - 1; i >= 0; i--) if (ships[i].dead && ships[i] !== player) ships.splice(i, 1);
    // ship-ship separation
    for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
      const a = ships[i], b = ships[j]; if (a.sinking || b.sinking) continue; const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = (a.L + b.L) * 0.32;
      if (d < m && d > 0.01) { const k = (m - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; a.speed *= 0.97; b.speed *= 0.97; }
    }
    updateBalls(dt, t); updateLoot(dt, t);
    for (const r of respawnT) r.t -= dt;
    for (let i = respawnT.length - 1; i >= 0; i--) if (respawnT[i].t <= 0) { const k = respawnT.splice(i, 1)[0].kind; if (state !== 'title') spawnEnemy(k, true); }
    const hunters = ships.filter(s => s.kind === 'hunter' && !s.sinking).length + respawnT.filter(r => r.kind === 'hunter').length;
    if (save && save.kills >= 3 && hunters < 2 && state === 'play') spawnEnemy('hunter', true);
  }
  // visuals
  for (const s of ships) {
    if (s.dead) continue;
    const d = Math.hypot(s.x - camera.position.x, s.z - camera.position.z), near = d < (LOW ? 220 : 420);
    animateShip(s.S, t, s.sinking ? 0.1 : Math.max(0.15, s.throttle), s.rudder >= 0 ? 1 : -1, near && (!LOW || frame % 2 === 0));
    s.S.wheel.rotation.z = -s.rudder * 2.4; s.S.rig.visible = d < (LOW ? 300 : 900);
    if (d < (LOW ? 500 : 1100)) { const [fx_, fz] = s.fwd(), [wx, wz] = s.toWorld(0, s.S.dims.L * 0.48); s.wake.update(wx, wz, fx_, fz, s.speed, s.S.dims.B * 0.32, t, t); }
    if (s.speed > 3 && !s.sinking && d < 400) { const [bx, bz] = s.toWorld(0, -s.S.dims.L * 0.5); const [fx_, fz] = s.fwd(); fx.spray(bx, s.y + 0.3, bz, fx_ * s.speed * 0.6, fz * s.speed * 0.6, (s.speed / s.st.spd) * (LOW ? 0.4 : 0.9)); }
  }
  fx.update(dt, t);
  // hull cut-outs in the water + lantern glow
  let k = 0;
  for (const s of ships) {
    if (k >= MAXS || s.dead) continue; const a = OCEAN_U.uShipA.value[k], b = OCEAN_U.uShipB.value[k];
    if (s.sinking > 1.5) { b.set(0, 0, 0, 0); k++; continue; }
    a.set(s.x, s.z, s.h, s.y + s.S.dims.deckY + 0.2); b.set(s.S.dims.B * 0.47, s.S.dims.L * 0.47, 0, 0); k++;
  }
  for (; k < MAXS; k++) OCEAN_U.uShipB.value[k].set(0, 0, 0, 0);
  if (player) { const lp = player.S.group.localToWorld(player.S.lanternPos.clone()); lantern.position.copy(lp); OCEAN_U.uLantern.value.set(lp.x, lp.y, lp.z, player.sinking ? 0 : 0.6); lantern.intensity = 16 + Math.sin(t * 9) * 1.5 + Math.sin(t * 23) * 1; }
  updateCamera(dt, t);
  sky.position.copy(camera.position);
  ocean.material.uniforms.uCenter.value.set(Math.round(camera.position.x / 4) * 4, Math.round(camera.position.z / 4) * 4);
  if (state === 'play' || state === 'paused' || state === 'port') { updateHUD(); updatePlates(); if (frame % 3 === 0) drawMap(); hintTick(dt); }
  if (state === 'play') {
    saveT += dt; if (saveT > 15) { saveT = 0; writeSave(); }
    creakT -= dt; if (creakT < 0) { creakT = 5 + R() * 7; sfx.creak(); }
    sfx.speed(player.speed);
  }
  if (hitFlash > 0) { hitFlash -= dt; canvas.style.filter = hitFlash > 0 ? `sepia(.6) saturate(${1 + hitFlash * 3}) hue-rotate(-20deg)` : ''; }
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
  if (state !== 'paused') step(dt); else { updateCamera(0, simT); }
  renderer.render(scene, camera);
  // fps + auto graphics
  clock.fpsT += now - (clock.prev || now); clock.prev = now; clock.n++;
  if (clock.fpsT >= 1000) {
    fpsNow = clock.n * 1000 / clock.fpsT; clock.fpsT = 0; clock.n = 0;
    if (settings.gfx === 'auto' && !LOW && state === 'play') { fpsLowRun = fpsNow < 42 ? fpsLowRun + 1 : 0; if (fpsLowRun >= 3) { setLow(true); toast('Graphics set to Low for smoother sailing'); } }
    if (!$('settings').classList.contains('hidden')) $('gfxNote').textContent = `Now: ${LOW ? 'Low' : 'High'} · ${fpsNow | 0} fps` + (settings.gfx === 'auto' ? ' · Auto drops to Low if fps stays low' : '');
  }
}

// ---------- boot ----------
newPlayer();
spawnEnemy('merchant'); spawnEnemy('merchant'); spawnEnemy('hunter');
setCam(camMode);
if (settings.gfx === 'low') setLow(true, true); else resize();
setSound(settings.sound);
initTitle();
camera.position.set(player.x + 60, 20, player.z + 60);
$('boot').remove();
requestAnimationFrame(t => { last = t; loop(t); });

// test / debug hooks
window.__ps3d = {
  get state() { return state; }, get player() { return player; }, ships, loot, balls, settings, get LOW() { return LOW; }, get fps() { return fpsNow; },
  get save() { return save; }, setCam, setLow, fire: s => fire(player, s), damage: (s, d) => damage(s, d, null), dock: () => { canDock = true; dock(); }, start: startGame, spawnEnemy, aimFor,
  get cam() { return camMode; }, step, setThrottle, renderer, scene, camera, setLook: (y, p) => { lyaw = y; lpitch = p; lookIdle = 0; },
};
