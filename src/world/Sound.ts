// Procedural sound effects via WebAudio — no asset files.
//
// Bark: short pitched yip with frequency sweep
// Groan: low ululating rumble (gauchos zombi)
// Boom: noise burst with low-pass for explosions
// Bite: sharp click for melee hit
export class SoundManager {
  private _ctx: AudioContext | null = null;
  private _last = new Map<string, number>();
  private _master: GainNode | null = null;

  private getCtx(): AudioContext {
    if (this._ctx) return this._ctx;
    const Ctor: typeof AudioContext = (window.AudioContext
      ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    this._ctx = new Ctor();
    this._master = this._ctx.createGain();
    this._master.gain.value = 0.45;
    this._master.connect(this._ctx.destination);
    return this._ctx;
  }

  // Audio needs a user gesture to start in most browsers. Call this from a
  // mousedown/keydown listener at boot.
  unlock(): void {
    const ctx = this.getCtx();
    if (ctx.state === 'suspended') ctx.resume();
  }

  private master(): AudioNode { return this._master!; }

  private throttle(key: string, sec: number): boolean {
    const now = performance.now() / 1000;
    const last = this._last.get(key) ?? -Infinity;
    if (now - last < sec) return true;
    this._last.set(key, now);
    return false;
  }

  bark(): void {
    if (this.throttle('bark', 0.1)) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.13);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(this.master());
    osc.start(now);
    osc.stop(now + 0.18);
  }

  groan(): void {
    if (this.throttle('groan', 0.9)) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const dur = 0.9 + Math.random() * 0.7;        // 0.9–1.6 s — uneven

    // Low gravelly fundamental in the "human male" range
    const f0 = 70 + Math.random() * 25;
    // Detuned pair of sawtooth oscillators → growl harmonics
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(f0,         now);
    osc2.frequency.setValueAtTime(f0 * 1.014, now);
    // Slow pitch fall — feels like running out of breath
    osc1.frequency.linearRampToValueAtTime(f0 * 0.78,         now + dur);
    osc2.frequency.linearRampToValueAtTime(f0 * 0.78 * 1.014, now + dur);

    // Vibrato LFO — that quivering, sickly quality
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4.5 + Math.random() * 2.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 5 + Math.random() * 4;   // ±5–9 Hz wobble
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    // Mix oscillators
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    osc1.connect(mix);
    osc2.connect(mix);

    // Vowel formant — bandpass around the "aaaa/uhhh" formant frequency
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(620 + Math.random() * 200, now);
    // Slide formant down as if mouth closing
    formant.frequency.linearRampToValueAtTime(380, now + dur);
    formant.Q.value = 3.2;

    // Rasp: a noise burst layered in for breath/throat texture
    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.6;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 2;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.08;
    noiseSrc.connect(noiseFilter).connect(noiseGain).connect(this.master());

    // Tonal envelope: slow attack, body, slow fade
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.20, now + 0.12);
    gain.gain.linearRampToValueAtTime(0.17, now + dur * 0.6);
    gain.gain.linearRampToValueAtTime(0,    now + dur);

    mix.connect(formant).connect(gain).connect(this.master());

    osc1.start(now); osc2.start(now); lfo.start(now); noiseSrc.start(now);
    osc1.stop(now + dur); osc2.stop(now + dur); lfo.stop(now + dur); noiseSrc.stop(now + dur);
  }

  boom(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.7), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.55);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
    src.connect(filter).connect(gain).connect(this.master());
    src.start(now);
  }

  whoosh(): void {
    if (this.throttle('whoosh', 0.3)) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.45), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * (1 - t) * t * 4;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.linearRampToValueAtTime(180, now + 0.4);
    filter.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.45);
    src.connect(filter).connect(gain).connect(this.master());
    src.start(now);
  }

  yelp(): void {
    if (this.throttle('yelp', 0.2)) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    // A short, high-pitched whimper that bends downward — "yiiiipp"
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.03);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain).connect(this.master());
    osc.start(now);
    osc.stop(now + 0.32);
  }

  pickup(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    // Two-note chime sweep, friendly
    const notes = [880, 1320];
    notes.forEach((freq, i) => {
      const t0 = now + i * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      osc.connect(gain).connect(this.master());
      osc.start(t0);
      osc.stop(t0 + 0.25);
    });
  }

  // Charged AoE power: bright descending zap layered over a heavy boom.
  powerBlast(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.45);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain).connect(this.master());
    osc.start(now);
    osc.stop(now + 0.6);
    this.boom();
  }

  bite(): void {
    if (this.throttle('bite', 0.18)) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(this.master());
    osc.start(now);
    osc.stop(now + 0.12);
  }
}
