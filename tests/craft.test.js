const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const CraftCheck = require('../craft-check.js');
const root = path.join(__dirname, '..');
const qs = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8')).filter(q => q.type === 'crafting');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/mc/craft-items.json'), 'utf8'));
const byKey = new Map(catalog.map(i => [i.key, i]));
const find = (de) => { const q = qs.find(x => x.answer === de); assert.ok(q, 'Frage fehlt: ' + de); return q; };
const E = () => [[null, null, null], [null, null, null], [null, null, null]];
const shift = (grid, dr, dc) => { const g = E(); grid.forEach((row, r) => row.forEach((k, c) => { if (k) g[r + dr][c + dc] = k; })); return g; };
const mirror = (grid) => grid.map(row => row.slice().reverse());

test('Bau-Modus: Daten - jede baubare Frage hat Loesung, die ihr Raster akzeptiert, alle Schluessel im Katalog mit Icon', () => {
  const build = qs.filter(q => q.buildable);
  assert.ok(build.length >= 200, 'zu wenige baubare Raetsel: ' + build.length);
  build.forEach(q => {
    assert.ok(q.resultKey, 'resultKey ' + q.id);
    assert.ok(CraftCheck.matches(q, q.grid), 'Raster der Frage wird nicht akzeptiert: ' + q.answer);
    [q.solution, ...(q.solutionAlts || [])].forEach(sol => (sol.shapeless ? sol.items : sol.grid.flat()).filter(Boolean).forEach(list => list.forEach(k => {
      assert.ok(byKey.has(k), 'Katalog fehlt ' + k + ' (' + q.answer + ')');
      assert.ok(byKey.get(k).icon && !/barrier/.test(byKey.get(k).icon), 'Icon fehlt ' + k);
      assert.ok(fs.existsSync(path.join(root, 'assets/mc', byKey.get(k).icon + '.png')), 'Datei fehlt ' + byKey.get(k).icon);
    })));
  });
  assert.ok(catalog.length >= 300 && catalog.length <= 520, 'Katalog ' + catalog.length);
  catalog.forEach(i => { assert.ok(i.key && i.de && i.en && Array.isArray(i.aliases) && i.icon, 'Eintrag ' + i.key); });
});

test('Bau-Modus: kein Rezept wird von der Loesung einer anderen Frage akzeptiert (Eindeutigkeit)', () => {
  const build = qs.filter(q => q.buildable);
  const bad = [];
  build.forEach(a => build.forEach(b => { if (a.answer !== b.answer && CraftCheck.matches(a, b.grid)) bad.push(a.answer + ' <- ' + b.answer); }));
  assert.deepStrictEqual(bad, []);
});

test('Bau-Modus: typische Fehler sind falsch (fehlend, zusaetzlich, falsches Item, vertauscht)', () => {
  qs.filter(q => q.buildable).forEach(q => {
    const cells = [];
    q.grid.forEach((row, r) => row.forEach((k, c) => { if (k) cells.push([r, c, k]); }));
    // ein Slot fehlt
    const g1 = q.grid.map(r => r.slice()); g1[cells[0][0]][cells[0][1]] = null;
    assert.strictEqual(CraftCheck.matches(q, g1), false, 'fehlend ' + q.answer);
    // ein Slot ist ein Fremd-Item
    const g2 = q.grid.map(r => r.slice()); g2[cells[0][0]][cells[0][1]] = 'bedrock_unmoeglich';
    assert.strictEqual(CraftCheck.matches(q, g2), false, 'falsch ' + q.answer);
    // ein zusaetzliches Item
    const free = []; q.grid.forEach((row, r) => row.forEach((k, c) => { if (!k) free.push([r, c]); }));
    if (free.length) { const g3 = q.grid.map(r => r.slice()); g3[free[0][0]][free[0][1]] = cells[0][2]; assert.strictEqual(CraftCheck.matches(q, g3), false, 'zusaetzlich ' + q.answer); }
    assert.strictEqual(CraftCheck.matches(q, E()), false);
  });
});

