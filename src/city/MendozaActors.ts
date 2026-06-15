// "Actores" que dan vida a Mendoza: músico callejero, vendedor de tortas fritas,
// turistas, señores del ajedrez, una Reina de la Vendimia, niños con pelota y un
// corredor en el Parque. No hablan: reaccionan a Canito (lo miran al pasar) y le
// disparan un pensamiento. Reusan los modelos low-poly de People.
import * as THREE from 'three';
import { buildPerson } from './People';

interface ActorDef { x: number; z: number; rot: number; kind: Kind; id: string; text: string; }
type Kind = 'musico' | 'tortitas' | 'turista' | 'ajedrez' | 'mate' | 'nino';

const DEFS: ActorDef[] = [
  { x: 400,  z: 120,  rot: -Math.PI / 2, kind: 'musico',   id: 'a_musico',   text: 'Esa musiquita me gusta… ¡muevo la colita!' },
  { x: 392,  z: -70,  rot: -Math.PI / 2, kind: 'tortitas', id: 'a_tortitas', text: 'Huele a torta frita recién hecha… ¡qué rico!' },
  { x: 405,  z: -140, rot: Math.PI,      kind: 'turista',  id: 'a_turista',  text: '¿Me está sacando una foto a mí? Pongo pose.' },
  { x: -42,  z: 44,   rot: 0,            kind: 'ajedrez',  id: 'a_ajedrez',  text: 'Estos no se mueven nunca… ¿qué tanto miran?' },
  { x: 44,   z: -34,  rot: Math.PI,      kind: 'mate',     id: 'a_mate',     text: 'Esa señora toma mate al solcito… ¿me convida una galletita?' },
  { x: 34,   z: 72,   rot: 0,            kind: 'nino',     id: 'a_nino',     text: '¡Un nene con pelota! …ahora no puedo jugar, perdón.' },
  { x: -250, z: 250,  rot: 0,            kind: 'nino',     id: 'a_nino2',    text: '¡Otro chico que me quiere acariciar! 🐾' },
  { x: -980, z: 40,   rot: -Math.PI / 2, kind: 'turista',  id: 'a_turista2', text: 'Turistas en el Parque… qué lindo está todo esto.' },
];

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

interface Actor { group: THREE.Group; x: number; z: number; rot: number; id: string; text: string; }

export class MendozaActors {
  private actors: Actor[] = [];
  private jogGroup: THREE.Group;
  private jog = { cx: -1000, cz: -10, r: 28, a: 0, speed: 0.9 };

  constructor(scene: THREE.Scene) {
    for (const d of DEFS) {
      const g = this._build(d);
      g.position.set(d.x, 0, d.z);
      g.rotation.y = d.rot;
      scene.add(g);
      this.actors.push({ group: g, x: d.x, z: d.z, rot: d.rot, id: d.id, text: d.text });
    }
    // Corredor del Parque (se mueve en círculo)
    this.jogGroup = buildPerson(1.0).group;
    scene.add(this.jogGroup);
  }

  private _build(d: ActorDef): THREE.Group {
    const rig = buildPerson(d.kind === 'nino' ? 0.66 : 1.0);
    const g = rig.group;
    if (d.kind === 'musico') {
      const gtr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.12), lam(0x7a4a22));
      gtr.position.set(0.22, 1.0, 0.25); gtr.rotation.z = 0.5; g.add(gtr);
    } else if (d.kind === 'tortitas') {
      const cart = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.7), lam(0xb24a3a));
      cart.position.set(0, 0.6, 0.75); g.add(cart);
      const toldo = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.9), lam(0xe0c040));
      toldo.position.set(0, 1.5, 0.75); g.add(toldo);
    } else if (d.kind === 'turista') {
      const cam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.18), lam(0x111111));
      cam.position.set(0, 1.45, 0.28); g.add(cam);
    } else if (d.kind === 'mate') {
      const gourd = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.13, 8), lam(0x6a4a26));
      gourd.position.set(0.24, 1.02, 0.22); g.add(gourd);
      const bombilla = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), lam(0xb8b8c0));
      bombilla.position.set(0.24, 1.12, 0.22); bombilla.rotation.z = 0.5; g.add(bombilla);
    } else if (d.kind === 'nino') {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lam(0xe23a3a));
      ball.position.set(0.5, 0.18, 0.55); g.add(ball);
    } else if (d.kind === 'ajedrez') {
      const table = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.7), lam(0x6a4a30));
      table.position.set(0, 0.7, 0.75); g.add(table);
      for (const [bx, bz] of [[0.2, 0.62], [-0.2, 0.62], [0.2, 0.88], [-0.2, 0.88]] as [number, number][]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), lam(0x4a3420));
        leg.position.set(bx, 0.35, bz); g.add(leg);
      }
      const rival = buildPerson(1.0).group;       // el otro jugador, enfrentado
      rival.position.set(0, 0, 1.5); rival.rotation.y = Math.PI; g.add(rival);
    }
    return g;
  }

  /** Anima a los actores (miran a Canito al pasar) y al corredor. Devuelve un
   *  pensamiento si Canito está cerca de alguno (el `think` de afuera lo modera). */
  update(dt: number, px: number, pz: number): { id: string; text: string } | null {
    // Corredor en círculo por el Parque
    this.jog.a += dt * this.jog.speed / this.jog.r;
    const jx = this.jog.cx + Math.cos(this.jog.a) * this.jog.r;
    const jz = this.jog.cz + Math.sin(this.jog.a) * this.jog.r;
    this.jogGroup.position.set(jx, 0, jz);
    this.jogGroup.rotation.y = this.jog.a + Math.PI / 2;

    let near: { id: string; text: string } | null = null;
    if (Math.hypot(jx - px, jz - pz) < 7) near = { id: 'a_corredor', text: '¡Uno corriendo! …yo mejor sigo buscando al humano.' };

    for (const a of this.actors) {
      const d = Math.hypot(a.x - px, a.z - pz);
      if (d < 6) {
        a.group.rotation.y = Math.atan2(px - a.x, pz - a.z);   // mira a Canito
        if (!near) near = { id: a.id, text: a.text };
      } else {
        a.group.rotation.y = a.rot;
      }
    }
    return near;
  }
}
