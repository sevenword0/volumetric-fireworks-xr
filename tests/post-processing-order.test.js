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

test('particle bokeh radius is driven by camera-space particle depth instead of a water footprint', async () => {
  const source = await readFile(new URL('../src/pyro/firework-engine.js', import.meta.url), 'utf8');
  const viewDistance = source.indexOf('const particleViewDistance = modelViewMatrix');
  const focusError = source.indexOf('particleViewDistance.sub(this.focusDistanceNode)', viewDistance);
  const expansion = source.indexOf('this.particleBokehExpansionNode = circleOfConfusion', focusError);
  const spriteScale = source.indexOf('material.scaleNode = instancedBufferAttribute(this.scaleAttribute).mul(this.particleBokehExpansionNode)', expansion);
  assert.ok(viewDistance >= 0, 'missing camera-space particle distance');
  assert.ok(focusError > viewDistance, 'particle distance must drive the focal error');
  assert.ok(expansion > focusError, 'missing particle-owned bokeh radius');
  assert.ok(spriteScale > expansion, 'particle sprite must receive the bokeh radius');
});
