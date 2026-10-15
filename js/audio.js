import { midiToHz } from './clock.js';

export function createAudio(ac) {
  const master = ac.createGain(); master.gain.value = 0.5;
  const comp = ac.createDynamicsCompressor();
  master.connect(comp).connect(ac.destination);
  let bus, duck, filt;
  const build = () => {
    bus = ac.createGain(); duck = ac.createGain(); filt = ac.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 18000;
    duck.connect(filt).connect(bus).connect(master);
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
    e.connect(dest || duck);
    return e;
  };
  const osc = (type, hz, cents, t, end, out) => {
    const o = ac.createOscillator();
    o.type = type; o.frequency.value = hz; o.detune.value = cents + (Math.random() * 2 - 1) * wobble * 50;
    o.connect(out); o.start(t); o.stop(end);
  };
  const noiseSrc = (t, dur, out) => {
    const s = ac.createBufferSource(); s.buffer = noise;
    s.connect(out); s.start(t, Math.random(), dur); // random offset, stops itself after dur
  };

  const patches = {
    arp: (hz, t, d, v, e) => osc('square', hz, 0, t, t + d + 0.05, e),
    bass: (hz, t, d, v, e) => osc('sawtooth', hz, 0, t, t + d + 0.05, e),
    lead: (hz, t, d, v, e) => [-12, 0, 12].forEach(c => osc('sawtooth', hz, c, t, t + d + 0.05, e)),
    pad: (hz, t, d, v, e) => [-7, 7].forEach(c => osc('sawtooth', hz, c, t, t + d + 0.05, e)),
  };

  return {
    master,
    play(patch, midi, time, { dur = 0.15, vel = 0.3 } = {}) {
      if (patch === 'hats') {
        const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
        hp.connect(env(time, 0.03, vel)); noiseSrc(time, 0.04, hp); return;
      }
      const pad = patch === 'pad', e = env(time, dur, vel, pad ? 0.4 : 0.004);
      patches[patch](midiToHz(midi), time, dur, vel, e);
    },
    kick(time) {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, time);
      o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
      o.connect(env(time, 0.3, 0.9, 0.003, bus)); o.start(time); o.stop(time + 0.35);
      duck.gain.cancelScheduledValues(time);
      duck.gain.setValueAtTime(1, time);
      duck.gain.linearRampToValueAtTime(0.3, time + 0.01);
      duck.gain.linearRampToValueAtTime(1, time + 0.2);
    },
    riser(start, dur) {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(300, start);
      bp.frequency.exponentialRampToValueAtTime(8000, start + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.5, start + dur);
      g.gain.linearRampToValueAtTime(0, start + dur + 0.02);
      bp.connect(g).connect(duck);
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
    detune(a) { wobble = a; },
    newRun() { bus.disconnect(); build(); }, // silences leftover scheduled sources
  };
}
