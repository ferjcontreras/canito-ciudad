// Navigation graph built from the street layout (grid of intersections).
// Pedestrians and vehicles traverse it edge-by-edge, turning at intersections
// (the "corners") and crossing via a short straight phase so the motion reads
// naturally instead of teleporting between sidewalks/lanes.
import type { OSMWay, OSMNode } from '../geo/types';
import type { Projection } from '../geo/Projection';

const HALF_WIDTH: Record<string, number> = {
  primary: 6, primary_link: 3.5,
  secondary: 5, secondary_link: 3,
  tertiary: 4, tertiary_link: 2.5,
  residential: 3.5, unclassified: 3.5, living_street: 2.5, road: 3.5,
};

export interface GEdge {
  a: number; b: number;
  ax: number; az: number; bx: number; bz: number;
  dx: number; dz: number;   // unit direction a→b
  len: number; halfW: number;
}
export interface GNode { id: number; x: number; z: number; edges: number[]; }

export class CityGraph {
  readonly nodes = new Map<number, GNode>();
  readonly edges: GEdge[] = [];

  constructor(streets: OSMWay[], nodeMap: Map<number, OSMNode>, proj: Projection) {
    const ensure = (id: number, x: number, z: number): GNode => {
      let n = this.nodes.get(id);
      if (!n) { n = { id, x, z, edges: [] }; this.nodes.set(id, n); }
      return n;
    };

    for (const way of streets) {
      const type = way.tags.highway;
      if (!type) continue;
      const hw = HALF_WIDTH[type] ?? 3.5;

      const pts: { id: number; x: number; z: number }[] = [];
      for (const nid of way.nodes) {
        const nd = nodeMap.get(nid);
        if (nd) { const [x, z] = proj.project(nd.lat, nd.lon); pts.push({ id: nid, x, z }); }
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const A = pts[i], B = pts[i + 1];
        const dx = B.x - A.x, dz = B.z - A.z;
        const len = Math.hypot(dx, dz);
        if (len < 1) continue;
        const na = ensure(A.id, A.x, A.z);
        const nb = ensure(B.id, B.x, B.z);
        const ei = this.edges.length;
        this.edges.push({
          a: A.id, b: B.id, ax: A.x, az: A.z, bx: B.x, bz: B.z,
          dx: dx / len, dz: dz / len, len, halfW: hw,
        });
        na.edges.push(ei);
        nb.edges.push(ei);
      }
    }
  }

  /** A random edge, optionally restricted to those allowed by `allow`. */
  randomEdge(allow?: (i: number) => boolean): number {
    if (!allow) return Math.floor(Math.random() * this.edges.length);
    const ok: number[] = [];
    for (let i = 0; i < this.edges.length; i++) if (allow(i)) ok.push(i);
    if (ok.length === 0) return Math.floor(Math.random() * this.edges.length);
    return ok[(Math.random() * ok.length) | 0];
  }

  /** Choose a continuing edge at `node`, arriving via `viaEdge`. Avoids an
   *  immediate U-turn unless it's a dead end. `allow` filters usable edges
   *  (e.g. vehicles must not turn onto the tram tracks). */
  nextEdge(node: number, viaEdge: number, allow?: (i: number) => boolean): { edge: number; toNode: number } | null {
    const n = this.nodes.get(node);
    if (!n) return null;
    const opts: { edge: number; toNode: number }[] = [];
    for (const ei of n.edges) {
      if (ei === viaEdge) continue;
      if (allow && !allow(ei)) continue;
      const e = this.edges[ei];
      const to = e.a === node ? e.b : e.a;
      opts.push({ edge: ei, toNode: to });
    }
    if (opts.length === 0) {
      // sin salida permitida: volver por donde vino
      const e = this.edges[viaEdge];
      const to = e.a === node ? e.b : e.a;
      return { edge: viaEdge, toNode: to };
    }
    return opts[(Math.random() * opts.length) | 0];
  }
}

// ── A single agent walking/driving the graph ───────────────────────────────
// `offsetFn(halfW)` returns the perpendicular distance from the road centreline
// for the current edge (positive = right-hand side of travel, so two-way
// traffic and opposite sidewalks fall out automatically). Pedestrians use
// halfW + sidewalk inset; vehicles use a fraction of halfW (right lane).
export class PathAgent {
  private edge: number;
  private dir: 1 | -1;          // +1 = a→b, -1 = b→a
  private s = 0;                // distance travelled along current edge
  private phase: 'go' | 'cross' = 'go';
  private cFromX = 0; private cFromZ = 0;
  private cToX = 0;   private cToZ = 0;
  private cT = 0;     private cDur = 0;

