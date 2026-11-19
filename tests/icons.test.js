const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const PNG = require('../tools/png.js');
const MC = path.join(__dirname, '..', 'assets', 'mc');
const J = (f) => JSON.parse(fs.readFileSync(path.join(MC, f), 'utf8'));
const icons = J('icons.json'), ing = J('ingredient-icons.json'), cat = J('craft-items.json');
const png = (rel) => (/[.]png$/.test(rel) ? rel : rel + '.png');

test('Icons: jede Datei aus icons.json, ingredient-icons.json und craft-items.json existiert und ist lesbar', () => {
  const files = new Set([...Object.values(icons), ...Object.values(ing).map(v => v.icon), ...cat.map(i => i.icon)].map(png));
  files.forEach(f => {
    const p = path.join(MC, f);
    assert.ok(fs.existsSync(p), 'fehlt: ' + f);
    assert.doesNotThrow(() => PNG.decode(fs.readFileSync(p)), 'nicht lesbar: ' + f);
  });
});

test('Icons: Lederruestung nutzt die eingefaerbte _dyed-Datei (braun statt grau)', () => {
  const names = { Lederkappe: 'helmet', Lederjacke: 'chestplate', Lederhose: 'leggings', Lederstiefel: 'boots', 'Lederner Rossharnisch': 'horse_armor' };
  Object.entries(names).forEach(([n, part]) => {
    assert.strictEqual(icons[n], `item/leather_${part}_dyed.png`, n);
    const img = PNG.decode(fs.readFileSync(path.join(MC, icons[n])));
    assert.strictEqual(img.w, 16); assert.strictEqual(img.h, 16);
    assert.ok(PNG.stats(img).sat > 0.25, n + ' ist noch grau');
    let r = 0, b = 0, c = 0;
    for (let i = 0; i < 256; i++) if (img.px[i * 4 + 3] > 128) { r += img.px[i * 4]; b += img.px[i * 4 + 2]; c++; }
    assert.ok(r / c > b / c, n + ' muss einen warmen/braunen Farbton haben');
  });
});

test('Icons: Traenke fallen nie auf emerald/barrier, Unsichtbarkeitstrank hat eine Trank-Textur', () => {
  Object.entries(icons).forEach(([k, v]) => {
    if (/trank$/i.test(k) || /^Trank /.test(k)) assert.ok(/potion/.test(v), k + ' -> ' + v);
    assert.ok(!/barrier[.]png$/.test(v), k + ' nutzt barrier');
  });
  assert.strictEqual(icons.Unsichtbarkeitstrank, 'item/potion_invisibility_dyed.png');
});

test('Icons: Biomfarben (Ranken) sind eingefaerbt, kein Zutaten-Icon ist barrier', () => {
  assert.strictEqual(ing.vine.icon, 'block/vine_dyed.png');
  Object.entries(ing).forEach(([k, v]) => assert.ok(!/barrier/.test(v.icon), 'Zutat ' + k));
  assert.ok(PNG.stats(PNG.decode(fs.readFileSync(path.join(MC, 'block/grass_block_top_dyed.png')))).sat > 0.3);
});

test('Icons: PNG-Codec Rundlauf (Encode/Decode, Tint, Over)', () => {
  const img = { w: 2, h: 1, px: new Uint8Array([255, 255, 255, 255, 10, 20, 30, 128]) };
  const back = PNG.decode(PNG.encode(img));
  assert.deepStrictEqual(Array.from(back.px), Array.from(img.px));
  assert.deepStrictEqual(Array.from(PNG.tint(img, '#808080').px.slice(0, 4)), [128, 128, 128, 255]);
  const o = PNG.over({ w: 1, h: 1, px: new Uint8Array([0, 0, 255, 255]) }, { w: 1, h: 1, px: new Uint8Array([255, 0, 0, 255]) });
  assert.deepStrictEqual(Array.from(o.px), [255, 0, 0, 255]);
});

test('Crafting: jedes Raetsel (auch jedes baubare) hat fuer sein Ergebnis ein vorhandenes, passendes Icon (kein Werkbank-/Barriere-Platzhalter)', () => {
  const qs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions.json'), 'utf8')).filter(q => q.type === 'crafting');
  const norm = (p) => p.replace(/^.*\//, '').replace(/[.]png$/, '').replace(/_(dyed|side|top|front|00)$/, '');
  assert.ok(qs.length >= 200);
  qs.forEach(q => {
    const g = icons[q.answer];
    assert.ok(g, 'kein Icon: ' + q.answer);
    assert.ok(fs.existsSync(path.join(MC, png(g))), 'Datei fehlt: ' + q.answer + ' -> ' + g);
    if (q.resultKey !== 'crafting_table') assert.ok(!/crafting_table_front|barrier/.test(g), 'Platzhalter: ' + q.answer + ' -> ' + g);
    assert.ok(q.resultKey, 'resultKey fehlt: ' + q.answer);
    const e = ing[q.resultKey] && ing[q.resultKey].icon, b = norm(g);
    // passend: gleiche Datei wie das Ergebnis-Item oder Dateiname und Schluessel gehoeren zusammen (z. B. oak_planks fuer oak_fence nur als bewusster Stellvertreter)
    assert.ok(g === e || b === q.resultKey || q.resultKey.includes(b) || b.includes(q.resultKey), 'passt nicht zum Ergebnis ' + q.resultKey + ': ' + q.answer + ' -> ' + g);
    assert.ok(e && fs.existsSync(path.join(MC, e)), 'Ergebnis-Item ohne Zutaten-Icon: ' + q.resultKey);
  });
});
