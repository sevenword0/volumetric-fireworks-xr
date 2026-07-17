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

test('a water-sized colorless hemisphere supplies focus depth across the sky', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const worldSource = await readFile(new URL('../src/scene/world.js', import.meta.url), 'utf8');
  const hemispherePass = mainSource.indexOf('new THREE.RenderTarget(1, 1');
  const hemisphereTarget = mainSource.indexOf('texture(focusHemisphereRenderTarget.texture)', hemispherePass);
  const particleTarget = mainSource.indexOf('scenePass.getTextureNode(PARTICLE_FOCUS_TARGET)', hemisphereTarget);
  const bokehCall = mainSource.indexOf('bokehDepthOfField(motionColor, scenePass.getViewZNode(), focusHemisphereTexture, particleFocusTexture', particleTarget);
  assert.ok(hemispherePass >= 0, 'missing isolated focus hemisphere render target');
  assert.ok(hemisphereTarget > hemispherePass, 'missing focus hemisphere texture');
  assert.ok(particleTarget > hemisphereTarget, 'particle and hemisphere depths must remain independent');
  assert.ok(bokehCall > particleTarget, 'depth-of-field must consume both focus targets');
  assert.match(mainSource, /format: THREE\.RGFormat/);
  assert.match(mainSource, /sceneVelocityTexture\.value\.format = THREE\.RGFormat/);
  assert.match(mainSource, /renderer\.render\(world\.focusScene, camera\)/);
  assert.match(mainSource, /renderer\.setViewport\(savedFocusViewport\)/);
  assert.match(worldSource, /new THREE\.SphereGeometry\([\s\S]*Math\.PI \/ 2/);
  assert.match(worldSource, /this\.focusScene = new THREE\.Scene\(\)/);
  assert.match(worldSource, /material\.outputNode = vec4\(positionView\.z\.negate\(\), 1, 0, 1\)/);
  assert.match(worldSource, /material\.blending = THREE\.AdditiveBlending/);
  assert.match(worldSource, /this\.focusScene\.add\(hemisphere\)/);
  assert.doesNotMatch(mainSource, /scenePass\.getTextureNode\(FOCUS_HEMISPHERE_TARGET\)/);
  assert.match(worldSource, /material\.depthWrite = false/);
});

test('afterimage history accumulates only the particle emission MRT before motion blur', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const engineSource = await readFile(new URL('../src/pyro/firework-engine.js', import.meta.url), 'utf8');
  const particleTarget = mainSource.indexOf('scenePass.getTextureNode(PARTICLE_AFTERIMAGE_TARGET)');
  const history = mainSource.indexOf('afterImage(particleAfterimageTexture', particleTarget);
  const residual = mainSource.indexOf('accumulatedParticleAfterimage.sub(particleAfterimageTexture)', history);
  const composite = mainSource.indexOf('sceneWithParticleAfterimage', residual);
  const materialized = mainSource.indexOf('convertToTexture(sceneWithParticleAfterimage)', composite);
  const motion = mainSource.indexOf('motionBlur(sceneWithParticleAfterimageTexture', materialized);
  assert.ok(particleTarget >= 0, 'missing dedicated particle afterimage MRT texture');
  assert.ok(history > particleTarget, 'particle history must consume the dedicated particle texture');
  assert.ok(residual > history, 'current particles must be removed from the accumulated history to avoid double brightness');
  assert.ok(materialized > composite, 'particle-only residual must be materialized for downstream texture sampling');
  assert.ok(motion > materialized, 'particle-only residual must be composited before velocity motion blur');
  assert.match(engineSource, /\[PARTICLE_AFTERIMAGE_TARGET\]: vec4\(this\.particleColorNode\.mul\(this\.renderParticleOpacityNode\)/);
  assert.doesNotMatch(mainSource, /afterImage\(sceneColor/);
});
