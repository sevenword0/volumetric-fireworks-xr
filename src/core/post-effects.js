import { Fn, convertToTexture, mix, screenSize, smoothstep, uv, vec2, vec4 } from 'three/tsl';

// A compact Vogel-style disc. The full Three.js DOF node uses 80 blur taps and
// two near/far passes; this single-pass kernel keeps the effect usable at 4K.
const BOKEH_DISC = Object.freeze([
  [0.000, 0.000],
  [0.330, 0.000],
  [-0.244, 0.223],
  [0.029, -0.329],
  [0.493, 0.414],
  [-0.631, -0.112],
  [0.562, -0.486],
  [-0.188, 0.719],
  [-0.397, -0.665],
  [0.829, 0.177],
  [-0.774, 0.354],
  [0.225, -0.881],
  [0.337, 0.908],
]);

const depthBokeh = Fn(([textureNode, viewZNode, focusDistanceNode, focusRangeNode, bokehScaleNode]) => {
  const baseUV = uv();
  const source = textureNode.sample(baseUV).toVar();
  const focusError = viewZNode.negate().sub(focusDistanceNode).abs();
  const safeFocusRange = focusRangeNode.max(0.001);
  const circleOfConfusion = smoothstep(safeFocusRange.mul(0.08), safeFocusRange, focusError);
  const blend = circleOfConfusion.mul(bokehScaleNode).clamp(0, 1);
  const texel = vec2(1).div(screenSize);
  const radius = circleOfConfusion.mul(bokehScaleNode).mul(11);
  const weight = 1 / BOKEH_DISC.length;
  const accumulated = source.rgb.mul(weight).toVar();

  for (const [x, y] of BOKEH_DISC.slice(1)) {
    const sampleUV = baseUV.add(texel.mul(radius).mul(vec2(x, y)));
    accumulated.addAssign(textureNode.sample(sampleUV).rgb.mul(weight));
  }

  return vec4(mix(source.rgb, accumulated, blend), source.a);
});

export function bokehDepthOfField(inputNode, viewZNode, focusDistanceNode, focusRangeNode, bokehScaleNode) {
  return depthBokeh(convertToTexture(inputNode), viewZNode, focusDistanceNode, focusRangeNode, bokehScaleNode);
}

export const BOKEH_SAMPLE_COUNT = BOKEH_DISC.length;
