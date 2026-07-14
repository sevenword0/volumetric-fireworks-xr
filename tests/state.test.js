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
    show: { sensitivity: 7, density: 0, variety: -1, finale: 4 },
  });
  assert.deepEqual(state.physics, { gravity: 2, drag: 0, windX: 8, windZ: -8, vortex: 0.42 });
  assert.deepEqual(state.volume, { smoke: 1.5, buoyancy: 0, scattering: 3, shadow: 4 });
  assert.equal(state.world.waterRoughness, 1);
  assert.equal(state.world.reflection, 0);
  assert.deepEqual(state.show, { sensitivity: 1, density: 0.1, variety: 0, finale: 1 });
});

test('unknown enum values fall back instead of entering the renderer', () => {
  const state = sanitizeState({ launchLayout: 'unsafe', tool: 'laser', world: { environment: 'url', floor: 'lava' }, quality: { preset: 'ultra' } });
  assert.equal(state.launchLayout, 'single');
  assert.equal(state.tool, 'camera');
  assert.equal(state.world.environment, 'lake');
  assert.equal(state.world.floor, 'water');
  assert.equal(state.quality.preset, 'auto');
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

