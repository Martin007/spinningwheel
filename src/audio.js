/** Small, synthesized sounds: no media downloads or autoplay. */
export class WheelAudio {
  enabled = true;
  context = null;
  lastTick = 0;

  async unlock() {
    if (!this.enabled) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context ??= new Context();
      this.master ??= this.context.createGain();
      if (!this.connected) { this.master.connect(this.context.destination); this.connected = true; }
      this.master.gain.value = this.enabled ? 0.22 : 0;
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Unsupported/blocked audio must never prevent a spin. */ }
  }

  setEnabled(value) {
    this.enabled = value;
    if (this.master && this.context) this.master.gain.setTargetAtTime(value ? 0.22 : 0, this.context.currentTime, 0.02);
  }

  tone(frequency, duration = 0.06, delay = 0, volume = 0.5, type = 'sine') {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.7, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain); gain.connect(this.master);
    oscillator.start(start); oscillator.stop(start + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  tick(dramatic = false) {
    const now = performance.now();
    if (now - this.lastTick < 38) return;
    this.lastTick = now;
    this.tone(dramatic ? 850 : 1200, dramatic ? 0.08 : 0.035, 0, dramatic ? 0.5 : 0.28, 'triangle');
  }

  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => this.tone(note, 0.7, i * 0.1, 0.3));
  }
}
