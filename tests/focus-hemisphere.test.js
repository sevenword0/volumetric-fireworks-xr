import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUS_HEMISPHERE_RADIUS,
  FOCUS_HEMISPHERE_SURFACE_SIZE,
  FOCUS_HEMISPHERE_TARGET,
  resolveFocusHemisphereDistance,
} from '../src/core/focus-hemisphere.js';

test('virtual focus hemisphere diameter matches the water surface width', () => {
  assert.equal(FOCUS_HEMISPHERE_RADIUS * 2, FOCUS_HEMISPHERE_SURFACE_SIZE);
  assert.equal(FOCUS_HEMISPHERE_TARGET, 'focusHemisphere');
});

test('focus hemisphere supplies sky depth without replacing nearer geometry', () => {
  assert.equal(resolveFocusHemisphereDistance(140, 90, 1), 90);
  assert.equal(resolveFocusHemisphereDistance(60, 90, 1), 60);
  assert.equal(resolveFocusHemisphereDistance(0, 90, 1), 90);
  assert.equal(resolveFocusHemisphereDistance(140, 90, 0), 140);
});

test('double-sided hemisphere fragments resolve to their average proxy distance', () => {
  assert.equal(resolveFocusHemisphereDistance(140, 70 + 110, 2), 90);
  assert.equal(resolveFocusHemisphereDistance(140, 45, 0.5), 115);
  assert.equal(resolveFocusHemisphereDistance(Number.NaN, 90, 1), 90);
});
