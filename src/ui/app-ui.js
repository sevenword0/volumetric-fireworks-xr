import {
  FIREWORK_PRESETS,
  PALETTES,
  PALETTE_OPTIONS,
  PATTERN_OPTIONS,
  PISTIL_OPTIONS,
  STAR_OPTIONS,
  createCustomPreset,
} from '../pyro/presets.js';
import { generateBurstDirections } from '../pyro/patterns.js';
import { resolveRingParticleProfile } from '../core/ring-particles.js';
import { copyTextToClipboard } from '../core/clipboard.js';
import {
  SHOW_CHOREOGRAPHY_PRESETS,
  SHOW_DIRECTION_OPTIONS,
  createChoreographyPreviewCue,
  getShowChoreographyPreset,
} from '../audio/show-choreography.js';
import { BASE_AIR_DRAG } from '../core/state.js';

const FORMATTERS = {
  'camera.fov': (value) => `${Math.round(value)}°`,
  'launch.centerX': (value) => `${Math.round(value)}m`,
  'launch.positionRange': (value) => `${Math.round(value * 100)}%`,
  'launch.initialPower': (value) => `${Math.round(value * 100)}%`,
  'physics.gravity': (value) => `${value.toFixed(2)} g`,
  'physics.drag': (value) => `${(value / BASE_AIR_DRAG).toFixed(2)}×`,
  'physics.particleLifetime': (value) => `${value.toFixed(2)}×`,
  'physics.ringParticleScale': (value) => `${Math.round(value * 100)}%`,
  'physics.windX': (value) => value.toFixed(1),
  'physics.windZ': (value) => value.toFixed(1),
  'physics.vortex': (value) => value.toFixed(2),
  'volume.smoke': (value) => value.toFixed(2),
  'volume.buoyancy': (value) => value.toFixed(2),
  'volume.scattering': (value) => value.toFixed(2),
  'volume.shadow': (value) => value.toFixed(2),
  'world.waterRoughness': (value) => value.toFixed(2),
  'world.reflection': (value) => value.toFixed(2),
  'quality.fireworkBrightness': (value) => `${Math.round(value * 100)}%`,
  'quality.bloomStrength': (value) => `${value.toFixed(2)}×`,
  'quality.bloomRadius': (value) => value.toFixed(2),
  'quality.bloomThreshold': (value) => value.toFixed(2),
  'quality.saturation': (value) => `${Math.round(value * 100)}%`,
  'quality.motionBlur': (value) => `${Math.round(value * 100)}%`,
  'quality.particleAfterimage': (value) => `${Math.round(value * 100)}%`,
  'quality.focusDistance': (value) => `${Math.round(value)}m`,
  'quality.focusRange': (value) => `${Math.round(value)}m`,
  'quality.bokehScale': (value) => `${value.toFixed(2)}×`,
  'quality.bokehGamma': (value) => `${value.toFixed(2)} γ`,
  'quality.bokehSamples': (value) => `${Math.round(value)}탭`,
  'sound.volume': (value) => `${Math.round(value * 100)}%`,
  'show.musicVolume': (value) => `${Math.round(value * 100)}%`,
  'show.sensitivity': (value) => `${Math.round(value * 100)}%`,
  'show.density': (value) => `${Math.round(value * 100)}%`,
  'show.variety': (value) => `${Math.round(value * 100)}%`,
  'show.finale': (value) => `${Math.round(value * 100)}%`,
  'show.launchPower': (value) => `${Math.round(value * 100)}%`,
  'show.explosionPower': (value) => `${Math.round(value * 100)}%`,
  'show.positionSpread': (value) => `${Math.round(value * 100)}%`,
  'show.sequence': (value) => `${Math.round(value * 100)}%`,
  'show.crossfire': (value) => `${Math.round(value * 100)}%`,
  'show.colorVariation': (value) => `${Math.round(value * 100)}%`,
};

const RANGE_BINDINGS = [
  ['camera-fov', 'camera.fov'],
  ['initial-launch-power', 'launch.initialPower', 0.01],
  ['launch-center-x', 'launch.centerX'],
  ['launch-position-range', 'launch.positionRange', 0.01],
  ['gravity', 'physics.gravity'],
  ['drag', 'physics.drag', BASE_AIR_DRAG],
  ['particle-lifetime', 'physics.particleLifetime'],
  ['ring-particle-scale', 'physics.ringParticleScale', 0.01],
  ['wind-x', 'physics.windX'],
  ['wind-z', 'physics.windZ'],
  ['vortex', 'physics.vortex'],
  ['smoke', 'volume.smoke'],
  ['buoyancy', 'volume.buoyancy'],
  ['scatter', 'volume.scattering'],
  ['volume-shadow', 'volume.shadow'],
  ['water-roughness', 'world.waterRoughness'],
  ['reflection', 'world.reflection'],
  ['firework-brightness', 'quality.fireworkBrightness'],
  ['bloom-strength', 'quality.bloomStrength'],
  ['bloom-radius', 'quality.bloomRadius'],
  ['bloom-threshold', 'quality.bloomThreshold'],
  ['saturation', 'quality.saturation'],
  ['motion-blur', 'quality.motionBlur'],
  ['particle-afterimage', 'quality.particleAfterimage', 0.01],
  ['focus-distance', 'quality.focusDistance'],
  ['focus-range', 'quality.focusRange'],
  ['bokeh-scale', 'quality.bokehScale'],
  ['bokeh-gamma', 'quality.bokehGamma'],
  ['bokeh-samples', 'quality.bokehSamples'],
  ['sound-volume', 'sound.volume'],
  ['music-volume', 'show.musicVolume'],
  ['beat-sensitivity', 'show.sensitivity', 0.01],
  ['show-density', 'show.density', 0.01],
  ['show-variety', 'show.variety', 0.01],
  ['finale-intensity', 'show.finale', 0.01],
  ['show-launch-power', 'show.launchPower', 0.01],
  ['show-explosion-power', 'show.explosionPower', 0.01],
  ['show-position-spread', 'show.positionSpread', 0.01],
  ['show-sequence', 'show.sequence', 0.01],
  ['show-crossfire', 'show.crossfire', 0.01],
  ['show-color-variation', 'show.colorVariation', 0.01],
];

const OPTIMIZATION_TARGET_BINDINGS = [
  ['optimize-particles', 'particles', '파티클·잔광 LOD'],
  ['optimize-resolution', 'resolution', '해상도·수면 반사'],
  ['optimize-volume', 'volume', '볼륨 유체'],
  ['optimize-lighting', 'lighting', '조명·그림자'],
  ['optimize-post', 'postProcessing', '후처리·보케'],
];

