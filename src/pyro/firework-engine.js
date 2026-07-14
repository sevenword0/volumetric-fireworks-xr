import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, shapeCircle } from 'three/tsl';
import { createSplitDirections, generateBurstDirections, hashString, mulberry32 } from './patterns.js';
import { LAUNCH_LAYOUTS } from './presets.js';

const PARTICLE = Object.freeze({ SHELL: 1, STAR: 2, EMBER: 3, CRACKLE: 4 });
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(0xffffff);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function colorFromPalette(colors, t) {
  const palette = colors.map((value) => new THREE.Color(value));
  const scaled = clamp(t, 0, 0.9999) * (palette.length - 1);
  const index = Math.floor(scaled);
  return palette[index].clone().lerp(palette[Math.min(index + 1, palette.length - 1)], scaled - index);
}

function createParticle() {
  return {
    type: PARTICLE.STAR,
    position: new THREE.Vector3(),
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
    goGetter: 0,
    bounced: false,
  };
}

export class FireworkEngine extends EventTarget {
  constructor(scene, state, options = {}) {
    super();
    this.scene = scene;
    this.state = state;
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
    this._frame = 0;

    this.positionArray = new Float32Array(this.maxParticles * 3);
    this.colorArray = new Float32Array(this.maxParticles * 3);
    this.scaleArray = new Float32Array(this.maxParticles);
    this.alphaArray = new Float32Array(this.maxParticles);

    this.positionAttribute = new THREE.InstancedBufferAttribute(this.positionArray, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.InstancedBufferAttribute(this.colorArray, 3).setUsage(THREE.DynamicDrawUsage);
    this.scaleAttribute = new THREE.InstancedBufferAttribute(this.scaleArray, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttribute = new THREE.InstancedBufferAttribute(this.alphaArray, 1).setUsage(THREE.DynamicDrawUsage);

    const material = new THREE.SpriteNodeMaterial();
    material.positionNode = instancedBufferAttribute(this.positionAttribute);
    material.colorNode = instancedBufferAttribute(this.colorAttribute);
    material.scaleNode = instancedBufferAttribute(this.scaleAttribute);
    material.opacityNode = instancedBufferAttribute(this.alphaAttribute).mul(shapeCircle());
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    material.blending = THREE.AdditiveBlending;
    material.alphaToCoverage = true;
    material.toneMapped = false;

    this.sprite = new THREE.Sprite(material);
    this.sprite.name = 'Firework particle field';
    this.sprite.count = 0;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = 8;
    scene.add(this.sprite);
  }

  connectFluid(fluid) {
    this.fluid = fluid;
  }

  setColliders(colliders) {
    this.colliders = colliders;
  }

  acquire() {
    if (this.particles.length >= this.maxParticles) return null;
    const particle = this.pool.pop() ?? createParticle();
    particle.age = 0;
    particle.trailClock = 0;
    particle.splitDone = false;
    particle.bounced = false;
    particle.alpha = 1;
    particle.brightness = 1;
    this.particles.push(particle);
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
    });
    this.scheduled.sort((a, b) => a.at - b.at);
  }

  launchLayout(preset, layoutName = 'single', options = {}) {
    const layout = LAUNCH_LAYOUTS[layoutName] ?? LAUNCH_LAYOUTS.single;
    for (const item of layout) {
      this.schedule(preset, {
        ...item,
        delay: (options.delay ?? 0) + item.delay,
        x: (options.x ?? 0) + item.x * (options.spread ?? 1),
        z: (options.z ?? 0) + item.z * (options.spread ?? 1),
        scale: (options.scale ?? 1) * (0.91 + this.random() * 0.18),
      });
    }
    return layout.length;
  }

