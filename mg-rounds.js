/* MineGuess Rundenuebersicht: Liste aller Fragen des laufenden Solo-Laufs (Frage, deine Antwort, richtig, Punkte/MMR) mit "Frage melden".
   MGRounds.add({id, q, format, mode, answer, guesses[], correct, pts, mmr?}) · reset() · open() · count().
   Nur im Arbeitsspeicher (wird beim Start eines neuen Laufs geleert, nie gesendet). Melden laeuft ueber MGReport. */
(function (global) {
  'use strict';
  var log = [], dlg = null, last = null, verified = null;
  function loadVerified() { if (verified) return; verified = {}; fetch('/api/verified-questions', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && Array.isArray(j.ids)) { j.ids.forEach(function (i) { verified[i] = 1; }); if (dlg && dlg.classList.contains('open')) open(); } }).catch(function () {}); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString('de-DE'); }
  function syncBtn() { var b = document.getElementById('rounds-btn'); if (b) b.hidden = !log.length; }
  function add(e) { log.push(e); syncBtn(); }
  function reset() { log = []; syncBtn(); }
  function build() {
    dlg = document.createElement('div'); dlg.id = 'mg-rounds'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'mgro-title');
    dlg.innerHTML = '<div class="mgro-card"><button type="button" class="mg-close mg-close-abs" id="mgro-x" aria-label="Schließen"></button><h2 id="mgro-title">Rundenübersicht</h2><p class="mgro-sum" id="mgro-sum"></p><ol class="mgro-list" id="mgro-list"></ol><button type="button" class="btn" id="mgro-close">Schließen</button></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#mgro-x').addEventListener('click', close);
    dlg.querySelector('#mgro-close').addEventListener('click', close);
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) { close(); return; }
      var b = e.target.closest('.mgro-rep'); if (!b) return;
      var it = log[Number(b.getAttribute('data-i'))]; if (!it || !global.MGReport) return;
      MGReport.open({ mode: it.mode, format: it.format, questionId: it.id, round: it.n });
    });
    document.addEventListener('keydown', function (e) {
      if (!dlg.classList.contains('open')) return;
      if (e.key === 'Escape') { if (global.MGReport && document.getElementById('mg-report') && document.getElementById('mg-report').classList.contains('open')) return; e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') {
        var f = [].filter.call(dlg.querySelectorAll('button'), function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        if (!dlg.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
        else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }, true);
  }
  function open() {
    loadVerified();
    if (!dlg) build();
    last = document.activeElement;
    var ok = log.filter(function (e) { return e.correct; }).length, pts = log.reduce(function (a, e) { return a + (e.pts || 0); }, 0), mmr = log.reduce(function (a, e) { return a + (typeof e.mmr === 'number' ? e.mmr : 0); }, 0), hasMmr = log.some(function (e) { return typeof e.mmr === 'number'; });
    dlg.querySelector('#mgro-sum').textContent = log.length ? ok + ' von ' + log.length + ' richtig · ' + num(pts) + ' Punkte' + (hasMmr ? ' · ' + (mmr >= 0 ? '+' : '') + mmr + ' MMR' : '') : 'Noch keine Fragen gespielt.';
    dlg.querySelector('#mgro-list').innerHTML = log.map(function (e, i) {
      return '<li class="mgro-item ' + (e.correct ? 'ok' : 'bad') + '"><div class="mgro-top"><span class="mgro-n">' + (i + 1) + '</span><span class="mgro-res">' + (e.correct ? '✓ Richtig' : '✕ Falsch') + '</span>' +
        (verified && verified[e.id] ? '<span class="mgro-ok" title="Von uns geprüft">\u2713 Geprüft</span>' : '') + '<span class="mgro-pts">' + (e.pts >= 0 ? '+' : '') + num(e.pts) + ' Pkt.</span>' + (typeof e.mmr === 'number' ? '<span class="mgro-mmr">' + (e.mmr >= 0 ? '+' : '') + e.mmr + ' MMR</span>' : '') + '</div>' +
        '<p class="mgro-q">' + esc(e.q) + '</p><p class="mgro-a"><span>Deine Antwort: ' + esc((e.guesses && e.guesses.length) ? e.guesses.join(', ') : 'keine') + '</span><span>Richtig: <b>' + esc(e.answer) + '</b></span></p>' +
        (e.id ? '<button type="button" class="btn btn-ghost mgro-rep" data-i="' + i + '" aria-label="Frage ' + (i + 1) + ' melden">Frage melden</button>' : '') + '</li>';
    }).join('');
    dlg.classList.add('open'); dlg.querySelector('#mgro-close').focus();
  }
  function close() { if (!dlg) return; dlg.classList.remove('open'); if (last && last.focus) try { last.focus(); } catch (e) {} }
  global.MGRounds = { add: add, reset: reset, open: open, count: function () { return log.length; } };
})(window);
