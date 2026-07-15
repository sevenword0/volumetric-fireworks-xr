import './style.css';
import * as THREE from 'three/webgpu';
import { int, mrt, output, pass, saturation, uniform, vec4, velocity } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { AudioShowController, getPresetForCue } from './audio/audio-show.js';
import { FireworkSoundEngine } from './audio/firework-sound.js';
import { ParticleLoadGuard } from './core/particle-load-guard.js';
import { createAppState } from './core/state.js';
import { FIREWORK_PRESETS } from './pyro/presets.js';
import { FireworkEngine } from './pyro/firework-engine.js';
import { WorldScene } from './scene/world.js';
import { AppUI } from './ui/app-ui.js';
import { XRCubeUI } from './ui/xr-cube-ui.js';
import { FluidVolume } from './volume/fluid-volume.js';

const canvas = document.getElementById('stage');
const store = createAppState();
const audio = new AudioShowController();
const ui = new AppUI(store, audio);
const state = store.state;
const fireworkSound = new FireworkSoundEngine(state);
const particleLoadGuard = new ParticleLoadGuard();

const scene = new THREE.Scene();
scene.name = 'PYROVERSE XR scene';
const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.08, 320);
camera.position.set(0, 18, 68);
camera.lookAt(0, 22, 0);

const renderer = new THREE.WebGPURenderer({
  canvas,
  antialias: true,
  alpha: false,
  multiview: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = state.quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.transmitted = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 22, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 15;
controls.maxDistance = 92;
controls.minPolarAngle = Math.PI * 0.1;
controls.maxPolarAngle = Math.PI * 0.49;
controls.zoomToCursor = true;
controls.update();

let world;
let fluid;
let engine;
let xrCube;
let renderPipeline;
let bloomNode;
let scenePass;
let saturationAmount;
let motionBlurAmount;
let usePostProcessing = true;
let renderFailedOver = false;
let xrSession = null;
let showCues = [];
let nextCueIndex = 0;
let lastShowTime = 0;
let started = false;
let adaptiveLevel = 0;
let fpsAverage = 60;
let fpsAccumulator = 0;
let fpsFrames = 0;
let fpsWindowStart = performance.now();
let lastFrame = performance.now();
let interactionPointer = null;
let interactionLast = new THREE.Vector3();
let interactionLastTime = 0;
let loadGuardState = null;
let activeQuality = 'medium';
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const interactionPlane = new THREE.Plane();
const interactionPoint = new THREE.Vector3();
const interactionPrevious = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
const listenerPosition = new THREE.Vector3();
const listenerRight = new THREE.Vector3();
const planePoint = new THREE.Vector3(0, 22, 0);

async function initialize() {
  try {
    await renderer.init();
    const webgpuBackend = WebGPU.isAvailable() && renderer.backend?.isWebGPUBackend !== false;
    ui.setRendererStatus({ webgpu: webgpuBackend, label: webgpuBackend ? 'WEBGPU / TSL' : 'WEBGL 2 FALLBACK' });

    world = new WorldScene(scene, renderer, state);
    fluid = new FluidVolume(scene, state);
    engine = new FireworkEngine(scene, state, { maxParticles: qualityParticleLimit(resolveQuality()) });
    loadGuardState = particleLoadGuard.update({ frameMs: 1000 / 60, particles: 0, capacity: engine.maxParticles });
    engine.setLoadBudget(loadGuardState);
    ui.setPerformanceGuard(loadGuardState);
    engine.connectFluid(fluid);
    engine.setColliders(world.colliders);
    wireEngineEvents();
    setupPostProcessing();
    setupUIEvents();
    setupPointerInteraction();
    setupKeyboard();
    setupXR();
    applyQuality(resolveQuality());
    resize();

    xrCube = new XRCubeUI(scene, camera, renderer, state, createCubeCallbacks());
    renderer.setAnimationLoop(animate);
    window.addEventListener('resize', resize);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      ui.toast('그래픽 컨텍스트가 중단되었습니다. 복구를 시도합니다.', 'error', 5000);
    });

    window.__PYROVERSE__ = {
      renderer,
      scene,
      camera,
      controls,
      engine,
      fluid,
      world,
      ui,
      audio,
      fireworkSound,
      state,
      launch: (presetId = state.selectedPresetId, layout = state.launchLayout) => launchPreset(FIREWORK_PRESETS.find((preset) => preset.id === presetId) ?? FIREWORK_PRESETS[0], layout),
      clear: () => { engine.clear(); fluid.clear(); },
      diagnostics: () => ({
        backend: renderer.backend?.constructor?.name ?? 'unknown',
        webgpu: Boolean(renderer.backend?.isWebGPUBackend),
        particles: engine.activeCount,
        volumeGrid: [fluid.nx, fluid.ny, fluid.nz],
        xrPresenting: renderer.xr.isPresenting,
        fps: fpsAverage,
        effects: {
          bloom: state.quality.bloom,
          bloomStrength: state.quality.bloomStrength,
          bloomRadius: state.quality.bloomRadius,
          bloomThreshold: state.quality.bloomThreshold,
          saturation: state.quality.saturation,
          motionBlur: state.quality.motionBlur,
          particleBlend: engine.blendingMode,
        },
        sound: {
          enabled: state.sound.enabled,
          volume: state.sound.volume,
          activeVoices: fireworkSound.activeVoices,
          ready: fireworkSound.context?.state === 'running',
        },
        loadGuard: loadGuardState ? {
          level: loadGuardState.level,
          mode: loadGuardState.name,
          loadRatio: loadGuardState.loadRatio,
          frameMs: loadGuardState.frameEma,
          softLimit: loadGuardState.softLimit,
          maxSpawnPerFrame: loadGuardState.maxSpawnPerFrame,
          trailScale: loadGuardState.trailScale,
          postProcessing: loadGuardState.postProcessing,
        } : null,
      }),
    };
    ui.setReady();
    window.dispatchEvent(new CustomEvent('pyroverse-ready'));
  } catch (error) {
    console.error('PYROVERSE initialization failed', error);
    ui.setRendererStatus({ webgpu: false, label: 'RENDER ERROR' });
    ui.toast(`렌더러 초기화 실패: ${error.message}`, 'error', 8000);
    showFatalError(error);
  }
}

