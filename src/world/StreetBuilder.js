import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { asphaltMaps, concreteMaps } from './textures';
// ── Road dimensions and colours ───────────────────────────────────────────
const HALF_WIDTH = {
    motorway: 9, motorway_link: 5,
    trunk: 7, trunk_link: 4,
    primary: 6, primary_link: 3.5,
    secondary: 5, secondary_link: 3,
    tertiary: 4, tertiary_link: 2.5,
    unclassified: 3.5, residential: 3.5, living_street: 2.5, road: 3.5,
};
const ASPHALT = {
    motorway: 0x2e2e32,
    trunk: 0x303034,
    primary: 0x323236,
    secondary: 0x36363a,
    tertiary: 0x3a3a3e,
    default: 0x404045,
};
const SIDEWALK_COLOR = 0xc4bdad;
const CROSSING_COLOR = 0xffffff; // blanco de pintura vial (no se confunde con la vereda)
const CENTERLINE_COLOR = 0xe8d860;
// Ancho de vereda (m) a cada lado de la calzada. Compartido con los builders de
// edificios/comercios para que se retiren detrás de la vereda.
export const SIDEWALK_W = 3.8;
function halfWidthOf(type) { return HALF_WIDTH[type] ?? 3; }
function asphaltColor(type) {
    if (type.startsWith('motorway'))
        return ASPHALT.motorway;
    if (type.startsWith('trunk'))
        return ASPHALT.trunk;
    if (type.startsWith('primary'))
        return ASPHALT.primary;
    if (type.startsWith('secondary'))
        return ASPHALT.secondary;
    if (type.startsWith('tertiary'))
        return ASPHALT.tertiary;
    return ASPHALT.default;
}
function hasCenterline(type) {
    return type === 'primary' || type === 'primary_link' ||
        type === 'secondary' || type === 'trunk' || type === 'motorway';
}
// ── Generic offset ribbon ─────────────────────────────────────────────────
// Builds a strip following `pts`. The strip is `2*halfW` wide and offset
// `offset` metres perpendicular to the path (right side is positive offset).
function buildRibbon(pts, halfW, offset, y) {
    const n = pts.length;
    if (n < 2)
        return null;
    const positions = [];
    const indices = [];
    for (let i = 0; i < n; i++) {
        const [x, z] = pts[i];
        let dx, dz;
        if (i === 0) {
            dx = pts[1][0] - pts[0][0];
            dz = pts[1][1] - pts[0][1];
        }
        else if (i === n - 1) {
            dx = pts[n - 1][0] - pts[n - 2][0];
            dz = pts[n - 1][1] - pts[n - 2][1];
        }
        else {
            dx = pts[i + 1][0] - pts[i - 1][0];
            dz = pts[i + 1][1] - pts[i - 1][1];
        }
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) {
            if (positions.length >= 6)
                positions.push(...positions.slice(-6));
            else
                positions.push(x, y, z, x, y, z);
            continue;
        }
        const nx = -dz / len;
        const nz = dx / len;
        const cx = x + nx * offset;
        const cz = z + nz * offset;
        positions.push(cx + nx * halfW, y, cz + nz * halfW);
        positions.push(cx - nx * halfW, y, cz - nz * halfW);
    }
    for (let i = 0; i < n - 1; i++) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}
