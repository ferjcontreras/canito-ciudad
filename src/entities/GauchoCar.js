import * as THREE from 'three';
const MAT_CHASSIS = new THREE.MeshLambertMaterial({ color: 0x282828, flatShading: true });
const MAT_CABIN = new THREE.MeshLambertMaterial({ color: 0x1f1f1f, flatShading: true });
const MAT_WINDOW = new THREE.MeshLambertMaterial({ color: 0x101820 });
const MAT_WHEEL = new THREE.MeshLambertMaterial({ color: 0x141416 });
const MAT_HAT = new THREE.MeshLambertMaterial({ color: 0x1a1a18, flatShading: true });
const MAT_SKIN = new THREE.MeshLambertMaterial({ color: 0x6e7858, flatShading: true });
const MAT_EYE = new THREE.MeshLambertMaterial({
    color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 1.2,
});
export class GauchoCar {
    group;
    _hp = 3;
    static SPEED = 22; // m/s — más rápido que el sprint de Canito (18)
    static DETECT_R = 90;
    static TURN_RATE = 1.6; // rad/s
    static HIT_DAMAGE = 3;
    static HIT_RADIUS = 2.7;
    static HIT_INTERVAL = 0.9;
    static FIRE_HITS = 3; // fireballs needed to destroy
    static COLLIDER_R = 1.8; // body radius for scenery / house collision
    _attackCooldown = 0;
    constructor() {
        this.group = new THREE.Group();
        // El largo va a lo largo de Z (sentido de avance) para que no ande de costado.
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.85, 4.2), MAT_CHASSIS);
        chassis.position.y = 0.62;
        this.group.add(chassis);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.78, 2.4), MAT_CABIN);
        cabin.position.set(0, 1.46, -0.35);
        this.group.add(cabin);
        const wind = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.62, 2.25), MAT_WINDOW);
        wind.position.set(0, 1.48, -0.35);
        this.group.add(wind);
        // Wheels — axle along X (the car rolls forward along Z)
        const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        for (const [x, z] of [[0.92, 1.45], [-0.92, 1.45], [0.92, -1.45], [-0.92, -1.45]]) {
            const w = new THREE.Mesh(wheelGeo, MAT_WHEEL);
            w.position.set(x, 0.36, z);
            this.group.add(w);
        }
        // Driver head poking through the roof, looking forward (+Z)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), MAT_SKIN);
        head.position.set(0, 2.0, -0.3);
        this.group.add(head);
        for (const sx of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), MAT_EYE);
            eye.position.set(sx * 0.09, 2.02, -0.16);
            this.group.add(eye);
        }
        // Chambergo on the driver
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.04, 12), MAT_HAT);
        brim.position.set(0, 2.18, -0.3);
        this.group.add(brim);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.15, 8), MAT_HAT);
        crown.position.set(0, 2.27, -0.3);
        this.group.add(crown);
        this.group.traverse(m => {
            if (m.isMesh)
                m.castShadow = true;
        });
    }
    get position() { return this.group.position; }
    get hp() { return this._hp; }
    get alive() { return this._hp > 0; }
    takeDamage(d) { this._hp = Math.max(0, this._hp - d); }
    _collides(x, z, colliders) {
        const r = GauchoCar.COLLIDER_R;
        for (const c of colliders) {
            if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ)
                return true;
        }
        return false;
    }
    update(dt, target, colliders = []) {
        if (!this.alive)
            return { hitTarget: false, blocked: false };
        this._attackCooldown -= dt;
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < GauchoCar.HIT_RADIUS && this._attackCooldown <= 0) {
            this._attackCooldown = GauchoCar.HIT_INTERVAL;
            return { hitTarget: true, blocked: false };
        }
        let blocked = false;
        if (dist < GauchoCar.DETECT_R) {
            // Steer toward target with limited turn rate
            const desired = Math.atan2(dx, dz);
            let delta = desired - this.group.rotation.y;
            while (delta > Math.PI)
                delta -= 2 * Math.PI;
            while (delta < -Math.PI)
                delta += 2 * Math.PI;
            const maxTurn = GauchoCar.TURN_RATE * dt;
            this.group.rotation.y += Math.abs(delta) < maxTurn
                ? delta
                : Math.sign(delta) * maxTurn;
            // Drive forward with collide-and-slide against the scenery
            const ang = this.group.rotation.y;
            const stepX = Math.sin(ang) * GauchoCar.SPEED * dt;
            const stepZ = Math.cos(ang) * GauchoCar.SPEED * dt;
            const px = this.position.x;
            const pz = this.position.z;
            const nx = px + stepX;
            const nz = pz + stepZ;
            if (!this._collides(nx, nz, colliders)) {
                this.position.x = nx;
                this.position.z = nz;
            }
            else if (!this._collides(nx, pz, colliders)) {
                this.position.x = nx;
            }
            else if (!this._collides(px, nz, colliders)) {
                this.position.z = nz;
            }
            else {
                blocked = true;
            }
        }
        return { hitTarget: false, blocked };
    }
    remove(scene) { scene.remove(this.group); }
}
