export const FOCUS_HEMISPHERE_TARGET = 'focusHemisphere';
export const FOCUS_HEMISPHERE_SURFACE_SIZE = 180;
export const FOCUS_HEMISPHERE_RADIUS = FOCUS_HEMISPHERE_SURFACE_SIZE / 2;
export const FOCUS_HEMISPHERE_WIDTH_SEGMENTS = 48;
export const FOCUS_HEMISPHERE_HEIGHT_SEGMENTS = 20;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function resolveFocusHemisphereDistance(sceneDistance, packedHemisphereDepth, coverage) {
  const scene = Math.max(0, finite(sceneDistance));
  const samples = Math.max(0, finite(coverage));
  if (samples <= 0) return scene;
  const hemisphere = Math.max(0, finite(packedHemisphereDepth) / Math.max(samples, 0.001));
  const nearest = scene > 0 ? Math.min(scene, hemisphere) : hemisphere;
  const mask = Math.min(1, samples);
  return scene + (nearest - scene) * mask;
}
