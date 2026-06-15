// "Canito y el último mate": Canito perdido busca a su dueño, Don Ernesto, que
// se va moviendo por Mendoza. Cadena de pistas EN ORDEN: cada NPC del paso
// actual da una pista y manda al siguiente landmark. El dueño sólo aparece (y
// se lo puede encontrar) cuando se completaron todas las pistas.
import * as THREE from 'three';
import { buildPerson } from './People';
// Posiciones sobre el mapa real (+X este, −X oeste hacia el Parque, +Z sur).
export const STEPS = [
    {
        npc: 'Mozo', x: 0, z: 128, target: { x: 12, z: 60 },
        clue: '¡Recién estaba acá! Salió disparado para la feria de la plaza, dejó el cortado por la mitad. Andá, campeón, capaz lo alcanzás.',
        filler: 'No, a mí no me preguntes, che, estoy laburando.',
    },
    {
        npc: 'Florista', x: 12, z: 60, target: { x: 388, z: 40 },
        clue: 'El viejito de los claveles, sí… se llevó un ramo lindo. Iba apurado para los negocios de la San Martín, algo de un regalo.',
        filler: 'Flores no te vendo, pulga. Preguntá por ahí.',
    },
    {
        npc: 'Kiosquero', x: 388, z: 40, target: { x: -388, z: -50 },
        clue: 'Don Ernesto, claro. Llevó un alfajor para el viaje. Miró la hora, puteó contra el zonda y salió pitando para la parada del metrotranvía.',
        filler: 'Ni idea, campeón. Probá en la parada del tranvía.',
    },
    {
        npc: 'Pasajero', x: -388, z: -50, target: { x: -880, z: 8 },
        clue: 'Se subió conmigo. Bajó en la última parada porque iba para el Parque. "Antes que oscurezca", repetía el hombre.',
        filler: 'Uh, recién me subo, no vi nada.',
    },
    {
        npc: 'Guardaparque', x: -885, z: 0, target: { x: -985, z: 0 },
        clue: '¿Un señor de boina, con un ramo y un alfajor a medio comer? Pasó hace nada. Está allá nomás, junto al lago. Dale, entrá derecho por el portón.',
        filler: 'Tranquilo, campeón, todavía no entró ningún viejo con un ramo. Volvé a preguntar en la plaza, no te adelantes.',
    },
];
export const OWNER = { name: 'Don Ernesto', x: -985, z: 0 };
const OWNER_LINE = '¡Canito! Perdoname, pulga… con el apuro se me soltó la correa y ni me di cuenta. ' +
    'Hoy es el día de tu abuela, vine a dejarle flores al lago, como todos los años. Vení, volvemos a casa juntos.';
