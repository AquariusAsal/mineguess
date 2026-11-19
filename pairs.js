/**
 * MineGuess - Hoeher oder Tiefer: Paargenerator (Browser: window.MGPairs, Node: require).
 * Quelle: die datenbasierten Zahlenfragen aus questions.json (Vorlage `gen`, gleiche Einheit). Zwei Objekte derselben Vorlage und Einheit
 * werden verglichen: Karte A zeigt Name + Wert, bei Karte B soll geraten werden, ob ihr Wert HOEHER oder TIEFER ist.
 *
 * Regeln: gleiche Vorlage und Einheit, nie gleicher Wert, Verhaeltnis max/min >= 1,25 (Wert 0 gilt als unendlich), kein Wiederholen der
 * letzten Objekte, hoechstens 3 Runden in Folge dieselbe Vorlage, nur Objekte mit Icon (wenn Icons bekannt sind). Mit wachsender Serie
 * sinkt das hoechste erlaubte Verhaeltnis (Paare werden schwerer).
 *
 *   fromMeasures(json)              -> Pool aus pairs.json ({measures:[{id,label,unit,ask,items:[{id,name,value,icon}]}]}), Icons bereits geprueft
 *   buildPool(questions, icons?)    -> Pool aus questions.json; mit `icons` (z. B. icons.json: Name -> Pfad) nur Objekte mit Icon
 *   newState()                      -> { streak, best, lives, last, tplKey, run, recent:[ids], rounds }
 *   next(pool, state, rnd?)         -> { tpl:{key,label,unit,ask}, a:{id,name,value,text,icon}, b:{...}, higher:boolean (B hoeher als A), ratio, level }
 *   answer(pair, 'higher'|'lower')  -> { correct, higher }
 *   advance(state, pair, correct)   -> state (richtig: Serie+1, Bestserie; falsch: Serie 0, Leben-1; B wird naechste Karte A)
 *   level(streak)                   -> { minRatio, maxRatio }
 *   format(value, unit?)            -> deutsche Schreibweise ("3,5", "1 408")
 *   selfTest(questions, icons?)     -> Kurztext oder wirft einen Fehler
 * Pool-Form: { keys:[key], templates:{ key:{ key, gen, label, unit, ask, items:[{id,name,value,icon?}] } } }
 */
