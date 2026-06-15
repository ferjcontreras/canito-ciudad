// Gatitos territoriales: deambulan cerca de su "casa"; si Canito se acerca se
// ponen en guardia, se le tiran y lo arañan (le sacan vida) con un cooldown.
// Son más lentos que Canito, así que se esquivan/escapan.
import * as THREE from 'three';

interface Cat {
  group: THREE.Group; tail: THREE.Object3D;
  hx: number; hz: number;          // casa
  x: number; z: number;
  tx: number; tz: number;          // destino al deambular
  aggro: boolean;
  atkCD: number; gait: number; flee: number;
}

const COLORS = [0x8a8a8a, 0xc8843a, 0x2c2c2c, 0xd8d2c4, 0x9a7a4a];

export class CatManager {
  private cats: Cat[] = [];
  static readonly DETECT   = 11;    // m: a partir de acá se ponen agresivos
  static readonly ATTACK_R = 1.4;
  static readonly SPEED    = 3.6;   // bastante menos que Canito (corre a 7.5)
  static readonly DAMAGE   = 0.12;  // por arañazo

  constructor(scene: THREE.Scene, spots: Array<[number, number]>) {
    spots.forEach(([x, z], i) => {
      const { group, tail } = this._build(COLORS[i % COLORS.length]);
      group.position.set(x, 0, z);
      scene.add(group);
      this.cats.push({ group, tail, hx: x, hz: z, x, z, tx: x, tz: z, aggro: false, atkCD: 0, gait: Math.random() * 6, flee: 0 });
    });
  }

  private _build(color: number): { group: THREE.Group; tail: THREE.Object3D } {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.26), mat);
    body.position.y = 0.34; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.24), mat);
    head.position.set(0.34, 0.42, 0); g.add(head);
    for (const sz of [-0.07, 0.07]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), mat);
      ear.position.set(0.34, 0.58, sz); g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0x9fe03a }));
      eye.position.set(0.47, 0.44, sz); g.add(eye);
    }
    for (const [lx, lz] of [[0.2, 0.09], [0.2, -0.09], [-0.2, 0.09], [-0.2, -0.09]] as [number, number][]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.07), mat);
      leg.position.set(lx, 0.12, lz); g.add(leg);
    }
    const tail = new THREE.Group();
    const tm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.34), mat);
    tm.position.z = -0.17; tail.add(tm);
    tail.position.set(-0.28, 0.4, 0); g.add(tail);
    return { group: g, tail };
  }

  /** Un ladrido cerca: los gatos del radio se asustan y huyen un rato. */
  scare(px: number, pz: number, radius: number): number {
    let n = 0;
    for (const c of this.cats) {
      if (Math.hypot(px - c.x, pz - c.z) < radius) { c.flee = 3.5; c.aggro = false; c.atkCD = 1; n++; }
    }
    return n;
  }

  /** Devuelve el daño total a Canito este frame y si alguno atacó. */
  update(dt: number, px: number, pz: number): { damage: number; attacked: boolean } {
    let damage = 0, attacked = false;
    for (const c of this.cats) {
      const dx = px - c.x, dz = pz - c.z;
      const d = Math.hypot(dx, dz) || 1;
      c.atkCD -= dt;

      // Huyendo (asustado por un ladrido): se aleja de Canito, no ataca
      if (c.flee > 0) {
        c.flee -= dt;
        c.x -= (dx / d) * CatManager.SPEED * 1.4 * dt;
        c.z -= (dz / d) * CatManager.SPEED * 1.4 * dt;
        c.group.rotation.y = Math.atan2(-dx, -dz);
        c.group.position.set(c.x, 0, c.z);
        c.gait += dt * 13; c.tail.rotation.x = Math.sin(c.gait) * 0.2;
        continue;
      }

      c.aggro = d < CatManager.DETECT;

      if (c.aggro) {
        if (d > CatManager.ATTACK_R) {
          c.x += (dx / d) * CatManager.SPEED * dt;
          c.z += (dz / d) * CatManager.SPEED * dt;
        } else if (c.atkCD <= 0) {
          c.atkCD = 1.3;
          damage += CatManager.DAMAGE;
          attacked = true;
          c.x -= (dx / d) * 0.6; c.z -= (dz / d) * 0.6;   // retrocede tras el zarpazo
        }
        c.group.rotation.y = Math.atan2(dx, dz);          // encara a Canito
      } else {
        const tdx = c.tx - c.x, tdz = c.tz - c.z;
        const td = Math.hypot(tdx, tdz);
        if (td < 0.5) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
          c.tx = c.hx + Math.cos(a) * r; c.tz = c.hz + Math.sin(a) * r;
        } else {
          c.x += (tdx / td) * 1.4 * dt; c.z += (tdz / td) * 1.4 * dt;
          c.group.rotation.y = Math.atan2(tdx, tdz);
        }
      }

      c.group.position.set(c.x, 0, c.z);
      c.gait += dt * (c.aggro ? 11 : 4);
      c.tail.rotation.x = Math.sin(c.gait) * (c.aggro ? 0.7 : 0.3);   // cola que late
    }
    return { damage, attacked };
  }
}
