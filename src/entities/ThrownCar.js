import * as THREE from 'three';
const MAT_BODY = new THREE.MeshLambertMaterial({ color: 0x9c2828, flatShading: true });
const MAT_CABIN = new THREE.MeshLambertMaterial({ color: 0x6c1818, flatShading: true });
const MAT_WHEEL = new THREE.MeshLambertMaterial({ color: 0x1a1a1c });
const MAT_WINDOW = new THREE.MeshLambertMaterial({ color: 0x10141c });
// Pre-baked car geometry, scaled down for projectile use
const GEO_BODY = new THREE.BoxGeometry(2.6, 0.55, 1.1);
const GEO_CABIN = new THREE.BoxGeometry(1.5, 0.48, 1.0);
const GEO_WHEEL = (() => { const g = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10); g.rotateX(Math.PI / 2); return g; })();
const GEO_WIND = new THREE.BoxGeometry(1.4, 0.38, 0.92);
export class ThrownCar {
    group;
    _vel;
    _life = 2.5;
    _alive = true;
    _hitSolid = false; // smashed into a building/scenery this flight
    _spin = new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);
    static RADIUS = 1.3;
    static DAMAGE = 6;
    static GRAVITY = 18; // m/s² — exaggerated for visible arc
    // Cars below this height that enter a building footprint smash into it, so the
    // player can take cover behind houses. Cars at apex sail over the rooftops.
    static BLOCK_HEIGHT = 9;
    constructor(origin, vel) {
        this.group = new THREE.Group();
        this.group.position.copy(origin);
        const body = new THREE.Mesh(GEO_BODY, MAT_BODY);
        body.position.y = 0.4;
        this.group.add(body);
        const cabin = new THREE.Mesh(GEO_CABIN, MAT_CABIN);
        cabin.position.set(-0.1, 0.9, 0);
        this.group.add(cabin);
        const wind = new THREE.Mesh(GEO_WIND, MAT_WINDOW);
        wind.position.set(-0.1, 0.92, 0);
        this.group.add(wind);
        for (const [x, z] of [[0.9, 0.58], [0.9, -0.58], [-0.9, 0.58], [-0.9, -0.58]]) {
            const w = new THREE.Mesh(GEO_WHEEL, MAT_WHEEL);
            w.position.set(x, 0.22, z);
            this.group.add(w);
        }
        this.group.traverse(m => { if (m.isMesh)
            m.castShadow = true; });
        this._vel = vel.clone();
    }
    get position() { return this.group.position; }
    get alive() { return this._alive; }
    get hitSolid() { return this._hitSolid; }
    update(dt, colliders = []) {
        if (!this._alive)
            return;
        this.group.position.x += this._vel.x * dt;
        this.group.position.y += this._vel.y * dt;
        this.group.position.z += this._vel.z * dt;
        this._vel.y -= ThrownCar.GRAVITY * dt;
        this.group.rotation.x += this._spin.x * dt;
        this.group.rotation.y += this._spin.y * dt;
        this.group.rotation.z += this._spin.z * dt;
        // Smash into buildings/scenery so houses provide cover
        const p = this.group.position;
        if (p.y < ThrownCar.BLOCK_HEIGHT) {
            for (const c of colliders) {
                if (p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ) {
                    this._alive = false;
                    this._hitSolid = true;
                    break;
                }
            }
        }
        this._life -= dt;
        if (this._life <= 0 || p.y < 0)
            this._alive = false;
    }
    kill() { this._alive = false; }
    remove(scene) { scene.remove(this.group); }
}
