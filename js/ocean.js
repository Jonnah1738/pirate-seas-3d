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

// HDR-ish sky: deep zenith, warm low sun with a hot disk (feeds bloom), horizon haze.
const SKY_GLSL = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunCol; uniform vec3 uGround;
vec3 skyCol(vec3 d){
  float h = d.y;
  vec3 c = mix(uHorizon, uZenith, pow(clamp(h,0.0,1.0), 0.45));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(s, 4.0)*0.30 + pow(s, 24.0)*0.45) * (1.0 - 0.5*clamp(h,0.0,1.0));   // warm glow around the sun
  c = mix(c, uGround, smoothstep(0.0,-0.2,h));
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
      varying vec3 vD; uniform float uTime; uniform float uDetail; uniform sampler2D uNorm;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, n = 0.0; for (int i=0;i<5;i++){ if (float(i) > 2.0 + uDetail*2.0) break; n += vn(p)*a; p = p*2.03 + vec2(1.7,9.2); a *= 0.5; } return n; }
      void main(){
        vec3 d = normalize(vD); vec3 c = skyCol(d);
        float s = max(dot(d, uSunDir), 0.0);
        // broken storm-cloud deck, lit from the low sun, darker undersides
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.1) * 1.3 + vec2(uTime*0.004, uTime*0.0015);
          float n = fbm(uv);
          float cov = smoothstep(0.40, 0.78, n) * smoothstep(0.0, 0.14, d.y);
          float thick = smoothstep(0.5, 0.95, n);
          float lit = pow(s, 3.0);
          vec3 under = vec3(0.045,0.045,0.05), edge = uSunCol*1.05 + vec3(0.08);
          vec3 cc = mix(under, mix(uHorizon*0.9, uZenith*1.6, 0.4), 0.5) ;
          cc = mix(cc, edge, lit*(1.0-thick)*0.9);              // silver lining toward the sun
          cc *= 0.75 + 0.35*(1.0-thick);
          c = mix(c, cc, cov*0.92);
        }
        // the sun itself: HDR disk + corona, dimmed behind cloud
        float disk = smoothstep(0.99955, 0.9998, s);
        c += uSunCol * (disk*28.0 + pow(s, 900.0)*5.0);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 40, 20), mat);
  // drawn LAST among opaques: at depth 1.0 it only shades pixels nothing else covered (early-z skips the cloud fbm under the sea and ships)
  m.frustumCulled = false; m.renderOrder = 1000; scene.add(m); return m;
}

