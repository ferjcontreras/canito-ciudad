import * as THREE from 'three';
import type { AABB } from './Canito';
import type { VendimiaKind } from './VendimiaThrow';

// Carro de la Vendimia: carroza decorada que persigue a Canito y le lanza
// racimos, botellas de vino y melones más seguido que las reinas. 10 de vida.
const MAT_WOOD   = new THREE.MeshLambertMaterial({ color: 0x7a4a26, flatShading: true });
const MAT_WOOD2  = new THREE.MeshLambertMaterial({ color: 0x5e3618, flatShading: true });
const MAT_WHEEL  = new THREE.MeshLambertMaterial({ color: 0x4a2e16, flatShading: true });
const MAT_GRAPE  = new THREE.MeshLambertMaterial({ color: 0x7b2f9d, flatShading: true });
const MAT_LEAF   = new THREE.MeshLambertMaterial({ color: 0x3e7d2e, flatShading: true });
const MAT_BANNER1 = new THREE.MeshLambertMaterial({ color: 0xc0392b, flatShading: true });
const MAT_BANNER2 = new THREE.MeshLambertMaterial({ color: 0xf1c40f, flatShading: true });
const MAT_BARREL = new THREE.MeshLambertMaterial({ color: 0x8a5a2c, flatShading: true });
const MAT_HOOP   = new THREE.MeshLambertMaterial({ color: 0x3a3a3a, flatShading: true });

export class VendimiaCart {
  readonly group: THREE.Group;
  private _hp = 10;
  private _attackCooldown = 0;
  private _throwCD = 1.4;

  static readonly SPEED        = 21;     // persigue, más rápido que el sprint de Canito (18)
  static readonly DETECT_R     = 130;
  static readonly TURN_RATE    = 1.4;
  static readonly HIT_DAMAGE   = 4;      // si te embiste
  static readonly HIT_RADIUS   = 4.2;
  static readonly HIT_INTERVAL = 1.0;
  static readonly COLLIDER_R   = 2.6;
  static readonly THROW_INTERVAL = 0.8;  // más rápido que las reinas (1.8)
  static readonly THROW_RANGE_MIN = 6;
  static readonly THROW_RANGE_MAX = 55;

