import * as THREE from 'three';
import type { AABB } from '../entities/Canito';

// ── Shared unit-scale geometries (pre-translated in local space) ──────────
const TRUNK_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6);
  g.translate(0, 0.7, 0);
  return g;
})();

const FOL1_GEO = (() => {
  const g = new THREE.SphereGeometry(1.0, 6, 5);
  g.translate(0, 2.2, 0);
  return g;
})();

const FOL2_GEO = (() => {
  const g = new THREE.SphereGeometry(0.65, 5, 4);
  g.translate(0.35, 3.0, 0.2);
  return g;
})();

const MAT_TRUNK = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
const MAT_FOL1  = new THREE.MeshLambertMaterial({ color: 0x3e7d2e });
const MAT_FOL2  = new THREE.MeshLambertMaterial({ color: 0x4e9438 });

// ── Batch accumulator ─────────────────────────────────────────────────────
export interface TreeGeos {
  matrices: THREE.Matrix4[];
}

const _pos  = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl  = new THREE.Vector3();
const _m4   = new THREE.Matrix4();

function pushTree(geos: TreeGeos, x: number, z: number, scale: number): void {
  _pos.set(x, 0, z);
  _quat.identity();
  _scl.setScalar(scale);
  _m4.compose(_pos, _quat, _scl);
  geos.matrices.push(_m4.clone());
}

// ── Point-in-polygon ──────────────────────────────────────────────────────
function pointInPoly(px: number, pz: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
}

export function createTreeGeos(): TreeGeos {
  return { matrices: [] };
}

export function scatterTreesInPolygon(
  geos: TreeGeos,
  colliders: AABB[],
  poly: [number, number][],
  spacing = 14,
  scale = 1,
  jitter = 4,
  avoid: AABB[] = [],
  blocked?: (x: number, z: number) => boolean,
): void {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const inAvoid = (px: number, pz: number): boolean => {
    for (const a of avoid)
      if (px > a.minX && px < a.maxX && pz > a.minZ && pz < a.maxZ) return true;
    return false;
  };

  for (let x = minX + spacing / 2; x < maxX; x += spacing) {
    for (let z = minZ + spacing / 2; z < maxZ; z += spacing) {
      const tx = x + (Math.random() - 0.5) * jitter * 2;
      const tz = z + (Math.random() - 0.5) * jitter * 2;
      if (!pointInPoly(tx, tz, poly)) continue;
      if (inAvoid(tx, tz)) continue;        // no árboles sobre fuentes/objetos
      if (blocked && blocked(tx, tz)) continue;   // ni sobre la calzada
      const s = scale * (0.85 + Math.random() * 0.3);
      pushTree(geos, tx, tz, s);
      const r = 0.5 * s;
      colliders.push({ minX: tx - r, maxX: tx + r, minZ: tz - r, maxZ: tz + r });
    }
  }
}

export function addAvenueTree(geos: TreeGeos, x: number, z: number, scale = 0.9): void {
  pushTree(geos, x, z, scale);
}

// ── Street trees along road ways (Mendoza's iconic arbolado) ─────────────
const STREET_TREE_TYPES = new Set([
  'primary', 'primary_link',
  'secondary', 'secondary_link',
  'tertiary', 'tertiary_link',
  'residential',
]);

const STREET_TREE_HW: Record<string, number> = {
  primary: 6, primary_link: 3.5,
  secondary: 5, secondary_link: 3,
  tertiary: 4, tertiary_link: 2.5,
  residential: 3.5,
};

export function scatterStreetTrees(
  geos: TreeGeos,
  ways: import('../geo/types').OSMWay[],
  nodeMap: Map<number, import('../geo/types').OSMNode>,
  proj: import('../geo/Projection').Projection,
  blocked?: (x: number, z: number) => boolean,
): void {
  const SPACING  = 18;  // metres between trees
  const SIDE_OFF = 2.5; // metres past road edge
  const CORNER   = 9;   // no plantar tan cerca de una bocacalle

  // Cuántas veces se usa cada nodo → detectar intersecciones
  const usage = new Map<number, number>();
  for (const w of ways) for (const nid of w.nodes) usage.set(nid, (usage.get(nid) ?? 0) + 1);

  for (const way of ways) {
    const type = way.tags.highway;
    if (!type || !STREET_TREE_TYPES.has(type)) continue;
    // Skip oneway roads — they often pair as divided carriageways and trees
    // placed on the inner side land on the parallel asphalt.
    if (way.tags.oneway === 'yes' || way.tags.oneway === '-1') continue;

    const hw = (STREET_TREE_HW[type] ?? 3.5) + SIDE_OFF;

    const pts: [number, number][] = [];
    for (const nid of way.nodes) {
      const n = nodeMap.get(nid);
      if (n) pts.push(proj.project(n.lat, n.lon));
    }
    if (pts.length < 2) continue;

    let debt = SPACING * 0.5;

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const dx  = x1 - x0;
      const dz  = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) continue;

      const udx = dx / len;
      const udz = dz / len;
      const nx  = -udz;
      const nz  =  udx;
      const aInt = (usage.get(way.nodes[i])     ?? 0) >= 2;
      const bInt = (usage.get(way.nodes[i + 1]) ?? 0) >= 2;

      while (debt <= len) {
        // No plantar sobre la bocacalle (cerca de un extremo que es intersección)
        if (!((aInt && debt < CORNER) || (bInt && len - debt < CORNER))) {
          const tx = x0 + udx * debt;
          const tz = z0 + udz * debt;
          const sc = 0.7 + Math.random() * 0.35;
          const rx = tx + nx * hw, rz = tz + nz * hw;   // vereda derecha
          const lx = tx - nx * hw, lz = tz - nz * hw;   // vereda izquierda
          if (!blocked || !blocked(rx, rz)) pushTree(geos, rx, rz, sc);
          if (!blocked || !blocked(lx, lz)) pushTree(geos, lx, lz, sc);
        }
        debt += SPACING;
      }
      debt -= len;
    }
  }
}

export function commitTrees(scene: THREE.Scene, geos: TreeGeos): void {
  const count = geos.matrices.length;
  if (count === 0) return;

  const mkInstanced = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow    = true;
    mesh.receiveShadow = false;
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, geos.matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  };

  scene.add(mkInstanced(TRUNK_GEO, MAT_TRUNK));
  scene.add(mkInstanced(FOL1_GEO,  MAT_FOL1));
  scene.add(mkInstanced(FOL2_GEO,  MAT_FOL2));
}
