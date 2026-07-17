import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBokehGamma,
  particleBokehCoverageReach,
  particleBokehGeometryScale,
  particleBokehRadiusPixels,
  particleBokehSpriteScale,
} from '../src/core/bokeh-response.js';

test('neutral bokeh gamma preserves the sampled color', () => {
  assert.equal(applyBokehGamma(0.25, 1), 0.25);
  assert.equal(applyBokehGamma(2, 1), 2);
});

test('bokeh gamma controls positive bokeh-highlight midtone response', () => {
  assert.equal(applyBokehGamma(0.25, 0.5), 0.0625);
  assert.equal(applyBokehGamma(0.25, 2), 0.5);
});

test('bokeh gamma clamps unsafe inputs and never creates negative light', () => {
  assert.equal(applyBokehGamma(-2, 1), 0);
  assert.equal(applyBokehGamma(0.25, -10), 0.0625);
  assert.ok(Math.abs(applyBokehGamma(0.25, 10) - Math.pow(0.25, 0.4)) < 1e-12);
  assert.equal(applyBokehGamma(Number.NaN, Number.NaN), 0);
});

test('particle bokeh exposes its complete screen-space radius', () => {
  assert.equal(particleBokehRadiusPixels(0, 2, true), 0);
  assert.equal(particleBokehRadiusPixels(1, 2, true), 22);
  assert.equal(particleBokehRadiusPixels(1, 2, false), 0);
});

test('particle bokeh seed has transparent geometry guard space around its visible disc', () => {
  assert.equal(particleBokehSpriteScale(1, 2, true), 13);
  assert.ok(Math.abs(particleBokehGeometryScale(1, 2, true) - 17.2) < 1e-12);
  assert.equal(particleBokehGeometryScale(1, 2, false), 1);
});

test('particle focus coverage reaches the full bokeh edge beyond the source quad', () => {
  assert.equal(particleBokehCoverageReach(1, 2, 0), 1);
  assert.equal(particleBokehCoverageReach(1, 2, 22), 1);
  assert.equal(particleBokehCoverageReach(1, 2, 22.5), 0.5);
  assert.equal(particleBokehCoverageReach(1, 2, 23), 0);
});
