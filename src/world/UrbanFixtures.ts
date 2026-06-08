import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { OSMWay, OSMNode } from '../geo/types';
import type { Projection } from '../geo/Projection';

// Detalles urbanos: parches de asfalto en las bocacalles (para que el cruce no
// quede con color de vereda), semáforos, carteles de calles típicos de Mendoza
// y acequias al borde de las veredas.

const HW: Record<string, number> = {
  motorway: 9, trunk: 7, primary: 6, primary_link: 3.5,
  secondary: 5, secondary_link: 3, tertiary: 4, tertiary_link: 2.5,
  residential: 3.5, unclassified: 3.5, living_street: 2.5, road: 3.5,
};
const hwOf = (t: string) => HW[t] ?? 3.5;

// Nombres reales de calles de Mendoza por coordenada de la grilla (paso 100 m).
// Oeste (x negativo) = hacia el Parque; este (x positivo) = hacia el centro/este.
const NS_NAMES: Record<number, string> = {
  [-900]: 'Av. Boulogne Sur Mer', [-800]: 'Paso de los Andes', [-700]: 'Granaderos', [-600]: 'Olascoaga',
  [-500]: 'Cnel. Rodríguez', [-400]: 'Belgrano', [-300]: 'Perú', [-200]: '25 de Mayo',
  [-100]: 'Chile', [0]: 'Av. Mitre', [100]: 'Patricias Mendocinas', [200]: 'Av. España',
  [300]: '9 de Julio', [400]: 'Av. San Martín', [500]: 'San Juan', [600]: 'Rioja',
  [700]: 'Salta',
};
// Las calles E-O cambian de nombre al cruzar Av. San Martín (x=400) y de nuevo
// al cruzar Belgrano (x=-400). Tres tramos: Este (Salta↔San Martín), Medio
// (San Martín↔Belgrano) y Oeste (Belgrano↔Parque).
const EW_EAST: Record<number, string> = {
  [-600]: 'Córdoba', [-500]: 'San Luis', [-400]: 'Entre Ríos', [-300]: 'Buenos Aires',
  [-200]: 'Lavalle', [-100]: 'Catamarca', [0]: 'Garibaldi', [100]: 'Leandro N. Alem',
  [200]: 'Don Bosco', [300]: 'José V. Zapata', [400]: 'Rondeau', [500]: 'Morón',
};
// Tramo San Martín↔Belgrano (el resto coincide con el placeholder)
const EW_MID: Record<number, string> = {
  [-600]: 'Av. Godoy Cruz', [-500]: 'Gral. Paz',
  [0]: 'Sarmiento', [200]: 'San Lorenzo', [300]: 'Av. Colón', [400]: 'Av. Pedro Molina', [500]: 'Peltier',
};
// Placeholder para el tramo medio donde no se redefinió (coincide con la realidad)
const EW_PLACE: Record<number, string> = {
  [-400]: 'Av. Las Heras', [-300]: 'Necochea', [-200]: 'Gutiérrez', [-100]: 'Espejo',
  [100]: 'Rivadavia',
};
// Tramo Belgrano↔Parque (oeste). Córdoba/Godoy Cruz y San Luis/Gral. Paz cortan
// en Perú, así que no tienen nombre oeste (no llegan hasta acá).
const EW_WEST: Record<number, string> = {
  [-400]: 'Av. Juan B. Justo', [-300]: 'L. Aguirre', [-200]: 'N. Avellaneda', [-100]: 'Agustín Álvarez',
  [0]: 'Av. Emilio Civit', [100]: 'Julio A. Roca', [200]: 'Rufino Ortega', [300]: 'Arístides Villanueva',
  [400]: 'Av. Pedro Molina', [500]: 'Pueyrredón',
};
const nameNS = (x: number) => NS_NAMES[Math.round(x / 100) * 100] ?? '';
const nameEW = (x: number, z: number): string => {
  const zk = Math.round(z / 100) * 100;
  if (x >= 400)  return EW_EAST[zk] ?? '';                       // Salta ↔ San Martín
  if (x >= -400) return EW_MID[zk] ?? EW_PLACE[zk] ?? '';        // San Martín ↔ Belgrano
  return EW_WEST[zk] ?? '';                                      // Belgrano ↔ Parque
};