function setupPostProcessing() {
  scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, velocity }));
  const sceneColor = scenePass.getTextureNode();
  saturationAmount = uniform(state.quality.saturation);
  motionBlurAmount = uniform(state.quality.motionBlur);
  const velocityTexture = scenePass.getTextureNode('velocity').mul(motionBlurAmount);
  const motionColor = motionBlur(sceneColor, velocityTexture, int(8));
  bloomNode = bloom(motionColor);
  const composite = motionColor.add(bloomNode);
  renderPipeline = new THREE.RenderPipeline(renderer);
  renderPipeline.outputNode = vec4(saturation(composite.rgb, saturationAmount), composite.a);
  syncPostProcessing();
}

function syncPostProcessing() {
  if (!bloomNode || !saturationAmount || !motionBlurAmount) return;
  bloomNode.threshold.value = state.quality.bloomThreshold;
  bloomNode.strength.value = state.quality.bloom ? state.quality.bloomStrength : 0;
  bloomNode.radius.value = state.quality.bloomRadius;
  saturationAmount.value = state.quality.saturation;
  motionBlurAmount.value = state.quality.motionBlur;
  usePostProcessing = state.quality.bloom || state.quality.motionBlur > 0.001 || Math.abs(state.quality.saturation - 1) > 0.001;
}

async function armFireworkSound() {
  if (!state.sound.enabled) {
    ui.setSoundStatus('MUTED');
    return false;
  }
  try {
    ui.setSoundStatus('연결 중');
    const ready = await fireworkSound.resume();
    ui.setSoundStatus(ready ? 'READY' : '브라우저 대기', ready);
    return ready;
  } catch (error) {
    console.warn('Firework audio could not start', error);
    ui.setSoundStatus('지원 안 됨');
    return false;
  }
}

function wireEngineEvents() {
  engine.addEventListener('burst', (event) => {
    world.addBurstLight(event.detail);
    camera.updateMatrixWorld();
    camera.getWorldPosition(listenerPosition);
    listenerRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const result = fireworkSound.playBurst(event.detail, { position: listenerPosition, right: listenerRight });
    if (result) ui.setSoundStatus(`IMPACT +${Math.round(result.delay * 1000)}ms`, true);
  });
  engine.addEventListener('ripple', (event) => {
    if (state.world.floor === 'water') world.addRipple(event.detail.position, event.detail.strength);
  });
}

