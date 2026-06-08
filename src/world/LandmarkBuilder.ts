import * as THREE from 'three';
import type { AABB } from '../entities/Canito';

// ── Shared helpers ───────────────────────────────────────────────

function lam(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

function add(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number, y: number, z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function box(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): void {
  add(parent, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z);
}

function cyl(parent: THREE.Object3D, mat: THREE.Material, rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number): void {
  add(parent, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y + h / 2, z);
}

function tube2D(parent: THREE.Object3D, pts: [number, number][], z0: number, r: number, mat: THREE.Material): void {
  const v3 = pts.map(([x, y]) => new THREE.Vector3(x, y, z0));
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v3), pts.length * 6, r, 5, false);
  const m   = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  parent.add(m);
}

function spiral(parent: THREE.Object3D, cx: number, cy: number, z0: number, r0: number, r1: number, turns: number, mat: THREE.Material, tubeR = 0.022): void {
  const pts: [number, number][] = [];
  const steps = Math.abs(turns) * 32;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 * turns;
    const r = r0 + (r1 - r0) * t;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  tube2D(parent, pts, z0, tubeR, mat);
}

function cCurve(parent: THREE.Object3D, x1: number, y1: number, x2: number, y2: number, z0: number, bx: number, by: number, tubeR: number, mat: THREE.Material): void {
  tube2D(parent, [[x1, y1], [(x1+x2)/2+bx, (y1+y2)/2+by], [x2, y2]], z0, tubeR, mat);
}

// ── Portones sub-builders ─────────────────────────────────────────

function ironPillar(g: THREE.Group, x: number, z0: number, iron: THREE.Material, gold: THREE.Material, glass: THREE.Material): void {
  const b = (w: number, h: number, d: number, mat: THREE.Material, oy: number) => box(g, mat, w, h, d, x, oy, z0);
  const c = (rt: number, rb: number, h: number, mat: THREE.Material, oy: number) => cyl(g, mat, rt, rb, h, 12, x, oy, z0);

  b(1.0, 0.15, 1.0, iron, 0.0);
  b(0.88, 0.18, 0.88, iron, 0.15);
  b(0.72, 0.18, 0.72, iron, 0.33);
  b(0.58, 0.14, 0.58, iron, 0.51);
  b(0.42, 5.2,  0.42, iron, 0.65);
  b(0.46, 0.1,  0.46, gold, 1.5);
  b(0.46, 0.1,  0.46, gold, 3.5);
  b(0.46, 0.1,  0.46, gold, 5.4);

  for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]] as const) {
    const bx = x + sx * 0.28, bz = z0 + sz * 0.28;
    for (const oy of [1.85, 3.85]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), iron);
      m.position.set(bx, oy + 0.14, bz);
      g.add(m);
    }
  }

  b(0.58, 0.14, 0.58, iron, 5.85);
  b(0.70, 0.18, 0.70, iron, 5.99);
  b(0.82, 0.14, 0.82, iron, 6.17);
  b(0.68, 0.12, 0.68, gold, 6.31);
  b(0.58, 0.18, 0.58, iron, 6.43);

  c(0.20, 0.26, 0.35, iron, 6.61);
  c(0.14, 0.14, 0.22, iron, 6.96);

  // Farol
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.65, 8), glass);
  lantern.position.set(x, 7.18 + 0.325, z0);
  g.add(lantern);

  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const fr  = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.67, 0.04), iron);
    fr.position.set(x + Math.cos(ang) * 0.21, 7.505, z0 + Math.sin(ang) * 0.21);
    g.add(fr);
  }

  for (const fy of [7.18, 7.505, 7.83]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.025, 5, 8), iron);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, fy, z0);
    g.add(ring);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.42, 8), iron);
  roof.position.set(x, 7.83 + 0.21, z0);
  g.add(roof);

  c(0.06, 0.06, 0.22, iron, 8.25);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), gold);
  sphere.position.set(x, 8.57, z0);
  g.add(sphere);

  const pl = new THREE.PointLight(0xffe090, 1.0, 18);
  pl.position.set(x, 7.5, z0);
  g.add(pl);
}