const SHOW_CHOREOGRAPHY_PATHS = new Set([
  'show.launchPower',
  'show.explosionPower',
  'show.positionSpread',
  'show.sequence',
  'show.crossfire',
  'show.colorVariation',
]);

function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function performanceGuardTitle(state = {}) {
  const forecastLed = state.forecastLevel > 0 && state.forecastRatio > state.loadRatio + 0.05;
  return forecastLed
    ? `사전 부하 예측 ${state.forecastLevel}단계 · 약 ${(state.forecastParticles ?? 0).toLocaleString()}개 구간 선제 최적화`
    : state.level > 0
      ? `급증 보호 ${state.level}단계 · 프레임 예산에 맞춰 생성량 자동 조절`
      : '파티클 부하 정상';
}

function fillRange(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  const percent = ((value - min) / Math.max(0.0001, max - min)) * 100;
  input.style.setProperty('--range-fill', `${percent}%`);
}

export class AppUI extends EventTarget {
  constructor(store, audioController) {
    super();
    this.store = store;
    this.state = store.state;
    this.audio = audioController;
    this.presets = [...FIREWORK_PRESETS];
    this.filteredPresets = this.presets;
    this.selectedPreset = this.presets.find((preset) => preset.id === this.state.selectedPresetId) ?? this.presets[0];
    this.analysis = null;
    this.cues = [];
    this.loadWindows = [];
    this.timelinePlayhead = 0;
    this.timelineSeeking = false;
    this.xrAvailable = false;
    this.applyingShowPreset = false;
    this.showPreviewIndex = 0;
    this.performanceGuardState = null;
    this.optimizationMessageTimer = null;
    this.optimizationMessageUntil = 0;
    this.settingsCopyTimer = null;
    this.elements = {};
    this.cacheElements();
    this.populateSelects();
    this.bindNavigation();
    this.bindRanges();
    this.bindShowChoreography();
    this.bindComposer();
    this.bindAudio();
    this.bindWorld();
    this.bindDisplayControls();
    this.bindLaunchDeck();
    this.bindDialogs();
    this.renderPresets();
    this.selectPreset(this.selectedPreset.id, false);
    this.drawComposerPreview();
    this.syncState();
    requestAnimationFrame(() => {
      if (!this.elements.welcomedialog.open) this.elements.welcomedialog.showModal();
    });
  }

  cacheElements() {
    const ids = [
      'renderer-badge', 'optimization-status', 'fps-readout', 'particle-readout', 'volume-readout', 'xr-button', 'help-button',
      'ui-visibility-button', 'settings-copy-button', 'fullscreen-button',
      'preset-grid', 'preset-search', 'preset-category', 'selected-preset-name', 'selected-preset-meta', 'selected-swatch',
      'launch-button', 'launch-layout', 'interaction-hint', 'toast-stack', 'welcome-dialog', 'help-dialog', 'start-experience',
      'design-pattern', 'design-star', 'design-pistil', 'design-palette', 'design-count', 'design-size', 'design-trail', 'design-life',
      'design-count-out', 'design-size-out', 'design-trail-out', 'design-life-out', 'design-strobe', 'design-split', 'design-color-shift',
      'save-design', 'launch-design', 'shell-preview', 'custom-code', 'custom-title',
      'audio-drop', 'audio-input', 'audio-info', 'audio-name', 'audio-meta', 'audio-remove', 'audio-timeline', 'show-timeline-seek', 'show-timeline-time', 'music-bpm', 'music-cues', 'music-length',
      'music-loads',
      'show-choreography', 'show-direction', 'show-choreography-summary', 'preview-show',
      'generate-show', 'restart-show', 'play-show', 'environment-select', 'environment-input', 'camera-view', 'floor-mode', 'floor-grid-toggle', 'quality-select', 'particle-blend',
      'bloom-toggle', 'dof-toggle', 'shadow-toggle', 'adaptive-toggle', 'predictive-load-toggle',
      'optimize-particles', 'optimize-resolution', 'optimize-volume', 'optimize-lighting', 'optimize-post',
      'sound-toggle', 'sound-status',
    ];
    for (const id of ids) this.elements[id.replaceAll('-', '')] = document.getElementById(id);
  }

  populateSelects() {
    const populate = (element, values) => {
      element.replaceChildren(...values.map(([value, label]) => new Option(label, value)));
    };
    populate(this.elements.designpattern, PATTERN_OPTIONS);
    populate(this.elements.designstar, STAR_OPTIONS);
    populate(this.elements.designpistil, PISTIL_OPTIONS);
    populate(this.elements.designpalette, PALETTE_OPTIONS);
    populate(this.elements.showchoreography, [
      ...SHOW_CHOREOGRAPHY_PRESETS.map((profile) => [profile.id, profile.label]),
      ['custom', '사용자 조정'],
    ]);
    populate(this.elements.showdirection, SHOW_DIRECTION_OPTIONS);
    this.elements.designpattern.value = 'peony';
    this.elements.designstar.value = 'comet';
    this.elements.designpistil.value = 'single';
    this.elements.designpalette.value = 'aurora';
    this.elements.showchoreography.value = this.state.show.choreographyPreset;
    this.elements.showdirection.value = this.state.show.directionMode;
  }

