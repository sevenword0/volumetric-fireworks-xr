import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { FireworkEngine } from '../src/pyro/firework-engine.js';
import { FIREWORK_PRESETS } from '../src/pyro/presets.js';

function createEngine(maxParticles = 1000) {
  const scene = { add() {}, remove() {} };
  const state = {
    quality: { particleBlend: 'additive' },
    physics: { gravity: 1, drag: 0.08, particleLifetime: 1, windX: 0, windZ: 0, vortex: 0 },
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

test('particle-owned focus uniforms update independently of floor geometry', () => {
  const engine = createEngine();
  assert.deepEqual(engine.setFocusEffect({ active: true, distance: 92, range: 18, scale: 1.4 }), {
    active: true,
    distance: 92,
    range: 18,
    scale: 1.4,
  });
  assert.deepEqual(engine.setFocusEffect({ active: false, distance: -5, range: 0, scale: -1 }), {
    active: false,
    distance: 0.001,
    range: 0.001,
    scale: 0,
  });
  engine.dispose();
});

test('music choreography reaches shell velocity, burst scale, mirrored salvos, and hue variation', () => {
  const engine = createEngine(1000);
  const preset = FIREWORK_PRESETS[0];
  const launchCount = engine.launchLayout(preset, 'pair', {
    x: -12,
    yaw: 0.62,
    launchPower: 1.35,
    explosionPower: 1.3,
    sequenceDelay: 0.09,
    crossLaunch: true,
    colorHue: 0.22,
    colorVariation: 0.8,
  });
  assert.equal(launchCount, 4);
  assert.equal(engine.scheduled.length, 4);
  assert.ok(engine.scheduled[0].x < 0);
  assert.ok(engine.scheduled.some((item) => item.x > 0 && item.yaw < 0));
  assert.ok(engine.scheduled[2].at > engine.scheduled[0].at);

  engine.launchNow(preset, {
    launchPower: 1.35,
    explosionPower: 1.3,
    colorHue: 0.22,
    colorVariation: 0.8,
  });
  const shell = engine.particles.find((particle) => particle.preset === preset);
  assert.ok(shell.velocity.y > preset.launchVelocity * 1.2);
  assert.equal(shell.burstScale, 1.3);
  assert.ok(shell.life > shell.fuse);
  assert.equal(shell.colorHue, 0.22);
  assert.equal(shell.colorVariation, 0.8);
  engine.dispose();

  const baseEngine = createEngine(128);
  const hueEngine = createEngine(128);
  baseEngine.setLoadBudget({ softLimit: 128, maxSpawnPerFrame: 128, burstScale: 0.08, trailScale: 0, smokeStride: 1 });
  hueEngine.setLoadBudget({ softLimit: 128, maxSpawnPerFrame: 128, burstScale: 0.08, trailScale: 0, smokeStride: 1 });
  baseEngine.burst(preset, new THREE.Vector3(), undefined, 1, 0, { colorHue: 0, colorVariation: 0 });
  hueEngine.burst(preset, new THREE.Vector3(), undefined, 1, 0, { colorHue: 0.25, colorVariation: 1 });
  assert.notEqual(baseEngine.particles[0].color.getHex(), hueEngine.particles[0].color.getHex());
  assert.equal(hueEngine.particles[0].colorShift, true);
  baseEngine.dispose();
  hueEngine.dispose();
});

test('manual launch center and position range move and scale layout placements', () => {
  const engine = createEngine(128);
  const count = engine.launchLayout(FIREWORK_PRESETS[0], 'pair', { x: 12, spread: 2 });
  assert.equal(count, 2);
  assert.deepEqual(engine.scheduled.map((item) => item.x), [-4, 28]);
  assert.ok(engine.scheduled.every((item) => item.z === 0));
  engine.dispose();
});

test('scaled music shells keep enough lifetime to reach their burst event', () => {
  const engine = createEngine(1000);
  const preset = FIREWORK_PRESETS[0];
  engine.setLoadBudget({ softLimit: 1000, maxSpawnPerFrame: 1000, burstScale: 0.2, trailScale: 0, smokeStride: 1 });
  let burstEvents = 0;
  engine.addEventListener('burst', () => { burstEvents += 1; });
  engine.launchNow(preset, { scale: 1.28, launchPower: 1.45, explosionPower: 1.2, colorHue: 0.2, colorVariation: 0.8 });
  for (let frame = 0; frame < 210; frame += 1) engine.update(1 / 60);
  assert.equal(burstEvents, 1);
  assert.ok(engine.particles.some((particle) => particle.preset === preset && particle.fuse === Infinity));
  engine.dispose();
});

test('global post-burst lifetime scales explosion particles but not the shell or its trail', () => {
  const preset = FIREWORK_PRESETS[0];
  const normal = createEngine(512);
  const long = createEngine(512);
  long.state.physics.particleLifetime = 3;
  const budget = { softLimit: 512, maxSpawnPerFrame: 512, burstScale: 0.12, trailScale: 1, smokeStride: 1 };
  normal.setLoadBudget(budget);
  long.setLoadBudget(budget);

  normal.launchNow(preset);
  long.launchNow(preset);
  const normalShell = normal.particles[0];
  const longShell = long.particles[0];
  assert.equal(longShell.life, normalShell.life);
  normal.spawnEmber(normalShell);
  long.spawnEmber(longShell);
  assert.equal(long.particles.at(-1).life, normal.particles.at(-1).life);

  normal.clear();
  long.clear();
  normal.burst(preset, new THREE.Vector3());
  long.burst(preset, new THREE.Vector3());
  assert.ok(Math.abs(long.particles[0].life - normal.particles[0].life * 3) < 1e-9);
  const existingLife = normal.particles[0].life;
  normal.setPostBurstLifetimeScale(2);
  assert.ok(Math.abs(normal.particles[0].life - existingLife * 2) < 1e-9);
  normal.dispose();
  long.dispose();
});

test('global ring particle amount changes ring requests without affecting peony requests', () => {
  const engine = createEngine(1200);
  engine.state.physics.ringParticleScale = 2;
  engine.setLoadBudget({ softLimit: 1200, maxSpawnPerFrame: 1200, burstScale: 1, trailScale: 1, renderLimit: 1200 });
  const details = [];
  engine.addEventListener('burst', (event) => details.push(event.detail));
  const ring = FIREWORK_PRESETS.find((preset) => preset.id === 'rainbow-ring');
  const peony = FIREWORK_PRESETS.find((preset) => preset.id === 'blue-peony');

  engine.burst(ring, new THREE.Vector3(0, 20, 0));
  engine.burst(peony, new THREE.Vector3(0, 20, 0));

  assert.equal(details[0].requestedCount, ring.count * 2);
  assert.equal(details[0].ringRequestedCount, ring.count * 2);
  assert.equal(details[0].ringParticleScale, 2);
  assert.equal(details[1].requestedCount, peony.count);
  assert.equal(details[1].ringRequestedCount, 0);
  engine.dispose();
});

test('particle motion vectors retain the exact previous simulated position', () => {
  const engine = createEngine(32);
  engine.setLoadBudget({ softLimit: 32, maxSpawnPerFrame: 32, renderLimit: 32 });
  const particle = engine.acquire();
  particle.position.set(1, 12, -3);
  particle.velocity.set(9, 0, 0);
  particle.life = 4;
  particle.size = 0.2;
  particle.color.set(0xffffff);
  particle.colorNext.set(0xffffff);
  engine.update(1 / 60);
  assert.equal(engine.previousPositionArray[0], 1);
  assert.equal(engine.previousPositionArray[1], 12);
  assert.equal(engine.previousPositionArray[2], -3);
  assert.ok(engine.positionArray[0] > engine.previousPositionArray[0]);
  assert.equal(engine.performanceDiagnostics.motionVectorParticles, 1);
  engine.dispose();
});

test('render LOD keeps core particles and caps GPU instances without deleting simulation state', () => {
  const engine = createEngine();
  engine.setLoadBudget({
    softLimit: 1000,
    maxSpawnPerFrame: 1000,
    burstScale: 0.3,
    trailScale: 1,
    smokeStride: 1,
    cullPerFrame: 0,
    renderLimit: 24,
    particleScale: 0.8,
  });
  engine.burst(FIREWORK_PRESETS[0], new THREE.Vector3());
  const activeBefore = engine.activeCount;
  assert.ok(activeBefore > 24);
  engine.updateAttributes();
  assert.equal(engine.renderedCount, 24);
  assert.equal(engine.sprite.count, 24);
  assert.equal(engine.activeCount, activeBefore);
  assert.ok(engine.scaleArray[0] > 0);
  engine.dispose();
});

test('delayed invisible stars do not consume the GPU instance budget', () => {
  const engine = createEngine();
  engine.setLoadBudget({ softLimit: 1000, maxSpawnPerFrame: 1000, burstScale: 0.2, renderLimit: 1000 });
  engine.burst(FIREWORK_PRESETS[0], new THREE.Vector3());
  for (const particle of engine.particles) particle.age = -0.2;
  engine.updateAttributes();
  assert.equal(engine.renderedCount, 0);
  assert.equal(engine.sprite.count, 0);
  engine.dispose();
});

test('same-frame particle spikes receive an immediate render cap before the next guard sample', () => {
  const engine = createEngine(1000);
  engine.setLoadBudget({ softLimit: 1000, maxSpawnPerFrame: 1000, renderLimit: 1000, particleScale: 1 });
  for (let index = 0; index < 500; index += 1) engine.acquire();
  engine.updateAttributes();
  assert.equal(engine.activeCount, 500);
  assert.equal(engine.renderLimit, 300);
  assert.equal(engine.renderedCount, 300);
  engine.dispose();
});

test('disabled particle optimization preserves normal LOD until the emergency hard cap', () => {
  const engine = createEngine(1000);
  engine.setLoadBudget({
    softLimit: 800,
    maxSpawnPerFrame: 1000,
    renderLimit: 800,
    particleScale: 1,
    particleOptimization: false,
  });
  for (let index = 0; index < 500; index += 1) engine.acquire();
  engine.updateAttributes();
  assert.equal(engine.renderedCount, 500);
  assert.equal(engine.renderLimit, 800);

  for (let index = 0; index < 150; index += 1) engine.acquire({ essential: true });
  engine.updateAttributes();
  assert.equal(engine.activeCount, 650);
  assert.ok(engine.renderedCount < 650);
  assert.equal(engine.renderLimit, 176);
  engine.dispose();
});

test('particle capacity is prewarmed so a full show does not allocate during bursts or trails', () => {
  const engine = createEngine(512);
  assert.equal(engine.performanceDiagnostics.allocatedParticles, 512);
  assert.equal(engine.performanceDiagnostics.pooledParticles, 512);
  engine.setLoadBudget({ softLimit: 512, maxSpawnPerFrame: 512, burstScale: 1, trailScale: 1, renderLimit: 512 });
  engine.burst(FIREWORK_PRESETS[0], new THREE.Vector3());
  for (let frame = 0; frame < 12; frame += 1) engine.update(1 / 60);
  assert.equal(engine.performanceDiagnostics.poolMisses, 0);
  assert.equal(engine.performanceDiagnostics.allocatedParticles, 512);
  engine.dispose();
});
