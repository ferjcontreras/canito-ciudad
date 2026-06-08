import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SIDEWALK_W } from './StreetBuilder';
const HOUSE_PAL = [0xf0e6cf, 0xe8d8b8, 0xd8c4a0, 0xefdbb8, 0xead0a8, 0xc8b090, 0xd9bf95, 0xe6cda4, 0xc4a888, 0xbfa280];
const ROOF_PAL = [0xa64020, 0xb04828, 0x983828, 0xa84830, 0xc05030, 0x8c3818, 0x9c3c1c, 0xb04c2c];
const PARAPET_PAL = [0xc0b4a0, 0xb8ac98, 0xa89e8c, 0xb0a48c];
// Mid-rise / tower facades — muted urban tones (cream, grey, stone, slate)
const BUILDING_PAL = [0xd6d2c6, 0xc2c6cc, 0xb0b6bd, 0xd8cfbe, 0xc8bca8, 0xaeb4b2, 0x9fa7af, 0xe0ddd2, 0xb8ae9c, 0xc4ccd2];
const GLASS_COLOR = 0x2c3a44; // dark window glass
const LIT_COLOR = 0xffe2a8; // a lit window at dusk
// Roads where we drop procedural infill buildings. Incluye las avenidas
// (primary/secondary) para que las cuadras de Mitre, España, Belgrano, Las
// Heras, etc. no queden vacías.
const INFILL_ROADS = new Set([
    'residential', 'unclassified', 'living_street',
    'tertiary', 'tertiary_link', 'road',
    'primary', 'primary_link', 'secondary', 'secondary_link',
]);
const HW_FOR_INFILL = {
    residential: 3.5, unclassified: 3.5, living_street: 2.5,
    tertiary: 4, tertiary_link: 2.5, road: 3.5,
    primary: 6, primary_link: 3.5, secondary: 5, secondary_link: 3,
};
// Calles con tratamiento propio (no reciben relleno genérico)
const INFILL_SKIP_NAMES = new Set(['Avenida San Martín']);
// ── Spatial grid for fast overlap queries ────────────────────────────────
class SpatialGrid {
    cellSize;
    grid = new Map();
    constructor(cellSize = 18) { this.cellSize = cellSize; }
    key(ix, iz) { return ix + ',' + iz; }
    insert(ab) {
        const ix0 = Math.floor(ab.minX / this.cellSize);
        const ix1 = Math.floor(ab.maxX / this.cellSize);
        const iz0 = Math.floor(ab.minZ / this.cellSize);
        const iz1 = Math.floor(ab.maxZ / this.cellSize);
        for (let ix = ix0; ix <= ix1; ix++) {
            for (let iz = iz0; iz <= iz1; iz++) {
                const k = this.key(ix, iz);
                let bucket = this.grid.get(k);
                if (!bucket) {
                    bucket = [];
                    this.grid.set(k, bucket);
                }
                bucket.push(ab);
            }
        }
    }
    overlapsAABB(test) {
        const ix0 = Math.floor(test.minX / this.cellSize);
        const ix1 = Math.floor(test.maxX / this.cellSize);
        const iz0 = Math.floor(test.minZ / this.cellSize);
        const iz1 = Math.floor(test.maxZ / this.cellSize);
        for (let ix = ix0; ix <= ix1; ix++) {
            for (let iz = iz0; iz <= iz1; iz++) {
                const bucket = this.grid.get(this.key(ix, iz));
                if (!bucket)
                    continue;
                for (const ab of bucket) {
                    if (ab.minX < test.maxX && ab.maxX > test.minX &&
                        ab.minZ < test.maxZ && ab.maxZ > test.minZ)
                        return true;
                }
            }
        }
        return false;
    }
}
// ── House geometry helpers (rotation-aware) ──────────────────────────────
function makeBox(cx, cz, w, d, h, yBase, ang) {
    // BoxGeometry centred at origin spanning w × h × d.
    const g = new THREE.BoxGeometry(w, h, d);
    // Drop the bottom face (we won't see it) — leave it for simplicity.
    g.rotateY(ang);
    g.translate(cx, yBase + h / 2, cz);
    return g;
}
function makeGabledRoof(cx, cz, w, d, wallH, ang) {
    // Build in local coords (centred at origin, axis-aligned), then rotate+translate
    // Ridge runs along X (the long axis if w >= d, else swap by setting ridgeAlongX=false)
    const ridgeAlongX = w >= d;
    const ridgeH = wallH + Math.min(w, d) * 0.35;
    const halfW = w / 2;
    const halfD = d / 2;
    const positions = [];
    const indices = [];
    if (ridgeAlongX) {
        // 0:A(-w,wH,-d) 1:B(+w,wH,-d) 2:C(+w,wH,+d) 3:D(-w,wH,+d)
        // 4:R1(-w,rH,0) 5:R2(+w,rH,0)
        positions.push(-halfW, wallH, -halfD, halfW, wallH, -halfD, halfW, wallH, halfD, -halfW, wallH, halfD, -halfW, ridgeH, 0, halfW, ridgeH, 0);
        indices.push(0, 4, 5, 0, 5, 1); // front slope
        indices.push(3, 5, 4, 3, 2, 5); // back slope
        indices.push(0, 3, 4); // left gable
        indices.push(1, 5, 2); // right gable
    }
    else {
        positions.push(-halfW, wallH, -halfD, halfW, wallH, -halfD, halfW, wallH, halfD, -halfW, wallH, halfD, 0, ridgeH, -halfD, 0, ridgeH, halfD);
        indices.push(0, 3, 5, 0, 5, 4);
        indices.push(1, 4, 5, 1, 5, 2);
        indices.push(0, 4, 1);
        indices.push(3, 2, 5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.rotateY(ang);
    geo.translate(cx, 0, cz);
    return geo;
}
// Road half-widths (mirror StreetBuilder)
const ROAD_HW = {
    motorway: 9, motorway_link: 5,
    trunk: 7, trunk_link: 4,
    primary: 6, primary_link: 3.5,
    secondary: 5, secondary_link: 3,
    tertiary: 4, tertiary_link: 2.5,
    unclassified: 3.5, residential: 3.5, living_street: 2.5, road: 3.5,
};
// Build no-build zones from road segment AABBs (road + sidewalk + small buffer)
function roadNoBuildZones(streets, nodeMap, proj) {
    const zones = [];
    for (const way of streets) {
        const type = way.tags.highway;
        if (!type)
            continue;
        const hw = (ROAD_HW[type] ?? 3.5) + 3.0; // road half + sidewalk + buffer
        let prev = null;
        for (const nid of way.nodes) {
            const n = nodeMap.get(nid);
            if (!n)
                continue;
            const p = proj.project(n.lat, n.lon);
            if (prev) {
                const minX = Math.min(prev[0], p[0]) - hw;
                const maxX = Math.max(prev[0], p[0]) + hw;
                const minZ = Math.min(prev[1], p[1]) - hw;
                const maxZ = Math.max(prev[1], p[1]) + hw;
                zones.push({ minX, maxX, minZ, maxZ });
            }
            prev = p;
        }
    }
    return zones;
}
// ── Main infill builder ──────────────────────────────────────────────────
export function buildInfillHouses(scene, streets, nodeMap, proj, existingColliders, extraNoBuild = []) {
    const grid = new SpatialGrid(20);
    for (const ab of existingColliders)
        grid.insert(ab);
    // No-build zones for roads (so infill never falls on asphalt)
    for (const ab of roadNoBuildZones(streets, nodeMap, proj))
        grid.insert(ab);
    // Caller-supplied no-build zones (avenue corridor, plaza, etc.)
    for (const ab of extraNoBuild)
        grid.insert(ab);
    const wallsByColor = new Map();
    const roofsByColor = new Map();
    const parapetByColor = new Map();
    const glassGeos = [];
    const litGeos = [];
    const newColliders = [];
    // Window grids on the four façades, split into plain glass and a few lit ones.
    const addWindows = (cx, cz, ang, W, D, wallH, floors, litProb) => {
        const floorH = wallH / floors;
        const wh = Math.min(1.6, floorH * 0.55);
        const T = 0.1;
        const c = Math.cos(ang), s = Math.sin(ang);
        const l2w = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
        const halfW = W / 2, halfD = D / 2;
        const faces = [
            { alongX: true, perp: halfD, len: W },
            { alongX: true, perp: -halfD, len: W },
            { alongX: false, perp: halfW, len: D },
            { alongX: false, perp: -halfW, len: D },
        ];
        for (const f of faces) {
            const cols = Math.max(1, Math.floor(f.len / 2.6));
            const ww = (f.len / cols) * 0.55;
            const pad = Math.sign(f.perp) * 0.06;
            for (let fl = 0; fl < floors; fl++) {
                const yb = fl * floorH + floorH * 0.24;
                for (let ci = 0; ci < cols; ci++) {
                    const along = -f.len / 2 + (ci + 0.5) * (f.len / cols);
                    const [wx, wz] = f.alongX ? l2w(along, f.perp + pad) : l2w(f.perp + pad, along);
                    const g = makeBox(wx, wz, f.alongX ? ww : T, f.alongX ? T : ww, wh, yb, ang);
                    (Math.random() < litProb ? litGeos : glassGeos).push(g);
                }
            }
        }
    };
    // Los edificios se retiran justo detrás de la vereda (cordón + ancho de
    // vereda) para que haya una vereda clara entre la fachada y la calzada.
    const SETBACK_FROM_ROAD = SIDEWALK_W + 0.6; // metres beyond the kerb
    const SPACING = 8; // metres between candidate sites (fachada continua)
    const HOUSE_PROB = 0.92; // probability of placing if site is clear
    // Filas hacia el interior de la manzana, para que no queden patios vacíos.
    const ROW_GAP = 2.5; // separación entre filas
    const BACKROW_PROBS = [0.85, 0.5]; // prob. de 2ª y 3ª fila
    // Zona de casas: Av. Emilio Civit (z≈0) llegando a los Portones (oeste).
    // Sólo aquí aparecen casas bajas; el resto de la ciudad son edificios.
    const inCivitHouseZone = (cx, cz) => cx < -430 && cx > -890 && Math.abs(cz) < 70;
    let nPlaced = 0;
    for (const way of streets) {
        const type = way.tags.highway;
        if (!type || !INFILL_ROADS.has(type))
            continue;
        if (way.tags.name && INFILL_SKIP_NAMES.has(way.tags.name))
            continue;
        const hw = (HW_FOR_INFILL[type] ?? 3.5) + SETBACK_FROM_ROAD;
        const pts = [];
        for (const nid of way.nodes) {
            const n = nodeMap.get(nid);
            if (n)
                pts.push(proj.project(n.lat, n.lon));
        }
        if (pts.length < 2)
            continue;
        let debt = SPACING * Math.random();
        for (let i = 0; i < pts.length - 1; i++) {
            const [x0, z0] = pts[i];
            const [x1, z1] = pts[i + 1];
            const dx = x1 - x0, dz = z1 - z0;
            const L = Math.hypot(dx, dz);
            if (L < 0.5)
                continue;
            const udx = dx / L, udz = dz / L;
            const nx = -udz, nz = udx;
            const ang = Math.atan2(udz, udx);
            while (debt <= L) {
                const sx = x0 + udx * debt;
                const sz = z0 + udz * debt;
                for (const side of [+1, -1]) {
                    if (Math.random() > HOUSE_PROB)
                        continue;
                    // tryPlace: coloca un edificio cuya cara más cercana a la calle queda
                    // a `baseOff` metros del eje (dirección perpendicular `side`).
                    // Devuelve la distancia de su cara lejana (para encadenar otra fila
                    // hacia el interior de la manzana) o null si no entró.
                    const tryPlace = (baseOff, allowHouse) => {
                        // ── Tipo de construcción ───────────────────────────────────────
                        // Ciudad: casi todo edificios. Casas SÓLO en Emilio Civit (oeste).
                        const cxEst = sx + nx * (baseOff + 6) * side;
                        const czEst = sz + nz * (baseOff + 6) * side;
                        const houseZone = allowHouse && inCivitHouseZone(cxEst, czEst);
                        const kr = Math.random();
                        let kind;
                        if (houseZone) {
                            kind = kr < 0.72 ? 'house' : 'low';
                        }
                        else {
                            kind = kr < 0.10 ? 'low' : kr < 0.62 ? 'mid' : 'tower';
                        }
                        const isHouse = kind === 'house';
                        let houseW, houseD, floors, wallH;
                        if (kind === 'house') {
                            houseW = 7.5 + Math.random() * 3;
                            houseD = 6.5 + Math.random() * 3;
                            floors = Math.random() < 0.5 ? 1 : 2;
                            wallH = floors * 2.9 + 0.3;
                        }
                        else if (kind === 'low') {
                            houseW = 9 + Math.random() * 4;
                            houseD = 8 + Math.random() * 3;
                            floors = 2 + Math.floor(Math.random() * 2); // 2–3 plantas
                            wallH = floors * 3.1;
                        }
                        else if (kind === 'mid') {
                            houseW = 10 + Math.random() * 6;
                            houseD = 9 + Math.random() * 4;
                            floors = 4 + Math.floor(Math.random() * 4); // 4–7 plantas
                            wallH = floors * 3.1;
                        }
                        else {
                            houseW = 9 + Math.random() * 4;
                            houseD = 9 + Math.random() * 4;
                            floors = 8 + Math.floor(Math.random() * 7); // 8–14 plantas
                            wallH = floors * 3.2;
                        }
                        const wallColor = isHouse
                            ? HOUSE_PAL[Math.floor(Math.random() * HOUSE_PAL.length)]
                            : BUILDING_PAL[Math.floor(Math.random() * BUILDING_PAL.length)];
                        // Centro a la distancia perpendicular (baseOff + houseD/2)
                        const off = baseOff + houseD / 2;
                        const cx = sx + nx * off * side;
                        const cz = sz + nz * off * side;
                        // AABB en mundo (a partir de las esquinas rotadas)
                        const corners = [];
                        const halfW = houseW / 2, halfD = houseD / 2;
                        for (const [lx, lz] of [[+halfW, +halfD], [-halfW, +halfD], [+halfW, -halfD], [-halfW, -halfD]]) {
                            const c = Math.cos(ang), s = Math.sin(ang);
                            corners.push([cx + lx * c - lz * s, cz + lx * s + lz * c]);
                        }
                        let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;
                        for (const [px, pz] of corners) {
                            if (px < mnX)
                                mnX = px;
                            if (px > mxX)
                                mxX = px;
                            if (pz < mnZ)
                                mnZ = pz;
                            if (pz > mxZ)
                                mxZ = pz;
                        }
                        const test = {
                            minX: mnX - 1.2, maxX: mxX + 1.2,
                            minZ: mnZ - 1.2, maxZ: mxZ + 1.2,
                        };
                        if (grid.overlapsAABB(test))
                            return null;
                        // ── Walls ──────────────────────────────────────────────────────
                        const wallGeo = makeBox(cx, cz, houseW, houseD, wallH, 0, ang);
                        if (!wallsByColor.has(wallColor))
                            wallsByColor.set(wallColor, []);
                        wallsByColor.get(wallColor).push(wallGeo);
                        if (isHouse) {
                            const roofColor = ROOF_PAL[Math.floor(Math.random() * ROOF_PAL.length)];
                            const roofGeo = makeGabledRoof(cx, cz, houseW, houseD, wallH, ang);
                            if (!roofsByColor.has(roofColor))
                                roofsByColor.set(roofColor, []);
                            roofsByColor.get(roofColor).push(roofGeo);
                        }
                        else {
                            // Flat roof with parapet (4 thin box edges in local frame)
                            const pColor = PARAPET_PAL[Math.floor(Math.random() * PARAPET_PAL.length)];
                            if (!parapetByColor.has(pColor))
                                parapetByColor.set(pColor, []);
                            const edges = parapetByColor.get(pColor);
                            const ph = 0.45, pw = 0.22;
                            const c = Math.cos(ang), s = Math.sin(ang);
                            const l2w = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
                            {
                                const [wx, wz] = l2w(0, halfD);
                                edges.push(makeBox(wx, wz, houseW + pw, pw, ph, wallH, ang));
                            }
                            {
                                const [wx, wz] = l2w(0, -halfD);
                                edges.push(makeBox(wx, wz, houseW + pw, pw, ph, wallH, ang));
                            }
                            {
                                const [wx, wz] = l2w(halfW, 0);
                                edges.push(makeBox(wx, wz, pw, houseD + pw, ph, wallH, ang));
                            }
                            {
                                const [wx, wz] = l2w(-halfW, 0);
                                edges.push(makeBox(wx, wz, pw, houseD + pw, ph, wallH, ang));
                            }
                        }
                        // ── Windows (grid of glass panes, a few lit at dusk) ───────────
                        addWindows(cx, cz, ang, houseW, houseD, wallH, floors, isHouse ? 0.1 : 0.18);
                        const collider = { minX: mnX, maxX: mxX, minZ: mnZ, maxZ: mxZ };
                        grid.insert(collider);
                        newColliders.push(collider);
                        nPlaced++;
                        return baseOff + houseD; // cara lejana
                    };
                    // Fila de frente + filas hacia el interior de la manzana
                    let far = tryPlace(hw, true);
                    for (const prob of BACKROW_PROBS) {
                        if (far === null || Math.random() > prob)
                            break;
                        far = tryPlace(far + ROW_GAP, false);
                    }
                }
                debt += SPACING + (Math.random() - 0.5) * 3;
            }
            debt -= L;
        }
    }
    // Commit meshes
    const commit = (byColor, castShadow = true) => {
        for (const [color, geos] of byColor) {
            if (!geos.length)
                continue;
            const merged = mergeGeometries(geos, false);
            if (!merged)
                continue;
            const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color, flatShading: true }));
            mesh.castShadow = castShadow;
            mesh.receiveShadow = true;
            scene.add(mesh);
        }
    };
    commit(wallsByColor);
    commit(roofsByColor);
    commit(parapetByColor);
    // Windows: dark glass + a few warm-lit panes (no shadow — they're flush)
    const commitFlat = (geos, mat) => {
        if (!geos.length)
            return;
        const merged = mergeGeometries(geos, false);
        if (!merged)
            return;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        scene.add(mesh);
    };
    commitFlat(glassGeos, new THREE.MeshLambertMaterial({ color: GLASS_COLOR, flatShading: true }));
    commitFlat(litGeos, new THREE.MeshLambertMaterial({
        color: LIT_COLOR, emissive: 0xffb454, emissiveIntensity: 0.85, flatShading: true,
    }));
    if (typeof console !== 'undefined')
        console.log(`Infill: ${nPlaced} houses placed`);
    return newColliders;
}
