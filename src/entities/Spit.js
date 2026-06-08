import * as THREE from 'three';
// Glob of spit lobbed by the Caballitos de Marly bosses.
const GEO_BLOB = new THREE.SphereGeometry(0.22, 8, 6);
const MAT_BLOB = new THREE.MeshLambertMaterial({ color: 0xcfe6b8, transparent: true, opacity: 0.85 });
const MAT_BLOB2 = new THREE.MeshLambertMaterial({ color: 0xb6d49a, transparent: true, opacity: 0.85 });
export class Spit {
    group;
    _vel;
    _life = 3;
    _alive = true;
    _spin = (Math.random() - 0.5) * 4;
    static RADIUS = 0.55;
    static DAMAGE = 4;
    static GRAVITY = 12;
    static BLOCK_HEIGHT = 8; // splats on buildings → cover works
    constructor(origin, vel) {
        this.group = new THREE.Group();
        this.group.position.copy(origin);
        // A few fused blobs for a gooey look
        for (const [ox, oy, oz, big] of [
            [0, 0, 0, 1], [0.18, 0.05, 0.04, 0], [-0.14, -0.04, 0.1, 0], [0.05, 0.12, -0.12, 0],
        ]) {
            const m = new THREE.Mesh(GEO_BLOB, big ? MAT_BLOB : MAT_BLOB2);
            m.position.set(ox, oy, oz);
            m.scale.setScalar(big ? 1 : 0.7);
            m.castShadow = true;
            this.group.add(m);
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
        this._vel.y -= Spit.GRAVITY * dt;
        this.group.rotation.x += this._spin * dt;
        if (p.y < Spit.BLOCK_HEIGHT) {
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
