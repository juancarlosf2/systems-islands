import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Only chart environments are static. Work on a scene clone, never the cached GLB.
export function batchStaticMeshes(root) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map();
  root.traverseVisible(mesh => {
    if (!mesh.isMesh || mesh === root || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.children.length) return;
    const { geometry, material } = mesh;
    if (!geometry?.isBufferGeometry || Array.isArray(material) || !material?.isMeshStandardMaterial || material.transparent || !material.depthWrite || !material.depthTest || material.blending !== THREE.NormalBlending) return;
    if (mesh.customDepthMaterial || mesh.customDistanceMaterial || mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return;
    if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || Object.keys(geometry.morphAttributes).length || geometry.groups.length) return;
    if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity || !geometry.attributes.position) return;
    const attributes = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b));
    if (attributes.some(([, attribute]) => attribute.isInterleavedBufferAttribute || attribute.isInstancedBufferAttribute || !attribute.array)) return;
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    // Reflected/singular transforms need separate winding handling; retain those meshes.
    if (!matrix.elements.every(Number.isFinite) || matrix.determinant() <= 0) return;
    const schema = attributes.map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`).join('|');
    const key = `${material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}:${mesh.layers.mask}:${mesh.frustumCulled}:${Boolean(geometry.index)}:${schema}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ mesh, matrix });
  });
  const batches = [];
  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    const copies = [];
    let geometry;
    try {
      for (const { mesh, matrix } of entries) copies.push(mesh.geometry.clone().applyMatrix4(matrix));
      geometry = mergeGeometries(copies, false);
    } catch {
      // An unsupported attribute or merge must leave the original environment intact.
    } finally {
      copies.forEach(copy => copy.dispose());
    }
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const first = entries[0].mesh;
    const batch = new THREE.Mesh(geometry, first.material);
    batch.name = 'chart_static_batch';
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder;
    batch.layers.mask = first.layers.mask;
    batch.frustumCulled = first.frustumCulled;
    root.add(batch);
    entries.forEach(({ mesh }) => mesh.removeFromParent());
    batches.push(batch);
  }
  return batches;
}
