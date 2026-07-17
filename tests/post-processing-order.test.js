import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('particle depth of field is resolved before bloom expands into sky pixels', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const depthOfField = source.indexOf('const bokehColor = bokehDepthOfField(motionColor');
  const focusedTexture = source.indexOf('const bokehTexture = convertToTexture(bokehColor)');
  const focusedBloom = source.indexOf('bokehBloomNode = bloom(bokehTexture)');
  assert.ok(depthOfField >= 0, 'missing particle depth-of-field stage');
  assert.ok(focusedTexture > depthOfField, 'depth-of-field must be materialized exactly once');
  assert.ok(focusedBloom > focusedTexture, 'focused bloom must run after particle depth-of-field');
  assert.doesNotMatch(source, /bokehDepthOfField\(composite/);
});

test('particle bokeh coverage expands beyond a guarded sprite seed in screen space', async () => {
  const postSource = await readFile(new URL('../src/core/post-effects.js', import.meta.url), 'utf8');
  const engineSource = await readFile(new URL('../src/pyro/firework-engine.js', import.meta.url), 'utf8');
  const coveragePass = postSource.indexOf('const particleBokehFocusCoverage = Fn');
  const neighboringFocus = postSource.indexOf('particleFocusTextureNode.sample(baseUV.add(texel.mul(offset)))', coveragePass);
  const focusTexture = postSource.indexOf('convertToTexture(particleBokehFocusCoverage(', neighboringFocus);
  const depthOfField = postSource.indexOf('return depthBokeh(convertToTexture(inputNode)', focusTexture);
  assert.ok(coveragePass >= 0, 'missing screen-space particle focus coverage pass');
  assert.ok(neighboringFocus > coveragePass, 'particle focus must be sampled beyond its source quad');
  assert.ok(focusTexture > neighboringFocus, 'expanded focus coverage must be materialized before depth-of-field');
  assert.ok(depthOfField > focusTexture, 'depth-of-field must consume expanded particle focus coverage');
  assert.match(engineSource, /particleBokehGeometryExpansionNode/);
  assert.match(engineSource, /shapeCircle\(guardedCircleUV\)/);
  assert.match(engineSource, /material\.scaleNode = instancedBufferAttribute\(this\.scaleAttribute\)\.mul\(this\.particleBokehGeometryExpansionNode\);/);
});
