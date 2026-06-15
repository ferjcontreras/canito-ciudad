import * as THREE from 'three';
import { CityGraph, PathAgent } from './CityGraph';
import type { AABB } from '../entities/Canito';
import type { TrafficLights } from './TrafficLights';

// Autos y motos que circulan por las calles (carril derecho). Frenan y tocan
// bocina ante peatones / Canito / el tranvía, son colliders sólidos (Canito no
// los atraviesa) y no circulan por las vías del metrotranvía.
// Geometría: frente hacia +Z (coincide con el heading del PathAgent).

// Obstáculo dinámico ante el que un vehículo frena. `honk` = si amerita bocina
// (peatones y Canito sí; el tranvía no).
export interface Obstacle { x: number; z: number; r: number; honk: boolean; }

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

interface Vehicle {
  agent: PathAgent; group: THREE.Group; moto: boolean;
  col: AABB; halfBody: number; scale: number; lastHonk: number;
}

export class TrafficManager {
  private vehicles: Vehicle[] = [];
  private _colliders: AABB[] = [];

  private lights?: TrafficLights;

  constructor(
    scene: THREE.Scene, graph: CityGraph, cars: number, motos: number,
    allowEdge?: (i: number) => boolean,
    lights?: TrafficLights,
  ) {
    this.lights = lights;
    // Carril derecho. En calles angostas (residenciales con autos estacionados
    // contra el cordón) el auto se arrima al eje para dejar libre el carril de
    // estacionamiento; en avenidas anchas usa el medio-carril normal.
    const laneOffset = (halfW: number) => Math.max(0, Math.min(halfW * 0.5, halfW - 2.5));
    const spawn = (group: THREE.Group, speed: number, moto: boolean) => {
      const agent = new PathAgent(graph, laneOffset, speed, allowEdge);
      scene.add(group);
      const half = moto ? 1.2 : 2.3;
      const col: AABB = { minX: agent.x - half, maxX: agent.x + half, minZ: agent.z - half, maxZ: agent.z + half };
      this._colliders.push(col);
      this.vehicles.push({ agent, group, moto, col, halfBody: half, scale: 1, lastHonk: 0 });
    };
    for (let i = 0; i < cars; i++)  spawn(buildCar(),  7 + Math.random() * 4, false);   // ~25-40 km/h
    for (let i = 0; i < motos; i++) spawn(buildMoto(), 9 + Math.random() * 4, true);
  }

  /** Colliders sólidos de los autos (para que Canito no los atraviese). */
  colliders(): AABB[] { return this._colliders; }

  // snapshots reusados por frame (posición + frente de cada vehículo, ANTES de
  // moverlos) para la detección auto-auto.
  private _sx: number[] = []; private _sz: number[] = [];
  private _fx: number[] = []; private _fz: number[] = [];

  update(
    dt: number,
    obstacles: Obstacle[],
    onHonk?: (x: number, z: number, moto: boolean) => void,
  ): void {
    const now = performance.now() / 1000;
    const LOOK = 7.5;       // distancia de anticipación (desde el centro)
    const LANE = 1.7;       // medio ancho del "carril" de detección
    const LOOK_V = 6.5;     // ídem para autos delante (mismo carril)
    const LANE_V = 1.7;

    // snapshot al inicio del frame
    const n = this.vehicles.length;
    for (let i = 0; i < n; i++) {
      const a = this.vehicles[i].agent;
      this._sx[i] = a.x; this._sz[i] = a.z;
      this._fx[i] = Math.sin(a.heading); this._fz[i] = Math.cos(a.heading);
    }
    const sx = this._sx, sz = this._sz, FX = this._fx, FZ = this._fz;

    for (let iv = 0; iv < n; iv++) {
      const v = this.vehicles[iv];
      const fx = FX[iv], fz = FZ[iv];
      const rx = fz, rz = -fx;   // vector "derecha"
      const vx = sx[iv], vz = sz[iv];

      // ── ¿Hay algo delante? → frenar (y bocina si corresponde) ─────────────
      let blocked = false, wantHonk = false;
      for (const o of obstacles) {
        const dx = o.x - vx, dz = o.z - vz;
        const fp = dx * fx + dz * fz;                 // proyección hacia adelante
        if (fp <= 0 || fp > LOOK + o.r) continue;
        const lat = dx * rx + dz * rz;                // proyección lateral
        if (Math.abs(lat) > LANE + o.r) continue;
        blocked = true;
        if (o.honk) wantHonk = true;
        if (wantHonk) break;
      }

      // ── Semáforo: frenar en rojo al acercarse a la intersección ───────────
      if (!blocked && this.lights && !v.agent.inCross && v.agent.distNode < 8) {
        const isNS = Math.abs(fz) > Math.abs(fx);
        if (this.lights.isRed(v.agent.nodeId, isNS)) blocked = true;
      }

      // ── ¿Hay un vehículo adelante en el mismo carril/sentido? → frenar ─────
      if (!blocked) {
        for (let iw = 0; iw < n; iw++) {
          if (iw === iv) continue;
          const dx = sx[iw] - vx, dz = sz[iw] - vz;
          if (dx > LOOK_V || dx < -LOOK_V || dz > LOOK_V || dz < -LOOK_V) continue;
          // mismo sentido (evita que el tránsito de enfrente se frene mutuamente)
          if (fx * FX[iw] + fz * FZ[iw] < 0.25) continue;
          const fp = dx * fx + dz * fz;
          if (fp <= 0.5 || fp > LOOK_V) continue;
          const lat = dx * rx + dz * rz;
          if (Math.abs(lat) > LANE_V) continue;
          blocked = true;
          break;
        }
      }

      // suavizar arranque/frenado
      const target = blocked ? 0 : 1;
      v.scale += (target - v.scale) * Math.min(1, dt * (blocked ? 8 : 2.5));
      v.agent.speedScale = v.scale < 0.02 ? 0 : v.scale;

      if (wantHonk && now - v.lastHonk > 1.6) {
        v.lastHonk = now;
        onHonk?.(v.agent.x, v.agent.z, v.moto);
      }

      v.agent.update(dt);
      v.group.position.x = v.agent.x;
      v.group.position.z = v.agent.z;
      v.group.rotation.y = v.agent.heading;

      // collider sólido sigue al vehículo
      v.col.minX = v.agent.x - v.halfBody; v.col.maxX = v.agent.x + v.halfBody;
      v.col.minZ = v.agent.z - v.halfBody; v.col.maxZ = v.agent.z + v.halfBody;
    }
  }

  /** Estados para el audio posicional (posición, velocidad, tipo). */
  states(): { x: number; z: number; speed: number; moto: boolean }[] {
    return this.vehicles.map(v => ({
      x: v.agent.x, z: v.agent.z, speed: v.agent.speed * v.scale, moto: v.moto,
    }));
  }
}
