const PROFILE_DEFINITIONS = [
  {
    id: 'balanced',
    label: '밸런스드 스테이지',
    description: '음역에 따라 좌우와 중앙을 고르게 사용하는 기본 연출',
    directionMode: 'music',
    launchPower: 1,
    explosionPower: 1,
    positionSpread: 0.72,
    sequence: 0.38,
    crossfire: 0.24,
    colorVariation: 0.58,
    previewLayout: 'fan5',
    previewPresetId: 'aurora-shell',
  },
  {
    id: 'cinematic',
    label: '시네마틱 빌드업',
    description: '넓은 무대와 큰 폭발로 서서히 고조되는 연출',
    directionMode: 'music',
    launchPower: 1.08,
    explosionPower: 1.18,
    positionSpread: 0.94,
    sequence: 0.3,
    crossfire: 0.2,
    colorVariation: 0.48,
    previewLayout: 'arc7',
    previewPresetId: 'brocade-crown',
  },
  {
    id: 'beat-chase',
    label: '비트 체이스',
    description: '좌우를 빠르게 오가는 순차 발사 중심의 리듬 연출',
    directionMode: 'alternate',
    launchPower: 1.14,
    explosionPower: 0.94,
    positionSpread: 0.8,
    sequence: 0.84,
    crossfire: 0.18,
    colorVariation: 0.44,
    previewLayout: 'horizon9',
    previewPresetId: 'go-getters',
  },
  {
    id: 'crossfire',
    label: '크로스 파이어',
    description: '양쪽 발사대가 중앙을 향해 교차하는 입체 연출',
    directionMode: 'cross',
    launchPower: 1.1,
    explosionPower: 1.06,
    positionSpread: 1.08,
    sequence: 0.48,
    crossfire: 0.88,
    colorVariation: 0.56,
    previewLayout: 'fan5',
    previewPresetId: 'crossette',
  },
  {
    id: 'kaleidoscope',
    label: '컬러 만화경',
    description: '방사형 발사와 큐별 팔레트 변주를 강조한 연출',
    directionMode: 'radial',
    launchPower: 1.02,
    explosionPower: 1.02,
    positionSpread: 0.9,
    sequence: 0.56,
    crossfire: 0.34,
    colorVariation: 1,
    previewLayout: 'circle8',
    previewPresetId: 'rainbow-ring',
  },
  {
    id: 'grand-finale',
    label: '그랜드 피날레',
    description: '높고 넓은 발사와 강한 폭발을 겹치는 피날레형 연출',
    directionMode: 'radial',
    launchPower: 1.24,
    explosionPower: 1.34,
    positionSpread: 1.18,
    sequence: 0.22,
    crossfire: 0.64,
    colorVariation: 0.74,
    previewLayout: 'finale',
    previewPresetId: 'galaxy',
  },
];

export const SHOW_DIRECTION_OPTIONS = Object.freeze([
  ['music', '음악 반응'],
  ['vertical', '수직 집중'],
  ['left', '왼쪽 → 중앙'],
  ['right', '오른쪽 → 중앙'],
  ['alternate', '좌우 교대'],
  ['cross', '중앙 교차'],
  ['radial', '방사형 회전'],
]);

export const SHOW_CHOREOGRAPHY_PRESETS = Object.freeze(
  PROFILE_DEFINITIONS.map((profile) => Object.freeze({ ...profile })),
);

export const DEFAULT_SHOW_CHOREOGRAPHY = SHOW_CHOREOGRAPHY_PRESETS[0];
export const SHOW_CHOREOGRAPHY_PRESET_IDS = Object.freeze(SHOW_CHOREOGRAPHY_PRESETS.map((profile) => profile.id));
export const SHOW_DIRECTION_IDS = Object.freeze(SHOW_DIRECTION_OPTIONS.map(([id]) => id));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function getShowChoreographyPreset(id = DEFAULT_SHOW_CHOREOGRAPHY.id) {
  return SHOW_CHOREOGRAPHY_PRESETS.find((profile) => profile.id === id) ?? DEFAULT_SHOW_CHOREOGRAPHY;
}

export function resolveShowChoreography(settings = {}) {
  const profile = getShowChoreographyPreset(settings.choreographyPreset);
  const directionMode = SHOW_DIRECTION_IDS.includes(settings.directionMode) ? settings.directionMode : profile.directionMode;
  return {
    presetId: settings.choreographyPreset === 'custom'
      ? 'custom'
      : SHOW_CHOREOGRAPHY_PRESET_IDS.includes(settings.choreographyPreset) ? settings.choreographyPreset : profile.id,
    directionMode,
    launchPower: clamp(finite(settings.launchPower, profile.launchPower), 0.5, 1.6),
    explosionPower: clamp(finite(settings.explosionPower, profile.explosionPower), 0.5, 1.6),
    positionSpread: clamp(finite(settings.positionSpread, profile.positionSpread), 0, 1.5),
    sequence: clamp(finite(settings.sequence, profile.sequence), 0, 1),
    crossfire: clamp(finite(settings.crossfire, profile.crossfire), 0, 1),
    colorVariation: clamp(finite(settings.colorVariation, profile.colorVariation), 0, 1),
  };
}