  launchNow(preset, options = {}) {
    const x = options.x ?? 0;
    const z = options.z ?? 0;
    const y = options.y ?? 0.25;
    const scale = options.scale ?? 1;
    const yaw = options.yaw ?? 0;

    if (['mine', 'cometFan', 'romanCandle'].includes(preset.pattern)) {
      if (preset.pattern === 'romanCandle') {
        const repeat = preset.repeat ?? 7;
        for (let index = 0; index < repeat; index += 1) {
          this.scheduled.push({ at: this.time + index * 0.34, preset: { ...preset, pattern: 'cometFan', count: 1 }, x, y, z, yaw, scale });
        }
        return;
      }
      this.burst(preset, new THREE.Vector3(x, y, z), new THREE.Vector3(), scale, yaw);
      return;
    }

    if (preset.pattern === 'waterfall') {
      this.burst(preset, new THREE.Vector3(x, y + 30 * scale, z), new THREE.Vector3(), scale, yaw);
      return;
    }

    const shell = this.acquire();
    if (!shell) return;
    const paletteColor = colorFromPalette(preset.colors, 0.05);
    shell.type = PARTICLE.SHELL;
    shell.position.set(x, y, z);
    shell.velocity.set(Math.sin(yaw) * 4.2, preset.launchVelocity * (0.92 + this.random() * 0.1) * Math.sqrt(scale), Math.cos(yaw) * 1.1);
    shell.color.copy(paletteColor);
    shell.colorNext.copy(WHITE);
    shell.age = 0;
    shell.life = preset.fuse + 0.35;
    shell.fuse = preset.fuse * (0.94 + this.random() * 0.08) * Math.sqrt(scale);
    shell.size = 0.16 * scale;
    shell.drag = 0.015;
    shell.gravityScale = 1;
    shell.trail = 0.82;
    shell.trailRate = 28;
    shell.smoke = preset.smoke * 0.75;
    shell.preset = preset;
    shell.burstScale = scale;
    shell.yaw = yaw;
    shell.phase = this.random() * Math.PI * 2;
    this.dispatchEvent(new CustomEvent('launch', { detail: { preset, position: shell.position.clone() } }));
  }

  burst(preset, position, inheritedVelocity = new THREE.Vector3(), scale = 1, yaw = 0) {
    const countScale = clamp(scale ** 0.55, 0.65, 1.35);
    const requestedCount = Math.max(1, Math.round(preset.count * countScale));
    const available = Math.max(0, this.maxParticles - this.particles.length - 80);
    const count = Math.min(requestedCount, available);
    if (count <= 0) return;
    const seed = hashString(`${preset.id}:${this.time.toFixed(3)}:${position.x.toFixed(2)}`);
    const directions = generateBurstDirections(preset, count, seed);
    const palette = preset.colors;
    const orientation = new THREE.Quaternion().setFromAxisAngle(UP, yaw);

    for (let index = 0; index < directions.length; index += 1) {
      const descriptor = directions[index];
      const particle = this.acquire();
      if (!particle) break;
      this._temp.set(descriptor.x, descriptor.y, descriptor.z).applyQuaternion(orientation);
      const speed = preset.burstSpeed * descriptor.speedScale * scale;
      particle.type = PARTICLE.STAR;
      particle.position.copy(position);
      particle.velocity.copy(this._temp).multiplyScalar(speed).addScaledVector(inheritedVelocity, 0.14);
      particle.color.copy(colorFromPalette(palette, descriptor.colorT));
      particle.colorNext.copy(colorFromPalette(palette, (descriptor.colorT + 0.42) % 1));
      particle.age = -descriptor.delay;
      particle.life = preset.life * (0.9 + descriptor.seed * 0.18) * Math.sqrt(scale);
      particle.size = preset.size * scale * (0.78 + descriptor.seed * 0.48);
      particle.drag = preset.drag;
      particle.gravityScale = preset.gravityScale;
      particle.trail = preset.trail;
      particle.trailRate = preset.trailRate;
      particle.smoke = preset.smoke;
      particle.strobe = preset.strobe;
      particle.crackle = preset.crackle;
      particle.split = preset.split;
      particle.splitAt = particle.life * preset.splitDelay;
      particle.phase = descriptor.phase;
      particle.seed = Math.floor(descriptor.seed * 1e9);
      particle.colorShift = preset.colorShift;
      particle.goGetter = preset.vortexSeek ?? 0;
      particle.preset = preset;
      particle.fuse = Infinity;
      particle.burstScale = scale;
    }

    this.spawnPistil(preset, position, scale, seed + 91);
    if (preset.multiBreak > 1) {
      for (let index = 1; index < preset.multiBreak; index += 1) {
        const angle = (index / preset.multiBreak) * Math.PI * 2 + this.random() * 0.4;
        const subPosition = position.clone().add(new THREE.Vector3(Math.cos(angle) * index * 2.3, index * 1.2, Math.sin(angle) * index * 2.3));
        this.scheduled.push({ at: this.time + index * 0.32, preset: { ...preset, multiBreak: 1, count: Math.round(preset.count * 0.72) }, x: subPosition.x, y: subPosition.y, z: subPosition.z, yaw: yaw + angle * 0.2, scale: scale * 0.8 });
      }
    }

    const lightColor = colorFromPalette(palette, 0.25);
    this.dispatchEvent(new CustomEvent('burst', { detail: { preset, position: position.clone(), color: lightColor, scale, count } }));
    this.fluid?.addEmitter(position, 2.2 * preset.smoke * scale, 1.9 * scale, lightColor, 2.2);
  }

