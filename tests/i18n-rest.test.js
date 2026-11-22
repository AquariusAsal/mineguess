'use strict';
// Statische Pruefung: deutsche Oberflaechentexte in den Seiten und mg-*.js brauchen einen Eintrag in i18n-en.json
// (exakt oder als Vorlage mit {} / {n}). Ausnahmen stehen in tests/i18n-rest.allow.json (bewusst deutsch: Eigennamen, Kategorie-Werte, Rechtstexte).
// Reine Texte ohne Umlaute und ohne typisch deutsche Funktionswoerter werden nicht geprueft (zu viele Fehlalarme).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n-en.json'), 'utf8'));
let allow = {};
try { allow = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-rest.allow.json'), 'utf8')); } catch (e) {}
const norm = s => s.replace(/\s+/g, ' ').trim();
const keys = new Set(Object.keys(dict).map(norm));
const tmpl = Object.keys(dict).filter(k => /\{n?\}/.test(k)).map(k => {
  const re = '^' + norm(k).split(/\{n?\}/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$';
  return new RegExp(re);
});
const DE = /[äöüÄÖÜß]|\b(der|die|das|und|nicht|dein|deine|du|mit|für|wie|oder|ist|bitte|keine|hast|dir|noch|alle|sind|wird|Wähle|Spieler|Runde|Antwort|Frage)\b/;
function known(s) { s = norm(s); return keys.has(s) || tmpl.some(r => r.test(s)) || !!allow[s]; }
function htmlTexts(html) {
  html = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const out = [];
  html.replace(/>([^<>]+)</g, (m, t) => { t = norm(t.replace(/&[a-z#0-9]+;/g, ' ')); if (t.length > 3 && DE.test(t)) out.push(t); return m; });
  html.replace(/\b(?:aria-label|title|placeholder|alt)="([^"]{3,})"/g, (m, t) => { if (DE.test(t)) out.push(norm(t)); return m; });
  return out;
}
function jsTexts(src) {
  const out = [];
  src.replace(/(?:'((?:[^'\\\n]|\\.){6,})'|"((?:[^"\\\n]|\\.){6,})")/g, (m, a, b) => {
    const t = norm((a || b).replace(/\\(.)/g, '$1'));
    if (/[<>{}=;]|\.(js|png|json|css|html)\b|^[#.\w-]+$|^(https?:|assets\/|\/|data:)/.test(t)) return m;
    if (DE.test(t) && /\s/.test(t)) out.push(t);
    return m;
  });
  return out;
}
test('deutsche Oberflaechentexte haben einen i18n-en-Eintrag (Meldung als Liste, bis die Luecken geschlossen sind)', () => {
  const miss = {};
  ['index.html', 'game.html', 'multiplayer.html'].forEach(f => htmlTexts(fs.readFileSync(path.join(ROOT, f), 'utf8')).forEach(t => { if (!known(t)) miss[t] = f; }));
  fs.readdirSync(ROOT).filter(f => /^mg-.*\.js$/.test(f) && f !== 'mg-i18n.js').forEach(f => jsTexts(fs.readFileSync(path.join(ROOT, f), 'utf8')).forEach(t => { if (!known(t)) miss[t] = f; }));
  const list = Object.keys(miss);
  const limit = Number((allow.__maxMissing) || 0);
  if (list.length > limit) console.log('Fehlende EN-Texte (' + list.length + '):\n' + list.slice(0, 80).map(t => ' - ' + miss[t] + ': ' + t.slice(0, 100)).join('\n'));
  assert.ok(list.length <= limit, list.length + ' deutsche Texte ohne EN-Eintrag (erlaubt: ' + limit + '), siehe Ausgabe');
});
