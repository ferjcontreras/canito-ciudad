import * as THREE from 'three';
import { Engine } from './core/Engine';
import { ThirdPersonCamera } from './core/ThirdPersonCamera';
import { InputManager } from './core/InputManager';
import { Canito } from './entities/Canito';
import { ZombieGaucho } from './entities/ZombieGaucho';
import { Fireball } from './entities/Fireball';
import { GauchoCar } from './entities/GauchoCar';
import { ThrownCar } from './entities/ThrownCar';
import { GrapeBunch } from './entities/GrapeBunch';
import { Spit } from './entities/Spit';
import { VendimiaCart } from './entities/VendimiaCart';
import { VendimiaThrow } from './entities/VendimiaThrow';
import { Bone } from './entities/Bone';
import { Tram } from './entities/Tram';
import { CityBus } from './entities/CityBus';
import { EffectsManager } from './world/Effects';
import { SoundManager } from './world/Sound';
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
const CENTER = { lat: -32.8895, lon: -68.8458 };
// Portones at the NW corner of the layout (just east of Parque San Martín)
const PORTONES_X = -900; // Av. Boulogne Sur Mer (borde del parque)
const PORTONES_Z = 0; // al final de calle Sarmiento
// Sandy pedestrian promenade (no asphalt) connecting Plaza Independencia to
// the Portones. Drawn as a narrow tile-coloured strip that doesn't compete
// visually with OSM roads it may cross.
function buildAvenue(scene, x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    const nx = -dz;
    const nz = dx;
    const steps = Math.ceil(len / 18);
    // Calzada de asfalto + línea amarilla central
    const strip = (halfW, y, color) => {
        const verts = [];
        const idx = [];
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * len;
            const x = x0 + dx * t;
            const z = z0 + dz * t;
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
    strip(6, 0.06, 0x3a3a3e); // asfalto
    strip(0.14, 0.075, 0xe8d860); // línea central amarilla
}
async function main() {
    const loading = new LoadingOverlay();
    const engine = new Engine();
    const proj = new Projection(CENTER);
    const colliders = [];
    loading.setMessage('Generando layout de Mendoza…');
    const osmData = buildMendozaLayout();
    const nodeMap = new Map();
    const buildings = [];
    const streets = [];
    const parks = [];
    // OSM node collections for furniture
    const osmTrees = [];
    const osmLamps = [];
    const osmBenches = [];
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
    // ── World ─────────────────────────────────────────────────────────────────
    loading.setMessage('Construyendo ciudad…');
    buildTerrain(engine.scene, 4000);
    // Atardecer: domo de cielo con degradé + sol, Cordillera de los Andes al
    // oeste y nubes a la deriva.
    const env = buildEnvironment(engine.scene);
    const treeGeos = createTreeGeos();
    // Track named plazas / large parks so we can keep them clear of infill
    const noBuildZones = [];
    // Bench positions to place around plaza rotundas
    const extraBenches = [];
    // Plaza Independencia: fuente de aguas danzantes (semicírculo), fuente chica
    // rectangular, cartel "Yo ❤ Mendoza", escudo y juegos. Se construye ANTES de
    // dispersar árboles para poder excluir sus footprints (nada de árboles encima).
    const plaza = buildPlazaIndependencia(engine.scene, 0, 0);
    colliders.push(...plaza.colliders);
    const plazaAvoid = plaza.colliders.map(c => ({
        minX: c.minX - 3, maxX: c.maxX + 3, minZ: c.minZ - 3, maxZ: c.maxZ + 3,
    }));
    for (const way of parks) {
        const nodes = way.nodes
            .map(nid => nodeMap.get(nid))
            .filter((n) => n !== undefined);
        if (nodes.length < 3)
            continue;
        const pts = nodes.map(n => proj.project(n.lat, n.lon));
        const isForest = way.tags.landuse === 'forest' || way.tags.natural === 'wood';
        const area = polygonArea(pts);
        const tags = way.tags;
        const name = (tags.name ?? '').toLowerCase();
        // Argentine convention: "Plaza ..." names are public squares
        const isNamedPlaza = /^plaza\b/.test(name);
        const isPlaza = isNamedPlaza ||
            (!isForest && area < 8000 &&
                (tags.leisure === 'park' || tags.leisure === 'garden' ||
                    tags.leisure === 'pitch' || tags.leisure === 'playground' ||
                    tags.landuse === 'recreation_ground' || tags.landuse === 'grass'));
        // Reserve area so no infill building lands inside the green space
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
            // Place 6 benches in a ring around the central rotunda, facing inward
            const cxP = (minX + maxX) / 2;
            const czP = (minZ + maxZ) / 2;
            const ringR = Math.min(maxX - minX, maxZ - minZ) * 0.18 + 5;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                extraBenches.push({
                    x: cxP + Math.cos(a) * ringR,
                    z: czP + Math.sin(a) * ringR,
                    rotY: a + Math.PI / 2,
                });
            }
        }
        else {
            buildParkZone(engine.scene, pts, 0x6a9a50);
            scatterTreesInPolygon(treeGeos, colliders, pts, 16, 0.95, 4);
        }
    }
    // Reserved corridor from Plaza Independencia (origin) to Portones, so the
    // monument is visible from the plaza down the avenue.
    {
        const x0 = 0, z0 = 0; // edge of plaza near avenue
        const x1 = PORTONES_X, z1 = PORTONES_Z;
        const dx = x1 - x0, dz = z1 - z0;
        const L = Math.hypot(dx, dz);
        const udx = dx / L, udz = dz / L;
        const CORRIDOR_HW = 16; // 32m wide reserved corridor
        const STEP = 20;
        for (let t = 0; t <= L; t += STEP) {
            const cx = x0 + udx * t;
            const cz = z0 + udz * t;
            noBuildZones.push({
                minX: cx - CORRIDOR_HW, maxX: cx + CORRIDOR_HW,
                minZ: cz - CORRIDOR_HW, maxZ: cz + CORRIDOR_HW,
            });
        }
    }
    // Explanada despejada frente a los Portones (la rotonda de los Caballitos):
    // sin edificios, para que los jefes aparezcan en zona libre y no encerrados.
    noBuildZones.push({
        minX: PORTONES_X - 5, maxX: PORTONES_X + 100,
        minZ: PORTONES_Z - 85, maxZ: PORTONES_Z + 85,
    });
    // ── Metrotranvía: corre N-S sobre CALLE BELGRANO (x=-400) como boulevard ──
    // Reservamos un corredor libre de casas y autos (dos vías, una por sentido).
    const TRAM_CX = -400, TRAM_CZ = -50; // Belgrano, centrado en el rango z
    const TRAM_ANGLE = 0; // a lo largo de Z (norte-sur)
    const TRAM_HALFLEN = 580;
    const TRAM_CORRIDOR_HW = 7.5;
    const _tSin = Math.sin(TRAM_ANGLE), _tCos = Math.cos(TRAM_ANGLE);
    const onTramCorridor = (x, z) => {
        const lx = _tCos * (x - TRAM_CX) - _tSin * (z - TRAM_CZ); // perpendicular dist
        const lz = _tSin * (x - TRAM_CX) + _tCos * (z - TRAM_CZ); // along the line
        return Math.abs(lx) < TRAM_CORRIDOR_HW && Math.abs(lz) < TRAM_HALFLEN;
    };
    // Reserve the corridor so no infill house spawns on the tracks
    for (let t = -TRAM_HALFLEN; t <= TRAM_HALFLEN; t += 12) {
        const cx = TRAM_CX + _tSin * t;
        const cz = TRAM_CZ + _tCos * t;
        noBuildZones.push({
            minX: cx - TRAM_CORRIDOR_HW, maxX: cx + TRAM_CORRIDOR_HW,
            minZ: cz - TRAM_CORRIDOR_HW, maxZ: cz + TRAM_CORRIDOR_HW,
        });
    }
    // ── Avenida Mitre: avenida N-S (x≈0) con boulevard central, interrumpida por
    // la Plaza Independencia (desemboca en sus calles laterales y continúa). ────
    const MITRE_X = 0;
    const MITRE_SEGS = [[-560, -110], [110, 480]];
    for (const [z0, z1] of MITRE_SEGS) {
        for (let z = z0; z <= z1; z += 12) {
            noBuildZones.push({ minX: MITRE_X - 8, maxX: MITRE_X + 8, minZ: z - 8, maxZ: z + 8 });
        }
    }
    buildStreets(engine.scene, streets, nodeMap, proj);
    // Calzadas + cantero (boulevard) de la Avenida Mitre
    {
        const asphalt = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
        const curbMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0, flatShading: true });
        const grassMat = new THREE.MeshLambertMaterial({ color: 0x5f9a45, flatShading: true });
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x35363a, flatShading: true });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0 });
        const GAP = 6; // hueco del cantero en cada bocacalle
        // Una pieza de cantero (cordón + césped + árboles + faroles) entre a y b
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
                pole.castShadow = true;
                engine.scene.add(pole);
                const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat);
                lamp.position.set(MITRE_X, 4.5, z);
                engine.scene.add(lamp);
            }
        };
        for (const [z0, z1] of MITRE_SEGS) {
            const len = z1 - z0, cz = (z0 + z1) / 2;
            // Asfalto continuo (la calzada sí cruza las bocacalles)
            const asp = new THREE.Mesh(new THREE.BoxGeometry(13, 0.04, len), asphalt);
            asp.position.set(MITRE_X, 0.06, cz);
            asp.receiveShadow = true;
            engine.scene.add(asp);
            // Cantero cortado en cada cruce (múltiplos de 100)
            let start = z0;
            for (let c = Math.ceil(z0 / 100) * 100; c <= z1; c += 100) {
                medianPiece(start, c - GAP);
                start = c + GAP;
            }
            medianPiece(start, z1);
        }
    }
    // Detalles urbanos: parches de bocacalle, acequias, semáforos y carteles
    buildUrbanFixtures(engine.scene, streets, nodeMap, proj);
    // Edificios públicos (reservan su terreno antes del infill)
    buildPublicBuildings(engine.scene, colliders, noBuildZones);
    colliders.push(...buildBuildings(engine.scene, buildings, nodeMap, proj));
    // ── Calle comercial: Av. San Martín (x=400) con negocios a ambos lados ────
    // (ropa, electrodomésticos, McDonald's, farmacias, bancos, etc.). Se
    // construye antes del relleno y reserva su corredor para que las casas
    // genéricas no se metan entre las vidrieras.
    const SANMARTIN_X = 400;
    colliders.push(...buildCommercialStrip(engine.scene, SANMARTIN_X, -580, 480, colliders));
    for (let z = -580; z <= 480; z += 12) {
        noBuildZones.push({ minX: SANMARTIN_X - 13, maxX: SANMARTIN_X + 13, minZ: z - 8, maxZ: z + 8 });
    }
    // Infill procedural: casas/edificios extra donde no hay edificios OSM
    loading.setMessage('Construyendo casas adicionales…');
    colliders.push(...buildInfillHouses(engine.scene, streets, nodeMap, proj, colliders, noBuildZones));
    // Árboles de vereda a lo largo de las calles (arbolado mendocino)
    scatterStreetTrees(treeGeos, streets, nodeMap, proj);
    // ── OSM point features ────────────────────────────────────────────────────
    loading.setMessage('Añadiendo árboles y mobiliario…');
    // Individual OSM trees (supplement polygon-scattered ones)
    for (const n of osmTrees) {
        const [x, z] = proj.project(n.lat, n.lon);
        addAvenueTree(treeGeos, x, z, 0.8 + Math.random() * 0.4);
    }
    // ── Landmarks ─────────────────────────────────────────────────────────────
    loading.setMessage('Añadiendo monumentos…');
    // (La Plaza Independencia ya se construyó arriba, antes de los árboles.)
    // Avenue from Plaza Independencia edge to Portones (clear sightline)
    const avX0 = -110, avZ0 = 0;
    buildAvenue(engine.scene, avX0, avZ0, PORTONES_X, PORTONES_Z);
    const avLen = Math.hypot(PORTONES_X - avX0, PORTONES_Z - avZ0);
    const avDx = (PORTONES_X - avX0) / avLen;
    const avDz = (PORTONES_Z - avZ0) / avLen;
    const avPx = -avDz;
    const avPz = avDx;
    const tOff = 10;
    for (let t = 20; t < avLen - 12; t += 18) {
        const ax = avX0 + avDx * t;
        const az = avZ0 + avDz * t;
        addAvenueTree(treeGeos, ax + avPx * tOff, az + avPz * tOff, 0.9);
        addAvenueTree(treeGeos, ax - avPx * tOff, az - avPz * tOff, 0.9);
    }
    colliders.push(...buildPortones(engine.scene, PORTONES_X, PORTONES_Z));
    // Muro perimetral del parque: sólo se entra por los Portones. El hueco de la
    // puerta (z ∈ [-110, -90]) queda libre; los Portones ya cierran z ∈ [-150, -50].
    colliders.push(...buildParkWall(engine.scene, PORTONES_X, -700, 550, -50, 50));
    // ── Metrotranvía de Mendoza ───────────────────────────────────────────────
    // Dos vías (una por sentido). Duplas rojas Siemens-Düwag U2 que se cruzan.
    buildTramLine(engine.scene, TRAM_CX, TRAM_CZ, TRAM_ANGLE, TRAM_HALFLEN);
    const TRAM_TRAVEL = 480;
    const trams = [
        new Tram(TRAM_CX, TRAM_CZ, TRAM_ANGLE, -2.6, TRAM_TRAVEL, -TRAM_TRAVEL, 1),
        new Tram(TRAM_CX, TRAM_CZ, TRAM_ANGLE, 2.6, TRAM_TRAVEL, TRAM_TRAVEL, -1),
    ];
    for (const t of trams)
        engine.scene.add(t.group);
    // ── Bus Turístico "City Bus": rodea la Plaza Independencia por Chile (oeste),
    // Espejo (norte), Patricias (este) y Rivadavia (sur). Empieza en Chile yendo
    // de Rivadavia hacia Espejo. No hace daño; es collider móvil que empuja. ─────
    const cityBus = new CityBus([
        [-100, 100], // Chile × Rivadavia (SO)
        [-100, -100], // Chile × Espejo (NO)  → va de Rivadavia a Espejo por Chile
        [100, -100], // Espejo × Patricias (NE)
        [100, 100], // Patricias × Rivadavia (SE)
    ]);
    engine.scene.add(cityBus.group);
    colliders.push(cityBus.collider);
    commitTrees(engine.scene, treeGeos);
    // Luminarias procedurales a lo largo de todas las calles
    buildStreetLampsAlongRoads(engine.scene, streets, nodeMap, proj);
    // Luminarias y bancas desde OSM (si las hay)
    buildStreetLamps(engine.scene, osmLamps, proj);
    buildBenches(engine.scene, osmBenches, proj);
    // Bancas alrededor de las rotondas de las plazas
    buildBenchesAt(engine.scene, extraBenches);
    // Snapshot de colliders SÓLO de escenografía (edificios, muros, árboles, etc.)
    // antes de agregar los autos. Las bolas de fuego se apagan contra estos, pero
    // NO contra los autos (esos tienen su propia lógica de explosión).
    const wallColliders = colliders.slice();
    // Autos estacionados
    loading.setMessage('Estacionando autos…');
    const parkedCars = buildParkedCars(engine.scene, streets, nodeMap, proj, colliders, onTramCorridor);
    // ── Effects + sound ──────────────────────────────────────────────────────
    const effects = new EffectsManager(engine.scene);
    const sound = new SoundManager();
    // Unlock WebAudio on first user interaction (browsers require a gesture)
    const unlockSound = () => { sound.unlock(); window.removeEventListener('keydown', unlockSound); window.removeEventListener('pointerdown', unlockSound); };
    window.addEventListener('keydown', unlockSound);
    window.addEventListener('pointerdown', unlockSound);
    // ── Character & camera ────────────────────────────────────────────────────
    const input = new InputManager();
    const canito = new Canito(engine.scene);
    const thirdPerson = new ThirdPersonCamera();
    // Largada en el extremo este del microcentro (calle Salta), mirando al oeste
    // hacia los Portones del Parque (Av. Boulogne Sur Mer).
    const START_X = 680;
    const START_Z = 0;
    canito.group.position.set(START_X, 0, START_Z);
    {
        const fx = PORTONES_X - START_X;
        const fz = PORTONES_Z - START_Z;
        canito.setYRot(Math.atan2(fx, fz));
    }
    engine.setCamera(thirdPerson.camera);
    // ── Compass arrow pointing to the Portones ────────────────────────────────
    const compass = new THREE.Group();
    {
        const arrowMat = new THREE.MeshLambertMaterial({
            color: 0xffe040, emissive: 0xffd010, emissiveIntensity: 0.85, flatShading: true,
        });
        // Shaft along local +Z so we can rotate the whole group with atan2(dx, dz)
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8), arrowMat);
        shaft.rotation.x = Math.PI / 2;
        shaft.position.z = -0.08;
        compass.add(shaft);
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 10), arrowMat);
        head.rotation.x = Math.PI / 2;
        head.position.z = 0.25;
        compass.add(head);
        engine.scene.add(compass);
    }
    // ── Zombies de gauchos ────────────────────────────────────────────────────
    const zombies = [];
    const caballitos = []; // los dos jefes; el nivel termina al matarlos
    const RUNNER_PROB = 0.35;
    const insideAnyCollider = (x, z, r = 0.5) => {
        for (const c of colliders) {
            if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ)
                return true;
        }
        return false;
    };
    const addZombie = (zx, zz, forceRunner = false, thrower = false, queen = false) => {
        // No spawnear dentro del parque (al oeste del muro): sólo se entra por la puerta
        if (zx < PORTONES_X + 1)
            return false;
        if (insideAnyCollider(zx, zz, thrower ? 0.9 : 0.5))
            return false;
        const runner = !thrower && !queen && (forceRunner || Math.random() < RUNNER_PROB);
        const z = new ZombieGaucho({ runner, thrower, queen });
        z.position.set(zx, 0, zz);
        engine.scene.add(z.group);
        zombies.push(z);
        return true;
    };
    // A trio of zombies near Canito's start — one is a runner for visibility.
    addZombie(START_X - 35, START_Z + 1, true); // forced runner
    addZombie(START_X - 45, START_Z - 6);
    addZombie(START_X - 55, START_Z + 8);
    // Cluster of zombies along the path from start to Portones (the avenue route).
    {
        const dx = PORTONES_X - START_X;
        const dz = PORTONES_Z - START_Z;
        const L = Math.hypot(dx, dz);
        const udx = dx / L, udz = dz / L;
        const px = -udz, pz = udx; // perpendicular
        const PATH_ZOMBIES = 40;
        for (let i = 1; i < PATH_ZOMBIES; i++) {
            const t = (i / PATH_ZOMBIES) * L;
            const baseX = START_X + udx * t;
            const baseZ = START_Z + udz * t;
            // Random perpendicular offset so they're not in a single line
            const offset = (Math.random() - 0.5) * 35;
            addZombie(baseX + px * offset + (Math.random() - 0.5) * 6, baseZ + pz * offset + (Math.random() - 0.5) * 6);
        }
    }
    // Many scattered zombies across the whole city
    const ZOMBIE_COUNT = 120;
    {
        let spawned = 0;
        let tries = 0;
        while (spawned < ZOMBIE_COUNT && tries++ < 2000) {
            const zx = -850 + Math.random() * 1550; // x ∈ [-850, 700]
            const zz = -550 + Math.random() * 1050; // z ∈ [-550, 500]
            if (Math.hypot(zx - START_X, zz - START_Z) < 60)
                continue;
            if (Math.hypot(zx - 0, zz - 0) < 150)
                continue; // Plaza Independencia
            if (Math.hypot(zx - 250, zz - -250) < 55)
                continue; // plazas satélite
            if (Math.hypot(zx - -250, zz - -250) < 55)
                continue;
            if (Math.hypot(zx - -250, zz - 250) < 55)
                continue;
            if (Math.hypot(zx - 250, zz - 250) < 55)
                continue;
            if (addZombie(zx, zz))
                spawned++;
        }
    }
    // ── Throwers: heavy gauchos guarding the Portones ─────────────────────────
    {
        const THROWER_COUNT = 3;
        let spawned = 0;
        let tries = 0;
        while (spawned < THROWER_COUNT && tries++ < 600) {
            // En un semianillo 25–110 m del lado ciudad de los Portones (al este del muro)
            const ang = Math.random() * Math.PI * 2;
            const rad = 25 + Math.random() * 85;
            const tx = PORTONES_X + Math.abs(Math.cos(ang)) * rad; // sólo hacia +X (ciudad)
            const tz = PORTONES_Z + Math.sin(ang) * rad;
            if (addZombie(tx, tz, false, true))
                spawned++;
        }
    }
    // ── Reinas de la Vendimia zombi: rondan la Plaza Independencia ────────────
    // Corredoras y resistentes (3 bolas de fuego). Spawnean en un anillo
    // alrededor del origen (centro de Plaza Independencia).
    {
        const QUEEN_COUNT = 6;
        let spawned = 0;
        let tries = 0;
        while (spawned < QUEEN_COUNT && tries++ < 300) {
            const a = Math.random() * Math.PI * 2;
            const r = 55 + Math.random() * 75; // anillo 55–130 m de la plaza
            const qx = Math.cos(a) * r;
            const qz = Math.sin(a) * r;
            if (Math.hypot(qx - START_X, qz - START_Z) < 60)
                continue;
            if (addZombie(qx, qz, false, false, true))
                spawned++;
        }
    }
    // El boss (centinela de los Portones) ya no está desde el arranque: irrumpe
    // durante la emboscada, en checkAmbush().
    // ── Autos manejados por gauchos zombi ─────────────────────────────────────
    // They roam streets and ram Canito on sight.
    const gauchoCars = [];
    const GAUCHO_CAR_COUNT = 8;
    {
        // Spawn along the avenue route at varied positions
        const dx = PORTONES_X - START_X;
        const dz = PORTONES_Z - START_Z;
        const L = Math.hypot(dx, dz);
        const udx = dx / L, udz = dz / L;
        const px = -udz, pz = udx;
        for (let i = 0; i < GAUCHO_CAR_COUNT; i++) {
            const t = (0.15 + 0.7 * (i / GAUCHO_CAR_COUNT)) * L;
            const baseX = START_X + udx * t;
            const baseZ = START_Z + udz * t;
            const off = (Math.random() - 0.5) * 60;
            const cx = baseX + px * off;
            const cz = baseZ + pz * off;
            // Skip plaza zones
            if (Math.hypot(cx, cz) < 140)
                continue;
            const car = new GauchoCar();
            car.position.set(cx, 0, cz);
            car.group.rotation.y = Math.atan2(START_X - cx, START_Z - cz);
            engine.scene.add(car.group);
            gauchoCars.push(car);
        }
    }
    // ── Huesitos de salud en cada plaza ───────────────────────────────────────
    const bones = [];
    const plazaSpots = [
        { cx: 0, cz: 0, r: 80 }, // Plaza Independencia (más grande, más huesos)
        { cx: 250, cz: -250, r: 35 }, // Plaza San Martín (NE)
        { cx: -250, cz: -250, r: 35 }, // Plaza Chile (NO)
        { cx: -250, cz: 250, r: 35 }, // Plaza Italia (SO)
        { cx: 250, cz: 250, r: 35 }, // Plaza España (SE)
    ];
    for (const p of plazaSpots) {
        const n = p.r >= 60 ? 5 : 3;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = p.r * (0.25 + Math.random() * 0.7);
            const b = new Bone();
            b.position.set(p.cx + Math.cos(a) * d, 0.25, p.cz + Math.sin(a) * d);
            engine.scene.add(b.group);
            bones.push(b);
        }
    }
    // ── HUD ───────────────────────────────────────────────────────────────────
    const hudLat = document.getElementById('hud-lat');
    const hudLon = document.getElementById('hud-lon');
    const hudAlt = document.getElementById('hud-alt');
    const hudHPFill = document.getElementById('hud-hp-fill');
    const hudPowerFill = document.getElementById('hud-power-fill');
    const hudKills = document.getElementById('hud-kills');
    const hudLives = document.getElementById('hud-lives');
    const gameOverEl = document.getElementById('game-over');
    const victoryEl = document.getElementById('victory');
    const victoryStats = document.getElementById('victory-stats');
    const throwers = zombies.filter(z => z.isThrower).length;
    const runners = zombies.filter(z => z.isRunner).length;
    loading.setMessage(`Listo — ${zombies.length} gauchos (${runners} corredores · ${throwers} thrower) + ${gauchoCars.length} autos · ${bones.length} huesitos en plazas`);
    await new Promise(r => setTimeout(r, 500));
    loading.hide();
    // ── Game state ────────────────────────────────────────────────────────────
    const fireballs = [];
    const thrownCars = [];
    const grapeBunches = [];
    const spits = [];
    const vendimiaCarts = [];
    const vendimiaThrows = [];
    let canitoHP = 20;
    let killCount = 0;
    let barkCD = 0;
    let firePrev = false; // estado de disparo del frame anterior (flanco)
    let gameOver = false;
    // ── Vidas + checkpoint ─────────────────────────────────────────────────────
    const MAX_LIVES = 3;
    let lives = MAX_LIVES;
    let invuln = 0; // segundos de invulnerabilidad tras revivir
    let passedPlaza = false; // ¿ya cruzó la Plaza Independencia?
    // Punto de reaparición: arranca en la largada; pasa a la fuente de la plaza
    // una vez que se cruza la Plaza Independencia.
    const checkpoint = { x: START_X, z: START_Z };
    const renderLives = () => { hudLives.textContent = '🐾'.repeat(lives) || '—'; };
    renderLives();
    const MAX_HP = 20;
    const renderHP = () => {
        hudHPFill.style.width = (canitoHP / MAX_HP) * 100 + '%';
        const cls = canitoHP > 12 ? 'hp-good' : canitoHP > 6 ? 'hp-warn' : 'hp-crit';
        hudHPFill.className = 'hp-fill ' + cls;
    };
    const flashBanner = (text, color) => {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = `
      position: fixed; top: 38%; left: 50%; transform: translate(-50%, -50%);
      font-size: 3rem; font-weight: 800; color: ${color};
      text-shadow: 0 0 20px ${color}b0; letter-spacing: 0.05em;
      pointer-events: none; z-index: 200; opacity: 0; transition: opacity 0.3s;
      text-align: center;`;
        document.body.appendChild(el);
        requestAnimationFrame(() => { el.style.opacity = '1'; });
        setTimeout(() => { el.style.opacity = '0'; }, 1500);
        setTimeout(() => { el.remove(); }, 2100);
    };
    const respawn = () => {
        canitoHP = MAX_HP;
        renderHP();
        invuln = 2.5; // i-frames + parpadeo al revivir
        canito.group.position.set(checkpoint.x, 0, checkpoint.z);
        canito.setYRot(Math.atan2(PORTONES_X - checkpoint.x, PORTONES_Z - checkpoint.z));
        flashBanner(`Te quedan ${lives} ${lives === 1 ? 'vida' : 'vidas'} 🐾`, '#7eff8a');
    };
    let gameOverAt = 0; // momento del game over (para exigir un tap de Espacio)
    const onDeath = () => {
        lives--;
        renderLives();
        if (lives > 0) {
            respawn();
        }
        else {
            gameOver = true;
            gameOverAt = performance.now();
            gameOverEl.classList.remove('hidden');
        }
    };
    const setHP = (hp, attackerX, attackerZ) => {
        const isDamage = hp < canitoHP;
        // Ignorar daño durante la invulnerabilidad, en modo vida infinita o si terminó
        if (isDamage && (invuln > 0 || gameOver || godMode))
            return;
        const prev = canitoHP;
        canitoHP = Math.max(0, hp);
        if (canitoHP < prev) {
            canito.hurt(attackerX, attackerZ);
            sound.yelp();
        }
        renderHP();
        if (canitoHP === 0 && !gameOver) {
            onDeath();
        }
    };
    setHP(canitoHP);
    // ── Truco: escribí "vida" para activar/desactivar VIDA INFINITA (explorar) ──
    let godMode = false;
    {
        let buf = '';
        window.addEventListener('keydown', (e) => {
            if (e.key.length !== 1)
                return;
            buf = (buf + e.key.toLowerCase()).slice(-6);
            if (buf.endsWith('vida')) {
                godMode = !godMode;
                if (godMode) {
                    canitoHP = MAX_HP;
                    renderHP();
                }
                flashBanner(godMode ? '∞ VIDA INFINITA' : 'Vida infinita OFF', godMode ? '#7eff8a' : '#ff8a40');
                buf = '';
            }
        });
    }
    const tmpDir = new THREE.Vector3();
    // Helpers — kill a zombie with blood + groan
    // Instakill for normal enemies; bosses (caballitos) only take chip damage from
    // area sources so they can't be finished off by a stray blast/Aullido/tram —
    // you must deliberately wear both down with fireballs.
    const AREA_BOSS_DMG = 6;
    const killZombie = (z) => {
        if (!z.alive)
            return;
        if (z.isCaballito || z.isBoss) {
            z.takeDamage(AREA_BOSS_DMG);
            effects.spawnBlood(z.position);
            if (z.alive)
                return; // chipped but still standing
        }
        else {
            z.takeDamage(z.hp); // ensures alive=false
            effects.spawnBlood(z.position);
        }
        killCount++;
        hudKills.textContent = killCount.toString();
        z.remove(engine.scene);
    };
    // Blast — explode a car at idx and damage everything within radius
    const BLAST_RADIUS = 7;
    const BLAST_DMG_CANITO = 5;
    const explodeCar = (idx) => {
        const car = parkedCars.cars[idx];
        if (!car || car.exploded)
            return;
        const pos = new THREE.Vector3(car.x, 0, car.z);
        parkedCars.explode(idx);
        effects.spawnExplosion(pos);
        sound.boom();
        // Kill any zombies in blast radius (with blood)
        for (const z of zombies) {
            if (!z.alive)
                continue;
            if (Math.hypot(z.position.x - car.x, z.position.z - car.z) < BLAST_RADIUS) {
                killZombie(z);
            }
        }
        // Hurt Canito if close
        const cd = Math.hypot(canitoPos.x - car.x, canitoPos.z - car.z);
        if (cd < BLAST_RADIUS) {
            const dmg = Math.ceil(BLAST_DMG_CANITO * (1 - cd / BLAST_RADIUS));
            if (dmg > 0)
                setHP(canitoHP - dmg, car.x, car.z);
        }
    };
    // ── Aullido Cósmico: poder de área cargado ────────────────────────────────
    // Mantené disparar (Espacio/B) para llenar la barra; al tope, Canito suelta
    // un aullido que mata todo lo que esté a POWER_RADIUS metros a la redonda.
    let powerCharge = 0; // 0..1
    const POWER_CHARGE_TIME = 2.5; // s manteniendo disparo para cargar
    const POWER_DRAIN_RATE = 1.5; // se descarga 1.5× más rápido al soltar
    const POWER_RADIUS = 10;
    const unleashPower = () => {
        effects.spawnShockwave(canitoPos, POWER_RADIUS);
        sound.powerBlast();
        // Mata todos los enemigos en el radio (reinas y boss incluidos)
        for (const z of zombies) {
            if (!z.alive)
                continue;
            if (Math.hypot(z.position.x - canitoPos.x, z.position.z - canitoPos.z) < POWER_RADIUS) {
                killZombie(z);
            }
        }
        // Destruye autos de gauchos en el radio
        for (const gc of gauchoCars) {
            if (!gc.alive)
                continue;
            if (Math.hypot(gc.position.x - canitoPos.x, gc.position.z - canitoPos.z) < POWER_RADIUS) {
                gc.takeDamage(99);
                if (!gc.alive) {
                    killCount++;
                    hudKills.textContent = killCount.toString();
                    effects.spawnExplosion(gc.position.clone());
                    gc.remove(engine.scene);
                }
            }
        }
        // Detona autos estacionados en el radio (reacción en cadena)
        for (let ci = 0; ci < parkedCars.cars.length; ci++) {
            const car = parkedCars.cars[ci];
            if (car.exploded)
                continue;
            if (Math.hypot(car.x - canitoPos.x, car.z - canitoPos.z) < POWER_RADIUS) {
                explodeCar(ci);
            }
        }
    };
    // ── Final ambush at the Portones ─────────────────────────────────────────
    let ambushTriggered = false;
    const checkAmbush = () => {
        if (ambushTriggered || gameOver || victory)
            return;
        const d = Math.hypot(canitoPos.x - PORTONES_X, canitoPos.z - PORTONES_Z);
        if (d > 100)
            return;
        ambushTriggered = true;
        // Los Caballitos de Marly cobran vida y flanquean la puerta, del lado ciudad
        // (frente a los Portones), para que haya que enfrentarlos antes de cruzar.
        for (const sgn of [-1, 1]) {
            const cab = new ZombieGaucho({ caballito: true });
            // Posición de spawn; si cayera sobre un collider, correrla a zona libre
            let cabX = PORTONES_X + 18;
            const cabZ = PORTONES_Z + sgn * 24;
            let guard = 0;
            while (insideAnyCollider(cabX, cabZ, 1.5) && guard++ < 40)
                cabX += 3; // hacia la ciudad
            cab.position.set(cabX, 0, cabZ);
            cab.group.rotation.y = Math.atan2(canitoPos.x - cabX, canitoPos.z - cabZ);
            engine.scene.add(cab.group);
            zombies.push(cab);
            caballitos.push(cab);
        }
        // 14 runners spawn in a 40–70 m half-ring on the city side of the Portones
        let spawned = 0, tries = 0;
        while (spawned < 14 && tries++ < 400) {
            const a = Math.random() * Math.PI * 2;
            const r = 40 + Math.random() * 30;
            const ax = PORTONES_X + Math.abs(Math.cos(a)) * r; // sólo hacia +X (ciudad)
            const az = PORTONES_Z + Math.sin(a) * r;
            if (addZombie(ax, az, true /* forceRunner */))
                spawned++;
        }
        // Brief HUD flash to warn the player
        const warn = document.createElement('div');
        warn.textContent = '¡EMBOSCADA!';
        warn.style.cssText = `
      position: fixed; top: 38%; left: 50%; transform: translate(-50%, -50%);
      font-size: 4rem; font-weight: 800;
      color: #ff4040; text-shadow: 0 0 20px rgba(255,40,40,0.7);
      letter-spacing: 0.08em; pointer-events: none; z-index: 200;
      opacity: 0; transition: opacity 0.3s;
    `;
        document.body.appendChild(warn);
        requestAnimationFrame(() => { warn.style.opacity = '1'; });
        setTimeout(() => { warn.style.opacity = '0'; }, 1600);
        setTimeout(() => { warn.remove(); }, 2200);
    };
    // ── Win condition: derrotar a los dos Caballitos de Marly ─────────────────
    let victory = false;
    const checkVictory = () => {
        if (victory || gameOver)
            return;
        // Recién se puede ganar una vez que aparecieron (emboscada) y ambos cayeron
        if (caballitos.length < 2 || caballitos.some(c => c.alive))
            return;
        victory = true;
        victoryStats.textContent = `¡Venciste a los Caballitos de Marly! Gauchos kabum: ${killCount}`;
        victoryEl.classList.remove('hidden');
    };
    // ── Segunda oleada de reinas tras cruzar la Plaza Independencia ───────────
    // La plaza ocupa x ∈ [-120, 120]; al salir por el oeste, brota un enjambre
    // de Reinas de la Vendimia alrededor de Canito.
    let queenWaveTriggered = false;
    const checkQueenWave = () => {
        if (queenWaveTriggered || gameOver || victory)
            return;
        if (canitoPos.x > -130)
            return;
        queenWaveTriggered = true;
        let spawned = 0, tries = 0;
        while (spawned < 8 && tries++ < 200) {
            const a = Math.random() * Math.PI * 2;
            const r = 28 + Math.random() * 55;
            const qx = canitoPos.x + Math.cos(a) * r;
            const qz = canitoPos.z + Math.sin(a) * r;
            if (addZombie(qx, qz, false, false, true))
                spawned++;
        }
        // Carro de la Vendimia: te persigue y lanza racimos, botellas y melones
        const cart = new VendimiaCart();
        cart.position.set(canitoPos.x - 45, 0, canitoPos.z + 20);
        cart.group.rotation.y = Math.atan2(canitoPos.x - cart.position.x, canitoPos.z - cart.position.z);
        engine.scene.add(cart.group);
        vendimiaCarts.push(cart);
        const warn = document.createElement('div');
        warn.textContent = '👑 ¡REINAS DE LA VENDIMIA!';
        warn.style.cssText = `
      position: fixed; top: 38%; left: 50%; transform: translate(-50%, -50%);
      font-size: 3rem; font-weight: 800;
      color: #ff50d0; text-shadow: 0 0 20px rgba(255,80,208,0.7);
      letter-spacing: 0.05em; pointer-events: none; z-index: 200;
      opacity: 0; transition: opacity 0.3s; text-align: center;
    `;
        document.body.appendChild(warn);
        requestAnimationFrame(() => { warn.style.opacity = '1'; });
        setTimeout(() => { warn.style.opacity = '0'; }, 1600);
        setTimeout(() => { warn.remove(); }, 2200);
    };
    const canitoPos = canito.getPosition(); // captured by closure; same Vector3 ref
    engine.start(dt => {
        // Game over: esperar un tap de Espacio para empezar de nuevo (no auto-reinicio)
        if (gameOver) {
            if (performance.now() - gameOverAt > 600 &&
                (input.keys.has('Space') || input.keys.has('KeyB'))) {
                location.reload();
            }
        }
        if (!gameOver && !victory)
            canito.update(dt, input.keys, colliders);
        thirdPerson.update(canito.getPosition(), canito.getYRot());
        // Invulnerabilidad tras revivir: parpadeo de Canito
        if (invuln > 0) {
            invuln -= dt;
            canito.group.visible = Math.floor(invuln * 12) % 2 === 0;
            if (invuln <= 0)
                canito.group.visible = true;
        }
        // Checkpoint: al cruzar al oeste de la Plaza Independencia, la próxima
        // reaparición es en su fuente.
        if (!passedPlaza && canitoPos.x < -130) {
            passedPlaza = true;
            checkpoint.x = 26; // junto a la fuente, fuera de su estanque
            checkpoint.z = 0;
        }
        effects.update(dt);
        env.update(dt, canitoPos.x, canitoPos.z);
        plaza.update(dt);
        // ── Bus Turístico: circula despacio y EMPUJA lo que tenga delante ────────
        cityBus.update(dt);
        {
            const push = CityBus.SPEED * dt + 0.18;
            if (!gameOver && !victory && cityBus.contains(canitoPos.x, canitoPos.z, 0.45)) {
                canitoPos.x += cityBus.dirX * push;
                canitoPos.z += cityBus.dirZ * push;
            }
            for (const z of zombies) {
                if (z.alive && cityBus.contains(z.position.x, z.position.z, 0.5)) {
                    z.position.x += cityBus.dirX * push;
                    z.position.z += cityBus.dirZ * push;
                }
            }
        }
        // ── Metrotranvía: arrolla y mata lo que pille (enemigos y Canito) ────────
        for (const tr of trams) {
            tr.update(dt);
            // Atropella a Canito → letal (pierde una vida)
            if (!gameOver && !victory && tr.hits(canitoPos.x, canitoPos.z, 0.4)) {
                sound.boom();
                setHP(0, tr.position.x, tr.position.z);
            }
            // Arrolla enemigos
            for (const z of zombies) {
                if (z.alive && tr.hits(z.position.x, z.position.z, 0.5))
                    killZombie(z);
            }
            for (const gc of gauchoCars) {
                if (gc.alive && tr.hits(gc.position.x, gc.position.z, 1.0)) {
                    gc.takeDamage(99);
                    if (!gc.alive) {
                        killCount++;
                        hudKills.textContent = killCount.toString();
                        effects.spawnExplosion(gc.position.clone());
                        sound.boom();
                        gc.remove(engine.scene);
                    }
                }
            }
        }
        // ── Disparo + carga del Aullido Cósmico ──────────────────────────────────
        // Tap = una bola de fuego. Mantener apretado = cargar el poder, y mientras
        // carga NO se sueltan bolas.
        const firing = !gameOver && !victory &&
            (input.keys.has('Space') || input.keys.has('KeyB'));
        const fireJustPressed = firing && !firePrev;
        firePrev = firing;
        if (firing) {
            powerCharge += dt / POWER_CHARGE_TIME;
            if (powerCharge >= 1) {
                powerCharge = 0;
                unleashPower();
            }
        }
        else {
            powerCharge = Math.max(0, powerCharge - dt / POWER_CHARGE_TIME * POWER_DRAIN_RATE);
        }
        hudPowerFill.style.width = (powerCharge * 100) + '%';
        hudPowerFill.classList.toggle('ready', powerCharge > 0.9);
        // Sólo dispara al pulsar (flanco), nunca mientras se mantiene/carga
        barkCD -= dt;
        if (fireJustPressed && barkCD <= 0) {
            barkCD = 0.2;
            const yr = canito.getYRot();
            tmpDir.set(Math.sin(yr), 0, Math.cos(yr));
            const origin = canitoPos.clone();
            origin.y += 0.75;
            origin.add(tmpDir.clone().multiplyScalar(0.9));
            const fb = new Fireball(origin, tmpDir);
            engine.scene.add(fb.group);
            fireballs.push(fb);
            sound.bark();
        }
        // ── Zombies ────────────────────────────────────────────────────────────
        for (const z of zombies) {
            if (!z.alive)
                continue;
            const r = z.update(dt, canitoPos, colliders);
            if (r.hitTarget && !gameOver) {
                setHP(canitoHP - (z.isCaballito ? 3 : 1), z.position.x, z.position.z);
                sound.bite();
            }
            // Throwers launch cars at range
            if (z.isThrower && !gameOver) {
                const thr = z.tryThrow(canitoPos, dt);
                if (thr) {
                    const tc = new ThrownCar(thr.origin, thr.vel);
                    engine.scene.add(tc.group);
                    thrownCars.push(tc);
                    sound.whoosh();
                }
            }
            // Queens lob grape bunches from a standoff distance
            if (z.isQueen && !gameOver) {
                const thr = z.tryThrowGrapes(canitoPos, dt);
                if (thr) {
                    const gb = new GrapeBunch(thr.origin, thr.vel);
                    engine.scene.add(gb.group);
                    grapeBunches.push(gb);
                    sound.whoosh();
                }
            }
            // Caballitos de Marly spit globs at range
            if (z.isCaballito && !gameOver) {
                const sp = z.trySpit(canitoPos, dt);
                if (sp) {
                    const s = new Spit(sp.origin, sp.vel);
                    engine.scene.add(s.group);
                    spits.push(s);
                    sound.whoosh();
                }
            }
            const d = Math.hypot(z.position.x - canitoPos.x, z.position.z - canitoPos.z);
            if (d < 35 && Math.random() < 0.012)
                sound.groan();
        }
        // ── Thrown cars ────────────────────────────────────────────────────────
        for (let i = thrownCars.length - 1; i >= 0; i--) {
            const tc = thrownCars[i];
            tc.update(dt, colliders);
            if (tc.alive) {
                const d = Math.hypot(tc.position.x - canitoPos.x, tc.position.z - canitoPos.z);
                const hY = tc.position.y < 2.4;
                if (d < ThrownCar.RADIUS + 0.5 && hY) {
                    // Direct hit on Canito
                    if (!gameOver)
                        setHP(canitoHP - ThrownCar.DAMAGE, tc.position.x, tc.position.z);
                    effects.spawnExplosion(tc.position.clone());
                    sound.boom();
                    tc.kill();
                }
                else if (tc.position.y < 0.05) {
                    // Ground impact — splash damage to nearby zombies & Canito
                    effects.spawnExplosion(tc.position.clone());
                    sound.boom();
                    for (const z of zombies) {
                        if (!z.alive)
                            continue;
                        if (Math.hypot(z.position.x - tc.position.x, z.position.z - tc.position.z) < 5) {
                            killZombie(z);
                        }
                    }
                    const cd = Math.hypot(canitoPos.x - tc.position.x, canitoPos.z - tc.position.z);
                    if (cd < 5 && !gameOver)
                        setHP(canitoHP - 3, tc.position.x, tc.position.z);
                    tc.kill();
                }
            }
            else if (tc.hitSolid) {
                // Smashed into a house/scenery — the player took cover. Explode there,
                // splashing only what's near the wall (not Canito if he's behind it).
                effects.spawnExplosion(tc.position.clone());
                sound.boom();
                for (const z of zombies) {
                    if (!z.alive)
                        continue;
                    if (Math.hypot(z.position.x - tc.position.x, z.position.z - tc.position.z) < 5) {
                        killZombie(z);
                    }
                }
                const cd = Math.hypot(canitoPos.x - tc.position.x, canitoPos.z - tc.position.z);
                if (cd < 5 && !gameOver)
                    setHP(canitoHP - 3, tc.position.x, tc.position.z);
            }
            if (!tc.alive) {
                tc.remove(engine.scene);
                thrownCars.splice(i, 1);
            }
        }
        // ── Racimos de uva (reinas) ──────────────────────────────────────────────
        for (let i = grapeBunches.length - 1; i >= 0; i--) {
            const gb = grapeBunches[i];
            gb.update(dt, colliders);
            if (gb.alive) {
                const d = Math.hypot(gb.position.x - canitoPos.x, gb.position.z - canitoPos.z);
                if (d < GrapeBunch.RADIUS + 0.5 && gb.position.y < 2.2) {
                    if (!gameOver)
                        setHP(canitoHP - GrapeBunch.DAMAGE, gb.position.x, gb.position.z);
                    gb.kill();
                }
            }
            if (!gb.alive) {
                gb.remove(engine.scene);
                grapeBunches.splice(i, 1);
            }
        }
        // ── Escupidas (Caballitos de Marly) ──────────────────────────────────────
        for (let i = spits.length - 1; i >= 0; i--) {
            const sp = spits[i];
            sp.update(dt, colliders);
            if (sp.alive) {
                const d = Math.hypot(sp.position.x - canitoPos.x, sp.position.z - canitoPos.z);
                if (d < Spit.RADIUS + 0.5 && sp.position.y < 2.2) {
                    if (!gameOver)
                        setHP(canitoHP - Spit.DAMAGE, sp.position.x, sp.position.z);
                    sp.kill();
                }
            }
            if (!sp.alive) {
                sp.remove(engine.scene);
                spits.splice(i, 1);
            }
        }
        // ── Proyectiles del carro vendimial (uvas, botellas, melones) ────────────
        for (let i = vendimiaThrows.length - 1; i >= 0; i--) {
            const vt = vendimiaThrows[i];
            vt.update(dt, colliders);
            if (vt.alive) {
                const d = Math.hypot(vt.position.x - canitoPos.x, vt.position.z - canitoPos.z);
                if (d < VendimiaThrow.RADIUS + 0.5 && vt.position.y < 2.2) {
                    if (!gameOver)
                        setHP(canitoHP - vt.damage, vt.position.x, vt.position.z);
                    vt.kill();
                }
            }
            if (!vt.alive) {
                vt.remove(engine.scene);
                vendimiaThrows.splice(i, 1);
            }
        }
        // ── Gaucho cars ────────────────────────────────────────────────────────
        for (const gc of gauchoCars) {
            if (!gc.alive)
                continue;
            // Ram-detonate: if a moving gaucho car touches a parked car, explode the
            // parked car. The blast itself may also kill the gaucho car.
            for (let ci = 0; ci < parkedCars.cars.length; ci++) {
                const car = parkedCars.cars[ci];
                if (car.exploded)
                    continue;
                if (Math.hypot(gc.position.x - car.x, gc.position.z - car.z) < 3.4) {
                    explodeCar(ci);
                    gc.takeDamage(1);
                    if (!gc.alive) {
                        effects.spawnExplosion(gc.position.clone());
                        sound.boom();
                        killCount++;
                        hudKills.textContent = killCount.toString();
                        gc.remove(engine.scene);
                    }
                    break;
                }
            }
            if (!gc.alive)
                continue;
            const r = gc.update(dt, canitoPos, colliders);
            if (r.hitTarget && !gameOver) {
                setHP(canitoHP - GauchoCar.HIT_DAMAGE, gc.position.x, gc.position.z);
                sound.boom();
                effects.spawnExplosion(gc.position.clone());
            }
        }
        // ── Carro de la Vendimia: persigue, embiste y lanza proyectiles ──────────
        for (const vc of vendimiaCarts) {
            if (!vc.alive)
                continue;
            const r = vc.update(dt, canitoPos, colliders);
            if (r.hitTarget && !gameOver) {
                setHP(canitoHP - VendimiaCart.HIT_DAMAGE, vc.position.x, vc.position.z);
                sound.boom();
            }
            if (!gameOver) {
                const thr = vc.tryThrow(canitoPos, dt);
                if (thr) {
                    const vt = new VendimiaThrow(thr.origin, thr.vel, thr.kind);
                    engine.scene.add(vt.group);
                    vendimiaThrows.push(vt);
                    sound.whoosh();
                }
            }
        }
        // ── Fireballs ──────────────────────────────────────────────────────────
        for (let i = fireballs.length - 1; i >= 0; i--) {
            const fb = fireballs[i];
            fb.update(dt, wallColliders);
            if (fb.alive) {
                // Zombie hits
                let hit = false;
                for (const z of zombies) {
                    if (!z.alive)
                        continue;
                    if (Math.hypot(z.position.x - fb.position.x, z.position.z - fb.position.z) < ZombieGaucho.HIT_RADIUS) {
                        fb.kill();
                        hit = true;
                        if (z.isQueen || z.isBoss || z.isCaballito) {
                            // Reinas (3), boss y caballitos (24) aguantan varias bolas de
                            // fuego — sangran en cada impacto y sólo caen al agotar su HP.
                            z.takeDamage(1);
                            effects.spawnBlood(z.position);
                            if (z.alive) {
                                sound.groan();
                            }
                            else {
                                killCount++;
                                hudKills.textContent = killCount.toString();
                                z.remove(engine.scene);
                            }
                        }
                        else {
                            killZombie(z);
                        }
                        break;
                    }
                }
                // Parked car hits — chain reaction possible
                if (!hit) {
                    for (let ci = 0; ci < parkedCars.cars.length; ci++) {
                        const car = parkedCars.cars[ci];
                        if (car.exploded)
                            continue;
                        if (Math.hypot(car.x - fb.position.x, car.z - fb.position.z) < 2.6) {
                            fb.kill();
                            explodeCar(ci);
                            hit = true;
                            break;
                        }
                    }
                }
                // Gaucho-driven car hits (multiple fireballs needed)
                if (!hit) {
                    for (const gc of gauchoCars) {
                        if (!gc.alive)
                            continue;
                        if (Math.hypot(gc.position.x - fb.position.x, gc.position.z - fb.position.z) < 2.5) {
                            gc.takeDamage(1);
                            fb.kill();
                            if (!gc.alive) {
                                killCount++;
                                hudKills.textContent = killCount.toString();
                                effects.spawnExplosion(gc.position.clone());
                                sound.boom();
                                // Splash damage on death — kill nearby zombies
                                for (const z of zombies) {
                                    if (!z.alive)
                                        continue;
                                    if (Math.hypot(z.position.x - gc.position.x, z.position.z - gc.position.z) < 7) {
                                        killZombie(z);
                                    }
                                }
                                gc.remove(engine.scene);
                            }
                            break;
                        }
                    }
                }
                // Carro de la Vendimia (10 de vida)
                if (!hit) {
                    for (const vc of vendimiaCarts) {
                        if (!vc.alive)
                            continue;
                        if (Math.hypot(vc.position.x - fb.position.x, vc.position.z - fb.position.z) < 4.2) {
                            vc.takeDamage(1);
                            fb.kill();
                            hit = true;
                            effects.spawnBlood(vc.position);
                            if (!vc.alive) {
                                killCount++;
                                hudKills.textContent = killCount.toString();
                                effects.spawnExplosion(vc.position.clone());
                                sound.boom();
                                vc.remove(engine.scene);
                            }
                            break;
                        }
                    }
                }
                // Fizzle against a building/wall only if it didn't hit a car or zombie
                if (!hit && fb.hitSolid)
                    fb.kill();
            }
            if (!fb.alive) {
                fb.remove(engine.scene);
                fireballs.splice(i, 1);
            }
        }
        // ── Huesitos de salud ──────────────────────────────────────────────────
        for (let i = bones.length - 1; i >= 0; i--) {
            const b = bones[i];
            b.update(dt);
            if (b.alive && !gameOver) {
                if (Math.hypot(b.position.x - canitoPos.x, b.position.z - canitoPos.z) < Bone.PICKUP_R) {
                    b.pickup();
                    setHP(Math.min(MAX_HP, canitoHP + Bone.HEAL));
                    sound.pickup();
                    b.remove(engine.scene);
                    bones.splice(i, 1);
                }
            }
        }
        // ── Compass arrow follows Canito, points to Portones ───────────────────
        {
            const ax = PORTONES_X - canitoPos.x;
            const az = PORTONES_Z - canitoPos.z;
            compass.position.set(canitoPos.x, canitoPos.y + 3.5 + Math.sin(performance.now() * 0.003) * 0.10, canitoPos.z);
            compass.rotation.y = Math.atan2(ax, az);
            // Hide when very close to the goal
            compass.visible = Math.hypot(ax, az) > 8;
        }
        // ── Ambush + victory + coords HUD ──────────────────────────────────────
        checkAmbush();
        checkQueenWave();
        checkVictory();
        const [lat, lon] = proj.unproject(canitoPos.x, canitoPos.z);
        hudLat.textContent = lat.toFixed(5);
        hudLon.textContent = lon.toFixed(5);
        hudAlt.textContent = Math.round(canitoPos.y).toString();
    });
}
main().catch(console.error);