function setupUIEvents() {
  ui.addEventListener('start', () => {
    void armFireworkSound();
    started = true;
    ui.toast('스튜디오 활성화 · SPACE로 발사하세요');
    engine.schedule(FIREWORK_PRESETS[4], { x: -7, delay: 0.15, scale: 0.92 });
    engine.schedule(FIREWORK_PRESETS[0], { x: 7, delay: 0.58, scale: 1.08 });
  });
  ui.addEventListener('launch', (event) => {
    launchPreset(event.detail.preset, event.detail.layout);
  });
  ui.addEventListener('launchcustom', (event) => {
    launchPreset(event.detail.preset, state.launchLayout);
  });
  ui.addEventListener('tool', () => {
    controls.enabled = state.tool === 'camera' && !renderer.xr.isPresenting;
    canvas.style.cursor = state.tool === 'camera' ? 'grab' : 'crosshair';
  });
  ui.addEventListener('environment', (event) => world.setEnvironment(event.detail.value));
  ui.addEventListener('environmentfile', async (event) => {
    try {
      await world.loadEnvironmentFile(event.detail.file);
      ui.toast('사용자 환경 이미지를 구면 배경과 반사광에 매핑했습니다');
    } catch (error) {
      console.error(error);
      ui.toast('환경 이미지를 불러오지 못했습니다', 'error');
    }
  });
  ui.addEventListener('floormode', (event) => world.setFloorMode(event.detail.value));
  ui.addEventListener('quality', (event) => applyQuality(event.detail.value === 'auto' ? resolveQuality() : event.detail.value));
  ui.addEventListener('qualitytoggle', (event) => {
    if (event.detail.key === 'bloom') syncPostProcessing();
    if (event.detail.key === 'shadows') {
      world.setShadows(event.detail.value);
      fluid.shadowMesh.visible = event.detail.value && fluid.enabled;
    }
  });
  ui.addEventListener('statechange', (event) => {
    if (event.detail.path === 'volume.smoke') fluid.setVisible(event.detail.value > 0.001);
    if (event.detail.path.startsWith('quality.')) syncPostProcessing();
    if (event.detail.path === 'quality.particleBlend') engine.setBlendingMode(event.detail.value);
    if (event.detail.path === 'sound.volume') fireworkSound.setVolume();
  });
  ui.addEventListener('soundtoggle', (event) => {
    fireworkSound.setEnabled();
    if (event.detail.value) void armFireworkSound();
    else ui.setSoundStatus('MUTED');
  });
  ui.addEventListener('showgenerated', (event) => {
    showCues = event.detail.cues;
    nextCueIndex = 0;
  });
  ui.addEventListener('showplay', (event) => {
    void armFireworkSound();
    showCues = event.detail.cues;
    const current = audio.currentTime;
    nextCueIndex = Math.max(0, showCues.findIndex((cue) => cue.time >= current - 0.04));
    if (nextCueIndex < 0) nextCueIndex = showCues.length;
    lastShowTime = current;
  });
  ui.addEventListener('showstop', () => {
    nextCueIndex = 0;
    lastShowTime = 0;
    ui.updatePlayhead(0);
  });
  ui.addEventListener('xrrequest', requestXRSession);
}

