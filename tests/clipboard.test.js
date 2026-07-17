import test from 'node:test';
import assert from 'node:assert/strict';
import { copyTextToClipboard } from '../src/core/clipboard.js';

test('clipboard API receives the settings text unchanged', async () => {
  const writes = [];
  const method = await copyTextToClipboard('{"version":1}', {
    navigator: { clipboard: { writeText: async (value) => { writes.push(value); } } },
  });
  assert.equal(method, 'clipboard');
  assert.deepEqual(writes, ['{"version":1}']);
});

test('hidden textarea fallback copies and cleans up after clipboard rejection', async () => {
  const children = [];
  const field = {
    style: {},
    setAttribute() {},
    focus() { this.focused = true; },
    select() { this.selected = true; },
    remove() { children.splice(children.indexOf(this), 1); },
  };
  const document = {
    body: { appendChild: (node) => children.push(node) },
    createElement: () => field,
    execCommand: (command) => command === 'copy',
  };
  const method = await copyTextToClipboard('settings', {
    navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } },
    document,
  });
  assert.equal(method, 'execCommand');
  assert.equal(field.value, 'settings');
  assert.equal(field.focused, true);
  assert.equal(field.selected, true);
  assert.deepEqual(children, []);
});

test('clipboard copy rejects when neither supported path is available', async () => {
  await assert.rejects(() => copyTextToClipboard('settings', {}), /Clipboard copy is unavailable/);
});
