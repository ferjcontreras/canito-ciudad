import * as THREE from 'three';
// Texturas procedurales (albedo + normal map) para dar detalle de superficie sin
// archivos: grano del asfalto, hormigón de las veredas, tierra/césped del suelo.
// Se generan en canvas, se cachean y se repiten (RepeatWrapping).
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
function smooth(h, size, passes = 2) {
    for (let p = 0; p < passes; p++) {
        const c = h.slice();
        for (let y = 0; y < size; y++)
            for (let x = 0; x < size; x++) {
                const xm = (x - 1 + size) % size, xp = (x + 1) % size;
                const ym = (y - 1 + size) % size, yp = (y + 1) % size;
                h[y * size + x] = (c[y * size + x] * 4 + c[y * size + xm] + c[y * size + xp] + c[ym * size + x] + c[yp * size + x]) / 8;
            }
    }
}
/** Albedo con grano: ruido fino sobre un color base, con manchas grandes. */
function grainCanvas(size, base, speckle, blotch) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    // mancha grande de baja frecuencia
    const low = new Float32Array(size * size);
    for (let i = 0; i < low.length; i++)
        low[i] = Math.random();
    smooth(low, size, 6);
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < size * size; i++) {
        const fine = (Math.random() - 0.5) * speckle;
        const big = (low[i] - 0.5) * blotch;
        const n = fine + big;
        d[i * 4] = clamp(base[0] + n);
        d[i * 4 + 1] = clamp(base[1] + n);
        d[i * 4 + 2] = clamp(base[2] + n);
        d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
}
/** Normal map derivado de un heightmap de ruido (Sobel). */
function normalCanvas(size, strength, rough = 1) {
    const h = new Float32Array(size * size);
    for (let i = 0; i < h.length; i++)
        h[i] = Math.random();
    smooth(h, size, rough);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const xm = (x - 1 + size) % size, xp = (x + 1) % size;
            const ym = (y - 1 + size) % size, yp = (y + 1) % size;
            const dx = (h[y * size + xm] - h[y * size + xp]) * strength;
            const dy = (h[ym * size + x] - h[yp * size + x]) * strength;
            const len = Math.hypot(dx, dy, 1);
            const i = (y * size + x) * 4;
            d[i] = clamp(((dx / len) * 0.5 + 0.5) * 255);
            d[i + 1] = clamp(((dy / len) * 0.5 + 0.5) * 255);
            d[i + 2] = clamp(((1 / len) * 0.5 + 0.5) * 255);
            d[i + 3] = 255;
        }
    ctx.putImageData(img, 0, 0);
    return cv;
}
function tex(cv, srgb = false) {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb)
        t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
let _asphalt = null;
export function asphaltMaps() {
    if (_asphalt)
        return _asphalt;
    _asphalt = {
        map: tex(grainCanvas(256, [150, 150, 156], 26, 30), true),
        normalMap: tex(normalCanvas(256, 2.2, 1)),
    };
    return _asphalt;
}
let _concrete = null;
export function concreteMaps() {
    if (_concrete)
        return _concrete;
    // baldosas: añadimos junta sutil en cuadrícula al albedo
    const cv = grainCanvas(256, [225, 222, 214], 16, 22);
    const ctx = cv.getContext('2d');
    ctx.strokeStyle = 'rgba(120,116,108,0.5)';
    ctx.lineWidth = 2;
    for (let k = 0; k <= 256; k += 64) {
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(k, 256);
        ctx.moveTo(0, k);
        ctx.lineTo(256, k);
        ctx.stroke();
    }
    _concrete = { map: tex(cv, true), normalMap: tex(normalCanvas(256, 1.4, 2)) };
    return _concrete;
}
let _ground = null;
export function groundMaps() {
    if (_ground)
        return _ground;
    _ground = {
        map: tex(grainCanvas(256, [150, 148, 132], 22, 40), true),
        normalMap: tex(normalCanvas(256, 1.8, 2)),
    };
    return _ground;
}
