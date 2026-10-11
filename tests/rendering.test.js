import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { batchStaticMeshes } from '../src/rendering/batchStaticMeshes.js';

const closeVector = (actual, expected, tolerance = 1e-5) => assert.ok(actual.distanceTo(expected) < tolerance, `${actual.toArray()} != ${expected.toArray()}`);
const meshes = root => { const result = []; root.traverse(node => { if (node.isMesh) result.push(node); }); return result; };
const triangles = root => meshes(root).reduce((count, mesh) => count + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0);

test('static batches preserve nested world geometry, normals, material settings and chapter picking without mutating prefabs', () => {
  const source = new THREE.Group();
  source.userData.chapterId = 4;
  source.position.set(10, -1, 8);
  source.rotation.y = .2;
  source.scale.setScalar(.69);
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const originalPositions = geometry.attributes.position.array.slice();
  for (const x of [-3, 3]) {
    const group = new THREE.Group();
    group.position.set(x, .2, 1);
    group.rotation.y = .3;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(1, .6, 1.2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
    source.add(group);
  }
  const clone = source.clone(true);
  clone.updateMatrixWorld(true);
  const originalMeshes = meshes(clone);
  const expectedPositions = [], expectedNormals = [];
  for (const mesh of originalMeshes) {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      expectedPositions.push(new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld));
      expectedNormals.push(new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, i).applyNormalMatrix(normalMatrix));
    }
  }
  const target = originalMeshes[0].getWorldPosition(new THREE.Vector3());
  const raycaster = new THREE.Raycaster(target.clone().add(new THREE.Vector3(0, 5, 0)), new THREE.Vector3(0, -1, 0));
  const originalHit = raycaster.intersectObject(clone, true)[0];
  assert.ok(originalHit);
  const [batch] = batchStaticMeshes(clone);
  assert.equal(meshes(clone).length, 1);
  assert.equal(batch.material, material);
  assert.equal(batch.castShadow, true);
  assert.equal(batch.receiveShadow, true);
  assert.equal(batch.renderOrder, 2);
  assert.equal(triangles(clone), triangles(source));
  clone.updateMatrixWorld(true);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(batch.matrixWorld);
  expectedPositions.forEach((point, i) => {
    closeVector(new THREE.Vector3().fromBufferAttribute(batch.geometry.attributes.position, i).applyMatrix4(batch.matrixWorld), point);
    closeVector(new THREE.Vector3().fromBufferAttribute(batch.geometry.attributes.normal, i).applyNormalMatrix(normalMatrix), expectedNormals[i]);
  });
  const hit = raycaster.intersectObject(clone, true)[0];
  closeVector(hit.point, originalHit.point);
  let chapter = hit.object;
  while (chapter && !chapter.userData.chapterId) chapter = chapter.parent;
  assert.equal(chapter.userData.chapterId, 4);
  assert.deepEqual(geometry.attributes.position.array, originalPositions);
  assert.equal(meshes(source).length, 2);
  assert.ok(meshes(source).every(mesh => mesh.geometry === geometry));
  let disposeEvents = 0;
  batch.geometry.addEventListener('dispose', () => disposeEvents++);
  batch.geometry.dispose();
  assert.equal(disposeEvents, 1);
  assert.deepEqual(geometry.attributes.position.array, originalPositions);
});

test('unsupported, hidden, animated and incompatible static meshes remain individually intact', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const add = (geometry = new THREE.BoxGeometry(), nextMaterial = material, parent = root) => {
    const mesh = new THREE.Mesh(geometry, nextMaterial);
    parent.add(mesh);
    return mesh;
  };
  // BoxGeometry has material groups; these must not be collapsed into one draw.
  const grouped = add();
  const transparent = add(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial({ transparent: true, opacity: .5 }));
  const hiddenParent = new THREE.Group(); hiddenParent.visible = false; root.add(hiddenParent);
  const hidden = add(new THREE.PlaneGeometry(), material, hiddenParent);
  const morphedGeometry = new THREE.PlaneGeometry();
  morphedGeometry.morphAttributes.position = [morphedGeometry.attributes.position.clone()];
  const morphed = add(morphedGeometry);
  const reflected = add(new THREE.PlaneGeometry()); reflected.scale.x = -1;
  const withChild = add(new THREE.PlaneGeometry()); withChild.add(new THREE.Group());
  const skinned = new THREE.SkinnedMesh(new THREE.PlaneGeometry(), material); root.add(skinned);
  const custom = add(new THREE.PlaneGeometry()); custom.onBeforeRender = () => {};
  const arrayMaterial = add(new THREE.PlaneGeometry(), [material]);
  const noUv = new THREE.PlaneGeometry(); noUv.deleteAttribute('uv');
  const incompatible = [add(new THREE.PlaneGeometry()), add(noUv)];
  assert.deepEqual(batchStaticMeshes(root), []);
  assert.ok([grouped, transparent, hidden, morphed, reflected, withChild, skinned, custom, arrayMaterial, ...incompatible].every(mesh => mesh.parent));
  assert.equal(hidden.parent, hiddenParent);
});

test('all authored chart islands retain their triangles, bounds, source meshes and materials after batching', async () => {
  let before = 0, after = 0;
  for (let id = 1; id <= 16; id++) {
    const bytes = await fs.readFile(new URL(`../public/models/chapter-${String(id).padStart(2, '0')}.glb`, import.meta.url));
    const { scene: source } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const originals = meshes(source);
    const clone = source.clone(true);
    const originalBounds = new THREE.Box3().setFromObject(clone, true);
    const originalTriangles = triangles(clone);
    const batches = batchStaticMeshes(clone);
    before += originals.length;
    after += meshes(clone).length;
    assert.ok(batches.length > 0, `Chapter ${id} batches`);
    assert.equal(triangles(clone), originalTriangles, `Chapter ${id} triangles`);
    const bounds = new THREE.Box3().setFromObject(clone, true);
    closeVector(bounds.min, originalBounds.min);
    closeVector(bounds.max, originalBounds.max);
    assert.equal(meshes(source).length, originals.length);
    assert.ok(batches.every(batch => originals.some(mesh => mesh.material === batch.material)));
    batches.forEach(batch => batch.geometry.dispose());
  }
  assert.ok(after < before / 4, `Static draw meshes ${before} -> ${after}`);
});
