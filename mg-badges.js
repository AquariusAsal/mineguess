/**
 * MineGuess – Abzeichen (Daten + Pruef-/Speicherlogik). Browser: window.MGBadges.
 * Speicher (localStorage, gleiche Origin fuer game.html und multiplayer.html):
 *   mg_badges   = ["id", ...]       freigeschaltete Abzeichen
 *   mg_bstats   = { ... }           Zaehler, siehe COUNTERS
 * Bestehende Quellen: mg_stats, mg_cat_stats, mg_blitz_games, mg_blitz_best, mg_ranked, mg_daily_*.
 * Ereignisse: MGBadges.record(name, data) -> prueft danach alle Abzeichen und ruft MGBadges.onUnlock(badge).
 */
(function (root) {
  'use strict';

  function ls() { try { return root.localStorage; } catch (e) { return null; } }
  function readJSON(key, def) {
    var s = ls(); if (!s) return def;
    try { var v = JSON.parse(s.getItem(key)); return v == null ? def : v; } catch (e) { return def; }
  }
  function writeJSON(key, val) { var s = ls(); if (!s) return; try { s.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var COUNTERS = { streak: 0, bestStreak: 0, hardCorrect: 0, rankUpStreak: 0, bestRankUpStreak: 0,
                   perfectRuns: 0, mpRoundWins: 0, mpGameWins: 0, mpExactFirst: 0, mpClosestWins: 0, totems: 0 };

  function bstats() {
    var o = readJSON('mg_bstats', {});
    var r = {};
    Object.keys(COUNTERS).forEach(function (k) { r[k] = Math.max(0, Number(o[k]) || 0); });
    return r;
  }

  function dailyStreak() {
    var streak = 0, now = new Date();
    for (var i = 0; i < 365; i++) {
      var d = new Date(now); d.setDate(d.getDate() - i);
      var key = 'mg_daily_' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      var v = readJSON(key, null);
      if (v && v.done) { streak++; continue; }
      if (i > 0) break;
    }
    return streak;
  }

  // Gesamtsicht auf alle Datenquellen
  function stats() {
    var cs = readJSON('mg_cat_stats', {});
    var cats = {}, totalCorrect = 0, answered = 0, catsPlayed = 0;
    Object.keys(cs).forEach(function (k) {
      cats[k] = cs[k].c || 0; totalCorrect += cs[k].c || 0; answered += cs[k].t || 0;
      if ((cs[k].t || 0) > 0) catsPlayed++;
    });
    var gs = readJSON('mg_stats', { streak: 0, best: 0, played: 0 });
    var rk = readJSON('mg_ranked', {});
    var s = bstats();
    s.played = gs.played || 0;
    s.cats = cats; s.totalCorrect = totalCorrect; s.answered = answered; s.catsPlayed = catsPlayed;
    s.blitzGames = parseInt((ls() && ls().getItem('mg_blitz_games')) || '0', 10) || 0;
    s.blitzBest = parseInt((ls() && ls().getItem('mg_blitz_best')) || '0', 10) || 0;
    s.dailyStreak = dailyStreak();
    s.rankedGames = Number(rk.games) || 0;
    s.peakMmr = Number(rk.peak) || Number(rk.mmr) || 0;
    return s;
  }

  var ALL_CATEGORY_COUNT = 18;

  // rarity: common | uncommon | rare | epic | legendary
  var LIST = [
    // bestehende Abzeichen (Bedingungen unveraendert)
    { id: 'first_correct',  name: 'Erster Treffer',   desc: 'Erste richtige Antwort',          texture: 'item/arrow',                 rarity: 'common',    check: function (s) { return s.totalCorrect >= 1; } },
    { id: 'mob_expert',     name: 'Mob-Experte',      desc: '20x Mobs korrekt beantwortet',    texture: 'item/rotten_flesh',          rarity: 'uncommon',  check: function (s) { return (s.cats['Mobs'] || 0) >= 20; } },
    { id: 'nether_lord',    name: 'Nether-Herr',      desc: '10x Dimensionen richtig',         texture: 'block/netherrack',           rarity: 'uncommon',  check: function (s) { return (s.cats['Dimensionen'] || 0) >= 10; } },
    { id: 'craft_master',   name: 'Handwerksmeister', desc: '15x Crafting richtig',            texture: 'block/crafting_table_front', rarity: 'uncommon',  check: function (s) { return (s.cats['Crafting'] || 0) >= 15; } },
    { id: 'redstone_guru',  name: 'Redstone-Guru',    desc: '10x Redstone richtig',            texture: 'item/redstone',              rarity: 'uncommon',  check: function (s) { return (s.cats['Redstone'] || 0) >= 10; } },
    { id: 'potion_master',  name: 'Trank-Meister',    desc: '10x Tränke richtig',              texture: 'item/potion',                rarity: 'uncommon',  check: function (s) { return (s.cats['Tränke'] || 0) >= 10; } },
    { id: 'blitz_rookie',   name: 'Blitz-Neuling',    desc: 'Blitz-Modus gespielt',            texture: 'item/firework_rocket',       rarity: 'common',    check: function (s) { return s.blitzGames >= 1; } },
    { id: 'daily_3',        name: '3er Streak',       desc: '3 Tage tägl. Challenge',          texture: 'item/clock_00',              rarity: 'common',    check: function (s) { return s.dailyStreak >= 3; } },
    { id: 'daily_7',        name: '7er Streak',       desc: '7 Tage tägl. Challenge',          texture: 'item/filled_map',            rarity: 'rare',      check: function (s) { return s.dailyStreak >= 7; } },
    { id: '100_played',     name: 'Centurio',         desc: '100 Fragen gespielt',             texture: 'item/nether_star',           rarity: 'rare',      check: function (s) { return s.played >= 100; } },
    // neu: Serien und Menge
    { id: 'streak_5',       name: 'Heiße Phase',      desc: '5 richtige Antworten in Folge',   texture: 'item/bread',                 rarity: 'common',    check: function (s) { return s.bestStreak >= 5; } },
    { id: 'streak_10',      name: 'Lauf',             desc: '10 richtige Antworten in Folge',  texture: 'item/cooked_beef',           rarity: 'uncommon',  check: function (s) { return s.bestStreak >= 10; } },
    { id: 'streak_20',      name: 'Unaufhaltsam',     desc: '20 richtige Antworten in Folge',  texture: 'item/cake',                  rarity: 'epic',      check: function (s) { return s.bestStreak >= 20; } },
    { id: 'daily_30',       name: 'Monatsserie',      desc: '30 Tage tägl. Challenge in Folge', texture: 'item/clock_01',             rarity: 'legendary', check: function (s) { return s.dailyStreak >= 30; } },
    { id: 'answered_100',   name: 'Wissbegierig',     desc: '100 Fragen beantwortet',          texture: 'item/book',                  rarity: 'common',    check: function (s) { return s.answered >= 100; } },
    { id: 'answered_500',   name: 'Bibliothekar',     desc: '500 Fragen beantwortet',          texture: 'item/enchanted_book',        rarity: 'rare',      check: function (s) { return s.answered >= 500; } },
    { id: 'answered_1000',  name: 'Archivar',         desc: '1000 Fragen beantwortet',         texture: 'block/bookshelf',            rarity: 'epic',      check: function (s) { return s.answered >= 1000; } },
    { id: 'hard_correct',   name: 'Knifflig',         desc: 'Eine sehr schwere Frage (Stufe 4) richtig',  texture: 'item/diamond_sword',   rarity: 'uncommon',  check: function (s) { return s.hardCorrect >= 1; } },
    { id: 'hard_10',        name: 'Meisterdenker',    desc: '10 sehr schwere Fragen (Stufe 4) richtig',   texture: 'item/diamond_pickaxe', rarity: 'epic',      check: function (s) { return s.hardCorrect >= 10; } },
    { id: 'all_categories', name: 'Allrounder',       desc: 'In allen Kategorien gespielt',    texture: 'item/map',                   rarity: 'rare',      check: function (s) { return s.catsPlayed >= ALL_CATEGORY_COUNT; } },
    { id: 'blitz_5000',     name: 'Blitzschnell',     desc: 'Blitz-Rekord von 5000 Punkten',   texture: 'item/blaze_powder',          rarity: 'uncommon',  check: function (s) { return s.blitzBest >= 5000; } },
    { id: 'blitz_10000',    name: 'Gewitter',         desc: 'Blitz-Rekord von 10000 Punkten',  texture: 'item/blaze_rod',             rarity: 'epic',      check: function (s) { return s.blitzBest >= 10000; } },
    // neu: Ranked
    { id: 'ranked_first',   name: 'Erste Ranked-Partie', desc: 'Eine Ranked-Partie (10 Fragen) beendet', texture: 'item/writable_book', rarity: 'common',  check: function (s) { return s.rankedGames >= 1; } },
    { id: 'rank_iron',      name: 'Eisenrang',        desc: 'Rang Iron erreicht (1000 MMR)',   texture: 'item/iron_ingot',            rarity: 'uncommon',  check: function (s) { return s.peakMmr >= 1000; } },
    { id: 'rank_gold',      name: 'Goldrang',         desc: 'Rang Gold erreicht (2000 MMR)',   texture: 'item/gold_ingot',            rarity: 'rare',      check: function (s) { return s.peakMmr >= 2000; } },
    { id: 'rank_diamond',   name: 'Diamantrang',      desc: 'Rang Diamond erreicht (3000 MMR)', texture: 'item/diamond',              rarity: 'epic',      check: function (s) { return s.peakMmr >= 3000; } },
    { id: 'rank_netherite', name: 'Netherit-Rang',    desc: 'Rang Netherite erreicht (4000 MMR)', texture: 'item/netherite_ingot',    rarity: 'legendary', check: function (s) { return s.peakMmr >= 4000; } },
    { id: 'rankup_3',       name: 'Aufstiegsserie',   desc: '3 Rangaufstiege ohne Abstieg dazwischen', texture: 'item/experience_bottle', rarity: 'epic', check: function (s) { return s.bestRankUpStreak >= 3; } },
    { id: 'perfect_run',    name: 'Perfekte Runde',   desc: 'Ranked-Partie mit 10 von 10 richtig', texture: 'item/golden_apple',      rarity: 'rare',      check: function (s) { return s.perfectRuns >= 1; } },
    // neu: Multiplayer
    { id: 'mp_round_win',   name: 'Rundensieg',       desc: 'Eine Multiplayer-Runde gewonnen', texture: 'item/gold_nugget',           rarity: 'common',    check: function (s) { return s.mpRoundWins >= 1; } },
    { id: 'mp_game_win',    name: 'Tischkönig',       desc: 'Ein Multiplayer-Spiel gewonnen',  texture: 'block/gold_block',           rarity: 'rare',      check: function (s) { return s.mpGameWins >= 1; } },
    { id: 'mp_first_exact', name: 'Erster und exakt', desc: 'Als erster Läutender exakt richtig', texture: 'item/bow',                rarity: 'uncommon',  check: function (s) { return s.mpExactFirst >= 1; } },
    { id: 'mp_closest_win', name: 'Am nächsten dran', desc: 'Eine Runde durch die kleinste Abweichung gewonnen', texture: 'item/compass_00', rarity: 'uncommon', check: function (s) { return s.mpClosestWins >= 1; } },
    { id: 'totem_used',     name: 'Unsterblich',      desc: 'Ein Totem im Multiplayer eingesetzt', texture: 'item/totem_of_undying',  rarity: 'common',    check: function (s) { return s.totems >= 1; } }
  ];

  function earned() {
    var a = readJSON('mg_badges', []);
    return new Set(Array.isArray(a) ? a : []);
  }
  function saveEarned(set) { writeJSON('mg_badges', Array.from(set)); }

  // Zaehler-Aenderung speichern
  function bump(fn) {
    var b = bstats(); fn(b); writeJSON('mg_bstats', b);
  }

  // Ereignisse
  //  answer      {correct, rating}               Solo-Antwort (Endergebnis der Frage)
  //  ranked_game {correct, total}                Ranked-Lauf beendet
  //  rank        {promoted, demoted}             nach jeder Ranked-Frage
  //  mp_round    {won, exactFirst, closest}      Multiplayer-Rundenauswertung (fuer diesen Spieler)
  //  mp_game     {won}                           Multiplayer-Spiel beendet (Platz 1 bei >= 2 Spielern)
  //  totem       {}                              Totem eingesetzt
  function record(name, d) {
    d = d || {};
    bump(function (b) {
      if (name === 'answer') {
        if (d.correct) { b.streak++; b.bestStreak = Math.max(b.bestStreak, b.streak); if ((Number(d.rating) || 0) >= 3200) b.hardCorrect++; }
        else b.streak = 0;
      } else if (name === 'ranked_game') {
        if (d.total > 0 && d.correct >= d.total) b.perfectRuns++;
      } else if (name === 'rank') {
        if (d.promoted) { b.rankUpStreak++; b.bestRankUpStreak = Math.max(b.bestRankUpStreak, b.rankUpStreak); }
        else if (d.demoted) b.rankUpStreak = 0;
      } else if (name === 'mp_round') {
        if (d.won) b.mpRoundWins++;
        if (d.exactFirst) b.mpExactFirst++;
        if (d.closest) b.mpClosestWins++;
      } else if (name === 'mp_game') {
        if (d.won) b.mpGameWins++;
      } else if (name === 'totem') {
        b.totems++;
      }
    });
    return check();
  }

  // Alle Abzeichen pruefen, neue speichern und melden. Rueckgabe: Liste neuer Abzeichen.
  function check() {
    var have = earned(), s = stats(), fresh = [];
    LIST.forEach(function (a) {
      if (!have.has(a.id) && a.check(s)) { have.add(a.id); fresh.push(a); }
    });
    if (fresh.length) {
      saveEarned(have);
      fresh.forEach(function (a, i) {
        if (typeof api.onUnlock === 'function') setTimeout(function () { api.onUnlock(a); }, i * 1500);
      });
    }
    return fresh;
  }

  // Cloud-Abgleich (Vereinigung): ids aus der Cloud uebernehmen
  function merge(ids) {
    if (!Array.isArray(ids)) return;
    var have = earned(), known = {};
    LIST.forEach(function (a) { known[a.id] = true; });
    var changed = false;
    ids.forEach(function (id) { if (known[id] && !have.has(id)) { have.add(id); changed = true; } });
    if (changed) saveEarned(have);
  }

  // Fortschritt je Abzeichen fuer die Anzeige (0..1 fuer zaehlbare Bedingungen, sonst 0/1)
  var PROGRESS = {
    streak_5: ['bestStreak', 5], streak_10: ['bestStreak', 10], streak_20: ['bestStreak', 20],
    daily_3: ['dailyStreak', 3], daily_7: ['dailyStreak', 7], daily_30: ['dailyStreak', 30],
    answered_100: ['answered', 100], answered_500: ['answered', 500], answered_1000: ['answered', 1000],
    '100_played': ['played', 100], hard_10: ['hardCorrect', 10], hard_correct: ['hardCorrect', 1],
    all_categories: ['catsPlayed', ALL_CATEGORY_COUNT], blitz_5000: ['blitzBest', 5000], blitz_10000: ['blitzBest', 10000],
    rank_iron: ['peakMmr', 1000], rank_gold: ['peakMmr', 2000], rank_diamond: ['peakMmr', 3000], rank_netherite: ['peakMmr', 4000],
    rankup_3: ['bestRankUpStreak', 3]
  };
  function progress(id) {
    var p = PROGRESS[id], s = stats();
    if (!p) return earned().has(id) ? { value: 1, target: 1 } : { value: 0, target: 1 };
    return { value: Math.min(p[1], s[p[0]] || 0), target: p[1] };
  }

  var api = { list: LIST, stats: stats, earned: earned, record: record, check: check, merge: merge, progress: progress, onUnlock: null };
  root.MGBadges = api;
})(typeof window !== 'undefined' ? window : this);