export const MAXS = 8; // hull cut-outs (keeps water out of decks)
export const OCEAN_U = {
  uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(-0.62, 0.17, 0.76).normalize() },
  uZenith: { value: new THREE.Color(0x24384c) }, uHorizon: { value: new THREE.Color(0x9a9282) }, uGround: { value: new THREE.Color(0x1a2124) },
  uSunCol: { value: new THREE.Color(0xffa45a) }, uFogCol: { value: new THREE.Color(0x868173) }, uFogD: { value: 0.00105 },
  uCenter: { value: new THREE.Vector2() }, uDetail: { value: 1 }, uNorm: { value: null },
  uShipA: { value: Array.from({ length: MAXS }, () => new THREE.Vector4(1e6, 1e6, 0, 0)) },
  uShipB: { value: Array.from({ length: MAXS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLantern: { value: new THREE.Vector4(0, 0, 0, 0) },
};
export const OCEAN_R = 2700;

export function makeOcean(low) {
  // polar grid, dense near the camera, sparse to the fog line (Low: ~1/3 of the vertices)
  const rings = low ? 56 : 140, segs = low ? 84 : 200, R = OCEAN_R;
  const pos = new Float32Array((1 + rings * segs) * 3), idx = [];
  let o = 3;
  for (let i = 1; i <= rings; i++) {
    const t = i / rings, r = R * Math.pow(t, 2.2) + t * 2.0;
    for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2; pos[o++] = Math.cos(a) * r; pos[o++] = 0; pos[o++] = Math.sin(a) * r; }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + (j + 1) % segs, 1 + j);
  for (let i = 1; i < rings; i++) {
    const b0 = 1 + (i - 1) * segs, b1 = 1 + i * segs;
    for (let j = 0; j < segs; j++) { const j1 = (j + 1) % segs; idx.push(b0 + j, b0 + j1, b1 + j, b0 + j1, b1 + j1, b1 + j); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
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
        float fade = 1.0 - smoothstep(900.0, 2400.0, length(position.xz));
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
      uniform float uTime; uniform vec3 uFogCol; uniform float uFogD; uniform float uDetail; uniform sampler2D uNorm;
      uniform vec4 uShipA[${MAXS}]; uniform vec4 uShipB[${MAXS}]; uniform vec4 uLantern;
      varying vec3 vW; varying vec3 vN; varying float vH; varying float vJ;
      vec3 nrm(vec2 uv){ return texture2D(uNorm, uv).xyz*2.0 - 1.0; }
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
        // normal-mapped detail ripples: 1 tap on Low, 3 scales on High
        float nd = 1.0 - smoothstep(60.0, 900.0, dist);
        vec2 P = vW.xz;
        // two scales on rotated axes break up tiling; High adds a fine third
        vec3 dn = nrm(P*0.043 + uTime*vec2(0.018, 0.011))*0.6 + nrm(mat2(0.8,-0.6,0.6,0.8)*P*0.0117 + uTime*vec2(0.0035, -0.0024))*0.7;
        #ifndef LOW
        dn += nrm(mat2(0.6,0.8,-0.8,0.6)*P*0.11 + uTime*vec2(-0.027, 0.021))*0.45*nd;
        #endif
        N = normalize(N + vec3(dn.x, 0.0, dn.y) * (0.22 + 0.36*nd));
        vec3 L = uSunDir;
        float NV = max(dot(N,V), 0.0);
        float fres = 0.02 + 0.98*pow(1.0 - NV, 5.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.01;
        vec3 refl = skyCol(normalize(R));
        // body colour: deep absorption + light scattered through wave crests facing away from the sun
        vec3 deep = vec3(0.004, 0.017, 0.024), scat = vec3(0.02, 0.10, 0.092);
        float sss = clamp(vH*0.4 + 0.35, 0.0, 1.0) * pow(max(dot(V, -L)*0.5+0.5, 0.0), 3.0) * (0.6 + 0.4*pow(1.0-NV, 2.0));
        vec3 water = mix(deep, scat, sss) + deep*max(dot(N, L), 0.0);
        vec3 c = mix(water, refl, fres);
        // sun glitter: tight hot core (blooms) + broad sheen
        float RL = max(dot(R, L), 0.0);
        c += uSunCol * (pow(RL, 900.0)*14.0 + pow(RL, 120.0)*0.8 + pow(RL, 14.0)*0.06);
        // foam: crests where the surface pinches (jacobian), shredded by the streak pattern
        float fp = texture2D(uNorm, P*0.021 + vec2(uTime*0.006, 0.0)).a;
        #ifndef LOW
        fp = fp*0.6 + texture2D(uNorm, P*0.067 - vec2(0.0, uTime*0.01)).a*0.4;
        #endif
        float crest = smoothstep(0.66, 0.2, vJ) + smoothstep(1.0, 1.9, vH)*0.6;
        float foam = smoothstep(0.42, 0.85, fp + crest*0.55 - 0.25) * crest;
        foam *= 1.0 - smoothstep(500.0, 1300.0, dist);
        c = mix(c, vec3(0.62, 0.64, 0.62) * (0.45 + 0.55*max(dot(N,L)+0.3,0.0)), clamp(foam,0.0,0.9));
        // stern lantern glow on nearby water
        if (uLantern.w > 0.0) { float ld = length(vW - uLantern.xyz); c += vec3(1.0,0.55,0.2) * uLantern.w * 1.5 / (1.0 + ld*ld*0.05) * (0.3 + fres); }
        // aerial perspective: blend into the horizon colour seen in this direction
        float fg = 1.0 - exp(-pow(uFogD*dist, 2.0));
        vec3 fc = mix(uFogCol, skyCol(normalize(vec3(-V.x, 0.015, -V.z))), 0.65);
        c = mix(c, fc, clamp(fg, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}
