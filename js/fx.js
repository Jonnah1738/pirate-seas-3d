// Particles (smoke, splashes, splinters, spray), wake ribbons on the water.
import * as THREE from 'three';
import { waveHeight } from './ocean.js';
import { softDot, puff, foamTex } from './textures.js';

export class Particles {
  constructor(max, map, additive = false) {
    this.max = max; this.cap = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 4); this.s = new Float32Array(max);
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max); this.gr = new Float32Array(max); this.dr = new Float32Array(max); this.wat = new Uint8Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    this.u = { map: { value: map }, scale: { value: 400 }, fogCol: { value: new THREE.Color(0x868173) }, fogD: { value: 0.00105 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float scale; varying vec4 vC; varying float vF; uniform float fogD;
        void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * scale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv;
          float d = length(mv.xyz); vF = 1.0 - exp(-pow(fogD*d,2.0)); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 fogCol; varying vec4 vC; varying float vF;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); vec4 c = vec4(vC.rgb, vC.a*t.a) * vec4(t.rgb,1.0);
          c.rgb = mix(c.rgb, fogCol, vF); if (c.a < 0.01) discard; gl_FragColor = c;
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.g = g;
  }
  emit(x, y, z, vx, vy, vz, o) {
    if (this.n >= this.cap) return;
    const i = this.n++, k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z; this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.age[i] = 0; this.life[i] = o.life || 1; this.s0[i] = o.s0 || 1; this.s1[i] = o.s1 ?? this.s0[i];
    const col = o.col || [1, 1, 1]; this.c[i * 4] = col[0]; this.c[i * 4 + 1] = col[1]; this.c[i * 4 + 2] = col[2];
    this.a0[i] = o.a ?? 1; this.gr[i] = o.g ?? 0; this.dr[i] = o.drag ?? 0; this.wat[i] = o.water ? 1 : 0;
  }
  update(dt, t) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const k = i * 3, f = this.age[i] / this.life[i], dr = Math.max(0, 1 - this.dr[i] * dt);
      this.v[k] *= dr; this.v[k + 2] *= dr; this.v[k + 1] = this.v[k + 1] * dr - this.gr[i] * dt;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      if (this.wat[i]) this.p[k + 1] = waveHeight(this.p[k], this.p[k + 2], t) + 0.12;
      this.s[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * f;
      this.c[i * 4 + 3] = this.a0[i] * (f < 0.1 ? f / 0.1 : 1 - (f - 0.1) / 0.9);
      i++;
    }
    this.g.setDrawRange(0, this.n); this.mesh.visible = this.n > 0;
    if (this.n || this.was) { const A = this.g.attributes; for (const a of [A.position, A.aCol, A.aSize]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; } }
    this.was = this.n > 0;
  }
  kill(i) {
    const j = --this.n; if (i === j) return;
    for (let q = 0; q < 3; q++) { this.p[i * 3 + q] = this.p[j * 3 + q]; this.v[i * 3 + q] = this.v[j * 3 + q]; }
    for (let q = 0; q < 4; q++) this.c[i * 4 + q] = this.c[j * 4 + q];
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.a0[i] = this.a0[j];
    this.gr[i] = this.gr[j]; this.dr[i] = this.dr[j]; this.wat[i] = this.wat[j]; this.s[i] = this.s[j];
  }
}

