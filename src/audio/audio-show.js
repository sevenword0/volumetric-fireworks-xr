import { FIREWORK_PRESETS, LAUNCH_LAYOUTS } from '../pyro/presets.js';
import { hashString, mulberry32 } from '../pyro/patterns.js';
import { applyShowChoreography } from './show-choreography.js';

const TWO_PI = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

export function fftMagnitudes(samples, fftSize = 2048) {
  const size = nextPowerOfTwo(fftSize);
  const real = new Float64Array(size);
  const imag = new Float64Array(size);
  const limit = Math.min(size, samples.length);

  for (let index = 0; index < limit; index += 1) {
    const window = 0.5 - 0.5 * Math.cos((TWO_PI * index) / Math.max(1, size - 1));
    real[index] = samples[index] * window;
  }

  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imag[index], imag[reversed]] = [imag[reversed], imag[index]];
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = -TWO_PI / length;
    const cosStep = Math.cos(angle);
    const sinStep = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let cosValue = 1;
      let sinValue = 0;
      const half = length >> 1;
      for (let offset = 0; offset < half; offset += 1) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + half;
        const oddReal = real[oddIndex] * cosValue - imag[oddIndex] * sinValue;
        const oddImag = real[oddIndex] * sinValue + imag[oddIndex] * cosValue;
        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;
        const nextCos = cosValue * cosStep - sinValue * sinStep;
        sinValue = cosValue * sinStep + sinValue * cosStep;
        cosValue = nextCos;
      }
    }
  }

  const magnitudes = new Float32Array(size / 2);
  const scale = 2 / size;
  for (let index = 0; index < magnitudes.length; index += 1) {
    magnitudes[index] = Math.hypot(real[index], imag[index]) * scale;
  }
  return magnitudes;
}

function bandEnergy(magnitudes, sampleRate, fftSize, lowHz, highHz) {
  const low = Math.max(0, Math.floor((lowHz * fftSize) / sampleRate));
  const high = Math.min(magnitudes.length - 1, Math.ceil((highHz * fftSize) / sampleRate));
  let energy = 0;
  for (let index = low; index <= high; index += 1) energy += magnitudes[index] ** 2;
  return Math.sqrt(energy / Math.max(1, high - low + 1));
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
}

function normalizeSeries(values, ceiling = 0.95) {
  const top = percentile(values, ceiling) || 1;
  return values.map((value) => Math.max(0, Math.min(1.35, value / top)));
}

function estimateTempo(onsets, duration) {
  if (onsets.length < 3 || duration < 2) return 0;
  const histogram = new Float64Array(161);
  for (let first = 0; first < onsets.length; first += 1) {
    for (let second = first + 1; second < Math.min(onsets.length, first + 8); second += 1) {
      const delta = onsets[second].time - onsets[first].time;
      if (delta <= 0) continue;
      let bpm = 60 / delta;
      while (bpm < 70) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      const rounded = Math.round(bpm);
      if (rounded >= 70 && rounded <= 180) {
        histogram[rounded - 20] += Math.sqrt(onsets[first].strength * onsets[second].strength);
      }
    }
  }
  let bestBpm = 0;
  let bestScore = 0;
  for (let index = 50; index < histogram.length; index += 1) {
    const score = histogram[index] + (histogram[index - 1] ?? 0) * 0.55 + (histogram[index + 1] ?? 0) * 0.55;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = index + 20;
    }
  }
  return bestBpm;
}

