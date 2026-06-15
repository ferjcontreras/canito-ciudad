import * as THREE from 'three';
import type { OSMWay, OSMNode } from '../geo/types';
import type { Projection } from '../geo/Projection';
import type { AABB } from '../entities/Canito';

// ── Car geometries (local frame: +X forward, +Y up, +Z right side) ────────
const CHASSIS_GEO = (() => {
  const g = new THREE.BoxGeometry(4.2, 0.85, 1.6);
  g.translate(0, 0.62, 0);          // bottom at y=0.20, top at y=1.04
  return g;
})();

const CABIN_GEO = (() => {
  const g = new THREE.BoxGeometry(2.4, 0.78, 1.45);
  g.translate(-0.25, 1.46, 0);      // sits on top of chassis (y=1.07..1.85)
  return g;
})();

const WHEEL_GEO = (() => {
  // Cylinder axis along Y by default; rotate so axle lies along ±Z (perpendicular to heading).
  const g = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12);
  g.rotateX(Math.PI / 2);
  return g;
})();

const WINDOW_GEO = (() => {
  const g = new THREE.BoxGeometry(2.25, 0.62, 1.35);
  g.translate(-0.25, 1.48, 0);
  return g;
})();

// Car body palette
const CAR_COLORS = [
  0xb83a3a, // red
  0x2a4a7d, // blue
  0xe5e1d6, // white
  0x707075, // grey
  0x232529, // black
  0x394a36, // dark green
  0xc4a868, // beige
  0x8a3a55, // burgundy
  0x336688, // teal
  0xa07050, // brown
];

const MAT_WHEEL  = new THREE.MeshLambertMaterial({ color: 0x1a1a1c });
const MAT_WINDOW = new THREE.MeshLambertMaterial({ color: 0x1a2330 });

const _yAxis = new THREE.Vector3(0, 1, 0);

function carMatrix(x: number, z: number, rotY: number): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(_yAxis, rotY),
    new THREE.Vector3(1, 1, 1),
  );
  return m;
}

function wheelMatrix(carX: number, carZ: number, rotY: number,
                     localX: number, localZ: number): THREE.Matrix4 {
  // three.js Y-axis quaternion rotation: (1,0,0) → (cos θ, 0, -sin θ)
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const wx = carX + localX * c + localZ * s;
  const wz = carZ - localX * s + localZ * c;
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(wx, 0.36, wz),
    new THREE.Quaternion().setFromAxisAngle(_yAxis, rotY),
    new THREE.Vector3(1, 1, 1),
  );
  return m;
}

// ── Roads that get parked cars ────────────────────────────────────────────
const PARKABLE = new Set([
  'residential', 'unclassified', 'living_street',
  'tertiary', 'tertiary_link', 'secondary', 'secondary_link',
]);

const HW_FOR_PARK: Record<string, number> = {
  residential: 3.5, unclassified: 3.5, living_street: 2.5,
  tertiary: 4, tertiary_link: 2.5, secondary: 5, secondary_link: 3,
};

export interface ParkedCar {
  x: number;
  z: number;
  collider: AABB;        // mutable — set to a far-away box on explode
  exploded: boolean;
}

export interface ParkedCarsResult {
  cars: ParkedCar[];
  explode(idx: number): void;
}

