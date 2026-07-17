export const PARTICLE_AFTERIMAGE_TARGET = 'particleAfterimage';
export const MIN_PARTICLE_AFTERIMAGE = 0;
export const MAX_PARTICLE_AFTERIMAGE = 1;
export const MIN_PARTICLE_AFTERIMAGE_DAMP = 0.78;
export const MAX_PARTICLE_AFTERIMAGE_DAMP = 0.97;

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampParticleAfterimage(value, fallback = 0) {
  return Math.max(MIN_PARTICLE_AFTERIMAGE, Math.min(MAX_PARTICLE_AFTERIMAGE, finite(value, fallback)));
}

export function resolveParticleAfterimage(value, runtimeActive = true) {
  const strength = clampParticleAfterimage(value);
  const active = runtimeActive && strength > 0.001;
  const damp = active
    ? MIN_PARTICLE_AFTERIMAGE_DAMP + (MAX_PARTICLE_AFTERIMAGE_DAMP - MIN_PARTICLE_AFTERIMAGE_DAMP) * strength
    : 0;
  return { active, strength: active ? strength : 0, damp };
}
