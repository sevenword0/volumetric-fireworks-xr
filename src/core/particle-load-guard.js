const LOAD_PROFILES = Object.freeze([
  Object.freeze({
    name: 'normal',
    softLimitRatio: 0.8,
    spawnRatio: 0.075,
    burstScale: 1,
    trailScale: 1,
    smokeStride: 1,
    cullRatio: 0,
    resolutionScale: 1,
    postProcessing: true,
  }),
  Object.freeze({
    name: 'guarded',
    softLimitRatio: 0.65,
    spawnRatio: 0.05,
    burstScale: 0.78,
    trailScale: 0.5,
    smokeStride: 2,
    cullRatio: 0.008,
    resolutionScale: 0.9,
    postProcessing: true,
  }),
  Object.freeze({
    name: 'pressure',
    softLimitRatio: 0.5,
    spawnRatio: 0.03,
    burstScale: 0.55,
    trailScale: 0.15,
    smokeStride: 3,
    cullRatio: 0.025,
    resolutionScale: 0.76,
    postProcessing: true,
  }),
  Object.freeze({
    name: 'emergency',
    softLimitRatio: 0.32,
    spawnRatio: 0.012,
    burstScale: 0.28,
    trailScale: 0,
    smokeStride: 6,
    cullRatio: 0.08,
    resolutionScale: 0.62,
    postProcessing: true,
  }),
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadLevel(ratio) {
  if (ratio >= 0.64) return 3;
  if (ratio >= 0.5) return 2;
  if (ratio >= 0.35) return 1;
  return 0;
}

function frameLevel(frameMs, targetFrameMs) {
  if (frameMs >= targetFrameMs * 2.15) return 3;
  if (frameMs >= targetFrameMs * 1.55) return 2;
  if (frameMs >= targetFrameMs * 1.2) return 1;
  return 0;
}

export class ParticleLoadGuard {
  constructor(options = {}) {
    this.targetFrameMs = options.targetFrameMs ?? (1000 / 60);
    this.escalationFrames = options.escalationFrames ?? 3;
    this.recoveryFrames = options.recoveryFrames ?? 90;
    this.level = 0;
    this.frameEma = this.targetFrameMs;
    this.pressureCount = 0;
    this.recoveryCount = 0;
  }

  update({ frameMs, particles, capacity, adaptive = true } = {}) {
    const safeCapacity = Math.max(1, Math.round(Number(capacity) || 1));
    const safeParticles = clamp(Math.round(Number(particles) || 0), 0, safeCapacity);
    const safeFrameMs = clamp(Number(frameMs) || this.targetFrameMs, 1, this.targetFrameMs * 4);
    const emaWeight = safeFrameMs > this.frameEma ? 0.18 : 0.04;
    this.frameEma += (safeFrameMs - this.frameEma) * emaWeight;

    const ratio = safeParticles / safeCapacity;
    const particleDemand = loadLevel(ratio);
    const frameDemand = adaptive
      ? Math.max(frameLevel(this.frameEma, this.targetFrameMs), frameLevel(safeFrameMs, this.targetFrameMs))
      : 0;
    const demand = Math.max(particleDemand, frameDemand);
    const previousLevel = this.level;

    if (demand > this.level) {
      this.recoveryCount = 0;
      if (particleDemand > this.level) {
        this.level = demand;
        this.pressureCount = 0;
      } else {
        this.pressureCount += 1;
        if (this.pressureCount >= this.escalationFrames) {
          this.level = demand;
          this.pressureCount = 0;
        }
      }
    } else if (demand < this.level) {
      this.pressureCount = 0;
      this.recoveryCount += 1;
      if (this.recoveryCount >= this.recoveryFrames) {
        this.level -= 1;
        this.recoveryCount = 0;
      }
    } else {
      this.pressureCount = 0;
      this.recoveryCount = 0;
    }

    const profile = LOAD_PROFILES[this.level];
    return {
      level: this.level,
      name: profile.name,
      changed: previousLevel !== this.level,
      loadRatio: ratio,
      frameEma: this.frameEma,
      softLimit: Math.max(1, Math.min(safeCapacity, Math.floor(safeCapacity * profile.softLimitRatio))),
      maxSpawnPerFrame: Math.max(24, Math.round(safeCapacity * profile.spawnRatio)),
      burstScale: profile.burstScale,
      trailScale: profile.trailScale,
      smokeStride: profile.smokeStride,
      cullPerFrame: Math.round(safeCapacity * profile.cullRatio),
      resolutionScale: profile.resolutionScale,
      postProcessing: profile.postProcessing,
    };
  }
}

export function particleLoadProfile(level = 0) {
  return LOAD_PROFILES[clamp(Math.round(Number(level) || 0), 0, LOAD_PROFILES.length - 1)];
}