function setupPointerInteraction() {
  const toWorldPoint = (event, target) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    camera.getWorldDirection(cameraDirection);
    interactionPlane.setFromNormalAndCoplanarPoint(cameraDirection, planePoint);
    return raycaster.ray.intersectPlane(interactionPlane, target);
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (state.tool === 'camera' || renderer.xr.isPresenting) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    interactionPointer = event.pointerId;
    if (!toWorldPoint(event, interactionPoint)) return;
    interactionLast.copy(interactionPoint);
    interactionPrevious.copy(interactionPoint);
    interactionLastTime = performance.now();
    applyAirInteraction(interactionPoint, cameraDirection.clone().multiplyScalar(-1), true);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== interactionPointer || state.tool === 'camera') return;
    if (!toWorldPoint(event, interactionPoint)) return;
    const now = performance.now();
    if (now - interactionLastTime < 24) return;
    const deltaSeconds = Math.max(0.016, (now - interactionLastTime) / 1000);
    const direction = interactionPoint.clone().sub(interactionPrevious).multiplyScalar(1 / deltaSeconds);
    if (direction.lengthSq() < 0.02) direction.copy(cameraDirection).multiplyScalar(-4);
    applyAirInteraction(interactionPoint, direction, false);
    interactionPrevious.copy(interactionPoint);
    interactionLastTime = now;
  });

  const release = (event) => {
    if (event.pointerId !== interactionPointer) return;
    interactionPointer = null;
    try { canvas.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}

function applyAirInteraction(position, direction, initial = false) {
  const type = state.tool === 'vortex' ? 'vortex' : state.tool === 'repel' ? 'repel' : 'gust';
  const options = {
    type,
    radius: type === 'repel' ? 8.5 : type === 'vortex' ? 7.5 : 6.5,
    strength: initial ? (type === 'repel' ? 42 : 24) : clamp(direction.length() * 1.25, 10, 40),
    life: initial ? 0.38 : 0.22,
  };
  const forceDirection = type === 'repel' ? cameraDirection.clone().negate() : direction.clone().normalize();
  engine.addInteraction(position, forceDirection, options);
  interactionLast.copy(position);
}

function setupKeyboard() {
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    if (event.code === 'Space') {
      event.preventDefault();
      launchPreset(ui.selectedPreset, state.launchLayout);
    } else if (event.key.toLowerCase() === 'w') ui.setTool('gust');
    else if (event.key.toLowerCase() === 'v') ui.setTool('vortex');
    else if (event.key.toLowerCase() === 'x') ui.setTool('repel');
    else if (event.key.toLowerCase() === 'c') ui.setTool('camera');
    else if (event.key === 'ArrowRight') ui.nextPreset(1);
    else if (event.key === 'ArrowLeft') ui.nextPreset(-1);
    else if (event.key === 'Escape') {
      audio.stop();
      ui.elements.playshow.textContent = '▶ 쇼 재생';
      nextCueIndex = 0;
    }
  });
}

async function setupXR() {
  if (!navigator.xr) {
    ui.setXRAvailable(false, 'XR 미지원');
    return;
  }
  try {
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    ui.setXRAvailable(supported, supported ? 'XR VIEW' : 'XR 미지원');
  } catch {
    ui.setXRAvailable(false, 'XR 확인 실패');
  }
}

async function requestXRSession() {
  if (!navigator.xr || xrSession) return;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers'],
    });
    xrSession = session;
    session.addEventListener('end', () => {
      xrCube.endSession();
      xrSession = null;
      controls.enabled = state.tool === 'camera';
      ui.toast('XR 세션을 종료했습니다');
    }, { once: true });
    await renderer.xr.setSession(session);
    xrCube.startSession();
    controls.enabled = false;
    ui.toast('XR 큐브 UI 활성화 · 트리거 선택 / 스퀴즈 발사');
  } catch (error) {
    console.error(error);
    ui.toast(`XR 세션을 시작하지 못했습니다: ${error.message}`, 'error', 5000);
  }
}

