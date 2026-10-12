/**
 * MineGuess – gemeinsame Antwortprüfung (Server + Browser).
 * Eine Quelle für Normalisierung, Zahlen-Parsing und Toleranz.
 * Browser: window.MGAnswer, Node: require('./answer-check.js')
 */
(function (root) {
  'use strict';

  // Umlaute/ß falten, Diakritika entfernen, nur a-z0-9 behalten,
  // führende Artikel (der/die/das/ein/eine/the/a) ignorieren.
  function normText(raw) {
    var s = String(raw == null ? '' : raw).toLowerCase().trim();
    s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    if (s.normalize) s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/^(der|die|das|ein|eine|the|a|an)\s+/, '');
    return s.replace(/[^a-z0-9]/g, '');
  }

  // Liefert Kandidatenwerte (Array) oder null, wenn keine Zahl erkennbar ist.
  // Akzeptiert "1,5", "1.5", "1.561", "1 561", "64 Blöcke", "-3".
  function parseNumbers(raw) {
    var s = String(raw == null ? '' : raw).toLowerCase().replace(/[  ]/g, ' ').trim();
    s = s.replace(/(\d)[ '’](?=\d{3}(?!\d))/g, '$1');
    var m = s.match(/-?(?:\d[\d.,]*|[.,]\d+)/);
    if (!m) return null;
    var t = m[0].replace(/[.,]+$/, '');
    var neg = t.charAt(0) === '-';
    if (neg) t = t.slice(1);
    if (/^[.,]/.test(t)) t = '0' + t;
    var out = [];
    var dots = (t.match(/\./g) || []).length;
    var commas = (t.match(/,/g) || []).length;
    if (dots && commas) {
      var dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
      var th = dec === '.' ? ',' : '.';
      out.push(parseFloat(t.split(th).join('').replace(dec, '.')));
    } else if (dots + commas > 1) {
      out.push(parseFloat(t.replace(/[.,]/g, '')));
    } else if (dots + commas === 1) {
      out.push(parseFloat(t.replace(',', '.')));
      if (/^\d{1,3}[.,]\d{3}$/.test(t)) out.push(parseFloat(t.replace(/[.,]/g, '')));
    } else {
      out.push(parseFloat(t));
    }
    out = out.filter(function (n) { return isFinite(n); }).map(function (n) { return neg ? -n : n; });
    return out.length ? out : null;
  }

  // q: { type, answer, tolerance, acceptedAnswers }
  // Rückgabe: { valid, correct, dir: 'ok'|'low'|'high'|'wrong', close }
  function check(q, raw) {
    if (!q) return { valid: false, correct: false, dir: 'wrong', close: false };
    var input = String(raw == null ? '' : raw);
    if (!input.trim()) return { valid: false, correct: false, dir: 'wrong', close: false };

    if (q.type === 'number') {
      var cands = parseNumbers(input);
      if (!cands) return { valid: false, correct: false, dir: 'wrong', close: false };
      var tol = Number(q.tolerance) || 0;
      for (var i = 0; i < cands.length; i++) {
        if (Math.abs(cands[i] - q.answer) <= tol + 1e-9) return { valid: true, correct: true, dir: 'ok', close: true };
      }
      var v = cands[0];
      var diff = Math.abs(v - q.answer);
      var pct = diff / Math.max(Math.abs(q.answer), 1);
      return { valid: true, correct: false, dir: v < q.answer ? 'low' : 'high', close: pct <= 0.15 || diff <= 2 };
    }

    var n = normText(input);
    if (!n) return { valid: false, correct: false, dir: 'wrong', close: false };
    var list = (q.acceptedAnswers && q.acceptedAnswers.length ? q.acceptedAnswers : [q.answer]).concat([q.answer]);
    for (var j = 0; j < list.length; j++) {
      if (normText(list[j]) === n) return { valid: true, correct: true, dir: 'ok', close: true };
    }
    return { valid: true, correct: false, dir: 'wrong', close: false };
  }

  var api = { normText: normText, parseNumbers: parseNumbers, check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MGAnswer = api;
})(typeof window !== 'undefined' ? window : this);