// ── Ribbon con UVs (para texturas tileadas: adoquín de Av. San Martín) ──────
function buildRibbonUV(pts, halfW, offset, y, tile) {
    const n = pts.length;
    if (n < 2)
        return null;
    const positions = [];
    const uvs = [];
    const indices = [];
    let cum = 0;
    for (let i = 0; i < n; i++) {
        const [x, z] = pts[i];
        let dx, dz;
        if (i === 0) {
            dx = pts[1][0] - pts[0][0];
            dz = pts[1][1] - pts[0][1];
        }
        else if (i === n - 1) {
            dx = pts[n - 1][0] - pts[n - 2][0];
            dz = pts[n - 1][1] - pts[n - 2][1];
        }
        else {
            dx = pts[i + 1][0] - pts[i - 1][0];
            dz = pts[i + 1][1] - pts[i - 1][1];
        }
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;
        const cx = x + nx * offset, cz = z + nz * offset;
        if (i > 0)
            cum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const v = cum / tile;
        positions.push(cx + nx * halfW, y, cz + nz * halfW);
        uvs.push(0, v);
        positions.push(cx - nx * halfW, y, cz - nz * halfW);
        uvs.push((2 * halfW) / tile, v);
    }
    for (let i = 0; i < n - 1; i++) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}
