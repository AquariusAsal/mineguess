'use strict';
// Ich-Ansicht (FPV) nur bei klassischen Frage-Antwort-Formaten: Matrix Format -> erlaubt (fpv-rules.js)
const test = require('node:test');
const assert = require('node:assert');
const { fpvAllowed, formatOf } = require('../fpv-rules.js');
const questions = require('../questions.json');

test('klassische Formate sind erlaubt', () => {
  assert.strictEqual(fpvAllowed({ type: 'number', question: 'x', answer: 3 }), true);
  assert.strictEqual(fpvAllowed({ type: 'entity', question: 'x', answer: 'Creeper' }), true);
  assert.strictEqual(fpvAllowed({ type: 'entity', question: 'x', answer: 'A', choices: ['A', 'B'] }), true);
  assert.strictEqual(fpvAllowed({ type: 'number', fmt: 'tf', choices: ['Wahr', 'Mythos'] }), true);
  assert.strictEqual(fpvAllowed({ fmt: 'tf', choices: ['Wahr', 'Mythos'] }), true);
  assert.strictEqual(fpvAllowed({ question: 'x', options: ['A', 'B'], type: 'entity' }), true);
});
test('Crafting (Raten und Bauen), Sonderformate und leere Eingaben sind gesperrt', () => {
  assert.strictEqual(fpvAllowed({ type: 'crafting', grid: [[null]] }), false);
  assert.strictEqual(fpvAllowed({ type: 'crafting', mode: 'build' }), false);
  assert.strictEqual(fpvAllowed({ mode: 'build', question: 'Baue' }), false);
  assert.strictEqual(fpvAllowed({ category: 'Crafting', grid: [[null]] }), false);
  assert.strictEqual(fpvAllowed({ type: 'pair', a: 1, b: 2 }), false);
  assert.strictEqual(fpvAllowed(null), false);
  assert.strictEqual(fpvAllowed(undefined), false);
  assert.strictEqual(fpvAllowed({}), false);
});
test('alle echten Fragen: Crafting nie erlaubt, andere Formate erlaubt', () => {
  let c = 0, a = 0;
  for (const q of questions) {
    const f = formatOf(q), ok = fpvAllowed(q);
    if (q.type === 'crafting' || q.grid || q.solution) { assert.strictEqual(ok, false, 'Crafting ' + q.id); c++; }
    else { assert.strictEqual(ok, true, f + ' ' + q.id); a++; }
  }
  assert.ok(c > 0 && a > 0);
});
