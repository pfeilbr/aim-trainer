// All sounds are synthesized with WebAudio — no asset files needed.
// Each theme selects a profile: the same events (hit/kill/miss/…) mapped to
// different waveforms and pitches, so themes sound different, not just look it.

export const SFX_PROFILES = {
  // industrial arcade — the original AimForge sound
  forge: {
    hit: { freq: 1100, freq2: 1500, duration: 0.05, type: 'square', gain: 0.25 },
    kill: [
      { freq: 900, freq2: 1400, duration: 0.06, type: 'triangle', gain: 0.4 },
      { freq: 1600, duration: 0.05, type: 'sine', gain: 0.3, when: 0.04 },
    ],
    miss: { freq: 220, freq2: 140, duration: 0.08, type: 'sawtooth', gain: 0.12 },
    tick: { freq: 600, duration: 0.06, type: 'sine', gain: 0.35 },
    go: { freq: 1000, duration: 0.15, type: 'sine', gain: 0.4 },
    end: [
      { freq: 700, duration: 0.12, type: 'sine', gain: 0.35 },
      { freq: 500, duration: 0.18, type: 'sine', gain: 0.3, when: 0.12 },
    ],
  },
  // synthwave zaps
  laser: {
    hit: { freq: 1800, freq2: 700, duration: 0.06, type: 'sawtooth', gain: 0.18 },
    kill: [
      { freq: 1500, freq2: 400, duration: 0.09, type: 'sawtooth', gain: 0.3 },
      { freq: 2200, duration: 0.05, type: 'sine', gain: 0.25, when: 0.05 },
    ],
    miss: { freq: 180, freq2: 90, duration: 0.1, type: 'sawtooth', gain: 0.12 },
    tick: { freq: 900, duration: 0.05, type: 'triangle', gain: 0.3 },
    go: { freq: 1200, freq2: 1800, duration: 0.12, type: 'sawtooth', gain: 0.28 },
    end: [
      { freq: 900, freq2: 400, duration: 0.2, type: 'sawtooth', gain: 0.3 },
    ],
  },
  // gentle glassy chimes
  soft: {
    hit: { freq: 880, freq2: 990, duration: 0.05, type: 'sine', gain: 0.22 },
    kill: [
      { freq: 660, duration: 0.09, type: 'sine', gain: 0.3 },
      { freq: 990, duration: 0.09, type: 'sine', gain: 0.25, when: 0.05 },
    ],
    miss: { freq: 240, freq2: 180, duration: 0.08, type: 'sine', gain: 0.1 },
    tick: { freq: 520, duration: 0.05, type: 'sine', gain: 0.3 },
    go: { freq: 780, duration: 0.14, type: 'sine', gain: 0.35 },
    end: [
      { freq: 660, duration: 0.12, type: 'sine', gain: 0.3 },
      { freq: 520, duration: 0.16, type: 'sine', gain: 0.25, when: 0.1 },
    ],
  },
  // low, punchy impacts
  punch: {
    hit: { freq: 400, freq2: 250, duration: 0.05, type: 'square', gain: 0.25 },
    kill: [
      { freq: 300, freq2: 150, duration: 0.08, type: 'square', gain: 0.4 },
      { freq: 1200, duration: 0.04, type: 'triangle', gain: 0.25, when: 0.03 },
    ],
    miss: { freq: 120, freq2: 80, duration: 0.09, type: 'sawtooth', gain: 0.14 },
    tick: { freq: 500, duration: 0.05, type: 'square', gain: 0.25 },
    go: { freq: 800, duration: 0.12, type: 'square', gain: 0.3 },
    end: [
      { freq: 500, freq2: 250, duration: 0.2, type: 'square', gain: 0.3 },
    ],
  },
  // 8-bit chiptune
  chip: {
    hit: { freq: 980, duration: 0.04, type: 'square', gain: 0.2 },
    kill: [
      { freq: 660, duration: 0.05, type: 'square', gain: 0.28 },
      { freq: 880, duration: 0.05, type: 'square', gain: 0.28, when: 0.05 },
      { freq: 1320, duration: 0.06, type: 'square', gain: 0.28, when: 0.1 },
    ],
    miss: { freq: 150, freq2: 100, duration: 0.08, type: 'square', gain: 0.12 },
    tick: { freq: 740, duration: 0.04, type: 'square', gain: 0.28 },
    go: { freq: 1046, duration: 0.1, type: 'square', gain: 0.3 },
    end: [
      { freq: 1320, duration: 0.06, type: 'square', gain: 0.3 },
      { freq: 880, duration: 0.08, type: 'square', gain: 0.28, when: 0.07 },
      { freq: 660, duration: 0.12, type: 'square', gain: 0.26, when: 0.15 },
    ],
  },
};

export class Sfx {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.profile = SFX_PROFILES.forge;
  }

  setProfile(name) {
    this.profile = SFX_PROFILES[name] || SFX_PROFILES.forge;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  blip({ freq = 880, freq2 = null, duration = 0.07, type = 'sine', gain = 0.5, when = 0 }) {
    if (!this.settings.hitSound || this.settings.volume <= 0) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freq2) osc.frequency.exponentialRampToValueAtTime(freq2, t + duration);
    const v = gain * this.settings.volume;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  play(spec) {
    (Array.isArray(spec) ? spec : [spec]).forEach((s) => this.blip(s));
  }

  hit() { this.play(this.profile.hit); }
  kill() { this.play(this.profile.kill); }
  miss() { this.play(this.profile.miss); }
  tick() { this.play(this.profile.tick); }
  go() { this.play(this.profile.go); }
  end() { this.play(this.profile.end); }
}
