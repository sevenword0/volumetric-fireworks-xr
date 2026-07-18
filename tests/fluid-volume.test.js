import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { DEFAULT_VOLUME_SIZE, FluidVolume, SMOKE_VOLUME_EXTENT_SCALE } from '../src/volume/fluid-volume.js';

function createFluid(grid = { x: 8, y: 6, z: 8 }, overrides = {}) {
  const scene = { add() {}, remove() {} };
  const state = {
    physics: { windX: 1.6, windZ: 0.3, vortex: 0.42, ...overrides.physics },
    volume: { smoke: 0.7, scattering: 1.25, shadow: 1.6, buoyancy: 1.1, ...overrides.volume },
    quality: { shadows: true, ...overrides.quality },
  };
  return new FluidVolume(scene, state, { grid });
}

test('default smoke domain doubles every world-space extent without increasing grid work', () => {
  const fluid = createFluid();
  assert.equal(SMOKE_VOLUME_EXTENT_SCALE, 2);
  assert.deepEqual(fluid.size.toArray(), [DEFAULT_VOLUME_SIZE.x, DEFAULT_VOLUME_SIZE.y, DEFAULT_VOLUME_SIZE.z]);
  assert.deepEqual(fluid.size.toArray(), [116, 84, 92]);
  assert.deepEqual(fluid.center.toArray(), [0, 42, 0]);
  assert.equal(fluid.cellCount, 8 * 6 * 8);
  fluid.dispose();
});

test('smoke shader controls update live uniforms without recompiling raymarch materials', () => {
  const fluid = createFluid(undefined, { volume: { densityContrast: 1.35, edgeSoftness: 0.09, fireGlow: 1.8 } });
  assert.equal(fluid.densityContrastUniform.value, 1.35);
  assert.equal(fluid.edgeSoftnessUniform.value, 0.09);
  assert.equal(fluid.fireIntensityUniform.value, 1.8);
  const material = fluid.material;
  fluid.state.volume.densityContrast = 2.2;
  fluid.state.volume.edgeSoftness = 0.035;
  fluid.state.volume.fireGlow = 0.65;
  fluid.update(0);
  assert.equal(fluid.material, material);
  assert.equal(fluid.densityContrastUniform.value, 2.2);
  assert.equal(fluid.edgeSoftnessUniform.value, 0.035);
  assert.equal(fluid.fireIntensityUniform.value, 0.65);
  fluid.dispose();
});

test('launch and burst smoke use distinct pooled emission and impulse profiles', () => {
  const fluid = createFluid();
  const position = new THREE.Vector3(0, 21, 0);
  assert.equal(fluid.emitFireworkSmoke(position, 'launch', { smoke: 0.8, scale: 1, power: 2, brightness: 1, smokeStride: 1 }), true);
  const launchDensity = fluid.emitters[0].density;
  const launchRadius = fluid.emitters[0].radius;
  assert.equal(fluid.performanceDiagnostics.launchSmokeEmissions, 1);
  assert.equal(fluid.performanceDiagnostics.queuedImpulses, 1);

  assert.equal(fluid.emitFireworkSmoke(position, 'burst', { smoke: 0.8, scale: 1.4, brightness: 1, smokeStride: 1 }), true);
  assert.ok(fluid.emitters[1].density > launchDensity);
  assert.ok(fluid.emitters[1].radius > launchRadius);
  assert.equal(fluid.performanceDiagnostics.burstSmokeEmissions, 1);
  assert.equal(fluid.performanceDiagnostics.queuedImpulses, 2);
  fluid.simulate(1 / 12);
  assert.ok(fluid.density.some((value) => value > 0));
  assert.equal(fluid.performanceDiagnostics.emitterPoolSize, 2);
  fluid.dispose();
});

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
