import * as THREE from 'three';

// Metrotranvía de Mendoza — stylised Siemens-Düwag U2 "dupla":
// red body, white roofline/skirt stripes, dark window band, pantograph,
// double cab (bidirectional), articulated in two sections.
const RED   = new THREE.MeshLambertMaterial({ color: 0xc62828, flatShading: true });
const WHITE = new THREE.MeshLambertMaterial({ color: 0xf0efe9, flatShading: true });
const GLASS = new THREE.MeshLambertMaterial({ color: 0x141a1f });
const GREY  = new THREE.MeshLambertMaterial({ color: 0x6b6e73, flatShading: true });
const DARK  = new THREE.MeshLambertMaterial({ color: 0x2a2c30, flatShading: true });
const STEEL = new THREE.MeshLambertMaterial({ color: 0x33363b });
const HEAD  = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe080, emissiveIntensity: 0.8 });

export class Tram {
  readonly group: THREE.Group;
  private readonly _cx: number;
  private readonly _cz: number;
  private readonly _angle: number;
  private readonly _sinA: number;
  private readonly _cosA: number;
  private readonly _lateral: number;
  private readonly _travelHalf: number;
  private _s: number;
  private _dir: number;
  private _dwell = 0;
  private readonly _stops: number[];
  private _stoppedAt: number | null = null;   // s del andén donde está parado

  static readonly SPEED    = 23;   // más rápido que el sprint de Canito (18)
  static readonly HALF_LEN = 15.5;   // half body length (for collision)
  static readonly HALF_WID = 1.45;
  static readonly STATION_DWELL = 3.2;

  /** Runs along the line through (cx,cz) at `angle`, on the track offset
   *  `lateral` from the centreline, oscillating ±travelHalf. `stops` are
   *  along-track positions (s) where it dwells to pick up passengers. */
  constructor(cx: number, cz: number, angle: number, lateral: number, travelHalf: number, startS: number, dir: number, stops: number[] = []) {
    this._cx = cx; this._cz = cz; this._angle = angle;
    this._sinA = Math.sin(angle); this._cosA = Math.cos(angle);
    this._lateral = lateral;
    this._travelHalf = travelHalf;
    this._s = startS;
    this._dir = dir;
    this._stops = stops;

    this.group = new THREE.Group();
    this.group.rotation.y = angle;
    this._build();
    this._place();
  }

