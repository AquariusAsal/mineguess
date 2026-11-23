/* Ich-Ansicht: nur bei klassischen Frage-Antwort-Formaten (Zahl, Entity-Eingabe, ODER, Wahr/Mythos).
   NICHT bei Crafting (Raten und Bauen), Hoeher/Tiefer und Sonderformaten. Reine Funktion, auch im Browser und im Test nutzbar. */
(function (root) {
  'use strict';
  // Format einer Frage: 'number' | 'entity' | 'choice' | 'tf' | 'crafting' | 'other'
  function formatOf(q) {
    if (!q || typeof q !== 'object') return 'other';
    if (q.mode === 'build' || q.build || q.type === 'crafting' || q.category === 'Crafting' && (q.grid || q.solution)) return 'crafting';
    if (q.fmt === 'tf') return 'tf';
    var ch = q.choices || q.options;
    if (q.type !== 'entity' && Array.isArray(q.choices) && q.choices.length === 2) return 'choice';
    if (q.type === 'number') return 'number';
    if (q.type === 'entity') return Array.isArray(ch) && ch.length === 2 ? 'choice' : 'entity';
    if (Array.isArray(ch) && ch.length === 2) return 'choice';
    return 'other';
  }
  function fpvAllowed(q) { var f = formatOf(q); return f === 'number' || f === 'entity' || f === 'choice' || f === 'tf'; }
  // Tipp-Button: nur bei Zahl und Entity-Eingabe, nie bei ODER, Wahr/Mythos, Crafting und nie in Hardcore, Challenge, Ranked ('competition')
  var NO_HINT_MODES = { competition: 1, ranked: 1, hardcore: 1, challenge: 1, hl: 1, crafting: 1 };
  function hintAllowed(mode, q) {
    if (NO_HINT_MODES[String(mode || '')]) return false;
    var f = typeof q === 'string' ? q : formatOf(q);
    return f === 'number' || f === 'entity';
  }
  var api = { formatOf: formatOf, fpvAllowed: fpvAllowed, hintAllowed: hintAllowed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MGFpvRules = api;
})(typeof window !== 'undefined' ? window : this);
