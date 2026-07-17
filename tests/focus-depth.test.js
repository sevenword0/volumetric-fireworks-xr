import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveParticleFocusDistance } from '../src/core/focus-depth.js';

test('geometry depth remains authoritative where no particle is rendered', () => {
  assert.equal(resolveParticleFocusDistance(140, 0, 0), 140);
});

test('packed translucent particle depth resolves back to camera-space distance', () => {
  assert.ok(Math.abs(resolveParticleFocusDistance(140, 70 * 0.6, 0.6) - 70) < 1e-6);
});

test('overlapping particle depth resolves to the opacity-composited focal plane', () => {
  const firstDepth = 60 * 0.5;
  const firstCoverage = 0.5;
  const packedDepth = 90 * 0.5 + firstDepth * 0.5;
  const coverage = 0.5 + firstCoverage * 0.5;
  assert.ok(Math.abs(resolveParticleFocusDistance(140, packedDepth, coverage) - 80) < 1e-6);
});