function createCubeCallbacks() {
  const environments = ['lake', 'city', 'alpine', 'cosmic'];
  const floors = ['water', 'matte', 'none'];
  const qualities = ['auto', 'high', 'medium', 'low'];
  return {
    setState(path, value) {
      store.set(path, value);
      const binding = RANGE_BINDINGS_FOR_CUBE[path];
      if (binding) {
        const input = document.getElementById(binding);
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input'));
        }
      }
    },
    cycleTool: () => ui.cycleTool(),
    getPresetName: () => ui.selectedPreset.name,
    nextPreset: () => ui.nextPreset(1),
    previousPreset: () => ui.nextPreset(-1),
    launch: () => launchPreset(ui.selectedPreset, state.launchLayout),
    isShowPlaying: () => audio.playing,
    toggleShow: async () => {
      if (!audio.buffer || !ui.cues.length) {
        ui.toast('먼저 음악 쇼를 생성해 주세요', 'error');
        return;
      }
      const playing = await audio.play();
      ui.elements.playshow.textContent = playing ? 'Ⅱ 일시정지' : '▶ 쇼 재생';
    },
    nextLayout: () => ui.nextLayout(),
    getCueCount: () => ui.cues.length,
    generateShow: () => ui.generateShow(),
    clear: () => { engine.clear(); fluid.clear(); ui.toast('입자와 볼륨을 비웠습니다'); },
    nextEnvironment: () => {
      const next = environments[(environments.indexOf(state.world.environment) + 1) % environments.length];
      store.set('world.environment', next);
      ui.elements.environmentselect.value = next;
      world.setEnvironment(next);
    },
    nextFloor: () => {
      const next = floors[(floors.indexOf(state.world.floor) + 1) % floors.length];
      store.set('world.floor', next);
      world.setFloorMode(next);
      ui.elements.floormode.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.value === next));
    },
    toggleVolume: () => {
      const value = state.volume.smoke > 0 ? 0 : 0.7;
      store.set('volume.smoke', value);
      fluid.setVisible(value > 0);
      const input = document.getElementById('smoke');
      input.value = value;
      input.dispatchEvent(new Event('input'));
    },
    toggleShadows: () => {
      const value = !state.quality.shadows;
      store.set('quality.shadows', value);
      ui.elements.shadowtoggle.checked = value;
      world.setShadows(value);
      fluid.shadowMesh.visible = value;
    },
    nextQuality: () => {
      const next = qualities[(qualities.indexOf(state.quality.preset) + 1) % qualities.length];
      store.set('quality.preset', next);
      ui.elements.qualityselect.value = next;
      applyQuality(next === 'auto' ? resolveQuality() : next);
    },
    getParticleCount: () => engine.activeCount,
    exitXR: () => xrSession?.end(),
    interact: (point, direction, tool, initial) => {
      if (tool === 'camera') return;
      applyAirInteraction(point, direction, initial);
    },
  };
}

const RANGE_BINDINGS_FOR_CUBE = Object.freeze({
  'physics.gravity': 'gravity',
  'physics.windX': 'wind-x',
  'physics.vortex': 'vortex',
});

function launchPreset(preset, layout = 'single', options = {}) {
  if (!engine || !preset) return;
  void armFireworkSound();
  const count = engine.launchLayout(preset, layout, options);
  ui.toast(`${preset.name} · ${layout.toUpperCase()} ${count}발`);
}

function updateShow() {
  if (!audio.playing || !showCues.length) return;
  const current = audio.currentTime;
  if (current + 0.05 < lastShowTime) {
    nextCueIndex = Math.max(0, showCues.findIndex((cue) => cue.time >= current));
    if (nextCueIndex < 0) nextCueIndex = showCues.length;
  }
  while (nextCueIndex < showCues.length && showCues[nextCueIndex].time <= current + 0.025) {
    const cue = showCues[nextCueIndex];
    const preset = getPresetForCue(cue);
    engine.launchLayout(preset, cue.layout, { scale: clamp(0.72 + cue.energy * 0.35, 0.78, 1.28), spread: 0.8 + state.show.variety * 0.45 });
    nextCueIndex += 1;
  }
  lastShowTime = current;
  ui.updatePlayhead(current);
}

function animate(now) {
  if (!engine) return;
  const frameMs = Math.max(0, now - lastFrame);
  const dt = Math.min(0.05, frameMs / 1000);
  lastFrame = now;
  const previousGuardLevel = loadGuardState?.level ?? 0;
  loadGuardState = particleLoadGuard.update({
    frameMs,
    particles: engine.activeCount,
    capacity: engine.maxParticles,
    adaptive: state.quality.adaptive && !document.hidden && performance.now() > 3000,
  });
  engine.setLoadBudget(loadGuardState);
  if (loadGuardState.changed) handleLoadGuardTransition(previousGuardLevel, loadGuardState);
  if (!renderer.xr.isPresenting) controls.update();
  updateShow();
  engine.update(dt);
  fluid.update(dt);
  world.update(dt);
  xrCube?.update(dt);

  try {
    if (usePostProcessing && loadGuardState.postProcessing && !renderer.xr.isPresenting && !renderFailedOver) renderPipeline.render();
    else renderer.render(scene, camera);
  } catch (error) {
    if (!renderFailedOver) {
      console.warn('Post-processing path failed, using direct render', error);
      renderFailedOver = true;
      usePostProcessing = false;
      ui.toast('호환 렌더 경로로 전환했습니다', 'error');
      renderer.render(scene, camera);
    } else {
      throw error;
    }
  }

  fpsAccumulator += dt;
  fpsFrames += 1;
  if (now - fpsWindowStart >= 750) {
    fpsAverage = fpsFrames / Math.max(0.001, fpsAccumulator);
    ui.updateTelemetry({ fps: fpsAverage, particles: engine.activeCount, volume: `${fluid.nx}×${fluid.ny}×${fluid.nz}` });
    adaptQuality(fpsAverage);
    fpsAccumulator = 0;
    fpsFrames = 0;
    fpsWindowStart = now;
  }
}

