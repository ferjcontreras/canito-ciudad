import * as THREE from 'three';
import { CityGraph, PathAgent } from './CityGraph';

// Autos y motos que circulan por las calles (carril derecho). Sin colisiones
// entre sí en esta versión: se reparten por la grilla y mantienen su carril.
// Geometría: frente hacia +Z (coincide con el heading del PathAgent).

const _matCache = new Map<number, THREE.MeshLambertMaterial>();
const mat = (c: number): THREE.MeshLambertMaterial => {
  let m = _matCache.get(c);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); _matCache.set(c, m); }
  return m;
};
const CAR_COLORS = [0xb83a3a, 0x2a4a7d, 0xe5e1d6, 0x707075, 0x232529, 0x394a36, 0xc4a868, 0x8a3a55, 0x336688];
const MAT_TIRE = new THREE.MeshLambertMaterial({ color: 0x161618 });
const MAT_GLASS = new THREE.MeshLambertMaterial({ color: 0x1a2330 });
const MAT_LIGHT = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });

function wheel(): THREE.Mesh {
  const g = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  g.rotateZ(Math.PI / 2);   // axle along X
  return new THREE.Mesh(g, MAT_TIRE);
}

function buildCar(): THREE.Group {
  const g = new THREE.Group();
  const body = mat(CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0]);
  // chassis: width 1.7 (X), height 0.8 (Y), length 4.3 (Z)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.8, 4.3), body);
  chassis.position.y = 0.62; chassis.castShadow = true; g.add(chassis);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.72, 2.2), body);
  cabin.position.set(0, 1.32, -0.2); cabin.castShadow = true; g.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.6, 2.05), MAT_GLASS);
  glass.position.set(0, 1.34, -0.2); g.add(glass);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as [number, number][]) {
    const w = wheel(); w.position.set(sx * 0.86, 0.34, sz * 1.4); g.add(w);
  }
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.08), MAT_LIGHT);
    hl.position.set(sx * 0.5, 0.6, 2.16); g.add(hl);
  }
  return g;
}

function buildMoto(): THREE.Group {
  const g = new THREE.Group();
  const body = mat(CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0]);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 1.5), body);
  frame.position.y = 0.62; frame.castShadow = true; g.add(frame);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.7), mat(0x202020));
  seat.position.set(0, 0.84, -0.2); g.add(seat);
  for (const sz of [0.62, -0.62]) {
    const wg = new THREE.CylinderGeometry(0.32, 0.32, 0.14, 10);
    wg.rotateZ(Math.PI / 2);
    const w = new THREE.Mesh(wg, MAT_TIRE);
    w.position.set(0, 0.32, sz); g.add(w);
  }
  // rider
  const rider = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.26), mat(0x303a45));
  torso.position.y = 1.2; rider.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), mat(0xe5e1d6));
  head.position.y = 1.56; rider.add(head);   // casco
  rider.position.z = -0.1; g.add(rider);
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.08), MAT_LIGHT);
  hl.position.set(0, 0.7, 0.78); g.add(hl);
  return g;
}

interface Vehicle { agent: PathAgent; group: THREE.Group; }

export class TrafficManager {
  private vehicles: Vehicle[] = [];

  constructor(scene: THREE.Scene, graph: CityGraph, cars: number, motos: number) {
    // Carril derecho: centro del semicarril (~halfW/2 del eje).
    const laneOffset = (halfW: number) => halfW * 0.5;
    const spawn = (group: THREE.Group, speed: number) => {
      const agent = new PathAgent(graph, laneOffset, speed);
      scene.add(group);
      this.vehicles.push({ agent, group });
    };
    for (let i = 0; i < cars; i++)  spawn(buildCar(),  7 + Math.random() * 4);   // ~25-40 km/h
    for (let i = 0; i < motos; i++) spawn(buildMoto(), 9 + Math.random() * 4);
  }

  update(dt: number): void {
    for (const v of this.vehicles) {
      v.agent.update(dt);
      v.group.position.x = v.agent.x;
      v.group.position.z = v.agent.z;
      v.group.rotation.y = v.agent.heading;
    }
  }
}
