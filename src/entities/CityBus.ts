import * as THREE from 'three';
import type { AABB } from './Canito';

// Bus Turístico "City Bus Mendoza": doble piso rojo descapotable. Recorre un
// circuito (rodea la Plaza Independencia) despacio. No hace daño, pero es un
// collider móvil que EMPUJA a Canito y a los enemigos que tenga delante.
const RED    = new THREE.MeshLambertMaterial({ color: 0xc0282a, flatShading: true });
const RED2   = new THREE.MeshLambertMaterial({ color: 0x9c1e20, flatShading: true });
const CREAM  = new THREE.MeshLambertMaterial({ color: 0xeee6d8, flatShading: true });
const GLASS  = new THREE.MeshLambertMaterial({ color: 0x1a2632 });
const GREY   = new THREE.MeshLambertMaterial({ color: 0x3a3a40, flatShading: true });
const WHEEL  = new THREE.MeshLambertMaterial({ color: 0x141416 });
const SEATM  = new THREE.MeshLambertMaterial({ color: 0x2a3b6a, flatShading: true });
const METAL  = new THREE.MeshLambertMaterial({ color: 0xb8bcc2 });

function logoTex(): THREE.Texture {
  const w = 384, h = 256;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#c0282a'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#ffffff'; c.lineWidth = 13;
  c.beginPath(); c.arc(w / 2, h / 2 - 18, 96, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = 'bold 66px Arial, sans-serif';
  c.fillText('CITY', w / 2, h / 2 - 52);
  c.fillText('BUS', w / 2, h / 2 + 14);
  c.font = 'bold 36px Arial, sans-serif';
  c.fillText('MENDOZA', w / 2, h / 2 + 98);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
}

export class CityBus {
  readonly group: THREE.Group;
  readonly collider: AABB;
  dirX = 0; dirZ = -1;
  private _x: number; private _z: number;
  private readonly _wps: Array<[number, number]>;
  private _i = 1;

  static readonly SPEED    = 2.6;   // bien despacio
  static readonly HALF_LEN = 5.5;
  static readonly HALF_W   = 1.45;

  /** Sigue el circuito de `waypoints` (rectángulo alrededor de la plaza). */
  constructor(waypoints: Array<[number, number]>) {
    this._wps = waypoints;
    [this._x, this._z] = waypoints[0];
    this.group = new THREE.Group();
    this._build();
    this.collider = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    this._updateHeading();
    this._place();
  }

  private _add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; this.group.add(m); return m;
  }

  private _build(): void {
    // Cuerpo (largo a lo largo de Z, frente en +Z)
    this._add(new THREE.BoxGeometry(2.5, 2.0, 11), RED, 0, 1.5, 0);
    this._add(new THREE.BoxGeometry(2.5, 0.55, 11), CREAM, 0, 0.75, 0);     // faldón crema
    this._add(new THREE.BoxGeometry(2.54, 0.85, 9.6), GLASS, 0, 2.0, 0);    // ventanas inferiores
    this._add(new THREE.BoxGeometry(2.5, 1.0, 0.3), GLASS, 0, 2.3, 5.55);   // parabrisas
    for (const sx of [-1, 1]) this._add(new THREE.BoxGeometry(0.28, 0.2, 0.15), CREAM, sx * 0.85, 1.2, 5.6);

    // Piso superior descapotable
    this._add(new THREE.BoxGeometry(2.5, 0.9, 9.2), RED2, 0, 3.05, -0.4);
    this._add(new THREE.BoxGeometry(2.46, 0.35, 9.2), GREY, 0, 3.6, -0.4);
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1])
      this._add(new THREE.BoxGeometry(0.7, 0.4, 0.7), SEATM, sx * 0.55, 3.95, -3.4 + i * 1.6);
    const railY = 4.25;
    this._add(new THREE.BoxGeometry(2.5, 0.06, 0.06), METAL, 0, railY, 4.2);
    this._add(new THREE.BoxGeometry(2.5, 0.06, 0.06), METAL, 0, railY, -5.0);
    for (const sx of [-1, 1]) this._add(new THREE.BoxGeometry(0.06, 0.06, 9.2), METAL, sx * 1.23, railY, -0.4);
    for (let i = 0; i <= 6; i++) for (const sx of [-1, 1])
      this._add(new THREE.BoxGeometry(0.05, 0.5, 0.05), METAL, sx * 1.23, 4.0, -5.0 + i * 1.55);

    // Ruedas
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.3, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const z of [3.6, -3.6]) for (const sx of [1, -1]) this._add(wheelGeo, WHEEL, sx * 1.2, 0.55, z);

    // Logo "CITY BUS MENDOZA" en ambos costados (mirando hacia afuera) + frente
    const tex = logoTex();
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    for (const sx of [-1, 1] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), mat);
      m.position.set(sx * 1.29, 1.5, 0.5);
      m.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;   // normal hacia afuera (+X / -X)
      this.group.add(m);
    }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.93), mat);
    front.position.set(0, 1.35, 5.72);
    this.group.add(front);

    this.group.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true; });
  }

  private _updateHeading(): void {
    const [tx, tz] = this._wps[this._i];
    const dx = tx - this._x, dz = tz - this._z, d = Math.hypot(dx, dz) || 1;
    this.dirX = dx / d; this.dirZ = dz / d;
    this.group.rotation.y = Math.atan2(this.dirX, this.dirZ);
  }

  private _place(): void {
    this.group.position.set(this._x, 0, this._z);
    const ew = Math.abs(this.dirX) > Math.abs(this.dirZ);
    const hx = ew ? CityBus.HALF_LEN : CityBus.HALF_W;
    const hz = ew ? CityBus.HALF_W : CityBus.HALF_LEN;
    this.collider.minX = this._x - hx; this.collider.maxX = this._x + hx;
    this.collider.minZ = this._z - hz; this.collider.maxZ = this._z + hz;
  }

  get position(): THREE.Vector3 { return this.group.position; }

  /** ¿El punto (x,z) con radio r está dentro del bus? */
  contains(x: number, z: number, r: number): boolean {
    const c = this.collider;
    return x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ;
  }

  update(dt: number): void {
    const [tx, tz] = this._wps[this._i];
    const dx = tx - this._x, dz = tz - this._z, dist = Math.hypot(dx, dz);
    const step = CityBus.SPEED * dt;
    if (dist <= step) {
      this._x = tx; this._z = tz;
      this._i = (this._i + 1) % this._wps.length;
      this._updateHeading();
    } else {
      this._x += this.dirX * step; this._z += this.dirZ * step;
    }
    this._place();
  }
}
