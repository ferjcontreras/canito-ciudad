// ── Canito en la Ciudad ─────────────────────────────────────────────────────
// Modo "ciudad viva": el mismo escenario de Mendoza, pero sin zombies. Canito
// pasea por una ciudad con peatones (que caminan por las veredas y cruzan en
// las esquinas), autos y motos circulando, y vida en las plazas (gente, niños
// jugando, perritos). Reutiliza todos los builders del mundo de main.ts.
import * as THREE from 'three';
import { Engine } from './core/Engine';
import { ThirdPersonCamera } from './core/ThirdPersonCamera';
import { InputManager } from './core/InputManager';
import { Canito } from './entities/Canito';
import { Tram } from './entities/Tram';
import { CityBus } from './entities/CityBus';
import { buildMendozaLayout } from './geo/MendozaLayout';
import { Projection } from './geo/Projection';
import { buildBuildings } from './world/BuildingBuilder';
import { buildInfillHouses } from './world/InfillBuilder';
import { buildCommercialStrip } from './world/CommercialBuilder';
import { buildStreets } from './world/StreetBuilder';
import { buildTerrain, buildParkZone, buildPlazaZone, polygonArea } from './world/TerrainBuilder';
import { buildParkedCars } from './world/ParkedCarsBuilder';
import { buildPortones, buildParkWall } from './world/LandmarkBuilder';
import { buildPlazaIndependencia } from './world/PlazaIndependencia';
import { buildTramLine } from './world/TramBuilder';
import { buildEnvironment } from './world/Environment';
import { buildUrbanFixtures } from './world/UrbanFixtures';
import { buildPublicBuildings } from './world/PublicBuildings';
import { createTreeGeos, scatterTreesInPolygon, addAvenueTree, scatterStreetTrees, commitTrees } from './world/TreeBuilder';
import { buildStreetLampsAlongRoads, buildStreetLamps, buildBenches, buildBenchesAt } from './world/UrbanFurnitureBuilder';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { CityGraph } from './city/CityGraph';
import { PedestrianManager } from './city/Pedestrians';
import { TrafficManager } from './city/Traffic';
import { PlazaLife } from './city/PlazaLife';
const CENTER = { lat: -32.8895, lon: -68.8458 };
const PORTONES_X = -900;
const PORTONES_Z = 0;
function buildAvenue(scene, x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    const nx = -dz, nz = dx;
    const steps = Math.ceil(len / 18);
    const strip = (halfW, y, color) => {
        const verts = [], idx = [];
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * len;
            const x = x0 + dx * t, z = z0 + dz * t;
            verts.push(x + nx * halfW, y, z + nz * halfW);
            verts.push(x - nx * halfW, y, z - nz * halfW);
        }
        for (let i = 0; i < steps; i++) {
            const a = i * 2;
            idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
        mesh.receiveShadow = true;
        scene.add(mesh);
    };
    strip(6, 0.06, 0x3a3a3e);
    strip(0.14, 0.075, 0xe8d860);
}
async function main() {
    const loading = new LoadingOverlay();
    const engine = new Engine();
    const proj = new Projection(CENTER);
    const colliders = [];
    loading.setMessage('Generando Mendoza…');
    const osmData = buildMendozaLayout();
    const nodeMap = new Map();
    const buildings = [];
    const streets = [];
    const parks = [];
    const osmTrees = [], osmLamps = [], osmBenches = [];
    for (const el of osmData.elements) {
        if (el.type === 'node') {
            nodeMap.set(el.id, el);
            const tags = el.tags ?? {};
            if (tags['natural'] === 'tree')
                osmTrees.push(el);
            else if (tags['highway'] === 'street_lamp')
                osmLamps.push(el);
            else if (tags['amenity'] === 'bench')
                osmBenches.push(el);
        }
        else if (el.type === 'way') {
            if (el.tags.building)
                buildings.push(el);
            else if (el.tags.highway)
                streets.push(el);
            else if (el.tags.landuse || el.tags.leisure || el.tags.natural)
                parks.push(el);
        }
    }
    // ── Mundo (mismo escenario que el juego) ──────────────────────────────────
    loading.setMessage('Construyendo ciudad…');
    buildTerrain(engine.scene, 4000);
    const env = buildEnvironment(engine.scene);
    const treeGeos = createTreeGeos();
    const noBuildZones = [];
    const extraBenches = [];
    const plaza = buildPlazaIndependencia(engine.scene, 0, 0);
    colliders.push(...plaza.colliders);
    const plazaAvoid = plaza.colliders.map(c => ({
        minX: c.minX - 3, maxX: c.maxX + 3, minZ: c.minZ - 3, maxZ: c.maxZ + 3,
    }));
    for (const way of parks) {
        const nodes = way.nodes.map(nid => nodeMap.get(nid)).filter((n) => n !== undefined);
        if (nodes.length < 3)
            continue;
        const pts = nodes.map(n => proj.project(n.lat, n.lon));
        const isForest = way.tags.landuse === 'forest' || way.tags.natural === 'wood';
        const area = polygonArea(pts);
        const name = (way.tags.name ?? '').toLowerCase();
        const isNamedPlaza = /^plaza\b/.test(name);
        const isPlaza = isNamedPlaza || (!isForest && area < 8000 &&
            (way.tags.leisure === 'park' || way.tags.leisure === 'garden' ||
                way.tags.leisure === 'pitch' || way.tags.leisure === 'playground' ||
                way.tags.landuse === 'recreation_ground' || way.tags.landuse === 'grass'));
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const [x, z] of pts) {
            if (x < minX)
                minX = x;
            if (x > maxX)
                maxX = x;
            if (z < minZ)
                minZ = z;
            if (z > maxZ)
                maxZ = z;
        }
        noBuildZones.push({ minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 });
        if (isForest) {
            buildParkZone(engine.scene, pts, 0x466a36);
            scatterTreesInPolygon(treeGeos, colliders, pts, 10, 1.1, 4);
        }
        else if (isPlaza) {
            buildPlazaZone(engine.scene, pts);
            const avoid = name.includes('independencia') ? plazaAvoid : [];
            scatterTreesInPolygon(treeGeos, colliders, pts, 18, 0.85, 3, avoid);
            const cxP = (minX + maxX) / 2, czP = (minZ + maxZ) / 2;
            const ringR = Math.min(maxX - minX, maxZ - minZ) * 0.18 + 5;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                extraBenches.push({ x: cxP + Math.cos(a) * ringR, z: czP + Math.sin(a) * ringR, rotY: a + Math.PI / 2 });
            }
        }
        else {
            buildParkZone(engine.scene, pts, 0x6a9a50);
            scatterTreesInPolygon(treeGeos, colliders, pts, 16, 0.95, 4);
        }
    }
    // Corredor despejado hacia los Portones
    {
        const x0 = 0, z0 = 0, x1 = PORTONES_X, z1 = PORTONES_Z;
        const L = Math.hypot(x1 - x0, z1 - z0);
        const udx = (x1 - x0) / L, udz = (z1 - z0) / L;
        for (let t = 0; t <= L; t += 20) {
            const cx = x0 + udx * t, cz = z0 + udz * t;
            noBuildZones.push({ minX: cx - 16, maxX: cx + 16, minZ: cz - 16, maxZ: cz + 16 });
        }
    }
    noBuildZones.push({ minX: PORTONES_X - 5, maxX: PORTONES_X + 100, minZ: PORTONES_Z - 85, maxZ: PORTONES_Z + 85 });
    // Metrotranvía sobre Belgrano (x=-400)
    const TRAM_CX = -400, TRAM_CZ = -50, TRAM_ANGLE = 0, TRAM_HALFLEN = 580, TRAM_CORRIDOR_HW = 7.5;
    const _tSin = Math.sin(TRAM_ANGLE), _tCos = Math.cos(TRAM_ANGLE);
    const onTramCorridor = (x, z) => {
        const lx = _tCos * (x - TRAM_CX) - _tSin * (z - TRAM_CZ);
        const lz = _tSin * (x - TRAM_CX) + _tCos * (z - TRAM_CZ);
        return Math.abs(lx) < TRAM_CORRIDOR_HW && Math.abs(lz) < TRAM_HALFLEN;
    };
    for (let t = -TRAM_HALFLEN; t <= TRAM_HALFLEN; t += 12) {
        const cx = TRAM_CX + _tSin * t, cz = TRAM_CZ + _tCos * t;
        noBuildZones.push({ minX: cx - TRAM_CORRIDOR_HW, maxX: cx + TRAM_CORRIDOR_HW, minZ: cz - TRAM_CORRIDOR_HW, maxZ: cz + TRAM_CORRIDOR_HW });
    }
    // Avenida Mitre (x=0), interrumpida por la plaza
    const MITRE_X = 0;
    const MITRE_SEGS = [[-560, -110], [110, 480]];
    for (const [z0, z1] of MITRE_SEGS)
        for (let z = z0; z <= z1; z += 12)
            noBuildZones.push({ minX: MITRE_X - 8, maxX: MITRE_X + 8, minZ: z - 8, maxZ: z + 8 });
    buildStreets(engine.scene, streets, nodeMap, proj);
    // Cantero central de la Avenida Mitre
    {
        const curbMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0, flatShading: true });
        const grassMat = new THREE.MeshLambertMaterial({ color: 0x5f9a45, flatShading: true });
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x35363a, flatShading: true });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0 });
        const asphalt = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
        const GAP = 6;
        const medianPiece = (a, b) => {
            if (b - a < 2)
                return;
            const l = b - a, c = (a + b) / 2;
            const curb = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, l), curbMat);
            curb.position.set(MITRE_X, 0.14, c);
            engine.scene.add(curb);
            const grass = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, l), grassMat);
            grass.position.set(MITRE_X, 0.26, c);
            grass.receiveShadow = true;
            engine.scene.add(grass);
            for (let z = a + 7; z < b - 5; z += 15)
                addAvenueTree(treeGeos, MITRE_X, z, 1.0);
            for (let z = a + 14; z < b - 8; z += 30) {
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 4.2, 8), poleMat);
                pole.position.set(MITRE_X, 2.4, z);
                engine.scene.add(pole);
                const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat);
                lamp.position.set(MITRE_X, 4.5, z);
                engine.scene.add(lamp);
            }
        };
        for (const [z0, z1] of MITRE_SEGS) {
            const len = z1 - z0, cz = (z0 + z1) / 2;
            const asp = new THREE.Mesh(new THREE.BoxGeometry(13, 0.04, len), asphalt);
            asp.position.set(MITRE_X, 0.06, cz);
            asp.receiveShadow = true;
            engine.scene.add(asp);
            let start = z0;
            for (let c = Math.ceil(z0 / 100) * 100; c <= z1; c += 100) {
                medianPiece(start, c - GAP);
                start = c + GAP;
            }
            medianPiece(start, z1);
        }
    }
    buildUrbanFixtures(engine.scene, streets, nodeMap, proj);
    buildPublicBuildings(engine.scene, colliders, noBuildZones);
    colliders.push(...buildBuildings(engine.scene, buildings, nodeMap, proj));
    const SANMARTIN_X = 400;
    colliders.push(...buildCommercialStrip(engine.scene, SANMARTIN_X, -580, 480, colliders));
    for (let z = -580; z <= 480; z += 12)
        noBuildZones.push({ minX: SANMARTIN_X - 13, maxX: SANMARTIN_X + 13, minZ: z - 8, maxZ: z + 8 });
    loading.setMessage('Construyendo edificios…');
    colliders.push(...buildInfillHouses(engine.scene, streets, nodeMap, proj, colliders, noBuildZones));
    scatterStreetTrees(treeGeos, streets, nodeMap, proj);
    for (const n of osmTrees) {
        const [x, z] = proj.project(n.lat, n.lon);
        addAvenueTree(treeGeos, x, z, 0.8 + Math.random() * 0.4);
    }
    const avX0 = -110, avZ0 = 0;
    buildAvenue(engine.scene, avX0, avZ0, PORTONES_X, PORTONES_Z);
    const avLen = Math.hypot(PORTONES_X - avX0, PORTONES_Z - avZ0);
    const avDx = (PORTONES_X - avX0) / avLen, avDz = (PORTONES_Z - avZ0) / avLen;
    const avPx = -avDz, avPz = avDx;
    for (let t = 20; t < avLen - 12; t += 18) {
        const ax = avX0 + avDx * t, az = avZ0 + avDz * t;
        addAvenueTree(treeGeos, ax + avPx * 10, az + avPz * 10, 0.9);
        addAvenueTree(treeGeos, ax - avPx * 10, az - avPz * 10, 0.9);
    }
    colliders.push(...buildPortones(engine.scene, PORTONES_X, PORTONES_Z));
    colliders.push(...buildParkWall(engine.scene, PORTONES_X, -700, 550, -50, 50));
    // Metrotranvía (ambiente)
    buildTramLine(engine.scene, TRAM_CX, TRAM_CZ, TRAM_ANGLE, TRAM_HALFLEN);
    const TRAM_TRAVEL = 480;
    const trams = [
        new Tram(TRAM_CX, TRAM_CZ, TRAM_ANGLE, -2.6, TRAM_TRAVEL, -TRAM_TRAVEL, 1),
        new Tram(TRAM_CX, TRAM_CZ, TRAM_ANGLE, 2.6, TRAM_TRAVEL, TRAM_TRAVEL, -1),
    ];
    for (const t of trams)
        engine.scene.add(t.group);
    // City Bus (ambiente) rodeando Plaza Independencia
    const cityBus = new CityBus([[-100, 100], [-100, -100], [100, -100], [100, 100]]);
    engine.scene.add(cityBus.group);
    colliders.push(cityBus.collider);
    commitTrees(engine.scene, treeGeos);
    buildStreetLampsAlongRoads(engine.scene, streets, nodeMap, proj);
    buildStreetLamps(engine.scene, osmLamps, proj);
    buildBenches(engine.scene, osmBenches, proj);
    buildBenchesAt(engine.scene, extraBenches);
    loading.setMessage('Estacionando autos…');
    buildParkedCars(engine.scene, streets, nodeMap, proj, colliders, onTramCorridor);
    // ── NPCs: la ciudad viva ──────────────────────────────────────────────────
    loading.setMessage('Dando vida a la ciudad…');
    const graph = new CityGraph(streets, nodeMap, proj);
    const pedestrians = new PedestrianManager(engine.scene, graph, 200);
    const traffic = new TrafficManager(engine.scene, graph, 320, 90);
    const plazaSpecs = [
        { cx: 0, cz: 0, radius: 40 },
        { cx: 250, cz: -250, radius: 20 },
        { cx: -250, cz: -250, radius: 20 },
        { cx: -250, cz: 250, radius: 20 },
        { cx: 250, cz: 250, radius: 20 },
    ];
    const plazaLife = new PlazaLife(engine.scene, plazaSpecs);
    // ── Personaje + cámara ─────────────────────────────────────────────────────
    const input = new InputManager();
    const canito = new Canito(engine.scene);
    const thirdPerson = new ThirdPersonCamera();
    // Arranca al borde sur de Plaza Independencia (sobre Av. Mitre), mirando a la
    // plaza: ahí se ve enseguida gente, niños, perritos, la fuente y el bus.
    const START_X = 0, START_Z = 140;
    canito.group.position.set(START_X, 0, START_Z);
    canito.setYRot(Math.atan2(0 - START_X, 0 - START_Z)); // mirando a la plaza (norte)
    engine.setCamera(thirdPerson.camera);
    // HUD
    const hudLat = document.getElementById('hud-lat');
    const hudLon = document.getElementById('hud-lon');
    loading.hide();
    engine.start(dt => {
        canito.update(dt, input.keys, colliders);
        thirdPerson.update(canito.getPosition(), canito.getYRot());
        pedestrians.update(dt);
        traffic.update(dt);
        plazaLife.update(dt);
        for (const t of trams)
            t.update(dt);
        cityBus.update(dt);
        const p = canito.getPosition();
        env.update(dt, p.x, p.z);
        plaza.update(dt);
        if (hudLat && hudLon) {
            const [lat, lon] = proj.unproject(p.x, p.z);
            hudLat.textContent = lat.toFixed(5);
            hudLon.textContent = lon.toFixed(5);
        }
    });
}
main().catch(err => {
    console.error(err);
    const e = document.getElementById('loading-error');
    if (e) {
        e.style.display = 'block';
        e.textContent = String(err);
    }
});
