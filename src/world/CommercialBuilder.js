import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SIDEWALK_W } from './StreetBuilder';
const SHOPS = [
    { name: "McDonald's", bg: 0xd62300, fg: 0xffc72c },
    { name: 'Frávega', bg: 0xe30613, fg: 0xffffff }, // electrodomésticos
    { name: 'Megatone', bg: 0xf39200, fg: 0xffffff }, // electrodomésticos
    { name: 'Garbarino', bg: 0x009640, fg: 0xffffff }, // electrodomésticos
    { name: 'Musimundo', bg: 0xed1c24, fg: 0xffe000 }, // electrodomésticos
    { name: 'Zara', bg: 0x111111, fg: 0xffffff }, // ropa
    { name: 'Indumentaria', bg: 0x7b2d8b, fg: 0xffffff }, // ropa
    { name: 'Moda Joven', bg: 0xe91e8c, fg: 0xffffff }, // ropa
    { name: 'Sport Wear', bg: 0x1565c0, fg: 0xffffff }, // ropa
    { name: 'Calzados', bg: 0x5d4037, fg: 0xffd54f }, // ropa/calzado
    { name: 'Havanna', bg: 0x6d1f1a, fg: 0xe8b84b },
    { name: 'Café Martínez', bg: 0x4a2c1a, fg: 0xe8c98a },
    { name: 'Farmacia', bg: 0x00843d, fg: 0xffffff },
    { name: 'Banco Nación', bg: 0xf47b20, fg: 0xffffff },
    { name: 'Heladería', bg: 0xec407a, fg: 0xffffff },
    { name: 'Supermercado', bg: 0xc62828, fg: 0xffffff },
    { name: 'Librería', bg: 0x1976d2, fg: 0xffffff },
    { name: 'Burger', bg: 0xb71c1c, fg: 0xffcc00 },
];
// Fachadas de planta alta — tonos urbanos claros
const FACADE_PAL = [0xe6ddcb, 0xd8d2c4, 0xcfc6b4, 0xe0d6c0, 0xc8cdd2, 0xd5cbb8];
const _signTex = new Map();
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function signTexture(s) {
    const cached = _signTex.get(s.name);
    if (cached)
        return cached;
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 128;
    const ctx = cv.getContext('2d');
    // Fondo del cartel
    ctx.fillStyle = hex(s.bg);
    ctx.fillRect(0, 0, 512, 128);
    // Marco interior
    ctx.strokeStyle = hex(s.fg);
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 492, 108);
    // Texto
    ctx.fillStyle = hex(s.fg);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fontSize = 74;
    ctx.font = `bold ${fontSize}px system-ui, "Segoe UI", sans-serif`;
    while (ctx.measureText(s.name).width > 470 && fontSize > 30) {
        fontSize -= 4;
        ctx.font = `bold ${fontSize}px system-ui, "Segoe UI", sans-serif`;
    }
    ctx.fillText(s.name, 256, 70);
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    _signTex.set(s.name, t);
    return t;
}
function box(cx, cz, w, d, h, yBase) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx, yBase + h / 2, cz);
    return g;
}
/**
 * Construye una tira comercial a ambos lados de una calle N-S (x = xLine),
 * entre z=zStart y z=zEnd. Locales a nivel de calle con cartel, toldo y
 * vidriera; pisos superiores con ventanas. Devuelve los colliders creados.
 */
