/**
 * MineGuess - Pruefmodul fuer den Crafting-Bau-Modus (Browser: window.CraftCheck, Node: require).
 *
 * Frage (type 'crafting', buildable:true):
 *   solution = { shapeless:false, grid:[[ [keys]|null, x3 ], x3] }   Zelle = Liste erlaubter Item-Schluessel (Tags aufgeloest), null = leer
 *            | { shapeless:true,  items:[ [keys], ... ] }              jede Zutat = Liste erlaubter Schluessel, Reihenfolge egal
 * Spieler-Raster: 3x3-Array aus Item-Schluesseln oder null (Menge je Slot immer 1).
 *
 * Regeln (wie Minecraft Java): geformte Rezepte positionsunabhaengig im 3x3-Raster (leere Zeilen/Spalten werden abgeschnitten,
 * 2x2/1x3 duerfen verschoben werden) und waagerecht gespiegelt; formlose Rezepte in beliebiger Reihenfolge; Tag-Zutaten akzeptieren jedes
 * Mitglied der Liste, konkrete Zutaten genau ihren Schluessel.
 *
 *   matches(q, grid) -> bool
 *   diff(q, grid)    -> { ok, correct, total, extra, cells:[[ 'ok'|'bad'|'empty' ]x3]x3 }   (verraet die Loesung nicht)
 *   hint(q, grid)    -> { r, c, key } | null    ein fehlender/falscher Slot mit einem richtigen Item
 *   normalize(grid)  -> Raster ohne leere Randzeilen/-spalten (Array von Zeilen)
 *   search(items, text, limit) -> Katalogeintraege {key,de,en,aliases,icon}, sortiert nach Trefferguete
 */
