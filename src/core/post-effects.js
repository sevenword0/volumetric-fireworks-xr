import { Fn, If, Loop, convertToTexture, float, int, mix, screenSize, select, smoothstep, uv, vec2, vec3, vec4 } from 'three/tsl';
import {
  MAX_BOKEH_GAMMA,
  MIN_BOKEH_GAMMA,
  PARTICLE_BOKEH_EDGE_SOFTNESS_PIXELS,
  PARTICLE_BOKEH_RADIUS_PIXELS,
} from './bokeh-response.js';
import { BOKEH_RING_INNER_RADIUS, BOKEH_SHAPE_INDEX } from './bokeh-shapes.js';
import { PARTICLE_FOCUS_FULL_COVERAGE, PARTICLE_FOCUS_MIN_COVERAGE } from './focus-depth.js';

const GOLDEN_ANGLE = 2.399963229728653;

const bokehSampleOffset = Fn(([sampleIndexNode, sampleCountNode, bokehShapeNode]) => {
  const angle = sampleIndexNode.mul(GOLDEN_ANGLE);
  const discRadius = sampleIndexNode.div(sampleCountNode.sub(1).max(1)).sqrt();
  const direction = vec2(angle.cos(), angle.sin());
  const offset = direction.mul(discRadius).toVar();

  const assignRegularPolygon = (sides) => {
    const halfStep = float(Math.PI / sides);
    const step = halfStep.mul(2);
    const sector = angle.sub(Math.PI / 2).add(halfStep).mod(step).sub(halfStep);
    const boundary = halfStep.cos().div(halfStep.sub(sector.abs()).cos());
    offset.assign(direction.mul(discRadius).mul(boundary));
  };

  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.pentagon)), () => assignRegularPolygon(5));
  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.hexagon)), () => assignRegularPolygon(6));
  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.octagon)), () => assignRegularPolygon(8));

  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.ring)), () => {
    const progress = sampleIndexNode.sub(1).div(sampleCountNode.sub(2).max(1)).clamp(0, 1);
    const ringRadius = mix(BOKEH_RING_INNER_RADIUS ** 2, 1, progress).sqrt();
    offset.assign(direction.mul(ringRadius));
  });

  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.heart)), () => {
    const sinAngle = angle.sin();
    const heartX = sinAngle.mul(sinAngle).mul(sinAngle).mul(16 / 18);
    const heartY = angle.cos().mul(13)
      .sub(angle.mul(2).cos().mul(5))
      .sub(angle.mul(3).cos().mul(2))
      .sub(angle.mul(4).cos())
      .add(2)
      .div(18);
    offset.assign(vec2(heartX, heartY).mul(discRadius));
  });

  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.star)), () => {
    const starRadius = angle.sub(Math.PI / 2).mul(5).cos().mul(0.35).add(0.65);
    offset.assign(direction.mul(discRadius).mul(starRadius));
  });

  return offset;
});

const particleBokehFocusCoverage = Fn(([particleFocusTextureNode, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode, bokehShapeNode]) => {
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
    const apertureOffset = bokehSampleOffset(sampleIndex, sampleCount, bokehShapeNode);
    const offset = apertureOffset.mul(searchRadius);
    const offsetPixels = apertureOffset.length().mul(searchRadius);
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

const depthBokeh = Fn(([textureNode, viewZNode, focusHemisphereTextureNode, particleFocusTextureNode, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode, bokehGammaNode, bokehShapeNode]) => {
  const baseUV = uv();
  const source = textureNode.sample(baseUV).toVar();
  const packedFocusHemisphere = focusHemisphereTextureNode.sample(baseUV);
  const focusHemisphereCoverage = packedFocusHemisphere.g.max(0);
  const focusHemisphereDistance = packedFocusHemisphere.r.div(focusHemisphereCoverage.max(0.001));
  const sceneDistance = viewZNode.negate().max(0);
  const sceneDepthValidity = smoothstep(0.001, 0.01, sceneDistance);
  const nearestProxyDistance = sceneDistance.min(focusHemisphereDistance);
  const proxyDistance = mix(focusHemisphereDistance, nearestProxyDistance, sceneDepthValidity);
  const resolvedSceneDistance = mix(sceneDistance, proxyDistance, focusHemisphereCoverage.clamp(0, 1));
  const packedParticleFocus = particleFocusTextureNode.sample(baseUV);
  const particleCoverage = packedParticleFocus.a;
  const particleDistance = packedParticleFocus.r.div(particleCoverage.max(0.001));
  const particleMask = smoothstep(PARTICLE_FOCUS_MIN_COVERAGE, PARTICLE_FOCUS_FULL_COVERAGE, particleCoverage);
  const resolvedDistance = mix(resolvedSceneDistance, particleDistance, particleMask);
  const focusError = resolvedDistance.sub(focusDistanceNode).abs();
  const safeFocusRange = focusRangeNode.max(0.001);
  const circleOfConfusion = smoothstep(safeFocusRange.mul(0.08), safeFocusRange, focusError);
  const blend = circleOfConfusion.mul(bokehScaleNode).clamp(0, 1);
  const texel = vec2(1).div(screenSize);
  const radius = circleOfConfusion.mul(bokehScaleNode).mul(PARTICLE_BOKEH_RADIUS_PIXELS);
  const sampleCount = float(bokehSamplesNode).max(1);
  const isRing = bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.ring));
  const accumulated = select(isRing, vec3(0), source.rgb).toVar();

  Loop({ start: int(1), end: int(bokehSamplesNode), type: 'int', condition: '<' }, ({ i }) => {
    const sampleIndex = float(i);
    const offset = bokehSampleOffset(sampleIndex, sampleCount, bokehShapeNode);
    const sampleUV = baseUV.add(texel.mul(radius).mul(offset));
    accumulated.addAssign(textureNode.sample(sampleUV).rgb);
  });

  const sampleDivisor = select(isRing, sampleCount.sub(1).max(1), sampleCount);
  const blurredColor = accumulated.div(sampleDivisor).max(0);
  const bokehHighlight = blurredColor.sub(source.rgb.max(0)).max(0);
  const safeGamma = bokehGammaNode.clamp(MIN_BOKEH_GAMMA, MAX_BOKEH_GAMMA);
  const gammaAdjustedHighlight = bokehHighlight.pow(float(1).div(safeGamma));
  const gammaAdjustedBokeh = blurredColor.add(gammaAdjustedHighlight.sub(bokehHighlight));
  return vec4(mix(source.rgb, gammaAdjustedBokeh, blend), source.a);
});

export function bokehDepthOfField(inputNode, viewZNode, focusHemisphereTextureNode, particleFocusTextureNode, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode, bokehGammaNode, bokehShapeNode) {
  const expandedParticleFocusTexture = convertToTexture(particleBokehFocusCoverage(
    particleFocusTextureNode,
    focusDistanceNode,
    focusRangeNode,
    bokehScaleNode,
    bokehSamplesNode,
    bokehShapeNode,
  ));
  return depthBokeh(convertToTexture(inputNode), viewZNode, focusHemisphereTextureNode, expandedParticleFocusTexture, focusDistanceNode, focusRangeNode, bokehScaleNode, bokehSamplesNode, bokehGammaNode, bokehShapeNode);
}
