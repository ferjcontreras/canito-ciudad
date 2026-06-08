import * as THREE from 'three';
const MAT_BONE = new THREE.MeshLambertMaterial({
    color: 0xf8f0d8,
    emissive: 0xfff0a0,
    emissiveIntensity: 0.45,
    flatShading: true,
});
export class Bone {
    group;
    _alive = true;
    _phase = Math.random() * Math.PI * 2;
    static PICKUP_R = 1.6;
    static HEAL = 3;
    constructor() {
        this.group = new THREE.Group();
        // Shaft along local X
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.75, 8), MAT_BONE);
        shaft.rotation.z = Math.PI / 2;
        this.group.add(shaft);
        // Knobby ends — two balls per side, slightly offset to form the classic bone silhouette
        for (const x of [-0.42, 0.42]) {
            for (const z of [-0.13, 0.13]) {
                const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), MAT_BONE);
                ball.position.set(x, 0, z);
                this.group.add(ball);
            }
        }
        this.group.position.y = 0.5;
        this.group.traverse(m => {
            if (m.isMesh)
                m.castShadow = true;
        });
    }
    get position() { return this.group.position; }
    get alive() { return this._alive; }
    update(dt) {
        if (!this._alive)
            return;
        this._phase += dt * 2.3;
        this.group.position.y = 0.5 + Math.sin(this._phase) * 0.15; // floaty bob
        this.group.rotation.y += dt * 0.8; // slow spin
    }
    pickup() { this._alive = false; }
    remove(scene) { scene.remove(this.group); }
}