// Particle budgets: High 600/240/520, Low 180/80/160 (switchable at runtime without reallocating).
const CAPS = { high: [600, 240, 520], low: [180, 80, 160] };
export function makeFX(scene, low) {
  const smoke = new Particles(CAPS.high[0], puff());
  const spark = new Particles(CAPS.high[1], softDot(), true);
  const bits = new Particles(CAPS.high[2], softDot());
  [smoke, bits, spark].forEach(p => scene.add(p.mesh));
  smoke.mesh.renderOrder = 3; bits.mesh.renderOrder = 2; spark.mesh.renderOrder = 4;
  const R = Math.random;
  const fx = {
    smoke, spark, bits, low,
    setLow(l) { fx.low = low = l; const c = CAPS[l ? 'low' : 'high']; smoke.cap = c[0]; spark.cap = c[1]; bits.cap = c[2]; },
    setFog(col, d) { for (const p of [smoke, spark, bits]) { p.u.fogCol.value.copy(col); p.u.fogD.value = d; } },
    setScale(h) { for (const p of [smoke, spark, bits]) p.u.scale.value = h * 0.5; },
    update(dt, t) { smoke.update(dt, t); spark.update(dt, t); bits.update(dt, t); },
    count() { return smoke.n + spark.n + bits.n; },
    muzzle(pos, dir, sv) { // dir: unit horizontal outward; sv: ship velocity
      spark.emit(pos.x, pos.y, pos.z, dir.x * 6, 1, dir.z * 6, { life: 0.12, s0: 5, s1: 9, col: [1, 0.7, 0.35], a: 1 });
      spark.emit(pos.x + dir.x, pos.y, pos.z + dir.z, dir.x * 12, 0, dir.z * 12, { life: 0.09, s0: 3, s1: 5, col: [1, 0.9, 0.6] });
      const n = low ? 4 : 9;
      for (let i = 0; i < n; i++) { const sp = 3 + R() * 9; smoke.emit(pos.x + dir.x * 0.5, pos.y, pos.z + dir.z * 0.5, dir.x * sp + sv.x * 0.6 + (R() - .5) * 2, 0.6 + R() * 1.5, dir.z * sp + sv.z * 0.6 + (R() - .5) * 2, { life: 3 + R() * 2.5, s0: 2.5 + R(), s1: 9 + R() * 6, col: [0.78, 0.76, 0.72], a: 0.55, drag: 1.2, g: -0.25 }); }
    },
    splash(x, y, z, big = 1) {
      const n = (low ? 10 : 24) * big;
      for (let i = 0; i < n; i++) { const a = R() * 6.28, s = R() * 2.5 * big; bits.emit(x, y + 0.2, z, Math.cos(a) * s, 5 + R() * 7 * big, Math.sin(a) * s, { life: 0.9 + R() * 0.6, s0: 0.5 + R() * 0.6, s1: 0.9, col: [0.85, 0.88, 0.86], a: 0.85, g: 9.8 }); }
      smoke.emit(x, y + 0.6, z, 0, 1.2, 0, { life: 1.4, s0: 2, s1: 5 * big, col: [0.86, 0.9, 0.9], a: 0.45, drag: 1 });
    },
    hit(x, y, z, nx, nz) {
      const n = low ? 12 : 26;
      for (let i = 0; i < n; i++) { const s = 2 + R() * 8; bits.emit(x, y, z, nx * s + (R() - .5) * 6, 2 + R() * 7, nz * s + (R() - .5) * 6, { life: 1.2 + R(), s0: 0.25 + R() * 0.35, col: [0.32, 0.22, 0.13], a: 1, g: 9.8, drag: 0.4 }); }
      spark.emit(x, y, z, 0, 0, 0, { life: 0.2, s0: 6, s1: 10, col: [1, 0.55, 0.2] });
      for (let i = 0; i < (low ? 3 : 6); i++) smoke.emit(x, y, z, (R() - .5) * 2, 1 + R(), (R() - .5) * 2, { life: 2.5, s0: 2, s1: 7, col: [0.25, 0.23, 0.21], a: 0.6, drag: 0.8, g: -0.4 });
    },
    burn(x, y, z, heavy) { // smoke column from a damaged ship
      smoke.emit(x + (R() - .5) * 2, y, z + (R() - .5) * 2, (R() - .5), 2 + R() * 2, (R() - .5), { life: 4, s0: 2, s1: 10, col: heavy ? [0.13, 0.12, 0.11] : [0.35, 0.33, 0.31], a: 0.5, drag: 0.2, g: -0.3 });
      if (heavy && R() < 0.5) spark.emit(x + (R() - .5) * 1.5, y + 0.3, z + (R() - .5) * 1.5, 0, 2 + R() * 2, 0, { life: 0.5, s0: 1.5, s1: 0.4, col: [1, 0.45, 0.12] });
    },
    spray(x, y, z, vx, vz, k) {
      if (R() > k) return;
      bits.emit(x, y, z, vx + (R() - .5) * 2, 1.5 + R() * 2.5 * k, vz + (R() - .5) * 2, { life: 0.7, s0: 0.5, s1: 1.4, col: [0.85, 0.9, 0.88], a: 0.55, g: 9.8 });
    },
  };
  fx.setLow(low);
  return fx;
}

