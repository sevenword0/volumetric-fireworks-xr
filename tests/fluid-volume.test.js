import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { FluidVolume } from '../src/volume/fluid-volume.js';

function createFluid(grid = { x: 8, y: 6, z: 8 }, overrides = {}) {
  const scene = { add() {}, remove() {} };
  const state = {
    physics: { windX: 1.6, windZ: 0.3, vortex: 0.42, ...overrides.physics },
    volume: { smoke: 0.7, scattering: 1.25, shadow: 1.6, buoyancy: 1.1, ...overrides.volume },
    quality: { shadows: true, ...overrides.quality },
  };
  return new FluidVolume(scene, state, { grid });
}

test('zero smoke starts with volume simulation and both raymarch meshes disabled', () => {
  const fluid = createFluid(undefined, { volume: { smoke: 0 } });
  assert.equal(fluid.enabled, false);
  assert.equal(fluid.mesh.visible, false);
  assert.equal(fluid.shadowMesh.visible, false);
  fluid.update(1);
  assert.equal(fluid.completedSteps, 0);
  fluid.dispose();
});

test('quality bounds raymarch work while runtime load transitions keep shader variants stable', () => {
  const fluid = createFluid();
  fluid.setQuality('high');
  assert.equal(fluid.material.steps, 16);
  assert.equal(fluid.shadowMaterial.steps, 4);
  assert.equal(fluid.updateRate, 14);

  fluid.setPerformanceLevel(2);
  assert.equal(fluid.material.steps, 16);
  assert.equal(fluid.shadowMaterial.steps, 4);
  assert.equal(fluid.updateRate, 9);
  assert.equal(fluid.shadowMesh.visible, false);
  assert.equal(fluid.shadowMesh.layers.mask, 1 << 2);
  fluid.dispose();
});

test('scheduled fluid simulation is distributed across multiple frames', () => {
  const fluid = createFluid({ x: 8, y: 6, z: 16 });
  fluid.addEmitter(new THREE.Vector3(0, 21, 0), 1, 1, null, 10);
  fluid.update(0.05);
  fluid.update(0.05);
  assert.ok(fluid.simulationJob);
  assert.ok(fluid.simulationProgress > 0 && fluid.simulationProgress < 1);
  assert.ok(fluid.lastSimulationSlices <= fluid.simulationSlicesPerFrame);

  let frames = 1;
  while (fluid.simulationJob && frames < 20) {
    fluid.update(0);
    frames += 1;
  }
  assert.equal(fluid.simulationJob, null);
  assert.ok(frames > 1);
  assert.equal(fluid.completedSteps, 1);
  assert.ok(fluid.density.some((value) => value > 0));
  fluid.dispose();
});

test('raymarch shader variants stay stable when predictive preparation is disabled', () => {
  const fluid = createFluid();
  fluid.setQuality('high');
  fluid.setPerformanceLevel(2, { adjustRaymarch: false });
  assert.equal(fluid.material.steps, 16);
  assert.equal(fluid.shadowMaterial.steps, 4);
  assert.equal(fluid.updateRate, 9);
  assert.equal(fluid.shadowMesh.visible, false);
  fluid.dispose();
});

test('fluid emitters are recycled instead of allocating every smoke update', () => {
  const fluid = createFluid();
  const position = new THREE.Vector3(0, 21, 0);
  for (let index = 0; index < 12; index += 1) fluid.addEmitter(position, 1, 1, null, 1);
  fluid.simulate(1 / 12);
  const allocations = fluid.performanceDiagnostics.emitterAllocations;
  assert.equal(allocations, 12);
  assert.equal(fluid.performanceDiagnostics.emitterPoolSize, 12);

  for (let index = 0; index < 12; index += 1) fluid.addEmitter(position, 1, 1, null, 1);
  fluid.simulate(1 / 12);
  assert.equal(fluid.performanceDiagnostics.emitterAllocations, allocations);
  fluid.dispose();
});

test('synchronous simulation remains available for deterministic tools and tests', () => {
  const fluid = createFluid();
  fluid.addEmitter(new THREE.Vector3(0, 21, 0), 1, 1, null, 10);
  fluid.simulate(1 / 12);
  assert.equal(fluid.simulationJob, null);
  assert.equal(fluid.completedSteps, 1);
  assert.ok(fluid.density.some((value) => value > 0));
  fluid.dispose();
});
