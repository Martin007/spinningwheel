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

  pull() {
    this.tone(160, 0.1, 0, 0.35, 'triangle');
    this.tone(95, 0.13, 0.075, 0.4, 'triangle');
  }

  /** Soft motor bed. Auto-stops even if an animation fails or the tab is hidden. */
  startReels() {
    this.stopReels();
    if (!this.context || !this.master || this.context.state !== 'running') return;
    try {
      const ctx = this.context;
      const motor = ctx.createOscillator();
      const gain = ctx.createGain();
      motor.type = 'triangle';
      motor.frequency.setValueAtTime(48, ctx.currentTime);
      motor.frequency.linearRampToValueAtTime(82, ctx.currentTime + 0.45);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.4);
      motor.connect(gain); gain.connect(this.master);
      this.motor = { motor, gain };
      motor.onended = () => { motor.disconnect(); gain.disconnect(); };
      motor.start(); motor.stop(ctx.currentTime + 7);
    } catch { this.stopReels(); }
  }

  stopReels() {
    if (!this.motor) return;
    const { motor, gain } = this.motor;
    this.motor = null;
    try {
      gain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.035);
      motor.stop(this.context.currentTime + 0.15);
    } catch { motor.disconnect(); gain.disconnect(); }
  }

  reelTick() {
    const now = performance.now();
    if (now - (this.lastReelTick ?? 0) < 65) return;
    this.lastReelTick = now;
    this.tone(240, 0.022, 0, 0.15, 'triangle');
  }

  reelStop(index) {
    this.tone(120, 0.1, 0, 0.38, 'triangle');
    this.tone([660, 785, 990][index], 0.16, 0.025, 0.18);
  }

  miss() { this.tone(294, 0.2, 0, 0.15); this.tone(220, 0.24, 0.13, 0.12); }

  jackpot() {
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((note, i) => {
      this.tone(note, 0.65, i * 0.105, 0.28);
      this.tone(note * 2, 0.45, i * 0.105, 0.08);
    });
  }
}
