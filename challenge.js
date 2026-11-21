/**
 * MineGuess - Challenge-Link (?c=<seed>): fuer alle dieselben 10 Fragen (Browser: window.MGChallenge, Node: require; braucht ranked.js).
 *
 * Seed:   "<version>-<kennung>" (z. B. "1-k3x9a2bq"); ohne Versionsvorsatz gilt die neueste Version. Kennung: 6-12 Zeichen a-z0-9.
 *         Die Version legt den Fragenpool fest (alle Fragen mit id <= POOL_VERSIONS[version]); so aendert sich ein einmal
 *         geteilter Link nicht, wenn spaeter neue Fragen hinzukommen. Auswahl nur ueber IDs (nicht ueber die Reihenfolge in
 *         questions.json) und einen ganzzahligen Zufallsgenerator: gleiches Ergebnis in jedem Browser, nach Neustarts und auf dem Server.
 * Aufbau: 10 Fragen mit steigender Schwierigkeit (Tier 1,1,2,2,2,3,3,3,4,4), keine Wiederholung, Vorlage nie direkt doppelt, nie 3 gleiche
 *         Formate in Folge, hoechstens 2 Crafting-Raetsel (nur Erraten; Bauen ist in Challenges ausgeschlossen).
 *
 *   parse(text)                 -> { ok:true, version, id, seed } | { ok:false, error }   (streng: Laenge, Zeichen, bekannte Version)
 *   newSeed(rnd?)               -> "1-xxxxxxxx"
 *   select(questions, seed, n?) -> { ok:true, seed, version, ids:[...], questions:[...] } | { ok:false, error }
 *   summary(input)              -> spoilerfreie Ergebnisdaten (keine Fragen/Antworten)
 *   toText(summary, url?)       -> Text zum Teilen (Zahlen und Quadratmuster)
 *   shareUrl(base, seed)        -> base + "?c=" + seed
 *   setSnapshot(json)           -> Schnappschuss challenge-pool.json setzen (Browser; Node laedt ihn selbst)
 */
