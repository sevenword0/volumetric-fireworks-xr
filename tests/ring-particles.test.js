import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RING_PARTICLE_SCALE,
  MIN_RING_PARTICLE_SCALE,
  clampRingParticleScale,
  resolveRingParticleProfile,
  resolveRingPistilCount,
} from '../src/core/ring-particles.js';

test('ring and double-ring patterns scale their particle count across the full safe range', () => {
  assert.equal(resolveRingParticleProfile({ pattern: 'ring' }, 150, MIN_RING_PARTICLE_SCALE).totalCount, 38);
  assert.equal(resolveRingParticleProfile({ pattern: 'ring' }, 150, MAX_RING_PARTICLE_SCALE).totalCount, 450);
  assert.equal(resolveRingParticleProfile({ pattern: 'doubleRing' }, 190, 2).totalCount, 380);
});

test('saturn scales only its ring while preserving the spherical body count', () => {
  const neutral = resolveRingParticleProfile({ pattern: 'saturn' }, 220, 1);
  const sparse = resolveRingParticleProfile({ pattern: 'saturn' }, 220, 0.25);
  const dense = resolveRingParticleProfile({ pattern: 'saturn' }, 220, 3);

  assert.deepEqual(neutral, { affected: true, totalCount: 220, ringCount: 106, bodyCount: 114, ringFraction: 106 / 220 });
  assert.equal(sparse.bodyCount, neutral.bodyCount);
  assert.equal(dense.bodyCount, neutral.bodyCount);
  assert.equal(sparse.ringCount, 27);
  assert.equal(dense.ringCount, 318);
});

test('non-ring patterns are unchanged and ring pistils use the same scale', () => {
  assert.deepEqual(resolveRingParticleProfile({ pattern: 'peony' }, 230, 3), {
    affected: false, totalCount: 230, ringCount: 0, bodyCount: 230, ringFraction: 0,
  });
  assert.equal(resolveRingPistilCount(55, 0.25), 14);
  assert.equal(resolveRingPistilCount(55, 3), 165);
});

test('ring particle scale clamps invalid and unsafe values', () => {
  assert.equal(clampRingParticleScale(Number.NaN), 1);
  assert.equal(clampRingParticleScale(-10), MIN_RING_PARTICLE_SCALE);
  assert.equal(clampRingParticleScale(99), MAX_RING_PARTICLE_SCALE);
});
