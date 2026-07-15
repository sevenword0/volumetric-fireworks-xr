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
