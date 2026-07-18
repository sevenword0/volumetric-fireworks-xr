import * as THREE from 'three/webgpu';
import {
  Fn,
  Loop,
  cameraPosition,
  float,
  fract,
  frameId,
  interleavedGradientNoise,
  min,
  mix,
  positionWorld,
  screenCoordinate,
  smoothstep,
  texture3D,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { RENDER_LAYERS } from '../core/render-layers.js';

const DEFAULT_GRID = Object.freeze({ x: 32, y: 24, z: 32 });
const BASE_VOLUME_SIZE = Object.freeze({ x: 58, y: 42, z: 46 });
export const SMOKE_VOLUME_EXTENT_SCALE = 2;
export const DEFAULT_VOLUME_SIZE = Object.freeze({
  x: BASE_VOLUME_SIZE.x * SMOKE_VOLUME_EXTENT_SCALE,
  y: BASE_VOLUME_SIZE.y * SMOKE_VOLUME_EXTENT_SCALE,
  z: BASE_VOLUME_SIZE.z * SMOKE_VOLUME_EXTENT_SCALE,
});
const UP = new THREE.Vector3(0, 1, 0);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class FluidVolume {
  constructor(scene, state, options = {}) {
    this.scene = scene;
    this.state = state;
    this.nx = options.grid?.x ?? DEFAULT_GRID.x;
    this.ny = options.grid?.y ?? DEFAULT_GRID.y;
    this.nz = options.grid?.z ?? DEFAULT_GRID.z;
    this.size = new THREE.Vector3(options.size?.x ?? DEFAULT_VOLUME_SIZE.x, options.size?.y ?? DEFAULT_VOLUME_SIZE.y, options.size?.z ?? DEFAULT_VOLUME_SIZE.z);
    this.center = new THREE.Vector3(0, this.size.y / 2, 0);
    this.cellCount = this.nx * this.ny * this.nz;
    this.density = new Float32Array(this.cellCount);
    this.temperature = new Float32Array(this.cellCount);
    this.velocityX = new Float32Array(this.cellCount);
    this.velocityY = new Float32Array(this.cellCount);
    this.velocityZ = new Float32Array(this.cellCount);
    this.nextDensity = new Float32Array(this.cellCount);
    this.nextTemperature = new Float32Array(this.cellCount);
    this.nextVelocityX = new Float32Array(this.cellCount);
    this.nextVelocityY = new Float32Array(this.cellCount);
    this.nextVelocityZ = new Float32Array(this.cellCount);
    this.textureData = new Uint8Array(this.cellCount * 4);
    this.emitters = [];
    this.impulses = [];
    this.emitterPool = [];
    this.impulsePool = [];
    this.emitterAllocations = 0;
    this.impulseAllocations = 0;
    this.launchSmokeEmissions = 0;
    this.burstSmokeEmissions = 0;
    this._gridPosition = { x: 0, y: 0, z: 0 };
    this._normalizedDirection = new THREE.Vector3();
    this.accumulator = 0;
    this.time = 0;
    this.baseUpdateRate = 12;
    this.baseSteps = 14;
    this.baseShadowSteps = 4;
    this.performanceLevel = 0;
    this.updateRate = this.baseUpdateRate;
    this.simulationSlicesPerFrame = 8;
    this.simulationJob = null;
    this.simulationCursorZ = 0;
    this.lastSimulationSlices = 0;
    this.completedSteps = 0;
    this.enabled = state.volume.smoke > 0.001;

    this.texture = new THREE.Data3DTexture(this.textureData, this.nx, this.ny, this.nz);
    this.texture.name = 'Fireworks smoke volume';
    this.texture.format = THREE.RGBAFormat;
    this.texture.type = THREE.UnsignedByteType;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.wrapR = THREE.ClampToEdgeWrapping;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;

    this.worldSizeUniform = uniform(this.size.clone());
    this.centerUniform = uniform(this.center.clone());
    this.densityUniform = uniform(state.volume.smoke);
    this.scatteringUniform = uniform(state.volume.scattering);
    this.shadowUniform = uniform(state.volume.shadow);
    this.densityContrastUniform = uniform(state.volume.densityContrast ?? 1);
    this.edgeSoftnessUniform = uniform(state.volume.edgeSoftness ?? 0.055);
    this.fireIntensityUniform = uniform(state.volume.fireGlow ?? 1.2);
    this.fireWarmUniform = uniform(new THREE.Color(0xff9a4b));
    this.fireHotUniform = uniform(new THREE.Color(0xfff4ce));

    const volumeTextureNode = texture3D(this.texture);
    const getSample = ({ positionRay }) => {
      const uvw = positionRay.sub(this.centerUniform).div(this.worldSizeUniform).add(0.5).toVar();
      const sample = volumeTextureNode.sample(uvw).level(0);
      let density = sample.r.mul(this.densityUniform).max(0).pow(this.densityContrastUniform).toVar();
      const temperature = sample.g;
      const edge = min(uvw, vec3(1).sub(uvw));
      density.mulAssign(smoothstep(0, this.edgeSoftnessUniform, min(edge.x, min(edge.y, edge.z))));
      return { density, temperature, uvw };
    };

    const material = new THREE.VolumeNodeMaterial();
    material.name = 'Raymarched smoke and fire';
    material.steps = this.baseSteps;
    material.transparent = true;
    material.depthWrite = false;
    material.blending = THREE.NormalBlending;
    material.side = THREE.BackSide;
    material.offsetNode = fract(interleavedGradientNoise(screenCoordinate).add(float(frameId).mul(0.61803398875)));
    material.scatteringNode = Fn(({ positionRay }) => {
      const { density } = getSample({ positionRay });
      return vec3(density.mul(this.scatteringUniform));
    });
    material.scatteringEmissiveNode = Fn(({ positionRay }) => {
      const { density, temperature } = getSample({ positionRay });
      const heat = temperature.pow(1.7).mul(this.fireIntensityUniform);
      const fireColor = mix(this.fireWarmUniform, this.fireHotUniform, temperature.smoothstep(0.36, 0.95));
      return fireColor.mul(heat).mul(density.add(0.04));
    });

    this.material = material;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(this.size.x, this.size.y, this.size.z), material);
    this.mesh.name = 'Volumetric fluid box';
    this.mesh.position.copy(this.center);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    const maxDistance = this.size.length();
    const shadowTraceSteps = 4;
    const shadowMaterial = new THREE.VolumeNodeMaterial();
    shadowMaterial.name = 'Volume shadow raymarch';
    shadowMaterial.steps = this.baseShadowSteps;
    shadowMaterial.offsetNode = material.offsetNode;
    shadowMaterial.castShadowNode = Fn(() => {
      const startPosition = positionWorld;
      const rayDirection = positionWorld.sub(cameraPosition).normalize().toVar();
      const distanceTravelled = float(0).toVar();
      const transmittance = float(1).toVar();
      const stepSize = float(maxDistance / shadowTraceSteps);
      Loop(shadowTraceSteps, () => {
        const rayPosition = startPosition.add(rayDirection.mul(distanceTravelled));
        const { density } = getSample({ positionRay: rayPosition });
        const falloff = density.mul(this.shadowUniform).mul(0.035).negate().mul(stepSize).exp();
        transmittance.mulAssign(falloff);
        distanceTravelled.addAssign(stepSize);
      });
      transmittance.greaterThanEqual(0.995).discard();
      return vec4(vec3(0), transmittance.oneMinus());
    })();
    shadowMaterial.shadowSide = THREE.FrontSide;
    shadowMaterial.colorWrite = false;
    shadowMaterial.depthWrite = false;
    shadowMaterial.blending = THREE.CustomBlending;
    shadowMaterial.blendEquation = THREE.AddEquation;
    shadowMaterial.blendSrc = THREE.ZeroFactor;
    shadowMaterial.blendDst = THREE.OneMinusSrcAlphaFactor;
    shadowMaterial.blendEquationAlpha = THREE.AddEquation;
    shadowMaterial.blendSrcAlpha = THREE.OneFactor;
    shadowMaterial.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    this.shadowMaterial = shadowMaterial;
    this.shadowMesh = new THREE.Mesh(this.mesh.geometry, shadowMaterial);
    this.shadowMesh.name = 'Volumetric shadow caster';
    this.shadowMesh.position.copy(this.center);
    this.shadowMesh.castShadow = true;
    this.shadowMesh.frustumCulled = false;
    // This mesh exists only for light shadow passes. Keeping it off the default
    // camera layer prevents an invisible second volume raymarch in the main and
    // water-reflection renders.
    this.shadowMesh.layers.set(RENDER_LAYERS.VOLUME_SHADOW);
    scene.add(this.shadowMesh);
    this.syncVisibility();
  }

  index(x, y, z) {
    return x + y * this.nx + z * this.nx * this.ny;
  }

  worldToGrid(position, target = this._gridPosition) {
    target.x = ((position.x - this.center.x) / this.size.x + 0.5) * (this.nx - 1);
    target.y = ((position.y - this.center.y) / this.size.y + 0.5) * (this.ny - 1);
    target.z = ((position.z - this.center.z) / this.size.z + 0.5) * (this.nz - 1);
    return target;
  }

  sample(field, x, y, z) {
    const cx = clamp(x, 0, this.nx - 1.001);
    const cy = clamp(y, 0, this.ny - 1.001);
    const cz = clamp(z, 0, this.nz - 1.001);
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const z0 = Math.floor(cz);
    const x1 = Math.min(this.nx - 1, x0 + 1);
    const y1 = Math.min(this.ny - 1, y0 + 1);
    const z1 = Math.min(this.nz - 1, z0 + 1);
    const tx = cx - x0;
    const ty = cy - y0;
    const tz = cz - z0;
    const c00 = lerp(field[this.index(x0, y0, z0)], field[this.index(x1, y0, z0)], tx);
    const c10 = lerp(field[this.index(x0, y1, z0)], field[this.index(x1, y1, z0)], tx);
    const c01 = lerp(field[this.index(x0, y0, z1)], field[this.index(x1, y0, z1)], tx);
    const c11 = lerp(field[this.index(x0, y1, z1)], field[this.index(x1, y1, z1)], tx);
    return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
  }

  addEmitter(position, density, temperature, color = null, radius = 1) {
    if (!this.enabled || this.emitters.length >= 120) return false;
    let emitter = this.emitterPool.pop();
    if (!emitter) {
      emitter = { position: new THREE.Vector3(), density: 0, temperature: 0, radius: 1 };
      this.emitterAllocations += 1;
    }
    emitter.position.copy(position);
    emitter.density = Math.max(0, density);
    emitter.temperature = Math.max(0, temperature);
    emitter.radius = Math.max(0.2, radius);
    this.emitters.push(emitter);
    return true;
  }

  emitFireworkSmoke(position, phase, options = {}) {
    const safeSmoke = clamp(Number.isFinite(Number(options.smoke)) ? Number(options.smoke) : 0, 0, 2.5);
    if (!this.enabled || safeSmoke <= 0) return false;
    const scale = clamp(Number.isFinite(Number(options.scale)) ? Number(options.scale) : 1, 0.35, 2.2);
    const power = clamp(Number.isFinite(Number(options.power)) ? Number(options.power) : 1, 0.25, 4);
    const brightness = clamp(Number.isFinite(Number(options.brightness)) ? Number(options.brightness) : 1, 0.1, 3);
    const smokeStride = clamp(Math.round(Number(options.smokeStride) || 1), 1, 12);
    const scaleRoot = Math.sqrt(scale);
    const isLaunch = phase === 'launch';
    const density = isLaunch
      ? (safeSmoke * 1.4 * scaleRoot * Math.sqrt(power)) / smokeStride
      : (safeSmoke * 3.2 * scale) / smokeStride;
    const temperature = (isLaunch ? 1.3 : 1.9 * scaleRoot) * brightness;
    const radius = (isLaunch ? 2.8 : 4.8) * scaleRoot;
    const added = this.addEmitter(position, density, temperature, options.color ?? null, radius);
    if (!added) return false;

    if (isLaunch) {
      this.launchSmokeEmissions += 1;
      this.addImpulse(position, UP, { type: 'gust', radius: 4.5 * scaleRoot, strength: 8 * Math.sqrt(power) });
    } else {
      this.burstSmokeEmissions += 1;
      this.addImpulse(position, UP, { type: 'repel', radius: 7.5 * scaleRoot, strength: 12 * scale });
    }
    return true;
  }

  addImpulse(position, direction, options = {}) {
    if (!this.enabled || this.impulses.length >= 24) return false;
    let impulse = this.impulsePool.pop();
    if (!impulse) {
      impulse = { position: new THREE.Vector3(), direction: new THREE.Vector3(), radius: 7, strength: 18, type: 'gust' };
      this.impulseAllocations += 1;
    }
    impulse.position.copy(position);
    impulse.direction.copy(direction);
    impulse.radius = options.radius ?? 7;
    impulse.strength = options.strength ?? 18;
    impulse.type = options.type ?? 'gust';
    this.impulses.push(impulse);
    return true;
  }

  injectQueuedFields(dt) {
    const cellX = this.size.x / (this.nx - 1);
    const cellY = this.size.y / (this.ny - 1);
    const cellZ = this.size.z / (this.nz - 1);

    for (const emitter of this.emitters) {
      const grid = this.worldToGrid(emitter.position);
      const resolvedRadius = Math.max(emitter.radius, Math.hypot(cellX, cellY, cellZ) * 0.55);
      const radiusX = Math.max(1, Math.ceil(resolvedRadius / cellX));
      const radiusY = Math.max(1, Math.ceil(resolvedRadius / cellY));
      const radiusZ = Math.max(1, Math.ceil(resolvedRadius / cellZ));
      for (let z = Math.max(0, Math.floor(grid.z - radiusZ)); z <= Math.min(this.nz - 1, Math.ceil(grid.z + radiusZ)); z += 1) {
        for (let y = Math.max(0, Math.floor(grid.y - radiusY)); y <= Math.min(this.ny - 1, Math.ceil(grid.y + radiusY)); y += 1) {
          for (let x = Math.max(0, Math.floor(grid.x - radiusX)); x <= Math.min(this.nx - 1, Math.ceil(grid.x + radiusX)); x += 1) {
            const dx = (x - grid.x) * cellX;
            const dy = (y - grid.y) * cellY;
            const dz = (z - grid.z) * cellZ;
            const distance = Math.hypot(dx, dy, dz);
            if (distance > resolvedRadius) continue;
            const weight = (1 - distance / resolvedRadius) ** 2;
            const index = this.index(x, y, z);
            this.density[index] = Math.min(2.5, this.density[index] + emitter.density * weight * dt * 2.4);
            this.temperature[index] = Math.min(1.5, this.temperature[index] + emitter.temperature * weight * dt * 1.8);
            this.velocityY[index] += emitter.temperature * weight * dt * 0.7;
          }
        }
      }
    }

    for (const impulse of this.impulses) {
      const grid = this.worldToGrid(impulse.position);
      const radiusCells = Math.ceil(impulse.radius / Math.min(cellX, cellY, cellZ));
      const normalizedDirection = this._normalizedDirection.copy(impulse.direction).normalize();
      for (let z = Math.max(0, Math.floor(grid.z - radiusCells)); z <= Math.min(this.nz - 1, Math.ceil(grid.z + radiusCells)); z += 1) {
        for (let y = Math.max(0, Math.floor(grid.y - radiusCells)); y <= Math.min(this.ny - 1, Math.ceil(grid.y + radiusCells)); y += 1) {
          for (let x = Math.max(0, Math.floor(grid.x - radiusCells)); x <= Math.min(this.nx - 1, Math.ceil(grid.x + radiusCells)); x += 1) {
            const worldX = (x - grid.x) * cellX;
            const worldY = (y - grid.y) * cellY;
            const worldZ = (z - grid.z) * cellZ;
            const distance = Math.hypot(worldX, worldY, worldZ);
            if (distance > impulse.radius || distance < 0.001) continue;
            const weight = (1 - distance / impulse.radius) ** 2 * impulse.strength;
            const index = this.index(x, y, z);
            if (impulse.type === 'vortex') {
              const inv = 1 / distance;
              this.velocityX[index] += -worldZ * inv * weight * 0.18;
              this.velocityZ[index] += worldX * inv * weight * 0.18;
              this.velocityY[index] += normalizedDirection.y * weight * 0.05;
            } else if (impulse.type === 'repel') {
              const inv = 1 / distance;
              this.velocityX[index] += worldX * inv * weight * 0.16;
              this.velocityY[index] += worldY * inv * weight * 0.16;
              this.velocityZ[index] += worldZ * inv * weight * 0.16;
            } else {
              this.velocityX[index] += normalizedDirection.x * weight * 0.14;
              this.velocityY[index] += normalizedDirection.y * weight * 0.14;
              this.velocityZ[index] += normalizedDirection.z * weight * 0.14;
            }
          }
        }
      }
    }

    while (this.emitters.length) this.emitterPool.push(this.emitters.pop());
    while (this.impulses.length) this.impulsePool.push(this.impulses.pop());
  }

  beginSimulation(dt) {
    if (this.simulationJob) return false;
    const safeDt = Math.max(0.0001, Number(dt) || 1 / this.updateRate);
    this.time += safeDt;
    this.injectQueuedFields(safeDt);
    const cellX = this.size.x / (this.nx - 1);
    const cellY = this.size.y / (this.ny - 1);
    const cellZ = this.size.z / (this.nz - 1);
    const physics = this.state.physics;
    const volume = this.state.volume;
    this.simulationJob = {
      dt: safeDt,
      cellX,
      cellY,
      cellZ,
      densityDecay: Math.exp(-safeDt * 0.24),
      temperatureDecay: Math.exp(-safeDt * 1.15),
      velocityDecay: Math.exp(-safeDt * 0.42),
      windX: physics.windX,
      windZ: physics.windZ,
      vortex: physics.vortex,
      buoyancy: volume.buoyancy,
    };
    this.simulationCursorZ = 0;
    return true;
  }

  processSimulationSlices(maxSlices = this.nz) {
    if (!this.simulationJob) return 0;
    const job = this.simulationJob;
    const startZ = this.simulationCursorZ;
    const sliceCount = clamp(Math.round(Number(maxSlices) || 1), 1, this.nz);
    const endZ = Math.min(this.nz, startZ + sliceCount);

    for (let z = startZ; z < endZ; z += 1) {
      for (let y = 0; y < this.ny; y += 1) {
        for (let x = 0; x < this.nx; x += 1) {
          const index = this.index(x, y, z);
          const vx = this.velocityX[index];
          const vy = this.velocityY[index];
          const vz = this.velocityZ[index];
          const backX = x - (vx * job.dt) / job.cellX;
          const backY = y - (vy * job.dt) / job.cellY;
          const backZ = z - (vz * job.dt) / job.cellZ;
          const density = this.sample(this.density, backX, backY, backZ) * job.densityDecay;
          const temperature = this.sample(this.temperature, backX, backY, backZ) * job.temperatureDecay;
          const advectedX = this.sample(this.velocityX, backX, backY, backZ) * job.velocityDecay;
          const advectedY = this.sample(this.velocityY, backX, backY, backZ) * job.velocityDecay;
          const advectedZ = this.sample(this.velocityZ, backX, backY, backZ) * job.velocityDecay;
          const px = x / this.nx;
          const py = y / this.ny;
          const pz = z / this.nz;
          const curlX = Math.sin(py * 13.1 + this.time * 0.71) * Math.cos(pz * 9.3 - this.time * 0.43);
          const curlZ = Math.cos(px * 11.7 - this.time * 0.62) * Math.sin(py * 8.9 + this.time * 0.37);
          const turbulence = job.vortex * (0.05 + density * 0.18);
          this.nextDensity[index] = density;
          this.nextTemperature[index] = temperature;
          this.nextVelocityX[index] = advectedX + (job.windX - advectedX) * job.dt * 0.14 + curlX * turbulence;
          this.nextVelocityY[index] = advectedY + (temperature * job.buoyancy - density * 0.08) * job.dt * 2.2;
          this.nextVelocityZ[index] = advectedZ + (job.windZ - advectedZ) * job.dt * 0.14 + curlZ * turbulence;

          if (x === 0 || x === this.nx - 1 || y === 0 || y === this.ny - 1 || z === 0 || z === this.nz - 1) {
            this.nextDensity[index] *= 0.72;
            this.nextTemperature[index] *= 0.7;
            this.nextVelocityX[index] *= 0.55;
            this.nextVelocityY[index] *= 0.55;
            this.nextVelocityZ[index] *= 0.55;
          }
        }
      }
    }

    this.simulationCursorZ = endZ;
    this.lastSimulationSlices = endZ - startZ;
    if (endZ >= this.nz) this.finishSimulation();
    return this.lastSimulationSlices;
  }

  finishSimulation() {
    [this.density, this.nextDensity] = [this.nextDensity, this.density];
    [this.temperature, this.nextTemperature] = [this.nextTemperature, this.temperature];
    [this.velocityX, this.nextVelocityX] = [this.nextVelocityX, this.velocityX];
    [this.velocityY, this.nextVelocityY] = [this.nextVelocityY, this.velocityY];
    [this.velocityZ, this.nextVelocityZ] = [this.nextVelocityZ, this.velocityZ];
    this.simulationJob = null;
    this.simulationCursorZ = 0;
    this.completedSteps += 1;
    this.uploadTexture();
  }

  simulate(dt) {
    if (this.simulationJob) this.processSimulationSlices(this.nz);
    this.beginSimulation(dt);
    this.processSimulationSlices(this.nz);
  }

  uploadTexture() {
    for (let index = 0; index < this.cellCount; index += 1) {
      const offset = index * 4;
      const density = clamp(this.density[index], 0, 1.5);
      const temperature = clamp(this.temperature[index], 0, 1);
      const speed = clamp(Math.hypot(this.velocityX[index], this.velocityY[index], this.velocityZ[index]) * 0.06, 0, 1);
      this.textureData[offset] = Math.round(clamp(density / 1.5, 0, 1) * 255);
      this.textureData[offset + 1] = Math.round(temperature * 255);
      this.textureData[offset + 2] = Math.round(speed * 255);
      this.textureData[offset + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }

  update(dt) {
    this.densityUniform.value = this.state.volume.smoke;
    this.scatteringUniform.value = this.state.volume.scattering;
    this.shadowUniform.value = this.state.volume.shadow;
    this.densityContrastUniform.value = this.state.volume.densityContrast ?? 1;
    this.edgeSoftnessUniform.value = this.state.volume.edgeSoftness ?? 0.055;
    this.fireIntensityUniform.value = this.state.volume.fireGlow ?? 1.2;
    if (!this.enabled) return;
    this.accumulator += Math.min(0.05, dt);
    const step = 1 / this.updateRate;
    this.accumulator = Math.min(this.accumulator, step * 2);
    if (!this.simulationJob && this.accumulator >= step) {
      this.beginSimulation(step);
      this.accumulator -= step;
    }
    if (this.simulationJob) this.processSimulationSlices(this.simulationSlicesPerFrame);
  }

  setQuality(quality) {
    const table = {
      high: { steps: 16, shadowSteps: 4, rate: 14 },
      medium: { steps: 14, shadowSteps: 4, rate: 12 },
      low: { steps: 10, shadowSteps: 3, rate: 8 },
    };
    const selected = table[quality] ?? table.medium;
    this.baseSteps = selected.steps;
    this.baseShadowSteps = selected.shadowSteps;
    this.baseUpdateRate = selected.rate;
    if (this.material.steps !== this.baseSteps) {
      this.material.steps = this.baseSteps;
      this.material.needsUpdate = true;
    }
    if (this.shadowMaterial.steps !== this.baseShadowSteps) {
      this.shadowMaterial.steps = this.baseShadowSteps;
      this.shadowMaterial.needsUpdate = true;
    }
    this.setPerformanceLevel(this.performanceLevel);
  }

  setPerformanceLevel(level = 0) {
    this.performanceLevel = clamp(Math.round(Number(level) || 0), 0, 3);
    const rateScale = [1, 0.84, 0.62, 0.42][this.performanceLevel];
    this.updateRate = Math.max(3, Math.round(this.baseUpdateRate * rateScale));
    const targetFrames = Math.max(2, Math.floor(60 / this.updateRate) - 1);
    this.simulationSlicesPerFrame = Math.max(1, Math.ceil(this.nz / targetFrames));
    this.syncVisibility();
  }

  syncVisibility() {
    this.mesh.visible = this.enabled;
    this.shadowMesh.visible = this.enabled && this.state.quality?.shadows !== false && this.performanceLevel === 0;
  }

  setShadows(enabled) {
    this.shadowMesh.visible = this.enabled && Boolean(enabled) && this.performanceLevel === 0;
  }

  setVisible(visible) {
    this.enabled = Boolean(visible);
    this.syncVisibility();
  }

  clear() {
    while (this.emitters.length) this.emitterPool.push(this.emitters.pop());
    while (this.impulses.length) this.impulsePool.push(this.impulses.pop());
    for (const field of [
      this.density, this.temperature, this.velocityX, this.velocityY, this.velocityZ,
      this.nextDensity, this.nextTemperature, this.nextVelocityX, this.nextVelocityY, this.nextVelocityZ,
    ]) field.fill(0);
    this.accumulator = 0;
    this.simulationJob = null;
    this.simulationCursorZ = 0;
    this.lastSimulationSlices = 0;
    this.launchSmokeEmissions = 0;
    this.burstSmokeEmissions = 0;
    this.uploadTexture();
  }

  get simulationProgress() {
    return this.simulationJob ? this.simulationCursorZ / this.nz : 1;
  }

  get performanceDiagnostics() {
    return {
      emitterAllocations: this.emitterAllocations,
      emitterPoolSize: this.emitterPool.length,
      queuedEmitters: this.emitters.length,
      impulseAllocations: this.impulseAllocations,
      impulsePoolSize: this.impulsePool.length,
      queuedImpulses: this.impulses.length,
      completedSteps: this.completedSteps,
      worldSize: this.size.toArray(),
      volumeExtentScale: SMOKE_VOLUME_EXTENT_SCALE,
      launchSmokeEmissions: this.launchSmokeEmissions,
      burstSmokeEmissions: this.burstSmokeEmissions,
    };
  }

  dispose() {
    this.scene.remove(this.mesh, this.shadowMesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.shadowMaterial.dispose();
    this.texture.dispose();
  }
}
