export const MAX_WATER_REFLECTION_MIP = 6;
export const MIN_WATER_REFLECTION_CLARITY = 0.62;
export const MIN_WATER_WAVE_STRENGTH = 0.001;
export const MAX_WATER_WAVE_STRENGTH = 0.018;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getWaterSurfaceProfile(value) {
  const numeric = Number(value);
  const roughness = clamp(Number.isFinite(numeric) ? numeric : 0, 0, 1);
  return {
    roughness,
    reflectionMip: Math.pow(roughness, 1.2) * MAX_WATER_REFLECTION_MIP,
    reflectionClarity: 1 - roughness * (1 - MIN_WATER_REFLECTION_CLARITY),
    waveStrength: MIN_WATER_WAVE_STRENGTH
      + Math.pow(roughness, 1.35) * (MAX_WATER_WAVE_STRENGTH - MIN_WATER_WAVE_STRENGTH),
  };
}
