const SPEED_OF_SOUND = 343;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value = {}) {
  return {
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z),
  };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function soundSeed(detail) {
  const id = detail?.preset?.id ?? 'burst';
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const count = finite(detail?.requestedCount, finite(detail?.count));
  return (hash ^ Math.round(count * 31) ^ Math.round(finite(detail?.scale, 1) * 1000)) >>> 0;
}

export function soundTravelDelay(distance, speed = SPEED_OF_SOUND) {
  return clamp(Math.max(0, finite(distance)) / Math.max(1, finite(speed, SPEED_OF_SOUND)), 0, 1.4);
}

export function distanceAttenuation(distance) {
  return clamp(1 / (1 + Math.max(0, finite(distance)) * 0.026), 0.14, 1);
}

export function createBurstSoundProfile(detail = {}) {
  const preset = detail.preset ?? {};
  const scale = clamp(finite(detail.scale, 1), 0.35, 2.5);
  const count = clamp(Math.round(finite(detail.requestedCount, finite(detail.count, preset.count ?? 180))), 1, 4000);
  const crackle = clamp(finite(preset.crackle), 0, 1);
  const strobe = clamp(finite(preset.strobe), 0, 1);
  const split = clamp(finite(preset.split), 0, 8);
  const multiBreak = clamp(finite(preset.multiBreak, 1), 1, 6);
  const energy = clamp(0.34 + Math.log2(count + 1) * 0.075 + scale * 0.28 + (multiBreak - 1) * 0.035, 0.5, 1.45);

  return {
    energy,
    duration: clamp(0.62 + scale * 0.38 + crackle * 0.34 + Math.log2(count + 1) * 0.035, 0.72, 2.2),
    bodyFrequency: clamp(96 - scale * 23 - Math.log2(count + 1) * 2.2, 34, 92),
    noiseCutoff: clamp(850 + energy * 1550 + crackle * 1450 + strobe * 420, 900, 4800),
    crackleCount: clamp(Math.round(crackle * 16 + strobe * 5 + Math.max(0, split - 1) * 1.5), 0, 28),
  };
}

export class FireworkSoundEngine {
  constructor(state, options = {}) {
    this.state = state;
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.activeVoices = 0;
    this.maxVoices = options.maxVoices ?? 12;
    this.contextFactory = options.contextFactory ?? null;
  }

  async resume() {
    if (!this.state.sound.enabled) return false;
    if (!this.context) {
      const AudioContextClass = this.contextFactory ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AudioContextClass) return false;
      this.context = new AudioContextClass({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.master.gain.value = this.state.sound.volume;
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 16;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.24;
      this.master.connect(this.compressor);
      this.compressor.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.context.state === 'suspended') {
      let resumeError = null;
      const resumeAttempt = Promise.resolve(this.context.resume()).catch((error) => { resumeError = error; });
      await Promise.race([resumeAttempt, new Promise((resolve) => setTimeout(resolve, 650))]);
      if (resumeError) throw resumeError;
    }
    this.syncMasterGain();
    return this.context.state === 'running';
  }

  createNoiseBuffer() {
    const duration = 2.5;
    const length = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.18 + white * 0.82;
      channel[index] = previous;
    }
    return buffer;
  }