function gatePanel(g: THREE.Group, cx: number, z0: number, width: number, height: number, iron: THREE.Material, gold: THREE.Material, isMain: boolean): void {
  for (const ry of [0.22, height * 0.38, height * 0.68, height]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(width + 0.05, 0.07, 0.07), iron);
    r.position.set(cx, ry, z0);
    r.castShadow = true;
    g.add(r);
  }

  const spacing = isMain ? 0.30 : 0.34;
  const n = Math.round(width / spacing);
  for (let i = 0; i <= n; i++) {
    const bx = cx - width / 2 + i * (width / n);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, height, 6), iron);
    bar.position.set(bx, height / 2, z0);
    bar.castShadow = true;
    g.add(bar);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.28, 4), iron);
    tip.position.set(bx, height + 0.14, z0);
    g.add(tip);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), iron);
    knob.position.set(bx, height - 0.08, z0);
    g.add(knob);
  }

  if (isMain) {
    const half    = width / 2;
    const decoBase = height * 0.68;
    const decoMid  = height * 0.84;

    const panelArch = new THREE.Mesh(new THREE.TorusGeometry(half * 0.72, 0.03, 6, 20, Math.PI), iron);
    panelArch.position.set(cx, decoBase, z0);
    panelArch.castShadow = true;
    g.add(panelArch);

    spiral(g, cx - half * 0.72, decoBase, z0, 0.25, 0.03, -1.5, iron);
    spiral(g, cx + half * 0.72, decoBase, z0, 0.25, 0.03,  1.5, iron);
    cCurve(g, cx, decoBase + half * 0.72, cx - half * 0.5, decoBase + 0.15, z0, -0.25, 0, 0.022, iron);
    cCurve(g, cx, decoBase + half * 0.72, cx + half * 0.5, decoBase + 0.15, z0,  0.25, 0, 0.022, iron);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.038, 6, 14), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, decoMid + 0.2, z0);
    g.add(ring);

    const oct = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), gold);
    oct.rotation.z = Math.PI / 4;
    oct.position.set(cx, decoMid + 0.2, z0);
    g.add(oct);
  }
}

function fenceSection(g: THREE.Group, cx: number, z0: number, width: number, iron: THREE.Material): void {
  for (const ry of [0.28, 1.5, 2.9]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(width, 0.055, 0.055), iron);
    r.position.set(cx, ry, z0);
    g.add(r);
  }
  const sp = 0.38, n = Math.round(width / sp);
  for (let i = 0; i <= n; i++) {
    const bx  = cx - width / 2 + i * (width / n);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.92, 6), iron);
    bar.position.set(bx, 1.46, z0);
    g.add(bar);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.22, 4), iron);
    tip.position.set(bx, 2.92 + 0.11, z0);
    g.add(tip);
  }
}

