import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AudioShowController,
  analyzeChannelData,
  fftMagnitudes,
  generateShowCues,
  getPresetForCue,
  summarizeCueLayouts,
} from '../src/audio/audio-show.js';
import { SHOW_CHOREOGRAPHY_PRESETS, createChoreographyPreviewCue } from '../src/audio/show-choreography.js';

test('music playback volume is clamped and can be changed before audio is loaded', () => {
  const controller = new AudioShowController({ volume: 0.78 });
  assert.equal(controller.volume, 0.78);
  assert.equal(controller.setVolume(4), 1);
  assert.equal(controller.setVolume(-2), 0);
  assert.equal(controller.setVolume(0.36), 0.36);
});

function makeClickTrack({ bpm = 120, duration = 12, sampleRate = 8000 } = {}) {
  const samples = new Float32Array(sampleRate * duration);
  const interval = 60 / bpm;
  for (let time = 0; time < duration; time += interval) {
    const start = Math.floor(time * sampleRate);
    for (let index = 0; index < 160 && start + index < samples.length; index += 1) {
      samples[start + index] += Math.sin((Math.PI * 2 * 110 * index) / sampleRate) * Math.exp(-index / 36);
    }
  }
  return { samples, sampleRate, duration };
}

test('FFT identifies a known sine frequency', () => {
  const sampleRate = 8192;
  const samples = new Float32Array(2048);
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.sin((Math.PI * 2 * 440 * index) / sampleRate);
  const spectrum = fftMagnitudes(samples, 2048);
  let peakBin = 0;
  for (let index = 1; index < spectrum.length; index += 1) if (spectrum[index] > spectrum[peakBin]) peakBin = index;
  assert.ok(Math.abs((peakBin * sampleRate) / 2048 - 440) <= 4);
});

test('silence analysis remains finite and produces no false onsets', () => {
  const analysis = analyzeChannelData(new Float32Array(8000 * 3), 8000, { fftSize: 512, hopSize: 128 });
  assert.equal(analysis.duration, 3);
  assert.equal(analysis.peak, 0);
  assert.equal(analysis.onsets.length, 0);
  assert.equal(analysis.bpm, 0);
});

test('click-track analysis detects onsets and 120 BPM', () => {
  const track = makeClickTrack();
  const analysis = analyzeChannelData(track.samples, track.sampleRate, { fftSize: 512, hopSize: 128 });
  assert.ok(analysis.onsets.length >= 20);
  assert.ok(Math.abs(analysis.bpm - 120) <= 1);
  assert.ok(analysis.frames.every((frame) => Number.isFinite(frame.rms) && Number.isFinite(frame.flux)));
});

test('automatic show generation is deterministic for the same song and controls', () => {
  const track = makeClickTrack();
  const analysis = analyzeChannelData(track.samples, track.sampleRate, { fftSize: 512, hopSize: 128 });
  const settings = { sensitivity: 0.68, density: 0.62, variety: 0.78, finale: 0.85 };
  assert.deepEqual(generateShowCues(analysis, settings, 'click.wav'), generateShowCues(analysis, settings, 'click.wav'));
});

test('generated cues are ordered, bounded, and include a finale', () => {
  const track = makeClickTrack({ duration: 16 });
  const analysis = analyzeChannelData(track.samples, track.sampleRate, { fftSize: 512, hopSize: 128 });
  const cues = generateShowCues(analysis, { finale: 1 }, 'finale.wav');
  assert.ok(cues.length > 8);
  assert.ok(cues.some((cue) => cue.band === 'finale'));
  assert.ok(cues.every((cue) => cue.time >= 0 && cue.time <= analysis.duration));
  assert.ok(cues.every((cue) => Number.isFinite(cue.choreography.launchX) && Number.isFinite(cue.choreography.launchYaw)));
  assert.ok(cues.every((cue) => cue.choreography.launchPower >= 0.5 && cue.choreography.launchPower <= 1.8));
  assert.ok(cues.every((cue) => cue.choreography.explosionPower >= 0.5 && cue.choreography.explosionPower <= 1.8));
  assert.deepEqual(cues.map((cue) => cue.time), cues.map((cue) => cue.time).toSorted((a, b) => a - b));
});

test('music choreography presets create directional, sequential, cross, and color variations', () => {
  assert.ok(SHOW_CHOREOGRAPHY_PRESETS.length >= 6);
  const track = makeClickTrack({ duration: 18 });
  const analysis = analyzeChannelData(track.samples, track.sampleRate, { fftSize: 512, hopSize: 128 });
  const cues = generateShowCues(analysis, { choreographyPreset: 'crossfire' }, 'cross.wav');
  assert.ok(cues.some((cue) => Math.abs(cue.choreography.launchX) > 10));
  assert.ok(cues.some((cue) => Math.abs(cue.choreography.launchYaw) > 0.5));
  assert.ok(cues.some((cue) => cue.choreography.sequenceDelay > 0.01));
  assert.ok(cues.some((cue) => cue.choreography.crossLaunch));
  assert.ok(cues.some((cue) => Math.abs(cue.choreography.colorHue) > 0.01));
  assert.ok(cues.every((cue) => cue.choreography.directionMode === 'cross'));
});

test('choreography preview advances through alternate launch positions', () => {
  const settings = { choreographyPreset: 'crossfire', crossfire: 1 };
  const left = createChoreographyPreviewCue(settings, 0, () => 0.5);
  const right = createChoreographyPreviewCue(settings, 1, () => 0.5);
  assert.ok(left.choreography.launchX < 0);
  assert.ok(right.choreography.launchX > 0);
  assert.equal(left.choreography.crossLaunch, true);
  assert.equal(right.choreography.crossLaunch, true);
});

test('layout summary expands salvos into actual shell launches', () => {
  assert.deepEqual(
    summarizeCueLayouts([{ layout: 'single' }, { layout: 'pair' }, { layout: 'fan5' }, { layout: 'finale' }]),
    { single: 1, pair: 2, fan5: 5, finale: 13 },
  );
  assert.deepEqual(summarizeCueLayouts([{ layout: 'pair', choreography: { crossLaunch: true } }]), { pair: 4 });
});

test('cue preset lookup falls back safely', () => {
  assert.equal(getPresetForCue({ presetId: 'missing' }).id, 'gold-chrysanthemum');
  assert.equal(getPresetForCue({ presetId: 'heart' }).id, 'heart');
});
