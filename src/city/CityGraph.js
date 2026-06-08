const HALF_WIDTH = {
    primary: 6, primary_link: 3.5,
    secondary: 5, secondary_link: 3,
    tertiary: 4, tertiary_link: 2.5,
    residential: 3.5, unclassified: 3.5, living_street: 2.5, road: 3.5,
};
export class CityGraph {
    nodes = new Map();
    edges = [];
    constructor(streets, nodeMap, proj) {
        const ensure = (id, x, z) => {
            let n = this.nodes.get(id);
            if (!n) {
                n = { id, x, z, edges: [] };
                this.nodes.set(id, n);
            }
            return n;
        };
        for (const way of streets) {
            const type = way.tags.highway;
            if (!type)
                continue;
            const hw = HALF_WIDTH[type] ?? 3.5;
            const pts = [];
            for (const nid of way.nodes) {
                const nd = nodeMap.get(nid);
                if (nd) {
                    const [x, z] = proj.project(nd.lat, nd.lon);
                    pts.push({ id: nid, x, z });
                }
            }
            for (let i = 0; i < pts.length - 1; i++) {
                const A = pts[i], B = pts[i + 1];
                const dx = B.x - A.x, dz = B.z - A.z;
                const len = Math.hypot(dx, dz);
                if (len < 1)
                    continue;
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
    randomEdge() { return Math.floor(Math.random() * this.edges.length); }
    /** Choose a continuing edge at `node`, arriving via `viaEdge`. Avoids an
     *  immediate U-turn unless it's a dead end. */
    nextEdge(node, viaEdge) {
        const n = this.nodes.get(node);
        if (!n)
            return null;
        const opts = [];
        for (const ei of n.edges) {
            if (ei === viaEdge)
                continue;
            const e = this.edges[ei];
            const to = e.a === node ? e.b : e.a;
            opts.push({ edge: ei, toNode: to });
        }
        if (opts.length === 0) {
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
    graph;
    offsetFn;
    speed;
    edge;
    dir; // +1 = a→b, -1 = b→a
    s = 0; // distance travelled along current edge
    phase = 'go';
    cFromX = 0;
    cFromZ = 0;
    cToX = 0;
    cToZ = 0;
    cT = 0;
    cDur = 0;
    x = 0;
    z = 0;
    heading = 0;
    moving = true;
    constructor(graph, offsetFn, speed) {
        this.graph = graph;
        this.offsetFn = offsetFn;
        this.speed = speed;
        this.edge = graph.randomEdge();
        this.dir = Math.random() < 0.5 ? 1 : -1;
        const e = graph.edges[this.edge];
        this.s = Math.random() * e.len;
        this._placeGo();
    }
    /** Travel unit vector for the current edge+dir. */
    _travel() {
        const e = this.graph.edges[this.edge];
        return this.dir === 1 ? [e.dx, e.dz] : [-e.dx, -e.dz];
    }
    _startPos() {
        const e = this.graph.edges[this.edge];
        return this.dir === 1 ? [e.ax, e.az] : [e.bx, e.bz];
    }
    _placeGo() {
        const e = this.graph.edges[this.edge];
        const off = this.offsetFn(e.halfW);
        const [tx, tz] = this._travel();
        const [sx, sz] = this._startPos();
        const ox = tz, oz = -tx; // right-hand perpendicular
        this.x = sx + tx * this.s + ox * off;
        this.z = sz + tz * this.s + oz * off;
        this.heading = Math.atan2(tx, tz);
    }
    _beginCross(toEdge, toDir, node) {
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
        this.cFromX = this.x;
        this.cFromZ = this.z;
        this.cToX = toX;
        this.cToZ = toZ;
        const d = Math.hypot(toX - this.x, toZ - this.z);
        this.cDur = Math.max(0.2, d / this.speed);
        this.cT = 0;
        this.phase = 'cross';
        // queue the destination edge state for when the cross completes
        this._nextEdge = toEdge;
        this._nextDir = toDir;
        this._nextS = lead;
        void node;
    }
    _nextEdge = 0;
    _nextDir = 1;
    _nextS = 0;
    update(dt) {
        if (!this.moving)
            return;
        if (this.phase === 'cross') {
            this.cT += dt;
            const t = Math.min(1, this.cT / this.cDur);
            this.x = this.cFromX + (this.cToX - this.cFromX) * t;
            this.z = this.cFromZ + (this.cToZ - this.cFromZ) * t;
            const hx = this.cToX - this.cFromX, hz = this.cToZ - this.cFromZ;
            if (hx * hx + hz * hz > 1e-4)
                this.heading = Math.atan2(hx, hz);
            if (t >= 1) {
                this.edge = this._nextEdge;
                this.dir = this._nextDir;
                this.s = this._nextS;
                this.phase = 'go';
                this._placeGo();
            }
            return;
        }
        this.s += this.speed * dt;
        const e = this.graph.edges[this.edge];
        if (this.s >= e.len - 1.5) {
            const node = this.dir === 1 ? e.b : e.a;
            const nxt = this.graph.nextEdge(node, this.edge);
            if (nxt) {
                const ne = this.graph.edges[nxt.edge];
                const newDir = ne.a === node ? 1 : -1;
                this._beginCross(nxt.edge, newDir, node);
            }
            else {
                this.s = e.len - 1.5;
            }
            return;
        }
        this._placeGo();
    }
}