const TALK_R = 4;
// Olores FALSOS que distraen en el modo olfato (café, comida, otros perros).
// El rastro del dueño es verde; estos son marrón/naranja/celeste para confundir.
const FALSE_SCENTS = [
    { x: 25, z: 55, color: 0x9a6326 }, { x: -28, z: 35, color: 0x9a6326 }, // café (plaza)
    { x: 392, z: -8, color: 0xe0902a }, { x: 396, z: 95, color: 0xe0902a }, // comida (San Martín)
    { x: 250, z: -250, color: 0x6fb0e0 }, { x: -250, z: 250, color: 0x6fb0e0 }, // otros perros (plazas)
    { x: -250, z: -250, color: 0x6fb0e0 }, { x: -160, z: -30, color: 0x9a6326 },
    { x: -470, z: -55, color: 0xe0902a }, { x: -700, z: 18, color: 0x6fb0e0 },
];
let _scentTex = null;
function scentTexture() {
    if (_scentTex)
        return _scentTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 1, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(32, 32, 31, 0, Math.PI * 2);
    c.fill();
    _scentTex = new THREE.CanvasTexture(cv);
    return _scentTex;
}
function emojiTexture(char) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    c.font = '46px serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(char, 32, 36);
    return new THREE.CanvasTexture(cv);
}
// Objetos que dejó Don Ernesto en cada parada (rastro físico de la historia).
const TRACES = [
    { emoji: '🧻', thought: 'Esta servilleta… huele al humano. Pasó por acá.' },
    { emoji: '🌹', thought: 'Un pétalo de su ramo. ¡Voy por buen camino!' },
    { emoji: '🍬', thought: 'El envoltorio de su alfajor… qué goloso es.' },
    { emoji: '🎫', thought: 'Su boleto del tranvía. Casi lo alcanzo.' },
    { emoji: '📷', thought: '¡Una foto de los dos! Ya falta poquito.' },
];
// Recuerdos de Canito (lugares donde pasaban cosas con el humano).
const MEMORIES = [
    { x: 40, z: 28, text: 'Acá el humano me dio mi primer huesito. 🦴' },
    { x: 410, z: 64, text: 'En esta esquina me compró la correa nueva.' },
    { x: -300, z: -40, text: 'Una vez nos agarró la lluvia justo acá, juntos.' },
    { x: -250, z: 250, text: 'En esta plaza dormí la siesta sobre sus pies.' },
    { x: -950, z: 0, text: 'Veníamos a ver el atardecer al lago, los dos solos.' },
];
// Camino REAL que recorrió Don Ernesto en cada tramo (por las calles, con sus
// giros — nada de líneas rectas). Índice i = tramo que llega al NPC i; el último
// lleva hasta el dueño. El rastro de olor se traza sobre estos puntos.
const LEGS = [
    [[0, 150], [0, 128]], // → Mozo (café)
    [[0, 128], [0, 90], [12, 60]], // → Florista (plaza)
    [[12, 60], [12, 100], [388, 100], [388, 40]], // → Kiosquero (San Martín)
    [[388, 40], [388, 0], [-388, 0], [-388, -50]], // → Pasajero (tranvía)
    [[-388, -50], [-388, 0], [-885, 0]], // → Guardaparque (Portones)
    [[-885, 0], [-985, 0]], // → Don Ernesto (lago)
];
const WISPS = 28; // nubecitas de olor a lo largo del tramo actual
/** Reparte n puntos equiespaciados a lo largo de la polilínea `pts`. */
function resample(pts, n) {
    const seg = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        seg.push(d);
        total += d;
    }
    const out = [];
    if (total < 1e-3) {
        for (let i = 0; i < n; i++)
            out.push([pts[0][0], pts[0][1]]);
        return out;
    }
    for (let k = 0; k < n; k++) {
        let d = (k / (n - 1)) * total, i = 0;
        while (i < seg.length && d > seg[i]) {
            d -= seg[i];
            i++;
        }
        if (i >= seg.length) {
            out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
            continue;
        }
        const t = seg[i] > 1e-6 ? d / seg[i] : 0;
        out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
    }
    return out;
}
function buildArrow() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe040 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), mat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -0.1;
    g.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 10), mat);
    head.rotation.x = Math.PI / 2;
    head.position.z = 0.3;
    g.add(head);
    return g;
}
export class QuestManager {
    step = 0; // pista actual (0..STEPS.length); == length → buscar al dueño
    finished = false;
    smellMode = false; // modo olfato activo
    rigs = [];
    owner;
    star; // ✨ sobre el NPC activo
    compass; // flecha-brújula sobre Canito
    wisps = []; // rastro de olor (sobre el camino del dueño)
    freshness = 0; // se desvanece con el tiempo al oler
    legCached = -1;
    falseScents = []; // olores falsos (sólo en modo olfato)
    traceSprites = []; // objetos que dejó el dueño
    traceThought = STEPS.map(() => false);
    memSprites = []; // recuerdos coleccionables
    memDone = MEMORIES.map(() => false);
    memoriesFound = 0;
    memoriesTotal = MEMORIES.length;
    t = 0;
    constructor(scene) {
        for (const s of STEPS) {
            const rig = buildPerson(1.0);
            rig.group.position.set(s.x, 0, s.z);
            scene.add(rig.group);
            this.rigs.push(rig);
        }
        this.owner = buildPerson(1.06);
        this.owner.group.position.set(OWNER.x, 0, OWNER.z);
        this.owner.group.visible = false; // aparece sólo al completar las pistas
        scene.add(this.owner.group);
        this.star = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshBasicMaterial({ color: 0xffe040 }));
        scene.add(this.star);
        this.compass = buildArrow();
        scene.add(this.compass);
        for (let i = 0; i < WISPS; i++) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({
                map: scentTexture(), color: 0x7fe0a0, transparent: true, opacity: 0, depthWrite: false,
            }));
            sp.scale.setScalar(1.7);
            sp.visible = false;
            scene.add(sp);
            this.wisps.push(sp);
        }
        // Olores falsos: nubecitas de color que sólo se ven en modo olfato.
        for (const f of FALSE_SCENTS) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({
                map: scentTexture(), color: f.color, transparent: true, opacity: 0, depthWrite: false,
            }));
            sp.position.set(f.x, 1.2, f.z);
            sp.scale.setScalar(2.4);
            sp.visible = false;
            scene.add(sp);
            this.falseScents.push(sp);
        }
        // Objetos del dueño (uno por parada): brillan junto al NPC del paso actual.
        STEPS.forEach((s, i) => {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({
                map: emojiTexture(TRACES[i].emoji), transparent: true, depthWrite: false,
            }));
            sp.position.set(s.x + 1.7, 0.9, s.z);
            sp.scale.setScalar(1.2);
            sp.visible = false;
            scene.add(sp);
            this.traceSprites.push(sp);
        });
        // Recuerdos coleccionables (estrellitas doradas que laten).
        for (const m of MEMORIES) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({
                map: emojiTexture('✨'), color: 0xffe66a, transparent: true, depthWrite: false,
            }));
            sp.position.set(m.x, 1.0, m.z);
            sp.scale.setScalar(1.1);
            scene.add(sp);
            this.memSprites.push(sp);
        }
    }
    setSmell(on) {
        this.smellMode = on;
        if (on)
            this.freshness = 1; // al volver a oler, el rastro se "refresca"
    }
    /** Coloca las nubecitas de olor a lo largo del tramo `idx` que recorrió el dueño. */
    _layLeg(idx) {
        const path = resample(LEGS[idx], WISPS);
        for (let i = 0; i < WISPS; i++)
            this.wisps[i].position.set(path[i][0], 0.6, path[i][1]);
    }
    /** Si Canito está al lado del objeto del paso actual, devuelve su pensamiento
     *  (una sola vez por parada). */
    activeTraceThought(px, pz) {
        const i = this.step;
        if (i >= STEPS.length || this.traceThought[i])
            return null;
        if (Math.hypot(STEPS[i].x + 1.7 - px, STEPS[i].z - pz) < 3.5) {
            this.traceThought[i] = true;
            return TRACES[i].thought;
        }
        return null;
    }
    /** Si Canito pisa un recuerdo nuevo, lo colecta y devuelve su frase. */
    collectMemory(px, pz) {
        for (let i = 0; i < MEMORIES.length; i++) {
            if (this.memDone[i])
                continue;
            const m = MEMORIES[i];
            if (Math.hypot(m.x - px, m.z - pz) < 2.4) {
                this.memDone[i] = true;
                this.memoriesFound++;
                this.memSprites[i].visible = false;
                return m.text;
            }
        }
        return null;
    }
    /** Objetivo actual (para brújula y olfato): el NPC del paso actual —a quién hay
     *  que hablarle ahora— y, completadas las pistas, el dueño. Nunca más allá. */
    marker() {
        return this.step < STEPS.length ? STEPS[this.step] : OWNER;
    }
    /** Actualiza visuales y devuelve si hay alguien para hablar (para el prompt). */
    update(dt, px, pz) {
        this.t += dt;
        const mk = this.marker();
        if (this.step < STEPS.length) {
            const s = STEPS[this.step];
            this.star.visible = true;
            this.star.position.set(s.x, 2.5 + Math.sin(this.t * 3) * 0.12, s.z);
            this.star.rotation.y = this.t * 2;
        }
        else {
            this.star.visible = false;
            this.owner.group.visible = true; // ya se puede encontrar al dueño
        }
        // Brújula sobre Canito apuntando al objetivo del paso actual
        const ax = mk.x - px, az = mk.z - pz;
        const distM = Math.hypot(ax, az) || 1;
        this.compass.position.set(px, 3.4 + Math.sin(this.t * 3) * 0.1, pz);
        this.compass.rotation.y = Math.atan2(ax, az);
        this.compass.visible = !this.finished && distM > 6;
        // Rastro de olor: huellitas Canito→objetivo, con onda de opacidad que avanza
        // ── Rastro de olor: SÓLO en modo olfato, sobre el CAMINO que recorrió el
        //    dueño (no en línea recta), y desvaneciéndose con el tiempo. ───────────
        const leg = Math.min(this.step, LEGS.length - 1);
        if (leg !== this.legCached) {
            this._layLeg(leg);
            this.legCached = leg;
        }
        const smell = this.smellMode && !this.finished;
        if (smell)
            this.freshness = Math.max(0, this.freshness - dt * 0.13); // se disipa (~7.5 s)
        if (this.smellMode && this.freshness <= 0)
            this.smellMode = false; // se apaga solo
        for (let i = 0; i < this.wisps.length; i++) {
            const sp = this.wisps[i];
            const vis = smell && this.freshness > 0.02;
            sp.visible = vis;
            if (vis) {
                const along = i / (this.wisps.length - 1); // más fresco cerca del NPC
                const wave = (Math.sin(this.t * 4 - i * 0.5) + 1) * 0.5;
                sp.position.y = 0.6 + Math.sin(this.t * 2 + i * 0.4) * 0.15;
                sp.material.opacity =
                    (0.18 + along * 0.6) * this.freshness * (0.5 + 0.5 * wave);
            }
        }
        // Olores falsos: sólo en modo olfato, también se disipan con la frescura
        const showFalse = smell && this.freshness > 0.02;
        for (let i = 0; i < this.falseScents.length; i++) {
            const sp = this.falseScents[i];
            sp.visible = showFalse;
            if (showFalse) {
                sp.position.y = 1.2 + Math.sin(this.t * 2 + i) * 0.25;
                sp.material.opacity =
                    (0.45 + (Math.sin(this.t * 3 + i * 1.7) + 1) * 0.2) * this.freshness;
            }
        }
        // Objeto del dueño: sólo el del paso actual, latiendo junto al NPC
        for (let i = 0; i < this.traceSprites.length; i++) {
            const sp = this.traceSprites[i];
            const show = i === this.step && this.step < STEPS.length;
            sp.visible = show;
            if (show)
                sp.position.y = 0.95 + Math.sin(this.t * 3) * 0.12;
        }
        // Recuerdos: laten flotando hasta que se colectan
        for (let i = 0; i < this.memSprites.length; i++) {
            if (this.memDone[i])
                continue;
            this.memSprites[i].position.y = 1.0 + Math.sin(this.t * 2.5 + i) * 0.18;
        }
        let canTalk = false, who = '';
        if (this.step < STEPS.length) {
            const s = STEPS[this.step];
            if (Math.hypot(s.x - px, s.z - pz) < TALK_R) {
                canTalk = true;
                who = s.npc;
            }
        }
        else if (!this.finished && Math.hypot(OWNER.x - px, OWNER.z - pz) < TALK_R) {
            canTalk = true;
            who = OWNER.name;
        }
        return { canTalk, who };
    }
    /** Apretó "hablar". Devuelve el diálogo y avanza si corresponde; null si no hay nadie cerca. */
    tryTalk(px, pz) {
        // Dueño (final)
        if (this.step >= STEPS.length && !this.finished &&
            Math.hypot(OWNER.x - px, OWNER.z - pz) < TALK_R) {
            this.finished = true;
            this.compass.visible = false;
            return { name: OWNER.name, text: OWNER_LINE, win: true };
        }
        // NPC del paso actual → da la pista y avanza
        if (this.step < STEPS.length) {
            const s = STEPS[this.step];
            if (Math.hypot(s.x - px, s.z - pz) < TALK_R) {
                this.step++;
                return { name: s.npc, text: s.clue };
            }
        }
        // Relleno: cualquier NPC cercano fuera de su turno
        for (const s of STEPS) {
            if (Math.hypot(s.x - px, s.z - pz) < TALK_R)
                return { name: s.npc, text: s.filler };
        }
        return null;
    }
}
