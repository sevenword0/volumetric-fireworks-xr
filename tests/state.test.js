import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, createAppState, resolveInitialLaunchPower, sanitizeState } from '../src/core/state.js';

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    read: () => value,
  };
}

test('empty input produces complete defaults', () => {
  assert.deepEqual(sanitizeState(), DEFAULT_STATE);
});

test('numeric state is clamped to safe simulation ranges', () => {
  const state = sanitizeState({
    camera: { fov: 999 },
    launch: { centerX: 999, positionRange: 99, initialPower: 99 },
    physics: { gravity: 20, drag: 99, particleLifetime: 99, ringParticleScale: 99, windX: 99, windZ: -99, vortex: Infinity },
    volume: { smoke: 8, buoyancy: -1, scattering: 9, shadow: 10 },
    world: { waterRoughness: 8, reflection: -2 },
    quality: { fireworkBrightness: 9, bloomStrength: 9, bloomRadius: -1, bloomThreshold: 4, saturation: 8, motionBlur: -2, focusDistance: -8, focusRange: 999, bokehScale: 9, bokehSamples: 99, bokehGamma: 99 },
    sound: { volume: 6 },
    show: {
      musicVolume: 8,
      sensitivity: 7,
      density: 0,
      variety: -1,
      finale: 4,
      launchPower: 9,
      explosionPower: -2,
      positionSpread: 8,
      sequence: -1,
      crossfire: 7,
      colorVariation: -4,
    },
  });
  assert.deepEqual(state.camera, { fov: 110 });
  assert.deepEqual(sanitizeState({ camera: { fov: -10 } }).camera, { fov: 20 });
  assert.deepEqual(state.launch, { centerX: 40, positionRange: 2.5, initialPower: 2 });
  assert.deepEqual(sanitizeState({ launch: { centerX: -999, positionRange: -4, initialPower: -4 } }).launch, { centerX: -40, positionRange: 0.1, initialPower: 0.5 });
  assert.deepEqual(state.physics, { gravity: 2, drag: 4.25, particleLifetime: 5, ringParticleScale: 3, windX: 8, windZ: -8, vortex: 0.42 });
  assert.deepEqual(sanitizeState({ physics: { drag: -4, particleLifetime: -4, ringParticleScale: -4 } }).physics, {
    gravity: 1, drag: 0, particleLifetime: 0.25, ringParticleScale: 0.25, windX: 1.6, windZ: 0.3, vortex: 0.42,
  });
  assert.deepEqual(state.volume, { smoke: 1.5, buoyancy: 0, scattering: 3, shadow: 4 });
  assert.equal(state.world.waterRoughness, 1);
  assert.equal(state.world.reflection, 0);
  assert.equal(state.quality.fireworkBrightness, 3);
  assert.equal(state.quality.bloomStrength, 3);
  assert.equal(state.quality.bloomRadius, 0);
  assert.equal(state.quality.bloomThreshold, 2);
  assert.equal(state.quality.saturation, 2);
  assert.equal(state.quality.motionBlur, 0);
  assert.equal(state.quality.focusDistance, 2);
  assert.equal(state.quality.focusRange, 160);
  assert.equal(state.quality.bokehScale, 2);
  assert.equal(state.quality.bokehSamples, 25);
  assert.equal(state.quality.bokehGamma, 2.5);
  assert.equal(sanitizeState({ quality: { bokehGamma: -10 } }).quality.bokehGamma, 0.5);
  assert.equal(state.sound.volume, 1);
  assert.deepEqual(state.show, {
    musicVolume: 1,
    sensitivity: 1,
    density: 0.1,
    variety: 0,
    finale: 1,
    choreographyPreset: 'balanced',
    directionMode: 'music',
    launchPower: 1.6,
    explosionPower: 0.5,
    positionSpread: 1.5,
    sequence: 0,
    crossfire: 1,
    colorVariation: 0,
  });
});

test('manual launch center, range, and global initial power persist', () => {
  assert.deepEqual(sanitizeState({ launch: { centerX: -18.5, positionRange: 2.25, initialPower: 1.65 } }).launch, {
    centerX: -18.5,
    positionRange: 2.25,
    initialPower: 1.65,
  });
});

test('global initial power composes with preset power and clamps the effective value', () => {
  assert.ok(Math.abs(resolveInitialLaunchPower(1.2, 1.5) - 1.8) < 1e-9);
  assert.equal(resolveInitialLaunchPower(3, 2), 2.4);
  assert.equal(resolveInitialLaunchPower(0.1, 0.5), 0.25);
});

test('camera field of view persists', () => {
  assert.deepEqual(sanitizeState({ camera: { fov: 73 } }).camera, { fov: 73 });
});

test('floor grid visibility persists independently from the floor material', () => {
  assert.equal(sanitizeState({ world: { floor: 'none', floorGrid: false } }).world.floorGrid, false);
  assert.equal(sanitizeState({ world: { floor: 'none', floorGrid: true } }).world.floorGrid, true);
  assert.equal(sanitizeState({ world: { floor: 'matte' } }).world.floorGrid, true);
});