// ── Carteles: textura de canvas con el nombre de la calle (cacheada) ──────────
const texCache = new Map<string, THREE.Texture>();
function signTexture(text: string): THREE.Texture {
  const cached = texCache.get(text);
  if (cached) return cached;
  const cw = 512, ch = 128;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#1d6b3a';                 // verde cartel mendocino
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8;
  ctx.strokeRect(7, 7, cw - 14, ch - 14);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let fs = 60;
  do { ctx.font = `bold ${fs}px Arial, sans-serif`; fs -= 4; }
  while (ctx.measureText(text.toUpperCase()).width > cw - 40 && fs > 24);
  ctx.fillText(text.toUpperCase(), cw / 2, ch / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  texCache.set(text, tex);
  return tex;
}

export function buildUrbanFixtures(
  scene: THREE.Scene, ways: OSMWay[], nodeMap: Map<number, OSMNode>, proj: Projection,
): void {
  // Uso de nodos + ancho máximo por nodo → intersecciones
  const usage = new Map<number, number>();
  const maxHw = new Map<number, number>();
  for (const w of ways) {
    const hw = hwOf(w.tags.highway ?? '');
    for (const nid of w.nodes) {
      usage.set(nid, (usage.get(nid) ?? 0) + 1);
      maxHw.set(nid, Math.max(maxHw.get(nid) ?? 0, hw));
    }
  }
  const seen = new Set<number>();
  const inters: Array<{ x: number; z: number; hw: number }> = [];
  for (const w of ways) for (const nid of w.nodes) {
    if ((usage.get(nid) ?? 0) < 2 || seen.has(nid)) continue;
    seen.add(nid);
    const n = nodeMap.get(nid);
    if (!n) continue;
    const [x, z] = proj.project(n.lat, n.lon);
    inters.push({ x, z, hw: maxHw.get(nid) ?? 3.5 });
  }

  // ── Parches de asfalto en cada bocacalle ──────────────────────────────────
  {
    const geos: THREE.BufferGeometry[] = [];
    for (const it of inters) {
      const s = (it.hw + 2.4) * 2;
      const g = new THREE.PlaneGeometry(s, s);
      g.rotateX(-Math.PI / 2);
      g.translate(it.x, 0.092, it.z);
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    if (merged) {
      const m = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color: 0x3c3c40 }));
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  // ── Acequias al borde de las veredas ──────────────────────────────────────
  buildAcequias(scene, ways, nodeMap, proj, usage);

  // ── Semáforos en las esquinas ─────────────────────────────────────────────
  buildTrafficLights(scene, inters);

  // ── Carteles con nombres de calles ────────────────────────────────────────
  buildStreetSigns(scene, inters);
}

// ── Acequias (canaletas de agua al cordón) ───────────────────────────────────
function buildAcequias(
  scene: THREE.Scene, ways: OSMWay[], nodeMap: Map<number, OSMNode>, proj: Projection,
  usage: Map<number, number>,
): void {
  const water: number[] = [];
  const widx: number[] = [];
  const CORNER = 8;
  const Y = 0.088;
  const pushQuad = (out: number[], idx: number[], ax: number, az: number, bx: number, bz: number, nx: number, nz: number, hw: number) => {
    const base = out.length / 3;
    out.push(ax + nx * hw, Y, az + nz * hw, ax - nx * hw, Y, az - nz * hw,
             bx + nx * hw, Y, bz + nz * hw, bx - nx * hw, Y, bz - nz * hw);
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };

  for (const way of ways) {
    const type = way.tags.highway;
    if (!type) continue;
    const hw = hwOf(type);
    if (hw < 3) continue;
    const pts: [number, number][] = [];
    for (const nid of way.nodes) { const n = nodeMap.get(nid); if (n) pts.push(proj.project(n.lat, n.lon)); }
    if (pts.length < 2) continue;

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const L = Math.hypot(dx, dz);
      if (L < 2) continue;
      const udx = dx / L, udz = dz / L, nx = -udz, nz = udx;
      const aInt = (usage.get(way.nodes[i]) ?? 0) >= 2;
      const bInt = (usage.get(way.nodes[i + 1]) ?? 0) >= 2;
      const t0 = aInt ? CORNER : 0;
      const t1 = bInt ? L - CORNER : L;
      if (t1 - t0 < 1) continue;
      const ax = x0 + udx * t0, az = z0 + udz * t0;
      const bx = x0 + udx * t1, bz = z0 + udz * t1;
      // Canaleta a cada lado, justo en el cordón (offset = hw + 0.35), ancho 0.5
      for (const side of [1, -1]) {
        const off = (hw + 0.35) * side;
        pushQuad(water, widx, ax + nx * off, az + nz * off, bx + nx * off, bz + nz * off, nx, nz, 0.25);
      }
    }
  }
  if (water.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(water, 3));
    g.setIndex(widx); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x3f74a0, transparent: true, opacity: 0.85 })));
  }
}

