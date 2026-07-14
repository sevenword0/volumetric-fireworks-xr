export const PALETTES = Object.freeze({
  solar: ['#fff4c7', '#ffd36a', '#ff8a3d'],
  aurora: ['#77fff0', '#54b8ff', '#9d77ff'],
  hanabi: ['#f8fbff', '#5da8ff', '#3158ff'],
  ruby: ['#fff2dc', '#ff6d78', '#cc174e'],
  emerald: ['#eaffd1', '#62f59f', '#18a76d'],
  amethyst: ['#ffd8ff', '#d775ff', '#7c4dff'],
  titanium: ['#ffffff', '#cae6ff', '#6aa9d8'],
  ember: ['#fff0c0', '#ff9a44', '#c33b24'],
  neon: ['#63f4ff', '#ff6bd6', '#ffe76e'],
  rainbow: ['#ff4f71', '#ffb44a', '#f6f46a', '#55ec9b', '#4db9ff', '#b16cff'],
  moon: ['#ffffff', '#dce9ff', '#9db4d7'],
  jadeGold: ['#70ffd0', '#ccff8b', '#ffc45e'],
  roseGold: ['#fff0df', '#ff9fa4', '#f0ad64'],
  deepSea: ['#d8fbff', '#3bdcff', '#1772ff'],
});

export const PATTERN_OPTIONS = Object.freeze([
  ['peony', '구형 피오니'],
  ['chrysanthemum', '국화형'],
  ['dahlia', '달리아'],
  ['ring', '링'],
  ['doubleRing', '이중 링'],
  ['saturn', '새턴'],
  ['palm', '야자수'],
  ['willow', '수양버들'],
  ['horsetail', '말꼬리'],
  ['spider', '스파이더'],
  ['crossette', '크로세트'],
  ['heart', '하트'],
  ['star', '별'],
  ['smiley', '스마일'],
  ['spiral', '나선'],
  ['helix', '이중 나선'],
  ['butterfly', '나비'],
  ['galaxy', '은하'],
]);

export const STAR_OPTIONS = Object.freeze([
  ['clean', '클린 스타'],
  ['comet', '코멧 테일'],
  ['brocade', '브로케이드'],
  ['glitter', '글리터'],
  ['strobe', '스트로브'],
  ['crackle', '크랙클'],
  ['falling', '폴링 리프'],
  ['goGetter', '고게터'],
]);

export const PISTIL_OPTIONS = Object.freeze([
  ['none', '없음'],
  ['single', '단일 중심핵'],
  ['double', '이중 중심핵'],
  ['ring', '중심 링'],
  ['crackle', '크랙클 코어'],
]);

export const PALETTE_OPTIONS = Object.freeze([
  ['solar', '솔라 골드'],
  ['aurora', '오로라'],
  ['hanabi', '하나비 블루'],
  ['ruby', '루비'],
  ['emerald', '에메랄드'],
  ['amethyst', '자수정'],
  ['titanium', '티타늄 실버'],
  ['ember', '앰버'],
  ['neon', '네온 트라이어드'],
  ['rainbow', '레인보우'],
  ['moon', '문라이트'],
  ['jadeGold', '비취 골드'],
  ['roseGold', '로즈 골드'],
  ['deepSea', '딥 시'],
]);

const DEFAULTS = Object.freeze({
  category: 'shell',
  pattern: 'peony',
  star: 'clean',
  palette: 'solar',
  count: 170,
  burstSpeed: 13,
  life: 3.1,
  size: 0.14,
  drag: 0.085,
  gravityScale: 1,
  trail: 0.35,
  trailRate: 18,
  strobe: 0,
  crackle: 0,
  split: 0,
  splitDelay: 0.64,
  colorShift: true,
  pistil: 'none',
  smoke: 0.55,
  light: 1,
  launchVelocity: 31,
  fuse: 2.1,
  multiBreak: 1,
});

function preset(id, name, nameEn, options = {}) {
  const merged = {
    ...DEFAULTS,
    ...options,
    id,
    name,
    nameEn,
  };
  merged.colors = [...(options.colors ?? PALETTES[merged.palette] ?? PALETTES.solar)];
  return Object.freeze(merged);
}

