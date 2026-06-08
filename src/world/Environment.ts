import * as THREE from 'three';

// Sunset backdrop: gradient sky dome, glowing sun, Andes mountain rings and
// drifting clouds. Everything lives in one group that follows the camera each
// frame (skybox-style) so the horizon stays infinitely far and stable as the
// player walks around.

// Sun direction (towards the west / the Portones), low on the horizon. Matches
// the directional light set in Engine.
const SUN_DIR = new THREE.Vector3(-1, 0.22, 0.15).normalize();

function buildSkyDome(parent: THREE.Object3D): void {
  const geo = new THREE.SphereGeometry(3200, 32, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      horizonColor: { value: new THREE.Color(0xffb070) },
      midColor:     { value: new THREE.Color(0xe98f6e) },
      zenithColor:  { value: new THREE.Color(0x2a3a72) },
      sunColor:     { value: new THREE.Color(0xfff1cf) },
      sunDir:       { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 horizonColor, midColor, zenithColor, sunColor, sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.18, h));
        col = mix(col, zenithColor, smoothstep(0.12, 0.7, h));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 220.0) * 1.6;   // crisp sun
        col += sunColor * pow(s, 9.0)  * 0.45;   // warm halo
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  parent.add(new THREE.Mesh(geo, mat));

  // Crisp sun disc
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(95, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false }),
  );
  sun.position.copy(SUN_DIR.clone().multiplyScalar(2700));
  parent.add(sun);
}

// A continuous mountain range: a solid "curtain" whose top edge is a smooth
// layered-sine ridgeline (peaks + saddles), tallest to the west (the Andes).
// Unlit (MeshBasic) so it reads as a hazy painted backdrop, DoubleSide so it's
// visible from inside the ring.
// A mountain range covering only a western arc of the horizon (centered on the
// Portones / the Andes), tapering to the ground at the arc edges. Solid curtain
// with a smooth layered-sine ridgeline. Unlit + DoubleSide so it reads as a
// hazy painted backdrop visible from inside.
function buildMountainRange(
  parent: THREE.Object3D,
  R: number, amp: number, segs: number,
  lowC: number, highC: number, snowFrac: number, seed: number,
  centerAngle: number, arcHalf: number,
): void {
  const positions: number[] = [];
  const colors:    number[] = [];
  const low  = new THREE.Color(lowC);
  const high = new THREE.Color(highC);
  const snow = new THREE.Color(0xd9dcea);
  const snowH = amp * snowFrac;

  const angleDiff = (a: number): number => {
    let d = a - centerAngle;
    while (d >  Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };
  const ridge = (i: number): number => {
    const a = (i / segs) * Math.PI * 2;
    const d = angleDiff(a);
    if (Math.abs(d) > arcHalf) return 0;
    const taper = Math.cos((d / arcHalf) * (Math.PI / 2));   // 1 centre → 0 edges
    let n = 0.5
      + 0.30 * Math.sin(a * 3  + seed)
      + 0.18 * Math.sin(a * 6  + seed * 1.7)
      + 0.10 * Math.sin(a * 11 + seed * 2.3);
    n = Math.max(0.12, n);
    return amp * n * taper;
  };
  const rad = (i: number): number => R * (0.97 + 0.05 * Math.sin(i * 1.7 + seed));
  const topColor = (h: number): THREE.Color =>
    h > snowH ? snow.clone() : low.clone().lerp(high, Math.min(1, h / amp));

  const pos = (x: number, y: number, z: number) => positions.push(x, y, z);
  const col = (c: THREE.Color) => colors.push(c.r, c.g, c.b);

  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    // Only emit segments inside the western arc
    if (Math.abs(angleDiff(a0)) > arcHalf && Math.abs(angleDiff(a1)) > arcHalf) continue;
    const r0 = rad(i), r1 = rad(i + 1);
    const h0 = ridge(i), h1 = ridge(i + 1);
    const x0 = r0 * Math.cos(a0), z0 = r0 * Math.sin(a0);
    const x1 = r1 * Math.cos(a1), z1 = r1 * Math.sin(a1);
    const c0 = topColor(h0), c1 = topColor(h1);

    // Solid quad from below ground (y=-30) up to the ridgeline
    pos(x0, -30, z0); pos(x0, h0, z0); pos(x1, h1, z1);
    col(low); col(c0); col(c1);
    pos(x0, -30, z0); pos(x1, h1, z1); pos(x1, -30, z1);
    col(low); col(c1); col(low);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  parent.add(new THREE.Mesh(geo, mat));
}

function buildClouds(parent: THREE.Object3D): THREE.Group {
  const layer = new THREE.Group();
  const puffGeo = new THREE.SphereGeometry(1, 8, 6);
  // Bright, sunset-warm and un-fogged so they read clearly against the sky
  const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xf8e8da, emissive: 0x5a3422, emissiveIntensity: 0.4, flatShading: true, fog: false,
  });

  const CLOUDS = 40;
  for (let c = 0; c < CLOUDS; c++) {
    const cloud = new THREE.Group();
    const ang = Math.random() * Math.PI * 2;
    const rad = 400 + Math.random() * 1000;
    cloud.position.set(Math.cos(ang) * rad, 150 + Math.random() * 180, Math.sin(ang) * rad);

    const puffs = 5 + Math.floor(Math.random() * 5);
    const scale = 30 + Math.random() * 34;
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(puffGeo, cloudMat);
      m.position.set(
        (Math.random() - 0.5) * scale * 2.6,
        (Math.random() - 0.5) * scale * 0.5,
        (Math.random() - 0.5) * scale * 1.5,
      );
      const s = scale * (0.6 + Math.random() * 0.7);
      m.scale.set(s, s * 0.62, s);
      cloud.add(m);
    }
    layer.add(cloud);
  }
  parent.add(layer);
  return layer;
}

export interface Environment { update(dt: number, camX: number, camZ: number): void; }

export function buildEnvironment(scene: THREE.Scene): Environment {
  // The sky dome + sun are infinitely far → they follow the camera (skybox).
  const sky = new THREE.Group();
  scene.add(sky);
  buildSkyDome(sky);

  // The mountains and clouds are fixed in the world, so you move *past* them
  // (real parallax) instead of them sticking to you.
  // Mountains only on the WESTERN horizon (towards the Portones / the Andes).
  const ANDES_DIR = Math.atan2(-100, -700);   // dirección a los Portones (oeste)
  const ANDES_ARC = 1.05;                       // semiarco (~60° a cada lado)
  // Far snow-capped Andes (dusky blue) + nearer green foothills for depth.
  buildMountainRange(scene, 2000, 640, 168, 0x39406a, 0x5a6390, 0.60, 11.3, ANDES_DIR, ANDES_ARC);
  buildMountainRange(scene, 1500, 300, 150, 0x2f3a30, 0x46583f, 9.0,  4.7, ANDES_DIR, ANDES_ARC * 0.92);
  const cloudLayer = buildClouds(scene);

  return {
    update(dt: number, camX: number, camZ: number) {
      sky.position.set(camX, 0, camZ);            // only the sky follows
      cloudLayer.rotation.y += dt * 0.004;         // slow drift
    },
  };
}
