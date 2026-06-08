import * as THREE from 'three';
import type { OSMNode, OSMWay } from '../geo/types';
import type { Projection } from '../geo/Projection';

// ── Lamppost geometry (pole + arm + globe) ─────────────────────────────────
const POLE_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.06, 0.09, 5.8, 6);
  g.translate(0, 2.9, 0);
  return g;
})();

const ARM_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.035, 0.035, 1.4, 5);
  g.rotateZ(Math.PI / 2);
  g.translate(0.7, 5.9, 0);
  return g;
})();

const GLOBE_GEO = (() => {
  const g = new THREE.SphereGeometry(0.22, 6, 4);
  g.translate(1.4, 5.9, 0);
  return g;
})();

const MAT_POLE  = new THREE.MeshLambertMaterial({ color: 0x4a4a55 });
const MAT_GLOBE = new THREE.MeshLambertMaterial({ color: 0xfffde8, emissive: 0xffe060, emissiveIntensity: 0.6 });

// ── Bench geometry ──────────────────────────────────────────────────────────
const BENCH_SEAT_GEO = (() => {
  const g = new THREE.BoxGeometry(1.8, 0.08, 0.45);
  g.translate(0, 0.46, 0);
  return g;
})();

const BENCH_LEG_A_GEO = (() => {
  const g = new THREE.BoxGeometry(0.08, 0.45, 0.45);
  g.translate(-0.7, 0.225, 0);
  return g;
})();

const BENCH_LEG_B_GEO = (() => {
  const g = new THREE.BoxGeometry(0.08, 0.45, 0.45);
  g.translate(0.7, 0.225, 0);
  return g;
})();

const MAT_BENCH_WOOD  = new THREE.MeshLambertMaterial({ color: 0x8b6030 });
const MAT_BENCH_METAL = new THREE.MeshLambertMaterial({ color: 0x404045 });

// ── Shared matrix helpers ──────────────────────────────────────────────────
const _yAxis = new THREE.Vector3(0, 1, 0);

function mat4(x: number, z: number, rotY = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(_yAxis, rotY),
    new THREE.Vector3(1, 1, 1),
  );
  return m;
}

function commitInstanced(
  scene: THREE.Scene,
  matrices: THREE.Matrix4[],
  parts: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>,
): void {
  if (matrices.length === 0) return;
  for (const { geo, mat } of parts) {
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    mesh.castShadow = true;
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }
}

// ── Road types that get lampposts & sidewalk trees ────────────────────────
const LAMP_ROAD_TYPES = new Set([
  'primary', 'primary_link',
  'secondary', 'secondary_link',
  'tertiary', 'tertiary_link',
  'residential', 'unclassified', 'road',
]);

const HALF_WIDTH_MAP: Record<string, number> = {
  primary: 6, primary_link: 3.5,
  secondary: 5, secondary_link: 3,
  tertiary: 4, tertiary_link: 2.5,
  residential: 3.5, unclassified: 3.5, road: 3.5,
};

