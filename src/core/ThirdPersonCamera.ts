import * as THREE from 'three';

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;

  private readonly DIST   = 5.5;
  private readonly HEIGHT = 3.4;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.05,
      3600,            // see the sky dome + distant mountains
    );
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  update(pos: THREE.Vector3, yRot: number): void {
    const cx = pos.x - Math.sin(yRot) * this.DIST;
    const cz = pos.z - Math.cos(yRot) * this.DIST;
    this.camera.position.set(cx, pos.y + this.HEIGHT, cz);
    this.camera.lookAt(pos.x, pos.y + 0.85, pos.z);
  }
}