  constructor() {
    this.group = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); this.group.add(m); return m;
    };

    // Plataforma: largo a lo largo de Z (sentido de avance), tamaño de 2 autos
    add(new THREE.BoxGeometry(3.0, 0.5, 8.0), MAT_WOOD, 0, 1.2, 0);
    add(new THREE.BoxGeometry(0.2, 0.6, 8.0), MAT_WOOD2, 1.5, 1.55, 0);    // baranda
    add(new THREE.BoxGeometry(0.2, 0.6, 8.0), MAT_WOOD2, -1.5, 1.55, 0);
    add(new THREE.BoxGeometry(3.0, 0.6, 0.2), MAT_WOOD2, 0, 1.55, 4.0);
    add(new THREE.BoxGeometry(3.0, 0.6, 0.2), MAT_WOOD2, 0, 1.55, -4.0);

    // Ruedas grandes de carreta (eje en X → ruedan hacia Z)
    const wheelGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.26, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const z of [-2.8, 0, 2.8]) for (const x of [1.5, -1.5])
      add(wheelGeo, MAT_WHEEL, x, 0.8, z);

    // Barril de vino tumbado (a lo largo de Z, al fondo)
    const barrel = add(new THREE.CylinderGeometry(0.7, 0.7, 1.8, 14), MAT_BARREL, 0.55, 2.2, -2.4);
    barrel.rotation.x = Math.PI / 2;
    for (const oz of [-0.7, 0.7]) add(new THREE.TorusGeometry(0.72, 0.06, 6, 16), MAT_HOOP, 0.55, 2.2, -2.4 + oz);

    // Gran racimo de uvas decorativo (al frente)
    const cluster = new THREE.Group();
    cluster.position.set(-0.6, 2.2, 2.6);
    this.group.add(cluster);
    const rows = [{ y: 0.7, r: 0.5, n: 8 }, { y: 0.35, r: 0.4, n: 7 }, { y: 0.05, r: 0.28, n: 5 }, { y: -0.2, r: 0.0, n: 1 }];
    for (const row of rows) for (let i = 0; i < row.n; i++) {
      const a = (i / row.n) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), MAT_GRAPE);
      m.position.set(Math.cos(a) * row.r, row.y, Math.sin(a) * row.r);
      cluster.add(m);
    }
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.26, 6, 4), MAT_LEAF);
      leaf.position.set((Math.random() - 0.5) * 0.9, 0.9 + Math.random() * 0.2, (Math.random() - 0.5) * 0.9);
      leaf.scale.set(1.3, 0.4, 1.0);
      cluster.add(leaf);
    }

    // Banderines de colores sobre un arco a lo largo del carro
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const fz = -3.6 + t * 7.2;
      const fy = 2.7 + Math.sin(t * Math.PI) * 0.8;
      for (const sx of [1.5, -1.5]) {
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.4), i % 2 ? MAT_BANNER1 : MAT_BANNER2);
        flag.position.set(sx, fy, fz);
        this.group.add(flag);
      }
    }

    this.group.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true; });
  }

  get position(): THREE.Vector3 { return this.group.position; }
  get hp(): number              { return this._hp; }
  get alive(): boolean          { return this._hp > 0; }
  takeDamage(d: number): void   { this._hp = Math.max(0, this._hp - d); }

  private _collides(x: number, z: number, colliders: AABB[]): boolean {
    const r = VendimiaCart.COLLIDER_R;
    for (const c of colliders)
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    return false;
  }

  update(dt: number, target: THREE.Vector3, colliders: AABB[] = []): { hitTarget: boolean } {
    if (!this.alive) return { hitTarget: false };
    this._attackCooldown -= dt;

    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < VendimiaCart.HIT_RADIUS && this._attackCooldown <= 0) {
      this._attackCooldown = VendimiaCart.HIT_INTERVAL;
      return { hitTarget: true };
    }

    if (dist < VendimiaCart.DETECT_R && dist > VendimiaCart.HIT_RADIUS * 0.9) {
      const desired = Math.atan2(dx, dz);
      let delta = desired - this.group.rotation.y;
      while (delta >  Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const maxTurn = VendimiaCart.TURN_RATE * dt;
      this.group.rotation.y += Math.abs(delta) < maxTurn ? delta : Math.sign(delta) * maxTurn;

      const ang = this.group.rotation.y;
      const stepX = Math.sin(ang) * VendimiaCart.SPEED * dt;
      const stepZ = Math.cos(ang) * VendimiaCart.SPEED * dt;
      const px = this.position.x, pz = this.position.z;
      const nx = px + stepX, nz = pz + stepZ;
      if (!this._collides(nx, nz, colliders)) { this.position.x = nx; this.position.z = nz; }
      else if (!this._collides(nx, pz, colliders)) { this.position.x = nx; }
      else if (!this._collides(px, nz, colliders)) { this.position.z = nz; }
    }
    return { hitTarget: false };
  }

  /** Lanza un proyectil (más seguido que las reinas) si está a tiro. */
  tryThrow(target: THREE.Vector3, dt: number): { origin: THREE.Vector3; vel: THREE.Vector3; kind: VendimiaKind } | null {
    this._throwCD -= dt;
    if (this._throwCD > 0) return null;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < VendimiaCart.THROW_RANGE_MIN || dist > VendimiaCart.THROW_RANGE_MAX) return null;

    this._throwCD = VendimiaCart.THROW_INTERVAL + (Math.random() - 0.5) * 0.3;
    const g = 13;                  // matches VendimiaThrow.GRAVITY
    const tF = 0.7 + dist * 0.012;
    const vy = g * tF / 2;
    const vh = dist / tF;
    const ux = dx / dist, uz = dz / dist;
    const origin = this.position.clone();
    origin.y += 3.0;
    origin.x += ux * 2.2; origin.z += uz * 2.2;
    const kinds: VendimiaKind[] = ['grape', 'grape', 'bottle', 'melon'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    return { origin, vel: new THREE.Vector3(ux * vh, vy, uz * vh), kind };
  }

  remove(scene: THREE.Scene): void { scene.remove(this.group); }
}
