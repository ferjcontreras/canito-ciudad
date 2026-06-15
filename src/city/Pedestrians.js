import { PathAgent } from './CityGraph';
import { buildPerson, animateWalk } from './People';
export class PedestrianManager {
    peds = [];
    constructor(scene, graph, count) {
        // Vereda: a halfW + inset del eje de la calle.
        const sidewalkOffset = (halfW) => halfW + 1.9;
        for (let i = 0; i < count; i++) {
            const speed = 1.3 + Math.random() * 0.8; // m/s (~paso humano)
            const agent = new PathAgent(graph, sidewalkOffset, speed);
            const rig = buildPerson(0.95 + Math.random() * 0.12);
            scene.add(rig.group);
            this.peds.push({ agent, rig, gait: Math.random() * Math.PI * 2 });
        }
    }
    update(dt) {
        for (const p of this.peds) {
            p.agent.update(dt);
            p.gait += dt * p.agent.speed * 3.2;
            const g = p.rig.group;
            g.position.x = p.agent.x;
            g.position.z = p.agent.z;
            g.rotation.y = p.agent.heading;
            animateWalk(p.rig, p.gait, 1);
        }
    }
    /** Posiciones de los peatones (para que los autos frenen ante ellos). */
    positions(out) {
        for (const p of this.peds)
            out.push({ x: p.agent.x, z: p.agent.z });
    }
    /** La gente que ve a Canito se frena y se da vuelta a mirarlo/acariciarlo.
     *  Devuelve cuántos lo están "saludando" (para subir el ánimo) y la posición
     *  del más cercano (para el efecto de corazones). */
    greet(px, pz, radius) {
        let count = 0, best = Infinity, nx = 0, nz = 0;
        const r2 = radius * radius;
        for (const p of this.peds) {
            const dx = px - p.agent.x, dz = pz - p.agent.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < r2) {
                count++;
                p.agent.speedScale = 0; // se frena
                p.rig.group.rotation.y = Math.atan2(dx, dz); // mira a Canito
                if (d2 < best) {
                    best = d2;
                    nx = p.agent.x;
                    nz = p.agent.z;
                }
            }
            else if (p.agent.speedScale === 0) {
                p.agent.speedScale = 1; // retoma la marcha
            }
        }
        return { count, nx, nz };
    }
}
