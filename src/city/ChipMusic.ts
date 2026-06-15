// Música chiptune (8-bit) generada con WebAudio: una melodía ORIGINAL con aire
// de FOLCLORE CUYANO (tonada/cueca de la Vendimia) — compás de 6/8, guitarra
// punteada, bombo suave y una tonada cálida. Nada de canción real (libre de
// derechos). Secuenciador con lookahead (estándar WebAudio).

const SEMI: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};
function freq(note: string): number {
  const m = /^([A-G]#?)(-?\d)$/.exec(note);
  if (!m) return 0;
  const midi = (parseInt(m[2], 10) + 1) * 12 + SEMI[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Compás de 6/8 (dos tiempos de negra con puntillo = 3 corcheas cada uno).
// Progresión G – C – D – G (I–IV–V–I), 1 compás cada una.
const BARS = 4;
const STEPS_PER_BAR = 12;          // 6 corcheas = 12 semicorcheas por compás
const TOTAL = BARS * STEPS_PER_BAR;

// Punteo de guitarra cuyana: 6 notas por compás (una por corchea). Los índices
// 0 y 3 caen en los dos tiempos → ahí va el bajo de la cuerda grave.
const ARP: string[][] = [
  ['G2', 'B3', 'D4', 'D3', 'G3', 'B3'],   // G
  ['C3', 'E4', 'G4', 'G2', 'C4', 'E4'],   // C
  ['D3', 'F#4', 'A4', 'A2', 'D4', 'F#4'], // D
  ['G2', 'B3', 'D4', 'D3', 'G3', 'B3'],   // G
];

// Melodía (tonada), 6 corcheas por compás ('-' = silencio/sostenido).
const LEAD: string[] = [
  'D4', 'G4', 'B4', '-', 'A4', 'G4',      // G
  'E4', 'G4', 'C5', '-', 'B4', 'G4',      // C
  'F#4', 'A4', 'D5', '-', 'C#5', 'A4',    // D
  'B4', '-', 'G4', '-', 'D4', '-',        // G
];

export class ChipMusic {
  private out: GainNode;
  private noise: AudioBuffer;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private stepDur: number;

  constructor(private ctx: AudioContext, destination: AudioNode, bpm = 150) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.0;
    this.out.connect(destination);
    this.stepDur = 60 / bpm / 4;     // duración de una semicorchea

    // Ruido blanco corto para la percusión
    const len = Math.floor(ctx.sampleRate * 0.3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  setVolume(v: number): void {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }

  start(volume = 0.17): void {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.setVolume(volume);
    this.timer = window.setInterval(() => this._scheduler(), 25);
  }

  stop(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.setVolume(0);
  }

  get playing(): boolean { return this.timer !== null; }

  // ── Scheduler con lookahead ────────────────────────────────────────────────
  private _scheduler(): void {
    // No programar mientras el contexto no esté corriendo (evita una avalancha
    // de notas acumuladas al reanudar).
    if (this.ctx.state !== 'running') { this.nextTime = this.ctx.currentTime + 0.1; return; }
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this._playStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step = (this.step + 1) % TOTAL;
    }
  }

  private _playStep(step: number, t: number): void {
    const bar = (step / STEPS_PER_BAR) | 0;
    const inBar = step % STEPS_PER_BAR;

    // Guitarra punteada y melodía caen en las corcheas (pasos pares).
    if (inBar % 2 === 0) {
      const idx = inBar / 2;                 // 0..5
      const isBeat = idx === 0 || idx === 3; // los dos tiempos del 6/8

      // ── Punteo de guitarra (cuerda grave en el tiempo, agudas en el medio) ─
      const g = ARP[bar][idx];
      this._tone(freq(g), t, this.stepDur * (isBeat ? 2.4 : 1.6),
        'triangle', isBeat ? 0.34 : 0.17, 0.004, 0.55);

      // ── Melodía (tonada), con un segundo oscilador apenas detunado ─────────
      const note = LEAD[bar * 6 + idx];
      if (note && note !== '-') {
        const f = freq(note);
        this._tone(f,          t, this.stepDur * 2.0, 'square', 0.12, 0.006, 0.55);
        this._tone(f * 1.005,  t, this.stepDur * 2.0, 'square', 0.08, 0.006, 0.55);
      }
    }

    // ── Bombo suave en los dos tiempos (6/8) ──────────────────────────────────
    if (inBar === 0) this._kick(t, 0.5);
    if (inBar === 6) this._kick(t, 0.34);
    // Palma/golpe seco tenue en los contratiempos para el vaivén
    if (inBar === 3 || inBar === 9) this._noiseHit(t, 2400, 0.05, 0.05);
  }

  // ── Síntesis ────────────────────────────────────────────────────────────────
  private _tone(f: number, t: number, dur: number, type: OscillatorType,
                peak: number, atk: number, sustain: number): void {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(peak * 0.4 * sustain + 0.0001, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private _kick(t: number, peak = 0.6): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + 0.18);
  }

  private _noiseHit(t: number, hz: number, dur: number, peak: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.out);
    src.start(t); src.stop(t + dur + 0.02);
  }
}
