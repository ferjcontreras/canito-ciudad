import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// ── Palettes by semantic type ──────────────────────────────────────────────
// Mendoza palette: warm sand, cream, ochre, with occasional cool tones
const PAL_RESIDENTIAL = [0xe8dcc4, 0xdac6a8, 0xc8b89a, 0xead8b6, 0xd6c19a, 0xc2a888, 0xe5d2b0, 0xb89878];
const PAL_HOUSE = [0xf0e6cf, 0xe8d8b8, 0xd8c4a0, 0xefdbb8, 0xead0a8, 0xc8b090, 0xd9bf95, 0xe6cda4];
const PAL_COMMERCIAL = [0xa8b4bc, 0x98a8b4, 0x8898a8, 0xc0ccd4, 0x9eb0c0, 0xbac4cc, 0xa8b8c4];
const PAL_RELIGIOUS = [0xf0ece4, 0xe8e2d8, 0xfaf6ee, 0xe4ddd0, 0xede8e0, 0xf5f0e8];
const PAL_INDUSTRIAL = [0x98988c, 0x8c8c82, 0xa0a094, 0x90908a, 0xa8a89c, 0xb0b0a4];
const PAL_DEFAULT = [0xd6c9b4, 0xcbbea8, 0xc2b49c, 0xd4c8b0, 0xbcaf9c, 0xcfc3af];
// Terracotta tile palette for sloped roofs
const PAL_ROOF_TILE = [0xa64020, 0xb04828, 0x983828, 0xa84830, 0xc05030, 0x8c3818];
function pickColor(palette, id) {
    return palette[Math.abs(id) % palette.length];
}
function paletteFor(tags) {
    const t = tags.building;
    if (!t)
        return PAL_DEFAULT;
    if (t === 'church' || t === 'cathedral' || t === 'chapel' || t === 'temple')
        return PAL_RELIGIOUS;
    if (t === 'industrial' || t === 'warehouse' || t === 'factory')
        return PAL_INDUSTRIAL;
    if (t === 'commercial' || t === 'retail' || t === 'office' || t === 'hotel')
        return PAL_COMMERCIAL;
    if (t === 'house' || t === 'detached' || t === 'semidetached_house' || t === 'bungalow')
        return PAL_HOUSE;
    if (t === 'residential' || t === 'apartments')
        return PAL_RESIDENTIAL;
    return PAL_DEFAULT;
}
// ── Height helpers ─────────────────────────────────────────────────────────
function buildingHeight(tags) {
    const h = parseFloat(tags['building:height'] ?? tags['height'] ?? '');
    if (Number.isFinite(h) && h > 0)
        return h;
    const lv = parseInt(tags['building:levels'] ?? tags['levels'] ?? '', 10);
    if (Number.isFinite(lv) && lv > 0)
        return lv * 3.2;
    const t = tags.building;
    if (t === 'apartments')
        return 5 * 3.2;
    if (t === 'house' || t === 'detached' || t === 'semidetached_house')
        return 2 * 3.2;
    if (t === 'residential')
        return 4 * 3.2;
    if (t === 'commercial' || t === 'retail')
        return 3 * 3.2;
    if (t === 'office' || t === 'hotel')
        return 6 * 3.2;
    if (t === 'industrial' || t === 'warehouse')
        return 2 * 3.2;
    if (t === 'church' || t === 'cathedral')
        return 10 * 3.2;
    return 3 * 3.2;
}
function wantsGabledRoof(tags) {
    const t = tags.building;
    if (!t)
        return false;
    return (t === 'house' || t === 'detached' || t === 'semidetached_house' ||
        t === 'bungalow' || t === 'cabin' || t === 'farm');
}
// ── Wall extrusion ─────────────────────────────────────────────────────────
function extrudeWalls(ring, height) {
    if (ring.length < 3)
        return null;
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i];
        const [x1, z1] = ring[(i + 1) % ring.length];
        area += x0 * z1 - x1 * z0;
    }
    if (Math.abs(area) < 1)
        return null;
    const shape = new THREE.Shape();
    shape.moveTo(ring[0][0], -ring[0][1]);
    for (let i = 1; i < ring.length; i++)
        shape.lineTo(ring[i][0], -ring[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
}
// ── Flat roof parapet ──────────────────────────────────────────────────────
function buildParapet(ring, wallH) {
    const ph = 0.5; // parapet height
    const pw = 0.25; // parapet width
    const geos = [];
    for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i];
        const [x1, z1] = ring[(i + 1) % ring.length];
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 0.1)
            continue;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const ang = Math.atan2(z1 - z0, x1 - x0);
        const box = new THREE.BoxGeometry(len + pw, ph, pw);
        box.rotateY(-ang);
        box.translate(cx, wallH + ph / 2, cz);
        geos.push(box);
    }
    if (geos.length === 0) {
        const dummy = new THREE.BufferGeometry();
        dummy.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        return dummy;
    }
    return mergeGeometries(geos, false) ?? geos[0];
}
// ── Gabled roof (simple ridge) ─────────────────────────────────────────────
function buildGabledRoof(ring, wallH) {
    // Compute AABB of footprint
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of ring) {
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (z < minZ)
            minZ = z;
        if (z > maxZ)
            maxZ = z;
    }
    const w = maxX - minX;
    const d = maxZ - minZ;
    if (w < 1 || d < 1)
        return null;
    const ridgeH = wallH + Math.min(w, d) * 0.4;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const positions = [];
    const indices = [];
    // 4 eave corners (base of roof, at wallH) + 2 ridge points
    if (w >= d) {
        // Ridge runs along X (two ridge points at minX and maxX, centred in Z)
        // 0:A(minX,wallH,minZ) 1:B(maxX,wallH,minZ) 2:C(maxX,wallH,maxZ) 3:D(minX,wallH,maxZ)
        // 4:R1(minX,ridgeH,cz)  5:R2(maxX,ridgeH,cz)
        positions.push(minX, wallH, minZ, // 0
        maxX, wallH, minZ, // 1
        maxX, wallH, maxZ, // 2
        minX, wallH, maxZ, // 3
        minX, ridgeH, cz, // 4
        maxX, ridgeH, cz);
        // Front slope  (Z- face): A,R1,R2 + A,R2,B
        indices.push(0, 4, 5, 0, 5, 1);
        // Back slope   (Z+ face): D,R2,R1 + D,C,R2
        indices.push(3, 5, 4, 3, 2, 5);
        // Left gable   (X- face): A,D,R1
        indices.push(0, 3, 4);
        // Right gable  (X+ face): B,R2,C
        indices.push(1, 5, 2);
    }
    else {
        // Ridge runs along Z
        // 0:A 1:B 2:C 3:D same corners; 4:R1(cx,ridgeH,minZ) 5:R2(cx,ridgeH,maxZ)
        positions.push(minX, wallH, minZ, // 0
        maxX, wallH, minZ, // 1
        maxX, wallH, maxZ, // 2
        minX, wallH, maxZ, // 3
        cx, ridgeH, minZ, // 4
        cx, ridgeH, maxZ);
        // Left slope  (X- face): A,D,R2 + A,R2,R1
        indices.push(0, 3, 5, 0, 5, 4);
        // Right slope (X+ face): B,R1,R2 + B,R2,C
        indices.push(1, 4, 5, 1, 5, 2);
        // Front gable (Z- face): A,R1,B
        indices.push(0, 4, 1);
        // Back gable  (Z+ face): D,C,R2
        indices.push(3, 2, 5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}
// ── AABB from ring ─────────────────────────────────────────────────────────
function ringAABB(ring) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of ring) {
        if (x < minX)
            minX = x;
        if (x > maxX)
            maxX = x;
        if (z < minZ)
            minZ = z;
        if (z > maxZ)
            maxZ = z;
    }
    return { minX, maxX, minZ, maxZ };
}
// ── Main export ────────────────────────────────────────────────────────────
export function buildBuildings(scene, ways, nodeMap, proj) {
    // Accumulate geometries per color for walls, parapets, roofs
    const wallGeos = new Map();
    const parapetGeos = new Map();
    const roofGeos = new Map();
    const colliders = [];
    const addTo = (map, color, geo) => {
        if (!map.has(color))
            map.set(color, []);
        map.get(color).push(geo);
    };
    for (const way of ways) {
        if (!way.tags.building)
            continue;
        const nodes = [];
        for (const nid of way.nodes) {
            const n = nodeMap.get(nid);
            if (n)
                nodes.push(n);
        }
        if (nodes.length < 3)
            continue;
        const pts = nodes.map(n => proj.project(n.lat, n.lon));
        const first = pts[0], last = pts[pts.length - 1];
        const closed = Math.abs(last[0] - first[0]) < 0.1 && Math.abs(last[1] - first[1]) < 0.1;
        const ring = closed ? pts.slice(0, -1) : pts;
        if (ring.length < 3)
            continue;
        // Deterministic height variation ±15% based on way id so the skyline varies
        const baseH = buildingHeight(way.tags);
        const varStep = (Math.abs(way.id) % 5) - 2; // -2..+2
        const height = baseH * (1 + varStep * 0.08);
        const pal = paletteFor(way.tags);
        const wallColor = pickColor(pal, way.id);
        // Walls
        const wallGeo = extrudeWalls(ring, height);
        if (!wallGeo)
            continue;
        addTo(wallGeos, wallColor, wallGeo);
        colliders.push(ringAABB(ring));
        const gabled = wantsGabledRoof(way.tags);
        if (gabled) {
            const roofGeo = buildGabledRoof(ring, height);
            if (roofGeo) {
                const roofColor = pickColor(PAL_ROOF_TILE, way.id);
                addTo(roofGeos, roofColor, roofGeo);
            }
        }
        else {
            // Flat roof: parapet in same color, slightly darker
            const parapetGeo = buildParapet(ring, height);
            const parapetColor = Math.max(0, wallColor - 0x101008);
            addTo(parapetGeos, parapetColor, parapetGeo);
        }
    }
    // ── Commit wall meshes ────────────────────────────────────────────────────
    for (const [color, geos] of wallGeos) {
        if (!geos.length)
            continue;
        const merged = mergeGeometries(geos, false);
        if (!merged)
            continue;
        const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color, flatShading: true }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    }
    // ── Commit parapet meshes ─────────────────────────────────────────────────
    for (const [color, geos] of parapetGeos) {
        if (!geos.length)
            continue;
        const merged = mergeGeometries(geos, false);
        if (!merged)
            continue;
        const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color, flatShading: true }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    }
    // ── Commit roof meshes ────────────────────────────────────────────────────
    for (const [color, geos] of roofGeos) {
        if (!geos.length)
            continue;
        const merged = mergeGeometries(geos, false);
        if (!merged)
            continue;
        const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color, flatShading: true }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    }
    return colliders;
}