function stagePosition(cue, index, total, settings, random) {
  const spread = settings.positionSpread * 24;
  const alternating = index % 2 === 0 ? -1 : 1;
  const energy = clamp(finite(cue.energy, 0.7) / 1.4, 0, 1);
  const lane = ((((index * 5) % 7) - 3) / 3) * (0.62 + random() * 0.38);
  const depth = (random() - 0.5) * spread * 0.28;
  let x = lane * spread;
  let z = depth;
  let yaw = -Math.sign(x || 1) * (0.16 + energy * 0.18);

  if (settings.directionMode === 'vertical') {
    x = lane * spread * 0.25;
    z *= 0.25;
    yaw = 0;
  } else if (settings.directionMode === 'left') {
    x = -spread * (0.55 + random() * 0.35);
    yaw = 0.36 + energy * 0.3;
  } else if (settings.directionMode === 'right') {
    x = spread * (0.55 + random() * 0.35);
    yaw = -(0.36 + energy * 0.3);
  } else if (settings.directionMode === 'alternate') {
    x = alternating * spread * (0.4 + random() * 0.48);
    yaw = -alternating * (0.3 + energy * 0.34);
  } else if (settings.directionMode === 'cross') {
    x = alternating * spread * (0.62 + random() * 0.28);
    z *= 0.45;
    yaw = -alternating * (0.56 + energy * 0.24);
  } else if (settings.directionMode === 'radial') {
    const angle = (index / Math.max(1, total)) * Math.PI * 2 + random() * 0.42;
    x = Math.cos(angle) * spread * (0.58 + random() * 0.32);
    z = Math.sin(angle) * spread * 0.42;
    yaw = -Math.sign(x || Math.cos(angle) || 1) * (0.24 + Math.abs(Math.cos(angle)) * 0.44);
  } else if (cue.band === 'bass' || cue.band === 'finale') {
    x = lane * spread * (cue.band === 'finale' ? 0.9 : 0.36);
    yaw = -Math.sign(x || 1) * (0.18 + energy * 0.2);
  } else if (cue.band === 'high') {
    x = alternating * spread * (0.48 + random() * 0.42);
    yaw = -alternating * (0.28 + energy * 0.28);
  } else {
    x = lane * spread * 0.72;
  }

  return { x: round(x, 3), z: round(z, 3), yaw: round(yaw, 4) };
}

export function applyShowChoreography(cues, settings = {}, random = Math.random) {
  const resolved = resolveShowChoreography(settings);
  const total = Math.max(1, cues.length);
  return cues.map((cue, index) => {
    const position = stagePosition(cue, index, total, resolved, random);
    const energy = clamp(finite(cue.energy, 0.7) / 1.4, 0, 1);
    const finaleBoost = cue.band === 'finale' ? 1.06 : 1;
    const launchPower = clamp(resolved.launchPower * (0.9 + energy * 0.18) * finaleBoost, 0.5, 1.8);
    const explosionPower = clamp(resolved.explosionPower * (0.84 + energy * 0.25) * finaleBoost, 0.5, 1.8);
    const sequenceDelay = resolved.sequence * (0.025 + (1 - energy) * 0.105);
    const layoutSize = cue.layout === 'finale' ? 13 : cue.layout === 'horizon9' ? 9 : cue.layout === 'circle8' ? 8 : cue.layout === 'arc7' ? 7 : cue.layout === 'fan5' ? 5 : cue.layout === 'pair' ? 2 : 1;
    const crossChance = clamp(resolved.crossfire * (0.58 + energy * 0.42) + (resolved.directionMode === 'cross' ? 0.18 : 0), 0, 1);
    const crossEligible = layoutSize <= 5 || resolved.crossfire >= 0.94;
    const crossLaunch = crossEligible && random() < crossChance;
    const huePhase = ((index * 0.173 + random() * 0.34) % 1) - 0.5;

    return {
      ...cue,
      choreography: {
        presetId: resolved.presetId,
        directionMode: resolved.directionMode,
        launchX: position.x,
        launchZ: position.z,
        launchYaw: position.yaw,
        launchPower: round(launchPower),
        explosionPower: round(explosionPower),
        positionSpread: resolved.positionSpread,
        sequenceDelay: round(sequenceDelay),
        crossLaunch,
        colorHue: round(huePhase * resolved.colorVariation),
        colorVariation: resolved.colorVariation,
      },
    };
  });
}

export function createChoreographyPreviewCue(settings = {}, index = 0, random = Math.random) {
  const profile = getShowChoreographyPreset(settings.choreographyPreset);
  const safeIndex = Math.max(0, Math.floor(finite(index, 0)));
  const previewCues = Array.from({ length: safeIndex + 1 }, (_, cueIndex) => ({
    id: `preview-${cueIndex + 1}`,
    time: 0,
    burstTime: 2.08,
    presetId: profile.previewPresetId,
    layout: profile.previewLayout,
    energy: 1.05,
    band: cueIndex % 4 === 3 ? 'finale' : cueIndex % 2 === 0 ? 'mid' : 'high',
  }));
  return applyShowChoreography(previewCues, settings, random)[safeIndex];
}
