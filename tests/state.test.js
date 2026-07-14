import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, createAppState, sanitizeState } from '../src/core/state.js';

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
    physics: { gravity: 20, drag: -4, windX: 99, windZ: -99, vortex: Infinity },
    volume: { smoke: 8, buoyancy: -1, scattering: 9, shadow: 10 },
    world: { waterRoughness: 8, reflection: -2 },
    quality: { bloomStrength: 9, bloomRadius: -1, bloomThreshold: 4, saturation: 8, motionBlur: -2 },
    sound: { volume: 6 },
    show: { sensitivity: 7, density: 0, variety: -1, finale: 4 },
  });
  assert.deepEqual(state.physics, { gravity: 2, drag: 0, windX: 8, windZ: -8, vortex: 0.42 });
  assert.deepEqual(state.volume, { smoke: 1.5, buoyancy: 0, scattering: 3, shadow: 4 });
  assert.equal(state.world.waterRoughness, 1);
  assert.equal(state.world.reflection, 0);
  assert.equal(state.quality.bloomStrength, 3);
  assert.equal(state.quality.bloomRadius, 0);
  assert.equal(state.quality.bloomThreshold, 2);
  assert.equal(state.quality.saturation, 2);
  assert.equal(state.quality.motionBlur, 0);
  assert.equal(state.sound.volume, 1);
  assert.deepEqual(state.show, { sensitivity: 1, density: 0.1, variety: 0, finale: 1 });
});

test('unknown enum values fall back instead of entering the renderer', () => {
  const state = sanitizeState({ launchLayout: 'unsafe', tool: 'laser', world: { environment: 'url', floor: 'lava' }, quality: { preset: 'ultra', particleBlend: 'burn' } });
  assert.equal(state.launchLayout, 'single');
  assert.equal(state.tool, 'camera');
  assert.equal(state.world.environment, 'lake');
  assert.equal(state.world.floor, 'water');
  assert.equal(state.quality.preset, 'auto');
  assert.equal(state.quality.particleBlend, 'additive');
});

test('visual effects and impact sound settings persist after sanitization', () => {
  const state = sanitizeState({
    quality: { bloom: false, bloomStrength: 1.4, bloomRadius: 0.3, bloomThreshold: 1.1, saturation: 1.6, motionBlur: 0.8, particleBlend: 'screen' },
    sound: { enabled: false, volume: 0.35 },
  });
  assert.deepEqual(state.quality, {
    preset: 'auto', bloom: false, bloomStrength: 1.4, bloomRadius: 0.3, bloomThreshold: 1.1,
    saturation: 1.6, motionBlur: 0.8, particleBlend: 'screen', shadows: true, adaptive: true,
  });
  assert.deepEqual(state.sound, { enabled: false, volume: 0.35 });
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
  const exported = JSON.parse(store.export());
  assert.equal(exported.version, 1);
  assert.equal(exported.state.tool, 'gust');
  store.reset();
  assert.deepEqual(store.state, DEFAULT_STATE);
});
