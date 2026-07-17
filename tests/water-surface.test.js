import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_WATER_REFLECTION_MIP,
  MAX_WATER_WAVE_STRENGTH,
  MIN_WATER_REFLECTION_CLARITY,
  MIN_WATER_WAVE_STRENGTH,
  getWaterSurfaceProfile,
} from '../src/core/water-surface.js';

test('smooth water keeps a sharp bright reflection and calm surface', () => {
  assert.deepEqual(getWaterSurfaceProfile(0), {
    roughness: 0,
    reflectionMip: 0,
    reflectionClarity: 1,
    waveStrength: MIN_WATER_WAVE_STRENGTH,
  });
});

test('rough water uses the blurriest dimmer reflection and strongest waves', () => {
  assert.deepEqual(getWaterSurfaceProfile(1), {
    roughness: 1,
    reflectionMip: MAX_WATER_REFLECTION_MIP,
    reflectionClarity: MIN_WATER_REFLECTION_CLARITY,
    waveStrength: MAX_WATER_WAVE_STRENGTH,
  });
});

test('water response is monotonic and clamps invalid input', () => {
  const smooth = getWaterSurfaceProfile(0.2);
  const rough = getWaterSurfaceProfile(0.8);
  assert.ok(rough.reflectionMip > smooth.reflectionMip);
  assert.ok(rough.waveStrength > smooth.waveStrength);
  assert.ok(rough.reflectionClarity < smooth.reflectionClarity);
  assert.equal(getWaterSurfaceProfile(-4).roughness, 0);
  assert.equal(getWaterSurfaceProfile(8).roughness, 1);
  assert.equal(getWaterSurfaceProfile(Number.NaN).roughness, 0);
});