test('global ring particle amount persists', () => {
  assert.equal(sanitizeState({ physics: { ringParticleScale: 2.35 } }).physics.ringParticleScale, 2.35);
});

test('unknown enum values fall back instead of entering the renderer', () => {
  const state = sanitizeState({ launchLayout: 'unsafe', tool: 'laser', world: { environment: 'url', floor: 'lava' }, quality: { preset: 'ultra', particleBlend: 'burn' }, show: { choreographyPreset: 'unsafe', directionMode: 'backward' } });
  assert.equal(state.launchLayout, 'single');
  assert.equal(state.tool, 'camera');
  assert.equal(state.world.environment, 'lake');
  assert.equal(state.world.floor, 'water');
  assert.equal(state.quality.preset, 'auto');
  assert.equal(state.quality.particleBlend, 'additive');
  assert.equal(state.show.choreographyPreset, 'balanced');
  assert.equal(state.show.directionMode, 'music');
});

test('music choreography settings persist with custom direction and strengths', () => {
  const state = sanitizeState({
    show: {
      choreographyPreset: 'custom',
      directionMode: 'cross',
      launchPower: 1.32,
      explosionPower: 1.18,
      positionSpread: 1.2,
      sequence: 0.76,
      crossfire: 0.9,
      colorVariation: 0.82,
    },
  });
  assert.equal(state.show.choreographyPreset, 'custom');
  assert.equal(state.show.directionMode, 'cross');
  assert.equal(state.show.launchPower, 1.32);
  assert.equal(state.show.explosionPower, 1.18);
  assert.equal(state.show.positionSpread, 1.2);
  assert.equal(state.show.sequence, 0.76);
  assert.equal(state.show.crossfire, 0.9);
  assert.equal(state.show.colorVariation, 0.82);
});

test('a saved choreography preset restores its own missing control defaults', () => {
  const state = sanitizeState({ show: { choreographyPreset: 'beat-chase' } });
  assert.equal(state.show.directionMode, 'alternate');
  assert.equal(state.show.launchPower, 1.14);
  assert.equal(state.show.explosionPower, 0.94);
  assert.equal(state.show.sequence, 0.84);
});

test('visual effects and impact sound settings persist after sanitization', () => {
  const state = sanitizeState({
    quality: { fireworkBrightness: 1.8, bloom: false, bloomStrength: 1.4, bloomRadius: 0.3, bloomThreshold: 1.1, saturation: 1.6, motionBlur: 0.8, depthOfField: false, focusDistance: 94, focusRange: 18, bokehScale: 1.2, bokehSamples: 21, bokehGamma: 1.75, particleBlend: 'screen', predictiveLoad: false, autoTargets: { particles: false, resolution: false, volume: false, lighting: false, postProcessing: false } },
    sound: { enabled: false, volume: 0.35 },
    show: { musicVolume: 0.42 },
  });
  assert.deepEqual(state.quality, {
    preset: 'auto', fireworkBrightness: 1.8, bloom: false, bloomStrength: 1.4, bloomRadius: 0.3, bloomThreshold: 1.1,
    saturation: 1.6, motionBlur: 0.8, depthOfField: false, focusDistance: 94, focusRange: 18, bokehScale: 1.2, bokehSamples: 21, bokehGamma: 1.75,
    particleBlend: 'screen', shadows: true, adaptive: true, predictiveLoad: false,
    autoTargets: { particles: false, resolution: false, volume: false, lighting: false, postProcessing: false },
  });
  assert.deepEqual(state.sound, { enabled: false, volume: 0.35 });
  assert.equal(state.show.musicVolume, 0.42);
});

test('saved state is loaded and sanitized', () => {
  const storage = memoryStorage(JSON.stringify({ physics: { gravity: 1.5 }, launchLayout: 'fan5', tool: 'vortex' }));
  const store = createAppState(storage);
  assert.equal(store.state.physics.gravity, 1.5);
  assert.equal(store.state.launchLayout, 'fan5');
  assert.equal(store.state.tool, 'vortex');
});

test('malformed storage falls back without throwing', () => {
  assert.deepEqual(createAppState(memoryStorage('{oops')).state, DEFAULT_STATE);
});

test('set notifies subscribers and persists sanitized state', () => {
  const storage = memoryStorage();
  const store = createAppState(storage);
  const events = [];
  const unsubscribe = store.subscribe((event) => events.push(event));
  store.set('physics.gravity', 99);
  unsubscribe();
  assert.equal(store.state.physics.gravity, 2);
  assert.equal(events.length, 1);
  assert.equal(events[0].path, 'physics.gravity');
  assert.equal(JSON.parse(storage.read()).physics.gravity, 2);
});

test('export is versioned and reset restores defaults', () => {
  const store = createAppState(memoryStorage());
  store.set('tool', 'gust');
  store.set('world.floorGrid', false);
  const exported = JSON.parse(store.export());
  assert.equal(exported.version, 1);
  assert.equal(exported.state.tool, 'gust');
  assert.equal(exported.state.world.floorGrid, false);
  store.reset();
  assert.deepEqual(store.state, DEFAULT_STATE);
});
