const TAU = Math.PI * 2;

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
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function sphereDirection(index, count, random) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const jitter = (random() - 0.5) / Math.sqrt(Math.max(1, count));
  const y = 1 - ((index + 0.5) / count) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * goldenAngle + jitter * TAU;
  return normalize(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
}

function pointOnPolyline(points, t) {
  const segments = points.length - 1;
  const scaled = Math.min(segments - Number.EPSILON, Math.max(0, t * segments));
  const index = Math.floor(scaled);
  const local = scaled - index;
  return {
    x: points[index].x + (points[index + 1].x - points[index].x) * local,
    y: points[index].y + (points[index + 1].y - points[index].y) * local,
  };
}

function starOutline() {
  const points = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index / 10) * TAU;
    const radius = index % 2 === 0 ? 1 : 0.42;
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  points.push(points[0]);
  return points;
}

function smileyPoint(index, count) {
  const circleCount = Math.floor(count * 0.58);
  const eyeCount = Math.floor(count * 0.12);
  if (index < circleCount) {
    const angle = (index / circleCount) * TAU;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }
  if (index < circleCount + eyeCount) {
    const local = (index - circleCount) / Math.max(1, eyeCount - 1);
    const eye = index % 2 === 0 ? -0.36 : 0.36;
    return { x: eye, y: 0.34 + (local - 0.5) * 0.08 };
  }
  const local = (index - circleCount - eyeCount) / Math.max(1, count - circleCount - eyeCount - 1);
  const angle = Math.PI * 0.18 + local * Math.PI * 0.64;
  return { x: Math.cos(angle) * 0.62, y: -0.03 - Math.sin(angle) * 0.58 };
}

function butterflyPoint(t) {
  const angle = t * 12 * Math.PI;
  const radius = Math.exp(Math.sin(angle)) - 2 * Math.cos(4 * angle) + Math.sin((2 * angle - Math.PI) / 24) ** 5;
  return { x: Math.sin(angle) * radius * 0.26, y: Math.cos(angle) * radius * 0.26 };
}