test('Bau-Modus: Boot, Werkbank, Fackel, Truhe, Schere, Amboss, Komparator', () => {
  const boat = find('Eichenholzboot');
  assert.strictEqual(CraftCheck.matches(boat, boat.grid), true);
  assert.strictEqual(CraftCheck.matches(boat, shift(boat.grid, 1, 0)), true);          // 3x2 nach unten verschoben
  assert.strictEqual(CraftCheck.matches(boat, mirror(boat.grid)), true);
  const spruce = boat.grid.map(r => r.map(k => (k ? 'spruce_planks' : null)));
  assert.strictEqual(CraftCheck.matches(boat, spruce), false, 'Eichenholzboot verlangt Eichenbretter');

  const table = find('Werkbank');
  const t22 = E(); t22[1][1] = 'oak_planks'; t22[1][2] = 'birch_planks'; t22[2][1] = 'spruce_planks'; t22[2][2] = 'cherry_planks';   // 2x2 verschoben, gemischte Bretter
  assert.strictEqual(CraftCheck.matches(table, t22), true);
  const t23 = E(); t23[0][0] = 'oak_planks'; t23[0][1] = 'oak_planks'; t23[1][0] = 'oak_planks'; t23[1][1] = 'stone';
  assert.strictEqual(CraftCheck.matches(table, t23), false);

  const torch = find('Fackel');
  const tc = E(); tc[0][2] = 'charcoal'; tc[1][2] = 'stick';
  assert.strictEqual(CraftCheck.matches(torch, tc), true, 'Holzkohle statt Kohle, verschoben');
  const tc2 = E(); tc2[1][1] = 'stick'; tc2[2][1] = 'coal';
  assert.strictEqual(CraftCheck.matches(torch, tc2), false, 'Reihenfolge Stock/Kohle vertauscht');

  const chest = find('Truhe');
  const ring = E(); [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]].forEach(([r, c]) => { ring[r][c] = 'oak_planks'; });
  assert.strictEqual(CraftCheck.matches(chest, ring), true);
  ring[1][1] = 'oak_planks';
  assert.strictEqual(CraftCheck.matches(chest, ring), false, 'mit Item in der Mitte ist es keine Truhe');

  const shears = find('Schere');
  assert.strictEqual(CraftCheck.matches(shears, shears.grid), true);
  assert.strictEqual(CraftCheck.matches(shears, mirror(shears.grid)), true, 'Spiegelung');
  assert.strictEqual(CraftCheck.matches(shears, shift(shears.grid, 1, 1)), true);

  for (const n of ['Amboss', 'Redstone-Komparator']) {
    const q = find(n);
    assert.strictEqual(CraftCheck.matches(q, q.grid), true, n);
    const sw = q.grid.map(r => r.slice()); const cs = []; sw.forEach((r, i) => r.forEach((k, j) => { if (k) cs.push([i, j, k]); }));
    const a = cs.find(x => x[2] !== cs[0][2]);
    if (a) { sw[cs[0][0]][cs[0][1]] = a[2]; sw[a[0]][a[1]] = cs[0][2]; assert.strictEqual(CraftCheck.matches(q, sw), false, n + ' vertauscht'); }
  }
});

test('Bau-Modus: asymmetrische Rezepte duerfen gespiegelt werden (Axt, Hacke, Bogen, Angel)', () => {
  for (const n of ['Eisenaxt', 'Eisenhacke', 'Bogen', 'Angel']) {
    const q = find(n);
    assert.strictEqual(CraftCheck.matches(q, mirror(q.grid)), true, n);
  }
});

test('Bau-Modus: formlose Rezepte (Reihenfolge egal), zu viele/wenige Zutaten falsch', () => {
  const shapeless = qs.filter(q => q.buildable && q.solution.shapeless);
  assert.ok(shapeless.length >= 5);
  shapeless.forEach(q => {
    const keys = q.grid.flat().filter(Boolean);
    const g = E(); keys.slice().reverse().forEach((k, i) => { g[2 - Math.floor(i / 3)][2 - (i % 3)] = k; });
    assert.strictEqual(CraftCheck.matches(q, g), true, q.answer + ' rueckwaerts im Raster');
    const g2 = q.grid.map(r => r.slice()); const free = []; g2.forEach((row, r) => row.forEach((k, c) => { if (!k) free.push([r, c]); }));
    if (free.length) { g2[free[0][0]][free[0][1]] = keys[0]; assert.strictEqual(CraftCheck.matches(q, g2), false, q.answer + ' mit extra Zutat'); }
  });
});

test('Bau-Modus: diff liefert Anzahl und Zellen ohne die Loesung zu verraten, hint nennt einen richtigen Slot', () => {
  const torch = find('Fackel');
  const g = E(); g[0][0] = 'coal'; g[1][0] = 'bone';                                  // eine Zutat richtig, eine falsch
  const d = CraftCheck.diff(torch, g);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.correct, 1);
  assert.strictEqual(d.total, 2);
  assert.deepStrictEqual(d.cells[0][0], 'ok');
  assert.deepStrictEqual(d.cells[1][0], 'bad');
  assert.ok(!JSON.stringify(d).includes('stick'));
  const h = CraftCheck.hint(torch, g);
  assert.ok(h && Number.isInteger(h.r) && Number.isInteger(h.c) && h.key);
  g[h.r][h.c] = h.key;
  assert.ok(CraftCheck.diff(torch, g).correct >= 1);
  assert.strictEqual(CraftCheck.diff(torch, torch.grid).ok, true);
  assert.deepStrictEqual(CraftCheck.normalize(torch.grid).length, 2);
  assert.deepStrictEqual(CraftCheck.normalize(E()), []);
});

test('Bau-Modus: deutsche Suche (Umlaute, Teilwoerter, Aliase)', () => {
  const names = (t) => CraftCheck.search(catalog, t, 12).map(i => i.key);
  assert.ok(names('eichenholzbretter').includes('oak_planks'));
  assert.ok(names('Planken').includes('oak_planks'));
  assert.ok(names('bretter').includes('birch_planks'));
  assert.ok(names('stoecke').includes('stick') || names('Stöcke').includes('stick'));
  assert.ok(names('Bruchstein').includes('cobblestone'));
  assert.ok(names('KOHLE').includes('coal'));
  assert.ok(names('iron ingot').includes('iron_ingot'));
  assert.ok(names('redstone').includes('redstone'));
  assert.deepStrictEqual(names('   '), []);
  assert.deepStrictEqual(names('xyzqwv'), []);
});
