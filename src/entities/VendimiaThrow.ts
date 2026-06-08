import * as THREE from 'three';
import type { AABB } from './Canito';

// Proyectiles que lanza el carro vendimial: racimos de uva, botellas de vino y
// melones. Vuelan en arco y chocan con edificios (la cobertura sirve).
const GEO_GRAPE  = new THREE.SphereGeometry(0.11, 6, 5);
const MAT_GRAPE  = new THREE.MeshLambertMaterial({ color: 0x6a2a8a, flatShading: true });
const MAT_GRAPE2 = new THREE.MeshLambertMaterial({ color: 0x84489f, flatShading: true });
const MAT_LEAF   = new THREE.MeshLambertMaterial({ color: 0x3f6a2a, flatShading: true });
const MAT_GLASS  = new THREE.MeshLambertMaterial({ color: 0x2f6b3a, transparent: true, opacity: 0.85, flatShading: true });
const MAT_WINE   = new THREE.MeshLambertMaterial({ color: 0x6a1530, flatShading: true });
const MAT_CORK   = new THREE.MeshLambertMaterial({ color: 0x9a7a44, flatShading: true });
const MAT_MELON  = new THREE.MeshLambertMaterial({ color: 0x6aa83a, flatShading: true });
const MAT_STRIPE = new THREE.MeshLambertMaterial({ color: 0x35601f, flatShading: true });

export type VendimiaKind = 'grape' | 'bottle' | 'melon';

export class VendimiaThrow {
  readonly group: THREE.Group;
  readonly damage: number;
  private _vel: THREE.Vector3;
  private _life = 3.2;
  private _alive = true;
  private _spin = new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);

  static readonly RADIUS       = 0.6;
  static readonly GRAVITY      = 13;
  static readonly BLOCK_HEIGHT = 8;

  constructor(origin: THREE.Vector3, vel: THREE.Vector3, kind: VendimiaKind) {
    this.group = new THREE.Group();
    this.group.position.copy(origin);
    this._vel = vel.clone();

    if (kind === 'grape') {
      this.damage = 2;
      const rows = [{ y: 0.05, r: 0.16, n: 5 }, { y: -0.08, r: 0.11, n: 4 }, { y: -0.2, r: 0.0, n: 1 }];
      for (const row of rows) for (let i = 0; i < row.n; i++) {
        const a = (i / row.n) * Math.PI * 2;
        const m = new THREE.Mesh(GEO_GRAPE, Math.random() < 0.5 ? MAT_GRAPE : MAT_GRAPE2);
        m.position.set(Math.cos(a) * row.r, row.y, Math.sin(a) * row.r);
        this.group.add(m);
      }
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), MAT_LEAF);
      leaf.position.set(0.08, 0.2, 0); leaf.scale.set(1.2, 0.4, 0.9);
      this.group.add(leaf);
    } else if (kind === 'bottle') {
      this.damage = 4;
      const part = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
        const m = new THREE.Mesh(geo, mat); m.position.y = y; this.group.add(m);
      };
      part(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10), MAT_GLASS, 0);     // body
      part(new THREE.CylinderGeometry(0.145, 0.145, 0.18, 10), MAT_WINE, -0.02); // label
      part(new THREE.CylinderGeometry(0.06, 0.13, 0.22, 8), MAT_GLASS, 0.34);  // shoulder
      part(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), MAT_GLASS, 0.5);   // neck
      part(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 8), MAT_CORK, 0.6);    // cork
    } else {
      this.damage = 3;
      const melon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), MAT_MELON);
      melon.scale.set(1, 0.86, 1);
      this.group.add(melon);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI;
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 0.05), MAT_STRIPE);
        s.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
        s.rotation.y = a;
        this.group.add(s);
      }
    }

    this.group.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true; });
  }

  get position(): THREE.Vector3 { return this.group.position; }
  get alive(): boolean          { return this._alive; }

  update(dt: number, colliders: AABB[] = []): void {
    if (!this._alive) return;
    const p = this.group.position;
    p.x += this._vel.x * dt;
    p.y += this._vel.y * dt;
    p.z += this._vel.z * dt;
    this._vel.y -= VendimiaThrow.GRAVITY * dt;
    this.group.rotation.x += this._spin.x * dt;
    this.group.rotation.z += this._spin.z * dt;

    if (p.y < VendimiaThrow.BLOCK_HEIGHT) {
      for (const c of colliders) {
        if (p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ) { this._alive = false; break; }
      }
    }
    this._life -= dt;
    if (this._life <= 0 || p.y < 0.1) this._alive = false;
  }

  kill(): void { this._alive = false; }
  remove(scene: THREE.Scene): void { scene.remove(this.group); }
}
