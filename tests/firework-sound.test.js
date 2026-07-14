import test from 'node:test';
import assert from 'node:assert/strict';
import { FireworkSoundEngine, createBurstSoundProfile, distanceAttenuation, soundTravelDelay } from '../src/audio/firework-sound.js';

class FakeParam {
  constructor(value = 0) { this.value = value; }
  cancelScheduledValues() {}
  setTargetAtTime(value) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}

class FakeNode {
  connect(node) { this.connected = node; return node; }
  disconnect() { this.connected = null; }
}

class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 10;
    this.sampleRate = 8000;
    this.destination = new FakeNode();
  }
  createGain() { const node = new FakeNode(); node.gain = new FakeParam(1); return node; }
  createDynamicsCompressor() {
    const node = new FakeNode();
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new FakeParam();
    return node;
  }
  createBuffer(_channels, length) {
    const data = new Float32Array(length);
    return { duration: length / this.sampleRate, getChannelData: () => data };
  }
  createOscillator() {
    const node = new FakeNode();
    node.frequency = new FakeParam();
    node.start = (...args) => { node.started = args; };
    node.stop = (...args) => { node.stopped = args; };
    return node;
  }
  createBufferSource() {
    const node = new FakeNode();
    node.playbackRate = { value: 1 };
    node.start = (...args) => { node.started = args; };
    return node;
  }
  createBiquadFilter() {
    const node = new FakeNode();
    node.frequency = new FakeParam();
    node.Q = new FakeParam();
    return node;
  }
  createStereoPanner() { const node = new FakeNode(); node.pan = new FakeParam(); return node; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

test('sound travel delay follows distance and remains bounded', () => {
  assert.equal(soundTravelDelay(0), 0);
  assert.ok(Math.abs(soundTravelDelay(343) - 1) < 1e-9);
  assert.equal(soundTravelDelay(-20), 0);
  assert.equal(soundTravelDelay(10000), 1.4);
});

test('distance attenuation is monotonic with a safe audible floor', () => {
  const near = distanceAttenuation(4);
  const medium = distanceAttenuation(40);
  const far = distanceAttenuation(400);
  assert.ok(near > medium);
  assert.ok(medium > far);
  assert.equal(far, 0.14);
});

test('large shells produce deeper and longer explosion profiles', () => {
  const small = createBurstSoundProfile({ scale: 0.6, count: 60, preset: { id: 'small', crackle: 0, strobe: 0, split: 0, multiBreak: 1 } });
  const large = createBurstSoundProfile({ scale: 1.5, count: 640, preset: { id: 'large', crackle: 0, strobe: 0, split: 0, multiBreak: 1 } });
  assert.ok(large.energy > small.energy);
  assert.ok(large.duration > small.duration);
  assert.ok(large.bodyFrequency < small.bodyFrequency);
});

test('crackle, strobe, and split components add discrete impact detail', () => {
  const clean = createBurstSoundProfile({ scale: 1, count: 220, preset: { id: 'clean', crackle: 0, strobe: 0, split: 0 } });
  const detailed = createBurstSoundProfile({ scale: 1, count: 220, preset: { id: 'detail', crackle: 0.9, strobe: 0.7, split: 4 } });
  assert.equal(clean.crackleCount, 0);
  assert.ok(detailed.crackleCount >= 20);
  assert.ok(detailed.noiseCutoff > clean.noiseCutoff);
});

test('sound engine unlocks and schedules a spatial polyphonic burst', async () => {
  const state = { sound: { enabled: true, volume: 0.65 } };
  const engine = new FireworkSoundEngine(state, { contextFactory: FakeAudioContext, maxVoices: 4 });
  assert.equal(await engine.resume(), true);
  const scheduled = engine.playBurst({
    position: { x: 18, y: 30, z: 0 },
    count: 320,
    scale: 1.2,
    preset: { id: 'spatial-crackle', count: 320, crackle: 0.7, strobe: 0.2, split: 2 },
  }, { position: { x: 0, y: 12, z: 50 }, right: { x: 1, y: 0, z: 0 } });
  assert.ok(scheduled);
  assert.ok(scheduled.delay > 0);
  assert.ok(scheduled.pan > 0);
  assert.equal(engine.activeVoices, 1);
  await engine.dispose();
});
