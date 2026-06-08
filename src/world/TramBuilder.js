import * as THREE from 'three';
// Static tram infrastructure: ballast bed, rails, sleepers and overhead
// catenary (poles + contact wire) — it's an electric light rail line.
const RAIL = new THREE.MeshLambertMaterial({ color: 0x55585c });
const TIE = new THREE.MeshLambertMaterial({ color: 0x4a3a2a, flatShading: true });
const BALLAST = new THREE.MeshLambertMaterial({ color: 0x6b6660 });
const POLE = new THREE.MeshLambertMaterial({ color: 0x4a4d52, flatShading: true });
const WIRE = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
/** Lay a double-rail tram line through (cx,cz) at `angle`, length 2·halfLen. */
export function buildTramLine(scene, cx, cz, angle, halfLen) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = angle;
    scene.add(g);
    const L = halfLen * 2;
    const GAUGE = 1.435;
    const TRACK_OFFSET = 2.6; // each track's centre, ±lateral
    // Two parallel tracks (one per direction)
    for (const dirSide of [-1, 1]) {
        const ox = dirSide * TRACK_OFFSET;
        // Ballast bed
        const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, L), BALLAST);
        bed.position.set(ox, 0.05, 0);
        bed.receiveShadow = true;
        g.add(bed);
        // Rails
        for (const sx of [-1, 1]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, L), RAIL);
            rail.position.set(ox + sx * GAUGE / 2, 0.14, 0);
            g.add(rail);
        }
        // Sleepers (instanced)
        const spacing = 0.65;
        const n = Math.floor(L / spacing);
        const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, 0.12, 0.26), TIE, n);
        const m = new THREE.Matrix4();
        for (let i = 0; i < n; i++) {
            m.makeTranslation(ox, 0.1, -halfLen + i * spacing + spacing / 2);
            ties.setMatrixAt(i, m);
        }
        ties.instanceMatrix.needsUpdate = true;
        ties.receiveShadow = true;
        g.add(ties);
        // Overhead contact wire above each track
        const wire = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, L), WIRE);
        wire.position.set(ox, 5.1, 0);
        g.add(wire);
    }
    // Central catenary masts with cross-arms reaching both tracks
    const poleSpacing = 28;
    const np = Math.floor(L / poleSpacing);
    for (let i = 0; i <= np; i++) {
        const z = -halfLen + i * poleSpacing;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 5.8, 8), POLE);
        pole.position.set(0, 2.9, z);
        pole.castShadow = true;
        g.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2 * TRACK_OFFSET + 1.2, 0.1, 0.1), POLE);
        arm.position.set(0, 5.35, z);
        g.add(arm);
    }
}
