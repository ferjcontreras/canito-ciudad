import * as THREE from 'three';
import { groundMaps } from './textures';

export function buildTerrain(scene: THREE.Scene, size: number): void {
  const groundGeo = new THREE.PlaneGeometry(size, size, 1, 1);
  const g = groundMaps();
  const rep = size / 14;                 // ~14 m por mosaico
  g.map.repeat.set(rep, rep);
  g.normalMap.repeat.set(rep, rep);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xa3a89c, map: g.map, normalMap: g.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1, metalness: 0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);
}

function polygonAABB(ring: [number, number][]) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ, w: maxX - minX, d: maxZ - minZ };
}

export function polygonArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}

export function buildParkZone(
  scene: THREE.Scene,
  ring: [number, number][],
  color = 0x5a8a45,
): void {
  if (ring.length < 3) return;

  const shape = new THREE.Shape();
  shape.moveTo(ring[0][0], -ring[0][1]);
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], -ring[i][1]);
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.03;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ── Plaza zone: lighter grass + a cross-shaped path ───────────────────────
export function buildPlazaZone(
  scene: THREE.Scene,
  ring: [number, number][],
): void {
  if (ring.length < 3) return;

  // Lighter, more cared-for grass color
  buildParkZone(scene, ring, 0x7aa860);

  // Cross-shaped paths through the centroid, oriented with AABB
  const { minX, maxX, minZ, maxZ, w, d } = polygonAABB(ring);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const PATH_W = 3.0;
  const pathGeo: THREE.BufferGeometry[] = [];

  // Horizontal path
  {
    const g = new THREE.PlaneGeometry(w * 0.95, PATH_W);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, -0.02, cz);
    pathGeo.push(g);
  }
  // Vertical path
  {
    const g = new THREE.PlaneGeometry(PATH_W, d * 0.95);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, -0.02, cz);
    pathGeo.push(g);
  }
  // Central rotunda
  {
    const g = new THREE.CircleGeometry(PATH_W * 1.3, 16);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, -0.015, cz);
    pathGeo.push(g);
  }

  const mat = new THREE.MeshLambertMaterial({ color: 0xc8bfac });
  for (const g of pathGeo) {
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    scene.add(m);
  }
}
