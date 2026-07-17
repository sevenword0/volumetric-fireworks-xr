export const MIN_RING_PARTICLE_SCALE = 0.25;
export const MAX_RING_PARTICLE_SCALE = 3;
export const SATURN_RING_SHARE = 0.48;

const FULL_RING_PATTERNS = new Set(['ring', 'doubleRing']);

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampRingParticleScale(value, fallback = 1) {
  return Math.max(MIN_RING_PARTICLE_SCALE, Math.min(MAX_RING_PARTICLE_SCALE, finite(value, fallback)));
}

export function resolveRingParticleProfile(preset = {}, baseCount = preset.count ?? 1, scale = 1) {
  const safeCount = Math.max(1, Math.round(finite(baseCount, 1)));
  const safeScale = clampRingParticleScale(scale);

  if (FULL_RING_PATTERNS.has(preset.pattern)) {
    const ringCount = Math.max(1, Math.round(safeCount * safeScale));
    return { affected: true, totalCount: ringCount, ringCount, bodyCount: 0, ringFraction: 1 };
  }

  if (preset.pattern === 'saturn') {
    const baseRingCount = Math.max(1, Math.ceil(safeCount * SATURN_RING_SHARE));
    const bodyCount = Math.max(0, safeCount - baseRingCount);
    const ringCount = Math.max(1, Math.round(baseRingCount * safeScale));
    const totalCount = bodyCount + ringCount;
    return { affected: true, totalCount, ringCount, bodyCount, ringFraction: ringCount / totalCount };
  }

  return { affected: false, totalCount: safeCount, ringCount: 0, bodyCount: safeCount, ringFraction: 0 };
}

export function resolveRingPistilCount(baseCount = 55, scale = 1) {
  return Math.max(1, Math.round(Math.max(1, finite(baseCount, 55)) * clampRingParticleScale(scale)));
}
