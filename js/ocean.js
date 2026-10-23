// Gerstner ocean: one wave set shared by the GPU surface and CPU buoyancy, plus a gritty overcast sky dome.
import * as THREE from 'three';

export const G = 9.81;
// [dirX, dirZ, steepness, wavelength]
export const WAVES = [
  [1.0, 0.35, 0.15, 64],
  [0.55, 1.0, 0.13, 33],
  [-0.45, 1.0, 0.11, 19],
  [1.0, -0.75, 0.08, 10.5],
  [-0.9, -0.3, 0.05, 6.2],
].map(([x, z, q, l]) => { const n = Math.hypot(x, z); const k = 2 * Math.PI / l; return { dx: x / n, dz: z / n, q, k, c: Math.sqrt(G / k), a: q / k }; });

// Displacement of the undisturbed surface point (x,z) at time t -> writes into out {x,y,z}
export function gerstner(x, z, t, out) {
  let ox = 0, oy = 0, oz = 0;
  for (const w of WAVES) {
    const f = w.k * (w.dx * x + w.dz * z - w.c * t);
    const cf = Math.cos(f);
    ox += w.dx * w.a * cf; oz += w.dz * w.a * cf; oy += w.a * Math.sin(f);
  }
  out.x = ox; out.y = oy; out.z = oz; return out;
}
const _d = { x: 0, y: 0, z: 0 };
// Surface height at world (x,z): invert the horizontal displacement with a couple of fixed-point steps.
export function waveHeight(x, z, t) {
  let px = x, pz = z;
  for (let i = 0; i < 3; i++) { gerstner(px, pz, t, _d); px = x - _d.x; pz = z - _d.z; }
  gerstner(px, pz, t, _d); return _d.y;
}

const SKY_GLSL = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunCol; uniform vec3 uGround;
vec3 skyCol(vec3 d){
  float h = d.y;
  vec3 c = mix(uHorizon, uZenith, pow(clamp(h,0.0,1.0), 0.55));
  c = mix(c, uGround, smoothstep(0.0,-0.25,h));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(s, 6.0)*0.22 + pow(s, 64.0)*0.5);
  return c;
}`;

const WAVES_GLSL = () => {
  let s = 'const int NW = ' + WAVES.length + ';\nvec4 WV[NW];\nfloat WA[NW];\nvoid initW(){\n';
  WAVES.forEach((w, i) => { s += `WV[${i}] = vec4(${w.dx.toFixed(5)}, ${w.dz.toFixed(5)}, ${w.k.toFixed(5)}, ${w.c.toFixed(5)}); WA[${i}] = ${w.a.toFixed(5)};\n`; });
  return s + '}\n';
};

export function makeSky(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: OCEAN_U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: SKY_GLSL + `
      varying vec3 vD; uniform float uTime;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vD); vec3 c = skyCol(d);
        // heavy, smoky cloud deck
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime*0.004, uTime*0.002);
          float n = vn(uv)*0.5 + vn(uv*2.1)*0.27 + vn(uv*4.3)*0.14 + vn(uv*8.7)*0.07;
          float cl = smoothstep(0.42, 0.85, n) * smoothstep(0.0, 0.18, d.y);
          float lit = pow(max(dot(d, uSunDir),0.0), 4.0);
          vec3 cc = mix(vec3(0.16,0.15,0.15), vec3(0.62,0.48,0.34), lit*0.8);
          c = mix(c, cc, cl*0.85);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -10; scene.add(m); return m;
}

