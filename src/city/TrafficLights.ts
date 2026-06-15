import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityGraph } from './CityGraph';

// Semáforos sincronizados en las intersecciones. Fase global: primero verde N-S,
// luego verde E-O, con un breve "todo rojo" entre medio para despejar el cruce.
// Los autos consultan `isRed(nodeId, isNS)` para frenar en la línea de pare.

const CYCLE   = 9.0;   // segundos por ciclo completo
const G_NS_LO = 0.00, G_NS_HI = 0.44;   // verde N-S
const G_EW_LO = 0.50, G_EW_HI = 0.94;   // verde E-O
// (los huecos 0.44–0.50 y 0.94–1.0 son "todo rojo")

export class TrafficLights {
  readonly lightNodes = new Set<number>();
  private nsMat: THREE.MeshLambertMaterial;
  private ewMat: THREE.MeshLambertMaterial;
  private t = 0;
  private greenNS = true;
  private greenEW = false;

  constructor(scene: THREE.Scene, graph: CityGraph) {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e, flatShading: true });
    this.nsMat = new THREE.MeshLambertMaterial({ color: 0x30d040, emissive: 0x108020, emissiveIntensity: 0.7 });
    this.ewMat = new THREE.MeshLambertMaterial({ color: 0xff3020, emissive: 0xaa1000, emissiveIntensity: 0.7 });

    const poleGeos: THREE.BufferGeometry[] = [];
    const nsLampGeos: THREE.BufferGeometry[] = [];
    const ewLampGeos: THREE.BufferGeometry[] = [];

    const postGeo = () => mergeGeometries([
      new THREE.CylinderGeometry(0.08, 0.1, 3.8, 8).translate(0, 1.9, 0),
      new THREE.BoxGeometry(0.34, 0.95, 0.3).translate(0, 4.1, 0),
    ], false)!;

    for (const node of graph.nodes.values()) {
      if (node.edges.length < 3) continue;     // sólo intersecciones reales
      this.lightNodes.add(node.id);
      // dos postes: uno gobierna N-S, otro E-O, en esquinas opuestas
      const place = (gx: number, gz: number, lampGeos: THREE.BufferGeometry[]) => {
        poleGeos.push(postGeo().translate(node.x + gx, 0, node.z + gz));
        lampGeos.push(new THREE.SphereGeometry(0.16, 8, 6).translate(node.x + gx, 4.2, node.z + gz + 0.16));
      };
      place( 6,  6, nsLampGeos);
      place(-6, -6, ewLampGeos);
    }

    const commit = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!geos.length) return;
      const m = mergeGeometries(geos, false);
      if (m) { const mesh = new THREE.Mesh(m, mat); mesh.castShadow = true; scene.add(mesh); }
    };
    commit(poleGeos, poleMat);
    commit(nsLampGeos, this.nsMat);
    commit(ewLampGeos, this.ewMat);
  }

  update(dt: number): void {
    this.t = (this.t + dt) % CYCLE;
    const p = this.t / CYCLE;
    this.greenNS = p >= G_NS_LO && p < G_NS_HI;
    this.greenEW = p >= G_EW_LO && p < G_EW_HI;
    // verde / rojo (con ámbar tenue en el "todo rojo")
    this.nsMat.color.setHex(this.greenNS ? 0x30d040 : 0xff3020);
    this.nsMat.emissive.setHex(this.greenNS ? 0x108020 : 0xaa1000);
    this.ewMat.color.setHex(this.greenEW ? 0x30d040 : 0xff3020);
    this.ewMat.emissive.setHex(this.greenEW ? 0x108020 : 0xaa1000);
  }

  /** ¿Está en rojo para un auto que llega a `nodeId` por el eje dado? */
  isRed(nodeId: number, isNS: boolean): boolean {
    if (!this.lightNodes.has(nodeId)) return false;
    return isNS ? !this.greenNS : !this.greenEW;
  }
}
