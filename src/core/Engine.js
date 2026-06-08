import * as THREE from 'three';
export class Engine {
    renderer;
    scene;
    _camera = null;
    _lastTime = 0;
    constructor() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        this.scene = new THREE.Scene();
        // Atardecer: cielo cálido + neblina dorada (el domo de cielo cubre el fondo)
        this.scene.background = new THREE.Color(0xf2b277);
        this.scene.fog = new THREE.FogExp2(0xe9b483, 0.00018);
        this._setupLights();
        window.addEventListener('resize', () => this._onResize());
    }
    _setupLights() {
        this.scene.add(new THREE.AmbientLight(0xffe2c4, 0.5));
        // Low, warm setting sun coming from the west (toward the Portones)
        const sun = new THREE.DirectionalLight(0xffb265, 2.6);
        sun.position.set(-585, 150, 90);
        sun.castShadow = true;
        sun.shadow.mapSize.setScalar(2048);
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 1500;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -400;
        sun.shadow.camera.right = sun.shadow.camera.top = 400;
        sun.shadow.bias = -0.0005;
        this.scene.add(sun);
        // Sky / ground hemi: warm peach from above, dusky earth from below
        this.scene.add(new THREE.HemisphereLight(0xffc9a0, 0x5a4a3c, 0.55));
    }
    setCamera(cam) {
        this._camera = cam;
        if (cam instanceof THREE.PerspectiveCamera) {
            cam.aspect = window.innerWidth / window.innerHeight;
            cam.updateProjectionMatrix();
        }
    }
    start(onFrame) {
        const loop = (now) => {
            const dt = Math.min((now - (this._lastTime || now)) / 1000, 0.05);
            this._lastTime = now;
            onFrame(dt);
            if (this._camera)
                this.renderer.render(this.scene, this._camera);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
    _onResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this._camera instanceof THREE.PerspectiveCamera) {
            this._camera.aspect = window.innerWidth / window.innerHeight;
            this._camera.updateProjectionMatrix();
        }
    }
}
