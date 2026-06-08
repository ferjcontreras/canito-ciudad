import * as THREE from 'three';
const MAT_OUTER = new THREE.MeshBasicMaterial({
    color: 0xff5018, transparent: true, opacity: 0.85, depthWrite: false,
});
const MAT_INNER = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
const GEO_OUTER = new THREE.SphereGeometry(0.75, 12, 10);
const GEO_INNER = new THREE.SphereGeometry(0.42, 8, 6);
export class Fireball {
    group;
    _vel;
    _life;
    _alive = true;
    _hitSolid = false; // overlapped a building/wall this frame
    _light;
    _inner;
    static SPEED = 18; // m/s — slow enough to see in flight
    static RADIUS = 0.75;
    static LIFE = 2.4; // seconds before fizzle
    constructor(origin, dir) {
        this.group = new THREE.Group();
        this.group.position.copy(origin);
        const outer = new THREE.Mesh(GEO_OUTER, MAT_OUTER);
        outer.renderOrder = 999;
        this.group.add(outer);
        this._inner = new THREE.Mesh(GEO_INNER, MAT_INNER);
        this.group.add(this._inner);
        this._light = new THREE.PointLight(0xff7020, 3, 14, 2);
        this.group.add(this._light);
        this._vel = dir.clone().multiplyScalar(Fireball.SPEED);
        this._life = Fireball.LIFE;
    }
    get position() { return this.group.position; }
    get alive() { return this._alive; }
    get hitSolid() { return this._hitSolid; }
    update(dt, colliders = []) {
        if (!this._alive)
            return;
        this.group.position.x += this._vel.x * dt;
        this.group.position.z += this._vel.z * dt;
        // Flicker the inner core
        const f = 0.85 + Math.random() * 0.3;
        this._inner.scale.setScalar(f);
        this._light.intensity = 2.5 + Math.random() * 1.0;
        // Flag overlap with buildings/scenery — fireballs don't pass through walls.
        // We only flag here; main decides (a hit on a car/zombie takes priority over
        // a plain fizzle, since parked cars are also in the collider list).
        const p = this.group.position;
        const r = 0.4;
        for (const c of colliders) {
            if (p.x + r > c.minX && p.x - r < c.maxX && p.z + r > c.minZ && p.z - r < c.maxZ) {
                this._hitSolid = true;
                break;
            }
        }
        this._life -= dt;
        if (this._life <= 0)
            this._alive = false;
    }
    kill() { this._alive = false; }
    remove(scene) { scene.remove(this.group); }
}
