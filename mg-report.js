/* MineGuess einheitlicher Melden-Dialog fuer alle Modi und Seiten.
   MGReport.open({ mode, format, questionId, round, room, players:[Namen] })  (fehlende Angaben kommen aus window.MGReportContext())
   Sendet nur JSON an POST /api/report (Backend leitet weiter; die Empfaengeradresse kennt der Client nie).
   Kategorien: Frage fehlerhaft/unklar/doppelt, Fehler (Bug), Cheat/Regelverstoss, Name/Skin, Vorschlag, Sonstiges.
   Kontext ohne Personenbezug: Modus, Frage-ID, Format, Runde, App-Version (Cache-Name), Geraeteart grob, bis zu 5 bereinigte Konsolenfehler, Zeitstempel.
   Schutz: Honeypot-Feld "website" (nie fuellen), "elapsed" (Dialog-Dauer), E-Mail nur mit ausdruecklicher Einwilligung. */
(function (global) {
  'use strict';
  var errors = [];
  function clean(s) { return String(s || '').replace(/https?:[/][/][^\s)]+/g, '<url>').replace(/[\r\n\t]+/g, ' ').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, '<mail>').slice(0, 140); }
  function push(msg) { msg = clean(msg); if (!msg) return; errors.push(msg); if (errors.length > 5) errors.shift(); }
  try {
    global.addEventListener('error', function (e) { push(e && e.message); });
    global.addEventListener('unhandledrejection', function (e) { push('Promise: ' + (e && e.reason && (e.reason.message || e.reason))); });
    var ce = console.error; console.error = function () { try { push([].slice.call(arguments).map(String).join(' ')); } catch (x) {} return ce.apply(console, arguments); };
  } catch (e) {}

  var CATS = [
    { id: 'frage:falsch', cat: 'frage', reason: 'falsch', label: 'Frage: Antwort ist falsch', needQ: true },
    { id: 'frage:unklar', cat: 'frage', reason: 'unklar', label: 'Frage: unklar formuliert', needQ: true },
    { id: 'frage:doppelt', cat: 'frage', reason: 'doppelt', label: 'Frage: doppelt', needQ: true },
    { id: 'bug', cat: 'bug', label: 'Technischer Fehler', text: true },
    { id: 'cheat', cat: 'cheat', label: 'Cheat oder Regelverstoß', player: true },
    { id: 'name', cat: 'name', label: 'Unangemessener Name oder Skin', player: true },
    { id: 'vorschlag', cat: 'vorschlag', label: 'Vorschlag', text: true },
    { id: 'sonstiges', cat: 'sonstiges', label: 'Sonstiges', text: true }
  ];
  var dlg = null, opened = 0, ctx = null, picked = null, last = null, sending = false;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function appVersion() {
    try { return (global.caches && caches.keys) ? caches.keys().then(function (k) { var m = k.filter(function (x) { return /^mineguess-/.test(x); }); return m.length ? m[m.length - 1] : ''; }).catch(function () { return ''; }) : Promise.resolve(''); } catch (e) { return Promise.resolve(''); }
  }
  function build() {
    dlg = document.createElement('div'); dlg.id = 'mg-report'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'mgr-title');
    dlg.innerHTML = '<div class="mgr-card"><button type="button" class="mg-close mg-close-abs" id="mgr-x" aria-label="Schließen"></button>' +
      '<h2 id="mgr-title">Melden</h2><p class="mgr-sub" id="mgr-sub"></p>' +
      '<div role="radiogroup" aria-labelledby="mgr-title" id="mgr-cats" class="mgr-cats"></div>' +
      '<div id="mgr-player-row" class="mgr-row" hidden><label for="mgr-player">Spieler</label><select id="mgr-player" class="form-input"></select></div>' +
      '<div class="mgr-row"><label for="mgr-text">Anmerkung <span id="mgr-req" class="mgr-opt">(optional, max. 300 Zeichen)</span></label><textarea id="mgr-text" maxlength="300" rows="3" class="report-text" placeholder="Was ist passiert?"></textarea></div>' +
      '<div class="mgr-row"><label class="mgr-check"><input type="checkbox" id="mgr-consent"> Ich darf für Rückfragen per E-Mail kontaktiert werden (freiwillig)</label>' +
      '<input id="mgr-email" type="email" class="form-input" maxlength="120" autocomplete="email" placeholder="E-Mail (nur mit Haken)" disabled></div>' +
      '<label class="mgr-check" id="mgr-link-row" hidden><input type="checkbox" id="mgr-link" checked> Meldung anonym mit meinem Profil verknüpfen (für das Abzeichen „Fehlerjäger“). Die Zuordnung wird nach der Prüfung gelöscht.</label>' +
      '<div class="mgr-hp" aria-hidden="true"><label>Website <input type="text" id="mgr-website" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"></label></div>' +
      '<p class="mgr-note">Es werden nur Modus, Frage, App-Version, grobe Geräteart und bis zu 5 Fehlermeldungen mitgesendet, keine IP-Adresse. Details in der <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a>.</p>' +
      '<div class="mgr-msg" id="mgr-msg" role="status" aria-live="polite"></div>' +
      '<div class="mgr-btns"><button type="button" class="btn btn-primary" id="mgr-send" disabled>Senden</button><button type="button" class="btn btn-ghost" id="mgr-cancel">Abbrechen</button></div></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#mgr-x').addEventListener('click', close);
    dlg.querySelector('#mgr-cancel').addEventListener('click', close);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    dlg.querySelector('#mgr-cats').addEventListener('click', function (e) { var b = e.target.closest('.mgr-opt-btn'); if (b) pick(b.getAttribute('data-id')); });
    dlg.querySelector('#mgr-consent').addEventListener('change', function (e) { var m = dlg.querySelector('#mgr-email'); m.disabled = !e.target.checked; if (!e.target.checked) m.value = ''; });
    dlg.querySelector('#mgr-text').addEventListener('input', validate);
    dlg.querySelector('#mgr-player').addEventListener('change', validate);
    dlg.querySelector('#mgr-send').addEventListener('click', send);
    document.addEventListener('keydown', function (e) {
      if (!dlg.classList.contains('open')) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') {
        var f = [].filter.call(dlg.querySelectorAll('button, input, select, textarea'), function (n) { return !n.disabled && n.offsetParent !== null && !n.closest('.mgr-hp'); });
        if (!f.length) return;
        if (!dlg.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
        else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }, true);
  }
  function pick(id) {
    picked = CATS.filter(function (c) { return c.id === id; })[0] || null;
    [].forEach.call(dlg.querySelectorAll('.mgr-opt-btn'), function (b) { var on = b.getAttribute('data-id') === id; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('picked', on); });
    var pl = dlg.querySelector('#mgr-player-row'), has = ctx.players && ctx.players.length;
    pl.hidden = !(picked && picked.player && has);
    dlg.querySelector('#mgr-req').textContent = picked && picked.text ? '(erforderlich, max. 300 Zeichen)' : '(optional, max. 300 Zeichen)';
    validate();
  }
  function validate() {
    var ok = !!picked;
    if (ok && picked.text && !dlg.querySelector('#mgr-text').value.trim()) ok = false;
    if (ok && picked.player && ctx.players && ctx.players.length && !dlg.querySelector('#mgr-player').value) ok = false;
    dlg.querySelector('#mgr-send').disabled = !ok || sending;
  }
  function open(o) {
    if (!dlg) build();
    var base = {}; try { base = (global.MGReportContext && global.MGReportContext()) || {}; } catch (e) {}
    ctx = {}; [base, o || {}].forEach(function (s) { Object.keys(s).forEach(function (k) { if (s[k] != null && s[k] !== '') ctx[k] = s[k]; }); });
    ctx.mode = ctx.mode || 'other';
    last = document.activeElement; opened = Date.now(); picked = null; sending = false;
    var hasQ = Number(ctx.questionId) > 0;
    dlg.querySelector('#mgr-cats').innerHTML = CATS.filter(function (c) { return !c.needQ || hasQ; }).map(function (c) {
      return '<button type="button" class="mgr-opt-btn" role="radio" aria-checked="false" data-id="' + c.id + '">' + esc(c.label) + '</button>';
    }).join('');
    dlg.querySelector('#mgr-sub').textContent = hasQ ? 'Frage ' + ctx.questionId + (ctx.format ? ' · ' + ctx.format : '') : 'Was möchtest du melden?';
    var sel = dlg.querySelector('#mgr-player');
    sel.innerHTML = '<option value="">Bitte wählen</option>' + (ctx.players || []).map(function (n) { return '<option>' + esc(String(n).slice(0, 20)) + '</option>'; }).join('');
    dlg.querySelector('#mgr-text').value = ''; dlg.querySelector('#mgr-consent').checked = false; var m = dlg.querySelector('#mgr-email'); m.value = ''; m.disabled = true;
    dlg.querySelector('#mgr-website').value = ''; dlg.querySelector('#mgr-msg').textContent = '';
    var hasPt = false; try { hasPt = !!localStorage.getItem('mg_pt'); } catch (e) {}
    dlg.querySelector('#mgr-link-row').hidden = !hasPt; dlg.querySelector('#mgr-link').checked = true;
    dlg.querySelector('#mgr-player-row').hidden = true;
    if (ctx.mode === 'profile' && ctx.players && ctx.players.length === 1) sel.value = String(ctx.players[0]).slice(0, 20);
    validate();
    dlg.classList.add('open');
    var f = dlg.querySelector('.mgr-opt-btn'); if (f) f.focus();
  }
  function close() {
    if (!dlg) return; dlg.classList.remove('open');
    if (last && last.focus) try { last.focus(); } catch (e) {}
  }
  function send() {
    if (!picked || sending) return;
    sending = true; validate();
    var msg = dlg.querySelector('#mgr-msg');
    appVersion().then(function (app) {
      var body = {
        category: picked.cat, mode: ctx.mode, text: dlg.querySelector('#mgr-text').value.trim().slice(0, 300),
        elapsed: Date.now() - opened, website: dlg.querySelector('#mgr-website').value,
        context: { app: app, device: (global.matchMedia && matchMedia('(pointer: coarse)').matches) ? 'mobil' : 'desktop', errors: errors.slice(), ts: Date.now() }
      };
      if (picked.reason) body.reason = picked.reason;
      try { var pt = localStorage.getItem('mg_pt'); if (pt && dlg.querySelector('#mgr-link').checked) body.pt = pt; } catch (e) {}
      if (ctx.format) body.format = ctx.format;
      if (Number(ctx.questionId) > 0) body.questionId = Number(ctx.questionId);
      if (Number(ctx.round) > 0) body.round = Number(ctx.round);
      if (ctx.room && (ctx.mode === 'multiplayer' || ctx.mode === 'teams')) body.room = String(ctx.room).slice(0, 24);
      if (picked.player && dlg.querySelector('#mgr-player').value && (ctx.mode === 'multiplayer' || ctx.mode === 'teams' || ctx.mode === 'profile')) body.player = dlg.querySelector('#mgr-player').value.slice(0, 20);
      if (dlg.querySelector('#mgr-consent').checked && dlg.querySelector('#mgr-email').value.trim()) { body.consent = true; body.email = dlg.querySelector('#mgr-email').value.trim().slice(0, 120); }
      return fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }).then(function (r) {
      sending = false;
      if (r.status === 429) { msg.textContent = 'Bitte kurz warten, bevor du erneut meldest.'; validate(); return; }
      if (!r.ok) { msg.textContent = 'Das konnte nicht gesendet werden. Bitte prüfe deine Angaben.'; validate(); return; }
      msg.textContent = 'Danke für deine Meldung!';
      if (global.showToast) try { global.showToast('Danke für deine Meldung!', 2200); } catch (e) {}
      setTimeout(close, 900);
    }).catch(function () { sending = false; msg.textContent = 'Keine Verbindung. Bitte später erneut versuchen.'; validate(); });
  }
  global.MGReport = { open: open, close: close };
})(window);
