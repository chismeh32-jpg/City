// Urbania — sound: a synthesised ambience (city hum, birds, crickets, rain) and interface/event effects.
// Everything is generated with the Web Audio API, so there are no sound files to download.

let actx = null, master = null, hum = null, rainGain = null, airGain = null;
let muted = (() => { try { return localStorage.getItem('urbania-sound') === 'off'; } catch { return false; } })();
let nextChirp = 0, nextCricket = 0;

function noiseBuffer(ctx, seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3; }
  return b;
}
function loop(ctx, buffer, filterType, freq, q = 0.7) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buffer; src.loop = true;
  f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  g.gain.value = 0;
  src.connect(f).connect(g).connect(master);
  src.start();
  return g;
}
// browsers only allow audio after a user gesture, so the engine starts on the first click or key
function initAudio() {
  if (actx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(actx.destination);
  const nb = noiseBuffer(actx);
  hum = loop(actx, nb, 'lowpass', 260);
  rainGain = loop(actx, nb, 'bandpass', 1400, 0.4);
  airGain = loop(actx, nb, 'highpass', 3000);
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, initAudio, { once: false, passive: true });

function setMuted(v) {
  muted = v;
  try { localStorage.setItem('urbania-sound', v ? 'off' : 'on'); } catch { /* storage unavailable */ }
  if (master) master.gain.setTargetAtTime(v ? 0 : 0.55, actx.currentTime, 0.05);
}
const isMuted = () => muted;

function tone(freq, start, dur, { type = 'sine', vol = 0.18, to = null } = {}) {
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function burst(start, dur, freq, vol = 0.25, to = null) {
  const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(), t = actx.currentTime + start;
  src.buffer = noiseBuffer(actx, dur + 0.1);
  f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}
// one-shot effects for actions and events
function sfx(name) {
  if (!actx || muted) return;
  switch (name) {
    case 'click': tone(880, 0, 0.05, { vol: 0.06 }); break;
    case 'zone': tone(620, 0, 0.06, { vol: 0.08 }); tone(820, 0.05, 0.06, { vol: 0.06 }); break;
    case 'road': burst(0, 0.12, 900, 0.12); break;
    case 'build': burst(0, 0.18, 700, 0.2); tone(110, 0, 0.2, { vol: 0.25, to: 70 }); break;
    case 'demolish': burst(0, 0.5, 2500, 0.3, 200); tone(80, 0, 0.35, { vol: 0.2, to: 40 }); break;
    case 'law': tone(660, 0, 0.18, { vol: 0.12 }); tone(990, 0.12, 0.3, { vol: 0.12 }); break;
    case 'win': [523, 659, 784, 1047].forEach((f, k) => tone(f, k * 0.11, 0.35, { vol: 0.13, type: 'triangle' })); break;
    case 'lose': [440, 392, 330, 262].forEach((f, k) => tone(f, k * 0.16, 0.4, { vol: 0.12, type: 'triangle' })); break;
    case 'rank': [523, 659, 784, 1047, 1319].forEach((f, k) => tone(f, k * 0.09, 0.5, { vol: 0.11, type: 'triangle' })); tone(2093, 0.5, 0.6, { vol: 0.05 }); break;
    case 'alert': tone(330, 0, 0.12, { vol: 0.1, type: 'square' }); tone(262, 0.15, 0.16, { vol: 0.1, type: 'square' }); break;
    case 'siren': for (let k = 0; k < 3; k++) tone(620, k * 0.5, 0.5, { vol: 0.06, to: 900 }); break;
    case 'cash': tone(1318, 0, 0.08, { vol: 0.08 }); tone(1760, 0.07, 0.15, { vol: 0.08 }); break;
  }
}
// ambience follows the city: hum from traffic (louder when zoomed in), birds by day, crickets by night, rain
function updateAudio({ day, rain, traffic, closeness, green }) {
  if (!actx || muted) return;
  const t = actx.currentTime;
  hum.gain.setTargetAtTime(Math.min(0.5, 0.05 + traffic * 0.004) * (0.4 + closeness * 0.8), t, 0.5);
  rainGain.gain.setTargetAtTime(rain ? 0.22 : 0, t, 1);
  airGain.gain.setTargetAtTime(0.012 + closeness * 0.01, t, 1);
  if (day > 0.5 && !rain && t > nextChirp) {
    const base = 2600 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) tone(base, k * 0.11, 0.07, { vol: 0.025 * (0.3 + green), to: base * 1.35 });
    nextChirp = t + 1.5 + Math.random() * 5 / (0.4 + green);
  }
  if (day < 0.2 && t > nextCricket) {
    for (let k = 0; k < 3; k++) tone(4300, k * 0.06, 0.035, { vol: 0.012, type: 'square' });
    nextCricket = t + 0.5 + Math.random() * 1.2;
  }
}

export { actx, master, hum, rainGain, airGain, muted, nextChirp, nextCricket, noiseBuffer, loop, initAudio, setMuted, isMuted, tone, burst, sfx, updateAudio };
