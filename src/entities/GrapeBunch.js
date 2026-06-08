import * as THREE from 'three';
// Shared geometry + materials for the grape cluster projectile thrown by the
// Reinas de la Vendimia.
const GEO_GRAPE = new THREE.SphereGeometry(0.12, 8, 6);
const MAT_GRAPE = new THREE.MeshLambertMaterial({ color: 0x6a2a8a, flatShading: true });
const MAT_GRAPE2 = new THREE.MeshLambertMaterial({ color: 0x84489f, flatShading: true });
const GEO_STEM = new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6);
const MAT_STEM = new THREE.MeshLambertMaterial({ color: 0x5a3a1a, flatShading: true });
const GEO_LEAF = new THREE.SphereGeometry(0.14, 6, 4);
const MAT_LEAF = new THREE.MeshLambertMaterial({ color: 0x3f6a2a, flatShading: true });
export class GrapeBunch {
    group;
    _vel;
    _life = 3;
    _alive = true;
    _spin = (Math.random() - 0.5) * 3;
    static RADIUS = 0.6;
    static DAMAGE = 2;
    static GRAVITY = 14; // m/s² — softer arc than a thrown car
    // Below this height a bunch entering a building footprint splats on the wall,
    // so cover protects the player from grapes too.
    static BLOCK_HEIGHT = 8;
    constructor(origin, vel) {
        this.group = new THREE.Group();
        this.group.position.copy(origin);
        // Stem + a leaf at the top of the bunch
        const stem = new THREE.Mesh(GEO_STEM, MAT_STEM);
        stem.position.y = 0.18;
        this.group.add(stem);
        const leaf = new THREE.Mesh(GEO_LEAF, MAT_LEAF);
        leaf.position.set(0.10, 0.26, 0);
        leaf.scale.set(1.2, 0.4, 0.9);
        this.group.add(leaf);
        // Inverted-cone cluster of berries (wide at top, single grape at the tip)
        const rows = [
            { y: 0.05, r: 0.20, n: 6 },
            { y: -0.13, r: 0.15, n: 5 },
            { y: -0.29, r: 0.10, n: 3 },
            { y: -0.42, r: 0.00, n: 1 },
        ];
        for (const row of rows) {
            for (let i = 0; i < row.n; i++) {
                const a = (i / row.n) * Math.PI * 2 + Math.random() * 0.5;
                const m = new THREE.Mesh(GEO_GRAPE, Math.random() < 0.5 ? MAT_GRAPE : MAT_GRAPE2);
                m.position.set(Math.cos(a) * row.r + (Math.random() - 0.5) * 0.05, row.y + (Math.random() - 0.5) * 0.04, Math.sin(a) * row.r + (Math.random() - 0.5) * 0.05);
                m.castShadow = true;
                this.group.add(m);
            }
        }
        this._vel = vel.clone();
    }
    get position() { return this.group.position; }
    get alive() { return this._alive; }
    update(dt, colliders = []) {
        if (!this._alive)
            return;
        const p = this.group.position;
        p.x += this._vel.x * dt;
        p.y += this._vel.y * dt;
        p.z += this._vel.z * dt;
        this._vel.y -= GrapeBunch.GRAVITY * dt;
        this.group.rotation.y += this._spin * dt;
        // Splat against buildings/scenery so the player can take cover
        if (p.y < GrapeBunch.BLOCK_HEIGHT) {
            for (const c of colliders) {
                if (p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ) {
                    this._alive = false;
                    break;
                }
            }
        }
        this._life -= dt;
        if (this._life <= 0 || p.y < 0.1)
            this._alive = false;
    }
    kill() { this._alive = false; }
    remove(scene) { scene.remove(this.group); }
}
