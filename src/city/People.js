import * as THREE from 'three';
// Low-poly characters for the living city: pedestrians, children and dogs.
// Each builder returns a Group plus the limb pivots so the manager can animate
// a simple walk cycle.
const SKIN = [0xf1c8a0, 0xe0b48c, 0xc98e64, 0xa9724a, 0x8a5a3a];
const SHIRT = [0x2e6da4, 0xb83a3a, 0x3a8a55, 0xe0a030, 0x6a4a8a, 0xd06a90, 0x394a5a, 0xd8d2c4, 0x40a0a0];
const PANTS = [0x303a45, 0x4a3a2a, 0x5a5a60, 0x25303a, 0x6a5a3a, 0x2a3a30];
const HAIR = [0x201810, 0x3a2a18, 0x100c08, 0x5a4630, 0x806040];
const pick = (a) => a[(Math.random() * a.length) | 0];
const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
/** A walking person. `scale` < 1 makes a child. Forward is +Z. */
export function buildPerson(scale = 1) {
    const g = new THREE.Group();
    const skin = mat(pick(SKIN));
    const shirt = mat(pick(SHIRT));
    const pants = mat(pick(PANTS));
    const hair = mat(pick(HAIR));
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirt);
    torso.position.y = 1.12;
    torso.castShadow = true;
    g.add(torso);
    // hips
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.26), pants);
    hips.position.y = 0.78;
    g.add(hips);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
    head.position.y = 1.62;
    head.castShadow = true;
    g.add(head);
    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.14, 0.33), hair);
    hairTop.position.y = 1.76;
    g.add(hairTop);
    const legGeo = new THREE.BoxGeometry(0.17, 0.62, 0.2);
    legGeo.translate(0, -0.31, 0);
    const mkLeg = (sx) => {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.12, 0.7, 0);
        const leg = new THREE.Mesh(legGeo, pants);
        leg.castShadow = true;
        pivot.add(leg);
        g.add(pivot);
        return pivot;
    };
    const legL = mkLeg(-1), legR = mkLeg(1);
    const armGeo = new THREE.BoxGeometry(0.13, 0.54, 0.15);
    armGeo.translate(0, -0.27, 0);
    const mkArm = (sx) => {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.3, 1.4, 0);
        const arm = new THREE.Mesh(armGeo, shirt);
        pivot.add(arm);
        g.add(pivot);
        return pivot;
    };
    const armL = mkArm(-1), armR = mkArm(1);
    g.scale.setScalar(scale);
    return { group: g, legL, legR, armL, armR };
}
/** A small low-poly dog. Forward is +Z. */
export function buildDog() {
    const g = new THREE.Group();
    const coat = mat(pick([0xc8a878, 0x8a6a4a, 0x3a3a3a, 0xe0d8c8, 0x5a4636, 0x202020]));
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.62), coat);
    body.position.y = 0.42;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), coat);
    head.position.set(0, 0.5, 0.42);
    g.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.16), coat);
    snout.position.set(0, 0.46, 0.58);
    g.add(snout);
    for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.05), coat);
        ear.position.set(sx * 0.09, 0.64, 0.36);
        g.add(ear);
    }
    const legGeo = new THREE.BoxGeometry(0.1, 0.32, 0.1);
    legGeo.translate(0, -0.16, 0);
    const legs = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.11, 0.32, sz * 0.2);
        const leg = new THREE.Mesh(legGeo, coat);
        leg.castShadow = true;
        pivot.add(leg);
        g.add(pivot);
        legs.push(pivot);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.5, -0.32);
    const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.26), coat);
    tailMesh.position.z = -0.13;
    tail.add(tailMesh);
    g.add(tail);
    return { group: g, legs, tail };
}
/** Animate a biped walk cycle. `gait` advances with distance for natural speed. */
export function animateWalk(rig, gait, intensity = 1) {
    const sw = Math.sin(gait) * 0.7 * intensity;
    rig.legL.rotation.x = sw;
    rig.legR.rotation.x = -sw;
    rig.armL.rotation.x = -sw * 0.8;
    rig.armR.rotation.x = sw * 0.8;
    rig.group.position.y = Math.abs(Math.sin(gait)) * 0.04 * intensity;
}
export function animateDog(rig, gait) {
    const sw = Math.sin(gait) * 0.6;
    rig.legs[0].rotation.x = sw;
    rig.legs[3].rotation.x = sw;
    rig.legs[1].rotation.x = -sw;
    rig.legs[2].rotation.x = -sw;
    rig.tail.rotation.y = Math.sin(gait * 1.6) * 0.5;
}
