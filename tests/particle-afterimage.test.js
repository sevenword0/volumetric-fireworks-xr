import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PARTICLE_AFTERIMAGE_DAMP,
  MIN_PARTICLE_AFTERIMAGE_DAMP,
  PARTICLE_AFTERIMAGE_TARGET,
  clampParticleAfterimage,
  resolveParticleAfterimage,
} from '../src/core/particle-afterimage.js';

test('particle afterimage strength clamps to its safe user range', () => {
  assert.equal(clampParticleAfterimage(-4), 0);
  assert.equal(clampParticleAfterimage(0.42), 0.42);
  assert.equal(clampParticleAfterimage(9), 1);
  assert.equal(clampParticleAfterimage(Number.NaN, 0.5), 0.5);
});

test('particle afterimage maps strength to a bounded temporal damping value', () => {
  assert.deepEqual(resolveParticleAfterimage(0), { active: false, strength: 0, damp: 0 });
  assert.deepEqual(resolveParticleAfterimage(1), { active: true, strength: 1, damp: MAX_PARTICLE_AFTERIMAGE_DAMP });
  const middle = resolveParticleAfterimage(0.5);
  assert.equal(middle.active, true);
  assert.equal(middle.strength, 0.5);
  assert.ok(middle.damp > MIN_PARTICLE_AFTERIMAGE_DAMP);
  assert.ok(middle.damp < MAX_PARTICLE_AFTERIMAGE_DAMP);
});

test('runtime load protection disables both history blend and residual intensity', () => {
  assert.deepEqual(resolveParticleAfterimage(0.8, false), { active: false, strength: 0, damp: 0 });
  assert.equal(PARTICLE_AFTERIMAGE_TARGET, 'particleAfterimage');
});
