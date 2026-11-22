const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { startServer, post } = require('./helpers.js');
const qs = require('../questions.json');
const enFile = require('../questions.en.json');
const MGAnswer = require('../answer-check.js');
const EN = enFile.q;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('EN: jede Frage hat einen Eintrag (Objekt oder null), IDs identisch, Kategorien uebersetzt', () => {
  assert.strictEqual(enFile.v, 1);
  qs.forEach(q => { assert.ok(Object.prototype.hasOwnProperty.call(EN, q.id), 'Eintrag fehlt: ' + q.id); assert.ok(EN[q.id] === null || typeof EN[q.id] === 'object'); });
  assert.strictEqual(Object.keys(EN).length, qs.length);
  new Set(qs.map(q => q.category)).forEach(c => assert.ok(enFile.categories[c], 'Kategorie ohne EN: ' + c));
  const have = Object.values(EN).filter(Boolean).length;
  assert.ok(have >= 3800, 'Fragen mit en: ' + have);
});

test('EN: Antworten gueltig (deutsche UND englische Schreibweise), Optionen index-gleich, Zahlen unveraendert', () => {
  for (const q of qs) {
    const e = EN[q.id]; if (!e) continue;
    assert.ok(typeof e.question === 'string' && e.question.length > 8, 'Fragetext ' + q.id);
    if (q.type === 'number') { assert.ok(MGAnswer.check(Object.assign({}, q, { en: e }), String(q.answer)).correct, 'Zahl ' + q.id); continue; }
    assert.ok(e.answer && Array.isArray(e.acceptedAnswers) && e.acceptedAnswers.length, 'Antwort ' + q.id);
    const qe = Object.assign({}, q, { en: e });
    assert.ok(MGAnswer.check(qe, e.answer).correct, 'EN-Antwort ' + q.id); assert.ok(MGAnswer.check(qe, q.answer).correct, 'DE-Antwort ' + q.id);
    if (q.choices) {
      assert.ok(Array.isArray(e.choices) && e.choices.length === q.choices.length, 'Optionen ' + q.id);
      assert.strictEqual(e.choices.indexOf(e.answer), q.choices.indexOf(q.answer), 'Optionen nicht index-gleich ' + q.id);
      assert.ok(MGAnswer.choiceOk(qe, e.answer) && MGAnswer.choiceOk(qe, q.answer) && !MGAnswer.choiceOk(qe, 'Voellig anders'));
    }
  }
});

test('EN: kein deutscher Rest in englischen Texten, Einheiten im Singular bei 1', () => {
  const DE_WORDS = /\b(der|das|und|ist|nicht|mit|für|ein|eine|wie|welche[rsmn]?|wird|werden|bei|oder|auf|zum|zur|dem|den|nur)\b/i;
  for (const q of qs) {
    const e = EN[q.id]; if (!e) continue;
    const texts = [e.question, e.funFact || '', e.answer || '', ...(e.choices || []), ...(e.acceptedAnswers || [])];
    texts.forEach(t => { assert.ok(!/[äöüß]/i.test(t), 'Umlaut in EN ' + q.id + ': ' + t); assert.ok(!DE_WORDS.test(t.replace(/“[^”]*”/g, '')), 'deutsches Wort in EN ' + q.id + ': ' + t); });
    if (q.type === 'number' && Number(q.answer) === 1 && e.unit) assert.ok(!/(items|blocks|slots|hunger points)$/.test(e.unit), 'Einheit Plural bei 1: ' + q.id);
  }
});

test('EN: answers.en.json enthaelt englische Namen, die auf deutsche Namen zurueckfuehren', () => {
  const a = require('../assets/mc/answers.en.json'), de = require('../assets/mc/answers.json');
  assert.ok(a.names.length > 600); Object.keys(a.toEn).forEach(d => assert.ok(de.names.includes(d), d));
  assert.strictEqual(a.toEn['Spitzhacke'], 'Pickaxe'); assert.ok(a.names.includes('Diamond Pickaxe') || a.names.includes('Iron Pickaxe'));
});

test('EN: Ranked und Multiplayer liefern englischen Anzeigetext, nehmen englische Antworten an und verraten nichts', async () => {
  const S = await startServer({ MP_TEST_FAST: '1' });
  try {
    let hit = null;
    for (let i = 0; i < 60 && !hit; i++) {
      const st = await post(S.url + '/api/ranked/start', { gid: 'en_' + Date.now() + '_' + i + 'abcdefgh', name: 'EN' + i });
      const nx = await post(S.url + '/api/ranked/next', { runId: st.body.runId });
      const pq = nx.body.question; const q = pq && qs.find(x => x.id === pq.id);
      if (q && q.type === 'entity' && EN[q.id] && pq.mode === 'guess') hit = { runId: st.body.runId, pq, q };
    }
    assert.ok(hit, 'keine EN-Entity-Frage gefunden');
    assert.strictEqual(hit.pq.en.question, EN[hit.q.id].question);
    assert.ok(!JSON.stringify(hit.pq).includes(EN[hit.q.id].funFact || '@@') && hit.pq.en.answer === undefined && hit.pq.en.funFact === undefined, 'EN-Anzeige verraet etwas');
    await wait(500);
    const r = await post(S.url + '/api/ranked/answer', { runId: hit.runId, answer: EN[hit.q.id].answer });
    assert.strictEqual(r.body.final, true); assert.strictEqual(r.body.correct, true, 'englische Antwort abgelehnt');
    assert.strictEqual(r.body.en.answer, EN[hit.q.id].answer);
  } finally { S.stop(); }
});

test('EN: alle Crafting-Raetsel tragen den offiziellen englischen Ergebnisnamen (Bau-Titel, Overlay, Rundenuebersicht) und answers.en.json kennt ihn', () => {
  const enPath = path.join(__dirname, '..', '..', 'mineguess-cache', 'en_us.json');
  if (!fs.existsSync(enPath)) return;           // Cache (minecraft-data) liegt ausserhalb des Repos
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const ae = require('../assets/mc/answers.en.json');
  const craft = qs.filter(q => q.type === 'crafting'); assert.ok(craft.length >= 430);
  for (const q of craft) {
    const name = en['item.minecraft.' + q.resultKey] || en['block.minecraft.' + q.resultKey];
    assert.ok(EN[q.id] && EN[q.id].answer === name, 'Crafting-EN ' + q.id + ' ' + q.resultKey);
    assert.ok(EN[q.id].acceptedAnswers.includes(name));
    assert.strictEqual(ae.toEn[q.answer], name, 'answers.en.json ' + q.answer);
    assert.ok(MGAnswer.check(Object.assign({}, q, { en: EN[q.id] }), name).correct);
  }
});
