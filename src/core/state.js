import {
  SHOW_CHOREOGRAPHY_PRESET_IDS,
  SHOW_DIRECTION_IDS,
  getShowChoreographyPreset,
} from '../audio/show-choreography.js';
import { DEFAULT_OPTIMIZATION_TARGETS } from './particle-load-guard.js';
import { MAX_PARTICLE_AFTERIMAGE, MIN_PARTICLE_AFTERIMAGE } from './particle-afterimage.js';
import { MAX_BOKEH_GAMMA, MIN_BOKEH_GAMMA } from './bokeh-response.js';
import { sanitizeBokehShape } from './bokeh-shapes.js';
import { MAX_RING_PARTICLE_SCALE, MIN_RING_PARTICLE_SCALE } from './ring-particles.js';
import { MAX_TRAIL_PARTICLE_SCALE, MIN_TRAIL_PARTICLE_SCALE } from './trail-particles.js';

export const BASE_AIR_DRAG = 0.085;
export const MAX_AIR_DRAG = 4.25;
export const MIN_POST_BURST_LIFETIME = 0.25;
export const MAX_POST_BURST_LIFETIME = 5;
export const MIN_LAUNCH_CENTER_X = -40;
export const MAX_LAUNCH_CENTER_X = 40;
export const MIN_LAUNCH_POSITION_RANGE = 0.1;
export const MAX_LAUNCH_POSITION_RANGE = 2.5;
export const MIN_INITIAL_LAUNCH_POWER = 0.5;
export const MAX_INITIAL_LAUNCH_POWER = 2;
export const MIN_EFFECTIVE_LAUNCH_POWER = 0.25;
export const MAX_EFFECTIVE_LAUNCH_POWER = 2.4;
export const MIN_CAMERA_FOV = 20;
export const MAX_CAMERA_FOV = 110;
export const MIN_BOKEH_SAMPLES = 5;
export const MAX_BOKEH_SAMPLES = 25;

const DEFAULT_SHOW_PROFILE = getShowChoreographyPreset('grand-finale');

export const DEFAULT_STATE = Object.freeze({
  selectedPresetId: 'gold-chrysanthemum',
  launchLayout: 'finale',
  launch: {
    centerX: 0,
    positionRange: 2.5,
    initialPower: 2,
  },
  tool: 'camera',
  camera: {
    fov: 80,
  },
  physics: {
    gravity: 0.1,
    drag: 2.2355,
    particleLifetime: 2.45,
    ringParticleScale: 1,
    trailParticleScale: 2.65,
    windX: 0,
    windZ: 0.1,
    vortex: 0,
  },
  volume: {
    smoke: 0,
    buoyancy: 2.05,
    scattering: 3,
    shadow: 0,
  },
  world: {
    environment: 'lake',
    floor: 'water',
    floorGrid: true,
    waterRoughness: 0.77,
    reflection: 0.68,
  },
  quality: {
    preset: 'high',
    fireworkBrightness: 0.6,
    bloom: true,
    bloomStrength: 0.8,
    bloomRadius: 0.84,
    bloomThreshold: 0.16,
    saturation: 1.15,
    motionBlur: 0,
    particleAfterimage: 0.8,
    depthOfField: true,
    focusDistance: 85,
    focusRange: 160,
    bokehScale: 1.25,
    bokehSamples: 25,
    bokehGamma: 2.25,
    bokehShape: 'hexagon',
    particleBlend: 'additive',
    shadows: false,
    adaptive: false,
    predictiveLoad: true,
    autoTargets: {
      particles: true,
      resolution: true,
      volume: true,
      lighting: true,
      postProcessing: false,
    },
  },
  sound: {
    enabled: true,
    volume: 0.72,
  },
  show: {
    musicVolume: 0.78,
    sensitivity: 0.68,
    density: 0.62,
    variety: 0.78,
    finale: 0.85,
    choreographyPreset: DEFAULT_SHOW_PROFILE.id,
    directionMode: DEFAULT_SHOW_PROFILE.directionMode,
    launchPower: DEFAULT_SHOW_PROFILE.launchPower,
    explosionPower: DEFAULT_SHOW_PROFILE.explosionPower,
    positionSpread: DEFAULT_SHOW_PROFILE.positionSpread,
    sequence: DEFAULT_SHOW_PROFILE.sequence,
    crossfire: DEFAULT_SHOW_PROFILE.crossfire,
    colorVariation: DEFAULT_SHOW_PROFILE.colorVariation,
  },
});

