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

  // profile: { mmr, peak, games, answered, correct, lastDate }
  function newProfile() {
    return { mmr: START_MMR, peak: START_MMR, games: 0, answered: 0, correct: 0, lastDate: '' };
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

  // Fragenauswahl nach MMR-Zone: meist nahe an der MMR, ab und zu leichter/schwerer.
  function pickIndex(questions, mmr, used, rnd, opts) {
    rnd = rnd || Math.random;
    used = used || new Set();
    var r = rnd(), off;
    if (r < 0.2) off = -300 + rnd() * 200;        // Aufwärmer
    else if (r < 0.8) off = -150 + rnd() * 300;   // Kernzone
    else off = 100 + rnd() * 300;                 // Herausforderung
    var target = mmr + off;
    var pool = [];
    for (var i = 0; i < questions.length; i++) if (!used.has(i)) pool.push(i);
    if (!pool.length) { used.clear(); for (var j = 0; j < questions.length; j++) pool.push(j); }
    var best = pool[0], bestD = Infinity, n = Math.min(30, pool.length);
    for (var s = 0; s < n; s++) {
      var idx = pool[Math.floor(rnd() * pool.length)];
      var q = questions[idx];
      var rt = q && typeof q.rating === 'number' ? q.rating : DEFAULT_RATING;
      var dd = Math.abs(rt - target);
      if (dd < bestD) { bestD = dd; best = idx; }
    }
    return best;
  }

  var api = {
    START_MMR: START_MMR, K: K, DEFAULT_RATING: DEFAULT_RATING, RANKS: RANKS,
    expected: expected, rankInfo: rankInfo, newProfile: newProfile, normalizeProfile: normalizeProfile,
    applyAnswer: applyAnswer, pickIndex: pickIndex
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MGRanked = api;
})(typeof window !== 'undefined' ? window : this);