  spawnPistil(preset, position, scale, seed) {
    if (!preset.pistil || preset.pistil === 'none') return;
    const passes = preset.pistil === 'double' ? 2 : 1;
    const baseCount = preset.pistil === 'ring' ? 55 : 68;
    for (let pass = 0; pass < passes; pass += 1) {
      const corePreset = {
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
      };
      const directions = generateBurstDirections(corePreset, corePreset.count, seed + pass * 17);
      for (const descriptor of directions) {
        const particle = this.acquire();
        if (!particle) return;
        particle.type = PARTICLE.STAR;
        particle.position.copy(position);
        particle.velocity.set(descriptor.x, descriptor.y, descriptor.z).multiplyScalar(corePreset.burstSpeed * descriptor.speedScale * scale);
        particle.color.copy(colorFromPalette(corePreset.colors, descriptor.colorT));
        particle.colorNext.copy(particle.color);
        particle.life = corePreset.life * (0.9 + descriptor.seed * 0.18);
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
        particle.phase = descriptor.phase;
        particle.seed = Math.floor(descriptor.seed * 1e9);
        particle.colorShift = false;
        particle.goGetter = 0;
        particle.preset = corePreset;
      }
    }
  }

  spawnEmber(source, strength = 1) {
    const ember = this.acquire();
    if (!ember) return;
    ember.type = PARTICLE.EMBER;
    ember.position.copy(source.position).addScaledVector(source.velocity, -0.008);
    ember.velocity.copy(source.velocity).multiplyScalar(0.05).add(this._temp.set(this.random() - 0.5, this.random() - 0.5, this.random() - 0.5).multiplyScalar(0.7));
    ember.color.copy(source.color);
    ember.colorNext.copy(source.colorNext);
    ember.life = (0.22 + this.random() * 0.45) * (0.55 + source.trail * 0.8);
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
  }