(function (root) {
  'use strict';

  var MIN_RATIO = 1.25;
  var LIVES = 3;
  var TEMPLATES = {
    block_haerte:     { label: 'Härte',                ask: 'Ist die Härte höher oder tiefer?' },
    block_resistance: { label: 'Explosionswiderstand', ask: 'Ist der Explosionswiderstand höher oder tiefer?' },
    food_points:      { label: 'Nahrungspunkte',       ask: 'Stellt es mehr oder weniger Nahrungspunkte wieder her?' },
    block_light:      { label: 'Lichtlevel',           ask: 'Ist das Lichtlevel höher oder tiefer?' },
    item_durability:  { label: 'Haltbarkeit',          ask: 'Ist die Haltbarkeit höher oder tiefer?' },
    mob_height:       { label: 'Höhe (Blöcke)',        ask: 'Ist der Mob höher oder niedriger?' },
    mob_width:        { label: 'Breite (Blöcke)',      ask: 'Ist der Mob breiter oder schmaler?' },
    item_stack:       { label: 'Stapelgröße',          ask: 'Ist die Stapelgröße höher oder tiefer?' }
  };

  function subject(q) {
    var m = /„([^“]+)“/.exec(q.question || '');
    return m ? m[1].trim() : '';
  }
  function distinctValues(items) { var s = {}; items.forEach(function (i) { s[i.value] = 1; }); return Object.keys(s).length; }
  function finish(templates, keys) {
    keys = keys.filter(function (k) { return templates[k].items.length >= 8 && distinctValues(templates[k].items) >= 4; });
    var out = {}; keys.forEach(function (k) { out[k] = templates[k]; });
    return { keys: keys, templates: out };
  }

  /** Pool aus questions.json. icons: Name -> Pfad; wenn angegeben, kommen nur Objekte mit Icon in den Pool (Item.icon = Pfad). */
  function buildPool(questions, icons) {
    var templates = {}, keys = [];
    (questions || []).forEach(function (q) {
      if (q.type !== 'number' || !TEMPLATES[q.gen] || typeof q.answer !== 'number' || !isFinite(q.answer) || q.answer < 0) return;
      var name = subject(q); if (!name) return;
      var key = q.gen + '|' + (q.unit || '');
      var t = templates[key];
      if (!t) { t = templates[key] = { key: key, gen: q.gen, label: TEMPLATES[q.gen].label, unit: q.unit || '', ask: TEMPLATES[q.gen].ask, items: [], seen: {}, bad: {} }; keys.push(key); }
      if (t.bad[name]) return;
      if (t.seen[name] !== undefined) { if (t.seen[name] !== q.answer) t.bad[name] = true; return; }
      t.seen[name] = q.answer;
      var it = { id: q.id, name: name, value: q.answer };
      if (icons) { var ic = icons[name]; if (!ic) return; it.icon = String(ic).replace(/[.]png$/, ''); }
      t.items.push(it);
    });
    keys.forEach(function (k) {
      var t = templates[k];
      t.items = t.items.filter(function (it) { return !t.bad[it.name]; });
      delete t.seen; delete t.bad;
    });
    return finish(templates, keys);
  }

  /** Pool aus pairs.json (tools/gen-pairs.js). Items mit icon werden bevorzugt: sind Icons vorhanden, werden Objekte ohne Icon verworfen. */
  function fromMeasures(json) {
    var templates = {}, keys = [];
    ((json && json.measures) || []).forEach(function (m) {
      var tpl = TEMPLATES[m.id] || {};
      var items = (m.items || []).filter(function (it) { return it && typeof it.value === 'number' && it.name && (!('icon' in it) || it.icon); });
      var key = m.id + '|' + (m.unit || '');
      templates[key] = { key: key, gen: m.id, label: m.label || tpl.label || m.id, unit: m.unit || '', ask: m.ask || tpl.ask || '', items: items };
      keys.push(key);
    });
    return finish(templates, keys);
  }

  function ratio(x, y) {
    var hi = Math.max(x, y), lo = Math.min(x, y);
    if (hi === lo) return 1;
    return lo === 0 ? Infinity : hi / lo;
  }
  /** Mit wachsender Serie sinkt das hoechste erlaubte Verhaeltnis (kleinere Unterschiede = schwerer). */
  function level(streak) {
    var s = Math.max(0, streak | 0);
    var max = s < 3 ? 8 : s < 6 ? 4 : s < 10 ? 3 : s < 15 ? 2.2 : s < 20 ? 1.7 : 1.4;
    return { minRatio: MIN_RATIO, maxRatio: max };
  }

  function format(v, unit) {
    var n = Number(v);
    var s = (Math.round(n * 1000) / 1000).toString().split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return s.join(',') + (unit ? ' ' + unit : '');
  }

  function newState() { return { streak: 0, best: 0, lives: LIVES, last: null, tplKey: null, run: 0, recent: [], rounds: 0 }; }

  function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }
  function mkCard(it, tpl) { var c = { id: it.id, name: it.name, value: it.value, text: format(it.value, tpl.unit) }; if (it.icon) c.icon = it.icon; return c; }

  function next(pool, state, rnd) {
    rnd = rnd || Math.random;
    var keys = pool.keys; if (!keys.length) throw new Error('keine Paare verfuegbar');
    var recent = state.recent;
    var key = state.tplKey;
    var switchNow = !key || state.run >= 3 || (state.run >= 2 && rnd() < 0.5);
    if (switchNow) {
      var others = keys.filter(function (k) { return k !== key; });
      key = pick(others.length ? others : keys, rnd);
    }
    var tpl = pool.templates[key];
    var a = null;
    if (!switchNow && state.last && state.last.tplKey === key) a = state.last.card;
    if (!a) {
      var fresh = tpl.items.filter(function (it) { return recent.indexOf(it.id) < 0; });
      a = pick(fresh.length ? fresh : tpl.items, rnd);
    } else {
      var src = tpl.items.filter(function (it) { return it.id === a.id; })[0];
      a = src || { id: a.id, name: a.name, value: a.value, icon: a.icon };
    }
    var lv = level(state.streak);
    var cands = tpl.items.filter(function (it) { return it.id !== a.id && it.name !== a.name && it.value !== a.value && ratio(it.value, a.value) >= MIN_RATIO; });
    var fresh2 = cands.filter(function (it) { return recent.indexOf(it.id) < 0; });
    var pool2 = fresh2.length ? fresh2 : cands;
    var easy = pool2.filter(function (it) { return ratio(it.value, a.value) <= lv.maxRatio; });
    var b;
    if (easy.length) {
      var weighted = [];
      easy.forEach(function (it) { var r = ratio(it.value, a.value); var w = r >= lv.maxRatio * 0.6 ? 2 : 1; for (var i = 0; i < w; i++) weighted.push(it); });
      b = pick(weighted, rnd);
    } else if (pool2.length) {
      b = pool2.slice().sort(function (x, y) { return ratio(x.value, a.value) - ratio(y.value, a.value); })[0];
    } else {
      var retry = tpl.items.filter(function (it) { return it.id !== a.id; });
      for (var i = 0; i < retry.length && !b; i++) {
        var aa = pick(retry, rnd), cc = tpl.items.filter(function (it) { return it.value !== aa.value && it.name !== aa.name && ratio(it.value, aa.value) >= MIN_RATIO; });
        if (cc.length) { a = aa; b = pick(cc, rnd); }
      }
      if (!b) throw new Error('kein gueltiges Paar in ' + key);
    }
    state.run = key === state.tplKey ? state.run + 1 : 1;
    state.tplKey = key;
    return { tpl: { key: tpl.key, label: tpl.label, unit: tpl.unit, ask: tpl.ask }, a: mkCard(a, tpl), b: mkCard(b, tpl), higher: b.value > a.value, ratio: ratio(a.value, b.value), level: lv };
  }

  function answer(pair, guess) {
    var higher = !!pair.higher;
    return { correct: (guess === 'higher' || guess === 'lower') && (guess === 'higher') === higher, higher: higher };
  }

  function advance(state, pair, correct) {
    state.rounds++;
    if (correct) { state.streak++; if (state.streak > state.best) state.best = state.streak; }
    else { state.streak = 0; state.lives = Math.max(0, state.lives - 1); }
    state.last = { tplKey: pair.tpl.key, card: pair.b };
    state.recent.push(pair.a.id, pair.b.id); state.recent = state.recent.slice(-16);
    return state;
  }

  function selfTest(questions, icons) {
    var pool = buildPool(questions, icons);
    if (pool.keys.length < 4) throw new Error('zu wenige Vorlagen: ' + pool.keys.length);
    var n = 0, maxRun = 0, run = 0, lastKey = '', minSeen = Infinity;
    var seed = 12345; var rnd = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    var st = newState();
    for (var i = 0; i < 1500; i++) {
      if (st.lives === 0) { st.lives = LIVES; st.streak = (i % 25); }
      var p = next(pool, st, rnd);
      if (p.a.value === p.b.value) throw new Error('gleicher Wert: ' + p.a.name + ' / ' + p.b.name);
      var r = ratio(p.a.value, p.b.value);
      if (r < MIN_RATIO) throw new Error('Verhaeltnis ' + r + ' bei ' + p.a.name + ' / ' + p.b.name);
      if (p.a.name === p.b.name) throw new Error('gleicher Name');
      if (icons && (!p.a.icon || !p.b.icon)) throw new Error('Objekt ohne Icon');
      if (p.higher !== (p.b.value > p.a.value)) throw new Error('higher falsch');
      minSeen = Math.min(minSeen, r);
      run = p.tpl.key === lastKey ? run + 1 : 1; lastKey = p.tpl.key; maxRun = Math.max(maxRun, run);
      advance(st, p, rnd() < 0.8); n++;
    }
    if (maxRun > 3) throw new Error('mehr als 3 gleiche Vorlagen in Folge: ' + maxRun);
    var avg = function (streak) { var s = newState(); var t = 0, c = 0; for (var j = 0; j < 400; j++) { s.streak = streak; s.last = null; s.tplKey = null; s.run = 0; var q = next(pool, s, rnd); t += Math.min(q.ratio, 50); c++; } return t / c; };
    var easyAvg = avg(0), hardAvg = avg(20);
    if (!(hardAvg < easyAvg)) throw new Error('Schwierigkeit waechst nicht: ' + easyAvg.toFixed(2) + ' -> ' + hardAvg.toFixed(2));
    return pool.keys.length + ' Vorlagen, ' + n + ' Paare, min. Verhaeltnis ' + minSeen.toFixed(2) + ', Serie 0: ' + easyAvg.toFixed(1) + ' / Serie 20: ' + hardAvg.toFixed(1);
  }

  var api = { buildPool: buildPool, fromMeasures: fromMeasures, newState: newState, next: next, answer: answer, advance: advance, level: level, format: format, selfTest: selfTest, LIVES: LIVES, MIN_RATIO: MIN_RATIO, TEMPLATES: TEMPLATES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MGPairs = api;
})(typeof window !== 'undefined' ? window : this);
