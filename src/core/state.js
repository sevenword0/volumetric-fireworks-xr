export const DEFAULT_STATE = Object.freeze({
  selectedPresetId: 'gold-chrysanthemum',
  launchLayout: 'single',
  tool: 'camera',
  physics: {
    gravity: 1,
    drag: 0.085,
    windX: 1.6,
    windZ: 0.3,
    vortex: 0.42,
  },
  volume: {
    smoke: 0.7,
    buoyancy: 1.1,
    scattering: 1.25,
    shadow: 1.6,
  },
  world: {
    environment: 'lake',
    floor: 'water',
    waterRoughness: 0.22,
    reflection: 0.72,
  },
  quality: {
    preset: 'auto',
    fireworkBrightness: 1,
    bloom: true,
    bloomStrength: 0.55,
    bloomRadius: 0.58,
    bloomThreshold: 0.78,
    saturation: 1,
    motionBlur: 0.35,
    particleBlend: 'additive',
    shadows: true,
    adaptive: true,
    predictiveLoad: true,
  },
  sound: {
    enabled: true,
    volume: 0.72,
  },
  show: {
    sensitivity: 0.68,
    density: 0.62,
    variety: 0.78,
    finale: 0.85,
  },
});

function finite(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function allowed(value, values, fallback) {
  return values.includes(value) ? value : fallback;
}

export function sanitizeState(candidate = {}) {
  return {
    selectedPresetId: typeof candidate.selectedPresetId === 'string' ? candidate.selectedPresetId : DEFAULT_STATE.selectedPresetId,
    launchLayout: allowed(candidate.launchLayout, ['single', 'pair', 'fan5', 'arc7', 'horizon9', 'circle8', 'finale'], DEFAULT_STATE.launchLayout),
    tool: allowed(candidate.tool, ['camera', 'gust', 'vortex', 'repel'], DEFAULT_STATE.tool),
    physics: {
      gravity: finite(candidate.physics?.gravity, DEFAULT_STATE.physics.gravity, 0, 2),
      drag: finite(candidate.physics?.drag, DEFAULT_STATE.physics.drag, 0, 0.3),
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
      waterRoughness: finite(candidate.world?.waterRoughness, DEFAULT_STATE.world.waterRoughness, 0, 1),
      reflection: finite(candidate.world?.reflection, DEFAULT_STATE.world.reflection, 0, 1.2),
    },
    quality: {
      preset: allowed(candidate.quality?.preset, ['auto', 'high', 'medium', 'low'], DEFAULT_STATE.quality.preset),
      fireworkBrightness: finite(candidate.quality?.fireworkBrightness, DEFAULT_STATE.quality.fireworkBrightness, 0.1, 3),
      bloom: candidate.quality?.bloom !== false,
      bloomStrength: finite(candidate.quality?.bloomStrength, DEFAULT_STATE.quality.bloomStrength, 0, 3),
      bloomRadius: finite(candidate.quality?.bloomRadius, DEFAULT_STATE.quality.bloomRadius, 0, 1),
      bloomThreshold: finite(candidate.quality?.bloomThreshold, DEFAULT_STATE.quality.bloomThreshold, 0, 2),
      saturation: finite(candidate.quality?.saturation, DEFAULT_STATE.quality.saturation, 0, 2),
      motionBlur: finite(candidate.quality?.motionBlur, DEFAULT_STATE.quality.motionBlur, 0, 3),
      particleBlend: allowed(candidate.quality?.particleBlend, ['additive', 'screen', 'alpha'], DEFAULT_STATE.quality.particleBlend),
      shadows: candidate.quality?.shadows !== false,
      adaptive: candidate.quality?.adaptive !== false,
      predictiveLoad: candidate.quality?.predictiveLoad !== false,
    },
    sound: {
      enabled: candidate.sound?.enabled !== false,
      volume: finite(candidate.sound?.volume, DEFAULT_STATE.sound.volume, 0, 1),
    },
    show: {
      sensitivity: finite(candidate.show?.sensitivity, DEFAULT_STATE.show.sensitivity, 0, 1),
      density: finite(candidate.show?.density, DEFAULT_STATE.show.density, 0.1, 1),
      variety: finite(candidate.show?.variety, DEFAULT_STATE.show.variety, 0, 1),
      finale: finite(candidate.show?.finale, DEFAULT_STATE.show.finale, 0, 1),
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
