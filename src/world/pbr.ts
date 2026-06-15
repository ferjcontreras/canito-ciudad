import * as THREE from 'three';

// Convierte (in-place) todos los materiales Lambert/Phong de la escena a
// MeshStandardMaterial (PBR), para que respondan al tone mapping, a la oclusión
// ambiental y al environment map (reflejos). Se corre UNA vez, al final del
// armado del mundo. Los MeshBasic (carteles/luces emisivas) y Shader se dejan.
export function upgradeToPBR(root: THREE.Object3D): void {
  const cache = new Map<string, THREE.MeshStandardMaterial>();

  const convert = (m: THREE.Material): THREE.Material => {
    const lm = m as unknown as {
      isMeshStandardMaterial?: boolean; isMeshBasicMaterial?: boolean;
      isShaderMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean;
      color?: THREE.Color; map?: THREE.Texture | null; emissive?: THREE.Color;
      emissiveIntensity?: number; emissiveMap?: THREE.Texture | null;
      transparent?: boolean; opacity?: number; side?: THREE.Side;
      flatShading?: boolean; vertexColors?: boolean;
    };
    if (lm.isMeshStandardMaterial || lm.isMeshBasicMaterial || lm.isShaderMaterial) return m;
    if (!lm.isMeshLambertMaterial && !lm.isMeshPhongMaterial) return m;

    let std = cache.get(m.uuid);
    if (!std) {
      const color = lm.color ?? new THREE.Color(0xffffff);
      const emissive = lm.emissive ?? new THREE.Color(0x000000);
      // Todo mate: nada de superficies enceradas/reflectantes. El asfalto, las
      // paredes y la gente son materiales rugosos. Reflejos casi nulos.
      std = new THREE.MeshStandardMaterial({
        color: color.clone(),
        map: lm.map ?? null,
        emissive: emissive.clone(),
        emissiveIntensity: lm.emissiveIntensity ?? 1,
        emissiveMap: lm.emissiveMap ?? null,
        transparent: lm.transparent ?? false,
        opacity: lm.opacity ?? 1,
        side: lm.side ?? THREE.FrontSide,
        flatShading: lm.flatShading ?? false,
        vertexColors: lm.vertexColors ?? false,
        roughness: 0.95,
        metalness: 0.0,
      });
      std.envMapIntensity = 0.15;
      cache.set(m.uuid, std);
    }
    return std;
  };

  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(convert);
    else if (mesh.material) mesh.material = convert(mesh.material);
  });
}
