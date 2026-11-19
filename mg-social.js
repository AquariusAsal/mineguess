/* MineGuess Profil und Freunde (Instagram-Stil, kindersicher): Profilkopf, Statistik-Raster, Abzeichen, Freundescode, Anfragen, Freundesliste.
   Backend: /api/profile/* und /api/friends/* (siehe docs/team/API-NOTES.md "Phase 2 und 3"). Kein Freitext, kein Foto, kein Chat.
   Standard: alles privat. Anmeldung ueber das signierte Ranked-Token; Profil-Token lokal (mg_pt). Haken "14+ oder Eltern erlauben es" Pflicht.
   MGSocial.open() */
(function (global) {
  'use strict';
  var KEY_PT = 'mg_pt';
  var TITLES = { '': 'Kein Titel', redstone_profi: 'Redstone-Profi', baumeister: 'Baumeister', entdecker: 'Entdecker', sammler: 'Sammler', kampfhase: 'Kampfhase', tueftler: 'Tüftler' };
  var VIS = { private: 'Nur ich', friends: 'Freunde', public: 'Alle' };
  var AREAS = { header: 'Profilkopf', stats: 'Statistik', badges: 'Abzeichen', rank: 'Rang' };
  var ERR = { rate: 'Bitte kurz warten.', auth: 'Bitte neu anmelden.', token: 'Anmeldung nicht möglich. Spiele einmal Ranked oder lade die Seite neu.', einwilligung: 'Bitte den Haken zur Einwilligung setzen.', existiert: 'Du hast schon ein Profil.',
    name_format: 'Name: 3 bis 16 Zeichen aus a-z, 0-9, _ und -.', name_reserviert: 'Dieser Name ist reserviert.', name_unzulaessig: 'Dieser Name ist nicht erlaubt.', name_vergeben: 'Dieser Name ist schon vergeben.',
    kein_profil: 'Es gibt noch kein Profil.', nicht_gefunden: 'Nicht gefunden. Prüfe den Code.', umbenennen_gesperrt: 'Umbenennen ist nur alle 30 Tage möglich.' };
  var dlg = null, last = null, pt = null, me = null, tab = 'profil', busy = false;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function errText(j, st) {
    if (st === 429) return 'Bitte kurz warten.';
    var e = j && (j.error || j.reason); if (!e) return 'Das hat nicht geklappt.';
    if (ERR[e]) return ERR[e]; if (/^limit_/.test(e)) return 'Limit erreicht. Bitte später erneut versuchen.'; return 'Das hat nicht geklappt (' + e + ').';
  }
  function api(path, body, method) {
    var h = { 'Content-Type': 'application/json' }; if (pt) h.Authorization = 'Bearer ' + pt;
    var o = { method: method || (body === undefined ? 'GET' : 'POST'), headers: h }; if (body !== undefined && o.method !== 'GET') o.body = JSON.stringify(body);
    return fetch('api/' + path, o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok !== false, st: r.status, j: j }; }); }).catch(function () { return { ok: false, st: 0, j: {} }; });
  }
  function head(name, ch, size) {
    var skin = global.MGSkin && MGSkin.imgHTML ? MGSkin.imgHTML(null, size || 'lg', ch || 'steve') : '';
    return '<span class="sc-av" aria-hidden="true">' + skin + '</span>';
  }
  function say(t, bad) { var m = dlg.querySelector('#sc-msg'); m.textContent = t || ''; m.className = 'sc-msg' + (bad ? ' bad' : ''); }

  // ── Ranked-Token holen (ohne einen Lauf zu starten, den Spieler spielt) ──
  function rankedToken() {
    var t = ls('mg_ranked_token'); if (t) return Promise.resolve(t);
    if (typeof global.rankedEnsure !== 'function' || typeof global.rankedGid !== 'function') return Promise.resolve('');
    var p = global.rankedEnsure(), body = { name: ls('mg_player_name') || 'Gast', gid: global.rankedGid(), profile: p, history: p.history, token: '', seen: [] };
    return fetch('api/ranked/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.token) { ls('mg_ranked_token', j.token); return j.token; } return ''; }).catch(function () { return ''; });
  }

  // ── Rahmen ──
  function build() {
    dlg = document.createElement('div'); dlg.id = 'mg-social'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'sc-title');
    dlg.innerHTML = '<div class="sc-card"><button type="button" class="mg-close mg-close-abs" id="sc-x" aria-label="Schließen"></button><h2 id="sc-title">Profil und Freunde</h2><div id="sc-body"></div><div class="sc-msg" id="sc-msg" role="status" aria-live="polite"></div></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#sc-x').addEventListener('click', close);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    document.addEventListener('keydown', function (e) {
      if (!dlg.classList.contains('open')) return;
      var rep = document.getElementById('mg-report'); if (rep && rep.classList.contains('open')) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') {
        var f = [].filter.call(dlg.querySelectorAll('button, input, select, a[href]'), function (n) { return !n.disabled && n.offsetParent !== null; });
        if (!f.length) return;
        if (!dlg.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
        else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }, true);
  }
  function body() { return dlg.querySelector('#sc-body'); }
  function open() {
    if (!dlg) build();
    last = document.activeElement; pt = ls(KEY_PT); me = null; say('');
    dlg.classList.add('open');
    if (!pt) { renderCreate(); return; }
    body().innerHTML = '<p class="sc-muted">Lade …</p>';
    api('profile/me').then(function (r) {
      if (!r.ok || !r.j.me) { if (r.st === 401 || r.st === 403 || (r.j && (r.j.error === 'auth' || r.j.error === 'kein_profil'))) { ls(KEY_PT, null); pt = null; renderCreate(); } else { body().innerHTML = '<p class="sc-muted">Das Profil ist gerade nicht erreichbar.</p>'; } return; }
      me = r.j.me; tab = 'profil'; syncStats(); render();
    });
  }
  function close() { if (!dlg) return; dlg.classList.remove('open'); if (last && last.focus) try { last.focus(); } catch (e) {} }

  // ── Konto erstellen ──
  function renderCreate() {
    var ch = (global.MGSkin && MGSkin.getCharacter && MGSkin.getCharacter()) || 'steve', nm = (ls('mg_player_name') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);
    body().innerHTML = '<p>Mit einem Profil kannst du Freunde per Code hinzufügen. Standard: Dein Profil ist <b>privat</b>. Es gibt keinen Chat, keine Fotos und keinen Freitext.</p>' +
      '<div class="sc-row"><label for="sc-name">Profilname (3 bis 16 Zeichen: a-z, 0-9, _ und -)</label><input id="sc-name" class="form-input" maxlength="16" autocomplete="off" autocapitalize="off" value="' + esc(nm) + '"></div>' +
      '<div class="sc-row"><span>Figur</span><span class="sc-chars" id="sc-chars">' + ['steve', 'alex'].map(function (c) { return '<button type="button" class="chip' + (c === ch ? ' on' : '') + '" data-c="' + c + '" aria-pressed="' + (c === ch) + '">' + (c === 'steve' ? 'Steve' : 'Alex') + '</button>'; }).join('') + '</span></div>' +
      '<label class="sc-check"><input type="checkbox" id="sc-age"> Ich bin 14 Jahre oder älter, oder meine Eltern erlauben es.</label>' +
      '<p class="sc-note">Gespeichert werden Profilname, Figur und Einstellungen (siehe <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutz</a>). Du kannst dein Profil jederzeit exportieren oder löschen.</p>' +
      '<div class="sc-btns"><button type="button" class="btn btn-primary" id="sc-create">Profil erstellen</button></div>';
    var chosen = ch;
    body().querySelector('#sc-chars').addEventListener('click', function (e) { var b = e.target.closest('button[data-c]'); if (!b) return; chosen = b.getAttribute('data-c'); [].forEach.call(this.children, function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); });
    body().querySelector('#sc-create').addEventListener('click', function () {
      if (busy) return; var name = body().querySelector('#sc-name').value.trim().toLowerCase(), age = body().querySelector('#sc-age').checked;
      if (!age) { say(ERR.einwilligung, true); return; }
      busy = true; say('Einen Moment …');
      rankedToken().then(function (t) {
        if (!t) { busy = false; say(ERR.token, true); return; }
        return api('profile/create', { token: t, name: name, age14: true, character: chosen }).then(function (r) {
          busy = false;
          if (!r.ok) { say(errText(r.j, r.st), true); return; }
          pt = r.j.pt; ls(KEY_PT, pt); me = r.j.me; tab = 'profil'; say('Profil erstellt.'); syncStats(); render();
        });
      });
    });
    var f = body().querySelector('#sc-name'); if (f) f.focus();
  }

  // Statistik (selbstberichtet, nur zur Anzeige) an den Server geben
  function syncStats() {
    if (!global.MGBadges || !pt) return;
    try {
      var s = MGBadges.summary(), cats = {}; (MGBadges.categoryStats() || []).forEach(function (c) { cats[c.category] = { c: c.correct, t: c.total }; });
      api('profile/update', { stats: { answered: s.answered || 0, correct: s.correct || 0, bestStreak: s.bestStreak || 0, byCategory: cats, hlBest: parseInt(ls('mg_hl_best'), 10) || 0, hardcoreBest: parseInt(ls('mg_hc_best'), 10) || 0 }, badges: (MGBadges.album ? MGBadges.album().filter(function (a) { return a.unlocked; }).map(function (a) { return a.id; }) : []) });
    } catch (e) {}
  }

  // ── Profilansicht ──
  function render() {
    var tabs = [['profil', 'Profil'], ['freunde', 'Freunde'], ['privat', 'Privatsphäre']];
    var html = '<div role="tablist" aria-label="Bereiche" class="sc-tabs">' + tabs.map(function (t) { return '<button type="button" role="tab" id="sc-t-' + t[0] + '" aria-selected="' + (tab === t[0]) + '" aria-controls="sc-p" data-t="' + t[0] + '" tabindex="' + (tab === t[0] ? 0 : -1) + '" class="sc-tab' + (tab === t[0] ? ' on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="sc-p" role="tabpanel" aria-labelledby="sc-t-' + tab + '"></div>';
    body().innerHTML = html;
    body().querySelector('.sc-tabs').addEventListener('click', function (e) { var b = e.target.closest('.sc-tab'); if (b) { tab = b.getAttribute('data-t'); render(); var n = body().querySelector('.sc-tab.on'); if (n) n.focus(); } });
    body().querySelector('.sc-tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; var i = tabs.map(function (t) { return t[0]; }).indexOf(tab); i = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; tab = tabs[i][0]; render(); body().querySelector('.sc-tab.on').focus();
    });
    if (tab === 'profil') renderProfile(); else if (tab === 'freunde') renderFriends(); else renderPrivacy();
  }
  function stat(l, v) { return '<div class="sc-stat"><b>' + esc(v == null ? '–' : v) + '</b><span>' + esc(l) + '</span></div>'; }
  function renderProfile() {
    var p = body().querySelector('#sc-p'), st = me.stats || {}, rk = me.rank, bd = me.badges || [];
    p.innerHTML = '<div class="sc-head">' + head(me.name, me.character) + '<div class="sc-who"><h3>' + esc(me.name) + '</h3><span class="sc-title">' + esc(TITLES[me.title || ''] || '') + '</span>' +
      '<span class="sc-counts">' + ((me.counts && me.counts.friends) || 0) + ' Freunde</span></div></div>' +
      '<div class="sc-grid">' + stat('Antworten', st.answered) + stat('Richtig', st.correct) + stat('Beste Serie', st.bestStreak) + stat('Höher/Tiefer', st.hlBest) + stat('Hardcore', st.hardcoreBest) + stat('Abzeichen', bd.length) + '</div>' +
      (rk ? '<p class="sc-muted">Rang: ' + esc(rk.label || rk.rank || '') + (rk.mmr ? ' · ' + esc(rk.mmr) + ' MMR' : '') + '</p>' : '') +
      '<div class="sc-row"><label for="sc-title-sel">Titel</label><select id="sc-title-sel" class="form-input">' + Object.keys(TITLES).map(function (k) { return '<option value="' + k + '"' + ((me.title || '') === k ? ' selected' : '') + '>' + esc(TITLES[k]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="sc-code"><span class="sc-muted">Dein Freundescode</span><b id="sc-code">' + esc(me.friendCode || 'noch keiner') + '</b><span class="sc-btns"><button type="button" class="btn" id="sc-code-new">' + (me.friendCode ? 'Neuer Code' : 'Code erzeugen') + '</button>' + (me.friendCode ? '<button type="button" class="btn" id="sc-code-copy">Kopieren</button>' : '') + '</span>' +
      '<span class="sc-note">Der Code ist 30 Tage gültig. Nur wer ihn kennt, kann dir eine Anfrage senden.</span></div>';
    p.querySelector('#sc-title-sel').addEventListener('change', function (e) { api('profile/update', { title: e.target.value }).then(function (r) { if (r.ok) { me.title = e.target.value; render(); say('Titel gespeichert.'); } else say(errText(r.j, r.st), true); }); });
    p.querySelector('#sc-code-new').addEventListener('click', function () { api('profile/update', { newCode: true }).then(function (r) { if (!r.ok) { say(errText(r.j, r.st), true); return; } return api('profile/me').then(function (m) { if (m.ok) { me = m.j.me; render(); say('Neuer Code erzeugt.'); } }); }); });
    var cp = p.querySelector('#sc-code-copy'); if (cp) cp.addEventListener('click', function () { (navigator.clipboard ? navigator.clipboard.writeText(me.friendCode) : Promise.reject()).then(function () { say('Code kopiert.'); }, function () { say('Kopieren nicht möglich.', true); }); });
  }

  // ── Freunde ──
  function row(u, actions) {
    return '<li class="sc-fr" data-pid="' + esc(u.pid) + '">' + head(u.name, u.character, 'sm') + '<span class="sc-fn">' + esc(u.name) + '</span><span class="sc-fa">' + actions + '</span></li>';
  }
  function renderFriends() {
    var p = body().querySelector('#sc-p');
    p.innerHTML = '<div class="sc-row"><label for="sc-add">Freund hinzufügen (Code, z. B. ABCD-2345)</label><span class="sc-inline"><input id="sc-add" class="form-input" maxlength="9" autocomplete="off" autocapitalize="characters"><button type="button" class="btn btn-primary" id="sc-find">Suchen</button></span></div><div id="sc-found"></div><div id="sc-list"><p class="sc-muted">Lade …</p></div>';
    p.querySelector('#sc-find').addEventListener('click', find);
    p.querySelector('#sc-add').addEventListener('keydown', function (e) { if (e.key === 'Enter') find(); });
    loadFriends();
  }
  function find() {
    var code = body().querySelector('#sc-add').value.trim().toUpperCase(); if (!code) return;
    api('profile/lookup', { code: code }).then(function (r) {
      var f = body().querySelector('#sc-found'); if (!f) return;
      if (!r.ok || !r.j.user) { f.innerHTML = ''; say(errText(r.j, r.st), true); return; }
      var u = r.j.user, rel = r.j.relation, act = rel === 'none' ? '<button type="button" class="btn btn-primary" data-a="req" data-code="' + esc(code) + '">Anfrage senden</button>' : (rel === 'friend' ? '<span class="sc-muted">Schon befreundet</span>' : (rel === 'requested' ? '<span class="sc-muted">Anfrage gesendet</span>' : '<button type="button" class="btn btn-primary" data-a="acc" data-pid="' + esc(u.pid) + '">Annehmen</button>'));
      f.innerHTML = '<ul class="sc-flist">' + row(u, act) + '</ul>'; say('');
      f.onclick = function (e) {
        var b = e.target.closest('button[data-a]'); if (!b) return;
        if (b.getAttribute('data-a') === 'req') api('friends/request', { code: b.getAttribute('data-code') }).then(function (r2) { if (r2.ok) { say(r2.j.status === 'friends' ? 'Ihr seid jetzt befreundet.' : 'Anfrage gesendet.'); f.innerHTML = ''; loadFriends(); } else say(errText(r2.j, r2.st), true); });
        else api('friends/respond', { pid: b.getAttribute('data-pid'), accept: true }).then(function (r2) { if (r2.ok) { say('Ihr seid jetzt befreundet.'); f.innerHTML = ''; loadFriends(); } else say(errText(r2.j, r2.st), true); });
      };
    });
  }
  function loadFriends() {
    api('friends').then(function (r) {
      var l = body().querySelector('#sc-list'); if (!l) return;
      if (!r.ok) { l.innerHTML = '<p class="sc-muted">Die Freundesliste ist gerade nicht erreichbar.</p>'; return; }
      var j = r.j, h = '';
      if ((j.incoming || []).length) h += '<h3 class="sc-h">Anfragen an dich</h3><ul class="sc-flist">' + j.incoming.map(function (u) { return row(u, '<button type="button" class="btn btn-primary" data-a="yes" data-pid="' + esc(u.pid) + '" aria-label="Anfrage von ' + esc(u.name) + ' annehmen">Annehmen</button><button type="button" class="btn" data-a="no" data-pid="' + esc(u.pid) + '" aria-label="Anfrage von ' + esc(u.name) + ' ablehnen">Ablehnen</button>'); }).join('') + '</ul>';
      h += '<h3 class="sc-h">Freunde (' + (j.friends || []).length + ')</h3>' + ((j.friends || []).length ? '<ul class="sc-flist">' + j.friends.map(function (u) { return row(u, '<button type="button" class="btn" data-a="view" data-pid="' + esc(u.pid) + '" aria-label="Profil von ' + esc(u.name) + '">Profil</button><button type="button" class="btn btn-ghost" data-a="rm" data-pid="' + esc(u.pid) + '" data-n="' + esc(u.name) + '" aria-label="' + esc(u.name) + ' entfernen">Entfernen</button>'); }).join('') + '</ul>' : '<p class="sc-muted">Noch keine Freunde. Tausche Codes mit Leuten, die du kennst.</p>');
      if ((j.outgoing || []).length) h += '<h3 class="sc-h">Gesendete Anfragen</h3><ul class="sc-flist">' + j.outgoing.map(function (u) { return row(u, '<span class="sc-muted">wartet</span>'); }).join('') + '</ul>';
      l.innerHTML = h;
      l.onclick = function (e) {
        var b = e.target.closest('button[data-a]'); if (!b) return; var a = b.getAttribute('data-a'), pid = b.getAttribute('data-pid');
        if (a === 'yes' || a === 'no') api('friends/respond', { pid: pid, accept: a === 'yes' }).then(function (r2) { if (r2.ok) { loadFriends(); say(a === 'yes' ? 'Angenommen.' : 'Abgelehnt.'); } else say(errText(r2.j, r2.st), true); });
        else if (a === 'rm') { if (confirm(b.getAttribute('data-n') + ' wirklich aus den Freunden entfernen?')) api('friends/remove', { pid: pid }).then(function (r2) { if (r2.ok) { loadFriends(); say('Entfernt.'); } else say(errText(r2.j, r2.st), true); }); }
        else if (a === 'view') viewFriend(pid);
      };
    });
  }
  function viewFriend(pid) {
    api('profile/view?pid=' + encodeURIComponent(pid)).then(function (r) {
      if (!r.ok || !r.j.profile) { say('Dieses Profil ist nicht sichtbar.', true); return; }
      var p = r.j.profile, st = p.stats;
      body().innerHTML = '<button type="button" class="btn btn-ghost" id="sc-back">Zurück</button><div class="sc-head">' + head(p.name, p.character) + '<div class="sc-who"><h3>' + esc(p.name) + '</h3><span class="sc-title">' + esc(TITLES[p.title || ''] || '') + '</span></div></div>' +
        (st ? '<div class="sc-grid">' + stat('Antworten', st.answered) + stat('Richtig', st.correct) + stat('Beste Serie', st.bestStreak) + stat('Höher/Tiefer', st.hlBest) + stat('Hardcore', st.hardcoreBest) + stat('Abzeichen', (p.badges || []).length) + '</div>' : '<p class="sc-muted">Mehr zeigt dieses Profil nicht.</p>') +
        '<div class="sc-btns"><button type="button" class="btn btn-ghost" id="sc-rep">Melden</button><button type="button" class="btn btn-ghost" id="sc-block">Blockieren</button></div>';
      body().querySelector('#sc-back').addEventListener('click', function () { tab = 'freunde'; render(); });
      body().querySelector('#sc-rep').addEventListener('click', function () { if (global.MGReport) MGReport.open({ mode: 'profile', players: [p.name] }); });
      body().querySelector('#sc-block').addEventListener('click', function () { if (confirm(p.name + ' blockieren? Die Freundschaft endet und ihr seht einander nicht mehr.')) api('profile/block', { pid: pid, block: true }).then(function (r2) { if (r2.ok) { tab = 'freunde'; render(); say('Blockiert.'); } else say(errText(r2.j, r2.st), true); }); });
    });
  }

  // ── Privatsphaere ──
  function renderPrivacy() {
    var p = body().querySelector('#sc-p'), v = me.visibility || {};
    p.innerHTML = '<p class="sc-note">Wer darf was sehen? Standard ist überall „Nur ich“. Fremde sehen ein komplett privates Profil gar nicht.</p>' +
      Object.keys(AREAS).map(function (k) { return '<div class="sc-row"><label for="sc-v-' + k + '">' + AREAS[k] + '</label><select id="sc-v-' + k + '" data-k="' + k + '" class="form-input">' + Object.keys(VIS).map(function (o) { return '<option value="' + o + '"' + ((v[k] || 'private') === o ? ' selected' : '') + '>' + VIS[o] + '</option>'; }).join('') + '</select></div>'; }).join('') +
      '<h3 class="sc-h">Deine Daten</h3><div class="sc-btns"><button type="button" class="btn" id="sc-export">Daten herunterladen</button><button type="button" class="btn btn-ghost" id="sc-logout">Auf diesem Gerät abmelden</button></div>' +
      '<h3 class="sc-h">Profil löschen</h3><p class="sc-note">Entfernt Profil, Freundschaften und Anfragen endgültig. Zum Bestätigen LOESCHEN eintippen.</p><div class="sc-inline"><input id="sc-del" class="form-input" autocomplete="off" aria-label="Zum Löschen LOESCHEN eintippen"><button type="button" class="btn" id="sc-del-go">Endgültig löschen</button></div>';
    p.addEventListener('change', function (e) {
      var s = e.target.closest('select[data-k]'); if (!s) return; var vis = {}; vis[s.getAttribute('data-k')] = s.value;
      api('profile/update', { visibility: vis }).then(function (r) { if (r.ok) { me.visibility = Object.assign({}, me.visibility, vis); say('Gespeichert.'); } else say(errText(r.j, r.st), true); });
    });
    p.querySelector('#sc-export').addEventListener('click', function () {
      api('profile/export').then(function (r) { if (!r.ok) { say(errText(r.j, r.st), true); return; } var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(r.j, null, 2)], { type: 'application/json' })); a.download = 'mineguess-profil.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); say('Download gestartet.'); });
    });
    p.querySelector('#sc-logout').addEventListener('click', function () { ls(KEY_PT, null); pt = null; me = null; say('Abgemeldet. Dein Profil bleibt auf dem Server, bis du es löschst.'); renderCreate(); });
    p.querySelector('#sc-del-go').addEventListener('click', function () {
      if (p.querySelector('#sc-del').value.trim() !== 'LOESCHEN') { say('Bitte LOESCHEN eintippen.', true); return; }
      api('profile/delete', { confirm: 'LOESCHEN' }).then(function (r) { if (r.ok) { ls(KEY_PT, null); pt = null; me = null; renderCreate(); say('Profil gelöscht.'); } else say(errText(r.j, r.st), true); });
    });
  }
  global.MGSocial = { open: open, close: close };
})(window);
