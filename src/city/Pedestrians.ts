import * as THREE from 'three';
import { CityGraph, PathAgent } from './CityGraph';
import { buildPerson, animateWalk, type CharRig } from './People';

// Peatones que caminan por las veredas y cruzan en las esquinas (la fase de
// "cruce" del PathAgent ocurre justo en las intersecciones del grafo).

interface Ped { agent: PathAgent; rig: CharRig; gait: number; }

export class PedestrianManager {
  private peds: Ped[] = [];

  constructor(scene: THREE.Scene, graph: CityGraph, count: number) {
    // Vereda: a halfW + inset del eje de la calle.
    const sidewalkOffset = (halfW: number) => halfW + 1.9;
    for (let i = 0; i < count; i++) {
      const speed = 1.3 + Math.random() * 0.8;        // m/s (~paso humano)
      const agent = new PathAgent(graph, sidewalkOffset, speed);
      const rig = buildPerson(0.95 + Math.random() * 0.12);
      scene.add(rig.group);
      this.peds.push({ agent, rig, gait: Math.random() * Math.PI * 2 });
    }
  }

  update(dt: number): void {
    for (const p of this.peds) {
      p.agent.update(dt);
      p.gait += dt * p.agent.speed * 3.2;
      const g = p.rig.group;
      g.position.x = p.agent.x;
      g.position.z = p.agent.z;
      g.rotation.y = p.agent.heading;
      animateWalk(p.rig, p.gait, 1);
    }
  }
}
