/**
 * AudioManager.js
 * Procedural sound effects using the Web Audio API.
 * No external audio files are required.
 */

export class AudioManager {
  constructor() {
    this.ctx         = null;
    this.masterGain  = null;
    this.enabled     = true;
  }

  // ── Init ───────────────────────────────────────────────

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.65;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[AudioManager] Web Audio API unavailable:', e);
    }
  }

  _resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  // ── Primitives ─────────────────────────────────────────

  /** Short noise burst (slap impact texture). */
  _noise(duration, volume = 0.5, decay = 2.5) {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const sr   = this.ctx.sampleRate;
    const len  = Math.floor(sr * duration);
    const buf  = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * volume;
    }
    const src  = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = 1;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
  }

  /** Pure tone with exponential decay. */
  _tone(freq, type, duration, volume = 0.3, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const now  = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type  = type;
    osc.frequency.setValueAtTime(freq, now + delay);
    gain.gain.setValueAtTime(volume, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now + delay);
    osc.stop(now + delay + duration + 0.01);
  }

  /** Frequency-modulated buzz. */
  _fm(carrier, modFreq, modDepth, duration, volume = 0.3) {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const now = this.ctx.currentTime;
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const car = this.ctx.createOscillator();
    const outGain = this.ctx.createGain();
    mod.frequency.value   = modFreq;
    modGain.gain.value    = modDepth;
    car.frequency.value   = carrier;
    outGain.gain.setValueAtTime(volume, now);
    outGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    mod.connect(modGain);
    modGain.connect(car.frequency);
    car.connect(outGain);
    outGain.connect(this.masterGain);
    mod.start(now); mod.stop(now + duration);
    car.start(now); car.stop(now + duration);
  }

  // ── Sound Effects ──────────────────────────────────────

  playMenuClick() {
    this._tone(900, 'sine', 0.08, 0.18);
    this._tone(1350, 'sine', 0.06, 0.10, 0.04);
  }

  playCountdown() {
    this._tone(440, 'square', 0.25, 0.4);
  }

  playCountdownGo() {
    this._tone(880,  'sawtooth', 0.35, 0.5);
    this._tone(1320, 'sawtooth', 0.25, 0.4, 0.1);
    this._tone(1760, 'sine',     0.2,  0.3, 0.2);
  }

  playWeakSlap() {
    this._noise(0.09, 0.45, 3.2);
    this._tone(160, 'square', 0.07, 0.25);
  }

  playNormalSlap() {
    this._noise(0.13, 0.65, 2.6);
    this._tone(110,  'square', 0.12, 0.35);
    this._tone(220,  'sine',   0.06, 0.15, 0.04);
  }

  playStrongSlap() {
    this._noise(0.18, 0.85, 2.0);
    this._fm(90, 40, 60, 0.18, 0.45);
    this._tone(180, 'square', 0.10, 0.35, 0.05);
  }

  playCriticalSlap() {
    this._noise(0.28, 1.0, 1.4);
    this._fm(65, 30, 80, 0.28, 0.55);
    this._tone(130, 'sawtooth', 0.18, 0.45, 0.03);
    this._tone(260, 'square',   0.12, 0.35, 0.08);
    this._tone(520, 'sine',     0.08, 0.25, 0.14);
  }

  playComboSound(level) {
    const freqs = [261, 330, 392, 523, 659, 880, 1047];
    const f = freqs[Math.min(level - 1, freqs.length - 1)];
    this._tone(f,       'sine',     0.18, 0.28);
    this._tone(f * 1.5, 'sine',     0.12, 0.18, 0.1);
    this._tone(f * 2,   'triangle', 0.07, 0.12, 0.18);
  }

  playBossHurt() {
    this._tone(220, 'sawtooth', 0.18, 0.45);
    this._tone(165, 'sawtooth', 0.12, 0.30, 0.12);
  }

  playBossDefeated() {
    [523, 659, 784, 1047].forEach((f, i) => {
      this._tone(f,       'sawtooth', 0.22, 0.45, i * 0.14);
      this._tone(f * 0.5, 'sine',     0.18, 0.25, i * 0.14 + 0.06);
    });
    this._noise(0.35, 0.7, 1.2);
  }

  playVictory() {
    const melody = [523, 659, 784, 1047, 1319, 1568, 2093];
    melody.forEach((f, i) => {
      this._tone(f,       'sawtooth', 0.32, 0.50, i * 0.11);
      this._tone(f * 1.25,'sine',     0.22, 0.35, i * 0.11 + 0.05);
    });
  }

  playGameOver() {
    [523, 440, 392, 349, 294].forEach((f, i) => {
      this._tone(f, 'sawtooth', 0.35, 0.45, i * 0.22);
    });
  }

  playTimerWarning() {
    this._tone(1320, 'square', 0.08, 0.35);
  }

  // ── Control ────────────────────────────────────────────

  setEnabled(val) {
    this.enabled = val;
    if (this.masterGain) {
      this.masterGain.gain.value = val ? 0.65 : 0;
    }
  }
}
