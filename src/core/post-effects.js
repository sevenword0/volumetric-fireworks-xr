import { Fn, Loop, convertToTexture, float, int, mix, screenSize, smoothstep, uv, vec2, vec4 } from 'three/tsl';
import { PARTICLE_FOCUS_FULL_COVERAGE, PARTICLE_FOCUS_MIN_COVERAGE } from './focus-depth.js';

const GOLDEN_ANGLE = 2.399963229728653;

const depthBokeh = Fn(([textureNode, viewZNode, particleFocusTextureNode, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode]) => {
  const baseUV = uv();
  const source = textureNode.sample(baseUV).toVar();
  const packedParticleFocus = particleFocusTextureNode.sample(baseUV);
  const particleCoverage = packedParticleFocus.a;
  const particleDistance = packedParticleFocus.r.div(particleCoverage.max(0.001));
  const particleMask = smoothstep(PARTICLE_FOCUS_MIN_COVERAGE, PARTICLE_FOCUS_FULL_COVERAGE, particleCoverage);
  const resolvedDistance = mix(viewZNode.negate(), particleDistance, particleMask);
  const focusError = resolvedDistance.sub(focusDistanceNode).abs();
  const safeFocusRange = focusRangeNode.max(0.001);
  const circleOfConfusion = smoothstep(safeFocusRange.mul(0.08), safeFocusRange, focusError);
  const blend = circleOfConfusion.mul(bokehScaleNode).clamp(0, 1);
  const texel = vec2(1).div(screenSize);
  const radius = circleOfConfusion.mul(bokehScaleNode).mul(11);
  const sampleCount = float(bokehSamplesNode).max(1);
  const accumulated = source.rgb.toVar();

  Loop({ start: int(1), end: int(bokehSamplesNode), type: 'int', condition: '<' }, ({ i }) => {
    const sampleIndex = float(i);
    const discRadius = sampleIndex.div(sampleCount.sub(1).max(1)).sqrt();
    const angle = sampleIndex.mul(GOLDEN_ANGLE);
    const offset = vec2(angle.cos(), angle.sin()).mul(discRadius);
    const sampleUV = baseUV.add(texel.mul(radius).mul(offset));
    accumulated.addAssign(textureNode.sample(sampleUV).rgb);
  });

  return vec4(mix(source.rgb, accumulated.div(sampleCount), blend), source.a);
});

export function bokehDepthOfField(inputNode, viewZNode, particleFocusTextureNode, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode) {
  return depthBokeh(convertToTexture(inputNode), viewZNode, particleFocusTextureNode, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode);
}
