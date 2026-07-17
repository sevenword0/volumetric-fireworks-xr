import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TRAIL_PARTICLE_SCALE,
  MIN_TRAIL_PARTICLE_SCALE,
  clampTrailParticleScale,
} from '../src/core/trail-particles.js';

test('trail particle scale accepts zero through three and rejects unsafe values', () => {
  assert.equal(clampTrailParticleScale(-4), MIN_TRAIL_PARTICLE_SCALE);
  assert.equal(clampTrailParticleScale(2.35), 2.35);
  assert.equal(clampTrailParticleScale(99), MAX_TRAIL_PARTICLE_SCALE);
  assert.equal(clampTrailParticleScale(Number.NaN), 1);
});
