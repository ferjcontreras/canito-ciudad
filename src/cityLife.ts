// ── Canito en la Ciudad ─────────────────────────────────────────────────────
// Modo "ciudad viva": el mismo escenario de Mendoza, pero sin zombies. Canito
// pasea por una ciudad con peatones (que caminan por las veredas y cruzan en
// las esquinas), autos y motos circulando, y vida en las plazas (gente, niños
// jugando, perritos). Reutiliza todos los builders del mundo de main.ts.
import * as THREE from 'three';
import { Engine }            from './core/Engine';
import { ThirdPersonCamera } from './core/ThirdPersonCamera';
import { InputManager }      from './core/InputManager';
import { Canito }            from './entities/Canito';
import type { AABB }         from './entities/Canito';
import { Tram }              from './entities/Tram';
import { CityBus }           from './entities/CityBus';
import { buildMendozaLayout } from './geo/MendozaLayout';
import { Projection }        from './geo/Projection';
import type { OSMNode, OSMWay } from './geo/types';
import { buildBuildings }    from './world/BuildingBuilder';
import { buildInfillHouses } from './world/InfillBuilder';
import { buildCommercialStrip } from './world/CommercialBuilder';
import { buildStreets }      from './world/StreetBuilder';
import { buildTerrain, buildParkZone, buildPlazaZone, polygonArea } from './world/TerrainBuilder';
import { buildParkedCars }   from './world/ParkedCarsBuilder';
import { buildPortones, buildParkWall } from './world/LandmarkBuilder';
import { buildPlazaIndependencia } from './world/PlazaIndependencia';
import { buildTramLine }     from './world/TramBuilder';
import { buildEnvironment }  from './world/Environment';
import { buildUrbanFixtures } from './world/UrbanFixtures';
import { buildPublicBuildings } from './world/PublicBuildings';
import { createTreeGeos, scatterTreesInPolygon, addAvenueTree, scatterStreetTrees, commitTrees } from './world/TreeBuilder';
import { buildStreetLampsAlongRoads, buildStreetLamps, buildBenches, buildBenchesAt } from './world/UrbanFurnitureBuilder';
import { LoadingOverlay }    from './ui/LoadingOverlay';
import { CityGraph }         from './city/CityGraph';
import { PedestrianManager } from './city/Pedestrians';
import { TrafficManager, type Obstacle } from './city/Traffic';
import { PlazaLife, type PlazaSpec } from './city/PlazaLife';
import { buildStations, TransitManager } from './city/Transit';
import { TrafficLights } from './city/TrafficLights';
import { CityAudio } from './city/CityAudio';
import { QuestManager } from './city/Quest';
import { MendozaActors } from './city/MendozaActors';
import { CatManager } from './city/Cats';
import { Progress } from './city/Progress';
import { DigSpots } from './city/DigSpots';
import { Bone } from './entities/Bone';
import { upgradeToPBR } from './world/pbr';

const CENTER     = { lat: -32.8895, lon: -68.8458 };
const PORTONES_X = -900;
const PORTONES_Z = 0;

function buildAvenue(scene: THREE.Scene, x0: number, z0: number, x1: number, z1: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
  const nx = -dz, nz = dx;
  const steps = Math.ceil(len / 18);
  const strip = (halfW: number, y: number, color: number) => {
    const verts: number[] = [], idx: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * len;
      const x = x0 + dx * t, z = z0 + dz * t;
      verts.push(x + nx * halfW, y, z + nz * halfW);
      verts.push(x - nx * halfW, y, z - nz * halfW);
    }
    for (let i = 0; i < steps; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    mesh.receiveShadow = true; scene.add(mesh);
  };
  strip(6, 0.06, 0x3a3a3e);
  strip(0.14, 0.075, 0xe8d860);
}