export function buildCommercialStrip(scene, xLine, zStart, zEnd, existing, streetHalfW = 6) {
    // La fachada se retira detrás de la vereda (cordón + vereda + un margen).
    const frontDist = streetHalfW + SIDEWALK_W + 0.5;
    const wallsByColor = new Map();
    const awningByColor = new Map();
    const glassGeos = [];
    const signMeshes = [];
    const newColliders = [];
    const overlaps = (t) => {
        for (const c of existing)
            if (c.minX < t.maxX && c.maxX > t.minX && c.minZ < t.maxZ && c.maxZ > t.minZ)
                return true;
        for (const c of newColliders)
            if (c.minX < t.maxX && c.maxX > t.minX && c.minZ < t.maxZ && c.maxZ > t.minZ)
                return true;
        return false;
    };
    let shopIdx = Math.floor(Math.random() * SHOPS.length);
    let z = zStart;
    while (z < zEnd) {
        const w = 12 + Math.random() * 5; // ancho del local (a lo largo de Z)
        // Dejar un hueco en cada bocacalle (múltiplos de 100)
        // Dejar libre cada bocacalle (múltiplos de 100): el local NO puede invadir
        // la banda [cross-GAP, cross+GAP], que cubre calzada + vereda de la calle
        // que cruza (p.ej. Garibaldi en z=0). Se chequea el ANCHO COMPLETO del local.
        const GAP = 12;
        let blocked = false;
        for (const cross of [Math.floor(z / 100) * 100, Math.floor(z / 100) * 100 + 100]) {
            if (z < cross + GAP && z + w > cross - GAP) {
                z = cross + GAP; // saltar al otro lado del cruce
                blocked = true;
                break;
            }
        }
        if (blocked)
            continue;
        for (const side of [1, -1]) {
            const depth = 11 + Math.random() * 4; // fondo del local (a lo largo de X)
            const floors = 3 + Math.floor(Math.random() * 4); // 3–6 plantas (aspecto ciudad)
            const wallH = floors * 3.3;
            const offset = frontDist + depth / 2;
            const cx = xLine + side * offset;
            const cz = z + w / 2;
            const test = {
                minX: cx - depth / 2 - 1, maxX: cx + depth / 2 + 1,
                minZ: cz - w / 2 - 1, maxZ: cz + w / 2 + 1,
            };
            if (overlaps(test))
                continue;
            const shop = SHOPS[shopIdx % SHOPS.length];
            shopIdx++;
            // ── Cuerpo del edificio ──────────────────────────────────────────────
            const wallColor = FACADE_PAL[Math.floor(Math.random() * FACADE_PAL.length)];
            if (!wallsByColor.has(wallColor))
                wallsByColor.set(wallColor, []);
            wallsByColor.get(wallColor).push(box(cx, cz, depth, w, wallH, 0));
            // Cara frontal del local (detrás de la vereda). Lo que da a la calle está
            // en la dirección -side (hacia xLine).
            const wallX = cx - side * depth / 2; // = xLine + side*frontDist
            // ── Vidriera de planta baja (vidrio oscuro) ──────────────────────────
            const glassW = w * 0.9;
            glassGeos.push(box(wallX - side * 0.04, cz, 0.08, glassW, 2.4, 0.2));
            // ── Toldo: proyecta sobre la vereda hacia la calle ───────────────────
            if (!awningByColor.has(shop.bg))
                awningByColor.set(shop.bg, []);
            awningByColor.get(shop.bg).push(box(wallX - side * 1.0, cz, 2.0, w * 0.94, 0.22, 2.6));
            // ── Cartel luminoso (CanvasTexture) sobre el toldo ───────────────────
            const signH = 1.3;
            const signGeo = new THREE.PlaneGeometry(glassW, signH);
            const sign = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({
                map: signTexture(shop), side: THREE.DoubleSide, toneMapped: false,
            }));
            sign.position.set(wallX - side * 0.06, 3.55, cz);
            sign.rotation.y = -side * Math.PI / 2;
            signMeshes.push(sign);
            // ── Ventanas de pisos superiores (banda de vidrio por planta) ────────
            for (let fl = 1; fl < floors; fl++) {
                const yb = fl * 3.3 + 0.9;
                glassGeos.push(box(wallX - side * 0.04, cz, 0.06, w * 0.78, 1.5, yb));
            }
            newColliders.push({
                minX: cx - depth / 2, maxX: cx + depth / 2,
                minZ: cz - w / 2, maxZ: cz + w / 2,
            });
        }
        z += w + 1.5 + Math.random() * 2.5;
    }
    // ── Commit ─────────────────────────────────────────────────────────────
    const commit = (byColor, mk) => {
        for (const [color, geos] of byColor) {
            if (!geos.length)
                continue;
            const merged = mergeGeometries(geos, false);
            if (!merged)
                continue;
            const m = new THREE.Mesh(merged, mk(color));
            m.castShadow = true;
            m.receiveShadow = true;
            scene.add(m);
        }
    };
    commit(wallsByColor, c => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
    commit(awningByColor, c => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
    if (glassGeos.length) {
        const merged = mergeGeometries(glassGeos, false);
        if (merged) {
            const m = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({
                color: 0x2c3a44, emissive: 0x101820, flatShading: true,
            }));
            scene.add(m);
        }
    }
    for (const s of signMeshes)
        scene.add(s);
    if (typeof console !== 'undefined')
        console.log(`Comercios San Martín: ${newColliders.length} locales`);
    return newColliders;
}
