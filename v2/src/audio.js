// Procedural sound effects using the Web Audio API (no sound files).
// Ported from the original 2D game.
let audioCtx = null;

export function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
  }
}
export function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function beep(freq, duration, type = 'sine', volume = 0.15, attack = 0.005) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + duration);
}
function noise(duration, volume = 0.12) {
  if (!audioCtx) return;
  const sz = Math.floor(audioCtx.sampleRate * duration);
  const buf = audioCtx.createBuffer(1, sz, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < sz; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / sz);
  const s = audioCtx.createBufferSource(); const g = audioCtx.createGain();
  g.gain.value = volume; s.buffer = buf; s.connect(g); g.connect(audioCtx.destination); s.start();
}

export const sfx = {
  pickup()   { beep(700, 0.08, 'square', 0.12); setTimeout(() => beep(950, 0.1, 'square', 0.12), 60); },
  bonus()    { beep(700, 0.06, 'square', 0.13); setTimeout(() => beep(900, 0.06, 'square', 0.13), 50); setTimeout(() => beep(1200, 0.08, 'square', 0.13), 100); setTimeout(() => beep(1500, 0.18, 'square', 0.13), 150); },
  crash()    { noise(0.4, 0.18); beep(120, 0.3, 'sawtooth', 0.18); setTimeout(() => beep(80, 0.2, 'sawtooth', 0.18), 100); },
  honk()     { beep(300, 0.18, 'square', 0.08); },
  asteroid() { noise(0.6, 0.15); beep(60, 0.5, 'sawtooth', 0.2); },
  levelUp()  { beep(523, 0.1, 'square', 0.15); setTimeout(() => beep(659, 0.1, 'square', 0.15), 100); setTimeout(() => beep(784, 0.1, 'square', 0.15), 200); setTimeout(() => beep(1047, 0.25, 'square', 0.15), 300); },
  gameOver() { beep(400, 0.2, 'square', 0.15); setTimeout(() => beep(300, 0.2, 'square', 0.15), 200); setTimeout(() => beep(200, 0.4, 'square', 0.15), 400); },
  cluck()    { beep(800, 0.05, 'square', 0.08); setTimeout(() => beep(600, 0.07, 'square', 0.08), 50); },
  ribbit()   { beep(180, 0.08, 'sawtooth', 0.1); setTimeout(() => beep(220, 0.1, 'sawtooth', 0.1), 80); },
  ufo()      { beep(1200, 0.3, 'sine', 0.06); setTimeout(() => beep(800, 0.3, 'sine', 0.06), 150); },
  steal()    { beep(620, 0.1, 'sawtooth', 0.13); setTimeout(() => beep(440, 0.1, 'sawtooth', 0.13), 100); setTimeout(() => beep(300, 0.22, 'sawtooth', 0.13), 200); },
  escaped()  { beep(240, 0.25, 'triangle', 0.12); setTimeout(() => beep(180, 0.4, 'triangle', 0.12), 230); },
  chitter()  { for (let i = 0; i < 5; i++) setTimeout(() => beep(900 + (i % 2) * 300, 0.05, 'square', 0.07), i * 60); },
  spray()    { noise(0.35, 0.1); beep(1400, 0.3, 'sine', 0.04); },
  growl()    { beep(70, 0.5, 'sawtooth', 0.2); setTimeout(() => beep(55, 0.4, 'sawtooth', 0.18), 150); noise(0.3, 0.06); },
  heart() {
    beep(523, 0.08, 'sine', 0.18);
    setTimeout(() => beep(659, 0.08, 'sine', 0.18), 80);
    setTimeout(() => beep(784, 0.08, 'sine', 0.18), 160);
    setTimeout(() => beep(1047, 0.25, 'sine', 0.18), 240);
  }
};
