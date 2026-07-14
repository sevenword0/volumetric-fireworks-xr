import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIREWORK_PRESETS,
  LAUNCH_LAYOUTS,
  PALETTES,
  PATTERN_OPTIONS,
  PRESET_BY_ID,
  createCustomPreset,
} from '../src/pyro/presets.js';

test('ships 36 distinct researched presets', () => {
  assert.equal(FIREWORK_PRESETS.length, 36);
  assert.equal(new Set(FIREWORK_PRESETS.map((preset) => preset.id)).size, 36);
  assert.equal(new Set(FIREWORK_PRESETS.map((preset) => preset.name)).size, 36);
});

test('preset lookup contains every preset', () => {
  assert.equal(PRESET_BY_ID.size, FIREWORK_PRESETS.length);
  for (const preset of FIREWORK_PRESETS) assert.equal(PRESET_BY_ID.get(preset.id), preset);
});

test('presets cover all six show families', () => {
  assert.deepEqual(
    [...new Set(FIREWORK_PRESETS.map((preset) => preset.category))].sort(),
    ['art', 'cascade', 'ground', 'shape', 'shell', 'split'],
  );
});

test('all preset physics values are finite and usable', () => {
  for (const preset of FIREWORK_PRESETS) {
    for (const key of ['count', 'burstSpeed', 'life', 'size', 'drag', 'gravityScale', 'trail', 'trailRate', 'smoke', 'light', 'launchVelocity', 'fuse']) {
      assert.ok(Number.isFinite(preset[key]), `${preset.id}.${key}`);
    }
    assert.ok(preset.count > 0);
    assert.ok(preset.life > 0);
    assert.ok(preset.colors.length > 0);
  }
});

test('all colors are browser-safe hex colors', () => {
  for (const colors of Object.values(PALETTES)) {
    assert.ok(colors.length >= 3);
    for (const color of colors) assert.match(color, /^#[0-9a-f]{6}$/i);
  }
});

test('composer exposes at least eighteen shell geometries', () => {
  assert.ok(PATTERN_OPTIONS.length >= 18);
  assert.equal(new Set(PATTERN_OPTIONS.map(([value]) => value)).size, PATTERN_OPTIONS.length);
});

test('launch layouts have expected salvo sizes', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(LAUNCH_LAYOUTS).map(([name, entries]) => [name, entries.length])),
    { single: 1, pair: 2, fan5: 5, arc7: 7, horizon9: 9, circle8: 8, finale: 13 },
  );
});

test('every launch placement is finite and non-negative in time', () => {
  for (const entries of Object.values(LAUNCH_LAYOUTS)) {
    for (const entry of entries) {
      for (const key of ['x', 'z', 'delay', 'yaw']) assert.ok(Number.isFinite(entry[key]));
      assert.ok(entry.delay >= 0);
    }
  }
});

test('custom shell composition maps controls to simulation parameters', () => {
  const custom = createCustomPreset({
    name: 'Test Heart', pattern: 'heart', star: 'crackle', pistil: 'double', palette: 'ruby',
    count: 260, burstScale: 1.4, life: 4.2, trail: 0.8, strobe: true, split: true, colorShift: false,
  });
  assert.equal(custom.name, 'Test Heart');
  assert.equal(custom.pattern, 'heart');
  assert.equal(custom.star, 'crackle');
  assert.equal(custom.pistil, 'double');
  assert.equal(custom.count, 260);
  assert.equal(custom.burstSpeed, 18.2);
  assert.equal(custom.strobe, 0.76);
  assert.equal(custom.split, 4);
  assert.equal(custom.colorShift, false);
  assert.deepEqual(custom.colors, PALETTES.ruby);
});

