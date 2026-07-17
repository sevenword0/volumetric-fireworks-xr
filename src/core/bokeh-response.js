export const MIN_BOKEH_GAMMA = 0.5;
export const MAX_BOKEH_GAMMA = 2.5;

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