  splitParticle(source) {
    const directions = createSplitDirections(source.velocity, source.split, source.seed);
    for (const velocity of directions) {
      const child = this.acquire();
      if (!child) return;
      child.type = PARTICLE.STAR;
      child.position.copy(source.position);
      child.velocity.set(velocity.x, velocity.y, velocity.z);
      child.color.copy(source.colorNext);
      child.colorNext.copy(source.color);
      child.life = Math.max(0.55, source.life - source.age + 0.7);
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
    const count = 3 + Math.floor(this.random() * 4);
    for (let index = 0; index < count; index += 1) {
      const crackle = this.acquire();
      if (!crackle) return;
      crackle.type = PARTICLE.CRACKLE;
      crackle.position.copy(source.position);
      crackle.velocity.set(this.random() - 0.5, this.random() - 0.4, this.random() - 0.5).normalize().multiplyScalar(3 + this.random() * 4).addScaledVector(source.velocity, 0.15);
      crackle.color.set(this.random() > 0.3 ? 0xffe4a1 : 0xffffff);
      crackle.colorNext.copy(crackle.color);
      crackle.life = 0.2 + this.random() * 0.36;
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

  update(dt) {
    const delta = Math.min(0.034, Math.max(0, dt));
    this.time += delta;
    this._frame += 1;

    while (this.scheduled.length && this.scheduled[0].at <= this.time) {
      const item = this.scheduled.shift();
      if (['cometFan'].includes(item.preset.pattern) && item.preset.fuse === 0) {
        this.burst(item.preset, new THREE.Vector3(item.x, item.y, item.z), new THREE.Vector3(), item.scale, item.yaw);
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
      particle.age += delta;
      if (particle.age < 0) {
        particleIndex -= 1;
        continue;
      }

      if (particle.type === PARTICLE.SHELL && particle.age >= particle.fuse) {
        const inherited = particle.velocity.clone();
        this.burst(particle.preset, particle.position.clone(), inherited, particle.burstScale, particle.yaw);
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

      if (particle.trail > 0 && particle.type !== PARTICLE.EMBER) {
        particle.trailClock += delta * particle.trailRate * particle.trail;
        const spawnLimit = particle.type === PARTICLE.SHELL ? 3 : 2;
        let spawned = 0;
        while (particle.trailClock >= 1 && spawned < spawnLimit) {
          particle.trailClock -= 1;
          this.spawnEmber(particle, particle.type === PARTICLE.SHELL ? 0.75 : 1);
          spawned += 1;
        }
      }

      if (particle.smoke > 0 && this.fluid && this._frame % (particle.type === PARTICLE.SHELL ? 2 : 5) === 0) {
        const lifeT = particle.age / particle.life;
        const density = particle.smoke * (particle.type === PARTICLE.SHELL ? 0.28 : 0.12) * (1 - lifeT * 0.5);
        this.fluid.addEmitter(particle.position, density, particle.brightness * 0.4, particle.color, particle.type === PARTICLE.SHELL ? 1.1 : 0.55);
      }

      particleIndex -= 1;
    }

    this.updateAttributes();
  }

  updateAttributes() {
    const count = Math.min(this.particles.length, this.maxParticles);
    for (let index = 0; index < count; index += 1) {
      const particle = this.particles[index];
      const positionOffset = index * 3;
      this.positionArray[positionOffset] = particle.position.x;
      this.positionArray[positionOffset + 1] = particle.position.y;
      this.positionArray[positionOffset + 2] = particle.position.z;

      const lifeT = clamp(particle.age / particle.life, 0, 1);
      const fadeIn = Math.min(1, lifeT * 18);
      const fadeOut = (1 - lifeT) ** (particle.type === PARTICLE.EMBER ? 1.6 : 0.56);
      let flicker = 1;
      if (particle.strobe > 0) {
        const pulse = Math.sin(this.time * (18 + particle.strobe * 28) + particle.phase * 7);
        flicker = (1 - particle.strobe * 0.72) + (pulse > 0.24 ? particle.strobe : particle.strobe * 0.08);
      }
      if (particle.type === PARTICLE.CRACKLE) flicker *= 0.9 + this.random() * 0.8;
      const colorMix = particle.colorShift ? clamp((lifeT - 0.34) / 0.45, 0, 1) : 0;
      this._temp.set(particle.color.r, particle.color.g, particle.color.b).lerp(this._temp2.set(particle.colorNext.r, particle.colorNext.g, particle.colorNext.b), colorMix);
      const intensity = (particle.type === PARTICLE.SHELL ? 2.8 : particle.type === PARTICLE.CRACKLE ? 4.2 : 2.35) * flicker;
      this.colorArray[positionOffset] = this._temp.x * intensity;
      this.colorArray[positionOffset + 1] = this._temp.y * intensity;
      this.colorArray[positionOffset + 2] = this._temp.z * intensity;
      this.scaleArray[index] = particle.size * (particle.type === PARTICLE.SHELL ? 2 : 1) * (0.85 + flicker * 0.2);
      this.alphaArray[index] = clamp(fadeIn * fadeOut * flicker, 0, 1.35);
    }

    this.sprite.count = count;
    for (const attribute of [this.positionAttribute, this.colorAttribute, this.scaleAttribute, this.alphaAttribute]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  clear() {
    while (this.particles.length) this.releaseAt(this.particles.length - 1);
    this.scheduled.length = 0;
    this.interactions.length = 0;
    this.sprite.count = 0;
  }

  get activeCount() {
    return this.particles.length;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.sprite);
    this.sprite.material.dispose();
    this.positionAttribute.array = null;
    this.colorAttribute.array = null;
    this.scaleAttribute.array = null;
    this.alphaAttribute.array = null;
  }
}