export const MAXS = 8; // hull cut-outs (keeps water out of decks)
export const OCEAN_U = {
  uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(-0.62, 0.2, 0.76).normalize() },
  uZenith: { value: new THREE.Color(0x2b333b) }, uHorizon: { value: new THREE.Color(0x8a8578) }, uGround: { value: new THREE.Color(0x1d2225) },
  uSunCol: { value: new THREE.Color(0xffb46a) }, uFogCol: { value: new THREE.Color(0x7d7a70) }, uFogD: { value: 0.0011 },
  uCenter: { value: new THREE.Vector2() }, uDetail: { value: 1 },
  uShipA: { value: Array.from({ length: MAXS }, () => new THREE.Vector4(1e6, 1e6, 0, 0)) },
  uShipB: { value: Array.from({ length: MAXS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLantern: { value: new THREE.Vector4(0, 0, 0, 0) },
};

export function makeOcean(low) {
  // polar grid, dense near the camera, sparse to the fog line
  const rings = low ? 64 : 150, segs = low ? 90 : 220, R = 3200;
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings, r = R * Math.pow(t, 2.2) + t * 2.0;
    for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + (j + 1) % segs, 1 + j);
  for (let i = 1; i < rings; i++) {
    const b0 = 1 + (i - 1) * segs, b1 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(b0 + j, b0 + j1, b1 + j, b0 + j1, b1 + j1, b1 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    uniforms: OCEAN_U, defines: low ? { LOW: 1 } : {},
    vertexShader: WAVES_GLSL() + `
      uniform float uTime; uniform vec2 uCenter;
      varying vec3 vW; varying vec3 vN; varying float vH; varying float vJ;
      void main(){
        initW();
        vec3 p = position + vec3(uCenter.x, 0.0, uCenter.y);
        vec3 d = vec3(0.0); vec3 T = vec3(1.0,0.0,0.0); vec3 B = vec3(0.0,0.0,1.0); float J = 1.0;
        float fade = 1.0 - smoothstep(900.0, 2600.0, length(position.xz));
        for (int i=0;i<NW;i++){
          vec4 w = WV[i]; float a = WA[i]*fade; float f = w.z*(dot(w.xy, p.xz) - w.w*uTime);
          float s = sin(f), c = cos(f); float wa = w.z*a;
          d += vec3(w.x*a*c, a*s, w.y*a*c);
          T += vec3(-w.x*w.x*wa*s, w.x*wa*c, -w.x*w.y*wa*s);
          B += vec3(-w.x*w.y*wa*s, w.y*wa*c, -w.y*w.y*wa*s);
          J -= wa*s;
        }
        p += d; vW = p; vH = d.y; vJ = J; vN = normalize(cross(B, T));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: SKY_GLSL + `
      uniform float uTime; uniform vec3 uFogCol; uniform float uFogD; uniform float uDetail;
      uniform vec4 uShipA[${MAXS}]; uniform vec4 uShipB[${MAXS}]; uniform vec4 uLantern;
      varying vec3 vW; varying vec3 vN; varying float vH; varying float vJ;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){
        // keep water out of hulls
        for (int i=0;i<${MAXS};i++){
          vec4 a = uShipA[i]; vec2 r = vW.xz - a.xy; float c = cos(a.z), s = sin(a.z);
          vec2 l = vec2(c*r.x - s*r.y, s*r.x + c*r.y);
          vec2 q = l / uShipB[i].xy;
          if (uShipB[i].x > 0.0 && dot(q,q) < 1.0 && vW.y < a.w) discard;
        }
        vec3 V = cameraPosition - vW; float dist = length(V); V /= dist;
        vec3 N = normalize(vN);
        #ifndef LOW
        float nd = clamp(1.0 - dist/350.0, 0.0, 1.0) * uDetail;
        if (nd > 0.0) {
          vec2 q = vW.xz*0.35 + vec2(uTime*0.35, uTime*0.21); vec2 q2 = vW.xz*0.9 - vec2(uTime*0.25, -uTime*0.4);
          float e = 0.15;
          float n0 = vn(q)+vn(q2)*0.5; float nx = vn(q+vec2(e,0.0))+vn(q2+vec2(e,0.0))*0.5; float nz = vn(q+vec2(0.0,e))+vn(q2+vec2(0.0,e))*0.5;
          N = normalize(N + vec3(n0-nx, 0.0, n0-nz) * 1.6 * nd);
        }
        #endif
        vec3 L = uSunDir;
        float fres = 0.02 + 0.98*pow(1.0 - max(dot(N,V),0.0), 5.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        vec3 refl = skyCol(R) * 0.85;
        vec3 deep = vec3(0.012, 0.035, 0.042), mid = vec3(0.03, 0.085, 0.085);
        float sss = clamp(vH*0.35 + 0.3, 0.0, 1.0) * pow(max(dot(V, -L)*0.5+0.5, 0.0), 2.0);
        vec3 water = mix(deep, mid, sss) * (0.55 + 0.45*max(dot(N, L), 0.0));
        vec3 c = mix(water, refl, fres);
        c += uSunCol * pow(max(dot(R, L), 0.0), 220.0) * 2.2;
        // foam: crests where the surface pinches (jacobian) + streaks
        float fn = vn(vW.xz*0.22 + uTime*0.05) * 0.6 + vn(vW.xz*0.9 - uTime*0.08) * 0.4;
        float foam = smoothstep(0.62, 0.25, vJ) * smoothstep(0.35, 0.75, fn);
        foam += smoothstep(1.1, 1.9, vH) * fn * 0.5;
        foam *= 1.0 - smoothstep(600.0, 1400.0, dist);
        c = mix(c, vec3(0.62, 0.64, 0.6) * (0.6+0.4*max(dot(N,L),0.0)), clamp(foam,0.0,0.85));
        // stern lantern glow on nearby water
        if (uLantern.w > 0.0) { float ld = length(vW - uLantern.xyz); c += vec3(1.0,0.6,0.25) * uLantern.w * 1.5 / (1.0 + ld*ld*0.05) * (0.3 + fres); }
        float fg = 1.0 - exp(-pow(uFogD*dist, 2.0)*1.0);
        vec3 fc = mix(uFogCol, skyCol(normalize(vec3(-V.x, 0.02, -V.z))), 0.5);
        c = mix(c, fc, clamp(fg, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}
