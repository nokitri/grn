import { midiToHz } from './clock.js';

// Pure mapping from effect levels (missing = 0) to node params; duck is stats().duck.
export function fxParams(l = {}) {
  const v = n => l[n] || 0;
  return {
    reverb: .1 * v('reverb'), delay: v('delay') && .1 + .075 * (v('delay') - 1), drive: 1 + 1.75 * Math.max(0, v('distortion') - 1), distort: v('distortion') > 0,
    q: 1 + 2 * v('filter'), cutoff: v('filter') ? 6000 + 2000 * v('filter') : 20000, unison: v('unison'), duck: l.duck ?? .3,
  };
}
const shape = drive => {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) c[i] = Math.tanh(drive * (i / 511.5 - 1)) / Math.tanh(drive);
  return c;
};

export function createAudio(ac, destination = ac.destination) {
  const master = ac.createGain(); master.gain.value = 0.5;
  const comp = ac.createDynamicsCompressor();
  master.connect(comp).connect(destination);
  const analyser = ac.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.7; comp.connect(analyser); // 64 bins for the floor + Analyzer ring
  const ir = ac.createBuffer(2, Math.floor(ac.sampleRate * 1.8), ac.sampleRate); // shared reverb impulse
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-4 * i / d.length);
  }
  let bus, duck, filt, vin, kin, res, revSend, dlySend, dly, fb, conv, fx = fxParams();
  const build = () => {
    bus = ac.createGain(); duck = ac.createGain(); filt = ac.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 18000;
    vin = ac.createWaveShaper(); kin = ac.createWaveShaper(); res = ac.createBiquadFilter(); res.type = 'lowpass';
    revSend = ac.createGain(); dlySend = ac.createGain(); dly = ac.createDelay(1); dly.delayTime.value = 30 / 128;
    conv = ac.createConvolver(); conv.buffer = ir;
    fb = ac.createGain(); fb.gain.value = 0.3;
    vin.connect(res).connect(duck).connect(filt).connect(bus).connect(master);
    kin.connect(filt); // past duck, still under the pick muffle
    for (const n of [vin, kin]) { n.connect(revSend); n.connect(dlySend); }
    revSend.connect(conv).connect(filt);
    dlySend.connect(dly).connect(fb).connect(dly); dly.connect(filt);
    revSend.gain.value = dlySend.gain.value = 0; res.frequency.value = 20000; res.Q.value = 1; fx = fxParams();
  };
  build();
  let wobble = 0;

  const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // gain env -> dest; returns the gain node for the source to feed
  const env = (t, dur, peak, attack = 0.004, dest = null) => {
    const e = ac.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(peak, t + attack);
    e.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
    e.connect(dest || vin);
    return e;
  };
  const osc = (type, hz, cents, t, end, out, extra = 0) => {
    for (let i = 1; i <= extra; i++) osc(type, hz, cents + (i % 2 ? 10 : -10), t, end, out); // unison layers
    const o = ac.createOscillator();
    o.type = type; o.frequency.value = hz; o.detune.value = cents + (Math.random() * 2 - 1) * wobble * 50;
    o.connect(out); o.start(t); o.stop(end);
  };
  const noiseSrc = (t, dur, out) => {
    const s = ac.createBufferSource(); s.buffer = noise;
    s.connect(out); s.start(t, Math.random(), dur); // random offset, stops itself after dur
  };

  const patches = {
    arp: (hz, t, d, x, e) => osc('square', hz, 0, t, t + d + 0.05, e, x),
    scope: (hz, t, d, x, e) => osc('sine', hz * 2, 0, t, t + d + 0.05, e, x),
    bass: (hz, t, d, x, e) => osc('sawtooth', hz, 0, t, t + d + 0.05, e, x),
    lead: (hz, t, d, x, e) => [-12, 0, 12].forEach((c, i) => osc('sawtooth', hz, c, t, t + d + 0.05, e, i ? 0 : x)),
    pad: (hz, t, d, x, e) => [-7, 7].forEach((c, i) => osc('sawtooth', hz, c, t, t + d + 0.05, e, i ? 0 : x)),
    acid: (hz, t, d, x, e) => {
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 12;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3000, t + d * 0.3); f.frequency.exponentialRampToValueAtTime(300, t + d);
      f.connect(e); osc('sawtooth', hz, 0, t, t + d + 0.05, f, x);
    },
    rolling: (hz, t, d, x, e) => osc('sawtooth', hz, 0, t, t + d * 0.6, e, x),
    hoover: (hz, t, d, x, e) => [-15, 0, 15].forEach((c, i) => {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.setValueAtTime(c, t);
      o.detune.linearRampToValueAtTime(c - 200, t + 0.08); // -2 semitone dip
      o.connect(e); o.start(t); o.stop(t + d + 0.05);
      if (!i && x) osc('sawtooth', hz, c, t, t + d + 0.05, e, x - 1); // unison layers (no dip)
    }),
    wash: (hz, t, d, x, e) => [-7, 7].forEach((c, i) => osc('sawtooth', hz, c, t, t + d + 2, e, i ? 0 : x)),
  };

  const duckAt = time => {
    duck.gain.cancelScheduledValues(time);
    duck.gain.setValueAtTime(1, time);
    duck.gain.linearRampToValueAtTime(fx.duck, time + 0.01);
    duck.gain.linearRampToValueAtTime(1, time + 0.2);
  };
  const disconnect = () => { for (const n of [bus, duck, filt, vin, kin, res, revSend, dlySend, conv, dly, fb]) n.disconnect(); };
  return {
    master, analyser, duckAt,
    dispose() { disconnect(); master.disconnect(); comp.disconnect(); analyser.disconnect(); },
    play(patch, midi, time, { dur = 0.15, vel = 0.3 } = {}) {
      if (patch === 'shaker') {
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5700; bp.Q.value = 1.4; // ~4-8kHz
        bp.connect(env(time, 0.05, vel)); noiseSrc(time, 0.06, bp); return;
      }
      if (patch === 'hats') {
        const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
        hp.connect(env(time, 0.03, vel)); noiseSrc(time, 0.04, hp); return;
      }
      const extra = Math.floor(fx.unison / 2), pad = patch === 'pad' || patch === 'wash';
      const e = env(time, dur + (patch === 'wash' ? 2 : 0), vel / Math.sqrt(1 + extra), pad ? 0.4 : 0.004); // wash: 2s release
      patches[patch](midiToHz(midi), time, dur, extra, e);
    },
    kick(time, hard = false) {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, time);
      o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
      let out = kin, len = 0.3;
      if (hard) { out = ac.createWaveShaper(); out.curve = shape(20); out.connect(kin); len = 0.6; } // hard clip + longer tail
      o.connect(env(time, len, 0.9, 0.003, out)); o.start(time); o.stop(time + len + 0.05);
      duckAt(time);
    },
    riser(start, dur) {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(300, start);
      bp.frequency.exponentialRampToValueAtTime(8000, start + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.5, start + dur);
      g.gain.linearRampToValueAtTime(0, start + dur + 0.02);
      bp.connect(g).connect(vin);
      const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
      s.connect(bp); s.start(start); s.stop(start + dur + 0.05);
    },
    snare(time) {
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      hp.connect(env(time, 0.15, 0.5)); noiseSrc(time, 0.16, hp);
      const o = ac.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(220, time); o.frequency.exponentialRampToValueAtTime(110, time + 0.08);
      o.connect(env(time, 0.1, 0.4)); o.start(time); o.stop(time + 0.12);
    },
    blip(midi, time) {
      const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = midiToHz(midi);
      o.connect(env(time, 0.06, 0.2)); o.start(time); o.stop(time + 0.08);
    },
    setFilter(v, time) {
      filt.frequency.setTargetAtTime(300 * 60 ** Math.min(1, Math.max(0, v)), time, 0.02);
    },
    setFx(levels, time) {
      fx = fxParams(levels);
      vin.curve = kin.curve = fx.distort ? shape(fx.drive) : null;
      revSend.gain.setTargetAtTime(fx.reverb, time, 0.05); dlySend.gain.setTargetAtTime(fx.delay, time, 0.05);
      res.Q.setTargetAtTime(fx.q, time, 0.05); res.frequency.setTargetAtTime(fx.cutoff, time, 0.05);
    },
    setTempo(bpm, time) { dly.delayTime.setValueAtTime(30 / bpm, time); }, // 1/8 note
    detune(a) { wobble = a; },
    newRun() { disconnect(); wobble = 0; build(); }, // silences leftover scheduled sources
  };
}
