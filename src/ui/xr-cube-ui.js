import * as THREE from 'three/webgpu';
import { MAX_BOKEH_GAMMA, MIN_BOKEH_GAMMA } from '../core/bokeh-response.js';
import {
  BASE_AIR_DRAG,
  MAX_AIR_DRAG,
  MAX_BOKEH_SAMPLES,
  MAX_CAMERA_FOV,
  MAX_LAUNCH_CENTER_X,
  MAX_LAUNCH_POSITION_RANGE,
  MAX_POST_BURST_LIFETIME,
  MIN_BOKEH_SAMPLES,
  MIN_CAMERA_FOV,
  MIN_LAUNCH_CENTER_X,
  MIN_LAUNCH_POSITION_RANGE,
  MIN_POST_BURST_LIFETIME,
} from '../core/state.js';

const FACE_SIZE = 0.128;
const HALF = FACE_SIZE / 2;
const CANVAS_SIZE = 512;
const ROW_TOP = 78;
const ROW_BOTTOM = 470;

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export class XRCubeUI extends EventTarget {
  constructor(scene, camera, renderer, state, callbacks = {}) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.state = state;
    this.callbacks = callbacks;
    this.group = new THREE.Group();
    this.group.name = 'WebGPU XR five-face cube UI';
    this.group.visible = false;
    this.faceMeshes = [];
    this.activeFace = 0;
    this.hover = null;
    this.heldController = null;
    this.raycaster = new THREE.Raycaster();
    this.tempOrigin = new THREE.Vector3();
    this.tempDirection = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.lastInteractionPosition = new THREE.Vector3();

    this.faces = [
      {
        title: 'SIM',
        accent: '#5ee9ff',
        rows: [
          { label: '중력', value: () => `${this.state.physics.gravity.toFixed(2)} g`, action: () => this.adjust('physics.gravity', 0.1, 0, 2) },
          { label: '공기 저항', value: () => `${(this.state.physics.drag / BASE_AIR_DRAG).toFixed(1)}×`, action: () => this.adjust('physics.drag', BASE_AIR_DRAG, 0, MAX_AIR_DRAG) },
          { label: '폭발 수명', value: () => `${this.state.physics.particleLifetime.toFixed(2)}×`, action: () => this.adjust('physics.particleLifetime', 0.25, MIN_POST_BURST_LIFETIME, MAX_POST_BURST_LIFETIME) },
          { label: '바람', value: () => `${this.state.physics.windX.toFixed(1)} m/s`, action: () => this.adjust('physics.windX', 0.8, -8, 8) },
          { label: '보텍스', value: () => this.state.physics.vortex.toFixed(2), action: () => this.adjust('physics.vortex', 0.2, 0, 2) },
          { label: '공기 도구', value: () => this.state.tool.toUpperCase(), action: () => this.callbacks.cycleTool?.() },
        ],
      },
      {
        title: 'SHELL',
        accent: '#ff87d9',
        rows: [
          { label: '현재 불꽃', value: () => this.callbacks.getPresetName?.() ?? '—', action: () => this.callbacks.nextPreset?.() },
          { label: '이전 프리셋', value: () => '◀', action: () => this.callbacks.previousPreset?.() },
          { label: '다음 프리셋', value: () => '▶', action: () => this.callbacks.nextPreset?.() },
          { label: '발사 중심', value: () => `${Math.round(this.state.launch.centerX)}m`, action: () => this.adjust('launch.centerX', 4, MIN_LAUNCH_CENTER_X, MAX_LAUNCH_CENTER_X) },
          { label: '위치 범위', value: () => `${Math.round(this.state.launch.positionRange * 100)}%`, action: () => this.adjust('launch.positionRange', 0.25, MIN_LAUNCH_POSITION_RANGE, MAX_LAUNCH_POSITION_RANGE) },
          { label: '발사', value: () => 'LAUNCH', action: () => this.callbacks.launch?.() },
        ],
      },
      {
        title: 'SHOW',
        accent: '#a58bff',
        rows: [
          { label: '음악 쇼', value: () => this.callbacks.isShowPlaying?.() ? 'PAUSE' : 'PLAY', action: () => this.callbacks.toggleShow?.() },
          { label: '연출 프리셋', value: () => this.callbacks.getShowChoreographyName?.() ?? 'BALANCED', action: () => this.callbacks.nextShowChoreography?.() },
          { label: '큐 수', value: () => `${this.callbacks.getCueCount?.() ?? 0}`, action: () => this.callbacks.generateShow?.() },
          { label: '전체 지우기', value: () => 'CLEAR', action: () => this.callbacks.clear?.() },
        ],
      },
      {
        title: 'WORLD',
        accent: '#70ffb9',
        rows: [
          { label: '환경', value: () => this.state.world.environment.toUpperCase(), action: () => this.callbacks.nextEnvironment?.() },
          { label: '바닥', value: () => this.state.world.floor.toUpperCase(), action: () => this.callbacks.nextFloor?.() },
          { label: '볼륨', value: () => this.state.volume.smoke > 0 ? 'ON' : 'OFF', action: () => this.callbacks.toggleVolume?.() },
          { label: '그림자', value: () => this.state.quality.shadows ? 'ON' : 'OFF', action: () => this.callbacks.toggleShadows?.() },
          { label: 'PC 화각', value: () => `${Math.round(this.state.camera.fov)}°`, action: () => this.adjust('camera.fov', 5, MIN_CAMERA_FOV, MAX_CAMERA_FOV) },
        ],
      },
      {
        title: 'SYSTEM',
        accent: '#ffc775',
        rows: [
          { label: '품질', value: () => this.state.quality.preset.toUpperCase(), action: () => this.callbacks.nextQuality?.() },
          { label: '밝기 · 입자', value: () => `${Math.round(this.state.quality.fireworkBrightness * 100)}% · ${this.callbacks.getParticleCount?.() ?? 0}`, action: () => this.adjust('quality.fireworkBrightness', 0.25, 0.25, 3) },
          { label: '보케 샘플', value: () => `${this.state.quality.bokehSamples} TAP`, action: () => this.adjust('quality.bokehSamples', 4, MIN_BOKEH_SAMPLES, MAX_BOKEH_SAMPLES) },
          { label: '보케 감마', value: () => `${this.state.quality.bokehGamma.toFixed(2)} G`, action: () => this.adjust('quality.bokehGamma', 0.25, MIN_BOKEH_GAMMA, MAX_BOKEH_GAMMA) },
          { label: '큐브 회전', value: () => 'NEXT FACE', action: () => this.rotateFace(1) },
          { label: 'XR 종료', value: () => 'EXIT', action: () => this.callbacks.exitXR?.() },
        ],
      },
    ];

    this.buildCube();
    this.setupControllers();
    scene.add(this.group);
  }

  buildCube() {
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0x07101b, transparent: true, opacity: 0.86 });
    const core = new THREE.Mesh(new THREE.BoxGeometry(FACE_SIZE * 0.96, FACE_SIZE * 0.96, FACE_SIZE * 0.96), coreMaterial);
    core.name = 'Cube UI core';
    this.group.add(core);

    const edgeGeometry = new THREE.EdgesGeometry(core.geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x5ee9ff, transparent: true, opacity: 0.65 });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.name = 'Cube UI edges';
    this.group.add(edges);

    const transforms = [
      { position: [0, 0, HALF + 0.001], rotation: [0, 0, 0] },
      { position: [HALF + 0.001, 0, 0], rotation: [0, Math.PI / 2, 0] },
      { position: [0, 0, -HALF - 0.001], rotation: [0, Math.PI, 0] },
      { position: [-HALF - 0.001, 0, 0], rotation: [0, -Math.PI / 2, 0] },
      { position: [0, HALF + 0.001, 0], rotation: [-Math.PI / 2, 0, 0] },
    ];

    this.faces.forEach((face, index) => {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.98, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(FACE_SIZE * 0.94, FACE_SIZE * 0.94), material);
      mesh.name = `Cube face ${face.title}`;
      mesh.userData.faceIndex = index;
      mesh.position.fromArray(transforms[index].position);
      mesh.rotation.set(...transforms[index].rotation);
      mesh.renderOrder = 20;
      this.group.add(mesh);
      this.faceMeshes.push({ mesh, canvas, context: canvas.getContext('2d'), texture, face, hoverRow: -1 });
      this.drawFace(index);
    });
  }

  drawFace(faceIndex, hoverRow = -1) {
    const record = this.faceMeshes[faceIndex];
    if (!record) return;
    const { context, canvas, face } = record;
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, 'rgba(10, 19, 31, 0.98)');
    gradient.addColorStop(1, 'rgba(5, 9, 17, 0.98)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = face.accent;
    context.globalAlpha = 0.65;
    context.lineWidth = 3;
    context.strokeRect(3, 3, width - 6, height - 6);
    context.globalAlpha = 1;

    context.fillStyle = face.accent;
    context.font = '700 24px system-ui, sans-serif';
    context.letterSpacing = '4px';
    context.fillText(face.title, 34, 48);
    context.fillStyle = 'rgba(200, 218, 239, 0.42)';
    context.font = '500 14px system-ui, sans-serif';
    context.fillText(`${faceIndex + 1} / 5  ·  PYROVERSE XR`, 302, 46);

    const top = ROW_TOP;
    const rowHeight = (ROW_BOTTOM - ROW_TOP) / face.rows.length;
    face.rows.forEach((row, rowIndex) => {
      const y = top + rowIndex * rowHeight;
      drawRoundedRect(context, 24, y, width - 48, rowHeight - 8, Math.min(16, rowHeight * 0.22));
      context.fillStyle = rowIndex === hoverRow ? `${face.accent}24` : 'rgba(255,255,255,0.035)';
      context.fill();
      context.strokeStyle = rowIndex === hoverRow ? face.accent : 'rgba(180, 209, 235, 0.12)';
      context.lineWidth = rowIndex === hoverRow ? 3 : 1;
      context.stroke();
      context.fillStyle = rowIndex === hoverRow ? '#ffffff' : '#a8b8cb';
      context.font = '550 22px system-ui, sans-serif';
      context.fillText(row.label, 45, y + rowHeight * 0.58);
      context.fillStyle = rowIndex === hoverRow ? face.accent : '#e9f4ff';
      context.font = '700 19px system-ui, sans-serif';
      context.textAlign = 'right';
      const value = String(row.value()).slice(0, 18);
      context.fillText(value, width - 46, y + rowHeight * 0.58);
      context.textAlign = 'left';
    });

    context.fillStyle = 'rgba(196, 218, 239, 0.36)';
    context.font = '500 14px system-ui, sans-serif';
    context.fillText('TRIGGER SELECT  ·  SQUEEZE LAUNCH', 35, height - 24);
    record.texture.needsUpdate = true;
    record.hoverRow = hoverRow;
  }

  setupControllers() {
    this.controllers = [0, 1].map((index) => {
      const controller = this.renderer.xr.getController(index);
      controller.name = `XR input ray ${index + 1}`;
      const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)];
      const rayGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const rayMaterial = new THREE.LineBasicMaterial({ color: index === 0 ? 0x5ee9ff : 0xff7bd4, transparent: true, opacity: 0.72 });
      const ray = new THREE.Line(rayGeometry, rayMaterial);
      ray.scale.z = 6;
      ray.name = 'Cube UI target ray';
      controller.add(ray);
      controller.addEventListener('selectstart', () => this.onSelectStart(controller));
      controller.addEventListener('selectend', () => this.onSelectEnd(controller));
      controller.addEventListener('squeezestart', () => this.callbacks.launch?.());
      this.scene.add(controller);
      return controller;
    });
    this.grip = this.renderer.xr.getControllerGrip(0);
    this.scene.add(this.grip);
  }

  rayFromController(controller) {
    controller.getWorldPosition(this.tempOrigin);
    controller.getWorldQuaternion(this.tempQuaternion);
    this.tempDirection.set(0, 0, -1).applyQuaternion(this.tempQuaternion).normalize();
    this.raycaster.ray.origin.copy(this.tempOrigin);
    this.raycaster.ray.direction.copy(this.tempDirection);
    this.raycaster.far = 12;
    return this.raycaster;
  }

  hitTest(controller) {
    const raycaster = this.rayFromController(controller);
    const hit = raycaster.intersectObjects(this.faceMeshes.map((record) => record.mesh), false)[0];
    if (!hit?.uv) return null;
    const faceIndex = hit.object.userData.faceIndex;
    const face = this.faces[faceIndex];
    const canvasY = (1 - hit.uv.y) * CANVAS_SIZE;
    const rowHeight = (ROW_BOTTOM - ROW_TOP) / face.rows.length;
    const row = Math.floor((canvasY - ROW_TOP) / rowHeight);
    if (canvasY < ROW_TOP || canvasY >= ROW_BOTTOM || row < 0 || row >= face.rows.length) return { faceIndex, row: -1, hit };
    return { faceIndex, row, hit };
  }

  onSelectStart(controller) {
    const target = this.hitTest(controller);
    if (target && target.row >= 0) {
      this.faces[target.faceIndex].rows[target.row].action();
      this.drawAll();
      this.dispatchEvent(new CustomEvent('activate', { detail: target }));
      return;
    }
    this.heldController = controller;
    const point = this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, 10);
    this.lastInteractionPosition.copy(point);
    this.callbacks.interact?.(point, this.raycaster.ray.direction.clone(), this.state.tool, true);
  }

  onSelectEnd(controller) {
    if (this.heldController === controller) this.heldController = null;
  }

  adjust(path, step, min, max) {
    const [group, key] = path.split('.');
    let value = this.state[group][key] + step;
    if (value > max + 1e-6) value = min;
    this.callbacks.setState?.(path, Math.max(min, Math.min(max, value)));
  }

  rotateFace(direction) {
    this.activeFace = (this.activeFace + direction + 4) % 4;
    this.group.rotation.y = -this.activeFace * Math.PI / 2;
    this.drawAll();
  }

  drawAll() {
    this.faceMeshes.forEach((record, index) => this.drawFace(index, record.hoverRow));
  }

  startSession() {
    this.group.visible = true;
    this.group.removeFromParent();
    this.grip.add(this.group);
    this.group.position.set(0.085, 0.075, -0.145);
    this.group.rotation.set(-0.22, -0.35, 0.02);
    this.group.scale.setScalar(1);
    this.drawAll();
  }

  endSession() {
    this.group.removeFromParent();
    this.scene.add(this.group);
    this.group.visible = false;
    this.heldController = null;
  }

  update(dt) {
    if (!this.group.visible) return;
    let nextHover = null;
    for (const controller of this.controllers) {
      if (!controller.visible) continue;
      const target = this.hitTest(controller);
      if (target?.row >= 0) {
        nextHover = target;
        break;
      }
    }
    if (nextHover?.faceIndex !== this.hover?.faceIndex || nextHover?.row !== this.hover?.row) {
      if (this.hover) this.drawFace(this.hover.faceIndex, -1);
      if (nextHover) this.drawFace(nextHover.faceIndex, nextHover.row);
      this.hover = nextHover;
    }
    if (this.heldController) {
      this.rayFromController(this.heldController);
      const point = this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, 10);
      const direction = point.clone().sub(this.lastInteractionPosition).multiplyScalar(1 / Math.max(0.001, dt));
      if (direction.lengthSq() > 0.001) this.callbacks.interact?.(point, direction, this.state.tool, false);
      this.lastInteractionPosition.copy(point);
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const record of this.faceMeshes) {
      record.mesh.geometry.dispose();
      record.mesh.material.dispose();
      record.texture.dispose();
    }
    for (const controller of this.controllers) {
      controller.children.forEach((child) => {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
      controller.removeFromParent();
    }
    this.grip.removeFromParent();
  }
}
