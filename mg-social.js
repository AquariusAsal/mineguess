/* MineGuess Profil und Freunde (Instagram-Stil, kindersicher) als grosse Ansicht: Profilkopf mit Skin-Figur, Tabs Profil / Abzeichen / Statistik / Freunde / Privatsphaere.
   Backend: /api/profile/* und /api/friends/* (docs/team/API-NOTES.md "Phase 2 und 3"). Kein Freitext, kein Foto, kein Chat. Standard: alles privat.
   Skin: lokal MGSkin (Steve/Alex oder eigener Skin). Mit dem Profil gespeichert (skin, character) und auf neuen Geraeten wiederhergestellt;
   fremde Skins werden nur nach Pruefung (PNG 64x64/64x32, Rauschen-Check) angezeigt, sonst Steve/Alex. MGSocial.open() */
(function (global) {
  'use strict';
  var KEY_PT = 'mg_pt', PFX = 'data:image/png;base64,';
  var TITLES = { '': 'Kein Titel', redstone_profi: 'Redstone-Profi', baumeister: 'Baumeister', entdecker: 'Entdecker', sammler: 'Sammler', kampfhase: 'Kampfhase', tueftler: 'Tüftler' };
  var VIS = { private: 'Nur ich', friends: 'Freunde', public: 'Alle' };
  var AREAS = { header: 'Profilkopf und Skin', stats: 'Statistik', badges: 'Abzeichen', rank: 'Rang' };
  var ERR = { rate: 'Bitte kurz warten.', auth: 'Bitte neu anmelden.', token: 'Anmeldung nicht möglich. Spiele einmal Ranked oder lade die Seite neu.', einwilligung: 'Bitte den Haken zur Einwilligung setzen.', existiert: 'Du hast schon ein Profil.',
    name_format: 'Name: 3 bis 16 Zeichen aus a-z, 0-9, _ und -.', name_reserviert: 'Dieser Name ist reserviert.', name_unzulaessig: 'Dieser Name ist nicht erlaubt.', name_vergeben: 'Dieser Name ist schon vergeben.',
    kein_profil: 'Es gibt noch kein Profil.', nicht_gefunden: 'Nicht gefunden. Prüfe den Code.', umbenennen_gesperrt: 'Umbenennen ist nur alle 30 Tage möglich.' };
  var RAR = { common: 'Gewöhnlich', uncommon: 'Ungewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };
  var exts = { tabs: [], profile: [], friendView: [], privacy: [], open: [] }, catalog = null;
  var dlg = null, last = null, pt = null, me = null, tab = 'profil', busy = false, preview = null, badgeFilter = 'all', verdict = {}, syncing = false, skinPng = {}, skinBusy = {};

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
  function say(t, bad) { var m = dlg && dlg.querySelector('#sc-msg'); if (!m) return; m.textContent = t || ''; m.className = 'sc-msg' + (bad ? ' bad' : ''); }

  // ── Skins: nur geprueft anzeigen ──
  function skinFormatOk(s) { return typeof s === 'string' && s.indexOf(PFX) === 0 && s.length <= 24000 && /^[A-Za-z0-9+\/]+={0,2}$/.test(s.slice(PFX.length)); }
  function checkSkin(s, again) {
    if (!skinFormatOk(s)) return false;
    if (verdict[s] === 'ok') return true; if (verdict[s] === 'bad') return false;
    if (verdict[s] === undefined) {
      verdict[s] = 'pending';
      var bytes = global.MGPng ? MGPng.dataUrlBytes(s) : null, hd = bytes && MGPng.header(bytes);
      if (!hd || hd.w !== 64 || (hd.h !== 64 && hd.h !== 32)) { verdict[s] = 'bad'; return false; }
      MGPng.alpha(bytes).then(function (res) { verdict[s] = (res && MGPng.plausible(res)) ? 'ok' : 'bad'; if (verdict[s] === 'ok' && again) again(); });
    }
    return false;   // bis zur Pruefung: Standardkopf
  }
  function headOf(skin, ch, size) {
    var good = checkSkin(skin, rerender) ? skin : null;
    return global.MGSkin && MGSkin.imgHTML ? MGSkin.imgHTML(good, size || 'lg', ch === 'alex' ? 'alex' : 'steve') : '';
  }
  function rerender() { if (dlg && dlg.classList.contains('open') && me && (tab === 'profil' || tab === 'freunde' || tab === 'rangliste')) render(); }

  // ── Ranked-Token holen (ohne einen Lauf zu starten) ──
  function rankedToken() {
    var t = ls('mg_ranked_token'); if (t) return Promise.resolve(t);
    if (typeof global.rankedEnsure !== 'function' || typeof global.rankedGid !== 'function') return Promise.resolve('');
    var p = global.rankedEnsure(), body = { name: ls('mg_player_name') || 'Gast', gid: global.rankedGid(), profile: p, history: p.history, token: '', seen: [] }, gu = googleUser();
    var tok = gu && gu.getIdToken ? gu.getIdToken().catch(function () { return ''; }) : Promise.resolve('');
    return tok.then(function (idt) { if (gu && gu.uid) { body.uid = gu.uid; if (idt) body.idToken = idt; } return fetch('api/ranked/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }).then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.token) { ls('mg_ranked_token', j.token); return j.token; } return ''; }).catch(function () { return ''; });
  }

  // ── Rahmen ──
  function build() {
    dlg = document.createElement('div'); dlg.id = 'mg-social'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'sc-title');
    dlg.innerHTML = '<div class="sc-card"><div class="sc-top"><h2 id="sc-title">Profil und Freunde</h2><button type="button" class="mg-close" id="sc-x" aria-label="Schließen"></button></div><div id="sc-body" class="sc-bodywrap"></div><div class="sc-msg" id="sc-msg" role="status" aria-live="polite"></div></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#sc-x').addEventListener('click', close);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    global.addEventListener('mg-skin-change', function () {
      if (me && pt) syncSkin(false);
      if (preview && tab === 'profil' && global.MGSkin) { try { var sk = MGSkin.get(), ch = MGSkin.getCharacter() || 'steve'; preview.update({ skin: (sk && checkSkin(sk, null)) ? sk : (sk ? null : null), character: ch }); if (sk && !checkSkin(sk, null)) setTimeout(function () { if (preview) preview.update({ skin: checkSkin(sk, null) ? sk : null, character: ch }); }, 400); } catch (e) {} }
    });
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
  function killPreview() { if (preview) { try { preview.destroy(); } catch (e) {} preview = null; } }
  function open(startTab) {
    if (!dlg) build();
    last = document.activeElement; pt = ls(KEY_PT); me = null; say('');
    dlg.classList.add('open'); document.body.classList.add('sc-open');
    if (!pt) {
      tryLogin().then(function (ok) { if (ok) { open(startTab); } else { tab = startTab || 'profil'; render(); } });
      return;
    }
    body().innerHTML = '<p class="sc-muted">Lade …</p>';
    api('profile/me').then(function (r) {
      if (!r.ok || !r.j.me) { if (r.st === 401 || r.st === 403 || (r.j && (r.j.error === 'auth' || r.j.error === 'kein_profil'))) { ls(KEY_PT, null); pt = null; tab = startTab || 'profil'; render(); } else { body().innerHTML = '<p class="sc-muted">Das Profil ist gerade nicht erreichbar.</p>'; } return; }
      me = r.j.me; tab = startTab || 'profil'; restoreSkin(); syncStats(); syncSkin(false); loadCatalog().then(function () { render(); }); render();
    });
  }
  function loadCatalog() {
    if (catalog) return Promise.resolve(catalog);
    return api('profile/catalog').then(function (r) { if (r.ok) { catalog = r.j; (r.j.titles || []).forEach(function (t) { TITLES[t.id] = t.label; }); } return catalog; });
  }
  function ctx() { return { rankedList: true, api: api, esc: esc, say: say, me: function () { return me; }, catalog: function () { return catalog; }, headOf: headOf, skinURL: skinURL, charOf: charOf, stat: stat, rerender: render, reloadMe: function () { return api('profile/me').then(function (m) { if (m.ok) { me = m.j.me; } return me; }); }, close: close, open: open, TITLES: TITLES }; }
  function close() { if (!dlg) return; killPreview(); dlg.classList.remove('open'); document.body.classList.remove('sc-open'); if (last && last.focus) try { last.focus(); } catch (e) {} }

  // Bereich "Skin und Spielerkopf" (frueher separater Menuepunkt "Mein Spielerkopf"): Figur, Upload, Zuruecksetzen
  function skinSection(box) {
    if (!global.MGSkin) return;
    var ch = MGSkin.getCharacter() || 'steve';
    box.innerHTML = '<h3 class="sc-h">Skin und Spielerkopf</h3><div class="sc-row"><span id="sc-ch-l">Figur</span><span class="sc-chars" role="group" aria-labelledby="sc-ch-l" id="sc-chars2">' + ['steve', 'alex'].map(function (c) { return '<button type="button" class="chip' + (c === ch ? ' on' : '') + '" data-c="' + c + '" aria-pressed="' + (c === ch) + '">' + (c === 'steve' ? 'Steve' : 'Alex') + '</button>'; }).join('') + '</span></div><div id="sc-skin-up"></div>';
    box.querySelector('#sc-chars2').addEventListener('click', function (e) { var b = e.target.closest('button[data-c]'); if (!b) return; MGSkin.setCharacter(b.getAttribute('data-c')); [].forEach.call(this.children, function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); });
    MGSkin.mountUploader(box.querySelector('#sc-skin-up'), {});
  }
  // ── Google-Hinweis (Gast-Profile gehoeren sonst nur zu diesem Geraet) ──
  function googleUser() { try { return (typeof currentUser !== 'undefined' && currentUser && typeof isGuest !== 'undefined' && !isGuest) ? currentUser : null; } catch (e) { return null; } }
  function googleCanLogin() { try { return typeof signInGoogle === 'function' && typeof fbAuth !== 'undefined' && !!fbAuth; } catch (e) { return false; } }
  function googleNotice() {
    var kind = me && me.accountKind;
    if (kind === 'verified') return '<div class="sc-google ok" role="status"><b>Mit Google verbunden:</b> dein Profil ist auf allen Geräten verfügbar.</div>';
    if (kind === 'unverified' || (!kind && googleUser())) return '<div class="sc-google ok" role="status"><b>Mit Google angemeldet:</b> dein Profil ist auf allen Geräten, auf denen du mit Google angemeldet bist.</div>';
    if (kind === 'device' && googleUser()) return '<div class="sc-google" role="note"><p>Dieses Profil gehört nur zu diesem Gerät. Du bist zwar mit Google angemeldet, das Profil wurde aber ohne Google-Konto angelegt.</p></div>';
    var later = ''; try { later = sessionStorage.getItem('mg_google_later'); } catch (e) {}
    if (later === '1') return '';
    return '<div class="sc-google" role="note"><p><b>Hinweis:</b> Ohne Google-Konto gehört dein Profil nur zu diesem Gerät. Gehen deine Browserdaten verloren, ist das Profil weg. Melde dich mit Google an, damit es auf allen Geräten bleibt.</p>' +
      '<div class="sc-btns">' + (googleCanLogin() ? '<button type="button" class="btn btn-primary" data-g="login">Mit Google anmelden</button>' : '') + '<button type="button" class="btn btn-ghost" data-g="later">Später</button></div>' +
      '<p class="sc-note">Bei der Google-Anmeldung speichert Google dein Konto (Name, E-Mail-Adresse, Konto-ID); siehe <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a>.</p></div>';
  }
  function bindGoogle(root) {
    var box = root.querySelector('.sc-google'); if (!box) return;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-g]'); if (!b) return;
      if (b.getAttribute('data-g') === 'later') { try { sessionStorage.setItem('mg_google_later', '1'); } catch (x) {} box.remove(); return; }
      b.disabled = true;
      Promise.resolve(global.signInGoogle()).then(function () { if (googleUser()) { say('Mit Google verbunden.'); open(tab); } else b.disabled = false; }, function () { b.disabled = false; });
    });
  }
  // Mit Google angemeldet, aber noch kein Profil-Token auf diesem Geraet: bestehendes Profil wiederherstellen
  function tryLogin() {
    if (!googleUser()) return Promise.resolve(false);
    return rankedToken().then(function (t) { if (!t) return false; return api('profile/login', { token: t }).then(function (r) { if (r.ok && r.j.pt) { pt = r.j.pt; ls(KEY_PT, pt); return true; } return false; }); }).catch(function () { return false; });
  }
  // ── Konto erstellen ──
  function renderCreate(target) {
    killPreview();
    var T = target || body();
    var ch = (global.MGSkin && MGSkin.getCharacter && MGSkin.getCharacter()) || 'steve', nm = (ls('mg_player_name') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);
    T.innerHTML = '<div class="sc-create">' + googleNotice() + '<p>Mit einem Profil kannst du Freunde per Code hinzufügen und deinen Skin auf anderen Geräten wiederfinden. Standard: Dein Profil ist <b>privat</b>. Es gibt keinen Chat, keine Fotos und keinen Freitext.</p>' +
      '<div class="sc-row"><label for="sc-name">Profilname (3 bis 16 Zeichen: a-z, 0-9, _ und -)</label><input id="sc-name" class="form-input" maxlength="16" autocomplete="off" autocapitalize="off" value="' + esc(nm) + '"></div>' +
      '<div class="sc-row"><span>Figur</span><span class="sc-chars" id="sc-chars">' + ['steve', 'alex'].map(function (c) { return '<button type="button" class="chip' + (c === ch ? ' on' : '') + '" data-c="' + c + '" aria-pressed="' + (c === ch) + '">' + (c === 'steve' ? 'Steve' : 'Alex') + '</button>'; }).join('') + '</span></div>' +
      '<label class="sc-check"><input type="checkbox" id="sc-age"> Ich bin 14 Jahre oder älter, oder meine Eltern erlauben es.</label>' +
      '<p class="sc-note">Gespeichert werden Profilname, Figur, dein Skin (falls du einen eigenen nutzt) und Einstellungen (siehe <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutz</a>). Du kannst dein Profil jederzeit exportieren oder löschen.</p>' +
      '<div class="sc-btns"><button type="button" class="btn btn-primary" id="sc-create">Profil erstellen</button></div></div><div id="sc-skinbox" class="sc-skinbox"></div>';
    skinSection(T.querySelector('#sc-skinbox')); bindGoogle(T);
    var chosen = ch;
    T.querySelector('#sc-chars').addEventListener('click', function (e) { var b = e.target.closest('button[data-c]'); if (!b) return; chosen = b.getAttribute('data-c'); [].forEach.call(this.children, function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); });
    T.querySelector('#sc-create').addEventListener('click', function () {
      if (busy) return; var name = T.querySelector('#sc-name').value.trim().toLowerCase(), age = T.querySelector('#sc-age').checked;
      if (!age) { say(ERR.einwilligung, true); return; }
      busy = true; say('Einen Moment …');
      rankedToken().then(function (t) {
        if (!t) { busy = false; say(ERR.token, true); return; }
        var b = { token: t, name: name, age14: true, character: chosen };
        return api('profile/create', b).then(function (r) {
          busy = false;
          if (!r.ok) { say(errText(r.j, r.st), true); return; }
          pt = r.j.pt; ls(KEY_PT, pt); me = r.j.me; tab = 'profil'; say('Profil erstellt.'); syncStats(); syncSkin(true); render(); loadCatalog().then(function () { if (me && tab === 'profil') render(); });
        });
      });
    });
    var f = T.querySelector('#sc-name'); if (f && !target) f.focus();
  }

  // Statistik (selbstberichtet, nur zur Anzeige): Zaehler duerfen nicht sinken, daher Maximum aus lokal und Server senden
  function mx(a, b) { return Math.max(Number(a) || 0, Number(b) || 0); }
  function syncStats() {
    if (!global.MGBadges || !pt) return;
    try {
      var s = MGBadges.summary(), old = (me && me.stats) || {}, cats = {}, oc = old.byCategory || {};
      (MGBadges.categoryStats() || []).forEach(function (c) { cats[c.category] = { c: c.correct, t: c.total }; });
      Object.keys(oc).forEach(function (k) { var o = oc[k] || {}, n = cats[k] || { c: 0, t: 0 }; cats[k] = { c: mx(n.c, o.c), t: mx(n.t, o.t) }; });
      var stats = { answered: mx(s.answered, old.answered), correct: mx(s.correct, old.correct), bestStreak: mx(s.bestStreak, old.bestStreak), dailyStreak: mx(s.dailyStreak, old.dailyStreak), blitzBest: mx(s.blitzBest, old.blitzBest),
        hlBest: mx(parseInt(ls('mg_hl_best'), 10), old.hlBest), hardcoreBest: mx(parseInt(ls('mg_hc_best'), 10), old.hardcoreBest), byCategory: cats };
      var badges = (MGBadges.album ? MGBadges.album().filter(function (a) { return a.unlocked; }).map(function (a) { return a.date ? { id: a.id, date: a.date } : { id: a.id }; }) : []);
      api('profile/update', { stats: stats, badges: badges }).then(function (r) { if (r.ok) { me.stats = Object.assign({}, me.stats, stats); } });
    } catch (e) {}
  }
  // Skin: eigener Skin als PNG-Data-URL (Server prueft streng), sonst Steve/Alex ueber "character"; Marker verhindert doppeltes Senden
  function skinMarker(sk, ch) { return sk ? 'c:' + sk.length + ':' + sk.slice(-24) : 'd:' + ch; }
  function syncSkin(force) {
    if (!global.MGSkin || !pt || !me || syncing) return;
    var sk = MGSkin.get() || null, ch = MGSkin.getCharacter() || 'steve', mark = skinMarker(sk, ch);
    if (!force && ls('mg_skin_synced') === mark) return;
    syncing = true;
    api('profile/update', { character: ch }).then(function () {
      return api('profile/skin', { skin: sk }).then(function (r) { syncing = false; if (r.ok) { ls('mg_skin_synced', mark); me.skin = sk; me.character = ch; } else if (r.st === 429) { /* spaeter erneut */ } });
    });
  }
  // Neues Geraet: Skin/Figur aus dem Profil uebernehmen, wenn lokal nichts gewaehlt ist (nur geprueft)
  function restoreSkin() {
    if (!me || !global.MGSkin || MGSkin.get()) return;
    var url = me.skin;
    if (typeof url === 'string' && skinFormatOk(url) && MGSkin.isValid(url)) {
      var bytes = MGPng.dataUrlBytes(url);
      if (bytes) MGPng.alpha(bytes).then(function (res) { if (res && MGPng.plausible(res) && !MGSkin.get()) { MGSkin.save(url); ls('mg_skin_synced', skinMarker(url, '')); say('Dein Skin wurde aus dem Profil wiederhergestellt.'); } });
    }
    if (!MGSkin.getCharacter() && me.character) MGSkin.setCharacter(me.character);
  }
  // Fremde/Freunde: Skin einzeln nachladen (nur nach Sichtbarkeit), danach neu zeichnen
  function fetchSkin(pid) {
    if (skinPng[pid] !== undefined || skinBusy[pid] || Object.keys(skinBusy).length > 12) return;
    skinBusy[pid] = 1;
    api('profile/skin?pid=' + encodeURIComponent(pid)).then(function (r) { delete skinBusy[pid]; skinPng[pid] = (r.ok && typeof r.j.skin === 'string') ? r.j.skin : null; rerender(); });
  }
  function skinURL(u) {
    if (!u) return null;
    if (typeof u.skin === 'string') return u.skin;
    if (u.pid && u.skinV) { var c = skinPng[u.pid]; if (c) return c; if (c === undefined) fetchSkin(u.pid); }
    return null;
  }
  function charOf(u) { return (u && u.character === 'alex') ? 'alex' : 'steve'; }

  // ── Rahmen mit Tabs ──
  function render() {
    killPreview();
    var SUB = [['freunde', 'Freunde'], ['duelle', 'Duelle'], ['gruppe', 'Gruppe'], ['feed', 'Feed'], ['ziele', 'Ziele']], inSub = SUB.some(function (x) { return x[0] === tab; }), main = inSub ? 'freunde' : tab;
    var tabs = [['profil', 'Profil'], ['rangliste', 'Rangliste'], ['abzeichen', 'Abzeichen'], ['statistik', 'Statistik'], ['freunde', 'Freunde'], ['privat', 'Privatsphäre']];
    body().innerHTML = '<div role="tablist" aria-label="Bereiche" class="sc-tabs">' + tabs.map(function (t) { return '<button type="button" role="tab" id="sc-t-' + t[0] + '" aria-selected="' + (main === t[0]) + '" aria-controls="sc-p" data-t="' + t[0] + '" tabindex="' + (main === t[0] ? 0 : -1) + '" class="sc-tab' + (main === t[0] ? ' on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' + (inSub ? '<div class="sc-sub" role="group" aria-label="Freunde-Bereiche">' + SUB.map(function (x) { return '<button type="button" class="chip' + (tab === x[0] ? ' on' : '') + '" data-sub="' + x[0] + '" aria-pressed="' + (tab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' : '') + '<div id="sc-p" role="tabpanel" aria-labelledby="sc-t-' + main + '"></div>';
    var sb = body().querySelector('.sc-sub'); if (sb) sb.addEventListener('click', function (e) { var b = e.target.closest('button[data-sub]'); if (b) { tab = b.getAttribute('data-sub'); render(); var n = body().querySelector('.sc-sub .chip.on'); if (n) n.focus(); } });
    var tl = body().querySelector('.sc-tabs');
    tl.addEventListener('click', function (e) { var b = e.target.closest('.sc-tab'); if (b) { tab = b.getAttribute('data-t'); render(); var n = body().querySelector('.sc-tab.on'); if (n) n.focus(); } });
    tl.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; var ids = tabs.map(function (t) { return t[0]; }), i = ids.indexOf(main); i = (i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length; tab = ids[i]; render(); body().querySelector('.sc-tab.on').focus();
    });
    var ex = exts.tabs.filter(function (t) { return t.id === tab; })[0], pnl = body().querySelector('#sc-p');
    if (!me && ['profil', 'freunde', 'duelle', 'feed', 'gruppe', 'ziele', 'privat'].indexOf(tab) >= 0) { if (tab === 'profil') renderCreate(pnl); else { pnl.innerHTML = '<p>Dafür brauchst du ein Profil. Es ist kostenlos und standardmäßig privat.</p><div class="sc-btns"><button type="button" class="btn btn-primary" id="sc-gate">Profil erstellen</button></div>'; pnl.querySelector('#sc-gate').addEventListener('click', function () { tab = 'profil'; render(); }); } return; }
    if (ex) ex.fn(pnl, ctx()); else ({ profil: renderProfile, abzeichen: renderBadges, statistik: renderStats, freunde: renderFriends, privat: renderPrivacy })[tab]();
  }
  function stat(l, v) { return '<div class="sc-stat"><b>' + esc(v == null ? '–' : v) + '</b><span>' + esc(l) + '</span></div>'; }
  function mountFigure(box, skin, ch) {
    var chr = ch === 'alex' ? 'alex' : 'steve', good = checkSkin(skin, function () { if (preview && box.isConnected) preview.update({ skin: skin, character: chr }); }) ? skin : null;
    try { if (global.MGScene && MGScene.createPreview) { preview = MGScene.createPreview(box, { skin: good, character: chr }); return; } } catch (e) {}
    box.innerHTML = headOf(skin, ch, 'xl');
  }

  // ── Profil ──
  function renderProfile() {
    var p = body().querySelector('#sc-p'), st = me.stats || {}, bd = me.badges || [], sum = global.MGBadges ? MGBadges.summary() : {}, rk = me.rank;
    var sk = (global.MGSkin && MGSkin.get && MGSkin.get()) || null, ch = (global.MGSkin && MGSkin.getCharacter && MGSkin.getCharacter()) || charOf(me);
    var info = ''; try { if (global.MGRanked && global.rankedEnsure) { var ri = MGRanked.rankInfo(rankedEnsure().mmr); info = ri.label + ' · ' + ri.mmr + ' MMR'; } } catch (e) {}
    p.innerHTML = googleNotice() + '<div class="sc-hero"><div class="sc-fig" id="sc-fig" role="img" aria-label="Deine Figur"></div>' +
      '<div class="sc-id"><h3>' + esc(me.name) + '</h3><span class="sc-title">' + esc(TITLES[me.title || ''] || '') + '</span>' + (info || rk ? '<span class="sc-rank">' + esc(info || (rk && (rk.label || ''))) + '</span>' : '') +
      '<div class="sc-nums"><span><b>' + (sum.answered != null ? sum.answered : (st.answered || 0)) + '</b> Antworten</span><span><b>' + ((me.counts && me.counts.friends) || 0) + '</b> Freunde</span><span><b>' + (sum.badgesEarned != null ? sum.badgesEarned : bd.length) + '</b> Abzeichen</span></div>' +
      '<div class="sc-btns"><button type="button" class="btn btn-ghost" id="sc-share">Karte teilen</button></div></div></div>' +
      '<div id="sc-skinbox" class="sc-skinbox"></div>' +
      '<div class="sc-row"><label for="sc-title-sel">Titel</label><select id="sc-title-sel" class="form-input" style="max-width:260px">' + Object.keys(TITLES).map(function (k) { return '<option value="' + k + '"' + ((me.title || '') === k ? ' selected' : '') + '>' + esc(TITLES[k]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="sc-grid">' + stat('Gespielt', sum.played) + stat('Trefferquote', sum.rate != null ? Math.round(sum.rate * 100) + ' %' : '–') + stat('Beste Serie', sum.bestStreak) + stat('Tages-Serie', sum.dailyStreak) + stat('Höher/Tiefer', parseInt(ls('mg_hl_best'), 10) || 0) + stat('Hardcore', parseInt(ls('mg_hc_best'), 10) || 0) + '</div>' +
      '<div class="sc-code"><span class="sc-muted">Dein Freundescode</span><b id="sc-code">' + esc(me.friendCode || 'noch keiner') + '</b><span class="sc-btns"><button type="button" class="btn" id="sc-code-new">' + (me.friendCode ? 'Neuer Code' : 'Code erzeugen') + '</button>' + (me.friendCode ? '<button type="button" class="btn" id="sc-code-copy">Kopieren</button>' : '') + '</span>' +
      '<span class="sc-note">Der Code ist 30 Tage gültig. Nur wer ihn kennt, kann dir eine Anfrage senden.</span></div>';
    mountFigure(p.querySelector('#sc-fig'), sk, ch);
    skinSection(p.querySelector('#sc-skinbox')); bindGoogle(p);
    p.querySelector('#sc-share').addEventListener('click', function () {
      var t = 'MineGuess: ' + (sum.answered || 0) + ' Antworten, ' + Math.round((sum.rate || 0) * 100) + ' % richtig, beste Serie ' + (sum.bestStreak || 0) + ', ' + (sum.badgesEarned || 0) + '/' + (sum.badgesTotal || 0) + ' Abzeichen.';
      if (navigator.share) navigator.share({ text: t }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { say('Karte kopiert (nur Zahlen, keine Fragen).'); });
    });
    p.querySelector('#sc-title-sel').addEventListener('change', function (e) { api('profile/update', { title: e.target.value }).then(function (r) { if (r.ok) { me.title = e.target.value; render(); say('Titel gespeichert.'); } else say(errText(r.j, r.st), true); }); });
    p.querySelector('#sc-code-new').addEventListener('click', function () { api('profile/update', { newCode: true }).then(function (r) { if (!r.ok) { say(errText(r.j, r.st), true); return; } return api('profile/me').then(function (m) { if (m.ok) { me = m.j.me; render(); say('Neuer Code erzeugt.'); } }); }); });
    var cp = p.querySelector('#sc-code-copy'); if (cp) cp.addEventListener('click', function () { (navigator.clipboard ? navigator.clipboard.writeText(me.friendCode) : Promise.reject()).then(function () { say('Code kopiert.'); }, function () { say('Kopieren nicht möglich.', true); }); });
    exts.profile.forEach(function (f) { try { f(p, ctx()); } catch (e) {} });
  }

  // ── Abzeichen-Galerie ──
  function renderBadges() {
    var p = body().querySelector('#sc-p'); if (!global.MGBadges || !MGBadges.album) { p.innerHTML = '<p class="sc-muted">Abzeichen sind nicht verfügbar.</p>'; return; }
    var al = MGBadges.album().slice().sort(function (a, b) { return (Number(b.unlocked) - Number(a.unlocked)) || (b.rarityRank - a.rarityRank); }), got = al.filter(function (a) { return a.unlocked; }).length;
    var list = al.filter(function (a) { return badgeFilter === 'all' || (badgeFilter === 'got' ? a.unlocked : !a.unlocked); });
    function fd(d) { var x = String(d || '').split('-'); return x.length === 3 ? x[2] + '.' + x[1] + '.' + x[0] : ''; }
    p.innerHTML = '<p class="sc-muted">' + got + ' von ' + al.length + ' Abzeichen freigeschaltet</p><div class="sc-seg" role="group" aria-label="Filter">' + [['all', 'Alle'], ['got', 'Freigeschaltet'], ['lock', 'Gesperrt']].map(function (f) { return '<button type="button" class="chip' + (badgeFilter === f[0] ? ' on' : '') + '" data-f="' + f[0] + '" aria-pressed="' + (badgeFilter === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      '<div class="sc-gallery">' + list.map(function (a) {
        var pr = a.progress || {}, pc = pr.target ? Math.min(100, Math.round(pr.value / pr.target * 100)) : 0;
        return '<div class="sc-badge r-' + esc(a.rarity) + (a.unlocked ? ' got' : ' lock') + '"><div class="sc-bi">' + (global.MGIcon ? MGIcon.tex(a.texture, 32, '') : '') + '</div><b>' + esc(a.name) + '</b><span class="sc-rar">' + esc(RAR[a.rarity] || a.rarityLabel || '') + '</span><span class="sc-bd">' + (a.unlocked ? '' : 'Bedingung: ') + esc(a.desc) + '</span>' +
          (a.unlocked ? '<span class="sc-bd">' + (a.date ? 'Seit ' + fd(a.date) : 'Freigeschaltet') + '</span>' : (a.countable ? '<span class="sc-bar" role="img" aria-label="Fortschritt ' + pr.value + ' von ' + pr.target + '"><i style="width:' + pc + '%"></i></span><span class="sc-bd">' + Math.min(pr.value, pr.target) + ' / ' + pr.target + '</span>' : '<span class="sc-bd">Gesperrt</span>')) + '</div>';
      }).join('') + '</div>';
    p.querySelector('.sc-seg').addEventListener('click', function (e) { var b = e.target.closest('button[data-f]'); if (b) { badgeFilter = b.getAttribute('data-f'); renderBadges(); } });
  }

  // ── Statistik ──
  function radar(stats) {
    var cats = stats.slice(0, 8); if (cats.length < 3) return '<p class="sc-muted">Spiele in mindestens drei Kategorien, dann erscheint dein Radar.</p>';
    var S = 300, c = S / 2, R = 88, n = cats.length;
    function pt2(i, f) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * R * f, c + Math.sin(a) * R * f]; }
    var g = ''; [0.25, 0.5, 0.75, 1].forEach(function (f) { g += '<polygon class="sc-grid-l" points="' + cats.map(function (_, i) { return pt2(i, f).join(','); }).join(' ') + '"/>'; });
    cats.forEach(function (_, i) { var q = pt2(i, 1); g += '<line class="sc-grid-l" x1="' + c + '" y1="' + c + '" x2="' + q[0] + '" y2="' + q[1] + '"/>'; });
    g += '<polygon class="sc-area" points="' + cats.map(function (k, i) { return pt2(i, Math.max(0.03, k.rate)).join(','); }).join(' ') + '"/>';
    cats.forEach(function (k, i) { var q = pt2(i, 1.2), a = q[0] < c - 6 ? 'end' : q[0] > c + 6 ? 'start' : 'middle'; g += '<text class="sc-lbl" x="' + q[0] + '" y="' + q[1] + '" text-anchor="' + a + '" dominant-baseline="middle">' + esc(k.category.length > 14 ? k.category.slice(0, 13) + '.' : k.category) + '</text>'; });
    return '<svg class="sc-radar" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="Trefferquote je Kategorie: ' + esc(cats.map(function (k) { return k.category + ' ' + Math.round(k.rate * 100) + ' Prozent'; }).join(', ')) + '">' + g + '</svg>' +
      '<ul class="sc-catlist">' + cats.map(function (k) { return '<li><span>' + esc(k.category) + '</span><b>' + Math.round(k.rate * 100) + ' %</b> <small>(' + k.correct + '/' + k.total + ')</small></li>'; }).join('') + '</ul>';
  }
  function line(hist) {
    if (!hist || hist.length < 2) return '<p class="sc-muted">Der Verlauf erscheint nach zwei abgeschlossenen Ranked-Läufen.</p>';
    var W = 320, H = 120, pad = 14, v = hist.map(function (h) { return h.mmr; }), lo = Math.min.apply(null, v), hi = Math.max.apply(null, v); if (hi === lo) { hi++; lo--; }
    var pts = hist.map(function (h, i) { return [pad + i * (W - 2 * pad) / (hist.length - 1), H - pad - (h.mmr - lo) / (hi - lo) * (H - 2 * pad)]; });
    return '<svg class="sc-line" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="MMR-Verlauf der letzten ' + hist.length + ' Läufe, von ' + v[0] + ' auf ' + v[v.length - 1] + '"><polyline class="sc-path" points="' + pts.map(function (q) { return q.join(','); }).join(' ') + '"/>' + pts.map(function (q) { return '<circle class="sc-dot" cx="' + q[0] + '" cy="' + q[1] + '" r="3"/>'; }).join('') + '<text class="sc-lbl" x="' + pad + '" y="10">' + hi + '</text><text class="sc-lbl" x="' + pad + '" y="' + (H - 2) + '">' + lo + '</text></svg>';
  }
  function renderStats() {
    var p = body().querySelector('#sc-p'), s = global.MGBadges ? MGBadges.summary() : {}, hist = []; try { hist = (global.rankedEnsure && rankedEnsure().history) || []; } catch (e) {}
    p.innerHTML = '<div class="sc-grid">' + stat('Spiele', s.played) + stat('Antworten', s.answered) + stat('Richtig', s.correct) + stat('Trefferquote', s.rate != null ? Math.round(s.rate * 100) + ' %' : '–') + stat('Beste Serie', s.bestStreak) + stat('Tages-Serie', s.dailyStreak) + stat('Blitz-Bestwert', s.blitzBest) + stat('Ranked-Läufe', s.rankedGames) + stat('Höchste MMR', s.peakMmr) + stat('Höher/Tiefer', parseInt(ls('mg_hl_best'), 10) || 0) + stat('Hardcore', parseInt(ls('mg_hc_best'), 10) || 0) + stat('Abzeichen', (s.badgesEarned || 0) + '/' + (s.badgesTotal || 0)) + '</div>' +
      '<div class="sc-two"><section><h3 class="sc-h">Kategorien</h3>' + radar(global.MGBadges ? MGBadges.categoryStats() : []) + '</section><section><h3 class="sc-h">MMR-Verlauf (letzte ' + Math.min(30, hist.length) + ' Läufe)</h3>' + line(hist) + '</section></div>';
  }

  // ── Freunde ──
  function row(u, actions) {
    return '<li class="sc-fr" data-pid="' + esc(u.pid) + '"><span class="sc-av" aria-hidden="true">' + headOf(skinURL(u), charOf(u), 'sm') + '</span><span class="sc-fn">' + esc(u.name) + (u.title && TITLES[u.title] ? '<small>' + esc(TITLES[u.title]) + '</small>' : '') + (u.lastSeenDay ? '<small>zuletzt ' + esc(u.lastSeenDay) + '</small>' : '') + '</span><span class="sc-fa">' + actions + '</span></li>';
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
    api('friends?skins=1').then(function (r) {
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
      killPreview();
      var p = r.j.profile, st = p.stats;
      p.pid = pid;
      body().innerHTML = '<button type="button" class="btn btn-ghost" id="sc-back">Zurück</button><div class="sc-hero"><div class="sc-fig" id="sc-fig" role="img" aria-label="Figur von ' + esc(p.name) + '"></div><div class="sc-id"><h3>' + esc(p.name) + '</h3><span class="sc-title">' + esc(TITLES[p.title || ''] || '') + '</span>' +
        (p.rank ? '<span class="sc-rank">' + esc(p.rank.label || '') + (p.rank.mmr ? ' · ' + esc(p.rank.mmr) + ' MMR' : '') + '</span>' : '') + '</div></div>' +
        (st ? '<div class="sc-grid">' + stat('Antworten', st.answered) + stat('Richtig', st.correct) + stat('Beste Serie', st.bestStreak) + stat('Höher/Tiefer', st.hlBest) + stat('Hardcore', st.hardcoreBest) + stat('Abzeichen', (p.badges || []).length) + '</div>' : '<p class="sc-muted">Mehr zeigt dieses Profil nicht.</p>') +
        '<div class="sc-btns"><button type="button" class="btn btn-ghost" id="sc-rep">Melden</button><button type="button" class="btn btn-ghost" id="sc-block">Blockieren</button></div>';
      mountFigure(body().querySelector('#sc-fig'), skinURL(p), charOf(p));
      exts.friendView.forEach(function (f) { try { f(body(), pid, p, ctx()); } catch (e) {} });
      body().querySelector('#sc-back').addEventListener('click', function () { tab = 'freunde'; render(); });
      body().querySelector('#sc-rep').addEventListener('click', function () { if (global.MGReport) MGReport.open({ mode: 'profile', players: [p.name] }); });
      body().querySelector('#sc-block').addEventListener('click', function () { if (confirm(p.name + ' blockieren? Die Freundschaft endet und ihr seht einander nicht mehr.')) api('profile/block', { pid: pid, block: true }).then(function (r2) { if (r2.ok) { tab = 'freunde'; render(); say('Blockiert.'); } else say(errText(r2.j, r2.st), true); }); });
    });
  }

  // ── Privatsphaere ──
  function renderPrivacy() {
    var p = body().querySelector('#sc-p'), v = me.visibility || {};
    var who = Object.keys(AREAS).map(function (k) { var o = v[k] || 'private'; return '<tr><th scope="row">' + AREAS[k] + '</th><td>' + (o === 'private' ? 'Nur du' : (o === 'friends' ? 'Du und deine Freunde' : 'Alle, die dein Profil finden')) + '</td></tr>'; }).join('');
    p.innerHTML = '<h3 class="sc-h">Wer sieht was?</h3><table class="sc-who-t"><tbody>' + who + '</tbody></table><div class="sc-btns"><button type="button" class="btn btn-primary" id="sc-allpriv">Alles privat stellen</button></div><p class="sc-note">Für Eltern und Kinder: „Privat“ heißt, nur du siehst es. Es gibt keinen Chat und keine Nachrichten, niemand kann dir schreiben. Du kannst dein Profil jederzeit löschen.</p>' +
      '<p class="sc-note">Wer darf was sehen? Standard ist überall „Nur ich“. Fremde sehen ein komplett privates Profil gar nicht. Dein Skin gehört zum Profilkopf und folgt dessen Einstellung.</p>' +
      Object.keys(AREAS).map(function (k) { return '<div class="sc-row"><label for="sc-v-' + k + '">' + AREAS[k] + '</label><select id="sc-v-' + k + '" data-k="' + k + '" class="form-input" style="max-width:260px">' + Object.keys(VIS).map(function (o) { return '<option value="' + o + '"' + ((v[k] || 'private') === o ? ' selected' : '') + '>' + VIS[o] + '</option>'; }).join('') + '</select></div>'; }).join('') +
      '<h3 class="sc-h">Deine Daten</h3><div class="sc-btns"><button type="button" class="btn" id="sc-export">Daten herunterladen</button><button type="button" class="btn btn-ghost" id="sc-logout">Auf diesem Gerät abmelden</button></div>' +
      '<h3 class="sc-h">Profil löschen</h3><p class="sc-note">Entfernt Profil (inklusive gespeichertem Skin), Freundschaften und Anfragen endgültig. Zum Bestätigen LOESCHEN eintippen.</p><div class="sc-inline" style="max-width:420px"><input id="sc-del" class="form-input" autocomplete="off" aria-label="Zum Löschen LOESCHEN eintippen"><button type="button" class="btn" id="sc-del-go">Endgültig löschen</button></div>';
    p.addEventListener('change', function (e) {
      var s = e.target.closest('select[data-k]'); if (!s) return; var vis = {}; vis[s.getAttribute('data-k')] = s.value;
      api('profile/update', { visibility: vis }).then(function (r) { if (r.ok) { me.visibility = Object.assign({}, me.visibility, vis); say('Gespeichert.'); } else say(errText(r.j, r.st), true); });
    });
    p.querySelector('#sc-allpriv').addEventListener('click', function () { var vis = { header: 'private', stats: 'private', badges: 'private', rank: 'private' }; api('profile/update', { visibility: vis }).then(function (r) { if (r.ok) { me.visibility = vis; renderPrivacy(); say('Alles ist jetzt privat.'); } else say(errText(r.j, r.st), true); }); });
    exts.privacy.forEach(function (f) { try { f(p, ctx()); } catch (e) {} });
    p.querySelector('#sc-export').addEventListener('click', function () {
      api('profile/export').then(function (r) { if (!r.ok) { say(errText(r.j, r.st), true); return; } var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(r.j, null, 2)], { type: 'application/json' })); a.download = 'mineguess-profil.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); say('Download gestartet.'); });
    });
    p.querySelector('#sc-logout').addEventListener('click', function () { ls(KEY_PT, null); pt = null; me = null; tab = 'profil'; render(); say('Abgemeldet. Dein Profil bleibt auf dem Server, bis du es löschst.'); });
    p.querySelector('#sc-del-go').addEventListener('click', function () {
      if (p.querySelector('#sc-del').value.trim() !== 'LOESCHEN') { say('Bitte LOESCHEN eintippen.', true); return; }
      api('profile/delete', { confirm: 'LOESCHEN' }).then(function (r) { if (r.ok) { ls(KEY_PT, null); pt = null; me = null; tab = 'profil'; render(); say('Profil gelöscht.'); } else say(errText(r.j, r.st), true); });
    });
  }
  global.MGSocial = { open: open, close: close, headOf: headOf, checkSkin: checkSkin, addTab: function (id, label, fn) { exts.tabs.push({ id: id, label: label, fn: fn }); }, onProfile: function (f) { exts.profile.push(f); }, onFriendView: function (f) { exts.friendView.push(f); }, onPrivacy: function (f) { exts.privacy.push(f); } };
})(window);