  x = 0; z = 0; heading = 0;
  moving = true;
  speedScale = 1;               // 0 = frenado (lo setea el manager por frame)
  // Info para los semáforos: nodo (intersección) que tiene adelante, distancia
  // a él, y si está cruzando una intersección ahora mismo.
  nodeId = -1; distNode = Infinity; inCross = false;

  constructor(
    private graph: CityGraph,
    private offsetFn: (halfW: number) => number,
    public speed: number,
    private allow?: (i: number) => boolean,
  ) {
    this.edge = graph.randomEdge(allow);
    this.dir = Math.random() < 0.5 ? 1 : -1;
    const e = graph.edges[this.edge];
    this.s = Math.random() * e.len;
    this._placeGo();
  }

  /** Travel unit vector for the current edge+dir. */
  private _travel(): [number, number] {
    const e = this.graph.edges[this.edge];
    return this.dir === 1 ? [e.dx, e.dz] : [-e.dx, -e.dz];
  }
  private _startPos(): [number, number] {
    const e = this.graph.edges[this.edge];
    return this.dir === 1 ? [e.ax, e.az] : [e.bx, e.bz];
  }
  private _placeGo(): void {
    const e = this.graph.edges[this.edge];
    const off = this.offsetFn(e.halfW);
    const [tx, tz] = this._travel();
    const [sx, sz] = this._startPos();
    const ox = tz, oz = -tx;                 // right-hand perpendicular
    this.x = sx + tx * this.s + ox * off;
    this.z = sz + tz * this.s + oz * off;
    this.heading = Math.atan2(tx, tz);
  }

  private _beginCross(toEdge: number, toDir: 1 | -1, node: number): void {
    // start point of the new edge+dir, plus a tiny lead-in
    const e = this.graph.edges[toEdge];
    const off = this.offsetFn(e.halfW);
    const [sx, sz] = toDir === 1 ? [e.ax, e.az] : [e.bx, e.bz];
    const tx = toDir === 1 ? e.dx : -e.dx;
    const tz = toDir === 1 ? e.dz : -e.dz;
    const ox = tz, oz = -tx;
    const lead = 2;
    const toX = sx + tx * lead + ox * off;
    const toZ = sz + tz * lead + oz * off;

    this.cFromX = this.x; this.cFromZ = this.z;
    this.cToX = toX; this.cToZ = toZ;
    const d = Math.hypot(toX - this.x, toZ - this.z);
    this.cDur = Math.max(0.2, d / this.speed);
    this.cT = 0;
    this.phase = 'cross';

    // queue the destination edge state for when the cross completes
    this._nextEdge = toEdge; this._nextDir = toDir; this._nextS = lead;
    void node;
  }
  private _nextEdge = 0; private _nextDir: 1 | -1 = 1; private _nextS = 0;

  update(dt: number): void {
    if (!this.moving) return;
    const sdt = dt * this.speedScale;
    if (this.phase === 'cross') {
      this.inCross = true;
      this.cT += sdt;
      const t = Math.min(1, this.cT / this.cDur);
      this.x = this.cFromX + (this.cToX - this.cFromX) * t;
      this.z = this.cFromZ + (this.cToZ - this.cFromZ) * t;
      const hx = this.cToX - this.cFromX, hz = this.cToZ - this.cFromZ;
      if (hx * hx + hz * hz > 1e-4) this.heading = Math.atan2(hx, hz);
      if (t >= 1) {
        this.edge = this._nextEdge; this.dir = this._nextDir; this.s = this._nextS;
        this.phase = 'go';
        this._placeGo();
      }
      return;
    }

    this.s += this.speed * sdt;
    const e = this.graph.edges[this.edge];
    this.inCross = false;
    this.nodeId = this.dir === 1 ? e.b : e.a;
    this.distNode = e.len - this.s;
    if (this.s >= e.len - 1.5) {
      const node = this.dir === 1 ? e.b : e.a;
      const nxt = this.graph.nextEdge(node, this.edge, this.allow);
      if (nxt) {
        const ne = this.graph.edges[nxt.edge];
        const newDir: 1 | -1 = ne.a === node ? 1 : -1;
        this._beginCross(nxt.edge, newDir, node);
      } else {
        this.s = e.len - 1.5;
      }
      return;
    }
    this._placeGo();
  }
}
