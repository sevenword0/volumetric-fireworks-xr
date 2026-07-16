import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { RENDER_LAYERS, enableVolumeShadowCasters } from '../src/core/render-layers.js';

test('volume shadow casters are enabled only for shadow cameras', () => {
  const mainCamera = new THREE.PerspectiveCamera();
  const shadowCamera = new THREE.PerspectiveCamera();
  const caster = new THREE.Object3D();
  caster.layers.set(RENDER_LAYERS.VOLUME_SHADOW);

  enableVolumeShadowCasters(shadowCamera);
  assert.equal(mainCamera.layers.test(caster.layers), false);
  assert.equal(shadowCamera.layers.test(caster.layers), true);
  assert.equal(shadowCamera.layers.isEnabled(RENDER_LAYERS.DEFAULT), true);
});
