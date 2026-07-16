import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleLoadGuard, particleLoadLevel, particleLoadProfile } from '../src/core/particle-load-guard.js';

test('particle thresholds engage before the measured render saturation point', () => {
  assert.equal(particleLoadLevel(0.279), 0);
  assert.equal(particleLoadLevel(0.28), 1);
  assert.equal(particleLoadLevel(0.46), 2);
  assert.equal(particleLoadLevel(0.62), 3);
});

test('normal frame pacing keeps the full particle effect budget', () => {
  const guard = new ParticleLoadGuard();
  const state = guard.update({ frameMs: 16, particles: 1200, capacity: 12000 });
  assert.equal(state.level, 0);
  assert.equal(state.burstScale, 1);
  assert.equal(state.trailScale, 1);
  assert.equal(state.postProcessing, true);
  assert.equal(state.renderLimit, state.softLimit);
  assert.equal(state.particleScale, 1);
});

test('a sudden particle spike engages emergency protection immediately', () => {
  const guard = new ParticleLoadGuard();
  const state = guard.update({ frameMs: 16, particles: 10800, capacity: 12000 });
  assert.equal(state.level, 3);
  assert.equal(state.changed, true);
  assert.equal(state.trailScale, 0);
  assert.equal(state.postProcessing, false);
  assert.ok(state.renderLimit < state.softLimit);
  assert.ok(state.particleScale < 0.8);
  assert.ok(state.reflectionScale < 0.3);
  assert.ok(state.resolutionScale < 0.7);
  assert.ok(state.softLimit < state.loadRatio * 12000);
  assert.ok(state.maxSpawnPerFrame < 300);
});

test('particle pressure engages before the hard ceiling is approached', () => {
  const guard = new ParticleLoadGuard();
  const state = guard.update({ frameMs: 16, particles: 7000, capacity: 12000 });
  assert.equal(state.level, 2);
  assert.equal(state.name, 'pressure');
  assert.equal(state.postProcessing, false);
  assert.ok(state.softLimit < 7000);
});

test('guarded load disables the expensive post-processing path before pressure', () => {
  const guard = new ParticleLoadGuard();
  const state = guard.update({ frameMs: 16, particles: 4400, capacity: 12000 });
  assert.equal(state.level, 1);
  assert.equal(state.postProcessing, false);
  assert.ok(state.renderLimit <= 3900);
});

test('sustained slow frames escalate only after the attack window', () => {
  const guard = new ParticleLoadGuard({ escalationFrames: 3 });
  let state;
  for (let index = 0; index < 12; index += 1) {
    state = guard.update({ frameMs: 55, particles: 800, capacity: 12000 });
    if (state.level > 0) break;
  }
  assert.ok(state.level >= 1);
  assert.ok(state.resolutionScale < 1);
});

test('recovery uses hysteresis and steps down instead of oscillating', () => {
  const guard = new ParticleLoadGuard({ recoveryFrames: 4 });
  let state = guard.update({ frameMs: 16, particles: 11000, capacity: 12000 });
  assert.equal(state.level, 3);
  for (let index = 0; index < 3; index += 1) {
    state = guard.update({ frameMs: 16, particles: 200, capacity: 12000 });
  }
  assert.equal(state.level, 3);
  state = guard.update({ frameMs: 16, particles: 200, capacity: 12000 });
  assert.equal(state.level, 2);
});

test('disabling adaptive quality still retains the hard particle safety path', () => {
  const guard = new ParticleLoadGuard({ escalationFrames: 1 });
  const slow = guard.update({ frameMs: 60, particles: 100, capacity: 12000, adaptive: false });
  assert.equal(slow.level, 0);
  const crowded = guard.update({ frameMs: 16, particles: 10300, capacity: 12000, adaptive: false });
  assert.equal(crowded.level, 3);
});

test('precomputed load engages protection before particles are spawned', () => {
  const guard = new ParticleLoadGuard();
  const predicted = guard.update({ frameMs: 16, particles: 120, capacity: 12000, forecastParticles: 9000, predictive: true });
  assert.equal(predicted.level, 3);
  assert.equal(predicted.forecastLevel, 3);
  assert.equal(predicted.forecastParticles, 9000);
  assert.ok(predicted.effectiveLoadRatio > predicted.loadRatio);
  assert.equal(predicted.admissionLevel, 1);
  assert.equal(predicted.forecastLed, true);
  assert.ok(predicted.burstScale > particleLoadProfile(3).burstScale);
  assert.ok(predicted.renderLimit > Math.floor(12000 * particleLoadProfile(3).softLimitRatio * particleLoadProfile(3).renderRatio));

  const disabled = new ParticleLoadGuard().update({ frameMs: 16, particles: 120, capacity: 12000, forecastParticles: 9000, predictive: false });
  assert.equal(disabled.level, 0);
  assert.equal(disabled.forecastLevel, 0);
});

test('profile lookup clamps unknown levels', () => {
  assert.equal(particleLoadProfile(-20).name, 'normal');
  assert.equal(particleLoadProfile(99).name, 'emergency');
});
