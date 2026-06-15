import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export class Engine {
    renderer;
    scene;
    _camera = null;
    _lastTime = 0;
    _composer = null;
    _bloom = null;
    _gtao = null;
    _smaa = null;
    // Luces (para el ciclo de atardecer → noche)
    _sun;
    _ambient;
    _hemi;
    // Calidad de render: 0 = Rendimiento, 1 = Equilibrada (def.), 2 = Alta.
    _quality = 1;
    static QUALITY_NAMES = ['Rendimiento', 'Equilibrada', 'Alta'];
    constructor() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Render cinematográfico: tone mapping ACES + exposición
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        this.scene = new THREE.Scene();
        // Atardecer: cielo cálido + neblina dorada (el domo de cielo cubre el fondo)
        this.scene.background = new THREE.Color(0xf2b277);
        this.scene.fog = new THREE.FogExp2(0xe9b483, 0.00018);
        // Environment map (IBL) para reflejos suaves en autos, vidrios y metal.
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        this._setupLights();
        window.addEventListener('resize', () => this._onResize());
    }
    _setupLights() {
        // El environment map ya aporta relleno; bajamos un poco el ambiente.
        this._ambient = new THREE.AmbientLight(0xffe2c4, 0.32);
        this.scene.add(this._ambient);
        // Low, warm setting sun coming from the west (toward the Portones)
        const sun = new THREE.DirectionalLight(0xffb265, 2.9);
        sun.position.set(-585, 150, 90);
        sun.castShadow = true;
        sun.shadow.mapSize.setScalar(2048);
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 1500;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -400;
        sun.shadow.camera.right = sun.shadow.camera.top = 400;
        sun.shadow.bias = -0.0005;
        this.scene.add(sun);
        this._sun = sun;
        // Sky / ground hemi: warm peach from above, dusky earth from below
        this._hemi = new THREE.HemisphereLight(0xffc9a0, 0x5a4a3c, 0.42);
        this.scene.add(this._hemi);
    }
    // Colores clave del cielo a lo largo del atardecer (reusados sin alocar)
    static _SKY_GOLD = new THREE.Color(0xf2b277);
    static _SKY_ORANGE = new THREE.Color(0xd9622e);
    static _SKY_NIGHT = new THREE.Color(0x0a0e1a);
    static _SUN_DAY = new THREE.Color(0xffb265);
    static _SUN_NIGHT = new THREE.Color(0x35304e);
    _tmpSky = new THREE.Color();
    _tmpSun = new THREE.Color();
    /** Ajusta la iluminación según la hora: t=0 tarde dorada, t=1 noche. */
    setDusk(t) {
        const k = t < 0 ? 0 : t > 1 ? 1 : t;
        // Cielo/niebla: dorado → naranja (primera mitad) → noche (segunda mitad)
        if (k < 0.5)
            this._tmpSky.copy(Engine._SKY_GOLD).lerp(Engine._SKY_ORANGE, k / 0.5);
        else
            this._tmpSky.copy(Engine._SKY_ORANGE).lerp(Engine._SKY_NIGHT, (k - 0.5) / 0.5);
        this.scene.background.copy(this._tmpSky);
        this.scene.fog.color.copy(this._tmpSky);
        const ease = k * k; // el oscurecimiento se acelera hacia el final
        this._sun.intensity = 2.9 * (1 - 0.95 * ease);
        this._sun.color.copy(this._tmpSun.copy(Engine._SUN_DAY).lerp(Engine._SUN_NIGHT, ease));
        this._ambient.intensity = 0.32 * (1 - 0.8 * ease);
        this._hemi.intensity = 0.42 * (1 - 0.78 * ease);
        this.renderer.toneMappingExposure = 1.15 * (1 - 0.62 * k);
    }
    setCamera(cam) {
        this._camera = cam;
        if (cam instanceof THREE.PerspectiveCamera) {
            cam.aspect = window.innerWidth / window.innerHeight;
            cam.updateProjectionMatrix();
        }
        this._buildComposer(cam);
    }
    _buildComposer(cam) {
        const w = window.innerWidth, h = window.innerHeight;
        const composer = new EffectComposer(this.renderer);
        composer.setPixelRatio(this.renderer.getPixelRatio());
        composer.setSize(w, h);
        composer.addPass(new RenderPass(this.scene, cam));
        // Oclusión ambiental (contacto/esquinas → profundidad)
        const gtao = new GTAOPass(this.scene, cam, w, h);
        gtao.output = GTAOPass.OUTPUT.Default;
        // radio en unidades de mundo: sombras de contacto suaves en la ciudad
        gtao.updateGtaoMaterial({ radius: 2.0, distanceExponent: 1.0, thickness: 1.0, scale: 1.0 });
        gtao.blendIntensity = 0.85;
        composer.addPass(gtao);
        this._gtao = gtao;
        // Bloom muy sutil (sólo lo MUY brillante: el sol). Umbral alto, fuerza baja
        // para que nada parezca "encerado" ni con glow exagerado.
        const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.10, 0.4, 0.97);
        composer.addPass(bloom);
        this._bloom = bloom;
        // Tone mapping + sRGB
        composer.addPass(new OutputPass());
        // Antialias temporal-estable (al final)
        const smaa = new SMAAPass(w, h);
        composer.addPass(smaa);
        this._smaa = smaa;
        this._composer = composer;
        this.setQuality(this._quality); // aplica el nivel por defecto
    }
    get quality() { return this._quality; }
    get qualityName() { return Engine.QUALITY_NAMES[this._quality]; }
    /** Ajusta el nivel de calidad (0..2). Prende/apaga los pases caros y baja la
     *  resolución interna para recuperar fluidez. */
    setQuality(level) {
        this._quality = ((Math.round(level) % 3) + 3) % 3;
        const q = this._quality;
        if (this._gtao)
            this._gtao.enabled = q >= 2; // GTAO sólo en Alta (es lo más caro)
        if (this._bloom)
            this._bloom.enabled = q >= 1;
        if (this._smaa)
            this._smaa.enabled = q >= 1;
        const cap = q >= 2 ? 2 : q === 1 ? 1.5 : 1.25;
        const pr = Math.min(window.devicePixelRatio, cap);
        this.renderer.setPixelRatio(pr);
        this._composer?.setPixelRatio(pr);
        const w = window.innerWidth, h = window.innerHeight;
        this.renderer.setSize(w, h);
        this._composer?.setSize(w, h);
    }
    cycleQuality() { this.setQuality(this._quality + 1); }
    start(onFrame) {
        const loop = (now) => {
            const dt = Math.min((now - (this._lastTime || now)) / 1000, 0.05);
            this._lastTime = now;
            onFrame(dt);
            if (this._composer)
                this._composer.render();
            else if (this._camera)
                this.renderer.render(this.scene, this._camera);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
    _onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.renderer.setSize(w, h);
        if (this._camera instanceof THREE.PerspectiveCamera) {
            this._camera.aspect = w / h;
            this._camera.updateProjectionMatrix();
        }
        if (this._composer)
            this._composer.setSize(w, h);
        this._bloom?.setSize(w, h);
        this._gtao?.setSize(w, h);
    }
}
