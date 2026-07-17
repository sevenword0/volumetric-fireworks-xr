import { Fn, Loop, convertToTexture, float, int, mix, screenSize, smoothstep, uv, vec2, vec4 } from 'three/tsl';
import {
  MAX_BOKEH_GAMMA,
  MIN_BOKEH_GAMMA,
  PARTICLE_BOKEH_EDGE_SOFTNESS_PIXELS,
  PARTICLE_BOKEH_RADIUS_PIXELS,
} from './bokeh-response.js';
import { PARTICLE_FOCUS_FULL_COVERAGE, PARTICLE_FOCUS_MIN_COVERAGE } from './focus-depth.js';

const GOLDEN_ANGLE = 2.399963229728653;

const particleBokehFocusCoverage = Fn(([particleFocusTextureNode, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode]) => {
  const baseUV = uv();
  const packedFocus = particleFocusTextureNode.sample(baseUV);
  const baseCoverage = packedFocus.a;
  const weightedDepth = packedFocus.r.toVar();
  const weightedCoverage = baseCoverage.toVar();
  const propagatedCoverage = baseCoverage.toVar();
  const texel = vec2(1).div(screenSize);
  const searchRadius = bokehScaleNode.max(0).mul(PARTICLE_BOKEH_RADIUS_PIXELS);
  const sampleCount = float(bokehSamplesNode).max(1);
  const safeFocusRange = focusRangeNode.max(0.001);

  Loop({ start: int(1), end: int(bokehSamplesNode), type: 'int', condition: '<' }, ({ i }) => {
    const sampleIndex = float(i);
    const discRadius = sampleIndex.div(sampleCount.sub(1).max(1)).sqrt();
    const angle = sampleIndex.mul(GOLDEN_ANGLE);
    const offsetPixels = discRadius.mul(searchRadius);
    const offset = vec2(angle.cos(), angle.sin()).mul(offsetPixels);
    const sampleFocus = particleFocusTextureNode.sample(baseUV.add(texel.mul(offset)));
    const sampleCoverage = sampleFocus.a;
    const sampleDistance = sampleFocus.r.div(sampleCoverage.max(0.001));
    const sampleFocusError = sampleDistance.sub(focusDistanceNode).abs();
    const sampleCircleOfConfusion = smoothstep(safeFocusRange.mul(0.08), safeFocusRange, sampleFocusError);
    const sampleBokehRadius = sampleCircleOfConfusion.mul(bokehScaleNode).mul(PARTICLE_BOKEH_RADIUS_PIXELS);
    const sampleReach = sampleBokehRadius.sub(offsetPixels).add(PARTICLE_BOKEH_EDGE_SOFTNESS_PIXELS).clamp(0, 1);
    const influence = sampleCoverage.mul(sampleReach);
    weightedDepth.addAssign(sampleFocus.r.mul(sampleReach));
    weightedCoverage.addAssign(influence);
    propagatedCoverage.assign(propagatedCoverage.max(influence));
  });

  const coverage = propagatedCoverage.clamp(0, 1);
  const distance = weightedDepth.div(weightedCoverage.max(0.001));
  return vec4(distance.mul(coverage), 0, 0, coverage);
});

const depthBokeh = Fn(([textureNode, viewZNode, particleFocusTextureNode, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode, bokehGammaNode]) => {
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
  const radius = circleOfConfusion.mul(bokehScaleNode).mul(PARTICLE_BOKEH_RADIUS_PIXELS);
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

  const blurredColor = accumulated.div(sampleCount).max(0);
  const bokehHighlight = blurredColor.sub(source.rgb.max(0)).max(0);
  const safeGamma = bokehGammaNode.clamp(MIN_BOKEH_GAMMA, MAX_BOKEH_GAMMA);
  const gammaAdjustedHighlight = bokehHighlight.pow(float(1).div(safeGamma));
  const gammaAdjustedBokeh = blurredColor.add(gammaAdjustedHighlight.sub(bokehHighlight));
  return vec4(mix(source.rgb, gammaAdjustedBokeh, blend), source.a);
});

export function bokehDepthOfField(inputNode, viewZNode, particleFocusTextureNode, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode, bokehGammaNode) {
  const expandedParticleFocusTexture = convertToTexture(particleBokehFocusCoverage(
    particleFocusTextureNode,
    focusDistanceNode,
    focusRangeNode,
    bokehScaleNode,
    bokehSamplesNode,
  ));
  return depthBokeh(convertToTexture(inputNode), viewZNode, expandedParticleFocusTexture, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode, bokehGammaNode);
}
