import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BURST_DIRECTION_STRIDE,
  createSplitDirections,
  generateBurstDirections,
  hashString,
  mulberry32,
  writeBurstDirections,
} from '../src/pyro/patterns.js';

const PATTERNS = [
  'peony', 'chrysanthemum', 'dahlia', 'ring', 'doubleRing', 'saturn', 'palm', 'willow',
  'horsetail', 'spider', 'crossette', 'heart', 'star', 'smiley', 'butterfly', 'spiral',
  'helix', 'galaxy', 'mine', 'cometFan', 'romanCandle', 'waterfall',
];

function makePreset(pattern) {
  return { id: `test-${pattern}`, pattern, count: 96, ghost: false };
}

test('seeded random generator is deterministic and bounded', () => {
  const left = mulberry32(1234);
  const right = mulberry32(1234);
  for (let index = 0; index < 30; index += 1) {
    const value = left();
    assert.equal(value, right());
    assert.ok(value >= 0 && value < 1);
  }
});

test('string hash is stable and discriminates normal ids', () => {
  assert.equal(hashString('gold-chrysanthemum'), hashString('gold-chrysanthemum'));
  assert.notEqual(hashString('gold-chrysanthemum'), hashString('blue-peony'));
});

test('every supported geometry returns normalized finite vectors', () => {
  for (const pattern of PATTERNS) {
    const directions = generateBurstDirections(makePreset(pattern), 96, 8128);
    assert.equal(directions.length, 96, pattern);
    for (const direction of directions) {
      const length = Math.hypot(direction.x, direction.y, direction.z);
      assert.ok(Number.isFinite(length), pattern);
      assert.ok(Math.abs(length - 1) < 1e-9, `${pattern}: ${length}`);
      assert.ok(direction.speedScale > 0);
      assert.ok(direction.colorT >= 0 && direction.colorT <= 1);
    }
  }
});

test('same pattern and seed produces byte-for-byte repeatable descriptors', () => {
  assert.deepEqual(
    generateBurstDirections(makePreset('galaxy'), 64, 99),
    generateBurstDirections(makePreset('galaxy'), 64, 99),
  );
});

test('packed burst directions match the public descriptor API without per-star objects', () => {
  const preset = makePreset('chrysanthemum');
  const descriptors = generateBurstDirections(preset, 64, 321);
  const packed = new Float64Array(descriptors.length * BURST_DIRECTION_STRIDE);
  assert.equal(writeBurstDirections(preset, descriptors.length, 321, packed), descriptors.length);
  for (let index = 0; index < descriptors.length; index += 1) {
    const offset = index * BURST_DIRECTION_STRIDE;
    assert.deepEqual(Array.from(packed.slice(offset, offset + BURST_DIRECTION_STRIDE)), [
      descriptors[index].x,
      descriptors[index].y,
      descriptors[index].z,
      descriptors[index].speedScale,
      descriptors[index].colorT,
      descriptors[index].delay,
      descriptors[index].phase,
      descriptors[index].seed,
    ]);
  }
});

test('ring, heart, and star stay close to their design plane', () => {
  for (const pattern of ['ring', 'heart', 'star']) {
    const directions = generateBurstDirections(makePreset(pattern), 180, 44);
    assert.ok(Math.max(...directions.map((direction) => Math.abs(direction.z))) < 0.1, pattern);
  }
});

test('waterfall points downward while mines launch upward', () => {
  const waterfall = generateBurstDirections(makePreset('waterfall'), 120, 2);
  const mine = generateBurstDirections(makePreset('mine'), 120, 2);
  assert.ok(waterfall.every((direction) => direction.y < 0));
  assert.ok(mine.every((direction) => direction.y > 0));
});

test('roman candle descriptors receive sequential delays', () => {
  const directions = generateBurstDirections(makePreset('romanCandle'), 8, 18);
  assert.deepEqual(directions.map((direction) => direction.delay), [0, 0.18, 0.36, 0.54, 0.72, 0.8999999999999999, 1.08, 1.26]);
});

test('split directions respect requested count and are deterministic', () => {
  const velocity = { x: 5, y: 12, z: -3 };
  const first = createSplitDirections(velocity, 6, 123);
  const second = createSplitDirections(velocity, 6, 123);
  assert.equal(first.length, 6);
  assert.deepEqual(first, second);
  assert.ok(first.every((direction) => Math.hypot(direction.x, direction.y, direction.z) > 0));
});

test('split always creates at least two children', () => {
  assert.equal(createSplitDirections({ x: 0, y: 1, z: 0 }, 0, 1).length, 2);
});
