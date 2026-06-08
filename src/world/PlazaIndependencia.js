import * as THREE from 'three';
// Plaza Independencia de Mendoza, según su disposición real:
//  • Fuente de Aguas Danzantes — SEMICÍRCULO con césped y chorros que "bailan"
//    e iluminación RGB, abierta hacia el centro de la plaza.
//  • Fuente chica RECTANGULAR, más al sur.
//  • Cartel 3D "Yo ❤ Mendoza" en el centro.
//  • Escudo de Mendoza (grande y luminoso) hacia el norte.
//  • Juegos de niños al costado este.
// Nada de esto se pisa con árboles (se exportan sus colliders para excluirlos).
const stone = new THREE.MeshLambertMaterial({ color: 0xcabfa8, flatShading: true });
const stoneDark = new THREE.MeshLambertMaterial({ color: 0x9a8f78, flatShading: true });
const grass = new THREE.MeshLambertMaterial({ color: 0x5f9a45, flatShading: true, side: THREE.DoubleSide });
const tile = new THREE.MeshLambertMaterial({ color: 0x274b63, flatShading: true });
const waterMat = new THREE.MeshLambertMaterial({ color: 0x2f7fc0, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
const jetMat = new THREE.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.6, depthWrite: false });
export function buildPlazaIndependencia(scene, cx, cz) {
    const colliders = [];
    const jets = [];
    const lights = [];
    // ── Veredas internas (red de senderos como en la plaza real) ──────────────
    buildPaths(scene, cx, cz);
    const jetGeo = new THREE.CylinderGeometry(0.12, 0.17, 1, 8);
    const addJet = (x, z, baseY, maxH) => {
        const m = new THREE.Mesh(jetGeo, jetMat);
        m.position.set(x, baseY, z);
        scene.add(m);
        jets.push({ mesh: m, phase: Math.random() * Math.PI * 2, maxH, baseY });
    };
    const tri = (pos, a, b, c) => pos.push(...a, ...b, ...c);
    const meshFrom = (pos, mat, recv = true) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = recv;
        scene.add(m);
    };
    // ── Fuente de Aguas Danzantes (semicírculo, abierto hacia el centro/-X) ────
    // Al ESTE del centro (por donde se entra); abre hacia -X (oeste, al centro).
    const FX = cx + 44, FZ = cz, R = 16;
    // a∈[0,π] → bulto hacia +X (este); diámetro sobre Z en x=FX
    const arc = (a, r, y) => [FX + Math.sin(a) * r, y, FZ + Math.cos(a) * r];
    const N = 36;
    // Césped del hemiciclo (medio disco)
    {
        const pos = [];
        for (let i = 0; i < N; i++) {
            tri(pos, [FX, 0.06, FZ], arc((i + 1) / N * Math.PI, R - 0.6, 0.06), arc(i / N * Math.PI, R - 0.6, 0.06));
        }
        meshFrom(pos, grass);
    }
    // Terrazas (gradas curvas concéntricas) — efecto anfiteatro a nivel del piso
    for (let k = 0; k < 3; k++) {
        const rr = R - k * 4.5, h = 0.55 - k * 0.16;
        const pos = [];
        for (let i = 0; i < N; i++) {
            const a0 = i / N * Math.PI, a1 = (i + 1) / N * Math.PI;
            const b0 = arc(a0, rr, 0), b1 = arc(a1, rr, 0);
            const t0 = [b0[0], h, b0[2]], t1 = [b1[0], h, b1[2]];
            tri(pos, b0, t0, t1);
            tri(pos, b0, t1, b1);
        }
        meshFrom(pos, k % 2 ? stoneDark : stone, false);
    }
    // Borde recto del diámetro (sobre Z, donde la gente se asoma)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 2 * R), stone);
    edge.position.set(FX, 0.27, FZ);
    edge.castShadow = true;
    scene.add(edge);
    // Canal de agua curvo + chorros danzantes a lo largo del arco
    {
        const r1 = R * 0.5, r2 = R * 0.72, pos = [];
        for (let i = 0; i < N; i++) {
            const a0 = i / N * Math.PI, a1 = (i + 1) / N * Math.PI;
            const i0 = arc(a0, r1, 0.24), o0 = arc(a0, r2, 0.24), i1 = arc(a1, r1, 0.24), o1 = arc(a1, r2, 0.24);
            tri(pos, i0, o0, o1);
            tri(pos, i0, o1, i1);
        }
        meshFrom(pos, waterMat, false);
    }
    const NJ = 18;
    for (let i = 0; i < NJ; i++) {
        const a = (0.08 + (i / (NJ - 1)) * 0.84) * Math.PI;
        const [jx, , jz] = arc(a, R * 0.61, 0);
        addJet(jx, jz, 0.24, 4 + Math.random() * 2.5);
    }
    addJet(FX + R * 0.3, FZ, 0.24, 9); // chorro alto
    for (let i = 0; i < 4; i++) {
        const a = (0.1 + i / 3 * 0.8) * Math.PI;
        const [lx, , lz] = arc(a, R * 0.6, 0);
        const pl = new THREE.PointLight(0xffffff, 2.0, 24, 2);
        pl.position.set(lx, 0.7, lz);
        scene.add(pl);
        lights.push(pl);
    }
    colliders.push({ minX: FX - 1.5, maxX: FX + R, minZ: FZ - R, maxZ: FZ + R });
    // ── Fuente chica RECTANGULAR (más al este, detrás de la grande) ────────────
    {
        const rx = cx + 80, rz = cz, W = 4.2, D = 9;
        // marco de piedra (4 lados) + agua
        const rim = (w, d, x, z) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), stone);
            m.position.set(x, 0.25, z);
            m.castShadow = true;
            scene.add(m);
        };
        rim(W, 0.5, rx, rz - D / 2);
        rim(W, 0.5, rx, rz + D / 2);
        rim(0.5, D, rx - W / 2, rz);
        rim(0.5, D, rx + W / 2, rz);
        const water = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.14, D - 0.5), waterMat);
        water.position.set(rx, 0.32, rz);
        scene.add(water);
        for (let i = -1; i <= 1; i++)
            addJet(rx, rz + i * 2.6, 0.34, 1.6 + Math.random());
        colliders.push({ minX: rx - W / 2 - 0.3, maxX: rx + W / 2 + 0.3, minZ: rz - D / 2 - 0.3, maxZ: rz + D / 2 + 0.3 });
    }
    // ── Cartel "Yo ❤ Mendoza" (centro, mirando al este) ───────────────────────
    buildSign(scene, cx + 6, cz, colliders);
    // ── Escudo de Mendoza: cartel de neón en (-58, 0), mirando al oeste ────────
    buildEscudo(scene, cx - 58, cz, colliders);
    // ── Juegos de niños (costado norte) ────────────────────────────────────────
    buildPlayground(scene, cx + 8, cz - 50, colliders);
    // ── Animación: aguas danzantes + luces RGB ────────────────────────────────
    let t = 0;
    return {
        colliders,
        update(dt) {
            t += dt;
            for (const j of jets) {
                const h = 0.5 + j.maxH * (0.5 + 0.5 * Math.sin(t * 1.8 + j.phase));
                j.mesh.scale.y = h;
                j.mesh.position.y = j.baseY + h / 2;
            }
            for (let i = 0; i < lights.length; i++) {
                lights[i].color.setHSL((t * 0.08 + i * 0.2) % 1, 0.85, 0.55);
            }
        },
    };
}
// ── Veredas internas de la plaza ───────────────────────────────────────────
const pathMat = new THREE.MeshLambertMaterial({ color: 0xc8bfac, side: THREE.DoubleSide });
function buildPaths(scene, cx, cz) {
    const PY = 0.0;
    const seg = (x0, z0, x1, z1, hw) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 0.1)
            return;
        const dx = (x1 - x0) / len, dz = (z1 - z0) / len, nx = -dz, nz = dx;
        const v = [
            x0 + nx * hw, PY, z0 + nz * hw, x0 - nx * hw, PY, z0 - nz * hw,
            x1 + nx * hw, PY, z1 + nz * hw, x1 - nx * hw, PY, z1 - nz * hw,
        ];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        g.setIndex([0, 2, 1, 1, 2, 3]);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, pathMat);
        m.receiveShadow = true;
        scene.add(m);
    };
    const rect = (rcx, rcz, w, d) => {
        const g = new THREE.PlaneGeometry(w, d);
        g.rotateX(-Math.PI / 2);
        g.translate(rcx, PY, rcz);
        const m = new THREE.Mesh(g, pathMat);
        m.receiveShadow = true;
        scene.add(m);
    };
    // Explanada central (donde está el cartel) + eje principal este-oeste
    rect(cx + 10, cz, 70, 24);
    seg(cx - 112, cz, cx + 112, cz, 5);
    // Cruz norte-sur
    seg(cx, cz - 86, cx, cz + 86, 4);
    // Diagonales hacia las cuatro esquinas
    seg(cx, cz, cx - 100, cz - 72, 3);
    seg(cx, cz, cx + 100, cz - 72, 3);
    seg(cx, cz, cx - 100, cz + 72, 3);
    seg(cx, cz, cx + 100, cz + 72, 3);
    // Vereda perimetral
    seg(cx - 104, cz - 78, cx + 104, cz - 78, 3);
    seg(cx - 104, cz + 78, cx + 104, cz + 78, 3);
    seg(cx - 104, cz - 78, cx - 104, cz + 78, 3);
    seg(cx + 104, cz - 78, cx + 104, cz + 78, 3);
}
// ── Cartel 3D: pixel-font 3×5 (+ corazón 5×5) ──────────────────────────────
const FONT = {
    Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'],
    O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    M: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'],
    E: ['XXX', 'X..', 'XXX', 'X..', 'XXX'],
    N: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'],
    D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
    Z: ['XXX', '..X', '.X.', 'X..', 'XXX'],
    A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
    C: ['XXX', 'X..', 'X..', 'X..', 'XXX'],
    I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
    U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
};
const HEART = ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'];
// Cartel en un plano vertical en x=signX, mirando al ESTE (+X): las letras se
// despliegan a lo largo de Z (para un observador al este leyendo +Z → −Z).
function buildSign(scene, signX, cz, colliders) {
    const CELL = 0.42, DEPTH = 0.6;
    const cube = new THREE.BoxGeometry(DEPTH, CELL * 0.96, CELL * 0.96);
    // ❤ + MENDOZA con degradé cálido→frío, como el cartel real
    const grad = [0xe8731e, 0xf0a81e, 0xf1c40f, 0x6cbf3a, 0x2aa8a8, 0x2e86de, 0xe23b3b]; // M E N D O Z A
    const glyphs = [{ rows: HEART, color: 0xe23b3b }];
    const word = 'MENDOZA';
    for (let i = 0; i < word.length; i++)
        glyphs.push({ rows: FONT[word[i]], color: grad[i % grad.length] });
    const totalCells = glyphs.reduce((s, g) => s + g.rows[0].length + 1, -1);
    const span = totalCells * CELL;
    const baseTop = 0.24;
    let z = cz + span / 2; // arranca en +Z (izquierda del observador al este)
    let minZ = Infinity, maxZ = -Infinity;
    for (const g of glyphs) {
        const w = g.rows[0].length;
        const mat = new THREE.MeshLambertMaterial({ color: g.color, emissive: g.color, emissiveIntensity: 0.22, flatShading: true });
        for (let r = 0; r < g.rows.length; r++) {
            for (let c = 0; c < w; c++) {
                if (g.rows[r][c] !== 'X')
                    continue;
                const m = new THREE.Mesh(cube, mat);
                m.position.set(signX, baseTop + (g.rows.length - 1 - r) * CELL + CELL / 2, z - c * CELL);
                m.castShadow = true;
                scene.add(m);
            }
        }
        minZ = Math.min(minZ, z - (w - 1) * CELL);
        maxZ = Math.max(maxZ, z);
        z -= (w + 1) * CELL;
    }
    // Plataforma oscura sobre la que se apoyan las letras
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.24, span + 1.0), new THREE.MeshLambertMaterial({ color: 0x2a2a2e, flatShading: true }));
    base.position.set(signX, 0.12, cz);
    base.receiveShadow = true;
    scene.add(base);
    colliders.push({ minX: signX - 1.5, maxX: signX + 1.5, minZ: cz - span / 2 - 0.7, maxZ: cz + span / 2 + 0.7 });
}
// ── Escudo de Mendoza: CARTEL DE NEÓN "Ciudad de Mendoza" mirando al OESTE ──
// Construido en +Z local; el grupo se rota para que el frente dé al oeste.
function buildEscudo(scene, cx, cz, colliders) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = -Math.PI / 2; // frente (+Z local) → oeste (−X mundo)
    scene.add(g);
    const neon = (c, e, i = 1.0) => new THREE.MeshLambertMaterial({ color: c, emissive: e, emissiveIntensity: i, flatShading: true });
    const ovalFill = neon(0x16357a, 0x1c46b0, 0.75);
    const ovalRim = neon(0x6fa8ff, 0x4f8fff, 1.4);
    const sunM = neon(0xff9a30, 0xff7a10, 1.3);
    const redM = neon(0xe23b2b, 0xff2010, 1.2);
    const skinM = neon(0xe8c098, 0xc89048, 0.7);
    const greenM = neon(0x46e04a, 0x30c030, 1.2);
    const blueM = neon(0x5a86ff, 0x3060ff, 1.2);
    const frameM = new THREE.MeshLambertMaterial({ color: 0x2a2a30, flatShading: true });
    const at = (geo, mat, x, y, z, rotZ = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.rotation.z = rotZ;
        m.castShadow = true;
        g.add(m);
        return m;
    };
    const ocY = 5.2, RX = 1.9, RY = 2.5, ZF = 0.12; // centro del óvalo, radios
    // Soporte (base + dos postes)
    at(new THREE.BoxGeometry(1.8, 0.4, 1.2), frameM, 0, 0.2, -0.1);
    for (const ox of [-3.0, 3.0])
        at(new THREE.BoxGeometry(0.22, ocY, 0.22), frameM, ox, ocY / 2, -0.15);
    // Óvalo (relleno azul tenue + aro de neón brillante)
    const fill = at(new THREE.SphereGeometry(1, 22, 18), ovalFill, 0, ocY, 0);
    fill.scale.set(RX, RY, 0.1);
    const rim = at(new THREE.TorusGeometry(1, 0.07, 8, 36), ovalRim, 0, ocY, ZF);
    rim.scale.set(RX, RY, 1);
    // Sol naciente (disco + cara + rayos) arriba del óvalo
    at(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 18), sunM, 0, ocY + 1.2, ZF).rotation.x = Math.PI / 2;
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        at(new THREE.ConeGeometry(0.06, 0.34, 4), sunM, Math.cos(a) * 0.62, ocY + 1.2 + Math.sin(a) * 0.62, ZF, a + Math.PI / 2);
    }
    // Gorro frigio rojo sobre la pica + manos estrechadas
    at(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), skinM, 0, ocY + 0.1, ZF);
    at(new THREE.ConeGeometry(0.26, 0.5, 12), redM, 0, ocY + 0.75, ZF);
    at(new THREE.SphereGeometry(0.24, 10, 8), skinM, -0.2, ocY - 0.45, ZF);
    at(new THREE.SphereGeometry(0.24, 10, 8), skinM, 0.2, ocY - 0.45, ZF);
    // Paisaje (cerros verdes) en la base del óvalo
    for (const ox of [-0.7, 0, 0.7])
        at(new THREE.ConeGeometry(0.55, 0.7, 4), greenM, ox, ocY - 1.25, ZF);
    // Laureles: dos ramas de hojas verdes flanqueando el óvalo
    const leaf = new THREE.SphereGeometry(1, 6, 4);
    for (const side of [-1, 1]) {
        const NL = 10;
        for (let k = 0; k < NL; k++) {
            const a = (-50 + (k / (NL - 1)) * 130) * Math.PI / 180; // de abajo hacia arriba
            const lx = side * (RX + 0.7) * Math.cos(a);
            const ly = ocY + (RY + 0.4) * Math.sin(a);
            const m = at(leaf, greenM, lx, ly, ZF, -side * a);
            m.scale.set(0.34, 0.13, 0.18);
        }
    }
    // Moño azul abajo (donde se atan las ramas)
    at(new THREE.ConeGeometry(0.3, 0.6, 4), blueM, -0.32, ocY - RY - 0.2, ZF, Math.PI / 2 + 0.5);
    at(new THREE.ConeGeometry(0.3, 0.6, 4), blueM, 0.32, ocY - RY - 0.2, ZF, -Math.PI / 2 - 0.5);
    at(new THREE.SphereGeometry(0.18, 8, 6), blueM, 0, ocY - RY - 0.2, ZF);
    // Texto "CIUDAD DE MENDOZA" en naranja, debajo
    neonText(g, 'CIUDAD DE MENDOZA', 0, ocY - RY - 1.0, ZF, 0.12, sunM);
    // Reflector frontal (al oeste) para que el cartel brille
    const pl = new THREE.PointLight(0x9fd0ff, 2.6, 40, 2);
    pl.position.set(0, ocY, 6); // local +Z (oeste)
    g.add(pl);
    // Collider (ancho local X → mundo Z; profundidad → mundo X)
    colliders.push({ minX: cx - 1.0, maxX: cx + 1.0, minZ: cz - 4.0, maxZ: cz + 4.0 });
}
// Texto pixelado sobre el plano local (frente +Z), centrado en x = lcx
function neonText(g, str, lcx, ly, lz, cell, mat) {
    const cube = new THREE.BoxGeometry(cell * 0.9, cell * 0.9, 0.1);
    const widths = [...str].map(ch => (ch === ' ' ? 2 : FONT[ch][0].length));
    const total = widths.reduce((s, w) => s + w + 1, -1) * cell;
    let x = lcx - total / 2;
    for (let gi = 0; gi < str.length; gi++) {
        const ch = str[gi];
        if (ch !== ' ') {
            const rows = FONT[ch];
            for (let r = 0; r < rows.length; r++) {
                for (let c = 0; c < rows[r].length; c++) {
                    if (rows[r][c] !== 'X')
                        continue;
                    const m = new THREE.Mesh(cube, mat);
                    m.position.set(x + c * cell, ly + (rows.length - 1 - r) * cell, lz);
                    g.add(m);
                }
            }
        }
        x += (widths[gi] + 1) * cell;
    }
}
// ── Juegos de niños (hamacas + tobogán + subibaja) ─────────────────────────
function buildPlayground(scene, cx, cz, colliders) {
    const sand = new THREE.MeshLambertMaterial({ color: 0xd9c79a, flatShading: true });
    const red = new THREE.MeshLambertMaterial({ color: 0xd0473a, flatShading: true });
    const blue = new THREE.MeshLambertMaterial({ color: 0x3a78c0, flatShading: true });
    const yellow = new THREE.MeshLambertMaterial({ color: 0xf1c40f, flatShading: true });
    const green = new THREE.MeshLambertMaterial({ color: 0x3e9c5a, flatShading: true });
    const metal = new THREE.MeshLambertMaterial({ color: 0x9aa0a6, flatShading: true });
    const at = (geo, mat, x, y, z) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        scene.add(m);
        return m;
    };
    // Piso de arena
    const floor = at(new THREE.BoxGeometry(20, 0.1, 16), sand, cx, 0.05, cz);
    floor.castShadow = false;
    floor.receiveShadow = true;
    // Hamacas (swing set)
    {
        const sx = cx - 5, sz = cz;
        for (const o of [-1.6, 1.6]) {
            at(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), metal, sx + o, 1.5, sz - 1).rotation.z = 0.25 * Math.sign(o);
            at(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), metal, sx + o, 1.5, sz + 1).rotation.z = 0.25 * Math.sign(o);
        }
        at(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 6), metal, sx, 2.85, sz).rotation.x = Math.PI / 2;
        for (const o of [-0.8, 0.8]) {
            at(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), metal, sx + o, 1.95, sz);
            at(new THREE.BoxGeometry(0.5, 0.1, 0.3), o < 0 ? red : blue, sx + o, 1.15, sz);
        }
    }
    // Tobogán (slide)
    {
        const tx = cx + 5, tz = cz;
        at(new THREE.BoxGeometry(1.4, 0.2, 1.4), green, tx, 1.6, tz); // plataforma
        for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]])
            at(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), metal, tx + ox, 0.8, tz + oz);
        const slide = at(new THREE.BoxGeometry(0.9, 0.12, 3.4), yellow, tx, 0.95, tz + 2.0);
        slide.rotation.x = -0.5;
        // escalera
        for (let i = 0; i < 3; i++)
            at(new THREE.BoxGeometry(1.0, 0.08, 0.2), metal, tx, 0.5 + i * 0.45, tz - 0.8);
    }
    // Subibaja
    {
        const px = cx, pz = cz - 5;
        at(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 10), metal, px, 0.5, pz).rotation.x = Math.PI / 2;
        const beam = at(new THREE.BoxGeometry(0.4, 0.16, 5), red, px, 0.85, pz);
        beam.rotation.x = 0.12;
        for (const o of [-2.2, 2.2])
            at(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), blue, px, 1.1, pz + o);
    }
    colliders.push({ minX: cx - 10, maxX: cx + 10, minZ: cz - 8, maxZ: cz + 8 });
}
