import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, mrt, output, positionPrevious, positionView, shapeCircle, subBuild, vec4 } from 'three/tsl';
import { PARTICLE_FOCUS_TARGET } from '../core/focus-depth.js';
import { particleLoadLevel, particleLoadProfile } from '../core/particle-load-guard.js';
import { clampRingParticleScale, resolveRingParticleProfile, resolveRingPistilCount } from '../core/ring-particles.js';
import { MAX_POST_BURST_LIFETIME, MIN_POST_BURST_LIFETIME } from '../core/state.js';
import { BURST_DIRECTION_STRIDE, createSplitDirections, hashString, mulberry32, writeBurstDirections } from './patterns.js';
import { FIREWORK_PRESETS, LAUNCH_LAYOUTS } from './presets.js';

const PARTICLE = Object.freeze({ SHELL: 1, STAR: 2, EMBER: 3, CRACKLE: 4 });
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();
const WHITE = new THREE.Color(0xffffff);
const PALETTE_CACHE = new WeakMap();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getPalette(colors) {
  let palette = PALETTE_CACHE.get(colors);
  if (!palette) {
    palette = colors.length ? colors.map((value) => new THREE.Color(value)) : [WHITE];
    PALETTE_CACHE.set(colors, palette);
  }
  return palette;
}

function writePaletteColor(target, colors, t, hueShift = 0) {
  const palette = getPalette(colors);
  const scaled = clamp(t, 0, 0.9999) * (palette.length - 1);
  const index = Math.floor(scaled);
  target.copy(palette[index]).lerp(palette[Math.min(index + 1, palette.length - 1)], scaled - index);
  if (Math.abs(hueShift) > 0.0001) target.offsetHSL(hueShift, 0, 0);
  return target;
}

function createParticle() {
  return {
    type: PARTICLE.STAR,
    position: new THREE.Vector3(),
    previousX: 0,
    previousY: 0,
    previousZ: 0,
    velocity: new THREE.Vector3(),
    color: new THREE.Color(),
    colorNext: new THREE.Color(),
    age: 0,
    life: 1,
    size: 0.1,
    drag: 0.08,
    gravityScale: 1,
    alpha: 1,
    brightness: 1,
    trail: 0,
    trailRate: 0,
    trailClock: 0,
    smoke: 0,
    strobe: 0,
    crackle: 0,
    split: 0,
    splitAt: Infinity,
    splitDone: false,
    phase: 0,
    seed: 0,
    colorShift: false,
    preset: null,
    fuse: Infinity,
    burstScale: 1,
    yaw: 0,
    colorHue: 0,
    colorVariation: 0,
    goGetter: 0,
    bounced: false,
  };
}

class MotionSpriteNodeMaterial extends THREE.SpriteNodeMaterial {
  constructor(previousPositionNode) {
    super();
    this.previousPositionNode = previousPositionNode;
  }

  setupPosition(builder) {
    const currentPosition = super.setupPosition(builder);
    if (builder.needsPreviousData() && this.previousPositionNode) {
      positionPrevious.assign(subBuild(this.previousPositionNode, 'POSITION_PREVIOUS', 'vec3'));
    }
    return currentPosition;
  }
}

