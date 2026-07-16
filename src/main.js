import './style.css';
import * as THREE from 'three/webgpu';
import { int, mrt, output, pass, saturation, uniform, vec4, velocity } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { AudioShowController, getPresetForCue } from './audio/audio-show.js';
import { FireworkSoundEngine } from './audio/firework-sound.js';
import { ParticleLoadGuard, particleLoadLevel } from './core/particle-load-guard.js';
import { ParticleLoadPlanner } from './core/particle-load-planner.js';
import { BOKEH_SAMPLE_COUNT, bokehDepthOfField } from './core/post-effects.js';
import { BASE_AIR_DRAG, createAppState } from './core/state.js';
import { FIREWORK_PRESETS } from './pyro/presets.js';
import { FireworkEngine } from './pyro/firework-engine.js';
import { WorldScene } from './scene/world.js';
import { AppUI } from './ui/app-ui.js';
import { XRCubeUI } from './ui/xr-cube-ui.js';
import { FluidVolume } from './volume/fluid-volume.js';

const canvas = document.getElementById('stage');
const store = createAppState();
const state = store.state;
const audio = new AudioShowController({ volume: state.show.musicVolume });
const ui = new AppUI(store, audio);
const fireworkSound = new FireworkSoundEngine(state);
const particleLoadGuard = new ParticleLoadGuard();
const particleLoadPlanner = new ParticleLoadPlanner();

const scene = new THREE.Scene();
scene.name = 'PYROVERSE XR scene';
const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.08, 700);
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
// Keep shadow resources stable across adaptive quality transitions. Individual
// lights pause their shadow updates and fade shadow intensity instead.
renderer.shadowMap.enabled = true;
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
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.panSpeed = 0.9;
controls.rotateSpeed = 0.68;
controls.zoomSpeed = 1.15;
controls.minDistance = 4;
controls.maxDistance = 260;
controls.minPolarAngle = Math.PI * 0.025;
controls.maxPolarAngle = Math.PI * 0.58;
controls.zoomToCursor = true;
controls.update();