export function analyzeChannelData(channelData, sampleRate, options = {}) {
  const fftSize = nextPowerOfTwo(options.fftSize ?? 2048);
  const hopSize = options.hopSize ?? Math.floor(fftSize / 2);
  const maxFrames = options.maxFrames ?? 7200;
  const frameCount = Math.min(maxFrames, Math.max(0, Math.floor((channelData.length - fftSize) / hopSize) + 1));
  const rawFrames = [];
  let previousMagnitudes = null;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const offset = frameIndex * hopSize;
    const frame = channelData.subarray(offset, offset + fftSize);
    const magnitudes = fftMagnitudes(frame, fftSize);
    let sumSquares = 0;
    let peak = 0;
    for (let index = 0; index < frame.length; index += 1) {
      const absolute = Math.abs(frame[index]);
      sumSquares += frame[index] ** 2;
      peak = Math.max(peak, absolute);
    }
    let flux = 0;
    if (previousMagnitudes) {
      for (let index = 1; index < magnitudes.length; index += 1) {
        const delta = magnitudes[index] - previousMagnitudes[index];
        if (delta > 0) flux += delta;
      }
      flux /= magnitudes.length;
    }
    rawFrames.push({
      time: offset / sampleRate,
      rms: Math.sqrt(sumSquares / frame.length),
      peak,
      bass: bandEnergy(magnitudes, sampleRate, fftSize, 25, 180),
      mid: bandEnergy(magnitudes, sampleRate, fftSize, 180, 2200),
      high: bandEnergy(magnitudes, sampleRate, fftSize, 2200, Math.min(12000, sampleRate / 2)),
      flux,
    });
    previousMagnitudes = magnitudes;
  }

  const normalized = {
    rms: normalizeSeries(rawFrames.map((frame) => frame.rms)),
    bass: normalizeSeries(rawFrames.map((frame) => frame.bass)),
    mid: normalizeSeries(rawFrames.map((frame) => frame.mid)),
    high: normalizeSeries(rawFrames.map((frame) => frame.high)),
    flux: normalizeSeries(rawFrames.map((frame) => frame.flux), 0.92),
  };

  const frames = rawFrames.map((frame, index) => ({
    ...frame,
    rms: normalized.rms[index],
    bass: normalized.bass[index],
    mid: normalized.mid[index],
    high: normalized.high[index],
    flux: normalized.flux[index],
  }));

  const onsets = [];
  let lastOnset = -Infinity;
  for (let index = 0; index < frames.length; index += 1) {
    const start = Math.max(0, index - 12);
    const end = Math.min(frames.length, index + 7);
    let localMean = 0;
    for (let cursor = start; cursor < end; cursor += 1) localMean += frames[cursor].flux;
    localMean /= Math.max(1, end - start);
    const frame = frames[index];
    const score = frame.flux / Math.max(0.08, localMean * 1.22);
    if (score > 1 && frame.rms > 0.08 && frame.time - lastOnset > 0.16) {
      onsets.push({ time: frame.time, strength: Math.min(1.5, score * 0.65 + frame.rms * 0.45), frame: index });
      lastOnset = frame.time;
    }
  }

  const duration = channelData.length / sampleRate;
  return {
    duration,
    sampleRate,
    fftSize,
    hopSize,
    frames,
    onsets,
    bpm: estimateTempo(onsets, duration),
    peak: Math.max(0, ...rawFrames.map((frame) => frame.peak)),
  };
}

export async function analyzeAudioBuffer(audioBuffer, options = {}) {
  const length = audioBuffer.length;
  const mixed = new Float32Array(length);
  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) mixed[index] += data[index] / channelCount;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return analyzeChannelData(mixed, audioBuffer.sampleRate, options);
}

const POOLS = Object.freeze({
  bass: ['gold-chrysanthemum', 'willow-crown', 'spider', 'multi-break', 'saturn'],
  mid: ['aurora-shell', 'rainbow-ring', 'double-ring', 'palm', 'crossette', 'butterfly'],
  high: ['white-strobe', 'red-glitter', 'crackle-chrys', 'go-getters', 'star-shape'],
  quiet: ['blue-peony', 'falling-leaves', 'ruby-pistil', 'emerald-dahlia', 'heart'],
  finale: ['brocade-crown', 'galaxy', 'dragon-eggs', 'gold-chrysanthemum', 'aurora-shell'],
});

function pickFromPool(pool, random, variety) {
  const usable = Math.max(1, Math.round(1 + (pool.length - 1) * variety));
  return pool[Math.floor(random() * usable) % usable];
}

export function generateShowCues(analysis, settings = {}, sourceName = 'music') {
  const sensitivity = Math.max(0, Math.min(1, Number(settings.sensitivity ?? 0.68)));
  const density = Math.max(0.1, Math.min(1, Number(settings.density ?? 0.62)));
  const variety = Math.max(0, Math.min(1, Number(settings.variety ?? 0.78)));
  const finale = Math.max(0, Math.min(1, Number(settings.finale ?? 0.85)));
  const random = mulberry32(hashString(`${sourceName}:${analysis.duration.toFixed(3)}:${analysis.bpm}`));
  const minimumGap = 0.95 - density * 0.72;
  const threshold = 1.32 - sensitivity * 0.74;
  const cues = [];
  let lastCue = -Infinity;

  for (const onset of analysis.onsets) {
    const frame = analysis.frames[onset.frame] ?? analysis.frames[0];
    if (!frame || onset.strength < threshold || onset.time - lastCue < minimumGap) continue;
    const energy = Math.max(frame.bass, frame.mid, frame.high, frame.rms);
    let band = 'quiet';
    if (frame.bass >= frame.mid && frame.bass >= frame.high) band = 'bass';
    else if (frame.high >= frame.mid) band = 'high';
    else band = 'mid';
    const presetId = pickFromPool(POOLS[band], random, variety);
    const layoutChance = random();
    let layout = 'single';
    if (energy > 1.03 && layoutChance < 0.25 + density * 0.18) layout = random() > 0.5 ? 'pair' : 'fan5';
    else if (energy > 0.78 && layoutChance < 0.26) layout = 'pair';
    cues.push({
      time: Math.max(0, onset.time - 2.08),
      burstTime: onset.time,
      presetId,
      layout,
      energy: Math.min(1.4, energy),
      band,
    });
    lastCue = onset.time;
  }

  if (cues.length < 3 && analysis.duration > 1) {
    const bpm = analysis.bpm || 100;
    const interval = Math.max(0.45, 60 / bpm * 2);
    for (let time = 0.5; time < analysis.duration - 0.5; time += interval) {
      const poolKey = Math.floor(time / interval) % 3 === 0 ? 'bass' : 'mid';
      cues.push({ time, burstTime: time + 2.08, presetId: pickFromPool(POOLS[poolKey], random, variety), layout: 'single', energy: 0.7, band: poolKey });
    }
  }

  const finaleStart = analysis.duration * (0.88 - finale * 0.08);
  const finaleSpacing = Math.max(0.16, 0.48 - finale * 0.28);
  for (let time = finaleStart; time < Math.max(finaleStart, analysis.duration - 0.15); time += finaleSpacing) {
    const progress = (time - finaleStart) / Math.max(0.01, analysis.duration - finaleStart);
    cues.push({
      time: Math.max(0, time - 1.9),
      burstTime: time,
      presetId: pickFromPool(POOLS.finale, random, variety),
      layout: progress > 0.72 && finale > 0.55 ? 'finale' : progress > 0.35 ? 'fan5' : 'pair',
      energy: 1 + finale * 0.4,
      band: 'finale',
    });
  }

  const orderedCues = cues
    .filter((cue) => cue.time <= analysis.duration)
    .sort((a, b) => a.time - b.time)
    .map((cue, index) => ({ ...cue, id: `cue-${index + 1}` }));
  const choreographyRandom = mulberry32(hashString(`${sourceName}:${analysis.duration.toFixed(3)}:${analysis.bpm}:choreography`));
  return applyShowChoreography(orderedCues, settings, choreographyRandom);
}