// ── Build parked cars along streets ───────────────────────────────────────
export function buildParkedCars(
  scene: THREE.Scene,
  ways: OSMWay[],
  nodeMap: Map<number, OSMNode>,
  proj: Projection,
  colliders: AABB[],
  skip?: (x: number, z: number) => boolean,
): ParkedCarsResult {
  const SPACING_BASE = 6;        // average metres between cars
  const SKIP_PROB    = 0.18;     // chance a parking slot is empty (más lleno = ciudad)

  const carMats:    THREE.Matrix4[] = [];
  const carColors:  number[]        = [];
  const wheelMats:  THREE.Matrix4[] = [];
  const cars:       ParkedCar[]     = [];
  const CORNER = 9;              // no estacionar sobre la bocacalle

  // Uso de nodos → intersecciones
  const usage = new Map<number, number>();
  for (const w of ways) for (const nid of w.nodes) usage.set(nid, (usage.get(nid) ?? 0) + 1);

  for (const way of ways) {
    const type = way.tags.highway;
    if (!type || !PARKABLE.has(type)) continue;
    const hw   = HW_FOR_PARK[type] ?? 3.5;
    // Estacionar SOBRE la calzada, pegado al cordón (la vereda es sólo para
    // peatones). El auto mide 1.6 de ancho (medio 0.8); centro a hw-0.9 deja el
    // flanco exterior a ~0.1 m del cordón (en hw) y el resto sobre el asfalto.
    const sideOff = hw - 0.9;

    const pts: [number, number][] = [];
    for (const nid of way.nodes) {
      const n = nodeMap.get(nid);
      if (n) pts.push(proj.project(n.lat, n.lon));
    }
    if (pts.length < 2) continue;

    let debt = SPACING_BASE * Math.random();

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      const udx = dx / L, udz = dz / L;
      const nx  = -udz,    nz  =  udx;
      const ang = Math.atan2(udz, udx);
      const aInt = (usage.get(way.nodes[i])     ?? 0) >= 2;
      const bInt = (usage.get(way.nodes[i + 1]) ?? 0) >= 2;

      while (debt <= L) {
        const cx = x0 + udx * debt;
        const cz = z0 + udz * debt;
        // Saltar las bocacalles (cerca de un extremo que es intersección)
        if ((aInt && debt < CORNER) || (bInt && L - debt < CORNER)) { debt += SPACING_BASE; continue; }

        for (const side of [+1, -1]) {
          if (Math.random() < SKIP_PROB) continue;
          const carX = cx + nx * sideOff * side;
          const carZ = cz + nz * sideOff * side;
          if (skip && skip(carX, carZ)) continue;     // keep cars off the tram tracks
          const carAng = ang + (side > 0 ? 0 : Math.PI);

          carMats.push(carMatrix(carX, carZ, carAng));
          carColors.push(CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]);

          wheelMats.push(wheelMatrix(carX, carZ, carAng,  1.45,  0.92));
          wheelMats.push(wheelMatrix(carX, carZ, carAng,  1.45, -0.92));
          wheelMats.push(wheelMatrix(carX, carZ, carAng, -1.45,  0.92));
          wheelMats.push(wheelMatrix(carX, carZ, carAng, -1.45, -0.92));

          const r = 2.2;
          const collider: AABB = {
            minX: carX - r, maxX: carX + r,
            minZ: carZ - r, maxZ: carZ + r,
          };
          colliders.push(collider);
          cars.push({ x: carX, z: carZ, collider, exploded: false });
        }

        debt += SPACING_BASE + (Math.random() - 0.5) * 2;
      }
      debt -= L;
    }
  }

  if (carMats.length === 0) {
    return { cars: [], explode: () => {} };
  }

  // Per-instance colored chassis
  const chassisMesh = new THREE.InstancedMesh(
    CHASSIS_GEO,
    new THREE.MeshLambertMaterial({ vertexColors: false }),
    carMats.length,
  );
  chassisMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(carMats.length * 3), 3,
  );
  const tmpColor = new THREE.Color();
  for (let i = 0; i < carMats.length; i++) {
    chassisMesh.setMatrixAt(i, carMats[i]);
    tmpColor.setHex(carColors[i]);
    chassisMesh.setColorAt(i, tmpColor);
  }
  chassisMesh.instanceMatrix.needsUpdate = true;
  chassisMesh.instanceColor!.needsUpdate = true;
  chassisMesh.castShadow = true;
  scene.add(chassisMesh);

  // Cabin uses same color as chassis (one per car)
  const cabinMesh = new THREE.InstancedMesh(
    CABIN_GEO,
    new THREE.MeshLambertMaterial({ vertexColors: false }),
    carMats.length,
  );
  cabinMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(carMats.length * 3), 3,
  );
  for (let i = 0; i < carMats.length; i++) {
    cabinMesh.setMatrixAt(i, carMats[i]);
    tmpColor.setHex(carColors[i]);
    tmpColor.multiplyScalar(0.75);
    cabinMesh.setColorAt(i, tmpColor);
  }
  cabinMesh.instanceMatrix.needsUpdate = true;
  cabinMesh.instanceColor!.needsUpdate = true;
  cabinMesh.castShadow = true;
  scene.add(cabinMesh);

  const windowMesh = new THREE.InstancedMesh(WINDOW_GEO, MAT_WINDOW, carMats.length);
  for (let i = 0; i < carMats.length; i++) windowMesh.setMatrixAt(i, carMats[i]);
  windowMesh.instanceMatrix.needsUpdate = true;
  scene.add(windowMesh);

  const wheelMesh = new THREE.InstancedMesh(WHEEL_GEO, MAT_WHEEL, wheelMats.length);
  for (let i = 0; i < wheelMats.length; i++) wheelMesh.setMatrixAt(i, wheelMats[i]);
  wheelMesh.instanceMatrix.needsUpdate = true;
  scene.add(wheelMesh);

  // Hide a single car by zeroing all its instance matrices
  const ZERO_MAT = new THREE.Matrix4().makeScale(0, 0, 0);
  const explode = (idx: number) => {
    if (idx < 0 || idx >= cars.length) return;
    const car = cars[idx];
    if (car.exploded) return;
    car.exploded = true;

    chassisMesh.setMatrixAt(idx, ZERO_MAT);
    cabinMesh.setMatrixAt(idx, ZERO_MAT);
    windowMesh.setMatrixAt(idx, ZERO_MAT);
    for (let w = 0; w < 4; w++) wheelMesh.setMatrixAt(idx * 4 + w, ZERO_MAT);

    chassisMesh.instanceMatrix.needsUpdate = true;
    cabinMesh.instanceMatrix.needsUpdate = true;
    windowMesh.instanceMatrix.needsUpdate = true;
    wheelMesh.instanceMatrix.needsUpdate = true;

    // Move collider far away so Canito stops bumping into the gone car
    car.collider.minX = car.collider.maxX = 1e6;
    car.collider.minZ = car.collider.maxZ = 1e6;
  };

  return { cars, explode };
}
