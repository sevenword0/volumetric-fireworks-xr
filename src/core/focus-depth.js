export const PARTICLE_FOCUS_TARGET = 'particleFocus';
export const PARTICLE_FOCUS_MIN_COVERAGE = 0.015;
export const PARTICLE_FOCUS_FULL_COVERAGE = 0.2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function resolveParticleFocusDistance(sceneDistance, weightedParticleDepth, coverage) {
  const scene = Number.isFinite(Number(sceneDistance)) ? Number(sceneDistance) : 0;
  const alpha = clamp(Number(coverage) || 0, 0, 1);
  const particleDistance = (Number(weightedParticleDepth) || 0) / Math.max(alpha, 0.001);
  const particleMask = smoothstep(PARTICLE_FOCUS_MIN_COVERAGE, PARTICLE_FOCUS_FULL_COVERAGE, alpha);
  return scene + (particleDistance - scene) * particleMask;
}
