const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const MGAnswer = require('../answer-check.js');
const root = path.join(__dirname, '..');
const qs = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));

test('Fragen: Pflichtfelder und eindeutige IDs', () => {
  const ids = new Set();
  qs.forEach(q => {
    assert.ok(Number.isInteger(q.id), 'id');
    assert.ok(!ids.has(q.id), 'doppelte id ' + q.id); ids.add(q.id);
    assert.ok(['number', 'entity', 'crafting'].includes(q.type), 'Typ ' + q.id);
    assert.ok(typeof q.question === 'string' && q.question.length > 3, 'Text ' + q.id);
    assert.ok(typeof q.category === 'string' && q.category, 'Kategorie ' + q.id);
    if (q.type === 'number') assert.ok(typeof q.answer === 'number' && isFinite(q.answer), 'Zahl ' + q.id);
    else assert.ok(typeof q.answer === 'string' && q.answer, 'Antwort ' + q.id);
    if (q.rating !== undefined) assert.ok(q.rating >= 400 && q.rating <= 3900 && [1, 2, 3, 4].includes(q.tier), 'Rating ' + q.id);
  });
});
test('Fragen: keine doppelte Frage mit gleichem Text und gleicher Antwort', () => {
  const seen = new Map();
  qs.filter(q => q.type !== 'crafting').forEach(q => {
    const k = MGAnswer.normText(q.question) + '|' + String(q.answer);
    assert.ok(!seen.has(k), 'Dublette: ' + q.id + ' / ' + seen.get(k));
    seen.set(k, q.id);
  });
});
test('Fragen: jede Antwort ist per answer-check loesbar', () => {
  qs.forEach(q => assert.ok(MGAnswer.check(q, q.type === 'number' ? String(q.answer) : q.answer).correct, 'unloesbar ' + q.id));
});
test('Fragen: choices sind genau zwei Optionen inklusive Antwort', () => {
  qs.filter(q => q.choices).forEach(q => {
    assert.strictEqual(q.choices.length, 2, 'choices ' + q.id);
    assert.ok(q.choices.some(c => MGAnswer.normText(c) === MGAnswer.normText(q.answer)), 'Antwort fehlt in choices ' + q.id);
  });
});
test('Fragen: crafting gueltig, eindeutig, Icons vorhanden', () => {
  const icons = JSON.parse(fs.readFileSync(path.join(root, 'assets/mc/icons.json'), 'utf8'));
  const ing = JSON.parse(fs.readFileSync(path.join(root, 'assets/mc/ingredient-icons.json'), 'utf8'));
  const sigs = new Map();
  const cr = qs.filter(q => q.type === 'crafting');
  assert.ok(cr.length >= 100, 'zu wenige Crafting-Raetsel');
  cr.forEach(q => {
    assert.ok(Array.isArray(q.grid) && q.grid.length === 3 && q.grid.every(r => r.length === 3), 'Raster ' + q.id);
    const cells = q.grid.flat().filter(Boolean);
    assert.ok(cells.length >= 2, 'Zutaten ' + q.id);
    const sig = q.shapeless ? 'S' + [...cells].sort().join(',') : 'G' + JSON.stringify(q.grid);
    assert.ok(!sigs.has(sig) || sigs.get(sig) === q.answer, 'gleiches Raster, anderes Ergebnis ' + q.id);
    sigs.set(sig, q.answer);
    assert.ok(icons[q.answer], 'Ergebnis-Icon ' + q.answer);
    new Set(cells).forEach(k => assert.ok(ing[k] && ing[k].icon, 'Zutaten-Icon ' + k));
  });
});

test('Dropdown: jede Entity-/Crafting-Antwort steht (oder ein akzeptiertes Alias) in assets/mc/answers.json', () => {
  // Vergleich ueber die Normalform (Bindestrich/Gross-Klein egal: "Enderdrache" = Dropdown-Eintrag "Ender-Drache", beides wird akzeptiert)
  const names = new Set(JSON.parse(fs.readFileSync(path.join(root, 'assets/mc/answers.json'), 'utf8')).names.map(MGAnswer.normText));
  const inList = (x) => names.has(MGAnswer.normText(x));
  const miss = qs.filter(q => (q.type === 'entity' || q.type === 'crafting') && !q.choices && !inList(q.answer) && !(q.acceptedAnswers || []).some(inList)).map(q => q.id + ':' + q.answer);
  assert.deepStrictEqual(miss, []);
});
