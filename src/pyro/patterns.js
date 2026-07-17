const TAU = Math.PI * 2;
export const BURST_DIRECTION_STRIDE = 8;

const STAR_OUTLINE = Object.freeze(Array.from({ length: 11 }, (_, index) => {
  const pointIndex = index % 10;
  const angle = -Math.PI / 2 + (pointIndex / 10) * TAU;
  const radius = pointIndex % 2 === 0 ? 1 : 0.42;
  return Object.freeze({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
}));

export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(x, y, z) {
  return normalizeInto({ x: 0, y: 0, z: 0 }, x, y, z);
}

function normalizeInto(target, x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  target.x = x / length;
  target.y = y / length;
  target.z = z / length;
  return target;
}

function sphereDirection(target, index, count, random) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const jitter = (random() - 0.5) / Math.sqrt(Math.max(1, count));
  const y = 1 - ((index + 0.5) / count) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * goldenAngle + jitter * TAU;
  return normalizeInto(target, Math.cos(theta) * radius, y, Math.sin(theta) * radius);
}

function pointOnPolyline(target, points, t) {
  const segments = points.length - 1;
  const scaled = Math.min(segments - Number.EPSILON, Math.max(0, t * segments));
  const index = Math.floor(scaled);
  const local = scaled - index;
  target.x = points[index].x + (points[index + 1].x - points[index].x) * local;
  target.y = points[index].y + (points[index + 1].y - points[index].y) * local;
  target.z = 0;
  return target;
}

function starOutline() {
  return STAR_OUTLINE;
}

function smileyPoint(target, index, count) {
  const circleCount = Math.floor(count * 0.58);
  const eyeCount = Math.floor(count * 0.12);
  if (index < circleCount) {
    const angle = (index / circleCount) * TAU;
    target.x = Math.cos(angle);
    target.y = Math.sin(angle);
    return target;
  }
  if (index < circleCount + eyeCount) {
    const local = (index - circleCount) / Math.max(1, eyeCount - 1);
    const eye = index % 2 === 0 ? -0.36 : 0.36;
    target.x = eye;
    target.y = 0.34 + (local - 0.5) * 0.08;
    return target;
  }
  const local = (index - circleCount - eyeCount) / Math.max(1, count - circleCount - eyeCount - 1);
  const angle = Math.PI * 0.18 + local * Math.PI * 0.64;
  target.x = Math.cos(angle) * 0.62;
  target.y = -0.03 - Math.sin(angle) * 0.58;
  return target;
}

function butterflyPoint(target, t) {
  const angle = t * 12 * Math.PI;
  const radius = Math.exp(Math.sin(angle)) - 2 * Math.cos(4 * angle) + Math.sin((2 * angle - Math.PI) / 24) ** 5;
  target.x = Math.sin(angle) * radius * 0.26;
  target.y = Math.cos(angle) * radius * 0.26;
  return target;
}

function directionForPattern(target, pattern, index, count, random, options = {}) {
  const t = (index + 0.5) / count;

  switch (pattern) {
    case 'ring': {
      const angle = t * TAU;
      return normalizeInto(target, Math.cos(angle), Math.sin(angle), (random() - 0.5) * 0.035);
    }
    case 'doubleRing': {
      const ring = index % 2;
      const angle = (Math.floor(index / 2) / Math.ceil(count / 2)) * TAU + ring * 0.035;
      const tilt = ring ? 0.42 : -0.42;
      return normalizeInto(target, Math.cos(angle), Math.sin(angle) * Math.cos(tilt), Math.sin(angle) * Math.sin(tilt));
    }
    case 'saturn': {
      const requestedFraction = Number(options.ringFraction);
      const ringFraction = Number.isFinite(requestedFraction) ? Math.max(0, Math.min(1, requestedFraction)) : 0.48;
      const ringCount = count <= 1 ? count : Math.max(1, Math.min(count - 1, Math.round(count * ringFraction)));
      if (index < ringCount) {
        const angle = (index / Math.max(1, ringCount)) * TAU;
        return normalizeInto(target, Math.cos(angle) * 1.2, Math.sin(angle) * 0.24, Math.sin(angle) * 0.86);
      }
      return sphereDirection(target, index - ringCount, Math.max(1, count - ringCount), random);
    }
    case 'palm': {
      const arms = 12;
      const arm = index % arms;
      const progress = 0.35 + Math.floor(index / arms) / Math.max(1, Math.ceil(count / arms) - 1) * 0.65;
      const angle = (arm / arms) * TAU + (random() - 0.5) * 0.04;
      return normalizeInto(target, Math.cos(angle) * progress, 0.32 + progress * 0.72, Math.sin(angle) * progress);
    }
    case 'willow': {
      const direction = sphereDirection(target, index, count, random);
      direction.y = direction.y * 0.82 + 0.18;
      return normalizeInto(target, direction.x, direction.y, direction.z);
    }
    case 'horsetail': {
      const angle = (index / count) * TAU + (random() - 0.5) * 0.08;
      const radius = 0.32 + random() * 0.68;
      return normalizeInto(target, Math.cos(angle) * radius, 0.22 + random() * 0.48, Math.sin(angle) * radius * 0.55);
    }
    case 'spider': {
      const arms = 18;
      const arm = index % arms;
      const angle = (arm / arms) * TAU;
      const elevation = ((arm % 5) - 2) * 0.13;
      return normalizeInto(target, Math.cos(angle) + (random() - 0.5) * 0.035, elevation + (random() - 0.5) * 0.03, Math.sin(angle) + (random() - 0.5) * 0.035);
    }
    case 'heart': {
      const angle = t * TAU;
      const x = 16 * Math.sin(angle) ** 3;
      const y = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
      return normalizeInto(target, x / 17, y / 17, (random() - 0.5) * 0.018);
    }
    case 'star': {
      const point = pointOnPolyline(target, starOutline(), t);
      return normalizeInto(target, point.x, point.y, (random() - 0.5) * 0.018);
    }
    case 'smiley': {
      const point = smileyPoint(target, index, count);
      return normalizeInto(target, point.x, point.y, (random() - 0.5) * 0.014);
    }
    case 'butterfly': {
      const point = butterflyPoint(target, t);
      return normalizeInto(target, point.x, point.y, (random() - 0.5) * 0.035);
    }
    case 'spiral': {
      const angle = t * TAU * 4.5;
      const radius = 0.18 + t * 0.82;
      return normalizeInto(target, Math.cos(angle) * radius, (t - 0.5) * 1.1, Math.sin(angle) * radius);
    }
    case 'helix': {
      const strand = index % 2;
      const local = Math.floor(index / 2) / Math.max(1, Math.ceil(count / 2) - 1);
      const angle = local * TAU * 3.4 + strand * Math.PI;
      return normalizeInto(target, Math.cos(angle) * 0.78, (local - 0.5) * 1.4, Math.sin(angle) * 0.78);
    }
    case 'galaxy': {
      const arms = 4;
      const arm = index % arms;
      const local = Math.floor(index / arms) / Math.max(1, Math.ceil(count / arms) - 1);
      const angle = (arm / arms) * TAU + local * TAU * 1.45;
      const radius = 0.12 + local * 0.9;
      return normalizeInto(target, Math.cos(angle) * radius, (random() - 0.5) * 0.18, Math.sin(angle) * radius);
    }
    case 'mine': {
      const angle = -Math.PI * 0.72 + t * Math.PI * 0.44;
      return normalizeInto(target, Math.sin(angle) * 0.9 + (random() - 0.5) * 0.08, 0.72 + random() * 0.54, Math.cos(angle) * 0.18 + (random() - 0.5) * 0.22);
    }
    case 'cometFan': {
      const spread = count <= 1 ? 0 : index / (count - 1) - 0.5;
      return normalizeInto(target, spread * 1.4, 1.1 - Math.abs(spread) * 0.18, (random() - 0.5) * 0.08);
    }
    case 'romanCandle':
      return normalizeInto(target, (random() - 0.5) * 0.18, 1, (random() - 0.5) * 0.18);
    case 'waterfall': {
      const angle = t * TAU;
      return normalizeInto(target, Math.cos(angle) * 0.65, -0.4 - random() * 0.55, Math.sin(angle) * 0.25);
    }
    case 'crossette':
    case 'dahlia':
    case 'chrysanthemum':
    case 'peony':
    default:
      return sphereDirection(target, index, count, random);
  }
}

export function writeBurstDirections(preset, count, seed, target, options = {}) {
  const random = mulberry32(seed);
  const safeCount = Math.max(1, Math.floor(count));
  const direction = { x: 0, y: 0, z: 0 };
  if (!target || target.length < safeCount * BURST_DIRECTION_STRIDE) {
    throw new RangeError(`Burst direction buffer requires ${safeCount * BURST_DIRECTION_STRIDE} values`);
  }
  for (let index = 0; index < safeCount; index += 1) {
    directionForPattern(direction, preset.pattern, index, safeCount, random, options);
    let speedScale = 0.82 + random() * 0.34;
    if (preset.pattern === 'dahlia') speedScale *= 1.1 + random() * 0.22;
    if (preset.pattern === 'willow' || preset.pattern === 'horsetail') speedScale *= 0.76 + random() * 0.18;
    if (preset.pattern === 'spider') speedScale *= 1.05 + random() * 0.2;
    if (preset.pattern === 'heart' || preset.pattern === 'star' || preset.pattern === 'smiley') speedScale *= 0.94 + random() * 0.06;
    const offset = index * BURST_DIRECTION_STRIDE;
    target[offset] = direction.x;
    target[offset + 1] = direction.y;
    target[offset + 2] = direction.z;
    target[offset + 3] = speedScale;
    target[offset + 4] = preset.ghost ? Math.min(0.999, tFromIndex(index, safeCount) * 1.15) : random();
    target[offset + 5] = preset.pattern === 'romanCandle' ? index * 0.18 : 0;
    target[offset + 6] = random() * TAU;
    target[offset + 7] = random();
  }
  return safeCount;
}

export function generateBurstDirections(preset, count = preset.count, seed = hashString(preset.id ?? 'custom'), options = {}) {
  const safeCount = Math.max(1, Math.floor(count));
  const packed = new Float64Array(safeCount * BURST_DIRECTION_STRIDE);
  writeBurstDirections(preset, safeCount, seed, packed, options);
  const result = new Array(safeCount);
  for (let index = 0; index < safeCount; index += 1) {
    const offset = index * BURST_DIRECTION_STRIDE;
    result[index] = {
      x: packed[offset],
      y: packed[offset + 1],
      z: packed[offset + 2],
      speedScale: packed[offset + 3],
      colorT: packed[offset + 4],
      delay: packed[offset + 5],
      phase: packed[offset + 6],
      seed: packed[offset + 7],
    };
  }
  return result;
}

function tFromIndex(index, count) {
  return count <= 1 ? 0 : index / (count - 1);
}

export function createSplitDirections(velocity, splitCount = 4, seed = 1) {
  const random = mulberry32(seed);
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z) || 1;
  const forward = normalize(velocity.x, velocity.y, velocity.z);
  const reference = Math.abs(forward.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const tangent = normalize(
    forward.y * reference.z - forward.z * reference.y,
    forward.z * reference.x - forward.x * reference.z,
    forward.x * reference.y - forward.y * reference.x,
  );
  const bitangent = normalize(
    forward.y * tangent.z - forward.z * tangent.y,
    forward.z * tangent.x - forward.x * tangent.z,
    forward.x * tangent.y - forward.y * tangent.x,
  );
  return Array.from({ length: Math.max(2, splitCount) }, (_, index) => {
    const angle = (index / splitCount) * TAU + random() * 0.12;
    const lateral = speed * (0.28 + random() * 0.08);
    return {
      x: forward.x * speed * 0.38 + (tangent.x * Math.cos(angle) + bitangent.x * Math.sin(angle)) * lateral,
      y: forward.y * speed * 0.38 + (tangent.y * Math.cos(angle) + bitangent.y * Math.sin(angle)) * lateral,
      z: forward.z * speed * 0.38 + (tangent.z * Math.cos(angle) + bitangent.z * Math.sin(angle)) * lateral,
    };
  });
}
