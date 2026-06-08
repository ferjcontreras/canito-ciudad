import * as THREE from 'three';
import { buildPerson, buildDog, animateWalk, animateDog, type CharRig, type DogRig } from './People';

// Vida en las plazas: adultos paseando o charlando, niños jugando (corren en
// trayectos cortos) y perritos vagando. Cada uno deambula entre puntos al azar
// dentro del radio de la plaza (no usa el grafo de calles).

export interface PlazaSpec { cx: number; cz: number; radius: number; }

type Kind = 'adult' | 'kid' | 'dog';

interface Wanderer {
  kind: Kind;
  rig: CharRig | null;
  dog: DogRig | null;
  group: THREE.Group;
  cx: number; cz: number; radius: number;
  x: number; z: number;
  tx: number; tz: number;       // target
  speed: number;
  gait: number;
  pause: number;                // segundos parado
}

export class PlazaLife {
  private ws: Wanderer[] = [];

  constructor(scene: THREE.Scene, plazas: PlazaSpec[]) {
    for (const p of plazas) {
      const area = Math.PI * p.radius * p.radius;
      const adults = Math.max(5, Math.round(area / 420));
      const kids   = Math.max(3, Math.round(area / 800));
      const dogs   = Math.max(1, Math.round(area / 1800));
      for (let i = 0; i < adults; i++) this._spawn(scene, p, 'adult');
      for (let i = 0; i < kids; i++)   this._spawn(scene, p, 'kid');
      for (let i = 0; i < dogs; i++)   this._spawn(scene, p, 'dog');
    }
  }

  private _rndIn(p: PlazaSpec): [number, number] {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * p.radius * 0.82;
    return [p.cx + Math.cos(a) * r, p.cz + Math.sin(a) * r];
  }

  private _spawn(scene: THREE.Scene, p: PlazaSpec, kind: Kind): void {
    let rig: CharRig | null = null, dog: DogRig | null = null;
    let group: THREE.Group, speed: number;
    if (kind === 'dog') {
      dog = buildDog(); group = dog.group; speed = 1.6 + Math.random() * 1.2;
    } else if (kind === 'kid') {
      rig = buildPerson(0.62 + Math.random() * 0.08); group = rig.group;
      speed = 2.2 + Math.random() * 1.4;          // niños corriendo
    } else {
      rig = buildPerson(0.96 + Math.random() * 0.12); group = rig.group;
      speed = 0.7 + Math.random() * 0.6;          // paseo tranquilo
    }
    const [x, z] = this._rndIn(p);
    const [tx, tz] = this._rndIn(p);
    scene.add(group);
    this.ws.push({
      kind, rig, dog, group, cx: p.cx, cz: p.cz, radius: p.radius,
      x, z, tx, tz, speed, gait: Math.random() * 6.28,
      pause: kind === 'adult' ? Math.random() * 3 : 0,
    });
  }

  update(dt: number): void {
    for (const w of this.ws) {
      let moving = true;
      if (w.pause > 0) { w.pause -= dt; moving = false; }
      else {
        const dx = w.tx - w.x, dz = w.tz - w.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          // llegó: nuevo destino, y los adultos a veces se quedan charlando
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * w.radius * 0.82;
          w.tx = w.cx + Math.cos(a) * r;
          w.tz = w.cz + Math.sin(a) * r;
          if (w.kind === 'adult' && Math.random() < 0.5) w.pause = 1 + Math.random() * 4;
          if (w.kind === 'kid' && Math.random() < 0.2) w.pause = 0.3 + Math.random();
        } else {
          const step = w.speed * dt;
          w.x += (dx / d) * step;
          w.z += (dz / d) * step;
          w.group.rotation.y = Math.atan2(dx, dz);
        }
      }

      w.group.position.x = w.x;
      w.group.position.z = w.z;

      if (moving) {
        w.gait += dt * w.speed * (w.kind === 'dog' ? 6 : 3.4);
        if (w.dog) animateDog(w.dog, w.gait);
        else if (w.rig) animateWalk(w.rig, w.gait, w.kind === 'kid' ? 1.3 : 1);
      } else if (w.rig) {
        // parado: relajar piernas
        w.rig.legL.rotation.x *= 0.85; w.rig.legR.rotation.x *= 0.85;
        w.rig.armL.rotation.x *= 0.85; w.rig.armR.rotation.x *= 0.85;
      }
    }
  }
}
