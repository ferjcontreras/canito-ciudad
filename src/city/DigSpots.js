// Tesoros enterrados: marcas que SÓLO se ven en modo olfato. Te parás encima y
// cavás (tecla) para desenterrar huesos. Le da otro uso a la mecánica de oler y
// alimenta la economía. Patrón de manager simple, como el resto.
import * as THREE from 'three';
function markTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    c.font = '44px serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('🦴', 32, 36);
    return new THREE.CanvasTexture(cv);
}
export class DigSpots {
    spots = [];
    t = 0;
    constructor(scene, positions) {
        const tex = markTexture();
        for (const [x, z] of positions) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
            sp.position.set(x, 0.6, z);
            sp.scale.setScalar(1.2);
            sp.visible = false;
            scene.add(sp);
            this.spots.push({ x, z, reward: 2 + (Math.random() * 3 | 0), sp, done: false });
        }
    }
    /** Mostrar las marcas sólo cuando Canito está oliendo. */
    update(dt, smell) {
        this.t += dt;
        for (const s of this.spots) {
            const show = smell && !s.done;
            s.sp.visible = show;
            if (show) {
                s.sp.position.y = 0.55 + Math.sin(this.t * 3) * 0.12;
                s.sp.material.opacity = 0.6 + (Math.sin(this.t * 4) + 1) * 0.2;
            }
        }
    }
    /** ¿Hay un tesoro acá? Si lo hay, lo cava y devuelve los huesos (0 si no). */
    digNear(px, pz) {
        for (const s of this.spots) {
            if (s.done)
                continue;
            if (Math.hypot(s.x - px, s.z - pz) < 2.2) {
                s.done = true;
                s.sp.visible = false;
                return s.reward;
            }
        }
        return 0;
    }
}
