export const MIN_TRAIL_PARTICLE_SCALE = 0;
export const MAX_TRAIL_PARTICLE_SCALE = 3;

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampTrailParticleScale(value, fallback = 1) {
  return Math.max(MIN_TRAIL_PARTICLE_SCALE, Math.min(MAX_TRAIL_PARTICLE_SCALE, finite(value, fallback)));
}