export class AudioShowController extends EventTarget {
  constructor(options = {}) {
    super();
    this.context = null;
    this.master = null;
    this.buffer = null;
    this.analysis = null;
    this.cues = [];
    this.source = null;
    this.startedAt = 0;
    this.offset = 0;
    this.playing = false;
    this.fileName = '';
    this.volume = clamp(Number(options.volume ?? 1) || 0, 0, 1);
  }

  async load(file) {
    this.stop();
    this.context ??= new AudioContext({ latencyHint: 'interactive' });
    if (!this.master) {
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    const bytes = await file.arrayBuffer();
    this.buffer = await this.context.decodeAudioData(bytes.slice(0));
    this.fileName = file.name;
    this.analysis = await analyzeAudioBuffer(this.buffer);
    this.offset = 0;
    this.dispatchEvent(new CustomEvent('loaded', { detail: { analysis: this.analysis, fileName: file.name } }));
    return this.analysis;
  }

  generate(settings) {
    if (!this.analysis) return [];
    this.cues = generateShowCues(this.analysis, settings, this.fileName);
    this.dispatchEvent(new CustomEvent('generated', { detail: { cues: this.cues } }));
    return this.cues;
  }

  async play() {
    if (!this.buffer || !this.context) return false;
    if (this.playing) {
      this.pause();
      return false;
    }
    await this.context.resume();
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.master ?? this.context.destination);
    this.startedAt = this.context.currentTime - this.offset;
    this.source.start(0, this.offset);
    this.source.onended = () => {
      if (!this.playing) return;
      this.playing = false;
      this.offset = 0;
      this.dispatchEvent(new CustomEvent('ended'));
    };
    this.playing = true;
    this.dispatchEvent(new CustomEvent('play'));
    return true;
  }

  pause() {
    if (!this.playing || !this.context) return;
    this.offset = Math.min(this.buffer.duration, this.context.currentTime - this.startedAt);
    this.playing = false;
    this.source?.stop();
    this.source = null;
    this.dispatchEvent(new CustomEvent('pause'));
  }

  stop() {
    if (this.source) {
      this.playing = false;
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source = null;
    }
    this.offset = 0;
    this.dispatchEvent(new CustomEvent('stop'));
  }

  get currentTime() {
    if (!this.playing || !this.context) return this.offset;
    return Math.min(this.buffer?.duration ?? Infinity, this.context.currentTime - this.startedAt);
  }

  setVolume(value) {
    this.volume = clamp(Number(value) || 0, 0, 1);
    if (this.master?.gain) {
      const now = this.context?.currentTime ?? 0;
      this.master.gain.cancelScheduledValues?.(now);
      if (typeof this.master.gain.setTargetAtTime === 'function') this.master.gain.setTargetAtTime(this.volume, now, 0.015);
      else this.master.gain.value = this.volume;
    }
    return this.volume;
  }

  dispose() {
    this.stop();
    this.master?.disconnect();
    this.master = null;
    this.context?.close();
  }
}

export function summarizeCueLayouts(cues) {
  const summary = {};
  for (const cue of cues) {
    const multiplier = cue.choreography?.crossLaunch ? 2 : 1;
    summary[cue.layout] = (summary[cue.layout] ?? 0) + (LAUNCH_LAYOUTS[cue.layout]?.length ?? 1) * multiplier;
  }
  return summary;
}

export function getPresetForCue(cue) {
  return FIREWORK_PRESETS.find((preset) => preset.id === cue.presetId) ?? FIREWORK_PRESETS[0];
}
