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

let onDemandList = [];
try { onDemandList = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'mc', 'ondemand.json'), 'utf8')); } catch (e) {}
const onDemand = new Set(onDemandList);
const KEEP_SKINS = new Set(['/assets/mc/entity/player/wide/steve.png', '/assets/mc/entity/player/slim/alex.png']);
const mc = walk(path.join(root, 'assets', 'mc'), [])
  .filter(f => !f.startsWith('/assets/mc/entity/player/') || KEEP_SKINS.has(f))
  .filter(f => /\.(png|svg|webp|jpg)$/i.test(f))
  .filter(f => !onDemand.has(f.replace('/assets/mc/', '')))   // per tools/fetch-icons.js geladene Icons nur on demand
  .sort();

const rootCandidates = [
  '/', '/index.html', '/game.html', '/multiplayer.html', '/impressum.html', '/datenschutz.html',
  '/mg.css', '/mg-audio.js', '/mg-spotify.js', '/spotify-config.js', '/mg-skin.js', '/mg-icons.js', '/mg-scene.js', '/mg-png.js', '/answer-check.js', '/ranked.js', '/mg-badges.js', '/mg-panorama.js', '/mg-craft.js', '/craft-check.js', '/pairs.js', '/pairs.json', '/modes.js', '/challenge.js', '/challenge-pool.json', '/mg-craft-build.js', '/mg-hl.js', '/mg-hand.js', '/mg-profile.js', '/mg-video.js', '/mg-settings.js', '/mg-tutorial.js', '/mg-report.js', '/mg-rounds.js', '/mg-social.js', '/mg-social2.js', '/mg-loader.js', '/mg-i18n.js', '/mg-iso.js', '/assets/mc/block-list.json', '/assets/mc/craft-items.json', '/i18n-en.json', '/mg-mp2.js', '/fonts/AtkinsonHyperlegible-Regular.ttf', '/fonts/AtkinsonHyperlegible-Bold.ttf', '/mg-ranklist.js', '/assets/ui/buch.png', '/sounds/bell.mp3', '/sounds/orb.mp3', '/sounds/totem.mp3', '/sounds/rare-achievement.mp3', '/sounds/anvil-drop.mp3', '/questions.json',
  '/multiplayer-config.js', '/manifest.webmanifest', '/assets/brand/og-image.png', '/facts.json', '/assets/brand/icon-192.png', '/assets/brand/icon-512.png', '/assets/brand/icon-maskable-512.png', '/assets/brand/apple-touch-icon.png', '/assets/brand/brand-64.png', '/assets/brand/brand-128.png', '/assets/brand/brand-192.png', '/assets/brand/brand-512.png', '/assets/brand/banner-600.png', '/assets/brand/banner-dark-44.png', '/assets/brand/banner-dark-60.png', '/assets/brand/banner-dark-88.png', '/assets/brand/banner-dark-120.png', '/assets/brand/banner-light-44.png', '/assets/brand/banner-light-60.png', '/assets/brand/banner-light-88.png', '/assets/brand/banner-light-120.png', '/assets/brand/favicon-16.png', '/assets/brand/favicon-32.png',
];
const rootFiles = rootCandidates.filter(f => f === '/' || fs.existsSync(path.join(root, f)));
// Video: nur Liste und Poster vorcachen (die mp4-Dateien nie)
const videoDir = path.join(root, 'assets', 'video');
const videoMeta = [];
if (fs.existsSync(path.join(videoDir, 'clips.json'))) videoMeta.push('/assets/video/clips.json');
if (fs.existsSync(path.join(videoDir, 'poster'))) fs.readdirSync(path.join(videoDir, 'poster')).filter(f => /\.webp$/i.test(f)).sort().forEach(f => videoMeta.push('/assets/video/poster/' + f));
const fonts = fs.existsSync(path.join(root, 'fonts'))
  ? fs.readdirSync(path.join(root, 'fonts')).filter(f => /\.woff2?$/i.test(f)).map(f => '/fonts/' + f).sort()
  : [];

let sw = fs.readFileSync(swPath, 'utf8');

// Cache-Version erhöhen
sw = sw.replace(/const CACHE = 'mineguess-v(\d+)';/, (m, n) => `const CACHE = 'mineguess-v${Number(n) + 1}';`);

// Feste Liste (zwischen Markern)
const assetsBlock = `// ASSETS_START (generiert von tools/gen-sw-assets.js)\nconst ASSETS = ${JSON.stringify([...rootFiles, ...fonts, ...videoMeta], null, 2)};\n// ASSETS_END`;
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
