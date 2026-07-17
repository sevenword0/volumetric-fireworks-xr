import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html', 'package.json', 'vite.config.js', 'public/.nojekyll',
  'src/main.js', 'src/style.css', 'src/core/bokeh-response.js', 'src/core/clipboard.js', 'src/core/focus-depth.js', 'src/core/particle-afterimage.js', 'src/core/ring-particles.js', 'src/core/trail-particles.js', 'src/core/water-surface.js', 'src/core/particle-load-guard.js', 'src/core/particle-load-planner.js', 'src/pyro/presets.js', 'src/pyro/patterns.js',
  'src/pyro/firework-engine.js', 'src/volume/fluid-volume.js', 'src/audio/audio-show.js', 'src/audio/show-choreography.js', 'src/audio/firework-sound.js',
  'src/ui/app-ui.js', 'src/ui/xr-cube-ui.js', 'src/scene/world.js',
  '.github/workflows/pages.yml',
];

for (const file of required) await access(path.join(root, file));

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(full));
    else if (/\.(?:js|mjs|html|css|yml)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const files = [path.join(root, 'index.html'), ...await collect(path.join(root, 'src')), path.join(root, '.github/workflows/pages.yml')];
const forbidden = [
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\s*\(/, 'new Function()'],
  [/document\.write\s*\(/, 'document.write()'],
  [/innerHTML\s*=\s*(?!`\s*$)/, 'direct innerHTML assignment'],
  [/http:\/\//, 'insecure HTTP URL'],
];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) throw new Error(`${path.relative(root, file)} contains forbidden ${label}`);
  }
}

const html = await readFile(path.join(root, 'index.html'), 'utf8');
for (const marker of ['id="stage"', 'id="welcome-dialog"', 'id="audio-input"', 'id="audio-timeline"', 'id="show-timeline-seek"', 'id="restart-show"', 'id="xr-button"', 'id="launch-button"', 'id="camera-view"', 'id="camera-fov"', 'id="floor-grid-toggle"', 'id="drag"', 'id="particle-lifetime"', 'id="ring-particle-scale"', 'id="trail-particle-scale"', 'id="initial-launch-power"', 'id="launch-center-x"', 'id="launch-position-range"', 'id="firework-brightness"', 'id="particle-afterimage"', 'id="dof-toggle"', 'id="bokeh-gamma"', 'id="bokeh-samples"', 'id="music-volume"', 'id="show-choreography"', 'id="show-direction"', 'id="preview-show"', 'id="show-launch-power"', 'id="show-explosion-power"', 'id="show-sequence"', 'id="show-crossfire"', 'id="show-color-variation"', 'id="predictive-load-toggle"', 'id="optimization-status"', 'id="optimize-particles"', 'id="optimize-resolution"', 'id="optimize-volume"', 'id="optimize-lighting"', 'id="optimize-post"', 'id="ui-visibility-button"', 'id="settings-copy-button"', 'id="fullscreen-button"']) {
  if (!html.includes(marker)) throw new Error(`index.html missing ${marker}`);
}

const workflow = await readFile(path.join(root, '.github/workflows/pages.yml'), 'utf8');
for (const action of ['actions/checkout@v7', 'actions/setup-node@v7', 'actions/configure-pages@v6', 'actions/upload-pages-artifact@v5', 'actions/deploy-pages@v5']) {
  if (!workflow.includes(action)) throw new Error(`Pages workflow missing ${action}`);
}

console.log(`source check passed (${files.length} files, ${required.length} required artifacts)`);