// Textura procedural de adoquín moderno (running bond), cacheada
let _cobbleTex = null;
function cobbleTexture() {
    if (_cobbleTex)
        return _cobbleTex;
    const s = 128;
    const cv = document.createElement('canvas');
    cv.width = s;
    cv.height = s;
    const c = cv.getContext('2d');
    c.fillStyle = '#5f5a54';
    c.fillRect(0, 0, s, s); // junta
    const n = 4, pw = s / n, gap = 4;
    const cols = ['#9a948a', '#8e887e', '#a39c90', '#918b81', '#9c958a', '#878176'];
    for (let r = 0; r < n; r++) {
        const off = (r % 2) * (pw / 2);
        for (let ci = -1; ci <= n; ci++) {
            c.fillStyle = cols[((r * 7 + ci * 5) % cols.length + cols.length) % cols.length];
            c.fillRect(ci * pw + off + gap / 2, r * pw + gap / 2, pw - gap, pw - gap);
        }
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    _cobbleTex = t;
    return t;
}
// ── Pedestrian crossing (zebra) at intersection ──────────────────────────
// Stripes perpendicular to a road, placed `setback` metres before the intersection.
function buildZebra(cx, cz, // intersection centre
ux, uz, // road direction unit vector (pointing AWAY from intersection)
halfW, // road half-width
out, idx, yBase) {
    const SETBACK = halfW + 0.6; // distance from intersection centre
    const STRIPE_W = 0.45; // stripe width along road direction
    const STRIPE_GAP = 0.45;
    const STRIPES = 5;
    const LONG = halfW * 1.02; // media-longitud: la cebra cubre la calzada (no pisa la vereda)
    const totalLen = STRIPES * STRIPE_W + (STRIPES - 1) * STRIPE_GAP;
    // perpendicular = (-uz, ux)
    const px = -uz, pz = ux;
    // Centre of zebra patch
    const x0 = cx + ux * SETBACK + ux * (totalLen / 2 + STRIPE_W / 2);
    const z0 = cz + uz * SETBACK + uz * (totalLen / 2 + STRIPE_W / 2);
    for (let s = 0; s < STRIPES; s++) {
        const t = -totalLen / 2 + s * (STRIPE_W + STRIPE_GAP);
        const sx = x0 + ux * t;
        const sz = z0 + uz * t;
        const hL = STRIPE_W / 2;
        const hP = LONG;
        // Four corners
        const ax = sx + ux * hL + px * hP;
        const az = sz + uz * hL + pz * hP;
        const bx = sx - ux * hL + px * hP;
        const bz = sz - uz * hL + pz * hP;
        const ccx = sx - ux * hL - px * hP;
        const ccz = sz - uz * hL - pz * hP;
        const dx = sx + ux * hL - px * hP;
        const dz = sz + uz * hL - pz * hP;
        const base = out.length / 3;
        out.push(ax, yBase, az);
        out.push(bx, yBase, bz);
        out.push(ccx, yBase, ccz);
        out.push(dx, yBase, dz);
        idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
}
// ── Main builder ──────────────────────────────────────────────────────────
export function buildStreets(scene, ways, nodeMap, proj) {
    // Count node usage to detect intersections, and track the widest road through
    // each node (so the sidewalk can retreat past the crossing carriageway).
    const usage = new Map();
    const maxHw = new Map();
    for (const w of ways) {
        const whw = halfWidthOf(w.tags.highway ?? '');
        for (const nid of w.nodes) {
            usage.set(nid, (usage.get(nid) ?? 0) + 1);
            maxHw.set(nid, Math.max(maxHw.get(nid) ?? 0, whw));
        }
    }
    const asphaltByColor = new Map();
    const sidewalkGeos = [];
    const centerlineGeos = [];
    const cobbleGeos = [];
    const zebraPos = [];
    const zebraIdx = [];
    const curbGeos = [];
    for (const way of ways) {
        const type = way.tags.highway;
        if (!type)
            continue;
        const pts = [];
        for (const nid of way.nodes) {
            const node = nodeMap.get(nid);
            if (node)
                pts.push(proj.project(node.lat, node.lon));
        }
        if (pts.length < 2)
            continue;
        const hw = halfWidthOf(type);
        const isOneway = way.tags.oneway === 'yes' || way.tags.oneway === '-1';
        // ── Calzada: adoquín en Av. San Martín, asfalto en el resto ─────────────
        const isCobble = way.tags.name === 'Avenida San Martín';
        if (isCobble) {
            const cob = buildRibbonUV(pts, hw, 0, 0.042, 2.6);
            if (cob)
                cobbleGeos.push(cob);
        }
        else {
            const asphaltGeo = buildRibbonUV(pts, hw, 0, 0.04, 6);
            if (!asphaltGeo)
                continue;
            const color = asphaltColor(type);
            if (!asphaltByColor.has(color))
                asphaltByColor.set(color, []);
            asphaltByColor.get(color).push(asphaltGeo);
        }
        // ── Sidewalks (one per side) ──────────────────────────────────────────
        // Skip on oneway roads — they're usually one half of a divided carriageway
        // (Mendoza has many), and rendering sidewalks on both sides creates the
        // ugly "sidewalk strip down the middle" of the avenue.
        //
        // Construir POR TRAMO y retroceder en cada esquina: la vereda nunca debe
        // cruzar la calzada perpendicular. En cada nodo-intersección se corta a
        // (ancho de la calle más ancha del cruce + margen) para dejar el asfalto
        // libre; el hueco de la esquina lo cubre el parche de bocacalle.
        if (hw >= 2.5 && !isOneway) {
            for (let i = 0; i < pts.length - 1; i++) {
                const [ax, az] = pts[i];
                const [bx, bz] = pts[i + 1];
                const dx = bx - ax, dz = bz - az;
                const L = Math.hypot(dx, dz);
                if (L < 0.5)
                    continue;
                const ux = dx / L, uz = dz / L;
                const aInt = (usage.get(way.nodes[i]) ?? 0) >= 2;
                const bInt = (usage.get(way.nodes[i + 1]) ?? 0) >= 2;
                const t0 = aInt ? (maxHw.get(way.nodes[i]) ?? hw) + 1.2 : 0;
                const t1 = bInt ? L - ((maxHw.get(way.nodes[i + 1]) ?? hw) + 1.2) : L;
                if (t1 - t0 < 1)
                    continue;
                const seg = [
                    [ax + ux * t0, az + uz * t0],
                    [ax + ux * t1, az + uz * t1],
                ];
                const right = buildRibbonUV(seg, SIDEWALK_W / 2, hw + SIDEWALK_W / 2, 0.12, 2.5);
                const left = buildRibbonUV(seg, SIDEWALK_W / 2, -hw - SIDEWALK_W / 2, 0.12, 2.5);
                if (right)
                    sidewalkGeos.push(right);
                if (left)
                    sidewalkGeos.push(left);
                // Cordón (curb): franja angosta y un poco más alta en el borde de calzada
                const cR = buildRibbon(seg, 0.18, hw + 0.18, 0.17);
                const cL = buildRibbon(seg, 0.18, -hw - 0.18, 0.17);
                if (cR)
                    curbGeos.push(cR);
                if (cL)
                    curbGeos.push(cL);
            }
        }
        // ── Yellow centre line on avenues (no en la calzada de adoquín) ────────
        if (hasCenterline(type) && !isCobble) {
            const centre = buildRibbon(pts, 0.12, 0, 0.046);
            if (centre)
                centerlineGeos.push(centre);
        }
        // ── Zebra crossings en CADA intersección que la calle atraviesa ────────
        // En la grilla, los cruces son nodos INTERIORES del camino (la calle pasa a
        // través de la esquina), no sus extremos. Hay que recorrer todos los nodos y
        // poner una senda en cada brazo que sale del cruce.
        if (hw >= 3) {
            for (let i = 0; i < pts.length; i++) {
                if ((usage.get(way.nodes[i]) ?? 0) < 2)
                    continue; // sólo cruces reales
                const [x, z] = pts[i];
                if (i + 1 < pts.length) {
                    const dx = pts[i + 1][0] - x, dz = pts[i + 1][1] - z;
                    const L = Math.hypot(dx, dz);
                    if (L > 4)
                        buildZebra(x, z, dx / L, dz / L, hw, zebraPos, zebraIdx, 0.11);
                }
                if (i - 1 >= 0) {
                    const dx = pts[i - 1][0] - x, dz = pts[i - 1][1] - z;
                    const L = Math.hypot(dx, dz);
                    if (L > 4)
                        buildZebra(x, z, dx / L, dz / L, hw, zebraPos, zebraIdx, 0.11);
                }
            }
        }
    }
    // ── Commit ────────────────────────────────────────────────────────────────
    const commit = (geos, color, y_emit = false) => {
        if (!geos.length)
            return;
        const merged = mergeGeometries(geos, false);
        if (!merged)
            return;
        const mat = new THREE.MeshLambertMaterial({
            color,
            side: THREE.FrontSide,
            emissive: y_emit ? new THREE.Color(color) : new THREE.Color(0),
            emissiveIntensity: y_emit ? 0.15 : 0,
        });
        const mesh = new THREE.Mesh(merged, mat);
        mesh.receiveShadow = true;
        scene.add(mesh);
    };
    // Asfalto con grano (textura + normal map)
    {
        const asph = asphaltMaps();
        for (const [color, geos] of asphaltByColor) {
            const merged = mergeGeometries(geos, false);
            if (!merged)
                continue;
            const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
                color, map: asph.map, normalMap: asph.normalMap,
                normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.97, metalness: 0,
            }));
            mesh.receiveShadow = true;
            scene.add(mesh);
        }
    }
    // Veredas de baldosa (textura + normal map)
    if (sidewalkGeos.length) {
        const conc = concreteMaps();
        const merged = mergeGeometries(sidewalkGeos, false);
        if (merged) {
            const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
                color: SIDEWALK_COLOR, map: conc.map, normalMap: conc.normalMap,
                normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, metalness: 0,
            }));
            mesh.receiveShadow = true;
            scene.add(mesh);
        }
    }
    commit(curbGeos, 0x8f8a7e);
    commit(centerlineGeos, CENTERLINE_COLOR, true);
    // Av. San Martín: calzada de adoquín moderno (textura tileada)
    if (cobbleGeos.length) {
        const merged = mergeGeometries(cobbleGeos, false);
        if (merged) {
            const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ map: cobbleTexture() }));
            mesh.receiveShadow = true;
            scene.add(mesh);
        }
    }
    // Zebra crossings
    if (zebraPos.length > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(zebraPos, 3));
        geo.setIndex(zebraIdx);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
            color: CROSSING_COLOR, side: THREE.DoubleSide,
            emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.25,
        }));
        mesh.receiveShadow = true;
        scene.add(mesh);
    }
}