function mainArch(g: THREE.Group, z0: number, iron: THREE.Material, gold: THREE.Material): void {
  const R     = 4.0;
  const baseY = 5.85;

  const oa = new THREE.Mesh(new THREE.TorusGeometry(R, 0.11, 8, 40, Math.PI), iron);
  oa.position.set(0, baseY, z0);
  oa.castShadow = true;
  g.add(oa);

  const ia = new THREE.Mesh(new THREE.TorusGeometry(R - 0.5, 0.05, 6, 30, Math.PI), iron);
  ia.position.set(0, baseY, z0);
  g.add(ia);

  for (let i = 1; i < 9; i++) {
    const a = (i / 9) * Math.PI;
    cCurve(g, Math.cos(a) * (R-0.5), Math.sin(a) * (R-0.5) + baseY,
              Math.cos(a) * R,        Math.sin(a) * R        + baseY,
              z0, 0, 0, 0.028, iron);
  }

  for (let i = 1; i < 7; i++) {
    const a   = (i / 7) * Math.PI;
    const ax  = Math.cos(a) * (R - 0.5);
    const ay  = Math.sin(a) * (R - 0.5) + baseY;
    const hh  = 0.6 + Math.sin(a) * 0.4;
    const hb  = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, hh, 5), iron);
    hb.position.set(ax, ay - hh / 2, z0);
    g.add(hb);
  }

  for (const sx of [-1, 1] as const) {
    spiral(g, sx * (R-0.3), baseY,       z0, 0.4,  0.05, -sx * 1.5, iron);
    spiral(g, sx * (R-0.3) * 0.7, baseY + 1.5, z0, 0.28, 0.04,  sx * 1.2, iron, 0.018);
    cCurve(g, sx * R, baseY, sx * (R-0.3), baseY - 0.35, z0, sx * 0.3, -0.1, 0.028, iron);
  }

  // Medallón
  const apexY = baseY + R;
  const disc  = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.10, 16), gold);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(0, apexY, z0);
  g.add(disc);

  const discRing = new THREE.Mesh(new THREE.TorusGeometry(0.60, 0.065, 6, 20), iron);
  discRing.rotation.x = Math.PI / 2;
  discRing.position.set(0, apexY, z0);
  g.add(discRing);

  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.28, 4), gold);
    ray.position.set(Math.cos(ang) * 0.75, apexY + Math.sin(ang) * 0.75, z0);
    ray.rotation.z = ang + Math.PI / 2;
    g.add(ray);
  }

  // Corona
  const crownBase = apexY + 0.62;
  const crownCyl  = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.30, 12), gold);
  crownCyl.position.set(0, crownBase + 0.15, z0);
  g.add(crownCyl);

  for (let a = 0; a < 5; a++) {
    const ang   = (a / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.38, 4), gold);
    spike.position.set(Math.cos(ang) * 0.28, crownBase + 0.49, z0 + Math.sin(ang) * 0.28);
    g.add(spike);
  }
  const topSphere = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), gold);
  topSphere.position.set(0, crownBase + 0.65, z0);
  g.add(topSphere);

  const topBar = new THREE.Mesh(new THREE.BoxGeometry(R * 2 + 0.1, 0.09, 0.09), iron);
  topBar.position.set(0, baseY, z0);
  g.add(topBar);
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Fuente de Plaza Independencia.
 * wx, wz: center position in world space.
 */
export function buildFountain(scene: THREE.Scene, wx: number, wz: number): AABB {
  const stone = lam(0xc8bfa8);
  const water = lam(0x4a88c8);
  const spray = lam(0x88c0e8);

  const addAt = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };

  addAt(new THREE.CylinderGeometry(2.0, 2.0, 0.38, 24), stone, wx, 0.19,       wz);
  addAt(new THREE.CylinderGeometry(1.6, 1.6, 0.55, 24), stone, wx, 0.38 + 0.275, wz);
  addAt(new THREE.CylinderGeometry(1.25,1.25,0.06, 24), water, wx, 0.94,        wz);
  addAt(new THREE.CylinderGeometry(0.13,0.13,0.55, 12), stone, wx, 0.96 + 0.275, wz);
  addAt(new THREE.SphereGeometry(0.2, 10, 8),           spray, wx, 1.55,        wz);

  return { minX: wx - 2.1, maxX: wx + 2.1, minZ: wz - 2.1, maxZ: wz + 2.1 };
}

/**
 * Muro perimetral del parque a lo largo de x = cx, cerrando todo salvo el hueco
 * de los Portones (zGapMin..zGapMax), para que sólo se entre por la puerta.
 * Devuelve los colliders (paredes, más gruesas que el mesh para evitar tunneling).
 */