  bindNavigation() {
    const updateCollapseButton = (panel) => {
      const button = panel.querySelector('[data-collapse]');
      if (!button) return;
      const isLeft = panel.classList.contains('panel-left');
      button.textContent = panel.classList.contains('collapsed') ? (isLeft ? '›' : '‹') : (isLeft ? '‹' : '›');
    };
    const setPanelCollapsed = (panel, collapsed) => {
      panel.classList.toggle('collapsed', collapsed);
      updateCollapseButton(panel);
    };
    const collapseMobileSiblings = (panel) => {
      if (window.innerWidth > 720) return;
      document.querySelectorAll('.panel').forEach((candidate) => {
        if (candidate !== panel) setPanelCollapsed(candidate, true);
      });
    };

    document.querySelectorAll('.tabbar button').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        document.querySelectorAll('.tabbar button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
        document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.tabPanel === tab));
      });
    });

    document.querySelectorAll('.accordion-title').forEach((button) => {
      button.addEventListener('click', () => {
        const accordion = button.closest('.accordion');
        accordion.classList.toggle('open');
        button.querySelector('i').textContent = accordion.classList.contains('open') ? '−' : '＋';
      });
    });

    document.querySelectorAll('[data-collapse]').forEach((button) => {
      button.addEventListener('click', () => {
        const panel = document.getElementById(button.dataset.collapse);
        const willOpen = panel.classList.contains('collapsed');
        if (willOpen) collapseMobileSiblings(panel);
        setPanelCollapsed(panel, !willOpen);
      });
    });

    document.querySelectorAll('.panel-heading').forEach((heading) => {
      heading.addEventListener('click', (event) => {
        if (window.innerWidth > 720 || event.target.closest('button')) return;
        const panel = heading.closest('.panel');
        const willOpen = panel.classList.contains('collapsed');
        if (willOpen) collapseMobileSiblings(panel);
        setPanelCollapsed(panel, !willOpen);
      });
    });

    if (window.innerWidth <= 720) {
      const atmospherePanel = document.getElementById('atmosphere-panel');
      if (atmospherePanel) setPanelCollapsed(atmospherePanel, true);
    }

    const filter = () => this.renderPresets(this.elements.presetsearch.value, this.elements.presetcategory.value);
    this.elements.presetsearch.addEventListener('input', filter);
    this.elements.presetcategory.addEventListener('change', filter);
  }

  bindRanges() {
    for (const [id, path, scale = 1] of RANGE_BINDINGS) {
      const input = document.getElementById(id);
      const output = document.getElementById(`${id}-out`);
      input.value = getPath(this.state, path) / scale;
      const update = () => {
        const value = Number(input.value) * scale;
        this.store.set(path, value);
        if (SHOW_CHOREOGRAPHY_PATHS.has(path) && !this.applyingShowPreset) {
          this.store.set('show.choreographyPreset', 'custom');
          this.elements.showchoreography.value = 'custom';
        }
        if (output) output.textContent = (FORMATTERS[path] ?? String)(value);
        fillRange(input);
        if (path === 'physics.ringParticleScale') this.drawComposerPreview();
        if (path.startsWith('show.')) this.updateShowChoreographySummary();
        this.dispatchEvent(new CustomEvent('statechange', { detail: { path, value } }));
      };
      input.addEventListener('input', update);
      if (output) output.textContent = (FORMATTERS[path] ?? String)(getPath(this.state, path));
      fillRange(input);
    }
  }

  bindShowChoreography() {
    this.elements.showchoreography.addEventListener('change', () => {
      const id = this.elements.showchoreography.value;
      if (id === 'custom') {
        this.store.set('show.choreographyPreset', 'custom');
        this.updateShowChoreographySummary();
        return;
      }
      const profile = getShowChoreographyPreset(id);
      this.applyingShowPreset = true;
      this.store.set('show.choreographyPreset', profile.id);
      this.store.set('show.directionMode', profile.directionMode);
      this.elements.showdirection.value = profile.directionMode;
      const values = {
        'show-launch-power': profile.launchPower,
        'show-explosion-power': profile.explosionPower,
        'show-position-spread': profile.positionSpread,
        'show-sequence': profile.sequence,
        'show-crossfire': profile.crossfire,
        'show-color-variation': profile.colorVariation,
      };
      for (const [idKey, value] of Object.entries(values)) {
        const input = document.getElementById(idKey);
        input.value = value * 100;
        input.dispatchEvent(new Event('input'));
      }
      this.applyingShowPreset = false;
      this.updateShowChoreographySummary();
      this.toast(`${profile.label} 연출값을 적용했습니다`);
    });

    this.elements.showdirection.addEventListener('change', () => {
      const value = this.elements.showdirection.value;
      this.store.set('show.directionMode', value);
      this.store.set('show.choreographyPreset', 'custom');
      this.elements.showchoreography.value = 'custom';
      this.updateShowChoreographySummary();
      this.dispatchEvent(new CustomEvent('statechange', { detail: { path: 'show.directionMode', value } }));
    });

    this.elements.previewshow.addEventListener('click', () => {
      const cue = createChoreographyPreviewCue(this.state.show, this.showPreviewIndex);
      this.showPreviewIndex += 1;
      const choreography = cue.choreography;
      this.elements.showchoreographysummary.dataset.previewX = String(choreography.launchX);
      this.elements.showchoreographysummary.dataset.previewYaw = String(choreography.launchYaw);
      this.elements.showchoreographysummary.dataset.previewCross = String(choreography.crossLaunch);
      this.elements.showchoreographysummary.dataset.previewHue = String(choreography.colorHue);
      this.dispatchEvent(new CustomEvent('showpreview', { detail: { cue } }));
    });

    this.updateShowChoreographySummary();
  }

  updateShowChoreographySummary() {
    const summary = this.elements.showchoreographysummary;
    if (!summary) return;
    const profile = SHOW_CHOREOGRAPHY_PRESETS.find((entry) => entry.id === this.state.show.choreographyPreset);
    const directionLabel = SHOW_DIRECTION_OPTIONS.find(([id]) => id === this.state.show.directionMode)?.[1] ?? this.state.show.directionMode;
    const profileLabel = profile?.label ?? '사용자 조정';
    summary.textContent = `${profileLabel} · ${directionLabel} · 발사 ${Math.round(this.state.show.launchPower * 100)}% · 폭발 ${Math.round(this.state.show.explosionPower * 100)}% · 순차 ${Math.round(this.state.show.sequence * 100)}% · 교차 ${Math.round(this.state.show.crossfire * 100)}% · 컬러 ${Math.round(this.state.show.colorVariation * 100)}%`;
    summary.dataset.preset = this.state.show.choreographyPreset;
    summary.dataset.direction = this.state.show.directionMode;
    summary.dataset.launchPower = String(this.state.show.launchPower);
    summary.dataset.explosionPower = String(this.state.show.explosionPower);
    summary.dataset.positionSpread = String(this.state.show.positionSpread);
    summary.dataset.sequence = String(this.state.show.sequence);
    summary.dataset.crossfire = String(this.state.show.crossfire);
    summary.dataset.colorVariation = String(this.state.show.colorVariation);
  }

  bindComposer() {
    const controls = [this.elements.designpattern, this.elements.designstar, this.elements.designpistil, this.elements.designpalette, this.elements.designcount, this.elements.designsize, this.elements.designtrail, this.elements.designlife, this.elements.designstrobe, this.elements.designsplit, this.elements.designcolorshift];
    for (const control of controls) {
      control.addEventListener('input', () => {
        this.elements.designcountout.textContent = this.elements.designcount.value;
        this.elements.designsizeout.textContent = Number(this.elements.designsize.value).toFixed(2);
        this.elements.designtrailout.textContent = Number(this.elements.designtrail.value).toFixed(2);
        this.elements.designlifeout.textContent = `${Number(this.elements.designlife.value).toFixed(1)}s`;
        fillRange(this.elements.designcount);
        fillRange(this.elements.designsize);
        fillRange(this.elements.designtrail);
        fillRange(this.elements.designlife);
        this.drawComposerPreview();
      });
    }
    [this.elements.designcount, this.elements.designsize, this.elements.designtrail, this.elements.designlife].forEach(fillRange);
    this.elements.launchdesign.addEventListener('click', () => {
      const preset = this.getCustomPreset();
      this.dispatchEvent(new CustomEvent('launchcustom', { detail: { preset } }));
    });
    this.elements.savedesign.addEventListener('click', () => {
      const preset = this.getCustomPreset();
      const name = `커스텀 ${this.presets.filter((entry) => entry.category === 'custom').length + 1}`;
      const saved = Object.freeze({ ...preset, id: `custom-${crypto.randomUUID()}`, name });
      this.presets.unshift(saved);
      this.renderPresets();
      this.selectPreset(saved.id);
      this.toast(`${name} 프리셋을 현재 세션에 저장했습니다`);
    });
  }

  getCustomPreset() {
    return createCustomPreset({
      pattern: this.elements.designpattern.value,
      star: this.elements.designstar.value,
      pistil: this.elements.designpistil.value,
      palette: this.elements.designpalette.value,
      count: Number(this.elements.designcount.value),
      burstScale: Number(this.elements.designsize.value),
      trail: Number(this.elements.designtrail.value),
      life: Number(this.elements.designlife.value),
      strobe: this.elements.designstrobe.checked,
      split: this.elements.designsplit.checked,
      colorShift: this.elements.designcolorshift.checked,
    });
  }

  drawComposerPreview() {
    const preset = this.getCustomPreset();
    const canvas = this.elements.shellpreview;
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    const gradient = context.createRadialGradient(width / 2, height / 2, 2, width / 2, height / 2, width * 0.48);
    gradient.addColorStop(0, 'rgba(70, 119, 190, .16)');
    gradient.addColorStop(0.7, 'rgba(18, 29, 48, .08)');
    gradient.addColorStop(1, 'transparent');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    const ringProfile = resolveRingParticleProfile(preset, preset.count, this.state.physics.ringParticleScale);
    const previewCount = Math.min(420, ringProfile.totalCount);
    const directions = generateBurstDirections(preset, previewCount, 4312, { ringFraction: ringProfile.ringFraction });
    for (let index = 0; index < directions.length; index += 1) {
      const direction = directions[index];
      const depth = (direction.z + 1) * 0.5;
      const radius = width * 0.36 * direction.speedScale;
      const x = width / 2 + direction.x * radius;
      const y = height / 2 - direction.y * radius;
      const palette = PALETTES[preset.palette];
      context.fillStyle = palette[index % palette.length];
      context.globalAlpha = 0.35 + depth * 0.65;
      context.beginPath();
      context.arc(x, y, 1.1 + depth * 1.2, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(width / 2, height / 2, 2.5, 0, Math.PI * 2);
    context.fill();
    this.elements.customcode.textContent = `${preset.pattern.toUpperCase()} / ${preset.star.toUpperCase()} / ${preset.pistil.toUpperCase()}`;
  }

  bindAudio() {
    const loadFile = async (file) => {
      if (!file?.type?.startsWith('audio/')) {
        this.toast('지원되는 오디오 파일을 선택해 주세요', 'error');
        return;
      }
      this.elements.audioinfo.classList.remove('hidden');
      this.setLoadPlan();
      this.elements.audioname.textContent = file.name;
      this.elements.audiometa.textContent = '파형·주파수·온셋 분석 중…';
      this.analysis = null;
      this.cues = [];
      this.elements.generateshow.disabled = true;
      this.elements.playshow.disabled = true;
      this.elements.restartshow.disabled = true;
      this.elements.showtimelineseek.disabled = true;
      try {
        this.analysis = await this.audio.load(file);
        this.elements.audiometa.textContent = `${formatDuration(this.analysis.duration)} · ${Math.round(file.size / 1024 / 1024 * 10) / 10} MB · 로컬 분석 완료`;
        this.elements.musicbpm.textContent = this.analysis.bpm ? Math.round(this.analysis.bpm) : 'FREE';
        this.elements.musiclength.textContent = formatDuration(this.analysis.duration);
        this.elements.generateshow.disabled = false;
        this.elements.showtimelineseek.max = String(this.analysis.duration);
        this.elements.showtimelineseek.disabled = false;
        this.updatePlayhead(0, true, true);
        this.toast(`음악 분석 완료 · ${this.analysis.onsets.length}개 온셋 감지`);
      } catch (error) {
        console.error(error);
        this.elements.audiometa.textContent = '분석 실패';
        this.toast('오디오를 분석하지 못했습니다', 'error');
      }
    };
    this.elements.audioinput.addEventListener('change', () => loadFile(this.elements.audioinput.files?.[0]));
    for (const type of ['dragenter', 'dragover']) {
      this.elements.audiodrop.addEventListener(type, (event) => {
        event.preventDefault();
        this.elements.audiodrop.classList.add('dragover');
      });
    }
    for (const type of ['dragleave', 'drop']) {
      this.elements.audiodrop.addEventListener(type, (event) => {
        event.preventDefault();
        this.elements.audiodrop.classList.remove('dragover');
      });
    }
    this.elements.audiodrop.addEventListener('drop', (event) => loadFile(event.dataTransfer.files?.[0]));
    this.elements.audioremove.addEventListener('click', () => {
      this.audio.stop();
      this.analysis = null;
      this.cues = [];
      this.elements.audioinput.value = '';
      this.elements.audioinfo.classList.add('hidden');
      this.elements.generateshow.disabled = true;
      this.elements.playshow.disabled = true;
      this.elements.restartshow.disabled = true;
      this.elements.showtimelineseek.disabled = true;
      this.elements.showtimelineseek.max = '0';
      this.elements.musicbpm.textContent = '—';
      this.elements.musiccues.textContent = '0';
      this.elements.musiclength.textContent = '—';
      this.updatePlayhead(0, true, true);
      this.setLoadPlan();
      this.drawTimeline();
      this.dispatchEvent(new CustomEvent('showgenerated', { detail: { cues: [] } }));
      this.dispatchEvent(new CustomEvent('showstop'));
    });
    this.elements.generateshow.addEventListener('click', () => this.generateShow());
    this.elements.playshow.addEventListener('click', () => { void this.toggleShowPlayback(); });
    this.elements.restartshow.addEventListener('click', () => { void this.playShowFromStart(); });
    this.elements.showtimelineseek.addEventListener('input', () => {
      this.timelineSeeking = true;
      this.updatePlayhead(Number(this.elements.showtimelineseek.value), true, true);
    });
    this.elements.showtimelineseek.addEventListener('change', () => {
      const target = Number(this.elements.showtimelineseek.value);
      this.timelineSeeking = false;
      void this.seekShow(target);
    });
    this.elements.showtimelineseek.addEventListener('pointercancel', () => {
      this.timelineSeeking = false;
      this.updatePlayhead(this.audio.currentTime, true, true);
    });
    this.elements.audiotimeline.addEventListener('click', (event) => {
      if (!this.analysis?.duration) return;
      const bounds = this.elements.audiotimeline.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
      void this.seekShow(this.analysis.duration * ratio);
    });
    this.audio.addEventListener('ended', () => {
      this.elements.playshow.textContent = '▶ 쇼 재생';
      this.dispatchEvent(new CustomEvent('showstop'));
    });
  }

  async toggleShowPlayback() {
    if (!this.audio.buffer || !this.cues.length) {
      this.toast('먼저 음악 쇼를 생성해 주세요', 'error');
      return false;
    }
    const playing = await this.audio.play();
    this.elements.playshow.textContent = playing ? 'Ⅱ 일시정지' : '▶ 쇼 재생';
    this.dispatchEvent(new CustomEvent(playing ? 'showplay' : 'showpause', { detail: { cues: this.cues, time: this.audio.currentTime } }));
    return playing;
  }

  async playShowFromStart() {
    if (!this.audio.buffer || !this.cues.length) {
      this.toast('먼저 음악 쇼를 생성해 주세요', 'error');
      return false;
    }
    const playing = await this.audio.playFromStart();
    this.elements.playshow.textContent = playing ? 'Ⅱ 일시정지' : '▶ 쇼 재생';
    this.updatePlayhead(0, true, true);
    this.dispatchEvent(new CustomEvent('showrestart', { detail: { cues: this.cues, time: 0 } }));
    return playing;
  }

  async seekShow(time) {
    if (!this.audio.buffer || !this.analysis) return 0;
    const target = await this.audio.seek(time);
    this.elements.playshow.textContent = this.audio.playing ? 'Ⅱ 일시정지' : '▶ 쇼 재생';
    this.updatePlayhead(target, true, true);
    this.dispatchEvent(new CustomEvent('showseek', { detail: { cues: this.cues, time: target, playing: this.audio.playing } }));
    return target;
  }

  seekShowBy(delta) {
    return this.seekShow(this.audio.currentTime + Number(delta || 0));
  }

  generateShow() {
    if (!this.analysis) return [];
    this.cues = this.audio.generate(this.state.show);
    this.elements.musiccues.textContent = String(this.cues.length);
    const crossCues = this.cues.filter((cue) => cue.choreography?.crossLaunch).length;
    const summary = this.elements.showchoreographysummary;
    summary.dataset.generatedCues = String(this.cues.length);
    summary.dataset.generatedCrossCues = String(crossCues);
    summary.dataset.generatedSequentialCues = String(this.cues.filter((cue) => (cue.choreography?.sequenceDelay ?? 0) > 0.001).length);
    summary.dataset.generatedColorCues = String(this.cues.filter((cue) => Math.abs(cue.choreography?.colorHue ?? 0) > 0.001).length);
    summary.title = `생성 결과: 전체 ${this.cues.length}큐 · 교차 ${crossCues}큐`;
    this.elements.playshow.disabled = this.cues.length === 0;
    this.elements.restartshow.disabled = this.cues.length === 0;
    this.drawTimeline();
    this.toast(`${this.cues.length}개 큐로 자동 불꽃 쇼를 만들었습니다`);
    this.dispatchEvent(new CustomEvent('showgenerated', { detail: { cues: this.cues } }));
    return this.cues;
  }

  drawTimeline(playhead = this.timelinePlayhead) {
    const canvas = this.elements.audiotimeline;
    const context = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, canvas.clientWidth * dpr);
    const height = Math.max(1, canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#070b13';
    context.fillRect(0, 0, width, height);
    if (!this.analysis?.frames?.length) {
      context.fillStyle = '#59657a';
      context.font = `${10 * dpr}px system-ui`;
      context.textAlign = 'center';
      context.fillText('음악 분석 타임라인', width / 2, height / 2 + 3 * dpr);
      return;
    }
    const duration = this.analysis.duration;
    const frames = this.analysis.frames;
    for (const window of this.loadWindows) {
      const start = Math.max(0, Math.min(width, (window.start / duration) * width));
      const end = Math.max(start, Math.min(width, (window.end / duration) * width));
      context.fillStyle = window.level >= 3 ? 'rgba(255, 84, 124, .18)' : window.level === 2 ? 'rgba(255, 165, 86, .14)' : 'rgba(255, 211, 122, .1)';
      context.fillRect(start, 0, Math.max(1, end - start), height);
    }
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#9a79ff');
    gradient.addColorStop(0.55, '#56e5ff');
    gradient.addColorStop(1, 'rgba(86, 229, 255, .08)');
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(0, height);
    for (let x = 0; x < width; x += 2) {
      const frame = frames[Math.min(frames.length - 1, Math.floor((x / width) * frames.length))];
      const value = Math.min(1, frame.rms * 0.56 + frame.bass * 0.24 + frame.high * 0.2);
      context.lineTo(x, height - value * height * 0.78 - 3 * dpr);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fill();

    for (const cue of this.cues) {
      const x = (cue.burstTime / duration) * width;
      context.strokeStyle = cue.band === 'finale' ? '#ff7dd8' : cue.band === 'bass' ? '#ffd37a' : cue.band === 'high' ? '#b28cff' : '#66eeff';
      context.globalAlpha = 0.55 + Math.min(0.45, cue.energy * 0.2);
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    context.globalAlpha = 1;
    if (duration > 0 && playhead > 0) {
      const x = (playhead / duration) * width;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5 * dpr;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
  }

  bindWorld() {
    this.elements.environmentselect.value = this.state.world.environment;
    this.elements.environmentselect.addEventListener('change', () => {
      const value = this.elements.environmentselect.value;
      if (value === 'custom') {
        this.elements.environmentinput.click();
        return;
      }
      this.store.set('world.environment', value);
      this.dispatchEvent(new CustomEvent('environment', { detail: { value } }));
    });
    this.elements.environmentinput.addEventListener('change', () => {
      const file = this.elements.environmentinput.files?.[0];
      if (!file) return;
      this.elements.environmentselect.value = 'custom';
      this.store.set('world.environment', 'custom');
      this.dispatchEvent(new CustomEvent('environmentfile', { detail: { file } }));
    });

    this.elements.cameraview.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        this.elements.cameraview.querySelectorAll('button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
        this.dispatchEvent(new CustomEvent('cameraview', { detail: { value: button.dataset.view } }));
      });
    });

    this.elements.floormode.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.value;
        this.elements.floormode.querySelectorAll('button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
        this.store.set('world.floor', value);
        this.dispatchEvent(new CustomEvent('floormode', { detail: { value } }));
      });
    });
    this.elements.floorgridtoggle.checked = this.state.world.floorGrid;
    this.elements.floorgridtoggle.addEventListener('change', () => {
      const value = this.elements.floorgridtoggle.checked;
      this.store.set('world.floorGrid', value);
      this.dispatchEvent(new CustomEvent('floorgrid', { detail: { value } }));
    });

    this.elements.qualityselect.value = this.state.quality.preset;
    this.elements.qualityselect.addEventListener('change', () => {
      const value = this.elements.qualityselect.value;
      this.store.set('quality.preset', value);
      this.dispatchEvent(new CustomEvent('quality', { detail: { value } }));
    });
    this.elements.particleblend.value = this.state.quality.particleBlend;
    this.elements.particleblend.addEventListener('change', () => {
      const value = this.elements.particleblend.value;
      this.store.set('quality.particleBlend', value);
      this.dispatchEvent(new CustomEvent('statechange', { detail: { path: 'quality.particleBlend', value } }));
    });
    for (const [element, key] of [[this.elements.bloomtoggle, 'bloom'], [this.elements.doftoggle, 'depthOfField'], [this.elements.shadowtoggle, 'shadows'], [this.elements.adaptivetoggle, 'adaptive'], [this.elements.predictiveloadtoggle, 'predictiveLoad']]) {
      element.checked = this.state.quality[key];
      element.addEventListener('change', () => {
        this.store.set(`quality.${key}`, element.checked);
        this.dispatchEvent(new CustomEvent('qualitytoggle', { detail: { key, value: element.checked } }));
      });
    }
    for (const [id, key, label] of OPTIMIZATION_TARGET_BINDINGS) {
      const element = this.elements[id.replaceAll('-', '')];
      element.checked = this.state.quality.autoTargets[key];
      element.addEventListener('change', () => {
        this.store.set(`quality.autoTargets.${key}`, element.checked);
        this.dispatchEvent(new CustomEvent('optimizationtarget', { detail: { key, label, value: element.checked } }));
      });
    }
    this.elements.soundtoggle.checked = this.state.sound.enabled;
    this.elements.soundtoggle.addEventListener('change', () => {
      this.store.set('sound.enabled', this.elements.soundtoggle.checked);
      this.dispatchEvent(new CustomEvent('soundtoggle', { detail: { value: this.elements.soundtoggle.checked } }));
    });
  }

  bindDisplayControls() {
    this.elements.uivisibilitybutton.addEventListener('click', () => this.toggleUIVisibility());
    this.elements.settingscopybutton.addEventListener('click', () => { void this.copySettings(); });
    this.elements.fullscreenbutton.addEventListener('click', () => { void this.toggleFullscreen(); });
    document.addEventListener('fullscreenchange', () => this.syncFullscreenButton());
    this.syncFullscreenButton();
  }

  resetSettingsCopyButton() {
    const button = this.elements.settingscopybutton;
    button.dataset.copyState = 'idle';
    button.querySelector('span').textContent = '⧉';
    button.setAttribute('aria-label', '설정값 클립보드에 복사');
    button.title = '현재 설정값 JSON 복사';
  }

  async copySettings() {
    const button = this.elements.settingscopybutton;
    const settings = this.store.export();
    clearTimeout(this.settingsCopyTimer);
    button.disabled = true;
    button.dataset.copyState = 'copying';
    button.setAttribute('aria-label', '설정값 복사 중');
    try {
      const method = await copyTextToClipboard(settings);
      button.dataset.copyState = 'copied';
      button.dataset.copyMethod = method;
      button.dataset.copyBytes = String(new TextEncoder().encode(settings).length);
      button.querySelector('span').textContent = '✓';
      button.setAttribute('aria-label', '설정값 복사 완료');
      button.title = '설정값 복사 완료';
      this.toast('현재 설정값을 JSON으로 복사했습니다');
      this.dispatchEvent(new CustomEvent('settingscopied', { detail: { method, settings } }));
      this.settingsCopyTimer = setTimeout(() => this.resetSettingsCopyButton(), 1800);
      return settings;
    } catch {
      button.dataset.copyState = 'error';
      button.querySelector('span').textContent = '!';
      button.setAttribute('aria-label', '설정값 복사 실패');
      button.title = '클립보드 권한을 확인해 주세요';
      this.toast('설정값을 클립보드에 복사하지 못했습니다', 'error');
      this.settingsCopyTimer = setTimeout(() => this.resetSettingsCopyButton(), 2200);
      return null;
    } finally {
      button.disabled = false;
    }
  }

  toggleUIVisibility(force = !document.body.classList.contains('ui-hidden')) {
    const hidden = Boolean(force);
    if (hidden) document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    document.body.classList.toggle('ui-hidden', hidden);
    this.elements.uivisibilitybutton.setAttribute('aria-pressed', String(hidden));
    this.elements.uivisibilitybutton.setAttribute('aria-label', hidden ? 'UI 표시' : 'UI 숨기기');
    this.elements.uivisibilitybutton.title = hidden ? 'UI 표시 (H)' : 'UI 숨기기 (H)';
    this.elements.uivisibilitybutton.querySelector('span').textContent = hidden ? '＋' : 'UI';
    return hidden;
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else throw new Error('Fullscreen API unavailable');
    } catch {
      this.toast('이 브라우저에서는 전체화면을 시작할 수 없습니다', 'error');
    }
    this.syncFullscreenButton();
  }

  syncFullscreenButton() {
    const active = Boolean(document.fullscreenElement);
    this.elements.fullscreenbutton.disabled = (document.fullscreenEnabled === false || !document.documentElement.requestFullscreen) && !active;
    this.elements.fullscreenbutton.setAttribute('aria-pressed', String(active));
    this.elements.fullscreenbutton.setAttribute('aria-label', active ? '전체화면 종료' : '전체화면 시작');
    this.elements.fullscreenbutton.title = active ? '전체화면 종료 (F)' : '전체화면 (F)';
    this.elements.fullscreenbutton.classList.toggle('active', active);
  }

  bindLaunchDeck() {
    this.elements.launchbutton.addEventListener('click', () => this.dispatchEvent(new CustomEvent('launch', { detail: { preset: this.selectedPreset, layout: this.state.launchLayout } })));
    this.elements.launchlayout.value = this.state.launchLayout;
    this.elements.launchlayout.addEventListener('change', () => {
      this.store.set('launchLayout', this.elements.launchlayout.value);
      this.dispatchEvent(new CustomEvent('layout', { detail: { value: this.elements.launchlayout.value } }));
    });
    document.querySelectorAll('.tool-toggle button').forEach((button) => {
      button.addEventListener('click', () => this.setTool(button.dataset.tool));
    });
    this.elements.xrbutton.addEventListener('click', () => this.dispatchEvent(new CustomEvent('xrrequest')));
  }

  bindDialogs() {
    this.elements.startexperience.addEventListener('click', () => {
      this.elements.welcomedialog.close();
      this.dispatchEvent(new CustomEvent('start'));
    });
    this.elements.helpbutton.addEventListener('click', () => this.elements.helpdialog?.showModal?.());
    document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
    for (const dialog of document.querySelectorAll('dialog')) {
      dialog.addEventListener('click', (event) => {
        const rect = dialog.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside) dialog.close();
      });
    }
  }

  renderPresets(search = '', category = 'all') {
    const normalized = search.trim().toLocaleLowerCase('ko');
    this.filteredPresets = this.presets.filter((preset) => {
      const matchesCategory = category === 'all' || preset.category === category;
      const matchesSearch = !normalized || `${preset.name} ${preset.nameEn} ${preset.pattern} ${preset.star}`.toLocaleLowerCase('ko').includes(normalized);
      return matchesCategory && matchesSearch;
    });
    const fragment = document.createDocumentFragment();
    for (const preset of this.filteredPresets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset-card';
      button.dataset.id = preset.id;
      button.dataset.pattern = preset.pattern;
      button.role = 'option';
      button.ariaSelected = String(preset.id === this.selectedPreset?.id);
      button.style.setProperty('--spark', preset.colors[1] ?? preset.colors[0]);
      button.style.setProperty('--glow', `${preset.colors[1] ?? preset.colors[0]}38`);
      const name = document.createElement('b');
      name.textContent = preset.name;
      const meta = document.createElement('small');
      meta.textContent = `${preset.pattern} · ${preset.star}`;
      button.append(name, meta);
      button.classList.toggle('selected', preset.id === this.selectedPreset?.id);
      button.addEventListener('click', () => this.selectPreset(preset.id));
      button.addEventListener('dblclick', () => this.dispatchEvent(new CustomEvent('launch', { detail: { preset, layout: this.state.launchLayout } })));
      fragment.append(button);
    }
    this.elements.presetgrid.replaceChildren(fragment);
    if (!this.filteredPresets.length) {
      const empty = document.createElement('p');
      empty.textContent = '일치하는 프리셋이 없습니다.';
      empty.style.cssText = 'grid-column:1/-1;color:#8390a6;font-size:10px;text-align:center;padding:24px 0';
      this.elements.presetgrid.append(empty);
    }
  }

  selectPreset(id, emit = true) {
    const preset = this.presets.find((entry) => entry.id === id);
    if (!preset) return;
    this.selectedPreset = preset;
    this.store.set('selectedPresetId', preset.id);
    this.elements.selectedpresetname.textContent = preset.name;
    this.elements.selectedpresetmeta.textContent = `${preset.pattern.toUpperCase()} · ${preset.star.toUpperCase()} · ${preset.count} STARS`;
    this.elements.selectedswatch.style.setProperty('--swatch', preset.colors[1] ?? preset.colors[0]);
    this.elements.presetgrid.querySelectorAll('.preset-card').forEach((card) => {
      const selected = card.dataset.id === id;
      card.classList.toggle('selected', selected);
      card.ariaSelected = String(selected);
    });
    if (emit) this.dispatchEvent(new CustomEvent('preset', { detail: { preset } }));
  }

  nextPreset(direction = 1) {
    const index = this.presets.findIndex((preset) => preset.id === this.selectedPreset.id);
    this.selectPreset(this.presets[(index + direction + this.presets.length) % this.presets.length].id);
    return this.selectedPreset;
  }

  nextLayout() {
    const values = ['single', 'pair', 'fan5', 'arc7', 'horizon9', 'circle8', 'finale'];
    const next = values[(values.indexOf(this.state.launchLayout) + 1) % values.length];
    this.store.set('launchLayout', next);
    this.elements.launchlayout.value = next;
    this.dispatchEvent(new CustomEvent('layout', { detail: { value: next } }));
    return next;
  }

  nextShowChoreography() {
    const ids = SHOW_CHOREOGRAPHY_PRESETS.map((profile) => profile.id);
    const currentIndex = ids.indexOf(this.state.show.choreographyPreset);
    const nextId = ids[(currentIndex + 1 + ids.length) % ids.length];
    this.elements.showchoreography.value = nextId;
    this.elements.showchoreography.dispatchEvent(new Event('change'));
    return getShowChoreographyPreset(nextId);
  }

  setTool(tool) {
    this.store.set('tool', tool);
    document.querySelectorAll('.tool-toggle button').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    const hints = {
      camera: '드래그 회전 · 우클릭 팬 이동 · 휠 원거리 줌 · SPACE 발사',
      gust: '드래그로 공기를 밀어 불꽃·연기 흐름 바꾸기',
      vortex: '드래그로 보텍스를 만들어 입자와 볼륨 회전시키기',
      repel: '클릭·드래그 충돌 구로 불꽃을 밀어내기',
    };
    this.elements.interactionhint.textContent = hints[tool];
    this.dispatchEvent(new CustomEvent('tool', { detail: { tool } }));
  }

  cycleTool() {
    const tools = ['camera', 'gust', 'vortex', 'repel'];
    this.setTool(tools[(tools.indexOf(this.state.tool) + 1) % tools.length]);
    return this.state.tool;
  }

  syncState() {
    this.setTool(this.state.tool);
    this.elements.launchlayout.value = this.state.launchLayout;
    this.elements.showchoreography.value = this.state.show.choreographyPreset;
    this.elements.showdirection.value = this.state.show.directionMode;
    this.updateShowChoreographySummary();
    this.elements.environmentselect.value = this.state.world.environment;
    this.elements.floormode.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.value === this.state.world.floor));
    this.elements.floorgridtoggle.checked = this.state.world.floorGrid;
    this.elements.qualityselect.value = this.state.quality.preset;
    this.elements.particleblend.value = this.state.quality.particleBlend;
    this.elements.bloomtoggle.checked = this.state.quality.bloom;
    this.elements.doftoggle.checked = this.state.quality.depthOfField;
    this.elements.shadowtoggle.checked = this.state.quality.shadows;
    this.elements.adaptivetoggle.checked = this.state.quality.adaptive;
    this.elements.predictiveloadtoggle.checked = this.state.quality.predictiveLoad;
    for (const [id, key] of OPTIMIZATION_TARGET_BINDINGS) this.elements[id.replaceAll('-', '')].checked = this.state.quality.autoTargets[key];
    this.elements.soundtoggle.checked = this.state.sound.enabled;
    this.setSoundStatus(this.state.sound.enabled ? '입력 후 활성' : 'MUTED');
  }

  setRendererStatus({ webgpu, label }) {
    this.elements.rendererbadge.classList.toggle('fallback', !webgpu);
    this.elements.rendererbadge.querySelector('b').textContent = label ?? (webgpu ? 'WEBGPU' : 'WEBGL 2');
  }

  setReady() {
    this.elements.startexperience.disabled = false;
  }

  setXRAvailable(available, label = null) {
    this.xrAvailable = available;
    this.elements.xrbutton.disabled = !available;
    if (label) this.elements.xrbutton.querySelector('span:last-child').textContent = label;
  }

  updateTelemetry({ fps, particles, rendered = particles, motionVectors = rendered, renderLimit = rendered, volume, volumePerformance = null }) {
    this.elements.fpsreadout.textContent = Number.isFinite(fps) ? String(Math.round(fps)) : '--';
    this.elements.particlereadout.textContent = particles > 9999 ? `${(particles / 1000).toFixed(1)}K` : String(particles);
    this.elements.particlereadout.dataset.active = String(particles);
    this.elements.particlereadout.dataset.rendered = String(rendered);
    this.elements.particlereadout.dataset.motionVectors = String(motionVectors);
    this.elements.particlereadout.dataset.effectiveRenderLimit = String(renderLimit);
    if (volume) this.elements.volumereadout.textContent = volume;
    if (volumePerformance) {
      this.elements.volumereadout.dataset.steps = String(volumePerformance.steps);
      this.elements.volumereadout.dataset.shadowSteps = String(volumePerformance.shadowSteps);
      this.elements.volumereadout.dataset.updateRate = String(volumePerformance.updateRate);
      this.elements.volumereadout.dataset.slicesPerFrame = String(volumePerformance.slicesPerFrame);
    }
  }

  setPerformanceGuard(state) {
    this.performanceGuardState = state;
    const container = this.elements.particlereadout.parentElement;
    container.dataset.guard = state.name;
    container.dataset.postProcessing = state.postProcessing ? 'on' : 'off';
    container.dataset.renderLimit = String(state.renderLimit ?? '');
    container.title = performanceGuardTitle(state);
    if (Date.now() >= this.optimizationMessageUntil) this.renderOptimizationStatus(state);
  }

  renderOptimizationStatus(state = this.performanceGuardState) {
    if (!state) return;
    const status = this.elements.optimizationstatus;
    const forecastLed = state.forecastLevel > 0 && state.forecastRatio > state.loadRatio + 0.05;
    const label = state.particleSafetyOverride
      ? '하드 보호'
      : forecastLed
        ? `선제 ${state.forecastLevel}단계`
        : state.level === 3
          ? '긴급 최적화'
          : state.level === 2
            ? '부하 최적화'
            : state.level === 1
              ? '경량 최적화'
              : '대기';
    const targets = Object.entries(state.optimizationTargets ?? {}).filter(([, enabled]) => enabled).map(([key]) => key);
    status.dataset.level = state.name ?? 'normal';
    status.dataset.targets = targets.join(',');
    status.dataset.targetCount = String(state.appliedTargetCount ?? targets.length);
    status.dataset.safetyOverride = String(Boolean(state.particleSafetyOverride));
    status.querySelector('b').textContent = label;
    status.title = `${performanceGuardTitle(state)} · 적용 ${state.appliedTargetCount ?? targets.length}/5`;
  }

  setOptimizationMessage(message, level = 'guarded', duration = 3200) {
    clearTimeout(this.optimizationMessageTimer);
    this.optimizationMessageUntil = Date.now() + duration;
    const status = this.elements.optimizationstatus;
    status.dataset.level = level;
    status.querySelector('b').textContent = message;
    status.title = message;
    this.optimizationMessageTimer = setTimeout(() => {
      this.optimizationMessageUntil = 0;
      this.renderOptimizationStatus();
    }, duration);
  }

  setLoadPlan(plan = {}) {
    this.loadWindows = Array.isArray(plan.windows) ? plan.windows : [];
    this.elements.musicloads.textContent = String(this.loadWindows.length);
    this.elements.musicloads.parentElement.title = this.loadWindows.length
      ? `고부하 구간 ${this.loadWindows.length}개 · 타임라인 음영으로 표시`
      : '사전 계산된 고부하 구간 없음';
    this.drawTimeline();
  }

  setSoundStatus(label, active = false) {
    this.elements.soundstatus.textContent = label;
    this.elements.soundstatus.classList.toggle('active', active);
  }

  updatePlayhead(time, force = false, allowDuringSeek = false) {
    if (this.timelineSeeking && !allowDuringSeek) return;
    const duration = this.analysis?.duration ?? 0;
    const next = Math.max(0, Math.min(duration, Number(time) || 0));
    if (!force && Math.abs(next - this.timelinePlayhead) < 0.08) return;
    this.timelinePlayhead = next;
    this.elements.showtimelineseek.value = String(next);
    this.elements.showtimelinetime.textContent = `${formatDuration(next)} / ${formatDuration(duration)}`;
    fillRange(this.elements.showtimelineseek);
    this.drawTimeline(next);
  }

  toast(message, type = 'info', duration = 2600) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.elements.toaststack.append(toast);
    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 240);
    }, duration);
  }
}
