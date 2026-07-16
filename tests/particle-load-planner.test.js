import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleLoadPlanner, estimateParticleLoad, expandLaunchLoadEvents } from '../src/core/particle-load-planner.js';
import { FIREWORK_PRESETS } from '../src/pyro/presets.js';

const brocade = FIREWORK_PRESETS.find((preset) => preset.id === 'brocade-crown');
const mine = FIREWORK_PRESETS.find((preset) => preset.id === 'fan-mine');

test('load estimation includes trails and launch layout multiplicity', () => {
  const estimate = estimateParticleLoad(brocade, 1);
  const single = expandLaunchLoadEvents(brocade, 'single', 4);
  const finale = expandLaunchLoadEvents(brocade, 'finale', 4);
  assert.ok(estimate > brocade.count);
  assert.equal(single.length, 1);
  assert.equal(finale.length, 13);
  assert.ok(single[0].time > 4);
});

test('immediate ground effects are forecast at launch time', () => {
  const events = expandLaunchLoadEvents(mine, 'single', 3.5, { delay: 0.25 });
  assert.equal(events.length, 1);
  assert.equal(events[0].time, 3.75);
});

test('cross salvos, sequential delay, and explosion power are included in load planning', () => {
  const normal = expandLaunchLoadEvents(brocade, 'pair', 2, { scale: 1 });
  const choreographed = expandLaunchLoadEvents(brocade, 'pair', 2, {
    scale: 1,
    explosionPower: 1.4,
    sequenceDelay: 0.1,
    crossLaunch: true,
  });
  assert.equal(normal.length, 2);
  assert.equal(choreographed.length, 4);
  assert.ok(choreographed[1].time > choreographed[0].time);
  assert.ok(choreographed[2].time > choreographed[1].time);
  assert.ok(choreographed[0].load > normal[0].load);
});

test('music cues are precomputed into high-load timeline windows', () => {
  const planner = new ParticleLoadPlanner({ capacity: 4000 });
  const plan = planner.planShow([
    { time: 0, presetId: brocade.id, layout: 'finale', energy: 1.2 },
    { time: 0.7, presetId: brocade.id, layout: 'finale', energy: 1.2 },
  ], (presetId) => FIREWORK_PRESETS.find((preset) => preset.id === presetId));
  assert.equal(plan.eventCount, 26);
  assert.ok(plan.windowCount > 0);
  assert.ok(plan.windows.some((window) => window.level === 3));

  const forecast = planner.forecast({ engineTime: 0, audioTime: 0, showPlaying: true });
  assert.equal(forecast.level, 3);
  assert.equal(forecast.source, 'show');
  assert.ok(forecast.peakIn <= 2.4);
});

test('music cue choreography doubles mirrored salvo events before playback', () => {
  const planner = new ParticleLoadPlanner({ capacity: 8000 });
  const plan = planner.planShow([
    {
      time: 0,
      presetId: brocade.id,
      layout: 'fan5',
      energy: 1,
      choreography: { explosionPower: 1.25, sequenceDelay: 0.08, crossLaunch: true },
    },
  ], (presetId) => FIREWORK_PRESETS.find((preset) => preset.id === presetId));
  assert.equal(plan.eventCount, 10);
  assert.ok(planner.showEvents[5].time > planner.showEvents[4].time);
});

test('manual launch plan protects the fuse window and expires afterward', () => {
  const planner = new ParticleLoadPlanner({ capacity: 4000 });
  planner.scheduleLaunch(brocade, 'finale', 10);
  const imminent = planner.forecast({ engineTime: 10 });
  assert.equal(imminent.level, 3);
  assert.equal(imminent.source, 'manual');
  assert.ok(imminent.predictedParticles > 4000);

  const expired = planner.forecast({ engineTime: 30 });
  assert.equal(expired.level, 0);
  assert.equal(expired.predictedParticles, 0);
});
