const ORIGIN = { lat: -32.8895, lon: -68.8458 };
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = Math.cos(ORIGIN.lat * Math.PI / 180) * 111_320;
function worldToLatLon(x, z) {
    return [
        ORIGIN.lat - z / M_PER_DEG_LAT,
        ORIGIN.lon + x / M_PER_DEG_LON,
    ];
}
// ── The plaza layout ──────────────────────────────────────────────────────
// Disposición real del microcentro: Plaza Independencia (2×2 cuadras) al centro,
// y las 4 plazas satélite en las esquinas diagonales (~3 cuadras): Chile (NO),
// San Martín (NE), Italia (SO), España (SE).
const PLAZAS = [
    { cx: 0, cz: 0, halfW: 92, halfD: 92, name: 'Plaza Independencia' },
    { cx: 250, cz: -250, halfW: 44, halfD: 44, name: 'Plaza San Martín' },
    { cx: -250, cz: -250, halfW: 44, halfD: 44, name: 'Plaza Chile' },
    { cx: -250, cz: 250, halfW: 44, halfD: 44, name: 'Plaza Italia' },
    { cx: 250, cz: 250, halfW: 44, halfD: 44, name: 'Plaza España' },
];
// Posiciones reales (microcentro de Mendoza), grilla de 100 m. Av. Mitre en x=0
// (eje central, cortado por la plaza); Plaza Independencia entre Chile (x=-100)
// y Patricias Mendocinas (x=100), Espejo (z=-100) y Rivadavia (z=100).
const NAMED_STREETS = [
    // North-south (avenidas)
    { coord: 400, axis: 'NS', name: 'Avenida San Martín', highway: 'primary' },
    { coord: 200, axis: 'NS', name: 'Avenida España', highway: 'primary' },
    { coord: 0, axis: 'NS', name: 'Avenida Mitre', highway: 'primary' },
    { coord: -900, axis: 'NS', name: 'Avenida Boulogne Sur Mer', highway: 'secondary' },
    { coord: -400, axis: 'NS', name: 'Avenida Belgrano', highway: 'primary' },
    { coord: -100, axis: 'NS', name: 'Chile', highway: 'secondary' },
    { coord: 100, axis: 'NS', name: 'Patricias Mendocinas', highway: 'secondary' },
    // East-west (avenidas)
    { coord: -600, axis: 'EW', name: 'Avenida Juan B. Justo', highway: 'primary' },
    { coord: -400, axis: 'EW', name: 'Avenida Las Heras', highway: 'primary' },
    { coord: 500, axis: 'EW', name: 'Avenida Morón', highway: 'primary' },
    { coord: -100, axis: 'EW', name: 'Espejo', highway: 'secondary' },
    { coord: 0, axis: 'EW', name: 'Calle Sarmiento', highway: 'secondary' },
    { coord: 100, axis: 'EW', name: 'Bernardino Rivadavia', highway: 'secondary' },
];
function nameFor(axis, coord) {
    for (const s of NAMED_STREETS)
        if (s.axis === axis && s.coord === coord)
            return s;
    return null;
}
// ── Generator ──────────────────────────────────────────────────────────────
export function buildMendozaLayout() {
    const nodes = [];
    const ways = [];
    let nextId = 1;
    // Cache shared intersection nodes — keying by integer-rounded coord so the
    // grid lines up exactly.
    const nodeCache = new Map();
    const getNode = (x, z) => {
        const k = `${Math.round(x)},${Math.round(z)}`;
        const existing = nodeCache.get(k);
        if (existing !== undefined)
            return existing;
        const id = nextId++;
        const [lat, lon] = worldToLatLon(x, z);
        nodes.push({ type: 'node', id, lat, lon });
        nodeCache.set(k, id);
        return id;
    };
    // Plaza membership test, with a small padding so streets stop a touch before
    // the plaza edge.
    const PLAZA_PAD = 4;
    function insidePlaza(x, z) {
        for (const p of PLAZAS) {
            if (x > p.cx - p.halfW - PLAZA_PAD && x < p.cx + p.halfW + PLAZA_PAD &&
                z > p.cz - p.halfD - PLAZA_PAD && z < p.cz + p.halfD + PLAZA_PAD) {
                return true;
            }
        }
        return false;
    }
    // ── Streets ──────────────────────────────────────────────────────────────
    // Microcentro real, de Av. Boulogne Sur Mer / Parque (oeste, x=-900) hasta
    // Salta (este, x=800), y de Av. Juan B. Justo (norte, z=-600) hasta Av.
    // Peltier (sur, z=1000).
    const X_LINES = [];
    for (let x = -900; x <= 700; x += 100)
        X_LINES.push(x);
    const Z_LINES = [];
    for (let z = -600; z <= 500; z += 100)
        Z_LINES.push(z);
    function emitWay(nodeIds, tags) {
        if (nodeIds.length < 2)
            return;
        ways.push({ type: 'way', id: nextId++, nodes: nodeIds, tags });
    }
    // N-S streets: constant x, varying z. Split at plaza interruptions.
    for (const x of X_LINES) {
        const named = nameFor('NS', x);
        const baseTags = named
            ? { highway: named.highway, name: named.name }
            : { highway: 'residential' };
        let segment = [];
        for (const z of Z_LINES) {
            if (insidePlaza(x, z)) {
                emitWay(segment, { ...baseTags });
                segment = [];
            }
            else {
                segment.push(getNode(x, z));
            }
        }
        emitWay(segment, baseTags);
    }
    // Calles E-O que no continúan al oeste (cortan en Perú, x=-300).
    const EW_WEST_CUT = { [-600]: -300, [-500]: -300 };
    // E-W streets: constant z, varying x.
    for (const z of Z_LINES) {
        const named = nameFor('EW', z);
        const baseTags = named
            ? { highway: named.highway, name: named.name }
            : { highway: 'residential' };
        const cutX = EW_WEST_CUT[z];
        let segment = [];
        for (const x of X_LINES) {
            if (cutX !== undefined && x < cutX)
                continue; // la calle no llega tan al oeste
            if (insidePlaza(x, z)) {
                emitWay(segment, { ...baseTags });
                segment = [];
            }
            else {
                segment.push(getNode(x, z));
            }
        }
        emitWay(segment, baseTags);
    }
    // ── Plazas (closed polygons) ─────────────────────────────────────────────
    for (const p of PLAZAS) {
        const ring = [
            getNode(p.cx - p.halfW, p.cz - p.halfD),
            getNode(p.cx + p.halfW, p.cz - p.halfD),
            getNode(p.cx + p.halfW, p.cz + p.halfD),
            getNode(p.cx - p.halfW, p.cz + p.halfD),
        ];
        ways.push({
            type: 'way',
            id: nextId++,
            nodes: [...ring, ring[0]],
            tags: { leisure: 'park', name: p.name },
        });
    }
    // ── Parque General San Martín (gran área verde al oeste de los Portones) ──
    // Rectángulo al oeste de x=-900 (Av. Boulogne Sur Mer), de x=-1400 a -900.
    {
        const ring = [
            getNode(-1400, -500),
            getNode(-900, -500),
            getNode(-900, 300),
            getNode(-1400, 300),
        ];
        ways.push({
            type: 'way',
            id: nextId++,
            nodes: [...ring, ring[0]],
            tags: { leisure: 'park', name: 'Parque General San Martín' },
        });
    }
    return {
        version: 0,
        generator: 'mendoza-layout',
        elements: [...nodes, ...ways],
    };
}