  syncMasterGain() {
    if (!this.context || !this.master) return;
    const target = this.state.sound.enabled ? this.state.sound.volume : 0;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.025);
  }

  setEnabled() {
    this.syncMasterGain();
  }

  setVolume() {
    this.syncMasterGain();
  }

  playBurst(detail, listener = {}) {
    if (!this.context || this.context.state !== 'running' || !this.state.sound.enabled || this.activeVoices >= this.maxVoices) return false;

    const sourcePosition = point(detail.position);
    const listenerPosition = point(listener.position);
    const right = point(listener.right ?? { x: 1, y: 0, z: 0 });
    const dx = sourcePosition.x - listenerPosition.x;
    const dy = sourcePosition.y - listenerPosition.y;
    const dz = sourcePosition.z - listenerPosition.z;
    const distance = Math.hypot(dx, dy, dz);
    const inverseDistance = distance > 0.001 ? 1 / distance : 0;
    const pan = clamp((dx * right.x + dy * right.y + dz * right.z) * inverseDistance, -0.88, 0.88);
    const profile = createBurstSoundProfile(detail);
    const random = seededRandom(soundSeed(detail));
    const startTime = this.context.currentTime + soundTravelDelay(distance);
    const endTime = startTime + profile.duration;
    const voicePeak = distanceAttenuation(distance) * profile.energy * 0.74;

    const voice = this.context.createGain();
    voice.gain.setValueAtTime(0.0001, startTime);
    voice.gain.exponentialRampToValueAtTime(Math.max(0.0002, voicePeak), startTime + 0.012);
    voice.gain.exponentialRampToValueAtTime(0.0001, endTime);

    let output = voice;
    if (typeof this.context.createStereoPanner === 'function') {
      const panner = this.context.createStereoPanner();
      panner.pan.setValueAtTime(pan, startTime);
      voice.connect(panner);
      output = panner;
    }
    output.connect(this.master);

    const body = this.context.createOscillator();
    const bodyGain = this.context.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(profile.bodyFrequency, startTime);
    body.frequency.exponentialRampToValueAtTime(Math.max(24, profile.bodyFrequency * 0.48), startTime + Math.min(0.48, profile.duration * 0.55));
    bodyGain.gain.setValueAtTime(0.0001, startTime);
    bodyGain.gain.exponentialRampToValueAtTime(0.82, startTime + 0.009);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(0.62, profile.duration * 0.62));
    body.connect(bodyGain);
    bodyGain.connect(voice);
    body.start(startTime);
    body.stop(startTime + Math.min(0.66, profile.duration * 0.68));

    const noise = this.context.createBufferSource();
    const highpass = this.context.createBiquadFilter();
    const lowpass = this.context.createBiquadFilter();
    const noiseGain = this.context.createGain();
    noise.buffer = this.noiseBuffer;
    noise.playbackRate.value = 0.86 + random() * 0.28;
    highpass.type = 'highpass';
    highpass.frequency.value = 48 + random() * 36;
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(profile.noiseCutoff, startTime);
    lowpass.frequency.exponentialRampToValueAtTime(Math.max(380, profile.noiseCutoff * 0.32), endTime);
    noiseGain.gain.setValueAtTime(0.0001, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(1, startTime + 0.006);
    noiseGain.gain.exponentialRampToValueAtTime(0.2, startTime + Math.min(0.14, profile.duration * 0.18));
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, endTime);
    noise.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(voice);

    for (let index = 0; index < profile.crackleCount; index += 1) {
      const crackle = this.context.createBufferSource();
      const crackleFilter = this.context.createBiquadFilter();
      const crackleGain = this.context.createGain();
      const crackleTime = startTime + 0.045 + random() * Math.max(0.08, profile.duration * 0.72);
      const crackleDuration = 0.012 + random() * 0.032;
      crackle.buffer = this.noiseBuffer;
      crackle.playbackRate.value = 1.4 + random() * 1.8;
      crackleFilter.type = 'bandpass';
      crackleFilter.frequency.value = 1200 + random() * 3800;
      crackleFilter.Q.value = 0.7 + random() * 2.4;
      crackleGain.gain.setValueAtTime(0.0001, crackleTime);
      crackleGain.gain.exponentialRampToValueAtTime(0.16 + random() * 0.28, crackleTime + 0.002);
      crackleGain.gain.exponentialRampToValueAtTime(0.0001, crackleTime + crackleDuration);
      crackle.connect(crackleFilter);
      crackleFilter.connect(crackleGain);
      crackleGain.connect(voice);
      crackle.start(crackleTime, random() * 1.8, crackleDuration);
    }

    this.activeVoices += 1;
    noise.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      try { voice.disconnect(); } catch { /* already disconnected */ }
      if (output !== voice) {
        try { output.disconnect(); } catch { /* already disconnected */ }
      }
    };
    noise.start(startTime, 0, profile.duration);
    return { distance, delay: startTime - this.context.currentTime, pan, profile };
  }

  async dispose() {
    if (!this.context) return;
    const context = this.context;
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.activeVoices = 0;
    await context.close();
  }
}
