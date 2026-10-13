/**
 * Erzeugt die Asset-Listen in sw.js aus dem tatsächlichen Dateibestand und erhöht die Cache-Version.
 * Aufruf (im Projektordner): node tools/gen-sw-assets.js
 * Nur Steve/Alex-Skin werden vorgecacht (nur diese nutzt die UI standardmäßig); die übrigen
 * Standard-Skins werden bei Bedarf geladen und dann durch die Laufzeit-Strategie gecacht.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const swPath = path.join(root, 'sw.js');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push('/' + path.relative(root, p).split(path.sep).join('/'));
  }
  return out;
}

const KEEP_SKINS = new Set(['/assets/mc/entity/player/wide/steve.png', '/assets/mc/entity/player/slim/alex.png']);
const mc = walk(path.join(root, 'assets', 'mc'), [])
  .filter(f => !f.startsWith('/assets/mc/entity/player/') || KEEP_SKINS.has(f))
  .filter(f => /\.(png|svg|webp|jpg)$/i.test(f))
  .sort();

const rootCandidates = [
  '/', '/index.html', '/game.html', '/multiplayer.html', '/premium.html', '/impressum.html', '/datenschutz.html',
  '/mg.css', '/mg-audio.js', '/mg-spotify.js', '/spotify-config.js', '/mg-skin.js', '/mg-icons.js', '/mg-scene.js', '/mg-png.js', '/answer-check.js', '/ranked.js', '/sounds/bell.mp3', '/sounds/orb.mp3', '/sounds/totem.mp3', '/sounds/rare-achievement.mp3', '/sounds/anvil-drop.mp3', '/questions.json',
  '/multiplayer-config.js', '/logo-green.png', '/logo-transparent.png', '/logo-64.png', '/logo-128.png',
];
const rootFiles = rootCandidates.filter(f => f === '/' || fs.existsSync(path.join(root, f)));
const fonts = fs.existsSync(path.join(root, 'fonts'))
  ? fs.readdirSync(path.join(root, 'fonts')).filter(f => /\.woff2?$/i.test(f)).map(f => '/fonts/' + f).sort()
  : [];

let sw = fs.readFileSync(swPath, 'utf8');

// Cache-Version erhöhen
sw = sw.replace(/const CACHE = 'mineguess-v(\d+)';/, (m, n) => `const CACHE = 'mineguess-v${Number(n) + 1}';`);

// Feste Liste (zwischen Markern)
const assetsBlock = `// ASSETS_START (generiert von tools/gen-sw-assets.js)\nconst ASSETS = ${JSON.stringify([...rootFiles, ...fonts], null, 2)};\n// ASSETS_END`;
if (/\/\/ ASSETS_START[\s\S]*?\/\/ ASSETS_END/.test(sw)) {
  sw = sw.replace(/\/\/ ASSETS_START[\s\S]*?\/\/ ASSETS_END/, assetsBlock);
} else {
  sw = sw.replace(/const ASSETS = \[[\s\S]*?\];/, assetsBlock);
}

const mcBlock = `// ASSETS_MC_START (generiert aus assets/mc/ von tools/gen-sw-assets.js)\nconst ASSETS_MC = ${JSON.stringify(mc)};\n// ASSETS_MC_END`;
sw = sw.replace(/\/\/ ASSETS_MC_START[\s\S]*?\/\/ ASSETS_MC_END/, mcBlock);

fs.writeFileSync(swPath, sw);
const v = sw.match(/mineguess-v(\d+)/)[1];
console.log(`sw.js: Cache v${v}, ${rootFiles.length + fonts.length} Basisdateien, ${mc.length} Texturen`);
