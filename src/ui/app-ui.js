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

const FORMATTERS = {
  'physics.gravity': (value) => `${value.toFixed(2)} g`,
  'physics.drag': (value) => value.toFixed(3),
  'physics.windX': (value) => value.toFixed(1),
  'physics.windZ': (value) => value.toFixed(1),
  'physics.vortex': (value) => value.toFixed(2),
  'volume.smoke': (value) => value.toFixed(2),
  'volume.buoyancy': (value) => value.toFixed(2),
  'volume.scattering': (value) => value.toFixed(2),
  'volume.shadow': (value) => value.toFixed(2),
  'world.waterRoughness': (value) => value.toFixed(2),
  'world.reflection': (value) => value.toFixed(2),
  'quality.bloomStrength': (value) => `${value.toFixed(2)}×`,
  'quality.bloomRadius': (value) => value.toFixed(2),
  'quality.bloomThreshold': (value) => value.toFixed(2),
  'quality.saturation': (value) => `${Math.round(value * 100)}%`,
  'quality.motionBlur': (value) => `${Math.round(value * 100)}%`,
  'sound.volume': (value) => `${Math.round(value * 100)}%`,
  'show.sensitivity': (value) => `${Math.round(value * 100)}%`,
  'show.density': (value) => `${Math.round(value * 100)}%`,
  'show.variety': (value) => `${Math.round(value * 100)}%`,
  'show.finale': (value) => `${Math.round(value * 100)}%`,
};

const RANGE_BINDINGS = [
  ['gravity', 'physics.gravity'],
  ['drag', 'physics.drag'],
  ['wind-x', 'physics.windX'],
  ['wind-z', 'physics.windZ'],
  ['vortex', 'physics.vortex'],
  ['smoke', 'volume.smoke'],
  ['buoyancy', 'volume.buoyancy'],
  ['scatter', 'volume.scattering'],
  ['volume-shadow', 'volume.shadow'],
  ['water-roughness', 'world.waterRoughness'],
  ['reflection', 'world.reflection'],
  ['bloom-strength', 'quality.bloomStrength'],
  ['bloom-radius', 'quality.bloomRadius'],
  ['bloom-threshold', 'quality.bloomThreshold'],
  ['saturation', 'quality.saturation'],
  ['motion-blur', 'quality.motionBlur'],
  ['sound-volume', 'sound.volume'],
  ['beat-sensitivity', 'show.sensitivity', 0.01],
  ['show-density', 'show.density', 0.01],
  ['show-variety', 'show.variety', 0.01],
  ['finale-intensity', 'show.finale', 0.01],
];

