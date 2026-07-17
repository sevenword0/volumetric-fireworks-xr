import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BOKEH_RING_INNER_RADIUS,
  BOKEH_SHAPES,
  BOKEH_SHAPE_IDS,
  BOKEH_SHAPE_INDEX,
  bokehShapeIndex,
  getBokehShapeLabel,
  nextBokehShape,
  sampleBokehAperture,
  sanitizeBokehShape,
} from '../src/core/bokeh-shapes.js';

test('all seven requested bokeh apertures have stable ids, labels, and shader indexes', () => {
  assert.deepEqual(BOKEH_SHAPE_IDS, ['pentagon', 'hexagon', 'octagon', 'circle', 'ring', 'heart', 'star']);
  assert.deepEqual(BOKEH_SHAPES.map(({ label }) => label), ['오각', '육각', '팔각', '원', '링', '하트', '별']);
  assert.equal(new Set(Object.values(BOKEH_SHAPE_INDEX)).size, 7);
  assert.equal(bokehShapeIndex('circle'), 0);
  assert.equal(getBokehShapeLabel('heart'), '하트');
});

test('bokeh shape state falls back safely and cycles in display order', () => {
  assert.equal(sanitizeBokehShape('unsafe'), 'circle');
  assert.equal(bokehShapeIndex('unsafe'), BOKEH_SHAPE_INDEX.circle);
  assert.equal(nextBokehShape('circle'), 'ring');
  assert.equal(nextBokehShape('pentagon', -1), 'star');
  assert.equal(nextBokehShape('star'), 'pentagon');
});

test('all aperture samples remain finite and within the configured bokeh radius', () => {
  for (const shape of BOKEH_SHAPES) {
    for (let sample = 1; sample < 65; sample += 1) {
      const point = sampleBokehAperture(shape.id, sample, 65);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${shape.id} sample ${sample} must be finite`);
      assert.ok(Math.hypot(point.x, point.y) <= 1.000001, `${shape.id} sample ${sample} must stay inside the aperture radius`);
    }
  }
});

test('regular polygon kernels are distinct from the circular kernel', () => {
  const circle = sampleBokehAperture('circle', 51, 65);
  for (const shape of ['pentagon', 'hexagon', 'octagon']) {
    const polygon = sampleBokehAperture(shape, 51, 65);
    assert.ok(Math.hypot(polygon.x, polygon.y) < Math.hypot(circle.x, circle.y));
  }
  assert.notDeepEqual(sampleBokehAperture('pentagon', 51, 65), sampleBokehAperture('hexagon', 51, 65));
  assert.notDeepEqual(sampleBokehAperture('hexagon', 51, 65), sampleBokehAperture('octagon', 51, 65));
});

test('ring kernel keeps a real hollow center while reaching the outer edge', () => {
  const radii = Array.from({ length: 64 }, (_, index) => Math.hypot(...Object.values(sampleBokehAperture('ring', index + 1, 65))));
  assert.ok(Math.abs(Math.min(...radii) - BOKEH_RING_INNER_RADIUS) < 1e-12);
  assert.ok(Math.abs(Math.max(...radii) - 1) < 1e-12);
});

test('heart has separated upper lobes and a lower tip while star alternates deep and outer radii', () => {
  const heart = Array.from({ length: 512 }, (_, index) => sampleBokehAperture('heart', index + 1, 513));
  const upperLobe = heart.reduce((best, point) => point.y > best.y ? point : best, heart[0]);
  const upperCenter = heart.filter(({ x, y }) => Math.abs(x) < 0.08 && y > 0).reduce((best, point) => point.y > best.y ? point : best, { y: -Infinity });
  assert.ok(Math.abs(upperLobe.x) > 0.18, 'heart maximum should sit on one of two upper lobes');
  assert.ok(upperLobe.y - upperCenter.y > 0.15, 'heart center notch should be below its lobes');
  assert.ok(Math.min(...heart.map(({ y }) => y)) < -0.75, 'heart should taper to a lower point');

  const starRadii = Array.from({ length: 512 }, (_, index) => {
    const { x, y } = sampleBokehAperture('star', index + 1, 513);
    const discRadius = Math.sqrt((index + 1) / 512);
    return Math.hypot(x, y) / discRadius;
  });
  assert.ok(Math.max(...starRadii) > 0.98);
  assert.ok(Math.min(...starRadii) < 0.31);
});

test('desktop UI, XR cube, particle aperture, and WebGPU post effect share the same shape state', async () => {
  const [html, appUi, xrUi, main, engine, aperture, post] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/app-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/xr-cube-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pyro/firework-engine.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/core/bokeh-shape-nodes.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/core/post-effects.js', import.meta.url), 'utf8'),
  ]);
  for (const id of BOKEH_SHAPE_IDS) assert.match(html, new RegExp(`<option value="${id}"`));
  assert.match(appUi, /this\.store\.set\('quality\.bokehShape', value\)/);
  assert.match(xrUi, /getBokehShapeLabel\(this\.state\.quality\.bokehShape\)/);
  assert.match(xrUi, /this\.callbacks\.nextBokehShape/);
  assert.match(main, /bokehShapeAmount = uniform\(bokehShapeIndex\(state\.quality\.bokehShape\), 'int'\)/);
  assert.match(main, /canvas\.dataset\.bokehShapeKernel = 'uniformBranch'/);
  assert.match(engine, /uniform\(bokehShapeIndex\(state\.quality\?\.bokehShape\), 'int'\)/);
  assert.match(engine, /mix\(circleMask, apertureMask, apertureInfluence\)/);
  assert.match(aperture, /BOKEH_SHAPE_INDEX\.ring/);
  assert.match(aperture, /BOKEH_SHAPE_INDEX\.heart/);
  assert.match(aperture, /BOKEH_SHAPE_INDEX\.star/);
  assert.equal((post.match(/bokehSampleOffset\(sampleIndex, sampleCount, bokehShapeNode\)/g) ?? []).length, 2);
  assert.match(post, /select\(isRing, vec3\(0\), source\.rgb\)/);
  assert.match(post, /select\(isRing, sampleCount\.sub\(1\)\.max\(1\), sampleCount\)/);
});
