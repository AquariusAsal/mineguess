/**
 * MineGuess - Auswahl-Logik fuer Solo-Modi (Browser: window.MGModes, Node: require; braucht ranked.js).
 *
 * Formate: 'number' (Zahl), 'entity' (Name per Dropdown), 'choice' (ODER-Frage, `choices`), 'craft-guess' (Crafting erraten),
 *          'craft-build' (Crafting bauen, nur `buildable`-Raetsel). Die Bau-Variante ist KEIN eigener Fragentyp, sondern eine Variante
 *          derselben Crafting-Frage; sie wird mit craftVariant() pro Frage gewuerfelt.
 *
 * Hardcore: ein Leben, Ziel-Rating (damit tier) steigt mit der Serie, alle Formate gemischt, kein Wiederholen, Diversitaet wie bei
 * Ranked (nie mehr als 2 gleiche Vorlagen und 3 gleiche Formate in Folge, hoechstens 3 je Vorlage, 4 je Kategorie). Ende beim ersten Fehler.
 *
 *   hardcore.newState()                          -> { streak, answered, correct, alive, used:[index], picked:[question], byTier, formats:{} }
 *   hardcore.targetRating(streak)                -> 900 + 190 * Serie (hoechstens 3800)
 *   hardcore.next(questions, state, rnd?, seen?, opts?) -> { index, question, variant:'guess'|'build', format, target, tier, buildSeconds? }
 *        seen = zuletzt gesehene Frage-IDs (aelteste zuerst), opts = { craftPref:'guess'|'mix'|'build' }
 *   hardcore.record(state, question, correct, variant?) -> state (bei Fehler alive=false)
 *   hardcore.summary(state)                      -> { streak, answered, correct, byTier, formats, alive }  (spoilerfrei)
 *   formatOf(question, variant?)                 -> Format (siehe oben)
 *   craftVariant(question, mode, pref?, rnd?)    -> 'guess' | 'build'
 *   MATRIX                                       -> je Modus erlaubte Formate und Gewichte (Dokumentation und Test)
 *   BUILD                                        -> { seconds:75, checks:3, share:{...} }
 *   selfTest(questions)
 */