// ── Semáforos ────────────────────────────────────────────────────────────────
function buildTrafficLights(scene: THREE.Scene, inters: Array<{ x: number; z: number; hw: number }>): void {
  const post = mergeGeometries([
    new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8).translate(0, 1.7, 0),
    new THREE.BoxGeometry(0.34, 1.05, 0.3).translate(0, 3.7, 0),
  ], false)!;
  const redG    = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 4.05, 0.16);
  const yellowG = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 3.7,  0.16);
  const greenG  = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 3.35, 0.16);

  const mats: THREE.Matrix4[] = [];
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (const it of inters) {
    const co = it.hw + 1.3;
    for (const [sx, sz] of [[1, 1], [-1, -1]] as Array<[number, number]>) {
      const rotY = Math.atan2(-sx, -sz);   // mirar hacia el centro del cruce
      const m = new THREE.Matrix4();
      m.compose(new THREE.Vector3(it.x + sx * co, 0, it.z + sz * co),
                new THREE.Quaternion().setFromAxisAngle(yAxis, rotY), new THREE.Vector3(1, 1, 1));
      mats.push(m);
    }
  }
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mesh.castShadow = true;
    for (let i = 0; i < mats.length; i++) mesh.setMatrixAt(i, mats[i]);
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  };
  inst(post,    new THREE.MeshLambertMaterial({ color: 0x2a2a2e, flatShading: true }));
  inst(redG,    new THREE.MeshLambertMaterial({ color: 0xff3020, emissive: 0xaa1000, emissiveIntensity: 0.6 }));
  inst(yellowG, new THREE.MeshLambertMaterial({ color: 0xffc020, emissive: 0x886000, emissiveIntensity: 0.4 }));
  inst(greenG,  new THREE.MeshLambertMaterial({ color: 0x30d040, emissive: 0x108020, emissiveIntensity: 0.6 }));
}

// ── Carteles de calles ───────────────────────────────────────────────────────
function buildStreetSigns(scene: THREE.Scene, inters: Array<{ x: number; z: number; hw: number }>): void {
  const poleMats: THREE.Matrix4[] = [];
  const platesByName = new Map<string, THREE.BufferGeometry[]>();
  const yAxis = new THREE.Vector3(0, 1, 0);

  for (const it of inters) {
    const co = it.hw + 1.4;
    const px = it.x - co, pz = it.z + co;          // esquina (-x,+z)
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(px, 0, pz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    poleMats.push(m);

    const ns = nameNS(it.x), ew = nameEW(it.x, it.z);
    if (ew) {
      const g = new THREE.PlaneGeometry(2.7, 0.66);  // paralelo a la calle E-O (normal +Z)
      g.translate(px, 3.05, pz);
      (platesByName.get(ew) ?? platesByName.set(ew, []).get(ew)!).push(g);
    }
    if (ns) {
      const g = new THREE.PlaneGeometry(2.7, 0.66);  // paralelo a la calle N-S (normal +X)
      g.rotateY(Math.PI / 2);
      g.translate(px, 2.3, pz);
      (platesByName.get(ns) ?? platesByName.set(ns, []).get(ns)!).push(g);
    }
  }

  // Postes (instanciados)
  if (poleMats.length) {
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.5, 6).translate(0, 1.75, 0);
    const mesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x556070 }), poleMats.length);
    mesh.castShadow = true;
    for (let i = 0; i < poleMats.length; i++) mesh.setMatrixAt(i, poleMats[i]);
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }
  // Placas (una malla fusionada por nombre, con su textura)
  for (const [name, geos] of platesByName) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ map: signTexture(name), side: THREE.DoubleSide }));
    scene.add(mesh);
  }
}
