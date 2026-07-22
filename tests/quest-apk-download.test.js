import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the original web app exposes the stable Quest APK download on the top bar and welcome panel', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const stableUrl = 'https://github.com/sevenword0/volumetric-fireworks-quest3/releases/latest/download/PyroverseXR-Quest3.apk';
  assert.match(html, /id="quest-apk-download"/);
  assert.match(html, /id="quest-apk-download-welcome"/);
  assert.equal(html.split(stableUrl).length - 1, 2);
});