export class FireworkEngine extends EventTarget {
  constructor(scene, state, options = {}) {
    super();
    this.scene = scene;
    this.state = state;
    this._appliedPostBurstLifetimeScale = clamp(finite(state.physics?.particleLifetime, 1), MIN_POST_BURST_LIFETIME, MAX_POST_BURST_LIFETIME);
    this.maxParticles = options.maxParticles ?? 18000;
    this.particles = [];
    this.pool = [];
    this.scheduled = [];
    this.interactions = [];
    this.colliders = [];
    this.fluid = null;
    this.time = 0;
    this.random = mulberry32(0x51c0ffee);
    this._temp = new THREE.Vector3();
    this._temp2 = new THREE.Vector3();
    this._spawnPosition = new THREE.Vector3();
    this._inheritedVelocity = new THREE.Vector3();
    this._eventColor = new THREE.Color();
    this._frame = 0;
    this._frameSpawnCount = 0;
    this._frameTrailSpawnCount = 0;
    this._renderedCount = 0;
    this._effectiveRenderLimit = this.maxParticles;
    this._renderScale = 1;
    this._warmupActive = false;
    this.directionBuffer = new Float64Array(this.maxParticles * BURST_DIRECTION_STRIDE);
    this.pistilPresetCache = new WeakMap();
    this.particleAllocations = 0;
    this.poolHits = 0;
    this.poolMisses = 0;
    this.peakActiveCount = 0;
    this.peakTrailSpawnsPerFrame = 0;
    this.globalBrightness = clamp(finite(state.quality?.fireworkBrightness, 1), 0.1, 3);
    this.loadBudget = {
      level: 0,
      name: 'normal',
      softLimit: this.maxParticles,
      maxSpawnPerFrame: this.maxParticles,
      burstScale: 1,
      trailScale: 1,
      smokeStride: 1,
      cullPerFrame: 0,
      renderLimit: this.maxParticles,
      particleScale: 1,
      particleOptimization: true,
      particleSafetyOverride: false,
    };

    this.positionArray = new Float32Array(this.maxParticles * 3);
    this.previousPositionArray = new Float32Array(this.maxParticles * 3);
    this.colorArray = new Float32Array(this.maxParticles * 3);
    this.scaleArray = new Float32Array(this.maxParticles);
    this.alphaArray = new Float32Array(this.maxParticles);

    this.positionAttribute = new THREE.InstancedBufferAttribute(this.positionArray, 3).setUsage(THREE.DynamicDrawUsage);
    this.previousPositionAttribute = new THREE.InstancedBufferAttribute(this.previousPositionArray, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.InstancedBufferAttribute(this.colorArray, 3).setUsage(THREE.DynamicDrawUsage);
    this.scaleAttribute = new THREE.InstancedBufferAttribute(this.scaleArray, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttribute = new THREE.InstancedBufferAttribute(this.alphaArray, 1).setUsage(THREE.DynamicDrawUsage);
    this.dynamicAttributes = [this.positionAttribute, this.previousPositionAttribute, this.colorAttribute, this.scaleAttribute, this.alphaAttribute];

    this.particlePreviousPositionNode = instancedBufferAttribute(this.previousPositionAttribute);
    const material = new MotionSpriteNodeMaterial(this.particlePreviousPositionNode);
    this.particleColorNode = instancedBufferAttribute(this.colorAttribute);
    this.particleOpacityNode = instancedBufferAttribute(this.alphaAttribute).mul(shapeCircle());
    material.positionNode = instancedBufferAttribute(this.positionAttribute);
    material.colorNode = this.particleColorNode;
    material.scaleNode = instancedBufferAttribute(this.scaleAttribute);
    material.opacityNode = this.particleOpacityNode;
    const particleFocusMRT = mrt({
      '': output,
      [PARTICLE_FOCUS_TARGET]: vec4(positionView.z.negate(), 0, 0, this.particleOpacityNode),
    });
    const particleFocusBlend = new THREE.BlendMode(THREE.CustomBlending);
    particleFocusBlend.blendSrc = THREE.SrcAlphaFactor;
    particleFocusBlend.blendDst = THREE.OneMinusSrcAlphaFactor;
    particleFocusBlend.blendEquation = THREE.AddEquation;
    particleFocusBlend.blendSrcAlpha = THREE.OneFactor;
    particleFocusBlend.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    particleFocusBlend.blendEquationAlpha = THREE.AddEquation;
    particleFocusMRT.setBlendMode(PARTICLE_FOCUS_TARGET, particleFocusBlend);
    material.mrtNode = particleFocusMRT;
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    material.alphaToCoverage = true;
    material.toneMapped = false;
    this.material = material;
    this.setBlendingMode(state.quality.particleBlend);

    this.sprite = new THREE.Sprite(material);
    this.sprite.name = 'Firework particle field';
    this.sprite.count = 0;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = 8;
    scene.add(this.sprite);

    for (const preset of FIREWORK_PRESETS) getPalette(preset.colors);
    this.prewarmPool(options.prewarmParticles ?? this.maxParticles);
  }

  allocateParticle() {
    this.particleAllocations += 1;
    return createParticle();
  }

  prewarmPool(target = this.maxParticles) {
    const desired = clamp(Math.round(Number(target) || 0), 0, this.maxParticles);
    while (this.pool.length + this.particles.length < desired) this.pool.push(this.allocateParticle());
    return this.pool.length;
  }

  connectFluid(fluid) {
    this.fluid = fluid;
  }

  setBlendingMode(mode) {
    const next = ['additive', 'screen', 'alpha'].includes(mode) ? mode : 'additive';
    this.blendingMode = next;
    this.material.colorNode = next === 'screen' ? this.particleColorNode.mul(this.particleOpacityNode) : this.particleColorNode;
    this.material.premultipliedAlpha = next === 'screen';

    if (next === 'screen') {
      this.material.blending = THREE.CustomBlending;
      this.material.blendEquation = THREE.AddEquation;
      this.material.blendSrc = THREE.OneMinusDstColorFactor;
      this.material.blendDst = THREE.OneFactor;
      this.material.blendSrcAlpha = THREE.OneFactor;
      this.material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    } else {
      this.material.blending = next === 'alpha' ? THREE.NormalBlending : THREE.AdditiveBlending;
    }
    this.material.needsUpdate = true;
    return next;
  }

  setGlobalBrightness(value) {
    this.globalBrightness = clamp(finite(value, 1), 0.1, 3);
    return this.globalBrightness;
  }

  setColliders(colliders) {
    this.colliders = colliders;
  }

  setLoadBudget(budget = {}) {
    this.loadBudget = {
      level: clamp(Math.round(Number(budget.level) || 0), 0, 3),
      name: budget.name ?? 'normal',
      softLimit: clamp(Math.round(Number(budget.softLimit) || this.maxParticles), 1, this.maxParticles),
      maxSpawnPerFrame: clamp(Math.round(Number(budget.maxSpawnPerFrame) || this.maxParticles), 1, this.maxParticles),
      burstScale: clamp(finite(budget.burstScale, 1), 0, 1),
      trailScale: clamp(finite(budget.trailScale, 1), 0, 1),
      smokeStride: clamp(Math.round(Number(budget.smokeStride) || 1), 1, 12),
      cullPerFrame: clamp(Math.round(Number(budget.cullPerFrame) || 0), 0, this.maxParticles),
      renderLimit: clamp(Math.round(Number(budget.renderLimit) || this.maxParticles), 1, this.maxParticles),
      particleScale: clamp(finite(budget.particleScale, 1), 0.5, 1),
      particleOptimization: budget.particleOptimization !== false,
      particleSafetyOverride: budget.particleSafetyOverride === true,
    };
  }

  acquire({ essential = false } = {}) {
    const activeLimit = essential ? this.maxParticles : this.loadBudget.softLimit;
    if (this.particles.length >= activeLimit) return null;
    if (!essential && this._frameSpawnCount >= this.loadBudget.maxSpawnPerFrame) return null;
    let particle = this.pool.pop();
    if (particle) this.poolHits += 1;
    else {
      this.poolMisses += 1;
      particle = this.allocateParticle();
    }
    particle.age = 0;
    particle.trailClock = 0;
    particle.splitDone = false;
    particle.bounced = false;
    particle.alpha = 1;
    particle.brightness = 1;
    particle.previousX = Number.NaN;
    particle.previousY = Number.NaN;
    particle.previousZ = Number.NaN;
    this.particles.push(particle);
    this.peakActiveCount = Math.max(this.peakActiveCount, this.particles.length);
    if (!essential) this._frameSpawnCount += 1;
    return particle;
  }

  releaseAt(index) {
    const particle = this.particles[index];
    const last = this.particles.pop();
    if (index < this.particles.length) this.particles[index] = last;
    particle.preset = null;
    this.pool.push(particle);
  }

  schedule(preset, options = {}) {
    this.scheduled.push({
      at: this.time + Math.max(0, options.delay ?? 0),
      preset,
      x: options.x ?? 0,
      z: options.z ?? 0,
      y: options.y ?? 0.25,
      yaw: options.yaw ?? 0,
      scale: options.scale ?? 1,
      launchPower: options.launchPower ?? 1,
      explosionPower: options.explosionPower ?? 1,
      colorHue: options.colorHue ?? 0,
      colorVariation: options.colorVariation ?? 0,
    });
    if (!options.deferSort) this.scheduled.sort((a, b) => a.at - b.at);
  }

  launchLayout(preset, layoutName = 'single', options = {}) {
    const layout = LAUNCH_LAYOUTS[layoutName] ?? LAUNCH_LAYOUTS.single;
    const baseDelay = Math.max(0, finite(options.delay, 0));
    const sequenceDelay = clamp(finite(options.sequenceDelay, 0), 0, 0.22);
    const spread = clamp(finite(options.spread, 1), 0, 2.5);
    const baseX = finite(options.x, 0);
    const baseZ = finite(options.z, 0);
    const baseYaw = finite(options.yaw, 0);
    const passOffset = Math.max(0.04, sequenceDelay * layout.length + 0.04);
    const schedulePass = (mirrored = false) => {
      for (let index = 0; index < layout.length; index += 1) {
        const item = layout[index];
        const itemX = baseX + item.x * spread;
        const itemYaw = baseYaw + item.yaw;
        this.schedule(preset, {
          y: options.y,
          delay: baseDelay + item.delay + index * sequenceDelay + (mirrored ? passOffset : 0),
          x: mirrored ? -itemX : itemX,
          z: baseZ + item.z * spread,
          yaw: mirrored ? -itemYaw : itemYaw,
          scale: (options.scale ?? 1) * (0.91 + this.random() * 0.18),
          launchPower: options.launchPower,
          explosionPower: options.explosionPower,
          colorHue: mirrored ? -(options.colorHue ?? 0) : options.colorHue,
          colorVariation: options.colorVariation,
          deferSort: true,
        });
      }
    };
    schedulePass(false);
    if (options.crossLaunch) schedulePass(true);
    this.scheduled.sort((a, b) => a.at - b.at);
    return layout.length * (options.crossLaunch ? 2 : 1);
  }

  launchNow(preset, options = {}) {
    const x = options.x ?? 0;
    const z = options.z ?? 0;
    const y = options.y ?? 0.25;
    const scale = options.scale ?? 1;
    const yaw = options.yaw ?? 0;
    const launchPower = clamp(finite(options.launchPower, 1), 0.25, 2.4);
    const explosionPower = clamp(finite(options.explosionPower, 1), 0.5, 1.8);
    const burstScale = clamp(scale * explosionPower, 0.35, 2.2);
    const colorEffects = {
      colorHue: clamp(finite(options.colorHue, 0), -0.5, 0.5),
      colorVariation: clamp(finite(options.colorVariation, 0), 0, 1),
    };

    if (['mine', 'cometFan', 'romanCandle'].includes(preset.pattern)) {
      if (preset.pattern === 'romanCandle') {
        const repeat = preset.repeat ?? 7;
        for (let index = 0; index < repeat; index += 1) {
          this.scheduled.push({
            at: this.time + index * 0.34,
            preset: { ...preset, pattern: 'cometFan', count: 1 },
            x,
            y,
            z,
            yaw,
            scale,
            launchPower,
            explosionPower,
            ...colorEffects,
          });
        }
        this.scheduled.sort((a, b) => a.at - b.at);
        return;
      }
      this.burst(preset, this._spawnPosition.set(x, y, z), ZERO, burstScale, yaw, colorEffects);
      return;
    }

    if (preset.pattern === 'waterfall') {
      this.burst(preset, this._spawnPosition.set(x, y + 30 * scale * launchPower, z), ZERO, burstScale, yaw, colorEffects);
      return;
    }

    const shell = this.acquire({ essential: true });
    if (!shell) return;
    shell.type = PARTICLE.SHELL;
    shell.position.set(x, y, z);
    shell.velocity.set(
      Math.sin(yaw) * 4.2 * launchPower,
      preset.launchVelocity * (0.92 + this.random() * 0.1) * Math.sqrt(scale) * launchPower,
      Math.cos(yaw) * 1.1 * launchPower,
    );
    writePaletteColor(shell.color, preset.colors, 0.05, colorEffects.colorHue);
    shell.colorNext.copy(WHITE);
    shell.age = 0;
    shell.fuse = preset.fuse * (0.94 + this.random() * 0.08) * Math.sqrt(scale);
    shell.life = shell.fuse + 0.35;
    shell.size = 0.16 * scale;
    shell.drag = 0.015;
    shell.gravityScale = 1;
    shell.trail = 0.82;
    shell.trailRate = 28;
    shell.smoke = preset.smoke * 0.75;
    shell.preset = preset;
    shell.burstScale = burstScale;
    shell.yaw = yaw;
    shell.colorHue = colorEffects.colorHue;
    shell.colorVariation = colorEffects.colorVariation;
    shell.phase = this.random() * Math.PI * 2;
    this.dispatchEvent(new CustomEvent('launch', { detail: { preset, position: shell.position, launchPower, explosionPower, yaw } }));
  }

  burst(preset, position, inheritedVelocity = ZERO, scale = 1, yaw = 0, effects = {}) {
    const colorHue = clamp(finite(effects.colorHue, 0), -0.5, 0.5);
    const colorVariation = clamp(finite(effects.colorVariation, 0), 0, 1);
    const lifetimeScale = this.postBurstLifetimeScale;
    const countScale = clamp(scale ** 0.55, 0.65, 1.35);
    const baseRequestedCount = Math.max(1, Math.round(preset.count * countScale));
    const ringProfile = resolveRingParticleProfile(preset, baseRequestedCount, this.ringParticleScale);
    const requestedCount = ringProfile.totalCount;
    const desiredCount = Math.max(1, Math.round(requestedCount * this.loadBudget.burstScale));
    const activeRoom = Math.max(0, this.loadBudget.softLimit - this.particles.length - 48);
    const frameRoom = Math.max(0, this.loadBudget.maxSpawnPerFrame - this._frameSpawnCount);
    const count = Math.min(desiredCount, activeRoom, frameRoom);
    const seed = hashString(`${preset.id}:${this.time.toFixed(3)}:${position.x.toFixed(2)}`);
    const palette = preset.colors;
    if (count > 0) writeBurstDirections(preset, count, seed, this.directionBuffer, { ringFraction: ringProfile.ringFraction });
    const yawSin = Math.sin(yaw);
    const yawCos = Math.cos(yaw);

    for (let index = 0; index < count; index += 1) {
      const offset = index * BURST_DIRECTION_STRIDE;
      const particle = this.acquire();
      if (!particle) break;
      const directionX = this.directionBuffer[offset];
      const directionY = this.directionBuffer[offset + 1];
      const directionZ = this.directionBuffer[offset + 2];
      this._temp.set(
        directionX * yawCos + directionZ * yawSin,
        directionY,
        -directionX * yawSin + directionZ * yawCos,
      );
      const speed = preset.burstSpeed * this.directionBuffer[offset + 3] * scale;
      const colorT = this.directionBuffer[offset + 4];
      const descriptorSeed = this.directionBuffer[offset + 7];
      const particleHue = colorHue + (descriptorSeed - 0.5) * colorVariation * 0.28;
      particle.type = PARTICLE.STAR;
      particle.position.copy(position);
      particle.velocity.copy(this._temp).multiplyScalar(speed).addScaledVector(inheritedVelocity, 0.14);
      writePaletteColor(particle.color, palette, colorT, particleHue);
      writePaletteColor(particle.colorNext, palette, (colorT + 0.42) % 1, particleHue + colorVariation * 0.08);
      particle.age = -this.directionBuffer[offset + 5];
      particle.life = preset.life * (0.9 + descriptorSeed * 0.18) * Math.sqrt(scale) * lifetimeScale;
      particle.size = preset.size * scale * (0.78 + descriptorSeed * 0.48);
      particle.drag = preset.drag;
      particle.gravityScale = preset.gravityScale;
      particle.trail = preset.trail;
      particle.trailRate = preset.trailRate;
      particle.smoke = preset.smoke;
      particle.strobe = preset.strobe;
      particle.crackle = preset.crackle;
      particle.split = preset.split;
      particle.splitAt = particle.life * preset.splitDelay;
      particle.phase = this.directionBuffer[offset + 6];
      particle.seed = Math.floor(descriptorSeed * 1e9);
      particle.colorShift = preset.colorShift || colorVariation > 0.02;
      particle.goGetter = preset.vortexSeek ?? 0;
      particle.preset = preset;
      particle.fuse = Infinity;
      particle.burstScale = scale;
    }

    this.spawnPistil(preset, position, scale, seed + 91, { colorHue, colorVariation }, lifetimeScale);
    if (preset.multiBreak > 1) {
      for (let index = 1; index < preset.multiBreak; index += 1) {
        const angle = (index / preset.multiBreak) * Math.PI * 2 + this.random() * 0.4;
        this.scheduled.push({
          at: this.time + index * 0.32,
          preset: { ...preset, multiBreak: 1, count: Math.round(preset.count * 0.72) },
          x: position.x + Math.cos(angle) * index * 2.3,
          y: position.y + index * 1.2,
          z: position.z + Math.sin(angle) * index * 2.3,
          yaw: yaw + angle * 0.2,
          scale: scale * 0.8,
          launchPower: 1,
          explosionPower: 1,
          colorHue,
          colorVariation,
        });
      }
      this.scheduled.sort((a, b) => a.at - b.at);
    }

    const lightColor = writePaletteColor(this._eventColor, palette, 0.25, colorHue);
    this.dispatchEvent(new CustomEvent('burst', { detail: { preset, position, color: lightColor, scale, count, requestedCount, ringRequestedCount: ringProfile.ringCount, ringParticleScale: this.ringParticleScale, brightness: this.globalBrightness, colorHue, colorVariation, lifetimeScale } }));
    this.fluid?.addEmitter(position, (2.2 * preset.smoke * scale) / this.loadBudget.smokeStride, 1.9 * scale * this.globalBrightness, lightColor, 2.2);
    return count;
  }

  getPistilPresets(preset) {
    let cached = this.pistilPresetCache.get(preset);
    if (cached) return cached;
    const passes = preset.pistil === 'double' ? 2 : 1;
    const baseCount = preset.pistil === 'ring' ? 55 : 68;
    cached = Array.from({ length: passes }, (_, pass) => ({
      ...preset,
      id: `${preset.id}-pistil-${pass}`,
      pattern: preset.pistil === 'ring' ? 'ring' : 'peony',
      count: baseCount,
      burstSpeed: preset.burstSpeed * (0.32 + pass * 0.18),
      life: preset.life * (0.58 + pass * 0.08),
      trail: preset.pistil === 'crackle' ? 0.45 : 0.08,
      crackle: preset.pistil === 'crackle' ? 0.8 : 0,
      split: 0,
      pistil: 'none',
      colors: pass ? [preset.colors.at(-1)] : ['#ffffff', preset.colors[0]],
    }));
    for (const corePreset of cached) getPalette(corePreset.colors);
    this.pistilPresetCache.set(preset, cached);
    return cached;
  }

  spawnPistil(preset, position, scale, seed, effects = {}, lifetimeScale = this.postBurstLifetimeScale) {
    if (!preset.pistil || preset.pistil === 'none') return;
    const colorHue = clamp(finite(effects.colorHue, 0), -0.5, 0.5);
    const colorVariation = clamp(finite(effects.colorVariation, 0), 0, 1);
    const corePresets = this.getPistilPresets(preset);
    for (let pass = 0; pass < corePresets.length; pass += 1) {
      const corePreset = corePresets[pass];
      const scaledCoreCount = corePreset.pattern === 'ring' ? resolveRingPistilCount(corePreset.count, this.ringParticleScale) : corePreset.count;
      const desiredCount = Math.max(1, Math.round(scaledCoreCount * this.loadBudget.burstScale));
      const activeRoom = Math.max(0, this.loadBudget.softLimit - this.particles.length);
      const frameRoom = Math.max(0, this.loadBudget.maxSpawnPerFrame - this._frameSpawnCount);
      const count = Math.min(desiredCount, activeRoom, frameRoom);
      if (count <= 0) return;
      writeBurstDirections(corePreset, count, seed + pass * 17, this.directionBuffer);
      for (let index = 0; index < count; index += 1) {
        const offset = index * BURST_DIRECTION_STRIDE;
        const particle = this.acquire();
        if (!particle) return;
        particle.type = PARTICLE.STAR;
        particle.position.copy(position);
        particle.velocity.set(
          this.directionBuffer[offset],
          this.directionBuffer[offset + 1],
          this.directionBuffer[offset + 2],
        ).multiplyScalar(corePreset.burstSpeed * this.directionBuffer[offset + 3] * scale);
        const descriptorSeed = this.directionBuffer[offset + 7];
        const particleHue = colorHue + (descriptorSeed - 0.5) * colorVariation * 0.2;
        writePaletteColor(particle.color, corePreset.colors, this.directionBuffer[offset + 4], particleHue);
        writePaletteColor(particle.colorNext, corePreset.colors, (this.directionBuffer[offset + 4] + 0.3) % 1, particleHue + colorVariation * 0.06);
        particle.life = corePreset.life * (0.9 + this.directionBuffer[offset + 7] * 0.18) * lifetimeScale;
        particle.size = preset.size * 0.7 * scale;
        particle.drag = preset.drag * 1.2;
        particle.gravityScale = preset.gravityScale;
        particle.trail = corePreset.trail;
        particle.trailRate = 18;
        particle.smoke = preset.smoke * 0.35;
        particle.strobe = 0;
        particle.crackle = corePreset.crackle;
        particle.split = 0;
        particle.splitAt = Infinity;
        particle.phase = this.directionBuffer[offset + 6];
        particle.seed = Math.floor(descriptorSeed * 1e9);
        particle.colorShift = colorVariation > 0.02;
        particle.goGetter = 0;
        particle.preset = corePreset;
      }
    }
  }

  spawnEmber(source, strength = 1) {
    if (this.loadBudget.trailScale <= 0 || this.random() > this.loadBudget.trailScale) return false;
    const ember = this.acquire();
    if (!ember) return false;
    ember.type = PARTICLE.EMBER;
    ember.position.copy(source.position).addScaledVector(source.velocity, -0.008);
    ember.velocity.copy(source.velocity).multiplyScalar(0.05).add(this._temp.set(this.random() - 0.5, this.random() - 0.5, this.random() - 0.5).multiplyScalar(0.7));
    ember.color.copy(source.color);
    ember.colorNext.copy(source.colorNext);
    const lifetimeScale = source.type === PARTICLE.SHELL ? 1 : this.postBurstLifetimeScale;
    ember.life = (0.22 + this.random() * 0.45) * (0.55 + source.trail * 0.8) * lifetimeScale;
    ember.size = source.size * (0.35 + this.random() * 0.42) * strength;
    ember.drag = 0.22;
    ember.gravityScale = source.gravityScale * 0.5;
    ember.trail = 0;
    ember.trailRate = 0;
    ember.smoke = source.smoke * 0.18;
    ember.strobe = source.strobe * 0.3;
    ember.crackle = 0;
    ember.split = 0;
    ember.splitAt = Infinity;
    ember.phase = source.phase + this.random();
    ember.seed = source.seed;
    ember.colorShift = source.colorShift;
    ember.goGetter = 0;
    ember.preset = source.preset;
    this._frameTrailSpawnCount += 1;
    return true;
  }

  splitParticle(source) {
    const lifetimeScale = this.postBurstLifetimeScale;
    const directions = createSplitDirections(source.velocity, source.split, source.seed);
    const count = Math.max(2, Math.round(directions.length * this.loadBudget.burstScale));
    for (const velocity of directions.slice(0, count)) {
      const child = this.acquire();
      if (!child) return;
      child.type = PARTICLE.STAR;
      child.position.copy(source.position);
      child.velocity.set(velocity.x, velocity.y, velocity.z);
      child.color.copy(source.colorNext);
      child.colorNext.copy(source.color);
      child.life = Math.max(0.55 * lifetimeScale, source.life - source.age + 0.7 * lifetimeScale);
      child.size = source.size * 0.72;
      child.drag = source.drag * 1.2;
      child.gravityScale = source.gravityScale;
      child.trail = Math.min(0.8, source.trail + 0.15);
      child.trailRate = source.trailRate;
      child.smoke = source.smoke * 0.6;
      child.strobe = source.strobe;
      child.crackle = source.crackle * 0.3;
      child.split = 0;
      child.splitAt = Infinity;
      child.phase = source.phase + this.random() * 4;
      child.seed = Math.floor(this.random() * 1e9);
      child.colorShift = true;
      child.goGetter = source.goGetter;
      child.preset = source.preset;
    }
  }

  spawnCrackle(source) {
    const lifetimeScale = this.postBurstLifetimeScale;
    const count = Math.max(1, Math.round((3 + Math.floor(this.random() * 4)) * this.loadBudget.burstScale));
    for (let index = 0; index < count; index += 1) {
      const crackle = this.acquire();
      if (!crackle) return;
      crackle.type = PARTICLE.CRACKLE;
      crackle.position.copy(source.position);
      crackle.velocity.set(this.random() - 0.5, this.random() - 0.4, this.random() - 0.5).normalize().multiplyScalar(3 + this.random() * 4).addScaledVector(source.velocity, 0.15);
      crackle.color.set(this.random() > 0.3 ? 0xffe4a1 : 0xffffff);
      crackle.colorNext.copy(crackle.color);
      crackle.life = (0.2 + this.random() * 0.36) * lifetimeScale;
      crackle.size = source.size * (0.7 + this.random() * 0.6);
      crackle.drag = 0.18;
      crackle.gravityScale = 0.5;
      crackle.trail = 0;
      crackle.trailRate = 0;
      crackle.smoke = source.smoke * 0.24;
      crackle.strobe = 0.9;
      crackle.crackle = 0;
      crackle.split = 0;
      crackle.splitAt = Infinity;
      crackle.phase = this.random() * 10;
      crackle.seed = Math.floor(this.random() * 1e9);
      crackle.colorShift = false;
      crackle.goGetter = 0;
      crackle.preset = source.preset;
    }
  }

  addInteraction(position, direction, options = {}) {
    this.interactions.push({
      position: position.clone(),
      direction: direction.clone(),
      radius: options.radius ?? 7,
      strength: options.strength ?? 18,
      type: options.type ?? 'gust',
      age: 0,
      life: options.life ?? 0.32,
    });
    this.fluid?.addImpulse(position, direction, options);
  }

  applyInteractions(particle, dt) {
    for (const interaction of this.interactions) {
      this._temp.subVectors(particle.position, interaction.position);
      const distance = this._temp.length();
      if (distance >= interaction.radius || distance < 0.001) continue;
      const falloff = (1 - distance / interaction.radius) ** 2;
      if (interaction.type === 'vortex') {
        this._temp2.crossVectors(UP, this._temp).normalize();
        particle.velocity.addScaledVector(this._temp2, interaction.strength * falloff * dt);
        particle.velocity.addScaledVector(this._temp.normalize(), -interaction.strength * 0.16 * falloff * dt);
      } else if (interaction.type === 'repel') {
        particle.velocity.addScaledVector(this._temp.normalize(), interaction.strength * falloff * dt);
      } else {
        particle.velocity.addScaledVector(interaction.direction, interaction.strength * falloff * dt);
      }
    }
  }

  applyCollisions(particle) {
    for (const collider of this.colliders) {
      if (collider.type !== 'sphere') continue;
      this._temp.subVectors(particle.position, collider.position);
      const distance = this._temp.length();
      const radius = collider.radius + particle.size * 0.25;
      if (distance >= radius || distance < 0.0001) continue;
      const normal = this._temp.multiplyScalar(1 / distance);
      particle.position.copy(collider.position).addScaledVector(normal, radius);
      const inward = particle.velocity.dot(normal);
      if (inward < 0) particle.velocity.addScaledVector(normal, -inward * 1.45).multiplyScalar(0.72);
    }
  }

  shedTransientLoad() {
    const overBudget = this.particles.length - this.loadBudget.softLimit;
    const removalTarget = Math.min(Math.max(0, overBudget), this.loadBudget.cullPerFrame);
    if (removalTarget <= 0) return 0;
    let removed = 0;
    for (let index = this.particles.length - 1; index >= 0 && removed < removalTarget; index -= 1) {
      const type = this.particles[index].type;
      if (type !== PARTICLE.EMBER && type !== PARTICLE.CRACKLE) continue;
      this.releaseAt(index);
      removed += 1;
    }
    if (this.loadBudget.level >= 3 && removed < removalTarget) {
      for (let index = this.particles.length - 1; index >= 0 && removed < removalTarget; index -= 1) {
        const particle = this.particles[index];
        if (particle.type !== PARTICLE.STAR || particle.age < Math.min(0.15, particle.life * 0.1)) continue;
        this.releaseAt(index);
        removed += 1;
      }
    }
    return removed;
  }

  update(dt) {
    const delta = Math.min(0.034, Math.max(0, dt));
    this.time += delta;
    this._frame += 1;
    this._frameSpawnCount = 0;
    this._frameTrailSpawnCount = 0;
    this.shedTransientLoad();

    while (this.scheduled.length && this.scheduled[0].at <= this.time) {
      const item = this.scheduled.shift();
      if (['cometFan'].includes(item.preset.pattern) && item.preset.fuse === 0) {
        this.burst(item.preset, this._spawnPosition.set(item.x, item.y, item.z), ZERO, item.scale * item.explosionPower, item.yaw, item);
      } else {
        this.launchNow(item.preset, item);
      }
    }

    for (let index = this.interactions.length - 1; index >= 0; index -= 1) {
      const interaction = this.interactions[index];
      interaction.age += delta;
      if (interaction.age >= interaction.life) this.interactions.splice(index, 1);
    }

    const globalPhysics = this.state.physics;
    let particleIndex = this.particles.length - 1;
    while (particleIndex >= 0) {
      const particle = this.particles[particleIndex];
      particle.previousX = particle.position.x;
      particle.previousY = particle.position.y;
      particle.previousZ = particle.position.z;
      particle.age += delta;
      if (particle.age < 0) {
        particleIndex -= 1;
        continue;
      }

      if (particle.type === PARTICLE.SHELL && particle.age >= particle.fuse) {
        this._inheritedVelocity.copy(particle.velocity);
        this.burst(particle.preset, particle.position, this._inheritedVelocity, particle.burstScale, particle.yaw, particle);
        this.releaseAt(particleIndex);
        particleIndex -= 1;
        continue;
      }

      if (particle.age >= particle.life) {
        if (particle.crackle > 0 && this.random() < particle.crackle) this.spawnCrackle(particle);
        this.releaseAt(particleIndex);
        particleIndex -= 1;
        continue;
      }

      if (particle.split > 1 && !particle.splitDone && particle.age >= particle.splitAt) {
        particle.splitDone = true;
        this.splitParticle(particle);
        this.spawnCrackle(particle);
        this.releaseAt(particleIndex);
        particleIndex -= 1;
        continue;
      }

      const speed = particle.velocity.length();
      const drag = Math.max(0, globalPhysics.drag + particle.drag * 0.35);
      const dragFactor = Math.exp(-drag * delta * (0.7 + speed * 0.035));
      particle.velocity.multiplyScalar(dragFactor);
      particle.velocity.y -= 9.81 * globalPhysics.gravity * particle.gravityScale * delta;
      particle.velocity.x += (globalPhysics.windX - particle.velocity.x * 0.035) * drag * delta * 0.72;
      particle.velocity.z += (globalPhysics.windZ - particle.velocity.z * 0.035) * drag * delta * 0.72;

      const radial = Math.hypot(particle.position.x, particle.position.z) + 4;
      const vortexStrength = globalPhysics.vortex * delta * (0.8 + particle.goGetter);
      particle.velocity.x += (-particle.position.z / radial) * vortexStrength * 2.4;
      particle.velocity.z += (particle.position.x / radial) * vortexStrength * 2.4;
      const turbulence = Math.sin(particle.position.y * 0.37 + this.time * 1.7 + particle.phase) * 0.36;
      particle.velocity.x += turbulence * delta * (0.6 + globalPhysics.vortex);
      particle.velocity.z += Math.cos(particle.position.x * 0.24 - this.time * 1.3 + particle.phase) * delta * 0.28;

      if (particle.goGetter > 0) {
        particle.velocity.x += Math.sin(this.time * 4 + particle.phase) * particle.goGetter * delta;
        particle.velocity.z += Math.cos(this.time * 3.2 + particle.phase) * particle.goGetter * delta;
      }

      this.applyInteractions(particle, delta);
      particle.position.addScaledVector(particle.velocity, delta);
      this.applyCollisions(particle);

      if (particle.position.y < 0.08) {
        if (!particle.bounced && particle.type === PARTICLE.STAR && particle.velocity.y < -2) {
          particle.position.y = 0.08;
          particle.velocity.y *= -0.22;
          particle.velocity.x *= 0.58;
          particle.velocity.z *= 0.58;
          particle.bounced = true;
          this.dispatchEvent(new CustomEvent('ripple', { detail: { position: particle.position.clone(), strength: speed } }));
        } else if (particle.type !== PARTICLE.SHELL) {
          particle.life = Math.min(particle.life, particle.age + 0.18);
        }
      }

      if (this.loadBudget.trailScale > 0 && particle.trail > 0 && particle.type !== PARTICLE.EMBER) {
        particle.trailClock += delta * particle.trailRate * particle.trail;
        const spawnLimit = particle.type === PARTICLE.SHELL ? 3 : 2;
        let spawned = 0;
        while (particle.trailClock >= 1 && spawned < spawnLimit) {
          particle.trailClock -= 1;
          this.spawnEmber(particle, particle.type === PARTICLE.SHELL ? 0.75 : 1);
          spawned += 1;
        }
      }

      const smokeInterval = (particle.type === PARTICLE.SHELL ? 2 : 5) * this.loadBudget.smokeStride;
      if (particle.smoke > 0 && this.fluid && this._frame % smokeInterval === 0) {
        const lifeT = particle.age / particle.life;
        const density = (particle.smoke * (particle.type === PARTICLE.SHELL ? 0.28 : 0.12) * (1 - lifeT * 0.5)) / this.loadBudget.smokeStride;
        this.fluid.addEmitter(particle.position, density, particle.brightness * 0.4 * this.globalBrightness, particle.color, particle.type === PARTICLE.SHELL ? 1.1 : 0.55);
      }

      particleIndex -= 1;
    }

    this.peakTrailSpawnsPerFrame = Math.max(this.peakTrailSpawnsPerFrame, this._frameTrailSpawnCount);
    this.updateAttributes();
  }

  isRenderableParticle(particle) {
    return particle.age >= 0 && particle.age < particle.life;
  }

  writeParticleAttributes(particle, renderIndex) {
    const positionOffset = renderIndex * 3;
    this.positionArray[positionOffset] = particle.position.x;
    this.positionArray[positionOffset + 1] = particle.position.y;
    this.positionArray[positionOffset + 2] = particle.position.z;
    this.previousPositionArray[positionOffset] = Number.isFinite(particle.previousX) ? particle.previousX : particle.position.x;
    this.previousPositionArray[positionOffset + 1] = Number.isFinite(particle.previousY) ? particle.previousY : particle.position.y;
    this.previousPositionArray[positionOffset + 2] = Number.isFinite(particle.previousZ) ? particle.previousZ : particle.position.z;

    const lifeT = clamp(particle.age / particle.life, 0, 1);
    const fadeIn = Math.min(1, lifeT * 18);
    const fadeOut = (1 - lifeT) ** (particle.type === PARTICLE.EMBER ? 1.6 : 0.56);
    let flicker = 1;
    if (particle.strobe > 0) {
      const pulse = Math.sin(this.time * (18 + particle.strobe * 28) + particle.phase * 7);
      flicker = (1 - particle.strobe * 0.72) + (pulse > 0.24 ? particle.strobe : particle.strobe * 0.08);
    }
    if (particle.type === PARTICLE.CRACKLE) flicker *= 1.3 + Math.sin(this.time * 71 + particle.phase * 13.7) * 0.4;
    const colorMix = particle.colorShift ? clamp((lifeT - 0.34) / 0.45, 0, 1) : 0;
    const intensity = (particle.type === PARTICLE.SHELL ? 2.8 : particle.type === PARTICLE.CRACKLE ? 4.2 : 2.35) * flicker * this.globalBrightness;
    this.colorArray[positionOffset] = (particle.color.r + (particle.colorNext.r - particle.color.r) * colorMix) * intensity;
    this.colorArray[positionOffset + 1] = (particle.color.g + (particle.colorNext.g - particle.color.g) * colorMix) * intensity;
    this.colorArray[positionOffset + 2] = (particle.color.b + (particle.colorNext.b - particle.color.b) * colorMix) * intensity;
    this.scaleArray[renderIndex] = particle.size * (particle.type === PARTICLE.SHELL ? 2 : 1) * (0.85 + flicker * 0.2) * this._renderScale;
    this.alphaArray[renderIndex] = clamp(fadeIn * fadeOut * flicker, 0, 1.35);
  }

  updateAttributes() {
    const immediateLevel = particleLoadLevel(this.particles.length / this.maxParticles);
    const effectiveImmediateLevel = this.loadBudget.particleOptimization || immediateLevel >= 3 ? immediateLevel : 0;
    const immediateProfile = particleLoadProfile(effectiveImmediateLevel);
    const immediateSoftLimit = Math.max(1, Math.floor(this.maxParticles * immediateProfile.softLimitRatio));
    const immediateRenderLimit = Math.max(1, Math.floor(immediateSoftLimit * immediateProfile.renderRatio));
    const renderLimit = Math.min(this.loadBudget.renderLimit, immediateRenderLimit, this.maxParticles);
    this._effectiveRenderLimit = renderLimit;
    this._renderScale = Math.min(this.loadBudget.particleScale, immediateProfile.particleScale);
    let count = 0;

    if (this.particles.length <= renderLimit) {
      for (const particle of this.particles) {
        if (!this.isRenderableParticle(particle)) continue;
        this.writeParticleAttributes(particle, count);
        count += 1;
      }
    } else {
      let shellCount = 0;
      let starCount = 0;
      let secondaryCount = 0;
      for (const particle of this.particles) {
        if (!this.isRenderableParticle(particle)) continue;
        if (particle.type === PARTICLE.SHELL) shellCount += 1;
        else if (particle.type === PARTICLE.STAR) starCount += 1;
        else secondaryCount += 1;
      }
      const shellLimit = Math.min(shellCount, renderLimit);
      const starLimit = Math.min(starCount, renderLimit - shellLimit);
      const secondaryLimit = Math.min(secondaryCount, renderLimit - shellLimit - starLimit);
      const starOffset = shellLimit;
      const secondaryOffset = shellLimit + starLimit;
      let shellSeen = 0;
      let starSeen = 0;
      let secondarySeen = 0;
      let shellWritten = 0;
      let starWritten = 0;
      let secondaryWritten = 0;

      for (const particle of this.particles) {
        if (!this.isRenderableParticle(particle)) continue;
        let total;
        let limit;
        let seen;
        let written;
        let outputOffset;
        if (particle.type === PARTICLE.SHELL) {
          total = shellCount;
          limit = shellLimit;
          seen = shellSeen;
          written = shellWritten;
          outputOffset = 0;
          shellSeen += 1;
        } else if (particle.type === PARTICLE.STAR) {
          total = starCount;
          limit = starLimit;
          seen = starSeen;
          written = starWritten;
          outputOffset = starOffset;
          starSeen += 1;
        } else {
          total = secondaryCount;
          limit = secondaryLimit;
          seen = secondarySeen;
          written = secondaryWritten;
          outputOffset = secondaryOffset;
          secondarySeen += 1;
        }
        if (written >= limit || limit <= 0) continue;
        const shouldWrite = total <= limit
          || Math.floor(((seen + 1) * limit) / total) > Math.floor((seen * limit) / total);
        if (!shouldWrite) continue;
        this.writeParticleAttributes(particle, outputOffset + written);
        if (particle.type === PARTICLE.SHELL) shellWritten += 1;
        else if (particle.type === PARTICLE.STAR) starWritten += 1;
        else secondaryWritten += 1;
      }
      count = shellWritten + starWritten + secondaryWritten;
    }

    this.sprite.count = count;
    this._renderedCount = count;
    for (const attribute of this.dynamicAttributes) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  prepareRenderWarmup() {
    if (this._warmupActive || this.particles.length > 0) return false;
    this.positionArray.set([0, 20, 0], 0);
    this.previousPositionArray.set([0, 20, 0], 0);
    this.colorArray.set([1, 1, 1], 0);
    this.scaleArray[0] = 0.01;
    this.alphaArray[0] = 0;
    for (const attribute of this.dynamicAttributes) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.sprite.count = 1;
    this._warmupActive = true;
    return true;
  }

  finishRenderWarmup() {
    if (!this._warmupActive) return;
    this.sprite.count = 0;
    this._warmupActive = false;
  }

  get performanceDiagnostics() {
    return {
      allocatedParticles: this.particleAllocations,
      pooledParticles: this.pool.length,
      poolHits: this.poolHits,
      poolMisses: this.poolMisses,
      peakActiveParticles: this.peakActiveCount,
      peakTrailSpawnsPerFrame: this.peakTrailSpawnsPerFrame,
      frameTrailSpawns: this._frameTrailSpawnCount,
      motionVectorParticles: this._renderedCount,
    };
  }

  clear() {
    while (this.particles.length) this.releaseAt(this.particles.length - 1);
    this.scheduled.length = 0;
    this.interactions.length = 0;
    this.sprite.count = 0;
    this._renderedCount = 0;
    this._warmupActive = false;
  }

  get activeCount() {
    return this.particles.length;
  }

  get renderedCount() {
    return this._renderedCount;
  }

  setPostBurstLifetimeScale(value) {
    const next = clamp(finite(value, 1), MIN_POST_BURST_LIFETIME, MAX_POST_BURST_LIFETIME);
    const previous = this._appliedPostBurstLifetimeScale;
    if (Math.abs(next - previous) < 1e-6) return next;
    const ratio = next / previous;
    for (const particle of this.particles) {
      if (particle.type === PARTICLE.SHELL) continue;
      particle.life *= ratio;
      if (Number.isFinite(particle.splitAt)) particle.splitAt *= ratio;
    }
    this._appliedPostBurstLifetimeScale = next;
    return next;
  }

  get postBurstLifetimeScale() {
    return clamp(finite(this.state.physics?.particleLifetime, 1), MIN_POST_BURST_LIFETIME, MAX_POST_BURST_LIFETIME);
  }

  get ringParticleScale() {
    return clampRingParticleScale(this.state.physics?.ringParticleScale, 1);
  }

  get renderLimit() {
    return this._effectiveRenderLimit;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.sprite);
    this.sprite.material.dispose();
    this.positionAttribute.array = null;
    this.previousPositionAttribute.array = null;
    this.colorAttribute.array = null;
    this.scaleAttribute.array = null;
    this.alphaAttribute.array = null;
  }
}