function directionForPattern(pattern, index, count, random) {
  const t = (index + 0.5) / count;
  const noise = () => (random() - 0.5);

  switch (pattern) {
    case 'ring': {
      const angle = t * TAU;
      return normalize(Math.cos(angle), Math.sin(angle), noise() * 0.035);
    }
    case 'doubleRing': {
      const ring = index % 2;
      const angle = (Math.floor(index / 2) / Math.ceil(count / 2)) * TAU + ring * 0.035;
      const tilt = ring ? 0.42 : -0.42;
      return normalize(Math.cos(angle), Math.sin(angle) * Math.cos(tilt), Math.sin(angle) * Math.sin(tilt));
    }
    case 'saturn': {
      if (index < count * 0.48) {
        const angle = (index / Math.max(1, Math.floor(count * 0.48))) * TAU;
        return normalize(Math.cos(angle) * 1.2, Math.sin(angle) * 0.24, Math.sin(angle) * 0.86);
      }
      return sphereDirection(index - Math.floor(count * 0.48), Math.ceil(count * 0.52), random);
    }
    case 'palm': {
      const arms = 12;
      const arm = index % arms;
      const progress = 0.35 + Math.floor(index / arms) / Math.max(1, Math.ceil(count / arms) - 1) * 0.65;
      const angle = (arm / arms) * TAU + noise() * 0.04;
      return normalize(Math.cos(angle) * progress, 0.32 + progress * 0.72, Math.sin(angle) * progress);
    }
    case 'willow': {
      const direction = sphereDirection(index, count, random);
      direction.y = direction.y * 0.82 + 0.18;
      return normalize(direction.x, direction.y, direction.z);
    }
    case 'horsetail': {
      const angle = (index / count) * TAU + noise() * 0.08;
      const radius = 0.32 + random() * 0.68;
      return normalize(Math.cos(angle) * radius, 0.22 + random() * 0.48, Math.sin(angle) * radius * 0.55);
    }
    case 'spider': {
      const arms = 18;
      const arm = index % arms;
      const angle = (arm / arms) * TAU;
      const elevation = ((arm % 5) - 2) * 0.13;
      return normalize(Math.cos(angle) + noise() * 0.035, elevation + noise() * 0.03, Math.sin(angle) + noise() * 0.035);
    }
    case 'heart': {
      const angle = t * TAU;
      const x = 16 * Math.sin(angle) ** 3;
      const y = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
      return normalize(x / 17, y / 17, noise() * 0.018);
    }
    case 'star': {
      const point = pointOnPolyline(starOutline(), t);
      return normalize(point.x, point.y, noise() * 0.018);
    }
    case 'smiley': {
      const point = smileyPoint(index, count);
      return normalize(point.x, point.y, noise() * 0.014);
    }
    case 'butterfly': {
      const point = butterflyPoint(t);
      return normalize(point.x, point.y, noise() * 0.035);
    }
    case 'spiral': {
      const angle = t * TAU * 4.5;
      const radius = 0.18 + t * 0.82;
      return normalize(Math.cos(angle) * radius, (t - 0.5) * 1.1, Math.sin(angle) * radius);
    }
    case 'helix': {
      const strand = index % 2;
      const local = Math.floor(index / 2) / Math.max(1, Math.ceil(count / 2) - 1);
      const angle = local * TAU * 3.4 + strand * Math.PI;
      return normalize(Math.cos(angle) * 0.78, (local - 0.5) * 1.4, Math.sin(angle) * 0.78);
    }
    case 'galaxy': {
      const arms = 4;
      const arm = index % arms;
      const local = Math.floor(index / arms) / Math.max(1, Math.ceil(count / arms) - 1);
      const angle = (arm / arms) * TAU + local * TAU * 1.45;
      const radius = 0.12 + local * 0.9;
      return normalize(Math.cos(angle) * radius, noise() * 0.18, Math.sin(angle) * radius);
    }
    case 'mine': {
      const angle = -Math.PI * 0.72 + t * Math.PI * 0.44;
      return normalize(Math.sin(angle) * 0.9 + noise() * 0.08, 0.72 + random() * 0.54, Math.cos(angle) * 0.18 + noise() * 0.22);
    }
    case 'cometFan': {
      const spread = count <= 1 ? 0 : index / (count - 1) - 0.5;
      return normalize(spread * 1.4, 1.1 - Math.abs(spread) * 0.18, noise() * 0.08);
    }
    case 'romanCandle':
      return normalize(noise() * 0.18, 1, noise() * 0.18);
    case 'waterfall': {
      const angle = t * TAU;
      return normalize(Math.cos(angle) * 0.65, -0.4 - random() * 0.55, Math.sin(angle) * 0.25);
    }
    case 'crossette':
    case 'dahlia':
    case 'chrysanthemum':
    case 'peony':
    default:
      return sphereDirection(index, count, random);
  }
}

export function generateBurstDirections(preset, count = preset.count, seed = hashString(preset.id ?? 'custom')) {
  const random = mulberry32(seed);
  const result = [];
  const safeCount = Math.max(1, Math.floor(count));
  for (let index = 0; index < safeCount; index += 1) {
    const direction = directionForPattern(preset.pattern, index, safeCount, random);
    let speedScale = 0.82 + random() * 0.34;
    if (preset.pattern === 'dahlia') speedScale *= 1.1 + random() * 0.22;
    if (preset.pattern === 'willow' || preset.pattern === 'horsetail') speedScale *= 0.76 + random() * 0.18;
    if (preset.pattern === 'spider') speedScale *= 1.05 + random() * 0.2;
    if (preset.pattern === 'heart' || preset.pattern === 'star' || preset.pattern === 'smiley') speedScale *= 0.94 + random() * 0.06;
    result.push({
      ...direction,
      speedScale,
      colorT: preset.ghost ? Math.min(0.999, tFromIndex(index, safeCount) * 1.15) : random(),
      delay: preset.pattern === 'romanCandle' ? index * 0.18 : 0,
      phase: random() * TAU,
      seed: random(),
    });
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

