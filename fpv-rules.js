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
  var api = { formatOf: formatOf, fpvAllowed: fpvAllowed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MGFpvRules = api;
})(typeof window !== 'undefined' ? window : this);