async function main(): Promise<void> {
  const loading = new LoadingOverlay();
  const engine  = new Engine();
  const proj    = new Projection(CENTER);
  const colliders: AABB[] = [];

  loading.setMessage('Generando Mendoza…');
  const osmData = buildMendozaLayout();

  const nodeMap: Map<number, OSMNode> = new Map();
  const buildings: OSMWay[] = [];
  const streets:   OSMWay[] = [];
  const parks:     OSMWay[] = [];
  const osmTrees: OSMNode[] = [], osmLamps: OSMNode[] = [], osmBenches: OSMNode[] = [];

  for (const el of osmData.elements) {
    if (el.type === 'node') {
      nodeMap.set(el.id, el);
      const tags = el.tags ?? {};
      if (tags['natural'] === 'tree')             osmTrees.push(el);
      else if (tags['highway'] === 'street_lamp') osmLamps.push(el);
      else if (tags['amenity'] === 'bench')       osmBenches.push(el);
    } else if (el.type === 'way') {
      if (el.tags.building)                        buildings.push(el);
      else if (el.tags.highway)                    streets.push(el);
      else if (el.tags.landuse || el.tags.leisure || el.tags.natural) parks.push(el);
    }
  }

  // ── Máscara de calzada ─────────────────────────────────────────────────────
  // ¿Cae el punto sobre el asfalto de alguna calle? La usamos para que ningún
  // árbol (de vereda, de plaza o de la alameda) termine plantado sobre la calle.
  const ROAD_HW: Record<string, number> = {
    motorway: 9, trunk: 7, primary: 6, primary_link: 3.5,
    secondary: 5, secondary_link: 3, tertiary: 4, tertiary_link: 2.5,
    residential: 3.5, unclassified: 3.5, living_street: 2.5, road: 3.5,
  };
  const roadSegs: Array<{ ax: number; az: number; bx: number; bz: number; hw: number }> = [];
  for (const way of streets) {
    const type = way.tags.highway;
    if (!type) continue;
    const hw = ROAD_HW[type] ?? 3.5;
    const p: [number, number][] = [];
    for (const nid of way.nodes) { const nd = nodeMap.get(nid); if (nd) p.push(proj.project(nd.lat, nd.lon)); }
    for (let i = 0; i < p.length - 1; i++)
      roadSegs.push({ ax: p[i][0], az: p[i][1], bx: p[i + 1][0], bz: p[i + 1][1], hw });
  }
  const onRoad = (x: number, z: number, margin = 0.3): boolean => {
    for (const s of roadSegs) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const L2 = dx * dx + dz * dz;
      if (L2 < 1e-6) continue;
      let t = ((x - s.ax) * dx + (z - s.az) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = s.ax + dx * t, pz = s.az + dz * t;
      if (Math.hypot(x - px, z - pz) < s.hw + margin) return true;
    }
    return false;
  };

  // ── Mundo (mismo escenario que el juego) ──────────────────────────────────
  loading.setMessage('Construyendo ciudad…');
  buildTerrain(engine.scene, 4000);
  const env = buildEnvironment(engine.scene);
  const treeGeos = createTreeGeos();

  const noBuildZones: AABB[] = [];
  const extraBenches: Array<{ x: number; z: number; rotY: number }> = [];

  const plaza = buildPlazaIndependencia(engine.scene, 0, 0);
  colliders.push(...plaza.colliders);
  const plazaAvoid: AABB[] = plaza.colliders.map(c => ({
    minX: c.minX - 3, maxX: c.maxX + 3, minZ: c.minZ - 3, maxZ: c.maxZ + 3,
  }));

  for (const way of parks) {
    const nodes = way.nodes.map(nid => nodeMap.get(nid)).filter((n): n is OSMNode => n !== undefined);
    if (nodes.length < 3) continue;
    const pts = nodes.map(n => proj.project(n.lat, n.lon) as [number, number]);
    const isForest = way.tags.landuse === 'forest' || way.tags.natural === 'wood';
    const area = polygonArea(pts);
    const name = (way.tags.name ?? '').toLowerCase();
    const isNamedPlaza = /^plaza\b/.test(name);
    const isPlaza = isNamedPlaza || (!isForest && area < 8000 &&
      (way.tags.leisure === 'park' || way.tags.leisure === 'garden' ||
       way.tags.leisure === 'pitch' || way.tags.leisure === 'playground' ||
       way.tags.landuse === 'recreation_ground' || way.tags.landuse === 'grass'));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
    noBuildZones.push({ minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 });
    if (isForest) {
      buildParkZone(engine.scene, pts, 0x466a36);
      scatterTreesInPolygon(treeGeos, colliders, pts, 10, 1.1, 4, [], onRoad);
    } else if (isPlaza) {
      buildPlazaZone(engine.scene, pts);
      const avoid = name.includes('independencia') ? plazaAvoid : [];
      scatterTreesInPolygon(treeGeos, colliders, pts, 18, 0.85, 3, avoid, onRoad);
      const cxP = (minX + maxX) / 2, czP = (minZ + maxZ) / 2;
      const ringR = Math.min(maxX - minX, maxZ - minZ) * 0.18 + 5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        extraBenches.push({ x: cxP + Math.cos(a) * ringR, z: czP + Math.sin(a) * ringR, rotY: a + Math.PI / 2 });
      }
    } else {
      buildParkZone(engine.scene, pts, 0x6a9a50);
      scatterTreesInPolygon(treeGeos, colliders, pts, 16, 0.95, 4, [], onRoad);
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
  const TRAM_CX = -400, TRAM_CZ = -50, TRAM_ANGLE = 0, TRAM_HALFLEN = 580, TRAM_CORRIDOR_HW = 9.5;
  const _tSin = Math.sin(TRAM_ANGLE), _tCos = Math.cos(TRAM_ANGLE);
  const onTramCorridor = (x: number, z: number): boolean => {
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
  const MITRE_SEGS: Array<[number, number]> = [[-560, -110], [110, 480]];
  for (const [z0, z1] of MITRE_SEGS) for (let z = z0; z <= z1; z += 12)
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
    const medianPiece = (a: number, b: number) => {
      if (b - a < 2) return;
      const l = b - a, c = (a + b) / 2;
      const curb = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, l), curbMat);
      curb.position.set(MITRE_X, 0.14, c); engine.scene.add(curb);
      const grass = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, l), grassMat);
      grass.position.set(MITRE_X, 0.26, c); grass.receiveShadow = true; engine.scene.add(grass);
      for (let z = a + 7; z < b - 5; z += 15) addAvenueTree(treeGeos, MITRE_X, z, 1.0);
      for (let z = a + 14; z < b - 8; z += 30) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 4.2, 8), poleMat);
        pole.position.set(MITRE_X, 2.4, z); engine.scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat);
        lamp.position.set(MITRE_X, 4.5, z); engine.scene.add(lamp);
      }
    };
    for (const [z0, z1] of MITRE_SEGS) {
      const len = z1 - z0, cz = (z0 + z1) / 2;
      const asp = new THREE.Mesh(new THREE.BoxGeometry(13, 0.04, len), asphalt);
      asp.position.set(MITRE_X, 0.06, cz); asp.receiveShadow = true; engine.scene.add(asp);
      let start = z0;
      for (let c = Math.ceil(z0 / 100) * 100; c <= z1; c += 100) { medianPiece(start, c - GAP); start = c + GAP; }
      medianPiece(start, z1);
    }
  }

  buildUrbanFixtures(engine.scene, streets, nodeMap, proj, { trafficLights: false });
  buildPublicBuildings(engine.scene, colliders, noBuildZones);
  colliders.push(...buildBuildings(engine.scene, buildings, nodeMap, proj));

  const SANMARTIN_X = 400;
  colliders.push(...buildCommercialStrip(engine.scene, SANMARTIN_X, -580, 480, colliders));
  for (let z = -580; z <= 480; z += 12)
    noBuildZones.push({ minX: SANMARTIN_X - 13, maxX: SANMARTIN_X + 13, minZ: z - 8, maxZ: z + 8 });

  loading.setMessage('Construyendo edificios…');
  colliders.push(...buildInfillHouses(engine.scene, streets, nodeMap, proj, colliders, noBuildZones));
  scatterStreetTrees(treeGeos, streets, nodeMap, proj, onRoad);

  for (const n of osmTrees) { const [x, z] = proj.project(n.lat, n.lon); addAvenueTree(treeGeos, x, z, 0.8 + Math.random() * 0.4); }

  const avX0 = -110, avZ0 = 0;
  buildAvenue(engine.scene, avX0, avZ0, PORTONES_X, PORTONES_Z);
  const avLen = Math.hypot(PORTONES_X - avX0, PORTONES_Z - avZ0);
  const avDx = (PORTONES_X - avX0) / avLen, avDz = (PORTONES_Z - avZ0) / avLen;
  const avPx = -avDz, avPz = avDx;
  for (let t = 20; t < avLen - 12; t += 18) {
    const ax = avX0 + avDx * t, az = avZ0 + avDz * t;
    const rx = ax + avPx * 10, rz = az + avPz * 10;
    const lx = ax - avPx * 10, lz = az - avPz * 10;
    if (!onRoad(rx, rz)) addAvenueTree(treeGeos, rx, rz, 0.9);   // no plantar sobre las calles que cruza
    if (!onRoad(lx, lz)) addAvenueTree(treeGeos, lx, lz, 0.9);
  }

  colliders.push(...buildPortones(engine.scene, PORTONES_X, PORTONES_Z));
  colliders.push(...buildParkWall(engine.scene, PORTONES_X, -700, 550, -50, 50));

  // Metrotranvía con estaciones en el boulevard de Belgrano.
  buildTramLine(engine.scene, TRAM_CX, TRAM_CZ, TRAM_ANGLE, TRAM_HALFLEN);
  const TRAM_TRAVEL = 480;
  // Estaciones: posiciones z sobre Belgrano, SIEMPRE a media cuadra (las calles
  // E-O cruzan en los múltiplos de 100, así que el andén no debe caer ahí). La
  // del medio iba en z=0 = calle Sarmiento; se corre a z=-50.  s = z - TRAM_CZ.
  const STATION_Z = [-250, -50, 250];
  const STOPS = STATION_Z.map(z => z - TRAM_CZ);
  const trams: Tram[] = [
    new Tram(TRAM_CX, TRAM_CZ, TRAM_ANGLE, -2.6, TRAM_TRAVEL, -TRAM_TRAVEL, 1, STOPS),
    new Tram(TRAM_CX, TRAM_CZ, TRAM_ANGLE,  2.6, TRAM_TRAVEL,  TRAM_TRAVEL, -1, STOPS),
  ];
  for (const t of trams) engine.scene.add(t.group);

  // Andenes + colliders de refugios (lado este de las vías)
  const { stations, colliders: stationCols } = buildStations(engine.scene, TRAM_CX, STATION_Z);
  colliders.push(...stationCols);

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
  // Los autos NO circulan por las vías del tranvía (tramo N-S sobre Belgrano,
  // x≈TRAM_CX): bloqueamos esas aristas para los vehículos.
  const vehicleAllow = (i: number): boolean => {
    const e = graph.edges[i];
    return !(Math.abs(e.ax - TRAM_CX) < 8 && Math.abs(e.bx - TRAM_CX) < 8);
  };
  const lights      = new TrafficLights(engine.scene, graph);
  const traffic     = new TrafficManager(engine.scene, graph, 440, 120, vehicleAllow, lights);
  colliders.push(...traffic.colliders());   // autos sólidos: Canito no los atraviesa
  const plazaSpecs: PlazaSpec[] = [
    { cx: 0, cz: 0, radius: 40 },
    { cx: 250, cz: -250, radius: 20 },
    { cx: -250, cz: -250, radius: 20 },
    { cx: -250, cz: 250, radius: 20 },
    { cx: 250, cz: 250, radius: 20 },
  ];
  const plazaLife = new PlazaLife(engine.scene, plazaSpecs);

  // Pasajeros del metrotranvía: esperan en los andenes y se suben al tranvía de
  // la vía este (lateral +2.6, el que queda junto a los andenes).
  const transit = new TransitManager(engine.scene, [trams[1]], stations, 30);

  // ── Audio ambiente (cama de ciudad + motores + bocinas reales) ─────────────
  // El navegador exige un gesto del usuario para iniciar WebAudio.
  const audio = new CityAudio();
  const audioEvents = ['keydown', 'pointerdown', 'click', 'touchstart'] as const;
  const unlockAudio = () => {
    audio.unlock();
    // Reintentar en cada gesto: sólo dejamos de escuchar cuando de verdad sonó.
    if (audio.state === 'running') {
      for (const ev of audioEvents) window.removeEventListener(ev, unlockAudio);
    }
  };
  for (const ev of audioEvents) window.addEventListener(ev, unlockAudio);

  // Indicador de audio en pantalla (diagnóstico): estado del AudioContext,
  // si cargaron los samples, y cuántos vehículos/peatones hay cerca.
  // Tecla C: calidad de render. Tecla M: música on/off.
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyC') engine.cycleQuality();
    else if (e.code === 'KeyM') audio.toggleMusic();
  });

  // Botón explícito para activar el sonido. Un click sobre un <button> real es
  // el gesto más confiable para que el navegador deje arrancar el AudioContext.
  const soundBtn = document.createElement('button');
  soundBtn.textContent = '🔊 Activar sonido';
  soundBtn.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);' +
    'z-index:400;font:600 15px system-ui,sans-serif;color:#0d1117;background:#7eff8a;' +
    'border:none;border-radius:10px;padding:10px 18px;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,0.4);';
  soundBtn.addEventListener('click', () => { audio.unlock(); });
  document.body.appendChild(soundBtn);

  // ── Personaje + cámara ─────────────────────────────────────────────────────
  const input       = new InputManager();
  const canito      = new Canito(engine.scene);
  const thirdPerson = new ThirdPersonCamera();
  // Arranca al borde sur de Plaza Independencia (sobre Av. Mitre), mirando a la
  // plaza: ahí se ve enseguida gente, niños, perritos, la fuente y el bus.
  const START_X = 0, START_Z = 140;
  canito.group.position.set(START_X, 0, START_Z);
  canito.setYRot(Math.atan2(0 - START_X, 0 - START_Z));   // mirando a la plaza (norte)
  engine.setCamera(thirdPerson.camera);

  // HUD
  const hudLat = document.getElementById('hud-lat');
  const hudLon = document.getElementById('hud-lon');

  // ── Misión: "Canito y el último mate" ───────────────────────────────────────
  const quest = new QuestManager(engine.scene);

  // Actores que dan vida a Mendoza (músico, ajedrez, mate, turistas, niños…)
  const actors = new MendozaActors(engine.scene);

  // Gatitos enemigos: territoriales, arañan a Canito si se acerca.
  const cats = new CatManager(engine.scene, [
    [60, -70], [-70, 80], [420, -30], [-160, 110],
    [-430, -70], [-650, 40], [230, 210], [-250, -250],
  ]);

  // ── Economía + reputación (persistente) y tesoros enterrados ────────────────
  const progress = new Progress();
  progress.load();
  const digSpots = new DigSpots(engine.scene, [
    [40, -40], [330, 70], [-120, -60], [-300, 120],
    [-520, -30], [-760, 20], [200, -180], [-250, 240],
  ]);


  // Huesitos repartidos por la ruta para recuperar vida.
  const bonePositions: Array<[number, number]> = [
    [0, 95], [16, 50], [180, 35], [388, -25], [120, -30],
    [-130, -45], [-388, -95], [-600, -5], [-820, -25], [-980, 0],
  ];
  const bones: Bone[] = [];
  for (const [bx, bz] of bonePositions) {
    const b = new Bone();
    b.position.set(bx, 0.25, bz);
    engine.scene.add(b.group);
    bones.push(b);
  }

  // Pase PBR: convierte todos los materiales del mundo a MeshStandard para que
  // respondan al tone mapping, la oclusión ambiental y los reflejos del entorno.
  upgradeToPBR(engine.scene);

  loading.hide();

  // ── HUD de la misión: barras (noche/vida), prompt, diálogo y overlays ──────
  const mkBar = (label: string, color: string, top: number): HTMLDivElement => {
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;left:14px;top:${top}px;z-index:300;width:180px;` +
      'background:rgba(13,17,23,0.82);border:1px solid rgba(255,255,255,0.08);' +
      'border-radius:8px;padding:5px 8px;font:600 11px system-ui,sans-serif;color:#c9d1d9;';
    const lab = document.createElement('div');
    lab.textContent = label; lab.style.marginBottom = '3px';
    const bg = document.createElement('div');
    bg.style.cssText = 'height:8px;background:rgba(255,255,255,0.1);border-radius:5px;overflow:hidden';
    const fill = document.createElement('div');
    fill.style.cssText = `height:100%;width:100%;background:${color};border-radius:5px`;
    bg.appendChild(fill); wrap.appendChild(lab); wrap.appendChild(bg);
    document.body.appendChild(wrap);
    return fill;
  };
  const nightFill = mkBar('🌇 Atardece…', '#ff9d4a', 70);
  const vidaFill = mkBar('❤️ Vida', '#7eff8a', 122);

  const promptEl = document.createElement('div');
  promptEl.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);z-index:310;' +
    'font:600 14px system-ui,sans-serif;color:#0d1117;background:#ffe040;padding:7px 14px;' +
    'border-radius:20px;opacity:0;transition:opacity .15s;pointer-events:none;';
  document.body.appendChild(promptEl);

  const dlgBox = document.createElement('div');
  dlgBox.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);z-index:310;' +
    'max-width:560px;font:14px system-ui,sans-serif;color:#fff;background:rgba(13,17,23,0.92);' +
    'border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px 18px;line-height:1.5;' +
    'opacity:0;transition:opacity .2s;pointer-events:none;text-align:center;';
  document.body.appendChild(dlgBox);

  const hurtFlash = document.createElement('div');
  hurtFlash.style.cssText = 'position:fixed;inset:0;z-index:305;pointer-events:none;' +
    'box-shadow:inset 0 0 120px 40px rgba(255,40,40,0.55);opacity:0;transition:opacity .25s;';
  document.body.appendChild(hurtFlash);

  // Burbuja de pensamiento de Canito
  const thoughtBox = document.createElement('div');
  thoughtBox.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:310;' +
    'max-width:460px;font:14px system-ui,sans-serif;color:#dfe7ef;background:rgba(13,17,23,0.86);' +
    'border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:9px 16px;line-height:1.4;' +
    'opacity:0;transition:opacity .25s;pointer-events:none;text-align:center;';
  document.body.appendChild(thoughtBox);

  // Hint del modo olfato
  const smellHint = document.createElement('div');
  smellHint.textContent = '👃 Olfato (F)';
  smellHint.style.cssText = 'position:fixed;bottom:16px;right:14px;z-index:300;' +
    'font:600 12px system-ui,sans-serif;color:#0d1117;background:#bfe7ff;opacity:0.6;' +
    'padding:6px 11px;border-radius:14px;pointer-events:none;';
  document.body.appendChild(smellHint);

  // Contador de recuerdos
  const memHud = document.createElement('div');
  memHud.style.cssText = 'position:fixed;left:14px;top:174px;z-index:300;' +
    'font:600 12px system-ui,sans-serif;color:#ffe66a;background:rgba(13,17,23,0.82);' +
    'border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:5px 9px;pointer-events:none;';
  document.body.appendChild(memHud);

  // Huesos (moneda) + reputación
  const walletHud = document.createElement('div');
  walletHud.style.cssText = 'position:fixed;left:14px;top:204px;z-index:300;width:180px;' +
    'font:600 12px system-ui,sans-serif;color:#c9d1d9;background:rgba(13,17,23,0.82);' +
    'border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 9px;pointer-events:none;line-height:1.5;';
  document.body.appendChild(walletHud);
  const renderWallet = () => {
    walletHud.innerHTML = `🦴 Huesos: <b style="color:#ffe66a">${progress.huesos}</b><br>` +
      `🧑 Vecinos: <b style="color:#7eff8a">${progress.repLabel()}</b>`;
  };
  renderWallet();

  // ── Viaje rápido (taxi / colectivo): botón + menú de destinos ───────────────
  const TRAVEL: Array<{ name: string; x: number; z: number }> = [
    { name: 'Plaza Independencia', x: 0, z: 60 },
    { name: 'Av. San Martín', x: 388, z: 40 },
    { name: 'Plaza San Martín', x: 250, z: -250 },
    { name: 'Portones del Parque', x: -875, z: 0 },
    { name: 'La largada', x: 0, z: 140 },
  ];
  const TRAVEL_COST = 2;
  const travelBtn = document.createElement('button');
  travelBtn.textContent = '🚕 Pedir viaje (V)';
  travelBtn.style.cssText = 'position:fixed;bottom:50px;right:14px;z-index:320;cursor:pointer;' +
    'font:600 12px system-ui,sans-serif;color:#0d1117;background:#ffd24a;border:none;' +
    'border-radius:14px;padding:7px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.4);';
  document.body.appendChild(travelBtn);
  const travelMenu = document.createElement('div');
  travelMenu.style.cssText = 'position:fixed;inset:0;z-index:450;display:none;align-items:center;' +
    'justify-content:center;background:rgba(8,10,14,0.72);font-family:system-ui,sans-serif;';
  document.body.appendChild(travelMenu);

  let travelOpen = false;
  const closeTravel = () => { travelOpen = false; travelMenu.style.display = 'none'; };
  const openTravel = () => {
    travelOpen = true;
    travelMenu.innerHTML = '';
    const panel = document.createElement('div');
    panel.style.cssText = 'background:rgba(13,17,23,0.96);border:1px solid rgba(255,255,255,0.14);' +
      'border-radius:14px;padding:18px 20px;min-width:280px;color:#fff;text-align:center;';
    panel.innerHTML = '<div style="font-weight:800;font-size:1.1rem;margin-bottom:4px">🚕 ¿A dónde vamos?</div>' +
      `<div style="color:#8b949e;font-size:0.8rem;margin-bottom:12px">Cuesta ${TRAVEL_COST} 🦴 · tenés ${progress.huesos}</div>`;
    for (const d of TRAVEL) {
      const b = document.createElement('button');
      b.textContent = d.name;
      b.style.cssText = 'display:block;width:100%;margin:4px 0;cursor:pointer;font:600 13px system-ui;' +
        'color:#0d1117;background:#7eff8a;border:none;border-radius:8px;padding:8px;';
      b.onclick = () => {
        if (!progress.spend(TRAVEL_COST)) { b.textContent = '¡No te alcanzan los huesos!'; return; }
        renderWallet();
        const fade = document.createElement('div');
        fade.style.cssText = 'position:fixed;inset:0;z-index:600;background:#000;opacity:0;transition:opacity .25s;pointer-events:none;';
        document.body.appendChild(fade);
        requestAnimationFrame(() => { fade.style.opacity = '1'; });
        setTimeout(() => {
          canito.group.position.set(d.x, 0, d.z);
          fade.style.opacity = '0';
          setTimeout(() => fade.remove(), 320);
        }, 260);
        closeTravel();
      };
      panel.appendChild(b);
    }
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancelar';
    cancel.style.cssText = 'display:block;width:100%;margin-top:8px;cursor:pointer;font:600 12px system-ui;' +
      'color:#c9d1d9;background:rgba(255,255,255,0.08);border:none;border-radius:8px;padding:7px;';
    cancel.onclick = closeTravel;
    panel.appendChild(cancel);
    travelMenu.appendChild(panel);
    travelMenu.style.display = 'flex';
  };
  travelBtn.addEventListener('click', () => { travelOpen ? closeTravel() : openTravel(); });
  window.addEventListener('keydown', e => { if (e.code === 'KeyV') (travelOpen ? closeTravel() : openTravel()); });

  // Tecla F: alterna el olfato. Al activarlo refresca el rastro; si ya estaba
  // oliendo, lo apaga. Igual se disipa solo con el tiempo.
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyF') quest.setSmell(!quest.smellMode);
  });

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:500;display:none;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:14px;background:rgba(8,10,14,0.78);' +
    'font-family:system-ui,sans-serif;color:#fff;text-align:center;';
  document.body.appendChild(overlay);
  const endGame = (title: string, sub: string, color: string) => {
    overlay.innerHTML =
      `<div style="font-size:3rem;font-weight:800;color:${color}">${title}</div>` +
      `<div style="font-size:1.1rem;color:#c9d1d9;max-width:560px">${sub}</div>` +
      '<div style="font-size:0.9rem;color:#8b949e;margin-top:10px">Apretá <b>Espacio</b> para jugar de nuevo</div>';
    overlay.style.display = 'flex';
  };

  // Buffers reusados por frame para el tránsito
  const obstacles: Obstacle[] = [];
  const pedBuf: { x: number; z: number }[] = [];
  let ambientHonkCD = 4;   // cuenta regresiva para el próximo bocinazo ambiental

  // ── Corazones flotantes cuando la gente lo acaricia ─────────────────────────
  const heartTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d')!; c.font = '52px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('❤️', 32, 36);
    const t = new THREE.CanvasTexture(cv); return t;
  })();
  interface Heart { sp: THREE.Sprite; life: number; }
  const hearts: Heart[] = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false }));
    sp.scale.setScalar(0.6); sp.visible = false;
    engine.scene.add(sp);
    hearts.push({ sp, life: 0 });
  }
  let heartCD = 0;
  const emitHeart = (x: number, z: number) => {
    const h = hearts.find(h => h.life <= 0);
    if (!h) return;
    h.life = 1.4;
    h.sp.position.set(x + (Math.random() - 0.5), 2.2, z + (Math.random() - 0.5));
    h.sp.visible = true;
  };

  // ── Estado de la misión ─────────────────────────────────────────────────────
  const NIGHT_SECONDS = 600;    // ~10 min hasta que cae la noche
  let night = 0;                // 0..1
  let vida = 1;                 // 0..1 (HP)
  let sustoCD = 0;
  let over = false;             // perdió o ganó (frena la jugabilidad)
  let overAt = 0;
  let prevTalk = false;         // flanco de la tecla E
  let dialogueUntil = 0;        // ms hasta cuando se muestra el diálogo
  let prevSmell = false;        // flanco del modo olfato
  let smellApplied = false;     // filtro de desaturación aplicado al canvas
  let prevBark = false;         // flanco de la tecla de ladrido
  let prevTrick = false, prevDig = false;
  let trickCD = 0;

  // Pensamientos de Canito (con cooldown global y por tipo, para no spamear)
  const thoughtCD = new Map<string, number>();
  let lastThought = 0, thoughtHideAt = 0;
  const think = (id: string, text: string) => {
    const now = performance.now();
    if (now - lastThought < 5000) return;                          // no encadenar
    if (now - (thoughtCD.get(id) ?? -1e9) < 22000) return;          // no repetir seguido
    thoughtCD.set(id, now); lastThought = now;
    thoughtBox.innerHTML = `🐶 💭 <i>${text}</i>`;
    thoughtBox.style.opacity = '1';
    thoughtHideAt = now + 4500;
  };

  const showDialogue = (name: string, text: string) => {
    dlgBox.innerHTML = `<b style="color:#ffe040">${name}</b><br>${text}`;
    dlgBox.style.opacity = '1';
    dialogueUntil = performance.now() + 7000;
  };
  const lose = (title: string, sub: string) => {
    if (over) return;
    over = true; overAt = performance.now();
    endGame(title, sub, '#ff5a5a');
  };
  const win = () => {
    if (over) return;
    over = true; overAt = performance.now();
    const mem = quest.memoriesFound, total = quest.memoriesTotal;
    const dogs = plazaLife.helpedDogs();
    if (mem >= total) {
      endGame('🌟 ¡Final excelente!',
        `Encontraste a Don Ernesto Y todos los recuerdos de Canito (${mem}/${total}). Una vida entera juntos, ahora completa.`, '#ffe66a');
    } else if (dogs >= 3) {
      endGame('💚 ¡Buen final!',
        `Encontraste a Don Ernesto y, de paso, hiciste ${dogs} amigos perrunos en el camino. (Recuerdos: ${mem}/${total})`, '#7effd0');
    } else {
      endGame('🐾 ¡En casa!',
        `Canito reencontró a Don Ernesto en el lago del Parque. Vuelven juntos, al atardecer. (Recuerdos: ${mem}/${total})`, '#7eff8a');
    }
  };

  think('start', '¿Dónde se metió mi humano…? Tengo que encontrarlo.');

  engine.start(dt => {
    if (!over) canito.update(dt, input.keys, colliders);
    const p = canito.getPosition();
    thirdPerson.update(p, canito.getYRot());

    // Reinicio tras ganar/perder (un toque de Espacio)
    if (over && performance.now() - overAt > 700 && input.keys.has('Space')) location.reload();

    pedestrians.update(dt);
    lights.update(dt);

    // Obstáculos ante los que los autos frenan: Canito (le tocan bocina) y
    // peatones, y el tranvía (esos no ameritan bocina).
    obstacles.length = 0;
    obstacles.push({ x: p.x, z: p.z, r: 0.9, honk: true });
    pedBuf.length = 0; pedestrians.positions(pedBuf);
    for (const q of pedBuf) obstacles.push({ x: q.x, z: q.z, r: 0.5, honk: false });
    for (const t of trams) obstacles.push({ x: t.position.x, z: t.position.z, r: 14, honk: false });
    traffic.update(dt, obstacles, (hx, hz, moto) => audio.honkAt(hx, hz, moto));

    plazaLife.update(dt);
    for (const t of trams) t.update(dt);
    transit.update(dt);
    cityBus.update(dt);

    env.update(dt, p.x, p.z);
    plaza.update(dt);

    // ── Audio: motores cercanos, pasos de la gente y bocinas ─────────────────
    const vehStates = traffic.states();
    // "Gente caminando": cuántos peatones hay alrededor del jugador (pedBuf ya
    // tiene sus posiciones de este frame).
    let pedsNear = 0;
    for (const q of pedBuf) if (Math.hypot(q.x - p.x, q.z - p.z) < 18) pedsNear++;
    const walkLevel = Math.min(1, pedsNear / 6);
    const tramPos = trams.map(t => ({ x: t.position.x, z: t.position.z }));
    audio.update(dt, p.x, p.z, canito.getYRot(), vehStates, walkLevel, tramPos);

    if (audio.state === 'running') soundBtn.style.display = 'none';

    // Bocinazos ambientales: cada tanto, un auto/moto cercano al azar toca bocina
    ambientHonkCD -= dt;
    if (ambientHonkCD <= 0) {
      ambientHonkCD = 3.5 + Math.random() * 6;
      const near = vehStates.filter(v => Math.hypot(v.x - p.x, v.z - p.z) < 55);
      if (near.length) {
        const v = near[(Math.random() * near.length) | 0];
        audio.honkAt(v.x, v.z, v.moto);
      }
    }

    // ── Misión: noche, sustos, vida, gatos, mimos, huesitos y pistas ───────────────
    if (!over) {
      // Atardecer → noche progresivo (mediodía dorado → naranja → azul → noche)
      night += dt / NIGHT_SECONDS;
      const nf = Math.min(1, night);
      engine.setDusk(nf);
      if (night >= 1) lose('🌙 Cayó la noche', 'Se hizo de noche y Canito no llegó. Se acurrucó solito en un banco de la plaza…');

      // Gatitos enemigos: si te acercás demasiado, te arañan (sacan vida)
      const catHit = cats.update(dt, p.x, p.z);
      if (catHit.damage > 0) {
        vida = Math.max(0, vida - catHit.damage);
        hurtFlash.style.opacity = '1';
        setTimeout(() => { hurtFlash.style.opacity = '0'; }, 130);
        if (catHit.attacked) think('gato', '¡Un gato me arañó! ¡Fuera de acá, michi!');
      }

      // Ladrido (B): espanta a los gatos cercanos
      const barkNow = input.keys.has('KeyB');
      if (barkNow && !prevBark) {
        audio.bark();
        if (cats.scare(p.x, p.z, 10) > 0) think('bark', '¡Guau guau! ¡A volar de acá, michis!');
      }
      prevBark = barkNow;

      // Truco (T): si hay gente cerca, te dan huesos + reputación
      trickCD -= dt;
      const trickNow = input.keys.has('KeyT');
      if (trickNow && !prevTrick && trickCD <= 0) {
        trickCD = 4;
        canito.trick(); audio.bark();
        let near = 0;
        for (const q of pedBuf) if (Math.hypot(q.x - p.x, q.z - p.z) < 4.5) near++;
        if (near > 0) {
          const reward = Math.min(3, near);
          progress.addHuesos(reward); progress.addRep(2); renderWallet();
          for (let k = 0; k < reward; k++) emitHeart(p.x + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2);
          think('trick', `¡Truquito! La gente me dio ${reward} 🦴.`);
        } else {
          think('trick0', '¡Hago una pirueta!… pero no me mira nadie.');
        }
      }
      prevTrick = trickNow;

      // Cavar (G): desenterrar tesoros (se ven con el olfato)
      const digNow = input.keys.has('KeyG');
      if (digNow && !prevDig) {
        const got = digSpots.digNear(p.x, p.z);
        if (got > 0) { progress.addHuesos(got); renderWallet(); think('dig', `¡Cavé y desenterré ${got} 🦴!`); }
      }
      prevDig = digNow;
      digSpots.update(dt, quest.smellMode);

      // Susto: un vehículo/tranvía rápido muy cerca te lastima y te empuja
      sustoCD -= dt;
      if (sustoCD <= 0) {
        let hx = 0, hz = 0, hit = false;
        for (const v of vehStates) {
          if (v.speed > 1.2 && Math.hypot(v.x - p.x, v.z - p.z) < 3.0) { hx = v.x; hz = v.z; hit = true; break; }
        }
        if (!hit) for (const t of trams) {
          if (Math.hypot(t.position.x - p.x, t.position.z - p.z) < 4.5) { hx = t.position.x; hz = t.position.z; hit = true; break; }
        }
        if (hit) {
          vida = Math.max(0, vida - 0.14);
          sustoCD = 1.4;
          const dx = p.x - hx, dz = p.z - hz, d = Math.hypot(dx, dz) || 1;
          p.x += (dx / d) * 0.8; p.z += (dz / d) * 0.8;
          hurtFlash.style.opacity = '1';
          setTimeout(() => { hurtFlash.style.opacity = '0'; }, 130);
        }
      }

      // La gente lo ve y lo acaricia: se frenan, lo miran, y lo cura un poco (♥)
      const pet = pedestrians.greet(p.x, p.z, 2.8);
      heartCD -= dt;
      if (pet.count > 0) {
        vida = Math.min(1, vida + 0.08 * dt);
        if (heartCD <= 0) { heartCD = 0.5; emitHeart(pet.nx, pet.nz); }
      }

      // Los perritos de la plaza se acercan a olfatearlo
      plazaLife.sniff(p.x, p.z, 9);

      // ── Pensamientos de Canito según el contexto ─────────────────────────────
      if (quest.smellMode && !prevSmell) think('smell', 'A ver… ¿qué huelo por acá?');
      prevSmell = quest.smellMode;
      for (const ps of plazaSpecs) {
        if (Math.hypot(p.x - ps.cx, p.z - ps.cz) < ps.radius) {
          think('plaza', 'Esta plaza… acá veníamos a jugar con el humano.'); break;
        }
      }
      for (const v of vehStates) {
        if (v.moto && v.speed > 1 && Math.hypot(v.x - p.x, v.z - p.z) < 9) {
          think('moto', 'No me gustan esas máquinas ruidosas…'); break;
        }
      }
      for (const t of trams) {
        if (Math.hypot(t.position.x - p.x, t.position.z - p.z) < 22) {
          think('tram', '¡El tranvía! Mejor me corro de las vías.'); break;
        }
      }

      // Actores mendocinos (animar + pensamiento), objeto-pista y recuerdos
      const act = actors.update(dt, p.x, p.z);
      if (act) think(act.id, act.text);
      const trTh = quest.activeTraceThought(p.x, p.z);
      if (trTh) think('trace', trTh);
      const memTh = quest.collectMemory(p.x, p.z);
      if (memTh) think('mem' + quest.memoriesFound, memTh);

      // Huesitos (curan)
      for (let i = bones.length - 1; i >= 0; i--) {
        const b = bones[i];
        b.update(dt);
        if (b.alive && Math.hypot(b.position.x - p.x, b.position.z - p.z) < Bone.PICKUP_R) {
          b.pickup(); vida = Math.min(1, vida + 0.2); b.remove(engine.scene); bones.splice(i, 1);
          progress.addHuesos(1); renderWallet();
          think('bone', '¡Un huesito! Lo guardo… y me hace bien.');
        }
      }

      if (vida <= 0) lose('💔 Sin vida', 'Canito quedó sin fuerzas. Cuidá la vida: esquivá los gatos y el tránsito, y comé huesitos.');

      // Pistas / diálogos
      const qs = quest.update(dt, p.x, p.z);
      if (qs.canTalk) { promptEl.textContent = `Apretá E para hablar con ${qs.who}`; promptEl.style.opacity = '1'; }
      else promptEl.style.opacity = '0';
      const talkNow = input.keys.has('KeyE');
      if (talkNow && !prevTalk) {
        const r = quest.tryTalk(p.x, p.z);
        if (r) { showDialogue(r.name, r.text); if (r.win) win(); }
      }
      prevTalk = talkNow;
      if (performance.now() > dialogueUntil) dlgBox.style.opacity = '0';

      // Barras + contador de recuerdos
      nightFill.style.width = (nf * 100) + '%';
      vidaFill.style.width = (vida * 100) + '%';
      vidaFill.style.background = vida > 0.5 ? '#7eff8a' : vida > 0.25 ? '#ffd24a' : '#ff5a5a';
      memHud.textContent = `📷 Recuerdos: ${quest.memoriesFound}/${quest.memoriesTotal}`;
    }

    // Sincroniza el filtro de olfato con el estado real (se apaga solo al disiparse)
    if (quest.smellMode !== smellApplied) {
      smellApplied = quest.smellMode;
      engine.renderer.domElement.style.filter = smellApplied ? 'saturate(0.1) contrast(1.06) brightness(0.95)' : '';
      smellHint.style.opacity = smellApplied ? '1' : '0.6';
      smellHint.textContent = smellApplied ? '👃 Oliendo… (se disipa)' : '👃 Olfato (F)';
    }

    // La burbuja de pensamiento se oculta sola
    if (performance.now() > thoughtHideAt) thoughtBox.style.opacity = '0';

    // Corazones flotantes (suben y se desvanecen)
    for (const h of hearts) {
      if (h.life <= 0) continue;
      h.life -= dt;
      h.sp.position.y += dt * 0.8;
      (h.sp.material as THREE.SpriteMaterial).opacity = Math.min(1, h.life);
      if (h.life <= 0) h.sp.visible = false;
    }

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
  if (e) { e.style.display = 'block'; e.textContent = String(err); }
});
