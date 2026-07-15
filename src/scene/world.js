import * as THREE from 'three/webgpu';
import {
  color,
  cos,
  normalWorldGeometry,
  reflector,
  sin,
  time,
  uniform,
  uv,
  vec2,
} from 'three/tsl';

const ENVIRONMENTS = Object.freeze({
  lake: { top: 0x050918, bottom: 0x132340, fog: 0x07111f, fogDensity: 0.008, moon: 0xbfd9ff, ambient: 0x263d66 },
  city: { top: 0x10071d, bottom: 0x30133c, fog: 0x11091c, fogDensity: 0.01, moon: 0xffa2e8, ambient: 0x442e62 },
  alpine: { top: 0x020711, bottom: 0x172638, fog: 0x08111b, fogDensity: 0.012, moon: 0xd8efff, ambient: 0x2a4356 },
  cosmic: { top: 0x120526, bottom: 0x05152b, fog: 0x070716, fogDensity: 0.004, moon: 0xc7a5ff, ambient: 0x312758 },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seeded(index) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export class WorldScene extends EventTarget {
  constructor(scene, renderer, state) {
    super();
    this.scene = scene;
    this.renderer = renderer;
    this.state = state;
    this.clock = 0;
    this.performanceLevel = 0;
    this.customTexture = null;
    this.lights = [];
    this.activeLights = [];
    this.colliders = [];
    this.groups = {};
    this.skyTop = uniform(new THREE.Color(ENVIRONMENTS.lake.top));
    this.skyBottom = uniform(new THREE.Color(ENVIRONMENTS.lake.bottom));
    this.reflectionStrength = uniform(state.world.reflection);
    this.waveStrength = uniform(0.0025 + state.world.waterRoughness * 0.012);

    scene.backgroundNode = normalWorldGeometry.y.smoothstep(-0.35, 0.85).mix(this.skyBottom, this.skyTop);
    scene.fog = new THREE.FogExp2(ENVIRONMENTS.lake.fog, ENVIRONMENTS.lake.fogDensity);

    const hemi = new THREE.HemisphereLight(0x7189b9, 0x050609, 0.42);
    hemi.name = 'Night ambient';
    scene.add(hemi);
    this.hemisphere = hemi;

    const moon = new THREE.DirectionalLight(ENVIRONMENTS.lake.moon, 0.8);
    moon.name = 'Moon key light';
    moon.position.set(-18, 35, -24);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -38;
    moon.shadow.camera.right = 38;
    moon.shadow.camera.top = 38;
    moon.shadow.camera.bottom = -38;
    moon.shadow.camera.near = 2;
    moon.shadow.camera.far = 100;
    moon.shadow.bias = -0.00035;
    moon.shadow.normalBias = 0.025;
    scene.add(moon);
    this.moon = moon;

    this.createStarField();
    this.createEnvironmentGeometry();
    this.createFloor();
    this.createLightPool();
    this.setEnvironment(state.world.environment);
    this.setFloorMode(state.world.floor);
  }

  createStarField() {
    const count = 1300;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const phi = Math.acos(1 - 2 * seeded(index + 2));
      const theta = Math.PI * 2 * seeded(index + 11);
      const radius = 170 + seeded(index + 21) * 50;
      positions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[index * 3 + 1] = Math.abs(Math.cos(phi) * radius) + 5;
      positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      const hue = seeded(index + 50) > 0.82 ? 0.58 : 0.11;
      const starColor = new THREE.Color().setHSL(hue, 0.35, 0.64 + seeded(index + 60) * 0.35);
      colors[index * 3] = starColor.r;
      colors[index * 3 + 1] = starColor.g;
      colors[index * 3 + 2] = starColor.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 0.32, sizeAttenuation: true, transparent: true, opacity: 0.75, vertexColors: true, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    points.name = 'Procedural stars';
    points.renderOrder = -2;
    this.scene.add(points);
    this.stars = points;
  }

  createEnvironmentGeometry() {
    const commonDark = new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.7, metalness: 0.18 });
    const reflectiveDark = new THREE.MeshStandardMaterial({ color: 0x0c111a, roughness: 0.3, metalness: 0.72 });

    const stage = new THREE.Group();
    stage.name = 'Stage objects';
    const plinthGeometry = new THREE.CylinderGeometry(2.2, 2.5, 0.9, 48);
    for (const [index, x] of [-15, 0, 15].entries()) {
      const plinth = new THREE.Mesh(plinthGeometry, reflectiveDark);
      plinth.position.set(x, 0.44, index === 1 ? -6 : -1);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      stage.add(plinth);
      this.colliders.push({ type: 'sphere', position: plinth.position.clone().setY(1.1), radius: 2.35 });
    }
    const archMaterial = new THREE.MeshStandardMaterial({ color: 0x101621, roughness: 0.44, metalness: 0.62 });
    const arch = new THREE.Group();
    const pillarGeometry = new THREE.BoxGeometry(0.75, 8, 0.75);
    const beamGeometry = new THREE.BoxGeometry(12, 0.72, 0.82);
    for (const x of [-5, 5]) {
      const pillar = new THREE.Mesh(pillarGeometry, archMaterial);
      pillar.position.set(x, 4, -18);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      arch.add(pillar);
      this.colliders.push({ type: 'sphere', position: pillar.position.clone(), radius: 0.72 });
    }
    const beam = new THREE.Mesh(beamGeometry, archMaterial);
    beam.position.set(0, 7.7, -18);
    beam.castShadow = true;
    beam.receiveShadow = true;
    arch.add(beam);
    stage.add(arch);
    this.scene.add(stage);
    this.groups.stage = stage;

    const city = new THREE.Group();
    city.name = 'City silhouette';
    const cityMaterial = new THREE.MeshStandardMaterial({ color: 0x100b1c, roughness: 0.74, metalness: 0.28, emissive: 0x13041a, emissiveIntensity: 0.5 });
    const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xf46bff });
    for (let index = 0; index < 44; index += 1) {
      const width = 2 + seeded(index + 80) * 3.5;
      const height = 4 + seeded(index + 90) * 18;
      const depth = 2 + seeded(index + 95) * 5;
      const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), cityMaterial);
      const side = index % 2 ? 1 : -1;
      building.position.set(side * (29 + seeded(index) * 45), height / 2, -28 + seeded(index + 20) * 56);
      building.castShadow = true;
      building.receiveShadow = true;
      city.add(building);
      if (index % 5 === 0) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(width * 0.6, 0.14, 0.08), windowMaterial);
        light.position.copy(building.position).add(new THREE.Vector3(0, height * 0.18, side > 0 ? depth * 0.51 : -depth * 0.51));
        city.add(light);
      }
    }
    this.scene.add(city);
    this.groups.city = city;

    const alpine = new THREE.Group();
    alpine.name = 'Alpine silhouettes';
    const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x0e1720, roughness: 0.98, metalness: 0.02 });
    for (let index = 0; index < 18; index += 1) {
      const radius = 12 + seeded(index + 160) * 18;
      const height = 20 + seeded(index + 180) * 32;
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5), mountainMaterial);
      mountain.position.set((index - 8.5) * 15, height / 2 - 1, -54 - seeded(index + 190) * 28);
      mountain.rotation.y = seeded(index + 200) * Math.PI;
      mountain.receiveShadow = true;
      alpine.add(mountain);
    }
    this.scene.add(alpine);
    this.groups.alpine = alpine;

    const cosmic = new THREE.Group();
    cosmic.name = 'Cosmic monoliths';
    const monoGeometry = new THREE.OctahedronGeometry(1, 0);
    for (let index = 0; index < 22; index += 1) {
      const material = new THREE.MeshStandardMaterial({ color: index % 2 ? 0x201040 : 0x0d2941, emissive: index % 2 ? 0x2c0d5a : 0x06314b, emissiveIntensity: 0.5, roughness: 0.24, metalness: 0.6 });
      const monolith = new THREE.Mesh(monoGeometry, material);
      const angle = (index / 22) * Math.PI * 2;
      const radius = 34 + seeded(index + 250) * 22;
      monolith.position.set(Math.cos(angle) * radius, 3 + seeded(index + 260) * 12, Math.sin(angle) * radius);
      monolith.scale.set(1.2, 5 + seeded(index + 270) * 8, 1.2);
      monolith.rotation.set(seeded(index) * 0.5, angle, seeded(index + 3) * 0.4);
      monolith.castShadow = true;
      cosmic.add(monolith);
    }
    this.scene.add(cosmic);
    this.groups.cosmic = cosmic;

    this.groups.lake = stage;
    commonDark.dispose();
  }

  createFloor() {
    const floorUv = uv().mul(7.5);
    const wave = vec2(
      sin(floorUv.x.mul(7).add(floorUv.y.mul(4)).add(time.mul(0.75))),
      cos(floorUv.y.mul(8).sub(floorUv.x.mul(3)).sub(time.mul(0.58))),
    ).mul(this.waveStrength);
    this.reflectionNode = reflector({ resolutionScale: 0.38 });
    this.reflectionNode.target.rotateX(-Math.PI / 2);
    this.reflectionNode.target.position.y = 0.015;
    this.reflectionNode.uvNode = this.reflectionNode.uvNode.add(wave);
    this.scene.add(this.reflectionNode.target);

    const waterMaterial = new THREE.MeshStandardNodeMaterial();
    waterMaterial.name = 'Reflective procedural water';
    waterMaterial.colorNode = color(0x07121c);
    waterMaterial.emissiveNode = this.reflectionNode.mul(this.reflectionStrength);
    waterMaterial.roughness = this.state.world.waterRoughness;
    waterMaterial.metalness = 0.65;
    waterMaterial.transparent = false;
    this.waterMaterial = waterMaterial;

    const matteMaterial = new THREE.MeshStandardMaterial({ color: 0x080b11, roughness: 0.88, metalness: 0.12 });
    matteMaterial.name = 'Matte stage floor';
    this.matteMaterial = matteMaterial;

    const geometry = new THREE.PlaneGeometry(180, 180, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(geometry, waterMaterial);
    floor.name = 'Ground and water receiver';
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;

    const grid = new THREE.GridHelper(120, 60, 0x2a6980, 0x102634);
    grid.name = 'Launch grid';
    grid.position.y = 0.022;
    grid.material.transparent = true;
    grid.material.opacity = 0.16;
    this.scene.add(grid);
    this.grid = grid;
  }

  createLightPool() {
    for (let index = 0; index < 7; index += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 42, 2);
      light.name = `Burst light ${index + 1}`;
      light.visible = false;
      if (index < 2) {
        light.castShadow = true;
        light.shadow.mapSize.set(512, 512);
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = 58;
        light.shadow.bias = -0.001;
      }
      this.scene.add(light);
      this.lights.push(light);
    }
  }

  addBurstLight({ position, color: lightColor, scale = 1, preset }) {
    const lightLimit = [7, 6, 5, 3][this.performanceLevel] ?? 3;
    const allowedLights = this.lights.slice(0, lightLimit);
    let entry = this.activeLights.find((candidate) => allowedLights.includes(candidate.light) && !candidate.light.visible);
    if (!entry) {
      const unused = allowedLights.find((light) => !this.activeLights.some((candidate) => candidate.light === light));
      const activeAllowed = this.activeLights.filter((candidate) => allowedLights.includes(candidate.light));
      entry = unused ? { light: unused } : activeAllowed.reduce((oldest, candidate) => candidate.age > oldest.age ? candidate : oldest, activeAllowed[0]);
    }
    if (!entry) return;
    if (!this.activeLights.includes(entry)) this.activeLights.push(entry);
    entry.age = 0;
    entry.life = 1.05 + scale * 0.28;
    entry.peak = (preset?.light ?? 1) * 850 * scale;
    entry.light.position.copy(position);
    entry.light.color.copy(lightColor);
    entry.light.distance = 34 + scale * 20;
    entry.light.intensity = entry.peak;
    entry.light.visible = true;
    entry.light.castShadow = this.state.quality.shadows && this.performanceLevel < 2 && this.lights.indexOf(entry.light) < 2;
  }

  addRipple(position, strength) {
    this.waveStrength.value = Math.min(0.024, 0.0025 + this.state.world.waterRoughness * 0.012 + strength * 0.0003);
    this.dispatchEvent(new CustomEvent('ripple', { detail: { position, strength } }));
  }

  setFloorMode(mode) {
    this.state.world.floor = mode;
    this.floor.visible = mode !== 'none';
    this.grid.visible = mode !== 'none';
    this.reflectionNode.target.visible = mode === 'water';
    this.floor.material = mode === 'water' ? this.waterMaterial : this.matteMaterial;
    this.floor.material.needsUpdate = true;
  }

  setEnvironment(name) {
    const selected = ENVIRONMENTS[name] ?? ENVIRONMENTS.lake;
    if (name !== 'custom') {
      this.scene.background = null;
      this.scene.environment = null;
      this.scene.backgroundNode = normalWorldGeometry.y.smoothstep(-0.35, 0.85).mix(this.skyBottom, this.skyTop);
    }
    this.skyTop.value.set(selected.top);
    this.skyBottom.value.set(selected.bottom);
    this.scene.fog.color.set(selected.fog);
    this.scene.fog.density = selected.fogDensity;
    this.moon.color.set(selected.moon);
    this.hemisphere.color.set(selected.ambient);
    this.groups.city.visible = name === 'city';
    this.groups.alpine.visible = name === 'alpine';
    this.groups.cosmic.visible = name === 'cosmic';
    this.groups.stage.visible = name !== 'cosmic';
    this.stars.visible = name !== 'city' || true;
  }

  async loadEnvironmentFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const texture = await new THREE.TextureLoader().loadAsync(url);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      this.customTexture?.dispose();
      this.customTexture = texture;
      this.scene.backgroundNode = null;
      this.scene.background = texture;
      this.scene.environment = texture;
      this.state.world.environment = 'custom';
      return texture;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  update(dt) {
    this.clock += dt;
    this.reflectionStrength.value = this.state.world.reflection;
    this.waterMaterial.roughness = this.state.world.waterRoughness;
    const targetWave = 0.0025 + this.state.world.waterRoughness * 0.012;
    this.waveStrength.value += (targetWave - this.waveStrength.value) * Math.min(1, dt * 1.8);
    this.stars.rotation.y += dt * 0.002;
    this.groups.cosmic.rotation.y += dt * 0.014;

    for (let index = this.activeLights.length - 1; index >= 0; index -= 1) {
      const entry = this.activeLights[index];
      entry.age += dt;
      const progress = entry.age / entry.life;
      if (progress >= 1) {
        entry.light.visible = false;
        entry.light.intensity = 0;
        this.activeLights.splice(index, 1);
        continue;
      }
      const attack = Math.min(1, progress * 18);
      const decay = Math.exp(-progress * 5.2);
      const flicker = 0.9 + Math.sin(this.clock * 39 + index * 1.7) * 0.1;
      entry.light.intensity = entry.peak * attack * decay * flicker;
    }
  }

  setShadows(enabled) {
    this.renderer.shadowMap.enabled = enabled;
    this.moon.castShadow = enabled && this.performanceLevel < 3;
    for (let index = 0; index < this.lights.length; index += 1) this.lights[index].castShadow = enabled && this.performanceLevel < 2 && index < 2;
  }

  setPerformanceLevel(level = 0) {
    this.performanceLevel = clamp(Math.round(Number(level) || 0), 0, 3);
    const lightLimit = [7, 6, 5, 3][this.performanceLevel];
    for (let index = this.activeLights.length - 1; index >= 0; index -= 1) {
      const entry = this.activeLights[index];
      if (this.lights.indexOf(entry.light) < lightLimit) continue;
      entry.light.visible = false;
      entry.light.intensity = 0;
      this.activeLights.splice(index, 1);
    }
    this.setShadows(this.state.quality.shadows);
  }

  dispose() {
    this.customTexture?.dispose();
    this.floor.geometry.dispose();
    this.waterMaterial.dispose();
    this.matteMaterial.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    for (const light of this.lights) this.scene.remove(light);
    this.scene.remove(this.floor, this.grid, this.reflectionNode.target, this.stars, ...Object.values(this.groups));
  }
}
