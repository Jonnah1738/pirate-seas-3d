// Lightweight HDR post chain for High quality (no addons needed):
//   scene -> half-float MSAA target -> bright pass (1/2) -> dual-filter blur down to 1/32 and back up (bloom)
//   -> god rays (radial blur of the bright pass toward the sun, 1/4 res) -> composite: ACES, grade, vignette, grain, hit flash.
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const ACES = `
vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
vec3 aces(vec3 c){
  const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
  const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
  c = I*c; c = RRTAndODTFit(c); c = O*c; return clamp(c, 0.0, 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer; this.ok = true;
    const gl = renderer.getContext();
    const hf = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    this.type = hf ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const maxS = gl.getParameter(gl.MAX_SAMPLES) || 0;
    this.samples = Math.min(4, maxS);
    const opt = { type: this.type, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = new THREE.WebGLRenderTarget(4, 4, { ...opt, depthBuffer: true, samples: this.samples });
    this.mips = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(4, 4, opt));
    this.rays = new THREE.WebGLRenderTarget(4, 4, opt);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
    this.qs = new THREE.Scene(); this.qs.add(this.quad);
    const mk = (fs, u, extra = {}) => new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false }, extra));
    this.bright = mk(`uniform sampler2D t; uniform vec2 px; uniform float thr; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv + px*vec2(-1,-1)).rgb + texture2D(t, vUv + px*vec2(1,-1)).rgb + texture2D(t, vUv + px*vec2(-1,1)).rgb + texture2D(t, vUv + px*vec2(1,1)).rgb;
        c *= 0.25; c = min(c, vec3(60.0)); float l = max(c.r, max(c.g, c.b)); float k = clamp(l - thr, 0.0, 0.6); k = k*k/(4.0*0.6+1e-4); float w = max(k, l - thr)/max(l, 1e-4);
        gl_FragColor = vec4(c*w, 1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() }, thr: { value: 1.0 } });
    this.down = mk(`uniform sampler2D t; uniform vec2 px; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv).rgb*4.0 + texture2D(t, vUv+px*vec2(-1,-1)).rgb + texture2D(t, vUv+px*vec2(1,-1)).rgb + texture2D(t, vUv+px*vec2(-1,1)).rgb + texture2D(t, vUv+px*vec2(1,1)).rgb;
        gl_FragColor = vec4(c/8.0, 1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() } });
    this.up = mk(`uniform sampler2D t; uniform vec2 px; varying vec2 vUv;
      void main(){ vec3 c = texture2D(t, vUv+px*vec2(-2,0)).rgb + texture2D(t, vUv+px*vec2(2,0)).rgb + texture2D(t, vUv+px*vec2(0,-2)).rgb + texture2D(t, vUv+px*vec2(0,2)).rgb
        + (texture2D(t, vUv+px*vec2(-1,-1)).rgb + texture2D(t, vUv+px*vec2(1,-1)).rgb + texture2D(t, vUv+px*vec2(-1,1)).rgb + texture2D(t, vUv+px*vec2(1,1)).rgb)*2.0;
        gl_FragColor = vec4(c/12.0, 1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending, transparent: true });
    this.ray = mk(`uniform sampler2D t; uniform vec2 sun; uniform float amt; varying vec2 vUv;
      void main(){ vec2 d = (vUv - sun) * (1.0/24.0) * 0.9; vec2 p = vUv; vec3 c = vec3(0.0); float w = 1.0;
        for (int i=0;i<24;i++){ p -= d; c += texture2D(t, p).rgb * w; w *= 0.93; }
        gl_FragColor = vec4(c * amt / 10.0, 1.0); }`, { t: { value: null }, sun: { value: new THREE.Vector2() }, amt: { value: 0 } });
    this.comp = mk(ACES + `uniform sampler2D t, bloom, rays; uniform float exposure, bloomK, time, flash, grain; uniform vec2 res; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
      void main(){
        vec3 c = texture2D(t, vUv).rgb;
        c += texture2D(bloom, vUv).rgb * bloomK + texture2D(rays, vUv).rgb;
        c = aces(c * exposure);
        // grade: cool, slightly lifted shadows, warm highlights, a touch of contrast and desaturation (weathered, not cartoon)
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, 0.9);
        c = mix(c*vec3(0.94, 1.0, 1.04) + vec3(0.004, 0.008, 0.012), c*vec3(1.05, 1.0, 0.93), smoothstep(0.15, 0.75, l));
        c = c*c*(3.0-2.0*c)*0.25 + c*0.75;
        // hit flash (warm sepia pulse)
        c = mix(c, vec3(l*1.25, l*0.82, l*0.55), flash);
        // vignette
        vec2 q = vUv - 0.5; q.x *= res.x/res.y; c *= 1.0 - smoothstep(0.45, 1.25, length(q)) * 0.55;
        c += (h(vUv*res + time) - 0.5) * grain;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`, { t: { value: null }, bloom: { value: null }, rays: { value: null }, exposure: { value: 1 }, bloomK: { value: 0.55 }, time: { value: 0 }, flash: { value: 0 }, grain: { value: 0.011 }, res: { value: new THREE.Vector2() } });
    if (!hf) this.bright.uniforms.thr.value = 0.85;
    this.w = 0; this.h = 0; this.sunUv = new THREE.Vector2(); this.sunAmt = 0;
  }
  setSize(w, h) {
    if (w === this.w && h === this.h) return; this.w = w; this.h = h;
    this.rt.setSize(w, h);
    let mw = w, mh = h; for (const m of this.mips) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); m.setSize(mw, mh); }
    this.rays.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.comp.uniforms.res.value.set(w, h);
  }
  pass(mat, target, clear = true) { this.quad.material = mat; this.r.setRenderTarget(target); if (clear) this.r.clear(true, false, false); this.r.render(this.qs, this.cam); }
  render(scene, camera, o) {
    const r = this.r, sz = r.getDrawingBufferSize(_v2); this.setSize(sz.x, sz.y);
    const ac = r.autoClear; r.autoClear = false;
    r.setRenderTarget(this.rt); r.clear(); r.render(scene, camera);
    // bloom chain
    const M = this.mips;
    this.bright.uniforms.t.value = this.rt.texture; this.bright.uniforms.px.value.set(0.5 / this.w, 0.5 / this.h); this.pass(this.bright, M[0]);
    for (let i = 1; i < M.length; i++) { this.down.uniforms.t.value = M[i - 1].texture; this.down.uniforms.px.value.set(0.5 / M[i - 1].width, 0.5 / M[i - 1].height); this.pass(this.down, M[i]); }
    // god rays from the 1/4 bright buffer, before it is blended upward
    const ra = o.sunAmt;
    if (ra > 0.01) { this.ray.uniforms.t.value = M[1].texture; this.ray.uniforms.sun.value.copy(o.sunUv); this.ray.uniforms.amt.value = ra; this.pass(this.ray, this.rays); }
    else if (this.raysOn !== false) { r.setRenderTarget(this.rays); r.clear(true, false, false); }
    this.raysOn = ra > 0.01;
    for (let i = M.length - 1; i > 0; i--) { this.up.uniforms.t.value = M[i].texture; this.up.uniforms.px.value.set(0.5 / M[i].width, 0.5 / M[i].height); this.pass(this.up, M[i - 1], false); }
    const c = this.comp.uniforms; c.t.value = this.rt.texture; c.bloom.value = M[0].texture; c.rays.value = this.rays.texture;
    c.time.value = (c.time.value + 0.37) % 100; c.flash.value = o.flash || 0; c.exposure.value = o.exposure || 1;
    this.pass(this.comp, null, false);
    r.autoClear = ac;
  }
  dispose() { this.rt.dispose(); this.mips.forEach(m => m.dispose()); this.rays.dispose(); }
}
const _v2 = new THREE.Vector2();