// Foam ribbon following a ship's stern; width grows and fades with age.
export class Wake {
  constructor(scene, n = 70) {
    this.n = n; this.pts = []; this.h = new Float32Array(n); this.f = 0; // pts: {x,z,t,w,dx,dz,s}
    this.pos = new Float32Array(n * 2 * 3); this.uv = new Float32Array(n * 2 * 2); this.al = new Float32Array(n * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    if (!Wake.mat) Wake.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: foamTex() }, fogD: { value: 0.00105 }, fogCol: { value: new THREE.Color(0x868173) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: `attribute float aA; varying float vA; varying vec2 vUv; varying vec3 vW; void main(){ vA=aA; vUv=uv; vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform sampler2D map; uniform float fogD; uniform vec3 fogCol; varying float vA; varying vec2 vUv; varying vec3 vW;
        void main(){ float f = texture2D(map, vW.xz*0.09).a*0.8 + texture2D(map, vW.xz*0.03+0.3).a*0.6; float u = abs(vUv.x*2.0-1.0); float edge = smoothstep(1.0, 0.55, u) * (0.55 + 0.45*smoothstep(0.0, 0.5, u));
          float a = clamp(vA*edge*smoothstep(0.25, 1.1, f), 0.0, 0.6); float d = length(cameraPosition - vW); vec3 c = mix(vec3(0.66,0.7,0.68), fogCol, 1.0-exp(-pow(fogD*d,2.0)));
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, Wake.mat); this.mesh.frustumCulled = false; this.g = g; scene.add(this.mesh);
  }
  update(x, z, dx, dz, speed, halfW, t, now, step = 1) {
    const P = this.pts, last = P[P.length - 1];
    if (!last || Math.hypot(x - last.x, z - last.z) > 2.6 || now - last.t > 0.6) {
      const o = P.length >= this.n ? P.shift() : {}; o.x = x; o.z = z; o.t = now; o.w = halfW; o.dx = dx; o.dz = dz; o.s = Math.min(1, speed / 6); P.push(o);
    }
    const n = P.length;
    for (let i = 0; i < this.n; i++) {
      const p = P[Math.min(i, n - 1)];
      if (!p) { this.al[i * 2] = this.al[i * 2 + 1] = 0; continue; }
      const age = now - p.t, w = p.w * (0.75 + Math.min(1, age) * 0.25) + age * 0.9, life = 8;
      // the wave height of old, wide trail points changes slowly: refresh every point only every `step` frames
      if (i >= n - 3 || (i + this.f) % step === 0) this.h[i] = waveHeight(p.x, p.z, t) + 0.08;
      const px = -p.dz, pz = p.dx, h = this.h[i];
      const k = i * 6; this.pos[k] = p.x + px * w; this.pos[k + 1] = h; this.pos[k + 2] = p.z + pz * w; this.pos[k + 3] = p.x - px * w; this.pos[k + 4] = h; this.pos[k + 5] = p.z - pz * w;
      this.uv[i * 4] = 0; this.uv[i * 4 + 1] = i; this.uv[i * 4 + 2] = 1; this.uv[i * 4 + 3] = i;
      const fade = Math.max(0, 1 - age / life), a = i >= n ? 0 : fade * fade * p.s * Math.min(1, (n - 1 - i) / 3) * 0.85; this.al[i * 2] = this.al[i * 2 + 1] = a;
    }
    this.f++;
    for (const a of ['position', 'uv', 'aA']) this.g.attributes[a].needsUpdate = true;
  }
  dispose(scene) { scene.remove(this.mesh); this.g.dispose(); }
}