export const FIREWORK_PRESETS = Object.freeze([
  preset('gold-chrysanthemum', '황금 국화', 'Golden Chrysanthemum', { pattern: 'chrysanthemum', star: 'brocade', count: 230, life: 4.1, trail: 0.86, trailRate: 26, burstSpeed: 14.5, drag: 0.095, smoke: 0.8 }),
  preset('blue-peony', '하나비 청색 피오니', 'Hanabi Blue Peony', { palette: 'hanabi', count: 210, burstSpeed: 15, trail: 0.08, light: 1.15 }),
  preset('ruby-pistil', '루비 피오니 · 은빛 심', 'Ruby Peony Pistil', { palette: 'ruby', count: 190, pistil: 'single', trail: 0.16, burstSpeed: 14.2 }),
  preset('emerald-dahlia', '에메랄드 달리아', 'Emerald Dahlia', { pattern: 'dahlia', palette: 'emerald', count: 72, size: 0.22, burstSpeed: 16.5, life: 3.6, trail: 0.25 }),
  preset('aurora-shell', '오로라 컬러웨이브', 'Aurora Color Wave', { palette: 'aurora', count: 240, trail: 0.45, colorShift: true, burstSpeed: 13.5, life: 3.8 }),
  preset('double-pistil', '이중 중심핵 피오니', 'Double Pistil Peony', { palette: 'neon', pistil: 'double', count: 210, trail: 0.12, light: 1.2 }),

  preset('willow-crown', '가무로 금관', 'Kamuro Crown', { category: 'cascade', pattern: 'willow', star: 'brocade', count: 250, burstSpeed: 10.5, life: 6.4, drag: 0.13, gravityScale: 0.72, trail: 1, trailRate: 34, smoke: 1.1 }),
  preset('silver-willow', '은빛 수양버들', 'Silver Weeping Willow', { category: 'cascade', pattern: 'willow', palette: 'titanium', star: 'comet', count: 210, life: 5.8, burstSpeed: 10.8, trail: 0.95, trailRate: 32, drag: 0.12 }),
  preset('brocade-crown', '브로케이드 크라운', 'Brocade Crown', { category: 'cascade', pattern: 'chrysanthemum', palette: 'roseGold', star: 'brocade', count: 280, life: 5.1, burstSpeed: 12, trail: 1, trailRate: 35, drag: 0.11 }),
  preset('horsetail', '티타늄 호스테일', 'Titanium Horsetail', { category: 'cascade', pattern: 'horsetail', palette: 'titanium', star: 'comet', count: 110, burstSpeed: 7.2, life: 4.7, trail: 0.95, trailRate: 30, gravityScale: 1.2 }),
  preset('time-rain', '골든 타임 레인', 'Golden Time Rain', { category: 'cascade', pattern: 'willow', star: 'glitter', count: 190, life: 6.2, burstSpeed: 8.4, trail: 0.7, strobe: 0.28, drag: 0.14 }),
  preset('falling-leaves', '달빛 낙엽', 'Moon Falling Leaves', { category: 'cascade', pattern: 'dahlia', palette: 'moon', star: 'falling', count: 82, life: 7, burstSpeed: 9.5, trail: 0.18, strobe: 0.42, drag: 0.19, gravityScale: 0.5 }),

  preset('crossette', '사파이어 크로세트', 'Sapphire Crossette', { category: 'split', pattern: 'crossette', palette: 'deepSea', star: 'comet', count: 52, split: 4, splitDelay: 0.52, life: 3.8, burstSpeed: 15.8, trail: 0.58, crackle: 0.15 }),
  preset('crackle-chrys', '크랙클 국화', 'Crackling Chrysanthemum', { category: 'split', pattern: 'chrysanthemum', palette: 'ember', star: 'crackle', count: 210, crackle: 0.8, trail: 0.76, life: 4.1, smoke: 1.2 }),
  preset('dragon-eggs', '드래곤 에그', 'Dragon Eggs', { category: 'split', pattern: 'dahlia', palette: 'ember', star: 'crackle', count: 68, crackle: 1, split: 3, splitDelay: 0.72, size: 0.2, life: 3.6 }),
  preset('white-strobe', '백색 스트로브', 'White Strobe', { category: 'split', pattern: 'peony', palette: 'titanium', star: 'strobe', count: 230, strobe: 0.88, trail: 0.08, life: 4.5, drag: 0.12 }),
  preset('red-glitter', '루비 글리터', 'Ruby Glitter', { category: 'split', pattern: 'peony', palette: 'ruby', star: 'glitter', count: 240, strobe: 0.52, trail: 0.35, life: 4.2 }),
  preset('go-getters', '네온 고게터', 'Neon Go-getters', { category: 'split', pattern: 'dahlia', palette: 'neon', star: 'goGetter', count: 46, burstSpeed: 13, life: 4.4, trail: 0.72, vortexSeek: 1.4 }),

  preset('rainbow-ring', '레인보우 링', 'Rainbow Ring', { category: 'shape', pattern: 'ring', palette: 'rainbow', count: 150, burstSpeed: 15.5, life: 3.3, trail: 0.15 }),
  preset('double-ring', '오로라 이중 링', 'Aurora Double Ring', { category: 'shape', pattern: 'doubleRing', palette: 'aurora', count: 190, burstSpeed: 14.5, trail: 0.28, life: 3.6 }),
  preset('saturn', '비취 새턴', 'Jade Saturn', { category: 'shape', pattern: 'saturn', palette: 'jadeGold', count: 220, pistil: 'single', burstSpeed: 14, trail: 0.28, life: 3.8 }),
  preset('heart', '루비 하트', 'Ruby Heart', { category: 'shape', pattern: 'heart', palette: 'ruby', count: 180, burstSpeed: 12.8, life: 3.5, trail: 0.23, gravityScale: 0.65 }),
  preset('star-shape', '티타늄 오각성', 'Titanium Star', { category: 'shape', pattern: 'star', palette: 'titanium', count: 170, burstSpeed: 14.8, trail: 0.32, gravityScale: 0.72 }),
  preset('smiley', '스마일 피오니', 'Smiley Shell', { category: 'shape', pattern: 'smiley', palette: 'solar', count: 150, burstSpeed: 13.5, trail: 0.05, gravityScale: 0.68 }),
  preset('butterfly', '자수정 나비', 'Amethyst Butterfly', { category: 'shape', pattern: 'butterfly', palette: 'amethyst', count: 190, burstSpeed: 13.5, trail: 0.3, gravityScale: 0.75 }),
  preset('spiral', '네온 나선', 'Neon Spiral', { category: 'shape', pattern: 'spiral', palette: 'neon', count: 220, burstSpeed: 14, trail: 0.7, vortexSeek: 1.1, life: 4 }),
  preset('double-helix', '오로라 이중 나선', 'Aurora Double Helix', { category: 'shape', pattern: 'helix', palette: 'aurora', count: 240, burstSpeed: 13, trail: 0.65, vortexSeek: 1.5, life: 4.2 }),

  preset('spider', '티타늄 스파이더', 'Titanium Spider', { category: 'art', pattern: 'spider', palette: 'titanium', count: 84, burstSpeed: 19, life: 4.3, size: 0.2, trail: 0.94, trailRate: 32, drag: 0.055 }),
  preset('palm', '앰버 팜', 'Amber Palm', { category: 'art', pattern: 'palm', palette: 'ember', count: 44, burstSpeed: 15.5, life: 4.6, size: 0.23, trail: 0.95, trailRate: 33, pistil: 'single' }),
  preset('ghost-shell', '고스트 컬러 체이스', 'Ghost Color Chase', { category: 'art', pattern: 'peony', palette: 'rainbow', count: 260, burstSpeed: 13.2, life: 4.2, trail: 0.26, ghost: true, colorShift: true }),
  preset('galaxy', '갤럭시 소용돌이', 'Galaxy Vortex', { category: 'art', pattern: 'galaxy', palette: 'aurora', count: 320, burstSpeed: 12.5, life: 5.1, trail: 0.55, vortexSeek: 2.1, drag: 0.075, smoke: 1 }),
  preset('multi-break', '삼중 부케', 'Triple-break Bouquet', { category: 'art', pattern: 'peony', palette: 'roseGold', count: 110, burstSpeed: 11.5, life: 3.7, trail: 0.3, multiBreak: 3, pistil: 'single' }),

  preset('fan-mine', '오로라 팬 마인', 'Aurora Fan Mine', { category: 'ground', pattern: 'mine', palette: 'aurora', count: 150, burstSpeed: 18, life: 2.6, trail: 0.82, trailRate: 28, fuse: 0, launchVelocity: 0, gravityScale: 1.15 }),
  preset('comet-chase', '골든 코멧 체이스', 'Golden Comet Chase', { category: 'ground', pattern: 'cometFan', palette: 'solar', count: 9, burstSpeed: 23, life: 3.2, size: 0.28, trail: 1, trailRate: 38, fuse: 0, launchVelocity: 0 }),
  preset('roman-candle', '네온 로만 캔들', 'Neon Roman Candle', { category: 'ground', pattern: 'romanCandle', palette: 'neon', count: 12, burstSpeed: 19, life: 2.8, size: 0.22, trail: 0.8, fuse: 0, launchVelocity: 0, repeat: 7 }),
  preset('waterfall', '실버 나이아가라', 'Silver Waterfall', { category: 'ground', pattern: 'waterfall', palette: 'titanium', count: 190, burstSpeed: 5.5, life: 6.4, trail: 1, trailRate: 34, fuse: 0, launchVelocity: 0, gravityScale: 1.25 }),
]);

