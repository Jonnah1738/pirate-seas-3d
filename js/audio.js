// Small synthesized soundscape: sea ambience, cannon, splash, hull hits, creaks. Starts on first user gesture.
let ctx = null, master = null, noiseBuf = null, on = true, sea = null;
export function audioInit() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = on ? 0.7 : 0; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0);
  let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = i % 2 ? w : b * 3.5; }
  // sea bed: looping brown-ish noise through a slow-swelling lowpass
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  const g = ctx.createGain(); g.gain.value = 0.22; src.connect(lp); lp.connect(g); g.connect(master); src.start();
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  sea = { g, lp };
}
export function setSound(v) { on = v; if (master) master.gain.value = v ? 0.7 : 0; }
export function soundOn() { return on; }
function burst(dur, f0, f1, gain, type = 'lowpass', q = 0.7, delay = 0) {
  if (!ctx || !on) return; const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function thump(f, dur, gain, delay = 0) {
  if (!ctx || !on) return; const t = ctx.currentTime + delay; const o = ctx.createOscillator(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.4, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}
const vol = d => Math.max(0.02, Math.min(1, 60 / (d + 30)));
export const sfx = {
  cannon(d = 0, delay = 0) { const v = vol(d); burst(1.3, 1400, 90, 0.9 * v, 'lowpass', 0.5, delay); thump(70, 0.5, 0.8 * v, delay); },
  splash(d = 0) { const v = vol(d); burst(0.6, 2400, 500, 0.35 * v, 'bandpass', 0.8); },
  hit(d = 0) { const v = vol(d); burst(0.35, 3000, 300, 0.6 * v, 'highpass', 0.6); thump(110, 0.25, 0.5 * v); },
  creak() { if (!ctx || !on) return; const t = ctx.currentTime, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70 + Math.random() * 40, t); o.frequency.linearRampToValueAtTime(55 + Math.random() * 30, t + 0.6);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 6; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.15); g.gain.linearRampToValueAtTime(0.0001, t + 0.7); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 0.75); },
  coin() { if (!ctx || !on) return; [0, 0.07].forEach((d, i) => { const t = ctx.currentTime + d, o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = i ? 1760 : 1320; const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3); }); },
  bell() { if (!ctx || !on) return; const t = ctx.currentTime; [523, 1046, 1568].forEach((f, i) => { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(0.12 / (i + 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.7); }); },
  speed(s) { if (sea) sea.g.gain.value = 0.18 + Math.min(1, s / 12) * 0.14; },
};