function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
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
    this.timelinePlayhead = 0;
    this.xrAvailable = false;
    this.elements = {};
    this.cacheElements();
    this.populateSelects();
    this.bindNavigation();
    this.bindRanges();
    this.bindComposer();
    this.bindAudio();
    this.bindWorld();
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
      'renderer-badge', 'fps-readout', 'particle-readout', 'volume-readout', 'xr-button', 'help-button',
      'preset-grid', 'preset-search', 'preset-category', 'selected-preset-name', 'selected-preset-meta', 'selected-swatch',
      'launch-button', 'launch-layout', 'interaction-hint', 'toast-stack', 'welcome-dialog', 'help-dialog', 'start-experience',
      'design-pattern', 'design-star', 'design-pistil', 'design-palette', 'design-count', 'design-size', 'design-trail', 'design-life',
      'design-count-out', 'design-size-out', 'design-trail-out', 'design-life-out', 'design-strobe', 'design-split', 'design-color-shift',
      'save-design', 'launch-design', 'shell-preview', 'custom-code', 'custom-title',
      'audio-drop', 'audio-input', 'audio-info', 'audio-name', 'audio-meta', 'audio-remove', 'audio-timeline', 'music-bpm', 'music-cues', 'music-length',
      'generate-show', 'play-show', 'environment-select', 'environment-input', 'floor-mode', 'quality-select', 'particle-blend',
      'bloom-toggle', 'shadow-toggle', 'adaptive-toggle', 'sound-toggle', 'sound-status',
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
    this.elements.designpattern.value = 'peony';
    this.elements.designstar.value = 'comet';
    this.elements.designpistil.value = 'single';
    this.elements.designpalette.value = 'aurora';
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
        if (output) output.textContent = (FORMATTERS[path] ?? String)(value);
        fillRange(input);
        this.dispatchEvent(new CustomEvent('statechange', { detail: { path, value } }));
      };
      input.addEventListener('input', update);
      if (output) output.textContent = (FORMATTERS[path] ?? String)(getPath(this.state, path));
      fillRange(input);
    }
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
    const directions = generateBurstDirections(preset, Math.min(180, preset.count), 4312);
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
      this.elements.audioname.textContent = file.name;
      this.elements.audiometa.textContent = '파형·주파수·온셋 분석 중…';
      this.elements.generateshow.disabled = true;
      this.elements.playshow.disabled = true;
      try {
        this.analysis = await this.audio.load(file);
        this.elements.audiometa.textContent = `${formatDuration(this.analysis.duration)} · ${Math.round(file.size / 1024 / 1024 * 10) / 10} MB · 로컬 분석 완료`;
        this.elements.musicbpm.textContent = this.analysis.bpm ? Math.round(this.analysis.bpm) : 'FREE';
        this.elements.musiclength.textContent = formatDuration(this.analysis.duration);
        this.elements.generateshow.disabled = false;
        this.drawTimeline();
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
      this.elements.musicbpm.textContent = '—';
      this.elements.musiccues.textContent = '0';
      this.elements.musiclength.textContent = '—';
      this.drawTimeline();
      this.dispatchEvent(new CustomEvent('showstop'));
    });
    this.elements.generateshow.addEventListener('click', () => this.generateShow());
    this.elements.playshow.addEventListener('click', async () => {
      const playing = await this.audio.play();
      this.elements.playshow.textContent = playing ? 'Ⅱ 일시정지' : '▶ 쇼 재생';
      this.dispatchEvent(new CustomEvent(playing ? 'showplay' : 'showpause', { detail: { cues: this.cues } }));
    });
    this.audio.addEventListener('ended', () => {
      this.elements.playshow.textContent = '▶ 쇼 재생';
      this.dispatchEvent(new CustomEvent('showstop'));
    });
  }

  generateShow() {
    if (!this.analysis) return [];
    this.cues = this.audio.generate(this.state.show);
    this.elements.musiccues.textContent = String(this.cues.length);
    this.elements.playshow.disabled = this.cues.length === 0;
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

    this.elements.floormode.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.value;
        this.elements.floormode.querySelectorAll('button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
        this.store.set('world.floor', value);
        this.dispatchEvent(new CustomEvent('floormode', { detail: { value } }));
      });
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
    for (const [element, key] of [[this.elements.bloomtoggle, 'bloom'], [this.elements.shadowtoggle, 'shadows'], [this.elements.adaptivetoggle, 'adaptive']]) {
      element.checked = this.state.quality[key];
      element.addEventListener('change', () => {
        this.store.set(`quality.${key}`, element.checked);
        this.dispatchEvent(new CustomEvent('qualitytoggle', { detail: { key, value: element.checked } }));
      });
    }
    this.elements.soundtoggle.checked = this.state.sound.enabled;
    this.elements.soundtoggle.addEventListener('change', () => {
      this.store.set('sound.enabled', this.elements.soundtoggle.checked);
      this.dispatchEvent(new CustomEvent('soundtoggle', { detail: { value: this.elements.soundtoggle.checked } }));
    });
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

  setTool(tool) {
    this.store.set('tool', tool);
    document.querySelectorAll('.tool-toggle button').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    const hints = {
      camera: '드래그 회전 · 휠 줌 · SPACE 발사',
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
    this.elements.environmentselect.value = this.state.world.environment;
    this.elements.floormode.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.value === this.state.world.floor));
    this.elements.qualityselect.value = this.state.quality.preset;
    this.elements.particleblend.value = this.state.quality.particleBlend;
    this.elements.bloomtoggle.checked = this.state.quality.bloom;
    this.elements.shadowtoggle.checked = this.state.quality.shadows;
    this.elements.adaptivetoggle.checked = this.state.quality.adaptive;
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

  updateTelemetry({ fps, particles, volume }) {
    this.elements.fpsreadout.textContent = Number.isFinite(fps) ? String(Math.round(fps)) : '--';
    this.elements.particlereadout.textContent = particles > 9999 ? `${(particles / 1000).toFixed(1)}K` : String(particles);
    if (volume) this.elements.volumereadout.textContent = volume;
  }

  setPerformanceGuard(state) {
    const container = this.elements.particlereadout.parentElement;
    container.dataset.guard = state.name;
    container.title = state.level > 0
      ? `급증 보호 ${state.level}단계 · 프레임 예산에 맞춰 생성량 자동 조절`
      : '파티클 부하 정상';
  }

  setSoundStatus(label, active = false) {
    this.elements.soundstatus.textContent = label;
    this.elements.soundstatus.classList.toggle('active', active);
  }

  updatePlayhead(time) {
    if (Math.abs(time - this.timelinePlayhead) < 0.08) return;
    this.timelinePlayhead = time;
    this.drawTimeline(time);
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
