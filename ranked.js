/**
 * MineGuess – Ranked-Logik (MMR, Ränge, Fragenauswahl). Browser: window.MGRanked, Node: require().
 * Elo-artig: p = 1 / (1 + 10^((R_frage - MMR) / 400)), Delta = K * (Ergebnis - p).
 */
(function (root) {
  'use strict';

  var START_MMR = 500;
  var K = 28;
  var DEFAULT_RATING = 1700;
  var MAX_MMR = 20000;

  // Ränge: je 1000 MMR, Unterstufen I-III (je ~333). Netherite ist offen nach oben.
  var RANKS = [
    { id: 'copper',    name: 'Copper',    min: 0,    texture: 'copper_ingot' },
    { id: 'iron',      name: 'Iron',      min: 1000, texture: 'iron_ingot' },
    { id: 'gold',      name: 'Gold',      min: 2000, texture: 'gold_ingot' },
    { id: 'diamond',   name: 'Diamond',   min: 3000, texture: 'diamond' },
    { id: 'netherite', name: 'Netherite', min: 4000, texture: 'netherite_ingot' }
  ];
  var ROMAN = ['', 'I', 'II', 'III'];

  function expected(mmr, rating) {
    return 1 / (1 + Math.pow(10, (rating - mmr) / 400));
  }

  function rankIndex(mmr) {
    var i = 0;
    for (var k = 0; k < RANKS.length; k++) if (mmr >= RANKS[k].min) i = k;
    return i;
  }

  function rankInfo(mmr) {
    mmr = Math.max(0, Math.round(Number(mmr) || 0));
    var idx = rankIndex(mmr);
    var r = RANKS[idx];
    var next = RANKS[idx + 1] || null;
    var into = mmr - r.min;
    var tier = Math.min(3, 1 + Math.floor(into / 334));
    var span = next ? next.min - r.min : 1000;
    return {
      mmr: mmr,
      idx: idx,
      rankId: r.id,
      name: r.name,
      texture: r.texture,
      tier: tier,
      label: r.name + ' ' + ROMAN[tier],
      floor: r.min,
      next: next ? next.id : null,
      nextName: next ? next.name : null,
      toNext: next ? Math.max(0, next.min - mmr) : 0,
      progress: next ? Math.min(1, into / span) : 1
    };
  }

  // Kalendertag lokal als 'YYYY-MM-DD'
  function dayKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  // Rang als Daten: { tier: 'copper', division: 1..3 } (division 3 = hoechste Stufe des Rangs)
  function rankData(mmr) { var i = rankInfo(mmr); return { tier: i.rankId, division: i.tier }; }

  // profile: { mmr, peak, games, answered, correct, lastDate, lastPlayedDay, mmrDayStart, mmrToday }
  function newProfile() {
    return { mmr: START_MMR, peak: START_MMR, games: 0, answered: 0, correct: 0, lastDate: '',
             lastPlayedDay: '', mmrDayStart: START_MMR, mmrToday: 0 };
  }
  function normalizeProfile(o) {
    var p = newProfile();
    if (!o || typeof o !== 'object') return p;
    var num = function (v, d, lo, hi) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d; };
    p.mmr = num(o.mmr, START_MMR, 0, MAX_MMR);
    p.peak = Math.max(p.mmr, num(o.peak, p.mmr, 0, MAX_MMR));
    p.games = num(o.games, 0, 0, 1e7);
    p.answered = num(o.answered, 0, 0, 1e7);
    p.correct = Math.min(p.answered, num(o.correct, 0, 0, 1e7));
    p.lastDate = typeof o.lastDate === 'string' ? o.lastDate.slice(0, 12) : '';
    p.lastPlayedDay = typeof o.lastPlayedDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.lastPlayedDay) ? o.lastPlayedDay : '';
    p.mmrDayStart = num(o.mmrDayStart, p.mmr, 0, MAX_MMR);
    p.mmrToday = Math.max(-MAX_MMR, Math.min(MAX_MMR, Math.round(Number(o.mmrToday) || 0)));
    return p;
  }

  /**
   * result: 1 = richtig (Erstversuch), 0 = falsch, dazwischen = teilweise (mehrere Versuche/Tipps).
   * opts: { speedFrac 0..1, streak (aufeinanderfolgende Treffer inkl. dieser) }
   * Bonus (nur bei result > 0.5, skaliert mit (1-p)): Speed bis +4, Serie bis +4.
   */
  function applyAnswer(profile, rating, result, opts) {
    opts = opts || {};
    var prof = normalizeProfile(profile);
    var R = Number(rating); if (!isFinite(R)) R = DEFAULT_RATING;
    var before = rankInfo(prof.mmr);
    var today = dayKey();
    if (prof.lastPlayedDay !== today) { prof.lastPlayedDay = today; prof.mmrDayStart = prof.mmr; }
    var p = expected(prof.mmr, R);
    var res = Math.max(0, Math.min(1, Number(result) || 0));
    var d = K * (res - p);
    if (res > 0.5) {
      var sp = Math.max(0, Math.min(1, Number(opts.speedFrac) || 0));
      var st = Math.max(0, Math.min(5, (Number(opts.streak) || 0) - 1));
      d += (4 * sp + 0.8 * st) * (1 - p);
    }
    d = Math.round(d);
    var newMmr = Math.max(0, Math.min(MAX_MMR, prof.mmr + d));
    d = newMmr - prof.mmr;                      // tatsächlich angewendet (MMR >= 0)
    prof.mmr = newMmr;
    prof.peak = Math.max(prof.peak, newMmr);
    prof.mmrToday = newMmr - prof.mmrDayStart;
    prof.answered += 1;
    if (res > 0.5) prof.correct += 1;
    var after = rankInfo(newMmr);
    return {
      profile: prof, delta: d, p: p, rating: R,
      before: before, after: after,
      promoted: after.idx > before.idx,
      demoted: after.idx < before.idx
    };
  }

  // Vorlage/Format einer Frage fuer die Diversitaetsregeln (alte Fragen: Kategorie + Typ)
  function templateKey(q) { return q.gen || ('alt:' + q.category + ':' + q.type); }
  function formatKey(q) { return (q.choices || /^cmp_/.test(q.gen || '')) ? 'cmp' : q.type; }

  // Fragenauswahl nach MMR-Zone, ohne Zuruecklegen, gewichtet zufaellig und abwechslungsreich:
  //  - nie eine Frage aus 'used' (aktueller Lauf), zuerst nur ungesehene (opts.seen = IDs, aelteste zuerst),
  //    erst wenn alles gesehen wurde die aeltesten 25 % wieder zulassen
  //  - Gewicht je Frage ~ Gauss um die Ziel-MMR (Sigma 350), Vorlage wird ~ sqrt(Gesamtgewicht) gewaehlt,
  //    damit grosse Vorlagen nicht dominieren
  //  - Diversitaet (opts.picked = bisher gezogene Fragen des Laufs): nie mehr als 2 gleiche Vorlagen und 3 gleiche
  //    Formate in Folge, hoechstens 3 je Vorlage und 4 je Kategorie pro Lauf; Regeln werden stufenweise gelockert
  function pickIndex(questions, mmr, used, rnd, opts) {
    rnd = rnd || Math.random;
    used = used || new Set();
    var seen = (opts && opts.seen) || [];
    var picked = (opts && opts.picked) || [];
    var age = {};
    for (var s = 0; s < seen.length; s++) age[seen[s]] = s;
    var r = rnd(), off;
    if (r < 0.2) off = -300 + rnd() * 200;        // Aufwaermer
    else if (r < 0.8) off = -150 + rnd() * 300;   // Kernzone
    else off = 100 + rnd() * 300;                 // Herausforderung
    var target = mmr + off;
    var fresh = [], old = [];
    for (var i = 0; i < questions.length; i++) {
      if (used.has(i)) continue;
      (age[questions[i].id] === undefined ? fresh : old).push(i);
    }
    if (!fresh.length && !old.length) {           // Lauf hat alles gesehen: neu beginnen
      used.clear();
      for (var j = 0; j < questions.length; j++) (age[questions[j].id] === undefined ? fresh : old).push(j);
    }
    var pool = fresh;
    if (!pool.length) {
      old.sort(function (x, y) { return age[questions[x].id] - age[questions[y].id]; });
      pool = old.slice(0, Math.max(10, Math.ceil(old.length * 0.25)));
    }

    // Diversitaetsregeln
    var tplCount = {}, catCount = {};
    picked.forEach(function (p) { var t = templateKey(p); tplCount[t] = (tplCount[t] || 0) + 1; catCount[p.category] = (catCount[p.category] || 0) + 1; });
    var l1 = picked[picked.length - 1], l2 = picked[picked.length - 2], l3 = picked[picked.length - 3];
    var banTpl = l1 && l2 && templateKey(l1) === templateKey(l2) ? templateKey(l1) : null;
    var banFmt = l1 && l2 && l3 && formatKey(l1) === formatKey(l2) && formatKey(l2) === formatKey(l3) ? formatKey(l1) : null;
    var levels = [
      function (q) { return templateKey(q) !== banTpl && formatKey(q) !== banFmt && (tplCount[templateKey(q)] || 0) < 3 && (catCount[q.category] || 0) < 4; },
      function (q) { return templateKey(q) !== banTpl && formatKey(q) !== banFmt && (tplCount[templateKey(q)] || 0) < 3; },
      function (q) { return templateKey(q) !== banTpl; },
      function () { return true; }
    ];
    var cand = pool;
    for (var lv = 0; lv < levels.length; lv++) {
      var f = pool.filter(function (ix) { return levels[lv](questions[ix]); });
      if (f.length) { cand = f; break; }
    }

    // gewichtet zufaellig: erst Vorlage (~ sqrt(Gesamtgewicht)), dann Frage (~ Gewicht)
    var groups = {}, keys = [];
    cand.forEach(function (ix) {
      var q = questions[ix];
      var rt = typeof q.rating === 'number' ? q.rating : DEFAULT_RATING;
      var w = Math.exp(-0.5 * Math.pow((rt - target) / 350, 2)) + 1e-4;
      var t = templateKey(q);
      if (!groups[t]) { groups[t] = { items: [], sum: 0 }; keys.push(t); }
      groups[t].items.push({ ix: ix, w: w }); groups[t].sum += w;
    });
    var tot = 0; keys.forEach(function (k) { tot += Math.sqrt(groups[k].sum); });
    var x = rnd() * tot, chosen = keys[keys.length - 1];
    for (var k = 0; k < keys.length; k++) { x -= Math.sqrt(groups[keys[k]].sum); if (x <= 0) { chosen = keys[k]; break; } }
    var g = groups[chosen], y = rnd() * g.sum;
    for (var m = 0; m < g.items.length; m++) { y -= g.items[m].w; if (y <= 0) return g.items[m].ix; }
    return g.items[g.items.length - 1].ix;
  }

  var api = {
    START_MMR: START_MMR, K: K, DEFAULT_RATING: DEFAULT_RATING, RANKS: RANKS,
    expected: expected, rankInfo: rankInfo, rankData: rankData, dayKey: dayKey, newProfile: newProfile, normalizeProfile: normalizeProfile,
    applyAnswer: applyAnswer, pickIndex: pickIndex, templateKey: templateKey, formatKey: formatKey
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MGRanked = api;
})(typeof window !== 'undefined' ? window : this);
