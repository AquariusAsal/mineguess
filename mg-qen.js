/* MineGuess englische Fragen (Anzeige). Nur aktiv, wenn die Sprache EN ist (MGI18n.lang). Deutsche Felder der Fragen bleiben unveraendert,
   die englische Fassung haengt als q.en = { question, answer?, acceptedAnswers?, choices?, funFact?, unit? } an der Frage (questions.en.json bzw. Server-Payload).
   Fehlt q.en (null in der Datei), wird Deutsch angezeigt. Antworten prueft answer-check.js in beiden Sprachen. */
(function (global) {
  'use strict';
  var en = !!(global.MGI18n && MGI18n.lang === 'en'), EN = null, cats = {}, toEn = {}, toDe = {}, aliases = null, names = null;
  var ready = Promise.resolve();
  function get(u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  if (en) ready = Promise.all([get('questions.en.json'), get('assets/mc/answers.en.json')]).then(function (r) {
    if (r[0]) { EN = r[0].q || {}; cats = r[0].categories || {}; }
    if (r[1]) { names = r[1].names || null; toEn = r[1].toEn || {}; aliases = r[1].aliases || null; Object.keys(toEn).forEach(function (k) { toDe[String(toEn[k]).toLowerCase()] = k; }); }
  });
  var api = {
    en: en, ready: ready,
    attach: function (arr) { if (!en || !EN || !Array.isArray(arr)) return arr; arr.forEach(function (q) { var e = EN[String(q.id)]; if (e) q.en = e; }); return arr; },
    has: function (q) { return !!(en && q && q.en); },
    cat: function (n) { return (en && cats[n]) || n; },
    q: function (q) { return (en && q && q.en && q.en.question) || (q && q.question) || ''; },
    ff: function (q) { return (en && q && q.en && q.en.funFact) || (q && q.funFact) || ''; },
    unit: function (q) { return (en && q && q.en && q.en.unit) || (q && q.unit) || ''; },
    ans: function (q) { return (en && q && q.en && q.en.answer) || (q && q.answer); },
    opt: function (q, n) { if (en && q && q.en && Array.isArray(q.en.choices) && Array.isArray(q.choices)) { var i = q.choices.indexOf(n); if (i >= 0 && q.en.choices[i]) return q.en.choices[i]; } return n; },
    optEn: function (enOpts, deOpts, n) { if (en && Array.isArray(enOpts) && Array.isArray(deOpts)) { var i = deOpts.indexOf(n); if (i >= 0 && enOpts[i]) return enOpts[i]; } return n; },
    deName: function (n) { return en ? (toDe[String(n).toLowerCase()] || n) : n; },
    byId: function (id) { return (en && EN && id != null) ? (EN[String(id)] || null) : null; },
    names: function () { return en ? names : null; },
    aliases: function () { return en ? aliases : null; }
  };
  global.MGQ = api;
})(window);