let world;
let fluid;
let engine;
let xrCube;
let renderPipeline;
let bokehRenderPipeline;
let bloomNode;
let scenePass;
let saturationAmount;
let motionBlurAmount;
let focusDistanceAmount;
let focusRangeAmount;
let bokehScaleAmount;
let usePostProcessing = true;
let runtimePostProcessing = true;
let renderFailedOver = false;
let xrSession = null;
let showCues = [];
let nextCueIndex = 0;
let lastShowTime = 0;
let lastShowCueLaunch = null;
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
let loadForecastState = null;
let showLoadPlan = { eventCount: 0, windowCount: 0, windows: [] };
let activeQuality = 'medium';
let pipelineWarmupMs = 0;
let pendingRuntimeResolutionSync = false;
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
    const webgpuBackend = renderer.backend?.isWebGPUBackend === true;
    ui.setRendererStatus({ webgpu: webgpuBackend, label: webgpuBackend ? 'WEBGPU / TSL' : 'WEBGL 2 FALLBACK' });

    world = new WorldScene(scene, renderer, state);
    fluid = new FluidVolume(scene, state);
    engine = new FireworkEngine(scene, state, { maxParticles: qualityParticleLimit(resolveQuality()) });
    particleLoadPlanner.setCapacity(engine.maxParticles);
    loadForecastState = particleLoadPlanner.forecast({ enabled: state.quality.predictiveLoad });
    loadGuardState = particleLoadGuard.update({
      frameMs: 1000 / 60,
      particles: 0,
      capacity: engine.maxParticles,
      forecastParticles: loadForecastState.predictedParticles,
      predictive: state.quality.predictiveLoad,
    });
    engine.setLoadBudget(loadGuardState);
    engine.setGlobalBrightness(state.quality.fireworkBrightness);
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
    await warmupRenderPaths();

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
      particleLoadPlanner,
      state,
      launch: (presetId = state.selectedPresetId, layout = state.launchLayout) => launchPreset(FIREWORK_PRESETS.find((preset) => preset.id === presetId) ?? FIREWORK_PRESETS[0], layout),
      setCameraView,
      clear: clearSimulation,
      diagnostics: () => ({
        backend: renderer.backend?.constructor?.name ?? 'unknown',
        webgpu: Boolean(renderer.backend?.isWebGPUBackend),
        particles: engine.activeCount,
        renderedParticles: engine.renderedCount,
        particleRenderLimit: engine.renderLimit,
        volumeGrid: [fluid.nx, fluid.ny, fluid.nz],
        volumePerformance: {
          steps: fluid.material.steps,
          shadowSteps: fluid.shadowMaterial.steps,
          updateRate: fluid.updateRate,
          slicesPerFrame: fluid.simulationSlicesPerFrame,
          simulationProgress: fluid.simulationProgress,
          ...fluid.performanceDiagnostics,
        },
        particlePerformance: engine.performanceDiagnostics,
        pipelineWarmupMs,
        xrPresenting: renderer.xr.isPresenting,
        fps: fpsAverage,
        camera: {
          position: camera.position.toArray(),
          target: controls.target.toArray(),
          distance: camera.position.distanceTo(controls.target),
          minDistance: controls.minDistance,
          maxDistance: controls.maxDistance,
          minPolarAngle: controls.minPolarAngle,
          maxPolarAngle: controls.maxPolarAngle,
          panEnabled: controls.enablePan,
        },
        effects: {
          bloom: state.quality.bloom,
          fireworkBrightness: state.quality.fireworkBrightness,
          bloomStrength: state.quality.bloomStrength,
          bloomRadius: state.quality.bloomRadius,
          bloomThreshold: state.quality.bloomThreshold,
          saturation: state.quality.saturation,
          motionBlur: state.quality.motionBlur,
          particleMotionVectors: true,
          depthOfField: state.quality.depthOfField,
          focusDistance: state.quality.focusDistance,
          focusRange: state.quality.focusRange,
          bokehScale: state.quality.bokehScale,
          bokehSamples: BOKEH_SAMPLE_COUNT,
          particleBlend: engine.blendingMode,
          predictiveLoad: state.quality.predictiveLoad,
          postProcessingActive: runtimePostProcessing,
        },
        sound: {
          enabled: state.sound.enabled,
          volume: state.sound.volume,
          musicVolume: audio.volume,
          activeVoices: fireworkSound.activeVoices,
          ready: fireworkSound.context?.state === 'running',
        },
        show: {
          playing: audio.playing,
          cueCount: showCues.length,
          nextCueIndex,
          choreography: { ...state.show },
          lastLaunch: lastShowCueLaunch ? { ...lastShowCueLaunch } : null,
        },
        loadGuard: loadGuardState ? {
          level: loadGuardState.level,
          mode: loadGuardState.name,
          admissionLevel: loadGuardState.admissionLevel,
          forecastLed: loadGuardState.forecastLed,
          loadRatio: loadGuardState.loadRatio,
          frameMs: loadGuardState.frameEma,
          softLimit: loadGuardState.softLimit,
          renderLimit: loadGuardState.renderLimit,
          maxSpawnPerFrame: loadGuardState.maxSpawnPerFrame,
          trailScale: loadGuardState.trailScale,
          particleScale: loadGuardState.particleScale,
          reflectionScale: loadGuardState.reflectionScale,
          postProcessing: loadGuardState.postProcessing,
          forecastParticles: loadGuardState.forecastParticles,
          forecastRatio: loadGuardState.forecastRatio,
          forecastLevel: loadGuardState.forecastLevel,
        } : null,
        loadForecast: loadForecastState ? { ...loadForecastState } : null,
        showLoadPlan: {
          eventCount: showLoadPlan.eventCount,
          windowCount: showLoadPlan.windowCount,
          windows: showLoadPlan.windows.map((window) => ({ ...window })),
        },
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
  focusDistanceAmount = uniform(state.quality.focusDistance);
  focusRangeAmount = uniform(state.quality.focusRange);
  bokehScaleAmount = uniform(state.quality.bokehScale);
  const velocityTexture = scenePass.getTextureNode('velocity').mul(motionBlurAmount);
  const motionColor = motionBlur(sceneColor, velocityTexture, int(8));
  bloomNode = bloom(motionColor);
  const composite = motionColor.add(bloomNode);
  renderPipeline = new THREE.RenderPipeline(renderer);
  renderPipeline.outputNode = vec4(saturation(composite.rgb, saturationAmount), composite.a);
  const bokehColor = bokehDepthOfField(composite, scenePass.getViewZNode(), focusDistanceAmount, focusRangeAmount, bokehScaleAmount);
  bokehRenderPipeline = new THREE.RenderPipeline(renderer);
  bokehRenderPipeline.outputNode = vec4(saturation(bokehColor.rgb, saturationAmount), bokehColor.a);
  syncPostProcessing();
}

function syncPostProcessing() {
  if (!bloomNode || !saturationAmount || !motionBlurAmount || !focusDistanceAmount || !focusRangeAmount || !bokehScaleAmount) return;
  bloomNode.threshold.value = state.quality.bloomThreshold;
  bloomNode.strength.value = state.quality.bloom ? state.quality.bloomStrength : 0;
  bloomNode.radius.value = state.quality.bloomRadius;
  saturationAmount.value = state.quality.saturation;
  motionBlurAmount.value = state.quality.motionBlur;
  focusDistanceAmount.value = state.quality.focusDistance;
  focusRangeAmount.value = state.quality.focusRange;
  bokehScaleAmount.value = state.quality.bokehScale;
  usePostProcessing = state.quality.bloom
    || (state.quality.depthOfField && state.quality.bokehScale > 0.001)
    || state.quality.motionBlur > 0.001
    || Math.abs(state.quality.saturation - 1) > 0.001;
}

function getActiveRenderPipeline() {
  return state.quality.depthOfField && state.quality.bokehScale > 0.001 ? bokehRenderPipeline : renderPipeline;
}

async function warmupRenderPaths() {
  const startedAt = performance.now();
  const particleWarmup = engine.prepareRenderWarmup();
  const lightStates = world.preparePipelineWarmup();
  try {
    if (typeof renderer.compileAsync === 'function') await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    if (renderPipeline) renderPipeline.render();
    if (bokehRenderPipeline) bokehRenderPipeline.render();
    const queue = renderer.backend?.device?.queue;
    if (typeof queue?.onSubmittedWorkDone === 'function') await queue.onSubmittedWorkDone();
  } catch (error) {
    console.warn('Renderer warmup could not complete every path', error);
  } finally {
    if (particleWarmup) engine.finishRenderWarmup();
    world.finishPipelineWarmup(lightStates);
    pipelineWarmupMs = performance.now() - startedAt;
  }
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
    scheduleSingle(FIREWORK_PRESETS[4], { x: -7, delay: 0.15, scale: 0.92 });
    scheduleSingle(FIREWORK_PRESETS[0], { x: 7, delay: 0.58, scale: 1.08 });
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
  ui.addEventListener('cameraview', (event) => setCameraView(event.detail.value));
  ui.addEventListener('quality', (event) => applyQuality(event.detail.value === 'auto' ? resolveQuality() : event.detail.value));
  ui.addEventListener('qualitytoggle', (event) => {
    if (event.detail.key === 'bloom' || event.detail.key === 'depthOfField') syncPostProcessing();
    if (event.detail.key === 'shadows') {
      world.setShadows(event.detail.value);
      fluid.setShadows(event.detail.value);
    }
    if (event.detail.key === 'predictiveLoad') {
      particleLoadPlanner.clearManualPlan();
      refreshShowLoadPlan();
      ui.toast(event.detail.value ? '부하구간 사전 연산을 활성화했습니다' : '부하구간 사전 연산을 해제했습니다');
    }
  });
  ui.addEventListener('statechange', (event) => {
    if (event.detail.path === 'volume.smoke') fluid.setVisible(event.detail.value > 0.001);
    if (event.detail.path.startsWith('quality.')) syncPostProcessing();
    if (event.detail.path === 'quality.particleBlend') engine.setBlendingMode(event.detail.value);
    if (event.detail.path === 'quality.fireworkBrightness') engine.setGlobalBrightness(event.detail.value);
    if (event.detail.path === 'sound.volume') fireworkSound.setVolume();
    if (event.detail.path === 'physics.particleLifetime') {
      engine.setPostBurstLifetimeScale(event.detail.value);
      particleLoadPlanner.clearManualPlan();
      refreshShowLoadPlan();
    }
    if (event.detail.path === 'show.musicVolume') audio.setVolume(event.detail.value);
  });
  ui.addEventListener('soundtoggle', (event) => {
    fireworkSound.setEnabled();
    if (event.detail.value) void armFireworkSound();
    else ui.setSoundStatus('MUTED');
  });
  ui.addEventListener('showgenerated', (event) => {
    showCues = event.detail.cues;
    nextCueIndex = 0;
    refreshShowLoadPlan();
  });
  ui.addEventListener('showpreview', (event) => {
    void armFireworkSound();
    launchShowCue(event.detail.cue, true);
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

const CAMERA_VIEWS = Object.freeze({
  default: { position: [0, 18, 68], target: [0, 22, 0] },
  wide: { position: [0, 9, 170], target: [0, 28, 0] },
  low: { position: [0, 2.2, 94], target: [0, 26, 0] },
});

function setCameraView(name = 'default') {
  const view = CAMERA_VIEWS[name] ?? CAMERA_VIEWS.default;
  const resolvedName = CAMERA_VIEWS[name] ? name : 'default';
  camera.position.set(...view.position);
  controls.target.set(...view.target);
  controls.update();
  constrainCameraRig();
  canvas.dataset.cameraView = resolvedName;
  canvas.dataset.cameraDistance = camera.position.distanceTo(controls.target).toFixed(2);
  canvas.dataset.cameraHeight = camera.position.y.toFixed(2);
  return {
    name: resolvedName,
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    distance: camera.position.distanceTo(controls.target),
  };
}

function constrainCameraRig() {
  const clampedTargetX = clamp(controls.target.x, -160, 160);
  const clampedTargetY = clamp(controls.target.y, 1, 90);
  const clampedTargetZ = clamp(controls.target.z, -160, 160);
  camera.position.x += clampedTargetX - controls.target.x;
  camera.position.y += clampedTargetY - controls.target.y;
  camera.position.z += clampedTargetZ - controls.target.z;
  controls.target.set(clampedTargetX, clampedTargetY, clampedTargetZ);
  camera.position.y = Math.max(0.35, camera.position.y);
}

function setupPointerInteraction() {
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
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
      const binding = RANGE_BINDINGS_FOR_CUBE[path];
      if (binding) {
        const inputId = typeof binding === 'string' ? binding : binding.id;
        const scale = typeof binding === 'string' ? 1 : binding.scale;
        const input = document.getElementById(inputId);
        if (input) {
          input.value = value / scale;
          input.dispatchEvent(new Event('input'));
          return;
        }
      }
      store.set(path, value);
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
    getShowChoreographyName: () => {
      const select = ui.elements.showchoreography;
      return select.options[select.selectedIndex]?.textContent ?? state.show.choreographyPreset;
    },
    nextShowChoreography: () => ui.nextShowChoreography(),
    getCueCount: () => ui.cues.length,
    generateShow: () => ui.generateShow(),
    clear: () => { clearSimulation(); ui.toast('입자와 볼륨을 비웠습니다'); },
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
      fluid.setShadows(value);
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
  'physics.drag': { id: 'drag', scale: BASE_AIR_DRAG },
  'physics.particleLifetime': 'particle-lifetime',
  'physics.windX': 'wind-x',
  'physics.vortex': 'vortex',
  'quality.fireworkBrightness': 'firework-brightness',
});

function clearSimulation() {
  engine?.clear();
  fluid?.clear();
  particleLoadPlanner.clearManualPlan();
}

function scheduleSingle(preset, options = {}) {
  if (state.quality.predictiveLoad) particleLoadPlanner.scheduleLaunch(preset, 'single', engine.time, { ...options, lifetimeScale: state.physics.particleLifetime });
  engine.schedule(preset, options);
}

function refreshShowLoadPlan() {
  if (!state.quality.predictiveLoad || !showCues.length) {
    particleLoadPlanner.clearShowPlan();
    showLoadPlan = particleLoadPlanner.getShowPlan();
    ui.setLoadPlan(showLoadPlan);
    return showLoadPlan;
  }
  showLoadPlan = particleLoadPlanner.planShow(showCues, (presetId) => FIREWORK_PRESETS.find((preset) => preset.id === presetId), { lifetimeScale: state.physics.particleLifetime });
  ui.setLoadPlan(showLoadPlan);
  return showLoadPlan;
}

function launchPreset(preset, layout = 'single', options = {}) {
  if (!engine || !preset) return;
  void armFireworkSound();
  if (state.quality.predictiveLoad) particleLoadPlanner.scheduleLaunch(preset, layout, engine.time, { ...options, lifetimeScale: state.physics.particleLifetime });
  const count = engine.launchLayout(preset, layout, options);
  ui.toast(`${preset.name} · ${layout.toUpperCase()} ${count}발`);
}

function showCueLaunchOptions(cue) {
  const choreography = cue.choreography ?? {};
  return {
    scale: clamp(0.72 + cue.energy * 0.35, 0.78, 1.28),
    spread: 0.7 + clamp(choreography.positionSpread ?? state.show.positionSpread, 0, 1.5) * 0.45,
    x: choreography.launchX ?? 0,
    z: choreography.launchZ ?? 0,
    yaw: choreography.launchYaw ?? 0,
    launchPower: choreography.launchPower ?? 1,
    explosionPower: choreography.explosionPower ?? 1,
    sequenceDelay: choreography.sequenceDelay ?? 0,
    crossLaunch: choreography.crossLaunch === true,
    colorHue: choreography.colorHue ?? 0,
    colorVariation: choreography.colorVariation ?? 0,
  };
}

function launchShowCue(cue, manualPreview = false) {
  if (!engine || !cue) return 0;
  const preset = getPresetForCue(cue);
  const options = showCueLaunchOptions(cue);
  let count;
  if (manualPreview) {
    if (state.quality.predictiveLoad) particleLoadPlanner.scheduleLaunch(preset, cue.layout, engine.time, { ...options, lifetimeScale: state.physics.particleLifetime });
    count = engine.launchLayout(preset, cue.layout, options);
    ui.toast(`${preset.name} · ${cue.choreography?.directionMode ?? 'music'} · ${count}발 미리보기`);
  } else {
    count = engine.launchLayout(preset, cue.layout, options);
  }
  lastShowCueLaunch = {
    cueId: cue.id,
    presetId: preset.id,
    layout: cue.layout,
    count,
    directionMode: cue.choreography?.directionMode ?? 'music',
    launchX: options.x,
    launchYaw: options.yaw,
    launchPower: options.launchPower,
    explosionPower: options.explosionPower,
    sequenceDelay: options.sequenceDelay,
    crossLaunch: options.crossLaunch,
    colorHue: options.colorHue,
  };
  canvas.dataset.showCue = String(cue.id ?? 'preview');
  canvas.dataset.showDirection = String(lastShowCueLaunch.directionMode);
  canvas.dataset.showLaunchCount = String(count);
  canvas.dataset.showLaunchPower = String(options.launchPower);
  canvas.dataset.showExplosionPower = String(options.explosionPower);
  canvas.dataset.showCrossLaunch = String(options.crossLaunch);
  canvas.dataset.showColorHue = String(options.colorHue);
  return count;
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
    launchShowCue(cue);
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
  loadForecastState = particleLoadPlanner.forecast({
    engineTime: engine.time,
    audioTime: audio.currentTime,
    showPlaying: audio.playing,
    enabled: state.quality.predictiveLoad,
  });
  loadGuardState = particleLoadGuard.update({
    frameMs,
    particles: engine.activeCount,
    capacity: engine.maxParticles,
    adaptive: state.quality.adaptive && !document.hidden && performance.now() > 3000,
    forecastParticles: loadForecastState.predictedParticles,
    predictive: state.quality.predictiveLoad,
  });
  engine.setLoadBudget(loadGuardState);
  if (loadGuardState.changed) handleLoadGuardTransition(previousGuardLevel, loadGuardState);
  if (pendingRuntimeResolutionSync && engine.activeCount === 0) {
    applyRuntimeResolution();
    pendingRuntimeResolutionSync = false;
  }
  if (!renderer.xr.isPresenting) {
    controls.update();
    constrainCameraRig();
  }
  updateShow();
  engine.update(dt);
  fluid.update(dt);
  world.update(dt);
  xrCube?.update(dt);
  const immediateParticleLevel = particleLoadLevel(engine.activeCount / engine.maxParticles);
  runtimePostProcessing = loadGuardState.postProcessing && immediateParticleLevel === 0;

  try {
    if (usePostProcessing && runtimePostProcessing && !renderer.xr.isPresenting && !renderFailedOver) getActiveRenderPipeline().render();
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
    ui.updateTelemetry({
      fps: fpsAverage,
      particles: engine.activeCount,
      rendered: engine.renderedCount,
      motionVectors: engine.performanceDiagnostics.motionVectorParticles,
      renderLimit: engine.renderLimit,
      volume: `${fluid.nx}×${fluid.ny}×${fluid.nz}`,
      volumePerformance: {
        steps: fluid.material.steps,
        shadowSteps: fluid.shadowMaterial.steps,
        updateRate: fluid.updateRate,
        slicesPerFrame: fluid.simulationSlicesPerFrame,
      },
    });
    ui.setPerformanceGuard({ ...loadGuardState, postProcessing: runtimePostProcessing });
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

function applyRuntimeResolution({ resizeTargets = true } = {}) {
  const settings = qualitySettings(activeQuality);
  const guardScale = loadGuardState?.resolutionScale ?? 1;
  const reflectionScale = loadGuardState?.reflectionScale ?? 1;
  if (resizeTargets) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, Math.max(0.62, settings.pixelRatio * guardScale)));
    if (world?.reflectionNode) world.reflectionNode.resolutionScale = Math.max(0.08, settings.reflection * guardScale * reflectionScale);
  }
  world?.setPerformanceLevel(loadGuardState?.level ?? 0);
  fluid?.setPerformanceLevel(loadGuardState?.level ?? 0);
  if (resizeTargets) resize();
}

function handleLoadGuardTransition(previousLevel, next) {
  const forecastLed = next.forecastLevel > 0 && next.forecastRatio > next.loadRatio + 0.05;
  const safeToResize = forecastLed || engine.activeCount === 0;
  applyRuntimeResolution({ resizeTargets: safeToResize });
  pendingRuntimeResolutionSync = !safeToResize;
  ui.setPerformanceGuard(next);
  if (next.level > previousLevel && next.level >= 2) {
    ui.toast(forecastLed
      ? `고부하 구간 ${loadForecastState?.peakIn?.toFixed?.(1) ?? 0}초 전 · 선제 최적화 활성`
      : next.level === 3
        ? '급증 보호 활성 · 잔상과 후처리 부하를 즉시 낮췄습니다'
        : '파티클 밀도를 조절해 프레임을 보호합니다');
  } else if (next.level === 0 && previousLevel > 0) {
    ui.toast('파티클 부하 안정 · 전체 효과 품질을 복원했습니다');
  }
}

function applyQuality(quality) {
  if (!fluid || !world) return;
  activeQuality = quality;
  fluid.setQuality(quality);
  applyRuntimeResolution();
  syncPostProcessing();
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
