export const RENDER_LAYERS = Object.freeze({
  DEFAULT: 0,
  VOLUME_SHADOW: 2,
});

export function enableVolumeShadowCasters(camera) {
  camera?.layers?.enable(RENDER_LAYERS.VOLUME_SHADOW);
  return camera;
}