// ── Procedural street lamps along road ways ────────────────────────────────
export function buildStreetLampsAlongRoads(
  scene: THREE.Scene,
  ways: OSMWay[],
  nodeMap: Map<number, OSMNode>,
  proj: Projection,
): void {
  const SPACING   = 30;   // metres between lamps
  const SIDE_OFF  = 1.2;  // metres past the road edge
  const CORNER    = 9;    // no poner faroles sobre la bocacalle

  // Uso de nodos → intersecciones
  const usage = new Map<number, number>();
  for (const w of ways) for (const nid of w.nodes) usage.set(nid, (usage.get(nid) ?? 0) + 1);

  const matrices: THREE.Matrix4[] = [];

  for (const way of ways) {
    const type = way.tags.highway;
    if (!type || !LAMP_ROAD_TYPES.has(type)) continue;

    const hw = (HALF_WIDTH_MAP[type] ?? 3.5) + SIDE_OFF;

    const pts: [number, number][] = [];
    for (const nid of way.nodes) {
      const n = nodeMap.get(nid);
      if (n) pts.push(proj.project(n.lat, n.lon));
    }
    if (pts.length < 2) continue;

    let debt = SPACING * 0.4; // stagger start so lamps don't all align at nodes

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const dx  = x1 - x0;
      const dz  = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) continue;

      const udx = dx / len;
      const udz = dz / len;
      const nx  = -udz; // perpendicular (left of heading)
      const nz  =  udx;
      const ang = Math.atan2(udz, udx);

      // Lamp local +X is the arm direction. After three.js Y-quaternion
      // rotation by θ, local (1,0,0) → (cos θ, 0, -sin θ).
      // For RIGHT-side lamp at offset (+nx,+nz)*hw, we want arm to extend
      // toward road centre = direction (-nx, -nz).
      // Solve (cos θ, -sin θ) = (-nx, -nz):
      //   cos θ = -nx = udz,  sin θ = nz = udx  →  θ = atan2(udx, udz).
      const armRight = Math.atan2(udx, udz);
      const armLeft  = armRight + Math.PI;

      // For oneway roads, the rambla / parallel direction sits on one side, so
      // only place lamps on the outer side (right of travel direction in
      // right-hand-driving countries like Argentina).
      const oneway = way.tags.oneway === 'yes';
      const onewayRev = way.tags.oneway === '-1';
      const placeRight = !onewayRev;
      const placeLeft  = !oneway;
      const aInt = (usage.get(way.nodes[i])     ?? 0) >= 2;
      const bInt = (usage.get(way.nodes[i + 1]) ?? 0) >= 2;

      while (debt <= len) {
        if (!((aInt && debt < CORNER) || (bInt && len - debt < CORNER))) {
          const lx = x0 + udx * debt;
          const lz = z0 + udz * debt;
          if (placeRight) matrices.push(mat4(lx + nx * hw, lz + nz * hw, armRight));
          if (placeLeft)  matrices.push(mat4(lx - nx * hw, lz - nz * hw, armLeft));
        }
        debt += SPACING;
      }
      debt -= len;
    }
  }

  commitInstanced(scene, matrices, [
    { geo: POLE_GEO,  mat: MAT_POLE  },
    { geo: ARM_GEO,   mat: MAT_POLE  },
    { geo: GLOBE_GEO, mat: MAT_GLOBE },
  ]);
}

// ── OSM-tagged lamps (supplement procedural ones) ─────────────────────────
export function buildStreetLamps(
  scene: THREE.Scene,
  nodes: OSMNode[],
  proj: Projection,
): void {
  const matrices = nodes.map(n => {
    const [x, z] = proj.project(n.lat, n.lon);
    return mat4(x, z, Math.random() * Math.PI * 2);
  });
  commitInstanced(scene, matrices, [
    { geo: POLE_GEO,  mat: MAT_POLE  },
    { geo: ARM_GEO,   mat: MAT_POLE  },
    { geo: GLOBE_GEO, mat: MAT_GLOBE },
  ]);
}

// ── Benches (OSM tagged) ───────────────────────────────────────────────────
export function buildBenches(
  scene: THREE.Scene,
  nodes: OSMNode[],
  proj: Projection,
): void {
  const matrices = nodes.map(n => {
    const [x, z] = proj.project(n.lat, n.lon);
    return mat4(x, z, Math.random() * Math.PI * 2);
  });
  commitInstanced(scene, matrices, [
    { geo: BENCH_SEAT_GEO,  mat: MAT_BENCH_WOOD  },
    { geo: BENCH_LEG_A_GEO, mat: MAT_BENCH_METAL },
    { geo: BENCH_LEG_B_GEO, mat: MAT_BENCH_METAL },
  ]);
}

// Place benches at arbitrary world positions (used for plaza furniture)
export function buildBenchesAt(
  scene: THREE.Scene,
  positions: Array<{ x: number; z: number; rotY: number }>,
): void {
  const matrices = positions.map(p => mat4(p.x, p.z, p.rotY));
  commitInstanced(scene, matrices, [
    { geo: BENCH_SEAT_GEO,  mat: MAT_BENCH_WOOD  },
    { geo: BENCH_LEG_A_GEO, mat: MAT_BENCH_METAL },
    { geo: BENCH_LEG_B_GEO, mat: MAT_BENCH_METAL },
  ]);
}
