import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldScene } from '../src/scene/world.js';

function createWorldDouble() {
  const waterMaterial = { needsUpdate: false };
  const matteMaterial = { needsUpdate: false };
  return {
    state: { world: { floor: 'water', floorGrid: true } },
    renderer: { domElement: { dataset: {} } },
    floor: { visible: true, material: waterMaterial },
    grid: { visible: true },
    reflectionNode: { target: { visible: true } },
    waterMaterial,
    matteMaterial,
  };
}

test('floor grid visibility can be toggled and is published for diagnostics', () => {
  const world = createWorldDouble();
  assert.equal(WorldScene.prototype.setFloorGridVisible.call(world, false), false);
  assert.equal(world.state.world.floorGrid, false);
  assert.equal(world.grid.visible, false);
  assert.equal(world.renderer.domElement.dataset.floorGridVisible, 'false');
});

test('changing or hiding the floor does not override the independent grid setting', () => {
  const world = createWorldDouble();
  WorldScene.prototype.setFloorGridVisible.call(world, true);
  WorldScene.prototype.setFloorMode.call(world, 'none');
  assert.equal(world.floor.visible, false);
  assert.equal(world.reflectionNode.target.visible, false);
  assert.equal(world.grid.visible, true);
  assert.equal(world.state.world.floorGrid, true);
});