function finite(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function resolveInitialLaunchPower(localPower = 1, globalPower = 1) {
  const local = finite(localPower, 1, MIN_EFFECTIVE_LAUNCH_POWER, MAX_EFFECTIVE_LAUNCH_POWER);
  const global = finite(globalPower, 1, MIN_INITIAL_LAUNCH_POWER, MAX_INITIAL_LAUNCH_POWER);
  return finite(local * global, 1, MIN_EFFECTIVE_LAUNCH_POWER, MAX_EFFECTIVE_LAUNCH_POWER);
}

function integer(value, fallback, min, max) {
  return Math.round(finite(value, fallback, min, max));
}

function allowed(value, values, fallback) {
  return values.includes(value) ? value : fallback;
}

function boolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export function sanitizeState(candidate = {}) {
  const choreographyPreset = allowed(candidate.show?.choreographyPreset, [...SHOW_CHOREOGRAPHY_PRESET_IDS, 'custom'], DEFAULT_STATE.show.choreographyPreset);
  const showProfile = getShowChoreographyPreset(choreographyPreset);
  return {
    selectedPresetId: typeof candidate.selectedPresetId === 'string' ? candidate.selectedPresetId : DEFAULT_STATE.selectedPresetId,
    launchLayout: allowed(candidate.launchLayout, ['single', 'pair', 'fan5', 'arc7', 'horizon9', 'circle8', 'finale'], DEFAULT_STATE.launchLayout),
    launch: {
      centerX: finite(candidate.launch?.centerX, DEFAULT_STATE.launch.centerX, MIN_LAUNCH_CENTER_X, MAX_LAUNCH_CENTER_X),
      positionRange: finite(candidate.launch?.positionRange, DEFAULT_STATE.launch.positionRange, MIN_LAUNCH_POSITION_RANGE, MAX_LAUNCH_POSITION_RANGE),
      initialPower: finite(candidate.launch?.initialPower, DEFAULT_STATE.launch.initialPower, MIN_INITIAL_LAUNCH_POWER, MAX_INITIAL_LAUNCH_POWER),
    },
    tool: allowed(candidate.tool, ['camera', 'gust', 'vortex', 'repel'], DEFAULT_STATE.tool),
    camera: {
      fov: finite(candidate.camera?.fov, DEFAULT_STATE.camera.fov, MIN_CAMERA_FOV, MAX_CAMERA_FOV),
    },
    physics: {
      gravity: finite(candidate.physics?.gravity, DEFAULT_STATE.physics.gravity, 0, 2),
      drag: finite(candidate.physics?.drag, DEFAULT_STATE.physics.drag, 0, MAX_AIR_DRAG),
      particleLifetime: finite(candidate.physics?.particleLifetime, DEFAULT_STATE.physics.particleLifetime, MIN_POST_BURST_LIFETIME, MAX_POST_BURST_LIFETIME),
      ringParticleScale: finite(candidate.physics?.ringParticleScale, DEFAULT_STATE.physics.ringParticleScale, MIN_RING_PARTICLE_SCALE, MAX_RING_PARTICLE_SCALE),
      trailParticleScale: finite(candidate.physics?.trailParticleScale, DEFAULT_STATE.physics.trailParticleScale, MIN_TRAIL_PARTICLE_SCALE, MAX_TRAIL_PARTICLE_SCALE),
      windX: finite(candidate.physics?.windX, DEFAULT_STATE.physics.windX, -8, 8),
      windZ: finite(candidate.physics?.windZ, DEFAULT_STATE.physics.windZ, -8, 8),
      vortex: finite(candidate.physics?.vortex, DEFAULT_STATE.physics.vortex, 0, 2),
    },
    volume: {
      smoke: finite(candidate.volume?.smoke, DEFAULT_STATE.volume.smoke, 0, 1.5),
      buoyancy: finite(candidate.volume?.buoyancy, DEFAULT_STATE.volume.buoyancy, 0, 3),
      scattering: finite(candidate.volume?.scattering, DEFAULT_STATE.volume.scattering, 0, 3),
      shadow: finite(candidate.volume?.shadow, DEFAULT_STATE.volume.shadow, 0, 4),
    },
    world: {
      environment: allowed(candidate.world?.environment, ['lake', 'city', 'alpine', 'cosmic', 'custom'], DEFAULT_STATE.world.environment),
      floor: allowed(candidate.world?.floor, ['matte', 'water', 'none'], DEFAULT_STATE.world.floor),
      floorGrid: boolean(candidate.world?.floorGrid, DEFAULT_STATE.world.floorGrid),
      waterRoughness: finite(candidate.world?.waterRoughness, DEFAULT_STATE.world.waterRoughness, 0, 1),
      reflection: finite(candidate.world?.reflection, DEFAULT_STATE.world.reflection, 0, 1.2),
    },
    quality: {
      preset: allowed(candidate.quality?.preset, ['auto', 'high', 'medium', 'low'], DEFAULT_STATE.quality.preset),
      fireworkBrightness: finite(candidate.quality?.fireworkBrightness, DEFAULT_STATE.quality.fireworkBrightness, 0.1, 3),
      bloom: boolean(candidate.quality?.bloom, DEFAULT_STATE.quality.bloom),
      bloomStrength: finite(candidate.quality?.bloomStrength, DEFAULT_STATE.quality.bloomStrength, 0, 3),
      bloomRadius: finite(candidate.quality?.bloomRadius, DEFAULT_STATE.quality.bloomRadius, 0, 1),
      bloomThreshold: finite(candidate.quality?.bloomThreshold, DEFAULT_STATE.quality.bloomThreshold, 0, 2),
      saturation: finite(candidate.quality?.saturation, DEFAULT_STATE.quality.saturation, 0, 2),
      motionBlur: finite(candidate.quality?.motionBlur, DEFAULT_STATE.quality.motionBlur, 0, 3),
      particleAfterimage: finite(candidate.quality?.particleAfterimage, DEFAULT_STATE.quality.particleAfterimage, MIN_PARTICLE_AFTERIMAGE, MAX_PARTICLE_AFTERIMAGE),
      depthOfField: boolean(candidate.quality?.depthOfField, DEFAULT_STATE.quality.depthOfField),
      focusDistance: finite(candidate.quality?.focusDistance, DEFAULT_STATE.quality.focusDistance, 2, 300),
      focusRange: finite(candidate.quality?.focusRange, DEFAULT_STATE.quality.focusRange, 1, 160),
      bokehScale: finite(candidate.quality?.bokehScale, DEFAULT_STATE.quality.bokehScale, 0, 2),
      bokehSamples: integer(candidate.quality?.bokehSamples, DEFAULT_STATE.quality.bokehSamples, MIN_BOKEH_SAMPLES, MAX_BOKEH_SAMPLES),
      bokehGamma: finite(candidate.quality?.bokehGamma, DEFAULT_STATE.quality.bokehGamma, MIN_BOKEH_GAMMA, MAX_BOKEH_GAMMA),
      bokehShape: sanitizeBokehShape(candidate.quality?.bokehShape, DEFAULT_STATE.quality.bokehShape),
      particleBlend: allowed(candidate.quality?.particleBlend, ['additive', 'screen', 'alpha'], DEFAULT_STATE.quality.particleBlend),
      shadows: boolean(candidate.quality?.shadows, DEFAULT_STATE.quality.shadows),
      adaptive: boolean(candidate.quality?.adaptive, DEFAULT_STATE.quality.adaptive),
      predictiveLoad: boolean(candidate.quality?.predictiveLoad, DEFAULT_STATE.quality.predictiveLoad),
      autoTargets: Object.fromEntries(Object.keys(DEFAULT_OPTIMIZATION_TARGETS).map((key) => [key, boolean(candidate.quality?.autoTargets?.[key], DEFAULT_STATE.quality.autoTargets[key])])),
    },
    sound: {
      enabled: boolean(candidate.sound?.enabled, DEFAULT_STATE.sound.enabled),
      volume: finite(candidate.sound?.volume, DEFAULT_STATE.sound.volume, 0, 1),
    },
    show: {
      musicVolume: finite(candidate.show?.musicVolume, DEFAULT_STATE.show.musicVolume, 0, 1),
      sensitivity: finite(candidate.show?.sensitivity, DEFAULT_STATE.show.sensitivity, 0, 1),
      density: finite(candidate.show?.density, DEFAULT_STATE.show.density, 0.1, 1),
      variety: finite(candidate.show?.variety, DEFAULT_STATE.show.variety, 0, 1),
      finale: finite(candidate.show?.finale, DEFAULT_STATE.show.finale, 0, 1),
      choreographyPreset,
      directionMode: allowed(candidate.show?.directionMode, SHOW_DIRECTION_IDS, showProfile.directionMode),
      launchPower: finite(candidate.show?.launchPower, showProfile.launchPower, 0.5, 1.6),
      explosionPower: finite(candidate.show?.explosionPower, showProfile.explosionPower, 0.5, 1.6),
      positionSpread: finite(candidate.show?.positionSpread, showProfile.positionSpread, 0, 1.5),
      sequence: finite(candidate.show?.sequence, showProfile.sequence, 0, 1),
      crossfire: finite(candidate.show?.crossfire, showProfile.crossfire, 0, 1),
      colorVariation: finite(candidate.show?.colorVariation, showProfile.colorVariation, 0, 1),
    },
  };
}

export function createAppState(storage = globalThis.localStorage) {
  let initial = DEFAULT_STATE;
  try {
    const saved = storage?.getItem('pyroverse-state-v1');
    if (saved) initial = sanitizeState(JSON.parse(saved));
  } catch {
    initial = DEFAULT_STATE;
  }

  const state = sanitizeState(initial);
  const listeners = new Set();

  function notify(path, value) {
    for (const listener of listeners) listener({ state, path, value });
    try { storage?.setItem('pyroverse-state-v1', JSON.stringify(state)); } catch { /* storage is optional */ }
  }

  function set(path, value) {
    const parts = path.split('.');
    let cursor = state;
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!cursor[parts[index]] || typeof cursor[parts[index]] !== 'object') cursor[parts[index]] = {};
      cursor = cursor[parts[index]];
    }
    cursor[parts.at(-1)] = value;
    const clean = sanitizeState(state);
    Object.assign(state, clean);
    notify(path, value);
  }

  return {
    state,
    set,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      Object.assign(state, structuredClone(DEFAULT_STATE));
      notify('*', state);
    },
    export() {
      return JSON.stringify({ version: 1, state: sanitizeState(state) }, null, 2);
    },
  };
}
