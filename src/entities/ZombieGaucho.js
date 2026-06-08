import * as THREE from 'three';
// ── Shared materials (one set across all zombies) ─────────────────────────
const MAT_SKIN = new THREE.MeshLambertMaterial({ color: 0x6e7858, flatShading: true });
const MAT_TUNIC = new THREE.MeshLambertMaterial({ color: 0xc4b08a, flatShading: true });
const MAT_PANTS = new THREE.MeshLambertMaterial({ color: 0x3a2a18, flatShading: true });
const MAT_BOOTS = new THREE.MeshLambertMaterial({ color: 0x2a1a10, flatShading: true });
const MAT_HAT = new THREE.MeshLambertMaterial({ color: 0x1a1a18, flatShading: true });
const MAT_PONCHO = new THREE.MeshLambertMaterial({ color: 0x8a3828, flatShading: true });
const MAT_EYE = new THREE.MeshLambertMaterial({
    color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 1.2,
});
// Runners get hot orange eyes — easier to spot the threat
const MAT_EYE_RUN = new THREE.MeshLambertMaterial({
    color: 0xffa030, emissive: 0xff7020, emissiveIntensity: 1.6,
});
// Runners wear a faded brown poncho instead of the red one
const MAT_PONCHO_RUN = new THREE.MeshLambertMaterial({ color: 0x4a3622, flatShading: true });
// Throwers: heavy gauchos that hurl cars. Distinct purple-eye + dark tunic.
const MAT_EYE_THROW = new THREE.MeshLambertMaterial({
    color: 0xff40ff, emissive: 0xc830ff, emissiveIntensity: 1.6,
});
const MAT_TUNIC_THROW = new THREE.MeshLambertMaterial({ color: 0x4a3848, flatShading: true });
const MAT_PONCHO_THROW = new THREE.MeshLambertMaterial({ color: 0x301838, flatShading: true });
// Boss: ultra bright magenta eyes, blood red poncho
const MAT_EYE_BOSS = new THREE.MeshLambertMaterial({
    color: 0xff10a0, emissive: 0xff20c0, emissiveIntensity: 2.2,
});
const MAT_TUNIC_BOSS = new THREE.MeshLambertMaterial({ color: 0x1c0c1c, flatShading: true });
const MAT_PONCHO_BOSS = new THREE.MeshLambertMaterial({ color: 0x4a0418, flatShading: true });
// Reina de la Vendimia: zombie pageant queen — wine gown, golden crown + sash.
// Tankier (needs 3 fireballs) and runs at full pace.
const MAT_QUEEN_SKIN = new THREE.MeshLambertMaterial({ color: 0x9ab07e, flatShading: true }); // sickly pale green
const MAT_QUEEN_GOWN = new THREE.MeshLambertMaterial({ color: 0x7a1f4a, flatShading: true }); // grape/wine
const MAT_QUEEN_BODICE = new THREE.MeshLambertMaterial({ color: 0x9c2a5a, flatShading: true });
const MAT_QUEEN_SASH = new THREE.MeshLambertMaterial({ color: 0xf3d24a, flatShading: true }); // golden banda
const MAT_QUEEN_GOLD = new THREE.MeshLambertMaterial({
    color: 0xf5c518, emissive: 0x6a4e00, emissiveIntensity: 0.4, flatShading: true,
});
const MAT_QUEEN_HAIR = new THREE.MeshLambertMaterial({ color: 0x2a1a12, flatShading: true });
const MAT_EYE_QUEEN = new THREE.MeshLambertMaterial({
    color: 0xff50d0, emissive: 0xff20b0, emissiveIntensity: 1.8,
});
// Caballitos de Marly: white Carrara-marble rearing-horse + tamer statue bosses.
const MAT_MARBLE = new THREE.MeshLambertMaterial({ color: 0xe9e7e0, flatShading: true });
const MAT_MARBLE2 = new THREE.MeshLambertMaterial({ color: 0xdad7cd, flatShading: true }); // shaded marble
const MAT_PLINTH = new THREE.MeshLambertMaterial({ color: 0xcdc9bd, flatShading: true });
const MAT_EYE_CAB = new THREE.MeshLambertMaterial({ color: 0xff3030, emissive: 0xff1010, emissiveIntensity: 1.2 });
export class ZombieGaucho {
    group;
    isRunner;
    isThrower;
    isBoss;
    isQueen;
    isCaballito;
    _hp;
    _fastGait = false; // runner-style leg/bob animation
    _phase = Math.random() * Math.PI * 2;
    _attackCooldown = 0;
    _biteTimer = 0;
    _throwCooldown = 2 + Math.random() * 3; // initial stagger
    static BITE_DURATION = 0.32;
    static DANCE_DURATION = 2.8;
    static STUMBLE_DURATION = 0.9;
    _legL;
    _legR;
    _torso;
    _armL;
    _armR;
    _speed;
    // Walkers break into a dance every so often; runners trip every so often.
    _danceTimer = 0;
    _danceCooldown = 1 + Math.random() * 2;
    _stumbleTimer = 0;
    _stumbleCooldown = 1.5 + Math.random() * 2.5;
    static WALK_SPEED = 3.2;
    static RUN_SPEED = 18; // same as Canito sprint — they match pace, can't be outrun
    static THROWER_SPEED = 2.2; // throwers are heavy and slow
    static DETECT_R = 150;
    static ATTACK_R = 1.7;
    static DAMAGE_INTERVAL = 1.4;
    static HIT_RADIUS = 1.4;
    static COLLIDER_R = 0.45;
    // Thrower-specific
    static THROW_RANGE_MIN = 15;
    static THROW_RANGE_MAX = 65;
    static THROW_INTERVAL = 2.5;
    static THROWER_HP = 3;
    static BOSS_HP = 24; // fireball sponge — needs a long fight
    static CABALLITO_HP = 24; // Caballitos de Marly bosses
    static QUEEN_HP = 3; // needs 3 fireballs to go down
    static CABALLITO_SPEED = 5.0; // aggressive statues — charge faster
    // Caballito spit (ranged attack)
    static SPIT_RANGE_MIN = 6;
    static SPIT_RANGE_MAX = 65;
    static SPIT_INTERVAL = 1.3;
    // Queen-specific: lob grape bunches from a standoff distance instead of biting
    static GRAPE_RANGE_MIN = 4;
    static GRAPE_RANGE_MAX = 40;
    static GRAPE_INTERVAL = 1.8;
    static GRAPE_STANDOFF = 9; // stop advancing once this close
    static BOSS_THROW_INTERVAL = 1.5;
    constructor(opts = {}) {
        this.isBoss = !!opts.boss;
        this.isCaballito = !this.isBoss && !!opts.caballito;
        this.isQueen = !this.isBoss && !this.isCaballito && !!opts.queen;
        this.isThrower = this.isBoss || (!this.isQueen && !this.isCaballito && !!opts.thrower);
        this.isRunner = !this.isThrower && !this.isQueen && !this.isCaballito && !!opts.runner;
        this._hp = this.isBoss ? ZombieGaucho.BOSS_HP
            : this.isCaballito ? ZombieGaucho.CABALLITO_HP
                : this.isQueen ? ZombieGaucho.QUEEN_HP
                    : this.isThrower ? ZombieGaucho.THROWER_HP
                        : 1;
        this._speed = this.isBoss
            ? 0 // immovable boss
            : this.isCaballito
                ? ZombieGaucho.CABALLITO_SPEED
                : this.isThrower
                    ? ZombieGaucho.THROWER_SPEED
                    : (this.isRunner || this.isQueen)
                        ? ZombieGaucho.RUN_SPEED
                        : ZombieGaucho.WALK_SPEED;
        this._fastGait = this.isRunner || this.isQueen;
        this.group = new THREE.Group();
        if (this.isBoss)
            this.group.scale.setScalar(2.6);
        else if (this.isCaballito)
            this.group.scale.setScalar(1.8);
        else if (this.isThrower)
            this.group.scale.setScalar(1.45);
        // Caballitos and queens have wholly different silhouettes — build them
        // separately and skip the gaucho clothing below.
        if (this.isCaballito) {
            this._buildCaballito();
            this.group.traverse(m => {
                if (m.isMesh)
                    m.castShadow = true;
            });
            return;
        }
        if (this.isQueen) {
            this._buildQueen();
            this.group.traverse(m => {
                if (m.isMesh)
                    m.castShadow = true;
            });
            return;
        }
        const tunicMat = this.isBoss ? MAT_TUNIC_BOSS
            : this.isThrower ? MAT_TUNIC_THROW
                : MAT_TUNIC;
        this._torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.40), tunicMat);
        this._torso.position.y = 1.10;
        if (this.isRunner)
            this._torso.rotation.x = 0.18;
        this.group.add(this._torso);
        const ponchoMat = this.isBoss ? MAT_PONCHO_BOSS
            : this.isThrower ? MAT_PONCHO_THROW
                : this.isRunner ? MAT_PONCHO_RUN
                    : MAT_PONCHO;
        const poncho = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.55, 8), ponchoMat);
        poncho.position.y = 1.45;
        if (this.isRunner)
            poncho.rotation.x = 0.18;
        this.group.add(poncho);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), MAT_SKIN);
        head.position.set(this.isRunner ? 0.05 : 0, this.isRunner ? 1.72 : 1.75, this.isRunner ? 0.05 : 0);
        this.group.add(head);
        // Eyes: boss magenta, throwers purple, runners orange, walkers red
        const eyeMat = this.isBoss ? MAT_EYE_BOSS
            : this.isThrower ? MAT_EYE_THROW
                : this.isRunner ? MAT_EYE_RUN
                    : MAT_EYE;
        const eyeY = this.isRunner ? 1.75 : 1.78;
        const eyeZ = this.isRunner ? 0.23 : 0.20;
        const eyeXOff = this.isRunner ? 0.05 : 0;
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), eyeMat);
        eyeL.position.set(-0.08 + eyeXOff, eyeY, eyeZ);
        this.group.add(eyeL);
        const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), eyeMat);
        eyeR.position.set(0.08 + eyeXOff, eyeY, eyeZ);
        this.group.add(eyeR);
        // Chambergo (gaucho hat): wide brim + low crown
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 12), MAT_HAT);
        brim.position.y = 1.93;
        this.group.add(brim);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.17, 8), MAT_HAT);
        crown.position.y = 2.02;
        this.group.add(crown);
        // Arms outstretched (zombie pose)
        const armGeo = new THREE.BoxGeometry(0.12, 0.55, 0.12);
        const armL = new THREE.Mesh(armGeo, MAT_TUNIC);
        armL.position.set(-0.36, 1.25, 0.20);
        armL.rotation.x = -0.55;
        this.group.add(armL);
        const armR = new THREE.Mesh(armGeo, MAT_TUNIC);
        armR.position.set(0.36, 1.25, 0.20);
        armR.rotation.x = -0.55;
        this.group.add(armR);
        this._armL = armL;
        this._armR = armR;
        // Legs (bombachas)
        const legGeo = new THREE.BoxGeometry(0.20, 0.65, 0.20);
        this._legL = new THREE.Mesh(legGeo, MAT_PANTS);
        this._legL.position.set(-0.14, 0.35, 0);
        this.group.add(this._legL);
        this._legR = new THREE.Mesh(legGeo, MAT_PANTS);
        this._legR.position.set(0.14, 0.35, 0);
        this.group.add(this._legR);
        // Boots
        const bootGeo = new THREE.BoxGeometry(0.24, 0.12, 0.30);
        const bootL = new THREE.Mesh(bootGeo, MAT_BOOTS);
        bootL.position.set(-0.14, 0.06, 0.05);
        this.group.add(bootL);
        const bootR = new THREE.Mesh(bootGeo, MAT_BOOTS);
        bootR.position.set(0.14, 0.06, 0.05);
        this.group.add(bootR);
        this.group.traverse(m => {
            if (m.isMesh)
                m.castShadow = true;
        });
    }
    /** Caballito de Marly: white-marble rearing horse + tamer on a plinth.
     *  Sets _torso (head pivot) / _legL / _legR (raised front legs) for animation. */
    _buildCaballito() {
        const m = (geo, mat, x, y, z, parent = this.group) => {
            const me = new THREE.Mesh(geo, mat);
            me.position.set(x, y, z);
            parent.add(me);
            return me;
        };
        // Plinth
        m(new THREE.BoxGeometry(2.4, 0.18, 3.1), MAT_PLINTH, 0, 0.09, -0.2);
        m(new THREE.BoxGeometry(2.1, 0.5, 2.8), MAT_PLINTH, 0, 0.34, -0.2);
        // Hind legs (rearing — weight on the back legs) + hooves
        for (const sx of [-1, 1]) {
            const leg = m(new THREE.CylinderGeometry(0.13, 0.1, 1.3, 8), MAT_MARBLE, sx * 0.28, 1.25, -0.7);
            leg.rotation.x = 0.12;
            m(new THREE.BoxGeometry(0.22, 0.16, 0.28), MAT_MARBLE2, sx * 0.28, 0.62, -0.6);
        }
        // Haunch, body (tilted up), chest, neck
        m(new THREE.SphereGeometry(0.55, 10, 8), MAT_MARBLE, 0, 1.8, -0.7);
        const body = m(new THREE.BoxGeometry(0.9, 0.85, 1.7), MAT_MARBLE, 0, 2.25, 0.0);
        body.rotation.x = -0.6;
        m(new THREE.SphereGeometry(0.42, 10, 8), MAT_MARBLE, 0, 2.85, 0.55);
        const neck = m(new THREE.CylinderGeometry(0.22, 0.32, 1.05, 8), MAT_MARBLE, 0, 3.15, 0.72);
        neck.rotation.x = -0.5;
        for (let i = 0; i < 5; i++) // mane
            m(new THREE.BoxGeometry(0.12, 0.2, 0.14), MAT_MARBLE2, 0, 2.85 + i * 0.18, 0.5 - i * 0.05);
        const tail = m(new THREE.CylinderGeometry(0.17, 0.05, 1.1, 7), MAT_MARBLE, 0, 1.35, -1.1);
        tail.rotation.x = 0.55;
        // Head pivot (animated as _torso): head + muzzle + ears + glowing eyes
        const head = new THREE.Group();
        head.position.set(0, 3.5, 0.95);
        this.group.add(head);
        this._torso = head;
        m(new THREE.BoxGeometry(0.32, 0.36, 0.62), MAT_MARBLE, 0, 0.0, 0.24, head);
        m(new THREE.BoxGeometry(0.24, 0.24, 0.3), MAT_MARBLE, 0, -0.1, 0.52, head); // muzzle
        for (const sx of [-1, 1]) {
            m(new THREE.ConeGeometry(0.06, 0.18, 5), MAT_MARBLE, sx * 0.1, 0.25, -0.02, head);
            m(new THREE.SphereGeometry(0.05, 6, 5), MAT_EYE_CAB, sx * 0.11, 0.06, 0.34, head);
        }
        // Front legs raised (pawing) — pivots animated as _legL/_legR
        for (const sx of [-1, 1]) {
            const pivot = new THREE.Group();
            pivot.position.set(sx * 0.28, 2.6, 0.6);
            this.group.add(pivot);
            m(new THREE.CylinderGeometry(0.1, 0.08, 0.95, 8), MAT_MARBLE, 0, -0.45, 0.08, pivot);
            m(new THREE.BoxGeometry(0.16, 0.14, 0.22), MAT_MARBLE2, 0, -0.9, 0.14, pivot);
            pivot.rotation.x = -0.7;
            if (sx < 0)
                this._legL = pivot;
            else
                this._legR = pivot;
        }
        // Tamer (domador) standing beside, reaching for the reins + quiver of arrows
        const tx = 1.2;
        for (const sx of [-1, 1])
            m(new THREE.CylinderGeometry(0.09, 0.08, 0.9, 7), MAT_MARBLE, tx + sx * 0.12, 0.95, 0.25);
        m(new THREE.BoxGeometry(0.44, 0.72, 0.26), MAT_MARBLE, tx, 1.7, 0.25);
        m(new THREE.SphereGeometry(0.18, 8, 6), MAT_MARBLE, tx, 2.2, 0.25);
        const armUp = m(new THREE.CylinderGeometry(0.07, 0.07, 0.95, 6), MAT_MARBLE, tx - 0.4, 2.05, 0.45);
        armUp.rotation.z = 1.0;
        armUp.rotation.x = -0.3;
        const armDn = m(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6), MAT_MARBLE, tx + 0.3, 1.55, 0.25);
        armDn.rotation.z = -0.4;
        m(new THREE.BoxGeometry(0.14, 0.5, 0.12), MAT_MARBLE2, tx + 0.05, 1.8, 0.05); // quiver
        for (const ax of [-0.04, 0.04, 0])
            m(new THREE.ConeGeometry(0.03, 0.22, 4), MAT_MARBLE2, tx + 0.05 + ax, 2.15, 0.05); // arrows
    }
    /** Reina de la Vendimia zombi: wine gown, golden crown + sash, zombie pose.
     *  Sets _torso / _legL / _legR so the shared chase animation drives her. */
    _buildQueen() {
        // Bodice (animated torso)
        this._torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.32), MAT_QUEEN_BODICE);
        this._torso.position.y = 1.18;
        this.group.add(this._torso);
        // Banda (sash) — golden diagonal across the bodice
        const sash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.06), MAT_QUEEN_SASH);
        sash.position.set(0, 1.18, 0.18);
        sash.rotation.z = 0.62;
        this.group.add(sash);
        // Gown skirt — wide cone flaring from the waist to the knees
        const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.75, 12), MAT_QUEEN_GOWN);
        skirt.position.y = 0.82;
        this.group.add(skirt);
        // Head + hair
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), MAT_QUEEN_SKIN);
        head.position.y = 1.78;
        this.group.add(head);
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), MAT_QUEEN_HAIR);
        hair.position.set(0, 1.82, -0.06);
        hair.scale.set(1, 0.9, 0.7);
        this.group.add(hair);
        // Glowing magenta eyes
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), MAT_EYE_QUEEN);
        eyeL.position.set(-0.08, 1.80, 0.20);
        this.group.add(eyeL);
        const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), MAT_EYE_QUEEN);
        eyeR.position.set(0.08, 1.80, 0.20);
        this.group.add(eyeR);
        // Crown / tiara — golden band with five spikes
        const crownBand = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.06, 10), MAT_QUEEN_GOLD);
        crownBand.position.y = 2.00;
        this.group.add(crownBand);
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 6), MAT_QUEEN_GOLD);
            spike.position.set(Math.cos(a) * 0.20, 2.08, Math.sin(a) * 0.20);
            this.group.add(spike);
        }
        // Arms outstretched (zombie pose)
        const armGeo = new THREE.BoxGeometry(0.10, 0.50, 0.10);
        const armL = new THREE.Mesh(armGeo, MAT_QUEEN_SKIN);
        armL.position.set(-0.32, 1.28, 0.18);
        armL.rotation.x = -0.60;
        this.group.add(armL);
        const armR = new THREE.Mesh(armGeo, MAT_QUEEN_SKIN);
        armR.position.set(0.32, 1.28, 0.18);
        armR.rotation.x = -0.60;
        this.group.add(armR);
        // Legs (animated) + heels, partly tucked under the gown
        const legGeo = new THREE.BoxGeometry(0.14, 0.50, 0.14);
        this._legL = new THREE.Mesh(legGeo, MAT_QUEEN_SKIN);
        this._legL.position.set(-0.11, 0.28, 0);
        this.group.add(this._legL);
        this._legR = new THREE.Mesh(legGeo, MAT_QUEEN_SKIN);
        this._legR.position.set(0.11, 0.28, 0);
        this.group.add(this._legR);
        const heelGeo = new THREE.BoxGeometry(0.16, 0.10, 0.24);
        const heelL = new THREE.Mesh(heelGeo, MAT_BOOTS);
        heelL.position.set(-0.11, 0.05, 0.04);
        this.group.add(heelL);
        const heelR = new THREE.Mesh(heelGeo, MAT_BOOTS);
        heelR.position.set(0.11, 0.05, 0.04);
        this.group.add(heelR);
    }
    get position() { return this.group.position; }
    get hp() { return this._hp; }
    get alive() { return this._hp > 0; }
    takeDamage(d) { this._hp = Math.max(0, this._hp - d); }
    _collides(x, z, colliders) {
        const r = ZombieGaucho.COLLIDER_R;
        for (const c of colliders) {
            if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ)
                return true;
        }
        return false;
    }
    /** Returns the start position + velocity of a thrown car if this thrower
     *  decides to attack this frame, or null. Only meaningful for throwers. */
    tryThrow(target, dt) {
        if (!this.isThrower)
            return null;
        this._throwCooldown -= dt;
        if (this._throwCooldown > 0)
            return null;
        const dx = target.x - this.group.position.x;
        const dz = target.z - this.group.position.z;
        const dist = Math.hypot(dx, dz);
        const maxRange = this.isBoss ? 180 : ZombieGaucho.THROW_RANGE_MAX;
        if (dist < ZombieGaucho.THROW_RANGE_MIN || dist > maxRange)
            return null;
        const baseInterval = this.isBoss
            ? ZombieGaucho.BOSS_THROW_INTERVAL
            : ZombieGaucho.THROW_INTERVAL;
        this._throwCooldown = baseInterval + (Math.random() - 0.5) * 0.6;
        // Aim with simple ballistic arc — solve for initial velocity given gravity g and target at same height
        // For a 45° ish launch: tweak so the projectile reaches target around 1 s.
        const g = 18; // matches ThrownCar.GRAVITY
        const tFlight = 0.9 + dist * 0.012;
        const vy = g * tFlight / 2; // vertical velocity to come back down at target
        const vh = dist / tFlight; // horizontal speed
        const ux = dx / dist, uz = dz / dist;
        const origin = this.group.position.clone();
        origin.y += 2.0 * this.group.scale.y;
        const vel = new THREE.Vector3(ux * vh, vy, uz * vh);
        return { origin, vel };
    }
    /** Reinas de la Vendimia: lob a grape bunch at the target instead of biting.
     *  Returns the projectile's origin + velocity, or null. */
    tryThrowGrapes(target, dt) {
        if (!this.isQueen)
            return null;
        this._throwCooldown -= dt;
        if (this._throwCooldown > 0)
            return null;
        const dx = target.x - this.group.position.x;
        const dz = target.z - this.group.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < ZombieGaucho.GRAPE_RANGE_MIN || dist > ZombieGaucho.GRAPE_RANGE_MAX)
            return null;
        this._throwCooldown = ZombieGaucho.GRAPE_INTERVAL + (Math.random() - 0.5) * 0.5;
        this._biteTimer = ZombieGaucho.BITE_DURATION; // reuse the lurch as a throw motion
        const g = 14; // matches GrapeBunch.GRAVITY
        const tFlight = 0.7 + dist * 0.014;
        const vy = g * tFlight / 2;
        const vh = dist / tFlight;
        const ux = dx / dist, uz = dz / dist;
        const origin = this.group.position.clone();
        origin.y += 1.4;
        const vel = new THREE.Vector3(ux * vh, vy, uz * vh);
        return { origin, vel };
    }
    /** Caballito de Marly: spit a glob at the target. Origin/velocity, or null. */
    trySpit(target, dt) {
        if (!this.isCaballito)
            return null;
        this._throwCooldown -= dt;
        if (this._throwCooldown > 0)
            return null;
        const dx = target.x - this.group.position.x;
        const dz = target.z - this.group.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < ZombieGaucho.SPIT_RANGE_MIN || dist > ZombieGaucho.SPIT_RANGE_MAX)
            return null;
        this._throwCooldown = ZombieGaucho.SPIT_INTERVAL + (Math.random() - 0.5) * 0.6;
        this._biteTimer = ZombieGaucho.BITE_DURATION; // head thrust
        const g = 12; // matches Spit.GRAVITY
        const tFlight = 0.7 + dist * 0.012;
        const vy = g * tFlight / 2;
        const vh = dist / tFlight;
        const ux = dx / dist, uz = dz / dist;
        const origin = this.group.position.clone();
        origin.y += 3.2;
        origin.x += ux * 0.6;
        origin.z += uz * 0.6;
        const vel = new THREE.Vector3(ux * vh, vy, uz * vh);
        return { origin, vel };
    }
    /** Cumbia/chacarera shimmy — big hip sway, hops, spin wiggle, arms up. */
    _animateDance(dt) {
        this._phase += dt * 9;
        const ph = this._phase;
        this.group.position.y = Math.abs(Math.sin(ph * 2)) * 0.22; // bouncy hops
        this.group.rotation.y += Math.sin(ph) * 0.35; // twist on the spot
        this._torso.rotation.z = Math.sin(ph) * 0.5; // big hip sway
        this._torso.rotation.x = Math.sin(ph * 2) * 0.12;
        this._legL.rotation.x = Math.sin(ph) * 0.5;
        this._legR.rotation.x = -Math.sin(ph) * 0.5;
        if (this._armL) {
            this._armL.rotation.x = -2.0 + Math.sin(ph) * 0.9;
            this._armL.rotation.z = 0.4 + Math.sin(ph) * 0.4;
        }
        if (this._armR) {
            this._armR.rotation.x = -2.0 - Math.sin(ph) * 0.9;
            this._armR.rotation.z = -0.4 - Math.sin(ph) * 0.4;
        }
    }
    /** Trip-and-recover lurch — pitches way forward, nearly hits the ground. */
    _animateStumble() {
        const t = Math.max(0, this._stumbleTimer / ZombieGaucho.STUMBLE_DURATION); // 1 → 0
        const arc = Math.sin((1 - t) * Math.PI); // 0 → 1 → 0
        this._torso.rotation.x = arc * 1.8; // big forward pitch
        this._torso.rotation.z = Math.sin((1 - t) * Math.PI * 3) * 0.35; // wobble
        this.group.rotation.y += Math.sin((1 - t) * Math.PI * 4) * 0.15; // veer
        this.group.position.y = arc * 0.05;
        this._legL.rotation.x = arc * 1.3; // legs tangle
        this._legR.rotation.x = -arc * 0.7;
        if (this._armL)
            this._armL.rotation.x = -0.55 - arc * 1.6; // flail
        if (this._armR)
            this._armR.rotation.x = -0.55 - arc * 1.9;
    }
    update(dt, target, colliders = []) {
        if (!this.alive)
            return { hitTarget: false };
        this._attackCooldown -= dt;
        // Bite lurch — torso swings forward as if chomping, then snaps back
        if (this._biteTimer > 0) {
            this._biteTimer -= dt;
            const t = Math.max(0, this._biteTimer / ZombieGaucho.BITE_DURATION); // 1 → 0
            this._torso.rotation.x = Math.sin((1 - t) * Math.PI) * 0.55;
        }
        const dx = target.x - this.group.position.x;
        const dz = target.z - this.group.position.z;
        const dist = Math.hypot(dx, dz);
        let hitTarget = false;
        if (!this.isQueen && dist < ZombieGaucho.ATTACK_R) {
            // In melee — face target, idle bite (queens never bite; they throw grapes)
            this.group.rotation.y = Math.atan2(dx, dz);
            if (this._attackCooldown <= 0) {
                hitTarget = true;
                this._attackCooldown = ZombieGaucho.DAMAGE_INTERVAL;
                this._biteTimer = ZombieGaucho.BITE_DURATION;
            }
        }
        else if (dist < ZombieGaucho.DETECT_R) {
            const ux = dx / dist, uz = dz / dist;
            this.group.rotation.y = Math.atan2(ux, uz);
            // Queens hold a standoff distance and lob grapes; everyone else closes in.
            const holdGround = this.isQueen && dist < ZombieGaucho.GRAPE_STANDOFF;
            if (!holdGround) {
                const isWalker = !this._fastGait && !this.isThrower && !this.isBoss && !this.isCaballito;
                // ── Quirk state machines: walkers dance, runners trip ────────────────
                let speedMul = 1;
                let dancing = false, stumbling = false;
                if (isWalker) {
                    if (this._danceTimer > 0) {
                        this._danceTimer -= dt;
                        dancing = true;
                    }
                    else if ((this._danceCooldown -= dt) <= 0) {
                        this._danceTimer = ZombieGaucho.DANCE_DURATION;
                        this._danceCooldown = 4 + Math.random() * 5;
                        dancing = true;
                    }
                    if (dancing)
                        speedMul = 0.25; // shuffle closer while dancing
                }
                else if (this.isRunner) {
                    if (this._stumbleTimer > 0) {
                        this._stumbleTimer -= dt;
                        stumbling = true;
                    }
                    else if ((this._stumbleCooldown -= dt) <= 0) {
                        this._stumbleTimer = ZombieGaucho.STUMBLE_DURATION;
                        this._stumbleCooldown = 3 + Math.random() * 4;
                        stumbling = true;
                    }
                    if (stumbling)
                        speedMul = 0.08; // nearly stops while tripping
                }
                // Chase — collide-and-slide along scenery (at the possibly reduced speed)
                const spd = this._speed * speedMul;
                const stepX = ux * spd * dt;
                const stepZ = uz * spd * dt;
                const px = this.group.position.x;
                const pz = this.group.position.z;
                const nx = px + stepX;
                const nz = pz + stepZ;
                if (!this._collides(nx, nz, colliders)) {
                    this.group.position.x = nx;
                    this.group.position.z = nz;
                }
                else if (!this._collides(nx, pz, colliders)) {
                    this.group.position.x = nx; // slide along X
                }
                else if (!this._collides(px, nz, colliders)) {
                    this.group.position.z = nz; // slide along Z
                }
                // else: stuck against a wall — animation still plays in place
                // Animation
                if (dancing) {
                    this._animateDance(dt);
                }
                else if (stumbling) {
                    this._animateStumble();
                }
                else {
                    const animSpeed = this._fastGait ? 13 : 6;
                    const swing = this._fastGait ? 1.05 : 0.55;
                    const bobAmt = this._fastGait ? 0.14 : 0.06;
                    this._phase += dt * animSpeed;
                    const sw = Math.sin(this._phase) * swing;
                    this._legL.rotation.x = sw;
                    this._legR.rotation.x = -sw;
                    this._torso.rotation.x *= 0.8; // settle any leftover lurch/trip pitch
                    this._torso.rotation.z = Math.sin(this._phase * 0.5) * 0.06;
                    this.group.position.y = Math.abs(Math.sin(this._phase)) * bobAmt;
                    // Settle arms back to the outstretched zombie pose after a dance
                    if (this._armL) {
                        this._armL.rotation.x += (-0.55 - this._armL.rotation.x) * 0.18;
                        this._armL.rotation.z *= 0.8;
                    }
                    if (this._armR) {
                        this._armR.rotation.x += (-0.55 - this._armR.rotation.x) * 0.18;
                        this._armR.rotation.z *= 0.8;
                    }
                }
            }
            else {
                // Throwing stance — gentle sway, legs settling
                this._phase += dt * 3;
                this._legL.rotation.x *= 0.85;
                this._legR.rotation.x *= 0.85;
                this._torso.rotation.z = Math.sin(this._phase) * 0.05;
                this.group.position.y = Math.abs(Math.sin(this._phase)) * 0.04;
            }
        }
        else {
            this._phase += dt * 1.2;
            this._torso.rotation.z = Math.sin(this._phase) * 0.04;
        }
        return { hitTarget };
    }
    remove(scene) {
        scene.remove(this.group);
    }
}
