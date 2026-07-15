import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { FireworkEngine } from '../src/pyro/firework-engine.js';
import { FIREWORK_PRESETS } from '../src/pyro/presets.js';

function createEngine(maxParticles = 1000) {
  const scene = { add() {}, remove() {} };
  const state = {
    quality: { particleBlend: 'additive' },
    physics: { gravity: 1, drag: 0.08, windX: 0, windZ: 0, vortex: 0 },
  };
  return new FireworkEngine(scene, state, { maxParticles });
}

test('burst creation never exceeds the current one-frame admission budget', () => {
  const engine = createEngine();
  engine.setLoadBudget({
    level: 3,
    name: 'emergency',
    softLimit: 560,
    maxSpawnPerFrame: 22,
    burstScale: 0.4,
    trailScale: 0,
    smokeStride: 6,
    cullPerFrame: 40,
  });
  const created = engine.burst(FIREWORK_PRESETS[0], new THREE.Vector3());
  assert.equal(created, 22);
  assert.equal(engine.activeCount, 22);
  engine.dispose();
});

test('load shedding removes transient trails without deleting core stars', () => {
  const engine = createEngine();
  engine.setLoadBudget({ softLimit: 1000, maxSpawnPerFrame: 1000, burstScale: 0.06, trailScale: 1, smokeStride: 1, cullPerFrame: 0 });
  const stars = engine.burst(FIREWORK_PRESETS[0], new THREE.Vector3());
  const source = engine.particles[0];
  for (let index = 0; index < 40; index += 1) engine.spawnEmber(source);
  assert.equal(engine.activeCount, stars + 40);

  engine.setLoadBudget({ softLimit: stars, maxSpawnPerFrame: 100, burstScale: 0.4, trailScale: 0, smokeStride: 6, cullPerFrame: 15 });
  assert.equal(engine.shedTransientLoad(), 15);
  assert.equal(engine.activeCount, stars + 25);
  engine.shedTransientLoad();
  engine.shedTransientLoad();
  assert.equal(engine.activeCount, stars);
  engine.dispose();
});

test('emergency shedding can retire already-visible stars to recover quickly', () => {
  const engine = createEngine();
  engine.setLoadBudget({ softLimit: 1000, maxSpawnPerFrame: 1000, burstScale: 0.4, trailScale: 0, smokeStride: 1, cullPerFrame: 0 });
  const stars = engine.burst(FIREWORK_PRESETS[0], new THREE.Vector3());
  for (const particle of engine.particles) particle.age = 0.5;
  engine.setLoadBudget({ level: 3, softLimit: 20, maxSpawnPerFrame: 20, burstScale: 0.28, trailScale: 0, smokeStride: 6, cullPerFrame: 25 });
  assert.equal(engine.shedTransientLoad(), 25);
  assert.equal(engine.activeCount, stars - 25);
  engine.dispose();
});

test('global brightness scales particle HDR output and clamps unsafe values', () => {
  const engine = createEngine();
  engine.setLoadBudget({ softLimit: 1000, maxSpawnPerFrame: 1000, burstScale: 0.08, trailScale: 1, smokeStride: 1, cullPerFrame: 0 });
  engine.burst(FIREWORK_PRESETS[0], new THREE.Vector3());
  engine.setGlobalBrightness(1);
  engine.updateAttributes();
  const full = engine.colorArray[0];
  engine.setGlobalBrightness(0.5);
  engine.updateAttributes();
  assert.ok(Math.abs(engine.colorArray[0] - full * 0.5) < 1e-6);
  assert.equal(engine.setGlobalBrightness(99), 3);
  assert.equal(engine.setGlobalBrightness(0), 0.1);
  engine.dispose();
});