export function buildParkWall(
  scene: THREE.Scene, cx: number,
  zMin: number, zMax: number, zGapMin: number, zGapMax: number,
): AABB[] {
  const wallMat = lam(0x3a3028);
  const capMat  = lam(0x4a4038);
  const segs: Array<[number, number]> = [[zMin, zGapMin], [zGapMax, zMax]];
  const colliders: AABB[] = [];

  for (const [z0, z1] of segs) {
    const len = z1 - z0;
    if (len <= 0) continue;
    const cz = (z0 + z1) / 2;

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, len), wallMat);
    body.position.set(cx, 1.6, cz);
    body.castShadow = true;
    body.receiveShadow = true;
    scene.add(body);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, len), capMat);
    cap.position.set(cx, 3.35, cz);
    cap.castShadow = true;
    scene.add(cap);

    // Pilastras cada ~22 m
    for (let z = z0; z <= z1; z += 22) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.7, 1.0), wallMat);
      pil.position.set(cx, 1.85, z);
      pil.castShadow = true;
      scene.add(pil);
    }

    colliders.push({ minX: cx - 0.8, maxX: cx + 0.8, minZ: z0, maxZ: z1 });
  }

  return colliders;
}

/**
 * Portones del Parque General San Martín.
 * cx, cz: world position of the gate center.
 * The gate face is perpendicular to the X axis (Canito approaches from +X side).
 */
export function buildPortones(scene: THREE.Scene, cx: number, cz: number): AABB[] {
  const group = new THREE.Group();
  group.rotation.y = -Math.PI / 2;   // spans Z axis in world space
  group.position.set(cx, 0, cz);
  scene.add(group);

  const iron  = lam(0x0c1014);
  const gold  = lam(0xd4a018);
  const glass = new THREE.MeshLambertMaterial({ color: 0xffe070, transparent: true, opacity: 0.68 });
  const Z0    = 0;

  for (const px of [-9, -4, 4, 9]) ironPillar(group, px, Z0, iron, gold, glass);

  gatePanel(group, -6.5, Z0, 4.7, 4.5, iron, gold, false);
  gatePanel(group, -2.1, Z0, 3.7, 6.0, iron, gold, true);
  gatePanel(group,  2.1, Z0, 3.7, 6.0, iron, gold, true);
  gatePanel(group,  6.5, Z0, 4.7, 4.5, iron, gold, false);

  for (const bx of [-6.5, 6.5]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.09, 0.09), iron);
    bar.position.set(bx, 4.52, Z0);
    group.add(bar);
  }

  mainArch(group, Z0, iron, gold);
  fenceSection(group, -20, Z0, 20, iron);
  fenceSection(group,  20, Z0, 20, iron);

  const wallMat = lam(0x3a3028);
  for (const bx of [-39, 39]) {
    const wm = new THREE.Mesh(new THREE.BoxGeometry(18, 3.2, 0.5), wallMat);
    wm.position.set(bx, 1.6, Z0);
    group.add(wm);
  }

  // World-space colliders.
  // Group rotation -90° around Y: local (lx, ly, lz) → world (cx - lz, ly, cz + lx)
  // With lz = Z0 = 0: local (lx, ly, 0) → world (cx, ly, cz + lx)
  const pillarAABB = (lx: number): AABB => ({
    minX: cx - 0.45, maxX: cx + 0.45,
    minZ: cz + lx - 0.45, maxZ: cz + lx + 0.45,
  });

  return [
    pillarAABB(-9), pillarAABB(-4), pillarAABB(4), pillarAABB(9),
    // Left fence (local lx from -30 to -9.5)
    { minX: cx - 0.3, maxX: cx + 0.3, minZ: cz - 30,  maxZ: cz - 9.5 },
    // Right fence (local lx from 9.5 to 30)
    { minX: cx - 0.3, maxX: cx + 0.3, minZ: cz + 9.5, maxZ: cz + 30  },
    // Left closing wall
    { minX: cx - 0.4, maxX: cx + 0.4, minZ: cz - 50,  maxZ: cz - 29  },
    // Right closing wall
    { minX: cx - 0.4, maxX: cx + 0.4, minZ: cz + 29,  maxZ: cz + 50  },
  ];
}