(function (root) {
  'use strict';

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function emptyGrid() { return [[null, null, null], [null, null, null], [null, null, null]]; }
  function cell(grid, r, c) { var v = grid && grid[r] ? grid[r][c] : null; return v ? String(v) : null; }
  function count(grid) { var n = 0; for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) if (cell(grid, r, c)) n++; return n; }

  /** Leere Randzeilen/-spalten abschneiden. Rueckgabe: Array von Zeilen (kann leer sein). */
  function normalize(grid) {
    var rows = [0, 1, 2].map(function (r) { return [0, 1, 2].map(function (c) { return cell(grid, r, c); }); });
    var rs = rows.map(function (row) { return row.some(Boolean); });
    var cs = [0, 1, 2].map(function (c) { return rows.some(function (row) { return !!row[c]; }); });
    var r0 = rs.indexOf(true), r1 = rs.lastIndexOf(true), c0 = cs.indexOf(true), c1 = cs.lastIndexOf(true);
    if (r0 < 0) return [];
    return rows.slice(r0, r1 + 1).map(function (row) { return row.slice(c0, c1 + 1); });
  }

  function solShape(sol) {
    // geformte Loesung als Zellenliste {r,c,keys} im 3x3 plus abgeschnittene Groesse
    var cells = [], rmin = 9, rmax = -1, cmin = 9, cmax = -1;
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
      var k = sol.grid && sol.grid[r] ? sol.grid[r][c] : null;
      if (k && k.length) { cells.push({ r: r, c: c, keys: k }); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); cmin = Math.min(cmin, c); cmax = Math.max(cmax, c); }
    }
    return { cells: cells, h: rmax - rmin + 1, w: cmax - cmin + 1, r0: rmin, c0: cmin };
  }

  /** Alle Platzierungen (Versatz, ggf. gespiegelt) der geformten Loesung im 3x3-Raster. */
  function placements(sol) {
    var s = solShape(sol), out = [];
    if (!s.cells.length) return out;
    for (var mirror = 0; mirror < 2; mirror++) {
      for (var dr = 0; dr + s.h <= 3; dr++) for (var dc = 0; dc + s.w <= 3; dc++) {
        var m = {};
        s.cells.forEach(function (e) {
          var rr = e.r - s.r0 + dr;
          var cc = mirror ? (s.w - 1 - (e.c - s.c0)) + dc : e.c - s.c0 + dc;
          m[rr + ',' + cc] = e.keys;
        });
        out.push(m);
      }
    }
    return out;
  }

  function evalShaped(sol, grid) {
    var best = null;
    placements(sol).forEach(function (m) {
      var correct = 0, extra = 0, cells = [[], [], []];
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
        var k = cell(grid, r, c), want = m[r + ',' + c];
        if (k) {
          if (want && want.indexOf(k) >= 0) { correct++; cells[r][c] = 'ok'; }
          else { cells[r][c] = 'bad'; if (!want) extra++; }
        } else cells[r][c] = 'empty';
      }
      var total = Object.keys(m).length;
      var wrongPlaced = 0;
      for (var rr = 0; rr < 3; rr++) for (var cc = 0; cc < 3; cc++) if (cells[rr][cc] === 'bad') wrongPlaced++;
      var cand = { correct: correct, total: total, extra: extra, wrong: wrongPlaced, cells: cells, map: m };
      if (!best || cand.correct > best.correct || (cand.correct === best.correct && cand.wrong < best.wrong)) best = cand;
    });
    return best;
  }

  // Zuordnung Spieler-Items -> geforderte Zutaten (maximales bipartites Matching)
  function evalShapeless(sol, grid) {
    var reqs = sol.items || [], pos = [];
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) { var k = cell(grid, r, c); if (k) pos.push({ r: r, c: c, key: k }); }
    var matchReq = new Array(reqs.length).fill(-1);
    function tryAssign(pi, seen) {
      for (var ri = 0; ri < reqs.length; ri++) {
        if (seen[ri] || reqs[ri].indexOf(pos[pi].key) < 0) continue;
        seen[ri] = true;
        if (matchReq[ri] < 0 || tryAssign(matchReq[ri], seen)) { matchReq[ri] = pi; return true; }
      }
      return false;
    }
    var matched = 0;
    for (var pi = 0; pi < pos.length; pi++) if (tryAssign(pi, {})) matched++;
    var okPos = {};
    matchReq.forEach(function (pi) { if (pi >= 0) okPos[pi] = true; });
    var cells = [[], [], []];
    for (var r2 = 0; r2 < 3; r2++) for (var c2 = 0; c2 < 3; c2++) cells[r2][c2] = 'empty';
    pos.forEach(function (p, i) { cells[p.r][p.c] = okPos[i] ? 'ok' : 'bad'; });
    return { correct: matched, total: reqs.length, extra: Math.max(0, pos.length - reqs.length), wrong: pos.length - matched, cells: cells, matchReq: matchReq, pos: pos };
  }

  // Beste Auswertung ueber die Hauptloesung und weitere Rezeptformen (q.solutionAlts)
  function evaluate(q, grid) {
    if (!q || !q.solution) return null;
    var sols = [q.solution].concat(q.solutionAlts || []), best = null, n = count(grid);
    sols.forEach(function (sol) {
      var e = sol.shapeless ? evalShapeless(sol, grid) : evalShaped(sol, grid);
      if (!e) return;
      e.sol = sol;
      e.full = e.total > 0 && e.correct === e.total && e.wrong === 0 && n === e.total;
      if (!best || (e.full && !best.full) || (e.full === best.full && (e.correct / (e.total || 1)) > (best.correct / (best.total || 1)))) best = e;
    });
    return best;
  }

  function matches(q, grid) {
    var e = evaluate(q, grid);
    return !!e && e.total > 0 && e.correct === e.total && e.wrong === 0 && count(grid) === e.total;
  }

  function diff(q, grid) {
    var e = evaluate(q, grid);
    if (!e) return { ok: false, correct: 0, total: 0, extra: 0, cells: [['empty', 'empty', 'empty'], ['empty', 'empty', 'empty'], ['empty', 'empty', 'empty']] };
    var ok = e.total > 0 && e.correct === e.total && e.wrong === 0 && count(grid) === e.total;
    return { ok: ok, correct: e.correct, total: e.total, extra: e.extra, cells: e.cells };
  }

  /** Ein richtiges Item fuer einen fehlenden oder falsch belegten Slot. key = bevorzugter (erster) erlaubter Schluessel. */
  function hint(q, grid) {
    var e = evaluate(q, grid);
    if (!e) return null;
    var sol = e.sol;
    if (sol.shapeless) {
      var used = {};
      e.matchReq.forEach(function (pi, ri) { if (pi >= 0) used[ri] = true; });
      var missing = null;
      for (var ri = 0; ri < sol.items.length; ri++) if (!used[ri]) { missing = sol.items[ri]; break; }
      if (!missing) return null;
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) if (!cell(grid, r, c)) return { r: r, c: c, key: missing[0] };
      return null;
    }
    var m = e.map, wrongFirst = null, emptyFirst = null;
    Object.keys(m).sort().forEach(function (pos) {
      var rc = pos.split(','), r = +rc[0], c = +rc[1], k = cell(grid, r, c);
      if (!k && !emptyFirst) emptyFirst = { r: r, c: c, key: m[pos][0] };
      else if (k && m[pos].indexOf(k) < 0 && !wrongFirst) wrongFirst = { r: r, c: c, key: m[pos][0] };
    });
    return emptyFirst || wrongFirst;
  }

  /** Deutsche Suche: Umlaute/Gross-Klein egal, Teilwoerter, Aliase (DE/EN). Trefferguete: exakt > Anfang > Wortanfang > enthalten. */
  function search(items, text, limit) {
    var q = norm(text);
    if (!q) return [];
    var res = [];
    (items || []).forEach(function (it) {
      var names = [it.de, it.en].concat(it.aliases || []), best = 0;
      names.forEach(function (n, i) {
        var t = norm(n); if (!t) return;
        var sc = 0;
        if (t === q) sc = 100; else if (t.indexOf(q) === 0) sc = 80; else if (String(n).toLowerCase().split(/[^a-z0-9äöüß]+/).some(function (w) { return norm(w).indexOf(q) === 0; })) sc = 60; else if (t.indexOf(q) >= 0) sc = 40;
        if (sc && i >= 2) sc -= 5;                     // Aliase leicht hinter dem Namen
        if (sc > best) best = sc;
      });
      if (best) res.push({ it: it, sc: best - Math.min(10, String(it.de || '').length / 10) });
    });
    res.sort(function (a, b) { return b.sc - a.sc || String(a.it.de).localeCompare(String(b.it.de), 'de'); });
    var out = res.map(function (x) { return x.it; });
    return limit ? out.slice(0, limit) : out;
  }

  var api = { matches: matches, diff: diff, hint: hint, normalize: normalize, search: search, emptyGrid: emptyGrid, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CraftCheck = api;
})(typeof window !== 'undefined' ? window : this);
