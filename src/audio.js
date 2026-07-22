// All sounds are synthesized with WebAudio — no asset files needed.

export class Sfx {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
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

  hit() { this.blip({ freq: 1100, freq2: 1500, duration: 0.05, type: 'square', gain: 0.25 }); }
  kill() {
    this.blip({ freq: 900, freq2: 1400, duration: 0.06, type: 'triangle', gain: 0.4 });
    this.blip({ freq: 1600, duration: 0.05, type: 'sine', gain: 0.3, when: 0.04 });
  }
  miss() { this.blip({ freq: 220, freq2: 140, duration: 0.08, type: 'sawtooth', gain: 0.12 }); }
  tick() { this.blip({ freq: 600, duration: 0.06, type: 'sine', gain: 0.35 }); }
  go() { this.blip({ freq: 1000, duration: 0.15, type: 'sine', gain: 0.4 }); }
  end() {
    this.blip({ freq: 700, duration: 0.12, type: 'sine', gain: 0.35 });
    this.blip({ freq: 500, duration: 0.18, type: 'sine', gain: 0.3, when: 0.12 });
  }
}
