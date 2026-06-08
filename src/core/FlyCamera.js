import * as THREE from 'three';
export class FlyCamera {
    camera;
    keys = new Set();
    pitch = -0.3; // radians, slightly downward
    yaw = 0; // radians, facing south (+Z)
    pointerLocked = false;
    BASE_SPEED = 40; // m/s
    TURBO_MULT = 5;
    MOUSE_SENS = 0.0018;
    constructor(canvas) {
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 3000);
        this.camera.position.set(0, 120, -250);
        this._applyRotation();
        this._bindKeys();
        this._bindPointerLock(canvas);
    }
    _bindKeys() {
        window.addEventListener('keydown', e => {
            this.keys.add(e.code);
            // Prevent browser scroll with arrow keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.key)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', e => this.keys.delete(e.code));
        window.addEventListener('blur', () => this.keys.clear());
    }
    _bindPointerLock(canvas) {
        canvas.addEventListener('click', () => canvas.requestPointerLock());
        document.addEventListener('pointerlockchange', () => {
            this.pointerLocked = document.pointerLockElement === canvas;
            const hint = document.getElementById('pointer-hint');
            if (hint)
                hint.classList.toggle('hidden', this.pointerLocked);
        });
        document.addEventListener('mousemove', e => {
            if (!this.pointerLocked)
                return;
            this.yaw -= e.movementX * this.MOUSE_SENS;
            this.pitch -= e.movementY * this.MOUSE_SENS;
            this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
        });
    }
    update(dt) {
        // World-space forward and right vectors derived from yaw/pitch
        const cosPitch = Math.cos(this.pitch);
        const forward = new THREE.Vector3(Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), Math.cos(this.yaw) * cosPitch);
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const up = new THREE.Vector3(0, 1, 0);
        const move = new THREE.Vector3();
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))
            move.addScaledVector(forward, 1);
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))
            move.addScaledVector(forward, -1);
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
            move.addScaledVector(right, -1);
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight'))
            move.addScaledVector(right, 1);
        if (this.keys.has('Space'))
            move.addScaledVector(up, 1);
        if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'))
            move.addScaledVector(up, -1);
        if (move.lengthSq() > 0) {
            const speed = this.keys.has('ControlLeft') || this.keys.has('ControlRight')
                ? this.BASE_SPEED * this.TURBO_MULT
                : this.BASE_SPEED;
            this.camera.position.addScaledVector(move.normalize(), speed * dt);
        }
        this._applyRotation();
    }
    _applyRotation() {
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    }
}
