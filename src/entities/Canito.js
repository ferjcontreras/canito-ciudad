import * as THREE from 'three';
export class Canito {
    group;
    _yRot = 0;
    _phase = 0;
    _legFL;
    _legFR;
    _legBL;
    _legBR;
    _tail;
    // Hurt flash bookkeeping
    _hurtTimer = 0;
    _hurtMats = [];
    _hurtMatOrigColors = [];
    static HURT_DURATION = 0.55;
    // Knockback velocity when hit
    _knockX = 0;
    _knockZ = 0;
    _knockTimer = 0;
    static KNOCKBACK_SPEED = 8;
    SPEED = 6;
    SPRINT_SPEED = 18;
    TURN = 2.6;
    constructor(scene) {
        this.group = new THREE.Group();
        this._build();
        scene.add(this.group);
    }
    _mat(color) { return new THREE.MeshLambertMaterial({ color }); }
    _add(geo, mat, x, y, z, parent) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        (parent ?? this.group).add(m);
        return m;
    }
    _build() {
        const white = this._mat(0xf2ede6);
        const cream = this._mat(0xe8e0d4);
        // Track the body-fur materials so hurt() can pulse them red/white
        this._hurtMats = [white, cream];
        this._hurtMatOrigColors = [0xf2ede6, 0xe8e0d4];
        const pink = this._mat(0xf4b0bb);
        const dark = this._mat(0x1e1e1e);
        const shine = this._mat(0xffffff);
        const red = this._mat(0xc0392b);
        const gold = this._mat(0xf1c40f);
        const blush = this._mat(0xffaaaa);
        this._add(new THREE.SphereGeometry(0.3, 14, 10), white, 0, 0.42, 0);
        this._add(new THREE.SphereGeometry(0.23, 14, 10), white, 0, 0.78, 0.08);
        // Copete
        this._add(new THREE.SphereGeometry(0.13, 10, 8), cream, 0, 1.02, 0.04);
        this._add(new THREE.SphereGeometry(0.09, 10, 8), white, -0.06, 1.12, 0.02);
        this._add(new THREE.SphereGeometry(0.09, 10, 8), white, 0.06, 1.12, 0.02);
        // Orejas
        for (const sx of [-1, 1]) {
            this._add(new THREE.SphereGeometry(0.14, 10, 8), cream, sx * 0.2, 0.81, -0.02);
            const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 10), pink);
            inner.rotation.z = sx * 0.45;
            inner.position.set(sx * 0.245, 0.80, 0.04);
            this.group.add(inner);
        }
        // Ojos
        for (const sx of [-1, 1]) {
            this._add(new THREE.SphereGeometry(0.045, 8, 8), dark, sx * 0.09, 0.800, 0.205);
            this._add(new THREE.SphereGeometry(0.016, 6, 6), shine, sx * 0.09 + sx * 0.013, 0.815, 0.218);
        }
        this._add(new THREE.SphereGeometry(0.037, 8, 8), dark, 0, 0.745, 0.225);
        for (const sx of [-1, 1])
            this._add(new THREE.SphereGeometry(0.018, 6, 6), dark, sx * 0.043, 0.705, 0.222);
        for (const sx of [-1, 1])
            this._add(new THREE.SphereGeometry(0.04, 8, 8), blush, sx * 0.16, 0.77, 0.2);
        this._add(new THREE.CylinderGeometry(0.135, 0.135, 0.07, 16), red, 0, 0.605, 0.06);
        this._add(new THREE.CylinderGeometry(0.04, 0.04, 0.022, 10), gold, 0, 0.535, 0.16);
        // Patas
        const legGeo = new THREE.CylinderGeometry(0.06, 0.068, 0.34, 8);
        const makeLeg = (lx, lz) => {
            const pivot = new THREE.Group();
            pivot.position.set(lx, 0.34, lz);
            const leg = new THREE.Mesh(legGeo, white);
            leg.castShadow = true;
            leg.position.y = -0.17;
            pivot.add(leg);
            this.group.add(pivot);
            return pivot;
        };
        this._legFL = makeLeg(-0.13, 0.15);
        this._legFR = makeLeg(0.13, 0.15);
        this._legBL = makeLeg(-0.13, -0.15);
        this._legBR = makeLeg(0.13, -0.15);
        const pawGeo = new THREE.SphereGeometry(0.08, 8, 8);
        for (const [px, pz] of [[-0.13, 0.15], [0.13, 0.15], [-0.13, -0.15], [0.13, -0.15]])
            this._add(pawGeo, white, px, 0.04, pz);
        this._tail = this._add(new THREE.SphereGeometry(0.1, 10, 8), cream, 0, 0.58, -0.35);
    }
    /** Trigger the red/white hurt-flash + knockback away from the attacker.
     *  attackerX/Z are world coords of whatever damaged Canito (optional). */
    hurt(attackerX, attackerZ) {
        this._hurtTimer = Canito.HURT_DURATION;
        if (attackerX !== undefined && attackerZ !== undefined) {
            const dx = this.group.position.x - attackerX;
            const dz = this.group.position.z - attackerZ;
            const d = Math.hypot(dx, dz);
            if (d > 0.01) {
                this._knockX = (dx / d) * Canito.KNOCKBACK_SPEED;
                this._knockZ = (dz / d) * Canito.KNOCKBACK_SPEED;
                this._knockTimer = 0.22;
            }
        }
    }
    _updateHurtFlash(dt) {
        if (this._hurtTimer <= 0)
            return;
        this._hurtTimer -= dt;
        if (this._hurtTimer <= 0) {
            // Restore original fur colours
            for (let i = 0; i < this._hurtMats.length; i++) {
                this._hurtMats[i].color.setHex(this._hurtMatOrigColors[i]);
            }
            return;
        }
        // Strobe ~10× per second between bright red and white
        const tick = Math.floor((Canito.HURT_DURATION - this._hurtTimer) * 14);
        const isRed = (tick & 1) === 0;
        const targetHex = isRed ? 0xff2424 : 0xffffff;
        for (const m of this._hurtMats)
            m.color.setHex(targetHex);
    }
    update(dt, keys, colliders) {
        this._updateHurtFlash(dt);
        // ── Knockback: apply velocity from the last hit, decaying over time ────
        if (this._knockTimer > 0) {
            this._knockTimer -= dt;
            const p = this.group.position;
            const sx = this._knockX * dt;
            const sz = this._knockZ * dt;
            if (!this._hits(p.x + sx, p.z, colliders))
                p.x += sx;
            if (!this._hits(p.x, p.z + sz, colliders))
                p.z += sz;
            // Exponential decay (≈ 10% remaining per second)
            const decay = Math.pow(0.1, dt);
            this._knockX *= decay;
            this._knockZ *= decay;
        }
        if (keys.has('ArrowLeft') || keys.has('KeyA'))
            this._yRot += this.TURN * dt;
        if (keys.has('ArrowRight') || keys.has('KeyD'))
            this._yRot -= this.TURN * dt;
        this.group.rotation.y = this._yRot;
        const fwd = keys.has('ArrowUp') || keys.has('KeyW');
        const bwd = keys.has('ArrowDown') || keys.has('KeyS');
        const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
        if (fwd || bwd) {
            const dir = fwd ? 1 : -0.6;
            const speed = (sprint ? this.SPRINT_SPEED : this.SPEED) * dt * dir;
            const dx = Math.sin(this._yRot) * speed;
            const dz = Math.cos(this._yRot) * speed;
            const p = this.group.position;
            if (!this._hits(p.x + dx, p.z, colliders))
                p.x += dx;
            if (!this._hits(p.x, p.z + dz, colliders))
                p.z += dz;
            p.x = Math.max(-950, Math.min(720, p.x));
            p.z = Math.max(-650, Math.min(550, p.z));
        }
        const walking = fwd || bwd;
        if (walking) {
            this._phase += dt * (sprint ? 14 : 7);
            this.group.position.y = Math.max(0, Math.sin(this._phase) * 0.05);
            const sw = Math.sin(this._phase) * 0.42;
            this._legFL.rotation.x = sw;
            this._legBR.rotation.x = sw;
            this._legFR.rotation.x = -sw;
            this._legBL.rotation.x = -sw;
            this._tail.rotation.z = Math.sin(this._phase * 2) * 0.38;
        }
        else {
            this._phase += dt * 1.8;
            this.group.position.y = Math.sin(this._phase) * 0.013;
            for (const leg of [this._legFL, this._legFR, this._legBL, this._legBR])
                leg.rotation.x *= 0.88;
            this._tail.rotation.z = Math.sin(this._phase * 3) * 0.18;
        }
    }
    _hits(x, z, colliders) {
        const r = 0.4;
        for (const c of colliders)
            if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ)
                return true;
        return false;
    }
    getPosition() { return this.group.position; }
    getYRot() { return this._yRot; }
    setYRot(v) {
        this._yRot = v;
        this.group.rotation.y = v;
    }
}