  private _add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    this.group.add(m);
    return m;
  }

  private _build(): void {
    // ── Two articulated sections along local Z ────────────────────────────
    for (const sgn of [-1, 1] as const) {
      const zc = sgn * 7.7;
      this._add(new THREE.BoxGeometry(2.6, 2.3, 14),    RED,   0, 1.95, zc); // body
      this._add(new THREE.BoxGeometry(2.64, 0.78, 12.6), GLASS, 0, 2.5,  zc); // window band
      this._add(new THREE.BoxGeometry(2.62, 0.34, 13.4), WHITE, 0, 3.02, zc); // roofline stripe
      this._add(new THREE.BoxGeometry(2.63, 0.16, 13),   WHITE, 0, 2.0,  zc); // belt stripe
      this._add(new THREE.BoxGeometry(2.5,  0.55, 13.6), DARK,  0, 0.78, zc); // skirt
      this._add(new THREE.BoxGeometry(2.3,  0.18, 13.4), GREY,  0, 3.28, zc); // roof
      // doors
      for (const dz of [-3.5, 3.5] as const)
        for (const sx of [-1, 1] as const)
          this._add(new THREE.BoxGeometry(0.06, 1.7, 1.1), GREY, sx * 1.31, 1.55, zc + dz);
    }

    // ── Articulation accordion ────────────────────────────────────────────
    this._add(new THREE.BoxGeometry(2.4, 2.5, 1.4), DARK, 0, 2.0, 0);

    // ── Cabs / windshields / headlights at both ends ──────────────────────
    for (const sgn of [-1, 1] as const) {
      const ez = sgn * 14.7;
      this._add(new THREE.BoxGeometry(2.5, 2.2, 0.5), RED, 0, 1.95, ez);                 // end cap
      const ws = this._add(new THREE.BoxGeometry(2.2, 1.1, 0.2), GLASS, 0, 2.55, ez + sgn * 0.18);
      ws.rotation.x = sgn * 0.32;                                                        // raked windshield
      this._add(new THREE.BoxGeometry(1.3, 0.32, 0.08), WHITE, 0, 3.12, ez + sgn * 0.02); // destination sign
      for (const sx of [-1, 1] as const)
        this._add(new THREE.BoxGeometry(0.26, 0.18, 0.1), HEAD, sx * 0.8, 1.2, ez + sgn * 0.22);
    }

    // ── Bogies + wheels (3 bogies) ────────────────────────────────────────
    for (const bz of [-11, 0, 11]) {
      this._add(new THREE.BoxGeometry(2.0, 0.4, 2.6), STEEL, 0, 0.5, bz);
      for (const wz of [bz - 0.9, bz + 0.9])
        for (const sx of [-1, 1] as const) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 12), STEEL);
          w.rotation.z = Math.PI / 2;
          w.position.set(sx * 0.72, 0.42, wz);
          w.castShadow = true;
          this.group.add(w);
        }
    }

    // ── Pantograph on the +section roof ───────────────────────────────────
    this._buildPantograph(7.7);
  }

  private _buildPantograph(zc: number): void {
    const baseY = 3.37;
    for (const sx of [-1, 1] as const)
      this._add(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8), DARK, sx * 0.5, baseY + 0.09, zc);
    const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.4, 0.07), STEEL);
    a1.position.set(0, baseY + 0.75, zc - 0.32); a1.rotation.x =  0.5;  this.group.add(a1);
    const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.4, 0.07), STEEL);
    a2.position.set(0, baseY + 1.55, zc + 0.12); a2.rotation.x = -0.55; this.group.add(a2);
    this._add(new THREE.BoxGeometry(1.3, 0.05, 0.08), STEEL, 0, baseY + 1.73, zc + 0.45); // contact bar
  }

  private _place(): void {
    // position = centre + s·(track dir) + lateral·(perpendicular)
    this.group.position.set(
      this._cx + this._sinA * this._s + this._cosA * this._lateral,
      0,
      this._cz + this._cosA * this._s - this._sinA * this._lateral,
    );
  }

  get position(): THREE.Vector3 { return this.group.position; }

  /** ¿Detenido en un andén ahora mismo? (no en las puntas del recorrido) */
  get atStation(): boolean { return this._dwell > 0 && this._stoppedAt !== null; }

  update(dt: number): void {
    if (this._dwell > 0) { this._dwell -= dt; return; }
    const prev = this._s;
    this._s += this._dir * Tram.SPEED * dt;
    if (this._s >= this._travelHalf)      { this._s =  this._travelHalf; this._dir = -1; this._dwell = 1.5; this._stoppedAt = null; }
    else if (this._s <= -this._travelHalf) { this._s = -this._travelHalf; this._dir =  1; this._dwell = 1.5; this._stoppedAt = null; }
    else {
      // ¿Cruzó algún andén este frame? → parar a levantar pasajeros. Se saltea
      // el andén que se acaba de dejar para no quedar atrapado parando ahí.
      for (const st of this._stops) {
        if (st === this._stoppedAt) continue;
        if ((prev - st) * (this._s - st) <= 0) {
          this._s = st;
          this._dwell = Tram.STATION_DWELL;
          this._stoppedAt = st;
          break;
        }
      }
      // ya se alejó lo suficiente del andén anterior → puede volver a parar ahí
      if (this._stoppedAt !== null && Math.abs(this._s - this._stoppedAt) > 6) this._stoppedAt = null;
    }
    this._place();
  }

  /** True if world point (px,pz) within r lies under the tram body. */
  hits(px: number, pz: number, r: number): boolean {
    const wx = px - this.group.position.x;
    const wz = pz - this.group.position.z;
    const lx = this._cosA * wx - this._sinA * wz;
    const lz = this._sinA * wx + this._cosA * wz;
    return Math.abs(lx) < Tram.HALF_WID + r && Math.abs(lz) < Tram.HALF_LEN + r;
  }
}
