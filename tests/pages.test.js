const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const PAGES = ['index.html', 'game.html', 'multiplayer.html', 'impressum.html', 'datenschutz.html'].filter(f => fs.existsSync(path.join(root, f)));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Inline-Skripte einer Seite (ohne src, ohne type=module/json/importmap)
function inlineScripts(html) {
  const out = []; const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const t = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    if (t && !/javascript|text\/babel/i.test(t[1]) && t[1].toLowerCase() === 'module') continue;
    if (t && /json|importmap|template|text\/x-/i.test(t[1])) continue;
    out.push(m[2]);
  }
  return out;
}
// Lokale Referenzen: [{tag, url}] fuer script/link/img/source/video/audio
function refs(html) {
  // Inline-Skripte/Styles enthalten Vorlagen-Strings (z. B. <img src="..' + tex + '..">), keine echten Referenzen
  html = html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, (s, attrs) => (/\bsrc\s*=/.test(attrs) ? '<script' + attrs + '></script>' : '')).replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const out = []; const re = /<(script|link|img|source|video|audio|iframe)\b([^>]*)>/gi; let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase(), a = m[2];
    const g = (n) => { const x = new RegExp('\\b' + n + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(a); return x ? (x[2] !== undefined ? x[2] : x[3]) : null; };
    const url = tag === 'link' ? g('href') : g('src');
    if (!url || /^(https?:|\/\/|data:|mailto:|tel:|javascript:|#|blob:)/i.test(url) || url.endsWith('/') || /^\/?socket\.io\//.test(url)) continue;   // socket.io/socket.io.js liefert der Server selbst
    out.push({ tag, rel: (g('rel') || '').toLowerCase(), url: url.replace(/[?#].*$/, '').replace(/^\.?\//, '') });
  }
  return out;
}
const swAssets = (() => {
  const sw = read('sw.js'), a = sw.indexOf('const ASSETS = ['), b = sw.indexOf(']', a);
  return new Set([...sw.slice(a, b).matchAll(/["'](\/[^"']*)["']/g)].map(m => m[1]));
})();

test('Seiten: alle Inline-Skripte sind syntaktisch gueltig (await ausserhalb von async, Klammerfehler = leere Seite)', () => {
  assert.ok(PAGES.includes('game.html') && PAGES.includes('multiplayer.html') && PAGES.includes('index.html'));
  let total = 0;
  for (const f of PAGES) {
    inlineScripts(read(f)).forEach((code, i) => {
      total++;
      assert.doesNotThrow(() => new vm.Script(code, { filename: f + '#script' + (i + 1) }), `${f} Inline-Skript ${i + 1}`);   // wie ein klassisches Browser-Skript, nichts wird ausgefuehrt
    });
  }
  assert.ok(total >= 3);
});

test('JS-Dateien: alle lokalen Skripte (Root, lib, tools, tests) bestehen den Syntax-Check', () => {
  const files = [];
  const add = (dir, rel) => fs.readdirSync(path.join(root, dir)).filter(f => /[.]js$/.test(f)).forEach(f => files.push(path.join(dir, f)));
  add('.'); ['lib', 'tools', 'tests'].forEach(d => fs.existsSync(path.join(root, d)) && add(d));
  assert.ok(files.length > 30);
  for (const f of files) {
    let code = fs.readFileSync(path.join(root, f), 'utf8').replace(/^#!.*\n/, '');
    // CommonJS-Module (require/module/exports) werden wie in Node in eine Funktion gepackt, Browser-Skripte unveraendert geprueft
    const isNode = /\b(require|module\.exports)\b/.test(code) && !/typeof module\s*!==?\s*['"]undefined['"]/.test(code) || /^(lib|tools|tests)[\\/]/.test(f) || f === 'server.js';
    const src = isNode ? '(function (exports, require, module, __filename, __dirname) {' + code + '\n})' : code;
    assert.doesNotThrow(() => new vm.Script(src, { filename: f }), f);
  }
});

test('Seiten: alle lokal referenzierten script/link/img/source-Dateien existieren', () => {
  for (const f of PAGES) {
    for (const r of refs(read(f))) assert.ok(fs.existsSync(path.join(root, r.url)), `${f}: ${r.tag} ${r.url} fehlt`);
  }
});

// firebase-config.js wird bewusst nicht gecacht (sw.js umgeht es; die Seite hat einen onerror-Fallback)
const NOT_CACHED = new Set(['/firebase-config.js']);

test('Seiten: referenzierte Skripte und Stylesheets stehen im Service-Worker-Cache (sw.js ASSETS), Bilder dort oder unter assets/', () => {
  for (const f of ['index.html', 'game.html', 'multiplayer.html']) {
    for (const r of refs(read(f))) {
      const url = '/' + r.url;
      if (NOT_CACHED.has(url)) continue;
      if (r.tag === 'script' || (r.tag === 'link' && /stylesheet|manifest|icon/.test(r.rel))) assert.ok(swAssets.has(url), `${f}: ${r.tag} ${url} fehlt in sw.js ASSETS (gen-sw-assets ausfuehren)`);
      else if (r.tag === 'img') assert.ok(swAssets.has(url) || /^\/assets\//.test(url), `${f}: Bild ${url} weder im Cache noch unter assets/`);
    }
  }
  assert.ok(swAssets.has('/') && swAssets.has('/index.html') && swAssets.has('/game.html') && swAssets.has('/multiplayer.html'));
  assert.ok(![...swAssets].some(p => /admin|server\.js|\/lib\/|\/data\//.test(p)), 'nicht-oeffentliche Dateien im Cache');
});

test('Seiten: jede Seite hat Titel, Sprache und Viewport', () => {
  for (const f of PAGES) {
    const h = read(f);
    assert.match(h, /<title>[^<]{3,}<\/title>/i, f + ' ohne Titel'); assert.match(h, /<html[^>]*\blang=/i, f + ' ohne lang'); assert.match(h, /name=["']viewport["']/i, f + ' ohne Viewport');
  }
});