export const PRESET_BY_ID = new Map(FIREWORK_PRESETS.map((entry) => [entry.id, entry]));

export const LAUNCH_LAYOUTS = Object.freeze({
  single: [{ x: 0, z: 0, delay: 0, yaw: 0 }],
  pair: [
    { x: -8, z: 0, delay: 0, yaw: 0.12 },
    { x: 8, z: 0, delay: 0, yaw: -0.12 },
  ],
  fan5: Array.from({ length: 5 }, (_, index) => ({
    x: (index - 2) * 4,
    z: Math.abs(index - 2) * 1.5,
    delay: index * 0.07,
    yaw: (index - 2) * -0.12,
  })),
  arc7: Array.from({ length: 7 }, (_, index) => ({
    x: (index - 3) * 4.5,
    z: Math.abs(index - 3) * 1.1,
    delay: Math.abs(index - 3) * 0.11,
    yaw: (index - 3) * -0.065,
  })),
  horizon9: Array.from({ length: 9 }, (_, index) => ({
    x: (index - 4) * 4.2,
    z: Math.sin(index * 1.2) * 2,
    delay: index * 0.13,
    yaw: Math.sin(index) * 0.1,
  })),
  circle8: Array.from({ length: 8 }, (_, index) => {
    const angle = (index / 8) * Math.PI * 2;
    return { x: Math.cos(angle) * 14, z: Math.sin(angle) * 9, delay: index * 0.08, yaw: -angle * 0.08 };
  }),
  finale: Array.from({ length: 13 }, (_, index) => ({
    x: (index - 6) * 3.6,
    z: (index % 2) * 2.2,
    delay: (index % 3) * 0.08,
    yaw: (index - 6) * -0.025,
  })),
});

export function createCustomPreset(options = {}) {
  const palette = options.palette ?? 'aurora';
  return preset(`custom-${Date.now()}`, options.name ?? '나만의 불꽃', 'Custom Shell', {
    category: 'custom',
    pattern: options.pattern ?? 'peony',
    star: options.star ?? 'comet',
    pistil: options.pistil ?? 'single',
    palette,
    count: Number(options.count ?? 180),
    burstSpeed: 13 * Number(options.burstScale ?? 1),
    life: Number(options.life ?? 3.2),
    trail: Number(options.trail ?? 0.65),
    strobe: options.strobe ? 0.76 : 0,
    split: options.split ? 4 : 0,
    colorShift: options.colorShift !== false,
    smoke: 0.65 + Number(options.trail ?? 0.65) * 0.35,
  });
}

