export const MIN_BOKEH_GAMMA = 0.5;
export const MAX_BOKEH_GAMMA = 2.5;
export const PARTICLE_BOKEH_RADIUS_PIXELS = 11;
export const PARTICLE_BOKEH_EDGE_SOFTNESS_PIXELS = 1;
export const PARTICLE_BOKEH_SPRITE_EXPANSION = 6;
export const PARTICLE_BOKEH_GEOMETRY_GUARD = 0.35;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function applyBokehGamma(value, gamma) {
  const numericValue = Number(value);
  const numericGamma = Number(gamma);
  const safeValue = Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
  const safeGamma = clamp(Number.isFinite(numericGamma) ? numericGamma : 1, MIN_BOKEH_GAMMA, MAX_BOKEH_GAMMA);
  return Math.pow(safeValue, 1 / safeGamma);
}

export function particleBokehRadiusPixels(circleOfConfusion, bokehScale, enabled = true) {
  const coc = clamp(Number(circleOfConfusion) || 0, 0, 1);
  const scale = Math.max(0, Number(bokehScale) || 0);
  return enabled ? coc * scale * PARTICLE_BOKEH_RADIUS_PIXELS : 0;
}

export function particleBokehSpriteScale(circleOfConfusion, bokehScale, enabled = true) {
  const coc = clamp(Number(circleOfConfusion) || 0, 0, 1);
  const scale = Math.max(0, Number(bokehScale) || 0);
  return enabled ? 1 + coc * scale * PARTICLE_BOKEH_SPRITE_EXPANSION : 1;
}

export function particleBokehGeometryScale(circleOfConfusion, bokehScale, enabled = true) {
  const visibleScale = particleBokehSpriteScale(circleOfConfusion, bokehScale, enabled);
  return 1 + (visibleScale - 1) * (1 + PARTICLE_BOKEH_GEOMETRY_GUARD);
}

export function particleBokehCoverageReach(circleOfConfusion, bokehScale, distancePixels, enabled = true) {
  const radius = particleBokehRadiusPixels(circleOfConfusion, bokehScale, enabled);
  const distance = Math.max(0, Number(distancePixels) || 0);
  return clamp(radius - distance + PARTICLE_BOKEH_EDGE_SOFTNESS_PIXELS, 0, 1);
}