(function (root) {
  'use strict';

  var POOL_VERSIONS = { 1: 1933, 2: 3999, 3: 99999 };            // Version -> hoechste Frage-ID im Pool (neue Version: neue Zeile, alte bleiben)
  var LATEST = 3;      // 3: mit Crafting2 (4001+) und Datenfragen (10001+); 2: tf; 1 bleibt fuer alte Links unveraendert
  var TIERS = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4];
  var ID_RE = /^[a-z0-9]{6,12}$/;
  var R = (typeof module !== 'undefined' && module.exports) ? require('./ranked.js') : root.MGRanked;

  function parse(text) {
    if (typeof text !== 'string' || text.length < 6 || text.length > 20) return { ok: false, error: 'laenge' };
    var t = text.trim().toLowerCase(), m = /^(?:([1-9][0-9]?)-)?([a-z0-9]+)$/.exec(t);
    if (!m) return { ok: false, error: 'zeichen' };
    var version = m[1] ? parseInt(m[1], 10) : LATEST;
    if (!POOL_VERSIONS[version]) return { ok: false, error: 'version' };
    if (!ID_RE.test(m[2])) return { ok: false, error: 'kennung' };
    return { ok: true, version: version, id: m[2], seed: version + '-' + m[2] };
  }

  function newSeed(rnd) {
    rnd = rnd || Math.random;
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
    for (var i = 0; i < 8; i++) s += chars[Math.floor(rnd() * 36)];
    return LATEST + '-' + s;
  }

  // Ganzzahliger Zufall: xmur3-Hash -> mulberry32 (nur Math.imul/Shift, ueberall identisch)
  function hash(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
  }
  function prng(seed) {
    var a = hash(seed)();
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function fmt(q) { return q.type === 'crafting' ? 'crafting' : (R && R.formatKey ? R.formatKey(q) : q.type); }
  function tpl(q) { return R && R.templateKey ? R.templateKey(q) : (q.gen || q.category + ':' + q.type); }

  // Schnappschuss der Auswahl-Merkmale je Frage (challenge-pool.json, tools/gen-challenge-pool.js): haelt geteilte Links stabil,
  // auch wenn spaeter Ratings/Tiers neu berechnet oder Fragen bearbeitet werden. Node laedt die Datei selbst, der Browser per setSnapshot().
  var snapshot = null;
  if (typeof module !== 'undefined' && module.exports) { try { snapshot = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'challenge-pool.json'), 'utf8')); } catch (e) { snapshot = null; } }
  function setSnapshot(j) { snapshot = j && j.versions ? j : null; }
  function buildSnapshot(questions) {
    var versions = {};
    Object.keys(POOL_VERSIONS).forEach(function (v) {
      var m = {};
      questions.forEach(function (q) { if (q && Number.isInteger(q.id) && q.id <= POOL_VERSIONS[v] && q.tier >= 1 && q.tier <= 4) m[q.id] = [q.tier, tpl(q), fmt(q), q.type === 'crafting' ? 1 : 0]; });
      versions[v] = m;
    });
    return { v: 1, versions: versions };
  }

  function select(questions, seedText, n) {
    var p = parse(seedText);
    if (!p.ok) return p;
    n = n || TIERS.length;
    var max = POOL_VERSIONS[p.version];
    var snap = snapshot && snapshot.versions && snapshot.versions[p.version];
    var byId = {};
    questions.forEach(function (q) { if (q && Number.isInteger(q.id)) byId[q.id] = q; });
    var pool = [];
    if (snap) Object.keys(snap).forEach(function (id) { var e = snap[id], q = byId[id]; if (q) pool.push({ id: +id, tier: e[0], tpl: e[1], fmt: e[2], craft: !!e[3], q: q }); });
    else questions.forEach(function (q) { if (q && Number.isInteger(q.id) && q.id <= max && q.tier >= 1 && q.tier <= 4) pool.push({ id: q.id, tier: q.tier, tpl: tpl(q), fmt: fmt(q), craft: q.type === 'crafting', q: q }); });
    pool.sort(function (a, b) { return a.id - b.id; });
    if (pool.length < 100) return { ok: false, error: 'pool' };
    var rnd = prng(p.seed), chosen = [], used = {}, crafting = 0;
    for (var slot = 0; slot < n; slot++) {
      var tier = TIERS[Math.min(slot, TIERS.length - 1)];
      var l1 = chosen[chosen.length - 1], l2 = chosen[chosen.length - 2];
      var banTpl = l1 ? l1.tpl : null;
      var banFmt = l1 && l2 && l1.fmt === l2.fmt ? l1.fmt : null;
      var levels = [
        function (q) { return q.tier === tier && !used[q.id] && q.tpl !== banTpl && q.fmt !== banFmt && (!q.craft || crafting < 2); },
        function (q) { return q.tier === tier && !used[q.id] && q.tpl !== banTpl && (!q.craft || crafting < 2); },
        function (q) { return Math.abs(q.tier - tier) <= 1 && !used[q.id]; },
        function (q) { return !used[q.id]; }
      ];
      var cand = [];
      for (var lv = 0; lv < levels.length && !cand.length; lv++) cand = pool.filter(levels[lv]);
      var pick = cand[Math.floor(rnd() * cand.length)];
      used[pick.id] = 1; if (pick.craft) crafting++;
      chosen.push(pick);
    }
    return { ok: true, seed: p.seed, version: p.version, ids: chosen.map(function (c) { return c.id; }), questions: chosen.map(function (c) { return c.q; }) };
  }

  function int(v, lo, hi) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo; }

  /**
   * input: { seed, results:[{ correct:bool, attempts?:int, ms?:int }], points?, bestStreak?, rank?:{label, mmr?} }
   * Ausgabe (nur Zahlen/Rang/Muster, keine Fragen oder Loesungen):
   *   { v:1, seed, n, correct, points, bestStreak, pattern:[1,0,...], squares:'...', attempts:[...], seconds?, rank? }
   */
  function summary(input) {
    input = input || {};
    var p = parse(String(input.seed || ''));
    var res = Array.isArray(input.results) ? input.results.slice(0, 10) : [];
    var pattern = res.map(function (r) { return r && r.correct ? 1 : 0; });
    var best = 0, cur = 0; pattern.forEach(function (x) { cur = x ? cur + 1 : 0; if (cur > best) best = cur; });
    var out = {
      v: 1, seed: p.ok ? p.seed : '', n: pattern.length, correct: pattern.reduce(function (a, b) { return a + b; }, 0),
      points: int(input.points, 0, 1000000), bestStreak: input.bestStreak == null ? best : int(input.bestStreak, 0, 10),
      pattern: pattern, squares: pattern.map(function (x) { return x ? '■' : '□'; }).join(''),
      attempts: res.map(function (r) { return int(r && r.attempts, 0, 9); })
    };
    var ms = res.reduce(function (a, r) { return a + int(r && r.ms, 0, 600000); }, 0);
    if (ms > 0) out.seconds = Math.round(ms / 1000);
    if (input.rank && typeof input.rank.label === 'string') out.rank = { label: input.rank.label.slice(0, 24), mmr: input.rank.mmr == null ? undefined : int(input.rank.mmr, 0, 20000) };
    return out;
  }

  function shareUrl(base, seed) { return String(base || '').replace(/[?#].*$/, '') + '?c=' + encodeURIComponent(seed); }

  function toText(s, url) {
    var lines = ['MineGuess Herausforderung ' + s.seed, s.correct + '/' + s.n + '  ' + s.squares, 'Punkte ' + String(s.points).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ', Serie ' + s.bestStreak + (s.seconds ? ', ' + s.seconds + ' s' : '') + (s.rank ? ', Rang ' + s.rank.label + (s.rank.mmr != null ? ' (' + s.rank.mmr + ' MMR)' : '') : '')];
    if (url) lines.push(url);
    return lines.join('\n');
  }

  function selfTest(questions) {
    var a = select(questions, '1-abcd1234'), b = select(questions.slice().reverse(), '1-abcd1234'), c = select(questions, '1-abcd1235');
    if (!a.ok || a.ids.length !== 10 || new Set(a.ids).size !== 10) throw new Error('Auswahl ungueltig');
    if (a.ids.join() !== b.ids.join()) throw new Error('nicht reproduzierbar (Reihenfolge der Fragen)');
    if (a.ids.join() === c.ids.join()) throw new Error('verschiedene Seeds gleiche Fragen');
    ['', 'ab', 'A B', '../../x', '9-abcdefgh', '1-abc', '1-abcdefghijklmnop', 'abcd$1234', null, 12345678].forEach(function (s) { if (select(questions, s).ok) throw new Error('Seed nicht abgelehnt: ' + s); });
    var t = summary({ seed: a.seed, results: a.ids.map(function (_, i) { return { correct: i % 3 !== 0, attempts: 1, ms: 5000 }; }) });
    if (/answer|question|funFact/i.test(JSON.stringify(t))) throw new Error('Zusammenfassung nicht spoilerfrei');
    return 'Seed 1-abcd1234 -> ' + a.ids.join(',') + '; ' + t.squares;
  }

  var api = { parse: parse, newSeed: newSeed, select: select, summary: summary, toText: toText, shareUrl: shareUrl, selfTest: selfTest, setSnapshot: setSnapshot, buildSnapshot: buildSnapshot, POOL_VERSIONS: POOL_VERSIONS, LATEST: LATEST, TIERS: TIERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MGChallenge = api;
})(typeof window !== 'undefined' ? window : this);
