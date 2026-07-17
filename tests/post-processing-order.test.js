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
