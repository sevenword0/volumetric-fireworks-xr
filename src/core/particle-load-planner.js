import { LAUNCH_LAYOUTS } from '../pyro/presets.js';
import { particleLoadLevel } from './particle-load-guard.js';
import { clampRingParticleScale, resolveRingParticleProfile, resolveRingPistilCount } from './ring-particles.js';
import { MAX_POST_BURST_LIFETIME, MIN_POST_BURST_LIFETIME } from './state.js';
import { clampTrailParticleScale } from './trail-particles.js';

const IMMEDIATE_PATTERNS = new Set(['mine', 'cometFan', 'romanCandle', 'waterfall']);
const LEVEL_NAMES = ['normal', 'guarded', 'pressure', 'emergency'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pistilCount(preset, ringParticleScale = 1) {
  if (!preset?.pistil || preset.pistil === 'none') return 0;
  if (preset.pistil === 'double') return 136;
  return preset.pistil === 'ring' ? resolveRingPistilCount(55, ringParticleScale) : 68;
}

export function estimateParticleLoad(preset = {}, scale = 1, lifetimeScale = 1, ringParticleScale = 1, trailParticleScale = 1) {
  const safeScale = clamp(finite(scale, 1), 0.35, 2.2);
  const safeLifetime = clamp(finite(lifetimeScale, 1), MIN_POST_BURST_LIFETIME, MAX_POST_BURST_LIFETIME);
  const safeTrailScale = clampTrailParticleScale(trailParticleScale, 1);
  const countScale = clamp(safeScale ** 0.55, 0.65, 1.35);
  const baseStars = Math.max(1, Math.round(finite(preset.count, 1) * countScale));
  const stars = resolveRingParticleProfile(preset, baseStars, ringParticleScale).totalCount;
  const core = stars + pistilCount(preset, ringParticleScale);
  const trail = clamp(finite(preset.trail, 0), 0, 1.25);
  const trailRate = clamp(finite(preset.trailRate, 18), 0, 48);
  const trailMultiplier = 1 + trail * trailRate * 0.12 * safeLifetime * safeTrailScale;
  const splitLoad = stars * clamp(finite(preset.split, 0), 0, 8) * 0.14;
  const crackleLoad = stars * clamp(finite(preset.crackle, 0), 0, 1) * 0.55;
  return Math.max(1, Math.round(core * trailMultiplier + (splitLoad + crackleLoad) * safeLifetime));
}

function plannedBurstLife(preset, scale, lifetimeScale) {
  const safeScale = clamp(finite(scale, 1), 0.35, 2.2);
  const safeLifetime = clamp(finite(lifetimeScale, 1), MIN_POST_BURST_LIFETIME, MAX_POST_BURST_LIFETIME);
  return clamp((finite(preset.life, 3.1) * Math.sqrt(safeScale) + 0.7) * safeLifetime, 0.2, 42.5);
}

function addBurstEvents(events, preset, time, scale, lifetimeScale, ringParticleScale, trailParticleScale) {
  const safeScale = clamp(finite(scale, 1), 0.35, 2.2);
  events.push({
    time: Math.max(0, finite(time, 0)),
    life: plannedBurstLife(preset, safeScale, lifetimeScale),
    load: estimateParticleLoad(preset, safeScale, lifetimeScale, ringParticleScale, trailParticleScale),
  });

  const breaks = clamp(Math.round(finite(preset.multiBreak, 1)), 1, 4);
  for (let index = 1; index < breaks; index += 1) {
    const childPreset = { ...preset, multiBreak: 1, count: Math.round(finite(preset.count, 1) * 0.72) };
    const childScale = safeScale * 0.8;
    events.push({
      time: Math.max(0, time + index * 0.32),
      life: plannedBurstLife(childPreset, childScale, lifetimeScale),
      load: estimateParticleLoad(childPreset, childScale, lifetimeScale, ringParticleScale, trailParticleScale),
    });
  }
}

export function expandLaunchLoadEvents(preset, layoutName = 'single', launchTime = 0, options = {}) {
  if (!preset) return [];
  const layout = LAUNCH_LAYOUTS[layoutName] ?? LAUNCH_LAYOUTS.single;
  const events = [];
  const launchScale = clamp(finite(options.scale, 1), 0.35, 2.2);
  const lifetimeScale = clamp(finite(options.lifetimeScale, 1), MIN_POST_BURST_LIFETIME, MAX_POST_BURST_LIFETIME);
  const explosionPower = clamp(finite(options.explosionPower, 1), 0.5, 1.8);
  const burstScale = clamp(launchScale * explosionPower, 0.35, 2.2);
  const ringParticleScale = clampRingParticleScale(options.ringParticleScale, 1);
  const trailParticleScale = clampTrailParticleScale(options.trailParticleScale, 1);
  const baseDelay = Math.max(0, finite(options.delay, 0));
  const sequenceDelay = clamp(finite(options.sequenceDelay, 0), 0, 0.22);
  const passCount = options.crossLaunch ? 2 : 1;
  const passOffset = Math.max(0.04, sequenceDelay * layout.length + 0.04);

  for (let pass = 0; pass < passCount; pass += 1) {
    for (let itemIndex = 0; itemIndex < layout.length; itemIndex += 1) {
      const item = layout[itemIndex];
      const scheduledTime = Math.max(0, finite(launchTime, 0) + baseDelay + finite(item.delay, 0) + itemIndex * sequenceDelay + pass * passOffset);
      if (preset.pattern === 'romanCandle') {
        const repeat = clamp(Math.round(finite(preset.repeat, 7)), 1, 16);
        const candlePreset = { ...preset, pattern: 'cometFan', count: 1, multiBreak: 1 };
        for (let index = 0; index < repeat; index += 1) addBurstEvents(events, candlePreset, scheduledTime + index * 0.34, burstScale, lifetimeScale, ringParticleScale, trailParticleScale);
        continue;
      }

      const burstTime = IMMEDIATE_PATTERNS.has(preset.pattern)
        ? scheduledTime
        : scheduledTime + Math.max(0, finite(preset.fuse, 2.1)) * Math.sqrt(launchScale);
      addBurstEvents(events, preset, burstTime, burstScale, lifetimeScale, ringParticleScale, trailParticleScale);
    }
  }
  return events;
}

function envelope(progress) {
  if (progress < 0 || progress > 1) return 0;
  if (progress < 0.18) return 0.72 + (progress / 0.18) * 0.28;
  return 1 - ((progress - 0.18) / 0.82) * 0.88;
}

function forEachEventBucket(event, bucketSeconds, callback) {
  const first = Math.floor(event.time / bucketSeconds);
  const last = Math.ceil((event.time + event.life) / bucketSeconds);
  for (let index = first; index <= last; index += 1) {
    const sampleTime = (index + 0.5) * bucketSeconds;
    const progress = (sampleTime - event.time) / Math.max(0.001, event.life);
    const weight = envelope(progress);
    if (weight > 0) callback(index, event.load * weight);
  }
}

function buildTimeline(events, bucketSeconds) {
  const duration = events.reduce((maximum, event) => Math.max(maximum, event.time + event.life), 0);
  const timeline = new Float32Array(Math.max(1, Math.ceil(duration / bucketSeconds) + 1));
  for (const event of events) {
    forEachEventBucket(event, bucketSeconds, (index, load) => {
      if (index >= 0 && index < timeline.length) timeline[index] += load;
    });
  }
  return timeline;
}

function buildWindows(timeline, capacity, bucketSeconds) {
  const windows = [];
  let active = null;
  for (let index = 0; index < timeline.length; index += 1) {
    const particles = timeline[index];
    const ratio = particles / capacity;
    const level = particleLoadLevel(ratio);
    if (level === 0) {
      if (active) {
        active.end = Number((index * bucketSeconds).toFixed(2));
        windows.push(active);
        active = null;
      }
      continue;
    }
    if (!active) {
      active = {
        start: Number((index * bucketSeconds).toFixed(2)),
        end: Number(((index + 1) * bucketSeconds).toFixed(2)),
        level,
        name: LEVEL_NAMES[level],
        peakParticles: Math.round(particles),
        peakRatio: ratio,
      };
    } else {
      active.level = Math.max(active.level, level);
      active.name = LEVEL_NAMES[active.level];
      active.peakParticles = Math.max(active.peakParticles, Math.round(particles));
      active.peakRatio = Math.max(active.peakRatio, ratio);
    }
  }
  if (active) {
    active.end = Number((timeline.length * bucketSeconds).toFixed(2));
    windows.push(active);
  }
  return windows;
}

export class ParticleLoadPlanner {
  constructor(options = {}) {
    this.capacity = Math.max(1, Math.round(finite(options.capacity, 12000)));
    this.bucketSeconds = clamp(finite(options.bucketSeconds, 0.25), 0.1, 1);
    this.leadSeconds = clamp(finite(options.leadSeconds, 2.4), 0.5, 5);
    this.showEvents = [];
    this.showTimeline = new Float32Array(1);
    this.showWindows = [];
    this.manualTimeline = new Map();
    this.lastPrunedBucket = -Infinity;
  }

  setCapacity(capacity) {
    this.capacity = Math.max(1, Math.round(finite(capacity, this.capacity)));
    this.rebuildShowPlan();
  }

  rebuildShowPlan() {
    this.showTimeline = buildTimeline(this.showEvents, this.bucketSeconds);
    this.showWindows = buildWindows(this.showTimeline, this.capacity, this.bucketSeconds);
  }

  planShow(cues = [], resolvePreset = () => null, options = {}) {
    const events = [];
    for (const cue of cues) {
      const preset = typeof resolvePreset === 'function' ? resolvePreset(cue.presetId, cue) : resolvePreset?.get?.(cue.presetId);
      if (!preset) continue;
      const scale = clamp(0.72 + finite(cue.energy, 0.7) * 0.35, 0.78, 1.28);
      const choreography = cue.choreography ?? {};
      events.push(...expandLaunchLoadEvents(preset, cue.layout, Math.max(0, finite(cue.time, 0)), {
        scale,
        explosionPower: choreography.explosionPower,
        sequenceDelay: choreography.sequenceDelay,
        crossLaunch: choreography.crossLaunch,
        lifetimeScale: options.lifetimeScale,
        ringParticleScale: options.ringParticleScale,
        trailParticleScale: options.trailParticleScale,
      }));
    }
    this.showEvents = events.sort((a, b) => a.time - b.time);
    this.rebuildShowPlan();
    return this.getShowPlan();
  }

  clearShowPlan() {
    this.showEvents = [];
    this.rebuildShowPlan();
  }

  getShowPlan() {
    return {
      eventCount: this.showEvents.length,
      windowCount: this.showWindows.length,
      windows: this.showWindows.map((window) => ({ ...window })),
    };
  }

  scheduleLaunch(preset, layoutName = 'single', engineTime = 0, options = {}) {
    const events = expandLaunchLoadEvents(preset, layoutName, engineTime, options);
    for (const event of events) {
      forEachEventBucket(event, this.bucketSeconds, (index, load) => {
        this.manualTimeline.set(index, (this.manualTimeline.get(index) ?? 0) + load);
      });
    }
    return events;
  }

  clearManualPlan() {
    this.manualTimeline.clear();
    this.lastPrunedBucket = -Infinity;
  }

  forecast({ engineTime = 0, audioTime = 0, showPlaying = false, enabled = true } = {}) {
    if (!enabled) {
      return { enabled: false, predictedParticles: 0, ratio: 0, level: 0, peakIn: 0, source: 'none' };
    }

    const currentBucket = Math.floor(Math.max(0, finite(engineTime, 0)) / this.bucketSeconds);
    if (currentBucket > this.lastPrunedBucket) {
      for (const index of this.manualTimeline.keys()) {
        if (index < currentBucket - 2) this.manualTimeline.delete(index);
      }
      this.lastPrunedBucket = currentBucket;
    }

    const steps = Math.ceil(this.leadSeconds / this.bucketSeconds);
    let peak = 0;
    let peakIn = 0;
    let peakManual = 0;
    let peakShow = 0;
    for (let step = 0; step <= steps; step += 1) {
      const offset = Math.min(this.leadSeconds, step * this.bucketSeconds);
      const manualIndex = Math.floor((Math.max(0, engineTime) + offset) / this.bucketSeconds);
      const showIndex = Math.floor((Math.max(0, audioTime) + offset) / this.bucketSeconds);
      const manual = this.manualTimeline.get(manualIndex) ?? 0;
      const show = showPlaying && showIndex >= 0 && showIndex < this.showTimeline.length ? this.showTimeline[showIndex] : 0;
      const combined = manual + show;
      if (combined > peak) {
        peak = combined;
        peakIn = offset;
        peakManual = manual;
        peakShow = show;
      }
    }

    const ratio = peak / this.capacity;
    const source = peakManual > 0 && peakShow > 0 ? 'combined' : peakShow > 0 ? 'show' : peakManual > 0 ? 'manual' : 'none';
    return {
      enabled: true,
      predictedParticles: Math.round(peak),
      ratio,
      level: particleLoadLevel(ratio),
      peakIn: Number(peakIn.toFixed(2)),
      source,
    };
  }
}
