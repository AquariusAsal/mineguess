'use strict';
// Einheitliche Item-Darstellung (mg-iso.js): jedes Item mit Modelltyp hat Katalogeintrag mit DE und EN Namen und vorhandener Textur;
// Namensmuster (DE und EN) liefern denselben Modelltyp wie models.json.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/mc/craft-items.json'), 'utf8'));
const models = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/mc/models.json'), 'utf8')).items;
const src = fs.readFileSync(path.join(ROOT, 'mg-iso.js'), 'utf8');
const m = /var PATTERNS = (\[[\s\S]*?\]);\s*\r?\n/.exec(src);
const PATTERNS = eval(m[1]);   // eslint-disable-line no-eval
function typeOf(label) { for (const [re, t] of PATTERNS) if (re.test(label)) return t; return 'cube'; }
const NORM = { slab: 'slab_bottom' };
test('Katalog: Items mit Modelltyp haben DE, EN und Textur', () => {
  let n = 0;
  for (const it of cat) {
    const e = models[it.key]; if (!e) continue; n++;
    assert.ok(it.de && it.en, it.key);
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/mc', String(it.icon).replace(/\.png$/, '') + '.png')), 'Textur ' + it.key);
  }
  assert.ok(n > 100);
});
test('Namensmuster DE und EN ergeben denselben Modelltyp wie models.json', () => {
  let ok = 0;
  for (const it of cat) {
    const e = models[it.key]; if (!e || e.m === 'cube') continue;
    const want = NORM[e.m] || e.m, de = typeOf(it.de), en = typeOf(it.en);
    if (de === want && en === want) ok++;
    else assert.ok(de === want || en === want, it.key + ' ' + it.de + '/' + it.en + ' -> ' + de + '/' + en + ' erwartet ' + want);
  }
  assert.ok(ok > 50);
});
