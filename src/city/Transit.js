import * as THREE from 'three';
import { buildPerson, animateWalk } from './People';
const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
let _signTex = null;
function signTexture() {
    if (_signTex)
        return _signTex;
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#0e3a6b';
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(54, 64, 34, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#0e3a6b';
    c.font = 'bold 46px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('M', 54, 66);
    c.fillStyle = '#ffffff';
    c.font = 'bold 23px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('Metro', 98, 52);
    c.fillText('tranvía', 98, 80);
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4;
    _signTex = t;
    return t;
}
/** Construye los andenes; devuelve las estaciones y colliders (refugios). */
export function buildStations(scene, tramX, zs) {
    const stations = [];
    const colliders = [];
    const px = tramX + 6.5; // andén al este de las vías (sin pisar el tranvía)
    const concrete = mat(0xb9b3a4);
    const roofMat = mat(0x37404c);
    const postMat = mat(0x2a2f36);
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fb7c4, transparent: true, opacity: 0.4 });
    for (const z of zs) {
        // Plataforma
        const plat = new THREE.Mesh(new THREE.BoxGeometry(4, 0.26, 16), concrete);
        plat.position.set(px, 0.13, z);
        plat.receiveShadow = true;
        scene.add(plat);
        // Borde táctil amarillo (lado vías)
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 16), mat(0xe8c24a));
        edge.position.set(px - 2, 0.15, z);
        scene.add(edge);
        // Refugio (techo + postes + pared trasera de vidrio)
        const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 6), roofMat);
        roof.position.set(px + 0.3, 2.7, z);
        roof.castShadow = true;
        scene.add(roof);
        for (const dz of [-2.6, 2.6])
            for (const dx of [-1.3, 1.5]) {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.7, 8), postMat);
                post.position.set(px + 0.3 + dx, 1.35, z + dz);
                scene.add(post);
            }
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 5.6), glassMat);
        back.position.set(px + 1.7, 1.5, z);
        scene.add(back);
        // Banco
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 4), mat(0x6a4a32));
        bench.position.set(px + 1.2, 0.7, z);
        scene.add(bench);
        // Cartel "Metrotranvía"
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), postMat);
        pole.position.set(px - 1.4, 1.5, z - 6.5);
        scene.add(pole);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ map: signTexture(), side: THREE.DoubleSide, toneMapped: false }));
        sign.position.set(px - 1.4, 2.7, z - 6.5);
        scene.add(sign);
        // Collider del refugio (que Canito lo rodee)
        colliders.push({ minX: px - 1.2, maxX: px + 1.8, minZ: z - 3, maxZ: z + 3 });
        stations.push({ x: px, z });
    }
    return { stations, colliders };
}
const CAP = 8; // pasajeros que suben por parada
export class TransitManager {
    trams;
    stations;
    riders = [];
    served = new Map(); // tram → última estación servida
    constructor(scene, trams, stations, count) {
        this.trams = trams;
        this.stations = stations;
        for (let i = 0; i < count; i++) {
            const rig = buildPerson(0.95 + Math.random() * 0.12);
            scene.add(rig.group);
            const st = (Math.random() * stations.length) | 0;
            const [sx, sz] = this._spot(st);
            const r = {
                rig, group: rig.group, state: 'toStation', stationIdx: st,
                destIdx: st, tram: null, x: sx, z: sz, tx: sx, tz: sz,
                speed: 1.2 + Math.random() * 0.7, gait: Math.random() * 6.28,
            };
            // arranca disperso a lo largo del boulevard (no cruzando a los edificios)
            r.x += (Math.random() - 0.5) * 8;
            r.z += (Math.random() - 0.5) * 40;
            this.riders.push(r);
        }
    }
    _spot(stIdx) {
        const s = this.stations[stIdx];
        return [s.x + (Math.random() - 0.5) * 2.4, s.z + (Math.random() - 0.5) * 12];
    }
    _stationAt(z) {
        for (let i = 0; i < this.stations.length; i++)
            if (Math.abs(this.stations[i].z - z) < 4)
                return i;
        return -1;
    }
    update(dt) {
        // ── Eventos de tranvía en andén (subir / bajar), una vez por parada ──────
        for (const tram of this.trams) {
            if (!tram.atStation) {
                this.served.delete(tram);
                continue;
            }
            const sIdx = this._stationAt(tram.position.z);
            if (sIdx < 0 || this.served.get(tram) === sIdx)
                continue;
            this.served.set(tram, sIdx);
            // Bajan los que viajan en ESTE tranvía con destino esta estación
            for (const r of this.riders) {
                if (r.state === 'riding' && r.tram === tram && r.destIdx === sIdx) {
                    r.tram = null;
                    r.stationIdx = sIdx;
                    r.state = 'toStation';
                    const [sx, sz] = this._spot(sIdx);
                    r.x = tram.position.x + 4;
                    r.z = tram.position.z + (Math.random() - 0.5) * 6;
                    r.tx = sx;
                    r.tz = sz;
                    r.group.visible = true;
                }
            }
            // Suben los que esperan en esta estación (hasta CAP)
            let boarded = 0;
            for (const r of this.riders) {
                if (boarded >= CAP)
                    break;
                if (r.state === 'waiting' && r.stationIdx === sIdx) {
                    r.state = 'riding';
                    r.tram = tram;
                    r.group.visible = false;
                    // destino: otra estación al azar
                    let d = (Math.random() * this.stations.length) | 0;
                    if (d === sIdx)
                        d = (d + 1) % this.stations.length;
                    r.destIdx = d;
                    boarded++;
                }
            }
        }
        // ── Movimiento de los pasajeros ─────────────────────────────────────────
        for (const r of this.riders) {
            if (r.state === 'riding')
                continue;
            const dx = r.tx - r.x, dz = r.tz - r.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.4) {
                if (r.state === 'toStation')
                    r.state = 'waiting';
            }
            else {
                const step = Math.min(d, r.speed * dt);
                r.x += (dx / d) * step;
                r.z += (dz / d) * step;
                r.group.rotation.y = Math.atan2(dx, dz);
                r.gait += dt * r.speed * 3.4;
                animateWalk(r.rig, r.gait, 1);
            }
            r.group.position.x = r.x;
            r.group.position.z = r.z;
        }
    }
}
