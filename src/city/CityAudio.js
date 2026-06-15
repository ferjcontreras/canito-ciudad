// Audio diegético de la ciudad (sin música/cama de ambiente):
//  • Motores de los autos/motos más cercanos — loops de samples REALES, con
//    volumen por distancia, paneo estéreo y tono (RPM) según la velocidad.
//  • Pasos de la gente que camina cerca — sample REAL, volumen según cuánta
//    gente haya alrededor.
//  • Bocinazos — samples REALES de bocina (las motos, un poco más agudas).
// Todo necesita un gesto del usuario para arrancar (política de autoplay).
import { ChipMusic } from './ChipMusic';
const ENGINE_VOICES = 7; // motores cercanos audibles a la vez
const ENGINE_RANGE = 50; // m: más allá no se oyen
const TRAM_RANGE = 75; // el tranvía se oye desde más lejos
export class CityAudio {
    ctx = null;
    master;
    // Voces de motor: cada una reproduce en loop un sample REAL de motor (auto o
    // moto), con su tono modulado por la velocidad y atenuado por la distancia.
    voices = [];
    // Samples reales
    carEngine = null;
    motoEngine = null;
    carHorns = [];
    footBuf = null;
    barkBuf = null;
    // Pasos de gente (dos voces en loop, ganancia según gente cercana)
    footGains = [];
    footStarted = false;
    footCur = 0;
    // Tranvía (una voz en loop, ganancia/paneo según el tranvía más cercano)
    tramEngine = null;
    tramGain = null;
    tramPan = null;
    tramCur = 0;
    // Música: pista real en loop si existe (audio/music.mp3); si no, chiptune.
    music = null;
    musicOn = true;
    musicBuf = null;
    musicSrc = null;
    musicGain = null;
    musicVol = 0.32;
    started = false;
    acc = 0;
    // última posición/orientación del jugador (para panear bocinas externas)
    px = 0;
    pz = 0;
    rx = 1;
    rz = 0;
    // Estado para diagnóstico en pantalla.
    info = 'sin iniciar';
    get state() { return this.ctx ? this.ctx.state : 'no-ctx'; }
    get ready() { return this.carEngine != null; }
    activeVoices() { return this.voices.filter(v => v.cur > 0.01).length; }
    /** Prende/apaga la música. Devuelve el nuevo estado. */
    toggleMusic() {
        this.musicOn = !this.musicOn;
        if (this.musicOn)
            this._startMusic();
        else
            this._stopMusic();
        return this.musicOn;
    }
    get musicPlaying() { return this.musicOn; }
    _resume() {
        if (!this.ctx)
            return;
        this.ctx.resume().then(() => { this.info = 'resume() OK → ' + this.ctx.state; }, (e) => { this.info = 'resume() FALLÓ: ' + (e?.message ?? e); });
    }
    // Llamar desde un listener de gesto (keydown/pointerdown/click) al boot.
    unlock() {
        if (this.started) {
            if (this.ctx && this.ctx.state !== 'running')
                this._resume();
            return;
        }
        try {
            const Ctor = window.AudioContext
                ?? window.webkitAudioContext;
            const ctx = new Ctor();
            this.ctx = ctx;
            this.started = true;
            this.info = 'ctx creado, estado=' + ctx.state;
            this.master = ctx.createGain();
            this.master.gain.value = 0.95;
            this.master.connect(ctx.destination);
            // Blip corto de confirmación: avisa que el audio arrancó. Va directo al
            // destino, independiente del resto del grafo.
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = 660;
            const g = ctx.createGain();
            const t = ctx.currentTime;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
            o.connect(g).connect(ctx.destination);
            o.start(t);
            o.stop(t + 0.32);
            this._buildVoices();
            void this._loadSamples();
            // Chiptune de respaldo (se usa sólo si no carga audio/music.mp3). La
            // música real arranca en _startMusic() cuando terminan de cargar los samples.
            this.music = new ChipMusic(ctx, this.master);
            this._resume();
        }
        catch (e) {
            this.info = 'EXCEPCIÓN: ' + (e?.message ?? e);
            console.error('CityAudio: no se pudo iniciar el audio', e);
        }
    }
    // ── Carga de los samples reales (motores, bocinas, pasos) ───────────────────
    async _loadSamples() {
        const ctx = this.ctx;
        const load = async (url) => {
            try {
                const res = await fetch(url);
                if (!res.ok)
                    return null;
                return await ctx.decodeAudioData(await res.arrayBuffer());
            }
            catch {
                return null;
            }
        };
        const [ce, me, a, b, ft, tr, mus, bk] = await Promise.all([
            load('audio/car-engine.mp3'),
            load('audio/moto-engine.mp3'),
            load('audio/car-horn-a.mp3'),
            load('audio/car-horn-b.mp3'),
            load('audio/footsteps.mp3'),
            load('audio/tram-engine.mp3'),
            load('audio/music.mp3'),
            load('audio/bark.mp3'),
        ]);
        this.carEngine = ce;
        this.motoEngine = me;
        if (a)
            this.carHorns.push(a);
        if (b)
            this.carHorns.push(b);
        this.footBuf = ft;
        this.tramEngine = tr;
        this.musicBuf = mus;
        this.barkBuf = bk;
        if (this.musicOn)
            this._startMusic(); // ya con los buffers cargados
    }
    // ── Música ──────────────────────────────────────────────────────────────────
    _startMusic() {
        if (!this.ctx)
            return;
        if (this.musicBuf) { // pista real en loop
            if (!this.musicSrc) {
                const src = this.ctx.createBufferSource();
                src.buffer = this.musicBuf;
                src.loop = true;
                const g = this.ctx.createGain();
                g.gain.value = 0;
                src.connect(g).connect(this.master);
                src.start();
                this.musicSrc = src;
                this.musicGain = g;
            }
            this.musicGain.gain.setTargetAtTime(this.musicVol, this.ctx.currentTime, 0.5);
        }
        else { // fallback chiptune
            this.music?.start(0.16);
        }
    }
    _stopMusic() {
        if (this.musicGain && this.ctx)
            this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
        this.music?.stop();
    }
    // ── Voces de motor (autos/motos cercanos) ──────────────────────────────────
    // Sólo la cadena de mezcla (filtro + ganancia + paneo). El BufferSource con el
    // loop de motor se crea/reemplaza por demanda en `_setVoiceKind`, según el
    // tipo de vehículo asignado a la voz ese frame.
    _buildVoices() {
        const ctx = this.ctx;
        for (let i = 0; i < ENGINE_VOICES; i++) {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 900;
            lp.Q.value = 0.7;
            const gain = ctx.createGain();
            gain.gain.value = 0.0;
            const pan = ctx.createStereoPanner();
            lp.connect(gain).connect(pan).connect(this.master);
            this.voices.push({ src: null, kind: null, lp, gain, pan, cur: 0 });
        }
    }
    /** Asegura que la voz reproduzca el loop del tipo pedido (auto/moto). */
    _setVoiceKind(voice, kind) {
        if (voice.kind === kind && voice.src)
            return;
        const buf = kind === 'moto' ? this.motoEngine : this.carEngine;
        if (!buf)
            return; // el sample todavía no cargó
        const ctx = this.ctx;
        if (voice.src) {
            try {
                voice.src.stop();
            }
            catch { /* ya parado */ }
            voice.src.disconnect();
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(voice.lp);
        // fase inicial al azar → los motores no suenan sincronizados entre sí
        src.start(ctx.currentTime, Math.random() * buf.duration);
        voice.src = src;
        voice.kind = kind;
    }
    /** Arranca las dos voces de pasos (una vez cargado el sample). */
    _ensureFootsteps() {
        if (this.footStarted || !this.footBuf)
            return;
        this.footStarted = true;
        const ctx = this.ctx;
        for (const [rate, pan] of [[0.98, -0.25], [1.07, 0.25]]) {
            const src = ctx.createBufferSource();
            src.buffer = this.footBuf;
            src.loop = true;
            src.playbackRate.value = rate;
            const g = ctx.createGain();
            g.gain.value = 0.0;
            const p = ctx.createStereoPanner();
            p.pan.value = pan;
            src.connect(g).connect(p).connect(this.master);
            src.start(ctx.currentTime, Math.random() * this.footBuf.duration);
            this.footGains.push(g);
        }
    }
    /** Arranca la voz del tranvía (una vez cargado el sample). */
    _ensureTram() {
        if (this.tramGain || !this.tramEngine)
            return;
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.tramEngine;
        src.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1500;
        const g = ctx.createGain();
        g.gain.value = 0.0;
        const p = ctx.createStereoPanner();
        src.connect(lp).connect(g).connect(p).connect(this.master);
        src.start(ctx.currentTime, Math.random() * this.tramEngine.duration);
        this.tramGain = g;
        this.tramPan = p;
    }
    // ── Actualización por frame ────────────────────────────────────────────────
    update(dt, px, pz, heading, vehicles, walkLevel, // 0..1 según cuánta gente camina cerca del jugador
    trams = []) {
        if (!this.ctx || this.ctx.state !== 'running')
            return;
        this.acc += dt;
        if (this.acc < 0.08)
            return; // ~12 Hz, evita thrash de parámetros
        const dt2 = this.acc;
        this.acc = 0;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        // forward + right (para paneo)
        const fx = Math.sin(heading), fz = Math.cos(heading);
        const rx = fz, rz = -fx;
        this.px = px;
        this.pz = pz;
        this.rx = rx;
        this.rz = rz;
        // N vehículos más cercanos dentro del rango
        const near = [];
        for (const v of vehicles) {
            const dx = v.x - px, dz = v.z - pz;
            const d = Math.hypot(dx, dz);
            if (d < ENGINE_RANGE)
                near.push({ v, d });
        }
        near.sort((a, b) => a.d - b.d);
        for (let i = 0; i < this.voices.length; i++) {
            const voice = this.voices[i];
            const slot = near[i];
            let target = 0;
            if (slot) {
                const { v, d } = slot;
                const dx = v.x - px, dz = v.z - pz;
                const dist = Math.max(1, d);
                // Caída cúbica: lo lejano se apaga muy rápido (sólo lo cercano suena).
                const f = 1 - dist / ENGINE_RANGE;
                target = Math.min(0.7, f * f * f * (v.moto ? 1.05 : 1.25));
                // Loop real del tipo correcto; el "RPM" sube con la velocidad acelerando
                // el sample (motos más agudas que autos).
                this._setVoiceKind(voice, v.moto ? 'moto' : 'car');
                if (voice.src) {
                    const rate = (v.moto ? 1.0 : 0.85) + v.speed * (v.moto ? 0.03 : 0.02);
                    voice.src.playbackRate.setTargetAtTime(Math.max(0.6, Math.min(1.7, rate)), now, 0.12);
                }
                voice.lp.frequency.setTargetAtTime(v.moto ? 1800 : 1200, now, 0.1);
                // paneo: proyección sobre el vector "derecha" del jugador
                const inv = 1 / dist;
                const pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) * inv));
                voice.pan.pan.setTargetAtTime(pan, now, 0.08);
            }
            // suavizar gain hacia el objetivo
            voice.cur += (target - voice.cur) * Math.min(1, dt2 * 5);
            voice.gain.gain.setTargetAtTime(voice.cur, now, 0.05);
        }
        // ── Pasos de la gente cercana ────────────────────────────────────────────
        this._ensureFootsteps();
        const footTarget = Math.min(0.45, Math.max(0, walkLevel) * 0.45);
        this.footCur += (footTarget - this.footCur) * Math.min(1, dt2 * 4);
        for (const g of this.footGains)
            g.gain.setTargetAtTime(this.footCur, now, 0.15);
        // ── Tranvía más cercano ──────────────────────────────────────────────────
        this._ensureTram();
        if (this.tramGain && this.tramPan) {
            let best = Infinity, bx = 0, bz = 0;
            for (const t of trams) {
                const d = Math.hypot(t.x - px, t.z - pz);
                if (d < best) {
                    best = d;
                    bx = t.x;
                    bz = t.z;
                }
            }
            let tt = 0;
            if (best < TRAM_RANGE) {
                const f = 1 - best / TRAM_RANGE;
                tt = Math.min(0.6, f * f * f * 0.95);
                const dist = Math.max(1, best);
                const pan = Math.max(-1, Math.min(1, ((bx - px) * rx + (bz - pz) * rz) / dist));
                this.tramPan.pan.setTargetAtTime(pan, now, 0.1);
            }
            this.tramCur += (tt - this.tramCur) * Math.min(1, dt2 * 4);
            this.tramGain.gain.setTargetAtTime(this.tramCur, now, 0.1);
        }
    }
    /** Ladrido de Canito: sample real (audio/bark.mp3) si cargó; si no, sintético. */
    bark() {
        if (!this.ctx || this.ctx.state !== 'running')
            return;
        const ctx = this.ctx, now = ctx.currentTime;
        if (this.barkBuf) {
            const src = ctx.createBufferSource();
            src.buffer = this.barkBuf;
            src.playbackRate.value = 0.97 + Math.random() * 0.06; // leve variación
            const g = ctx.createGain();
            g.gain.value = 0.95;
            src.connect(g).connect(this.master);
            src.start(now);
            return;
        }
        const woof = (t0) => {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(400, t0);
            o.frequency.exponentialRampToValueAtTime(150, t0 + 0.13);
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 1500;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.17);
            o.connect(lp).connect(g).connect(this.master);
            o.start(t0);
            o.stop(t0 + 0.19);
        };
        woof(now);
        woof(now + 0.2); // "guau guau"
    }
    /** Bocinazo de un vehículo en (x,z) — lo dispara el tránsito al frenar.
     *  Reproduce un sample REAL de bocina de auto (las motos, un poco más agudas)
     *  con volumen por distancia y paneo estéreo. */
    honkAt(x, z, moto) {
        if (!this.ctx || this.ctx.state !== 'running')
            return;
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const dx = x - this.px, dz = z - this.pz;
        const d = Math.hypot(dx, dz);
        if (d > ENGINE_RANGE)
            return;
        const fh = 1 - d / ENGINE_RANGE;
        const vol = Math.min(0.8, fh * fh * fh * 1.2);
        if (vol <= 0.02)
            return;
        const pan = Math.max(-1, Math.min(1, (dx * this.rx + dz * this.rz) / Math.max(1, d)));
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        panner.connect(this.master);
        // ── Sample real de bocina (auto; moto = misma bocina un poco más aguda) ──
        const buf = this.carHorns[(Math.random() * this.carHorns.length) | 0];
        if (buf) {
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = (moto ? 1.12 : 1.0) * (0.97 + Math.random() * 0.06);
            const g = ctx.createGain();
            g.gain.value = vol;
            src.connect(g).connect(panner);
            src.start(now);
            return;
        }
        // ── Fallback sintético (si los samples no están disponibles) ─────────────
        const sv = vol * 0.5;
        const make = (f) => {
            const o = ctx.createOscillator();
            o.type = 'square';
            o.frequency.value = f;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(sv, now + 0.02);
            g.gain.setValueAtTime(sv, now + 0.28);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
            o.connect(g).connect(panner);
            o.start(now);
            o.stop(now + 0.45);
        };
        make(moto ? 420 : 300);
        make(moto ? 520 : 370); // intervalo tipo claxon
    }
}
