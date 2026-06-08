import * as THREE from 'three';
// Edificios públicos emblemáticos: Casa de Gobierno, Municipalidad, Correo
// Argentino y una Escuela. Cada uno con su cartel (textura de canvas) y bandera.
function signTexture(text, bg = '#10307a', fg = '#ffffff') {
    const cw = 512, ch = 96;
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fs = 56;
    do {
        ctx.font = `bold ${fs}px Arial, sans-serif`;
        fs -= 4;
    } while (ctx.measureText(text).width > cw - 30 && fs > 18);
    ctx.fillText(text, cw / 2, ch / 2 + 2);
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    return t;
}
const MARBLE = new THREE.MeshLambertMaterial({ color: 0xe9e3d2, flatShading: true });
const STONE = new THREE.MeshLambertMaterial({ color: 0xd7cfba, flatShading: true });
const ROOF = new THREE.MeshLambertMaterial({ color: 0x7a4030, flatShading: true });
const GLASS = new THREE.MeshLambertMaterial({ color: 0x223040, flatShading: true });
const POLE = new THREE.MeshLambertMaterial({ color: 0x9a9aa0, flatShading: true });
const SKYBLUE = new THREE.MeshLambertMaterial({ color: 0x75aadb, flatShading: true });
const WHITEM = new THREE.MeshLambertMaterial({ color: 0xf4f4f0, flatShading: true });
const SUNM = new THREE.MeshLambertMaterial({ color: 0xf1c40f, emissive: 0x6a5200, emissiveIntensity: 0.3 });
const mk = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
};
// Bandera argentina sobre mástil
function flag(parent, x, z, h = 7) {
    mk(parent, new THREE.CylinderGeometry(0.08, 0.1, h, 6), POLE, x, h / 2, z);
    const fw = 2.4, fh = 1.5, fy = h - 1.0, fx = x + 1.3;
    mk(parent, new THREE.BoxGeometry(fw, fh / 3, 0.05), SKYBLUE, fx, fy + fh / 3, z);
    mk(parent, new THREE.BoxGeometry(fw, fh / 3, 0.05), WHITEM, fx, fy, z);
    mk(parent, new THREE.BoxGeometry(fw, fh / 3, 0.05), SKYBLUE, fx, fy - fh / 3, z);
    mk(parent, new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12), SUNM, fx, fy, z + 0.04).rotation.x = Math.PI / 2;
}
// Cartel sobre la fachada (frente +Z)
function facadeSign(parent, text, y, z, w = 8, bg, fg) {
    const tex = signTexture(text, bg, fg);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 96 / 512), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(0, y, z);
    parent.add(m);
}
// Fila de ventanas en una fachada +Z
function windowRow(parent, W, z, y, n) {
    for (let i = 0; i < n; i++) {
        const x = -W / 2 + (i + 0.5) * (W / n);
        mk(parent, new THREE.BoxGeometry(W / n * 0.55, 1.3, 0.1), GLASS, x, y, z);
    }
}
function placeGroup(scene, x, z, colliders, noBuild, half) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z); // mira hacia el centro de la ciudad
    scene.add(g);
    colliders.push({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });
    noBuild.push({ minX: x - half - 4, maxX: x + half + 4, minZ: z - half - 4, maxZ: z + half + 4 });
    return g;
}
export function buildPublicBuildings(scene, colliders, noBuild) {
    // ── Casa de Gobierno (columnas + cúpula) ──────────────────────────────────
    {
        const g = placeGroup(scene, -150, -150, colliders, noBuild, 15);
        mk(g, new THREE.BoxGeometry(26, 13, 16), MARBLE, 0, 6.5, 0);
        windowRow(g, 22, 8.05, 5, 7);
        windowRow(g, 22, 8.05, 9, 7);
        for (let i = 0; i < 7; i++)
            mk(g, new THREE.CylinderGeometry(0.55, 0.6, 9, 12), MARBLE, -10 + i * 10 / 3, 4.5, 8.6);
        mk(g, new THREE.BoxGeometry(24, 1.4, 1.6), MARBLE, 0, 10, 8.6);
        const dome = mk(g, new THREE.SphereGeometry(3.4, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), SUNM, 0, 13, 0);
        dome.scale.set(1, 0.8, 1);
        mk(g, new THREE.ConeGeometry(0.18, 1.2, 8), SUNM, 0, 15.6, 0);
        facadeSign(g, 'CASA DE GOBIERNO', 11.4, 8.7, 11);
        flag(g, -9, 10, 8);
    }
    // ── Municipalidad de Mendoza (torre con reloj) ────────────────────────────
    {
        const g = placeGroup(scene, 150, -150, colliders, noBuild, 15);
        mk(g, new THREE.BoxGeometry(24, 11, 15), STONE, 0, 5.5, 0);
        windowRow(g, 20, 7.55, 4.5, 6);
        windowRow(g, 20, 7.55, 8, 6);
        // Torre del reloj
        mk(g, new THREE.BoxGeometry(5, 20, 5), STONE, 7, 10, 5);
        mk(g, new THREE.CylinderGeometry(2.0, 2.0, 0.2, 16), WHITEM, 7, 18.5, 7.55).rotation.x = Math.PI / 2;
        mk(g, new THREE.BoxGeometry(0.18, 1.4, 0.08), ROOF, 7, 19.1, 7.66);
        mk(g, new THREE.BoxGeometry(1.1, 0.16, 0.08), ROOF, 7.4, 18.5, 7.66);
        mk(g, new THREE.ConeGeometry(3.6, 3.0, 4), ROOF, 7, 21.5, 5);
        facadeSign(g, 'MUNICIPALIDAD', 9.4, 7.65, 10);
        flag(g, -9, 9, 7.6);
    }
    // ── Correo Argentino (azul y amarillo) ────────────────────────────────────
    {
        const g = placeGroup(scene, -150, 150, colliders, noBuild, 14);
        const blue = new THREE.MeshLambertMaterial({ color: 0x16357a, flatShading: true });
        const yellow = new THREE.MeshLambertMaterial({ color: 0xf1c40f, flatShading: true });
        mk(g, new THREE.BoxGeometry(24, 10, 14), blue, 0, 5, 0);
        mk(g, new THREE.BoxGeometry(24.3, 1.6, 14.3), yellow, 0, 9.2, 0); // franja
        windowRow(g, 20, 7.05, 4.6, 6);
        mk(g, new THREE.BoxGeometry(20, 2.4, 0.15), GLASS, 0, 2.4, 7.05); // vidriera baja
        facadeSign(g, 'CORREO ARGENTINO', 8.0, 7.1, 12, '#16357a', '#f1c40f');
        flag(g, -9, 8, 7.1);
    }
    // ── Escuela (con bandera y patio) ─────────────────────────────────────────
    {
        const g = placeGroup(scene, 150, 150, colliders, noBuild, 15);
        const wall = new THREE.MeshLambertMaterial({ color: 0xf0e6cf, flatShading: true });
        mk(g, new THREE.BoxGeometry(26, 8, 12), wall, 0, 4, 0);
        mk(g, new THREE.BoxGeometry(27, 0.6, 13), ROOF, 0, 8.3, 0); // cornisa
        windowRow(g, 22, 6.05, 3.2, 7);
        windowRow(g, 22, 6.05, 6.0, 7);
        mk(g, new THREE.BoxGeometry(3, 4.5, 0.4), ROOF, 0, 2.25, 6.05); // portón
        // Tapia del patio al frente
        mk(g, new THREE.BoxGeometry(26, 1.4, 0.3), wall, 0, 0.7, 12);
        facadeSign(g, 'ESCUELA', 7.0, 6.1, 7);
        flag(g, 0, 6.2, 8);
    }
}