(function (root) {
  'use strict';
  var R = (typeof module !== 'undefined' && module.exports) ? require('./ranked.js') : root.MGRanked;

  var BUILD = { seconds: 75, checks: 3 };
  // Anteil der Bau-Variante an buildable-Crafting-Fragen je Modus (nur wenn der Spieler Bauen nicht ausgeschlossen hat: pref !== 'guess')
  BUILD.share = { crafting: 0.5, endless: 0.35, categories: 0.35, joker: 0.35, daily: 0.3, hardcore: 0.4, challenge: 0, ranked: 0.35, blitz: 0 };

  // Format-Matrix: welche Formate ein Modus ziehen kann. Alle Modi ziehen Zahl, Name und ODER aus dem gemeinsamen Fragenpool;
  // Crafting-Raetsel liegen im Pool (Kategorie "Crafting", Typ crafting). Blitz und Challenge: Bau ausgeschlossen (60 s Gesamtzeit bzw. gleiche Fragen fuer alle ohne Bau-Zeitdruck).
  var ALL = ['number', 'entity', 'choice', 'tf', 'craft-guess'];
  var MATRIX = {
    endless:    { formats: ALL.concat('craft-build'), note: 'gesamter Pool, Diversitaet per diversify(); Bau-Variante je buildable-Rätsel gewürfelt' },
    blitz:      { formats: ALL, note: 'gesamter Pool, Crafting nur im Raten-Modus (60 s Gesamtzeit)' },
    daily:      { formats: ALL.concat('craft-build'), note: 'tägliche Fragen aus dem gesamten Pool (Seed = Datum); Bau-Variante je Frage-ID deterministisch' },
    joker:      { formats: ALL.concat('craft-build'), note: 'wie Endlos (Joker sind Tipps)' },
    categories: { formats: ALL.concat('craft-build'), note: 'Kategorie-Auswahl filtert den Pool; Crafting liegt in der Kategorie "Crafting", ODER-Fragen in den Vergleichs-Kategorien' },
    crafting:   { formats: ['craft-guess', 'craft-build'], note: 'eigener Modus: nur Crafting; Untermodus erraten/bauen/mix' },
    ranked:     { formats: ALL.concat('craft-build'), note: 'Server wählt über pickIndex; Bau-Variante nur, wenn der Client sie beim Start anmeldet (build:true), Server prüft das Raster' },
    hardcore:   { formats: ALL.concat('craft-build'), note: 'gesamter Pool nach Ziel-Rating, alle Formate gemischt' },
    challenge:  { formats: ALL, note: 'gleiche 10 Fragen für alle, Crafting nur im Raten-Modus' },
    tf:         { formats: ['tf'], note: 'eigener Solo-Modus Wahr oder Mythos: nur Fragen mit fmt tf; Multiplayer/Teams ziehen tf über den gemeinsamen Pool' }
  };

  /** Wahr-oder-Mythos-Frage (Format tf): technisch eine ODER-Frage mit den Optionen Wahr/Mythos. */
  function isTf(q) { return !!q && q.fmt === 'tf'; }

  function formatOf(q, variant) {
    if (q.type === 'crafting') return variant === 'build' ? 'craft-build' : 'craft-guess';
    if (q.fmt === 'tf') return 'tf';
    if (Array.isArray(q.choices) && q.choices.length === 2) return 'choice';
    return q.type === 'number' ? 'number' : 'entity';
  }

  /** Variante einer Crafting-Frage. pref: 'guess' (nie bauen), 'mix' (Standardanteil), 'build' (immer bauen, wenn moeglich). */
  function craftVariant(q, mode, pref, rnd) {
    if (!q || q.type !== 'crafting' || !q.buildable || !q.solution) return 'guess';
    pref = pref || 'mix';
    if (pref === 'guess') return 'guess';
    var share = BUILD.share[mode]; if (share == null) share = 0.35;
    if (mode === 'crafting' && pref === 'build') return 'build';
    if (!share) return 'guess';
    if (pref === 'build') share = Math.min(1, share + 0.3);
    return (rnd || Math.random)() < share ? 'build' : 'guess';
  }

  function targetRating(streak) { return Math.min(3800, 900 + 190 * Math.max(0, streak | 0)); }
  function fk(q) { return R.formatKey ? R.formatKey(q) : q.type; }

  var hardcore = {
    newState: function () { return { streak: 0, answered: 0, correct: 0, alive: true, used: [], picked: [], byTier: { 1: { n: 0, ok: 0 }, 2: { n: 0, ok: 0 }, 3: { n: 0, ok: 0 }, 4: { n: 0, ok: 0 } }, formats: {} }; },
    targetRating: targetRating,
    next: function (questions, state, rnd, seen, opts) {
      rnd = rnd || Math.random;
      var used = new Set(state.used);
      var ix = R.pickIndex(questions, targetRating(state.streak), used, rnd, { seen: seen || [], picked: state.picked });
      state.used.push(ix); state.picked.push(questions[ix]);
      if (state.used.length > questions.length - 5) state.used = [ix];
      var q = questions[ix];
      var variant = craftVariant(q, 'hardcore', opts && opts.craftPref, rnd);
      var out = { index: ix, question: q, variant: variant, format: formatOf(q, variant), target: targetRating(state.streak), tier: q.tier || 0 };
      if (variant === 'build') out.buildSeconds = BUILD.seconds;
      return out;
    },
    record: function (state, question, correct, variant) {
      state.answered++;
      var t = question && question.tier, f = question ? formatOf(question, variant) : 'x';
      if (t && state.byTier[t]) { state.byTier[t].n++; if (correct) state.byTier[t].ok++; }
      state.formats[f] = (state.formats[f] || 0) + 1;
      if (correct) { state.streak++; state.correct++; } else state.alive = false;
      return state;
    },
    summary: function (state) { return { streak: state.streak, answered: state.answered, correct: state.correct, byTier: state.byTier, formats: state.formats, alive: state.alive }; }
  };

  function selfTest(questions) {
    var seed = 99; var rnd = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    var avg = function (streak) { var t = 0; for (var i = 0; i < 300; i++) { var s = hardcore.newState(); s.streak = streak; t += hardcore.next(questions, s, rnd).question.rating; } return t / 300; };
    var lo = avg(0), hi = avg(15);
    if (!(hi > lo + 800)) throw new Error('Schwierigkeit steigt nicht: ' + Math.round(lo) + ' -> ' + Math.round(hi));
    var st = hardcore.newState(), ids = {}, formats = {};
    for (var i = 0; i < 400; i++) {
      if (i % 20 === 0) st = hardcore.newState();            // viele kurze Laeufe (die Kategorie-Obergrenze gilt je Lauf)
      st.streak = i % 14;                                   // Ziel-Rating durchlaufen (Formate verteilen sich ueber alle Schwierigkeiten)
      var n = hardcore.next(questions, st, rnd);
      if (st.used.slice(0, -1).indexOf(n.index) >= 0) throw new Error('Wiederholung im Lauf: ' + n.question.id);
      formats[n.format] = 1;
      hardcore.record(st, n.question, true, n.variant);
    }
    ['number', 'entity', 'choice', 'tf', 'craft-guess', 'craft-build'].forEach(function (f) { if (!formats[f]) throw new Error('Format fehlt: ' + f); });
    return 'Ziel-Rating Serie 0: ' + Math.round(lo) + ', Serie 15: ' + Math.round(hi) + ', Formate: ' + Object.keys(formats).join('/');
  }

  var api = { hardcore: hardcore, formatOf: formatOf, isTf: isTf, craftVariant: craftVariant, MATRIX: MATRIX, BUILD: BUILD, selfTest: selfTest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MGModes = api;
})(typeof window !== 'undefined' ? window : this);