function resolveQuality() {
  if (state.quality.preset !== 'auto') return state.quality.preset;
  const memory = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const mobile = matchMedia('(max-width: 720px)').matches;
  if (mobile || memory <= 4 || cores <= 4) return 'low';
  if (memory >= 8 && cores >= 8 && WebGPU.isAvailable()) return 'high';
  return 'medium';
}

function qualityParticleLimit(quality) {
  return quality === 'high' ? 16000 : quality === 'low' ? 4000 : 10000;
}

function qualitySettings(quality) {
  return {
    high: { pixelRatio: 1.7, reflection: 0.45 },
    medium: { pixelRatio: 1.35, reflection: 0.33 },
    low: { pixelRatio: 1, reflection: 0.2 },
  }[quality] ?? { pixelRatio: 1.35, reflection: 0.33 };
}

function applyRuntimeResolution() {
  const settings = qualitySettings(activeQuality);
  const guardScale = loadGuardState?.resolutionScale ?? 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Math.max(0.62, settings.pixelRatio * guardScale)));
  if (world?.reflectionNode) world.reflectionNode.resolutionScale = settings.reflection * Math.max(0.32, guardScale);
  world?.setPerformanceLevel(loadGuardState?.level ?? 0);
  fluid?.setPerformanceLevel(loadGuardState?.level ?? 0);
  resize();
}

function handleLoadGuardTransition(previousLevel, next) {
  applyRuntimeResolution();
  ui.setPerformanceGuard(next);
  if (next.level > previousLevel && next.level >= 2) {
    ui.toast(next.level === 3
      ? '급증 보호 활성 · 잔상과 후처리 부하를 즉시 낮췄습니다'
      : '파티클 밀도를 조절해 프레임을 보호합니다');
  } else if (next.level === 0 && previousLevel > 0) {
    ui.toast('파티클 부하 안정 · 전체 효과 품질을 복원했습니다');
  }
}

function applyQuality(quality) {
  if (!fluid || !world) return;
  activeQuality = quality;
  applyRuntimeResolution();
  syncPostProcessing();
  fluid.setQuality(quality);
  adaptiveLevel = quality === 'high' ? 0 : quality === 'medium' ? 1 : 2;
}

function adaptQuality(fps) {
  if (!state.quality.adaptive || renderer.xr.isPresenting || state.quality.preset !== 'auto' || performance.now() < 5000) return;
  if (fps < 35 && adaptiveLevel < 2) {
    adaptiveLevel += 1;
    applyQuality(adaptiveLevel === 1 ? 'medium' : 'low');
    ui.toast('프레임 안정화를 위해 렌더 품질을 자동 조정했습니다');
  } else if (fps > 56 && adaptiveLevel > 0 && engine.activeCount < 2500) {
    adaptiveLevel -= 1;
    applyQuality(adaptiveLevel === 0 ? 'high' : 'medium');
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function showFatalError(error) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:100;left:50%;top:50%;transform:translate(-50%,-50%);max-width:560px;padding:24px;border:1px solid #ff6584;border-radius:14px;background:#0c1019;color:#eef4ff;font:14px/1.6 system-ui;box-shadow:0 30px 100px #000';
  const title = document.createElement('h2');
  title.textContent = '그래픽 초기화에 실패했습니다';
  const body = document.createElement('p');
  body.textContent = '최신 Chrome 또는 Edge에서 하드웨어 가속을 켜고 다시 시도해 주세요.';
  const detail = document.createElement('code');
  detail.textContent = error.message;
  box.append(title, body, detail);
  document.body.append(box);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

initialize();
