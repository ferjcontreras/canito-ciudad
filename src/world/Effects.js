import * as THREE from 'three';
const GEO_BLOOD = new THREE.BoxGeometry(0.18, 0.18, 0.18);
const GEO_BLOOD_SMALL = new THREE.BoxGeometry(0.10, 0.10, 0.10);
const GEO_SMOKE = new THREE.SphereGeometry(0.55, 6, 5);
const GEO_FIRE = new THREE.SphereGeometry(0.5, 8, 6);
const GEO_DEBRIS = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const MAT_BLOOD = new THREE.MeshBasicMaterial({ color: 0x8a1010 });
export class EffectsManager {
    _scene;
    _particles = [];
    _flashes = [];
    _rings = [];
    constructor(scene) { this._scene = scene; }
    // Small spurt for "Canito got hit" — fewer, smaller particles, lower arc
    spawnHurtBlood(pos) {
        const COUNT = 7;
        for (let i = 0; i < COUNT; i++) {
            const m = new THREE.Mesh(GEO_BLOOD_SMALL, MAT_BLOOD);
            m.position.set(pos.x, pos.y + 0.9, pos.z);
            this._scene.add(m);
            const ang = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            this._particles.push({
                mesh: m,
                vel: new THREE.Vector3(Math.cos(ang) * speed, 2 + Math.random() * 2, Math.sin(ang) * speed),
                life: 0.4 + Math.random() * 0.25,
                maxLife: 0.6,
                gravity: 18,
                fade: false,
            });
        }
    }
    spawnBlood(pos) {
        const COUNT = 16;
        for (let i = 0; i < COUNT; i++) {
            const m = new THREE.Mesh(GEO_BLOOD, MAT_BLOOD);
            m.position.set(pos.x, pos.y + 1.2, pos.z);
            this._scene.add(m);
            const ang = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 5;
            this._particles.push({
                mesh: m,
                vel: new THREE.Vector3(Math.cos(ang) * speed, 3 + Math.random() * 4, Math.sin(ang) * speed),
                life: 0.7 + Math.random() * 0.4,
                maxLife: 1.0,
                gravity: 14,
                fade: false,
            });
        }
    }
    spawnExplosion(pos) {
        // Bright orange flash
        const light = new THREE.PointLight(0xff8030, 60, 30, 2);
        light.position.set(pos.x, pos.y + 1.2, pos.z);
        this._scene.add(light);
        this._flashes.push({ light, life: 0.25, max: 0.25, base: 60 });
        const FIRE_COUNT = 24;
        const SMOKE_COUNT = 14;
        const DEBRIS_COUNT = 8;
        // Fire chunks
        for (let i = 0; i < FIRE_COUNT; i++) {
            const colors = [0xff5018, 0xff7030, 0xffa040, 0xffd060];
            const mat = new THREE.MeshBasicMaterial({
                color: colors[Math.floor(Math.random() * colors.length)],
                transparent: true, opacity: 0.92, depthWrite: false,
            });
            const m = new THREE.Mesh(GEO_FIRE, mat);
            m.position.set(pos.x, pos.y + 0.8, pos.z);
            m.renderOrder = 999;
            this._scene.add(m);
            const ang = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.45;
            const speed = 4 + Math.random() * 9;
            this._particles.push({
                mesh: m,
                vel: new THREE.Vector3(Math.cos(ang) * Math.cos(phi) * speed, Math.sin(phi) * speed + 4, Math.sin(ang) * Math.cos(phi) * speed),
                life: 0.7 + Math.random() * 0.5,
                maxLife: 1.2,
                gravity: 6,
                fade: true,
            });
        }
        // Smoke
        for (let i = 0; i < SMOKE_COUNT; i++) {
            const shade = 0x303030 + Math.floor(Math.random() * 0x404040) * 0x010101;
            const mat = new THREE.MeshBasicMaterial({
                color: shade, transparent: true, opacity: 0.6, depthWrite: false,
            });
            const m = new THREE.Mesh(GEO_SMOKE, mat);
            m.position.set(pos.x, pos.y + 1.2, pos.z);
            this._scene.add(m);
            const ang = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            this._particles.push({
                mesh: m,
                vel: new THREE.Vector3(Math.cos(ang) * speed, 3 + Math.random() * 3, Math.sin(ang) * speed),
                life: 1.4 + Math.random() * 0.6,
                maxLife: 2.0,
                gravity: -1.5, // smoke rises
                fade: true,
            });
        }
        // Debris boxes (dark metal scraps)
        for (let i = 0; i < DEBRIS_COUNT; i++) {
            const mat = new THREE.MeshLambertMaterial({ color: 0x2a2a2c });
            const m = new THREE.Mesh(GEO_DEBRIS, mat);
            m.position.set(pos.x, pos.y + 0.6, pos.z);
            this._scene.add(m);
            const ang = Math.random() * Math.PI * 2;
            const speed = 5 + Math.random() * 6;
            this._particles.push({
                mesh: m,
                vel: new THREE.Vector3(Math.cos(ang) * speed, 5 + Math.random() * 5, Math.sin(ang) * speed),
                life: 1.6,
                maxLife: 1.6,
                gravity: 18,
                fade: false,
            });
        }
    }
    /** Expanding cyan ground ring + bright flash for Canito's AoE power. */
    spawnShockwave(pos, radius) {
        const geo = new THREE.RingGeometry(0.55, 1.0, 48);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x6fe0ff, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, depthWrite: false,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pos.x, 0.12, pos.z);
        ring.renderOrder = 998;
        this._scene.add(ring);
        this._rings.push({ mesh: ring, mat, life: 0.5, max: 0.5, radius });
        const light = new THREE.PointLight(0x60d0ff, 90, radius * 4, 2);
        light.position.set(pos.x, 1.6, pos.z);
        this._scene.add(light);
        this._flashes.push({ light, life: 0.35, max: 0.35, base: 90 });
    }
    update(dt) {
        for (let i = this._rings.length - 1; i >= 0; i--) {
            const r = this._rings[i];
            r.life -= dt;
            if (r.life <= 0) {
                this._scene.remove(r.mesh);
                r.mesh.geometry.dispose();
                this._rings.splice(i, 1);
                continue;
            }
            const t = r.life / r.max; // 1 → 0
            r.mesh.scale.setScalar((1 - t) * r.radius + 0.5);
            r.mat.opacity = t * 0.9;
        }
        for (let i = this._particles.length - 1; i >= 0; i--) {
            const p = this._particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this._scene.remove(p.mesh);
                this._particles.splice(i, 1);
                continue;
            }
            p.mesh.position.x += p.vel.x * dt;
            p.mesh.position.y += p.vel.y * dt;
            p.mesh.position.z += p.vel.z * dt;
            p.vel.y -= p.gravity * dt;
            // Bounce off ground
            if (p.mesh.position.y < 0.05) {
                p.mesh.position.y = 0.05;
                p.vel.y = Math.abs(p.vel.y) * 0.3;
                p.vel.x *= 0.5;
                p.vel.z *= 0.5;
            }
            p.mesh.rotation.x += dt * 4;
            p.mesh.rotation.y += dt * 5;
            const t = p.life / p.maxLife;
            if (p.fade) {
                const mat = p.mesh.material;
                mat.opacity = Math.max(0, t * (mat.opacity > 0.7 ? 0.92 : 0.6));
                p.mesh.scale.setScalar(Math.max(0.1, t * 1.3));
            }
        }
        for (let i = this._flashes.length - 1; i >= 0; i--) {
            const f = this._flashes[i];
            f.life -= dt;
            if (f.life <= 0) {
                this._scene.remove(f.light);
                this._flashes.splice(i, 1);
            }
            else {
                f.light.intensity = f.base * (f.life / f.max);
            }
        }
    }
}
