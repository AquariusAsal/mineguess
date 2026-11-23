/* MineGuess Einstellungen: EIN Zahnrad-Symbol (Pixel-Icon) öffnet ein Panel (Desktop: Popover rechts oben,
   Mobil: Bottom-Sheet). Ton + Lautstärke, Musik (Spotify-Insel), Design hell/dunkel, Animationen reduzieren,
   Spielerprofil, Rangliste. Fokus-Trap, Esc schließt. */
(function (global) {
  'use strict';
  var panel = null, btn = null, lastFocus = null;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function applyTheme(t) {
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
    ls('mg_theme', t === 'light' ? 'light' : 'dark');
  }
  function applyMotion(on) {
    if (on) document.documentElement.setAttribute('data-motion', 'reduce'); else document.documentElement.removeAttribute('data-motion');
    ls('mg_reduce_motion', on ? '1' : '0');
  }
  // Barrierefreiheit: Hoher Kontrast, Textgroesse, Lesbare Schrift (gespeichert, sofort beim Laden)
  var A11Y = { contrast: 'mg_contrast', font: 'mg_font', text: 'mg_text' };
  function applyA11y() {
    var h = document.documentElement;
    if (ls(A11Y.contrast) === '1') h.setAttribute('data-contrast', 'high'); else h.removeAttribute('data-contrast');
    if (ls(A11Y.font) === '1') h.setAttribute('data-font', 'read'); else h.removeAttribute('data-font');
    var t = ls(A11Y.text); if (t === 'l' || t === 'xl') h.setAttribute('data-text', t); else h.removeAttribute('data-text');
  }
  applyA11y();
  // Update-Hinweis: "Neue Version verfuegbar - neu laden" (kein erzwungenes Neuladen waehrend einer Runde oder im Multiplayer-Raum)
  function isBusy() {
    try {
      var gw = document.getElementById('game-wrapper');
      if (gw && gw.offsetParent !== null) return true;                       // Spielscreen (Runde laeuft oder Endkarte)
      if (document.getElementById('hl-end') && document.getElementById('mg-hl') && !document.getElementById('mg-hl').hidden) return true;
      if (typeof myRoomId !== 'undefined' && myRoomId) return true;          // Multiplayer-Raum
    } catch (e) {}
    return false;
  }
  function showUpdate() {
    if (document.getElementById('mg-update')) return;
    var el = document.createElement('div'); el.id = 'mg-update'; el.className = 'mg-update'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span>Neue Version verfügbar</span><button type="button" class="btn btn-primary">Neu laden</button><button type="button" class="btn btn-ghost" aria-label="Hinweis schließen">Später</button>';
    el.querySelector('.btn-primary').addEventListener('click', function () { location.reload(); });
    el.querySelector('.btn-ghost').addEventListener('click', function () { el.remove(); });
    document.body.appendChild(el);
  }
  function versionText() {
    if (!global.caches || !caches.keys) return Promise.resolve('–');
    return caches.keys().then(function (k) { var v = k.filter(function (x) { return /^mineguess-v/.test(x); }).map(function (x) { return x.replace('mineguess-', ''); }); return v.length ? v[v.length - 1] : '–'; }).catch(function () { return '–'; });
  }
  // App installieren (PWA) und Offline-Hinweis
  var installEv = null;
  global.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEv = e; var b = document.getElementById('mg-set-install-row'); if (b) b.hidden = false; });
  global.addEventListener('appinstalled', function () { installEv = null; var b = document.getElementById('mg-set-install-row'); if (b) b.hidden = true; });
  function standalone() { return (global.matchMedia && matchMedia('(display-mode: standalone)').matches) || global.navigator.standalone === true; }
  function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent || '') && !standalone(); }
  function offlineBanner() {
    var id = 'mg-offline', el = document.getElementById(id);
    if (navigator.onLine) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div'); el.id = id; el.className = 'mg-offline'; el.setAttribute('role', 'status'); el.textContent = 'Du bist offline. Gespeicherte Seiten und Fragen funktionieren, Multiplayer, Ranked und Freunde brauchen Internet.';
    document.body.appendChild(el);
  }
  global.addEventListener('online', offlineBanner); global.addEventListener('offline', offlineBanner);
  document.addEventListener('DOMContentLoaded', offlineBanner);
  // Gespeicherte Animationen-Einstellung beim Laden anwenden
  if (ls('mg_reduce_motion') === '1') document.documentElement.setAttribute('data-motion', 'reduce');

  // ── Einstellungen: grosses Modal, links Suche + Kategorien, rechts Inhalt (Mobil: Vollbild-Sheet, Kategorieliste -> Inhalt mit Zurueck) ──
  var CATS = [
    ['general', 'Allgemein', 'general', '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3"/>'],
    ['sound', 'Ton', 'sound', '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6M18.5 6.5c3 3 3 8 0 11"/>'],
    ['a11y', 'Barrierefreiheit', 'a11y', '<circle cx="12" cy="5" r="2"/><path d="M5 9l7 1.5L19 9M12 10.5V15l-3 6M12 15l3 6"/>'],
    ['fpv', 'Ich-Ansicht und Umgebung', 'fpv', '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
    ['emotes', 'Emotes', 'emotes', '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8 14.5c2 2.5 6 2.5 8 0"/>'],
    ['account', 'Konto und Profil', 'account', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/>'],
    ['privacy', 'Datenschutz', 'privacy', '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'],
    ['about', 'Über', 'about', '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>']
  ];
  function R(id, label, ctl, keys) { return '<div class="mg-set-row" data-k="' + String(label + ' ' + (keys || '')).toLowerCase() + '"><label for="' + id + '">' + label + '</label>' + ctl + '</div>'; }
  function SW(id) { return '<input type="checkbox" id="' + id + '" class="mg-switch">'; }
  function SEL(id, opts, w) { return '<select id="' + id + '" class="form-input" style="max-width:' + (w || 160) + 'px">' + opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select>'; }
  function RNG(id, min, max, step) { return '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '">'; }
  function BTN(id, label) { return '<button type="button" class="btn" id="' + id + '">' + label + '</button>'; }
  function sections() {
    return {
      general:
        R('mg-set-lang', 'Sprache / Language', SEL('mg-set-lang', [['de', 'Deutsch'], ['en', 'English']], 140), 'sprache language deutsch english flagge') +
        R('mg-set-theme', 'Helles Design', SW('mg-set-theme'), 'design hell dunkel theme light dark') +
        '<div class="mg-set-row" id="mg-set-install-row" hidden data-k="app installieren install pwa"><span>App</span>' + BTN('mg-set-install', 'App installieren') + '</div>' +
        '<div class="mg-set-row" data-k="version cache"><span><img src="assets/brand/brand-64.png" alt="" width="18" height="18" style="vertical-align:-4px;margin-right:6px;border-radius:4px">Version</span><span id="mg-set-version" class="mg-set-ver">–</span></div>' +
        '<div class="mg-set-row" data-k="hilfe problem melden report"><span>Hilfe</span>' + BTN('mg-set-report', 'Problem melden') + '</div>',
      sound:
        R('mg-set-sound', 'Ton', SW('mg-set-sound'), 'ton sound audio effekte an aus') +
        R('mg-set-vol', 'Lautstärke Effekte', RNG('mg-set-vol', 0, 100, 5), 'lautstaerke volume') +
        '<div class="mg-set-row" data-k="musik spotify music"><span>Musik</span>' + BTN('mg-set-music', 'Spotify öffnen') + '</div>' +
        '<p class="mg-set-note">Die Musik kommt von Spotify (Einbettung nach Klick). Die Lautstärke der Musik stellst du im Spotify-Player ein.</p>',
      a11y:
        R('mg-set-contrast', 'Hoher Kontrast', SW('mg-set-contrast'), 'kontrast contrast') +
        R('mg-set-font', 'Lesbare Schrift', SW('mg-set-font'), 'schrift font readable dyslexia') +
        '<div class="mg-set-row" data-k="textgroesse text size"><span id="mg-set-text-l">Textgröße</span><div class="mg-seg" role="radiogroup" aria-labelledby="mg-set-text-l" id="mg-set-text"><button type="button" class="chip" role="radio" data-t="m">Normal</button><button type="button" class="chip" role="radio" data-t="l">Groß</button><button type="button" class="chip" role="radio" data-t="xl">Sehr groß</button></div></div>' +
        R('mg-set-motion', 'Animationen reduzieren', SW('mg-set-motion'), 'animation bewegung motion reduce') +
        R('mg-set-time', 'Mehr Zeit (nur Solo)', SEL('mg-set-time', [['0', 'Aus'], ['50', '+50 %'], ['100', '+100 %']], 150), 'zeit time') +
        R('mg-set-numhelp', 'Wertebereich-Hilfe bei Zahlenfragen (nur Solo)', SW('mg-set-numhelp'), 'zahl hilfe range') +
        R('mg-set-loader', 'Lade-Bildschirm kurz halten', SW('mg-set-loader'), 'lade bildschirm loading') +
        '<div class="mg-set-row" data-k="einfuehrung tutorial"><span>Einführung</span>' + BTN('mg-set-tutorial', 'Tutorial ansehen') + '</div>',
      fpv:
        R('mg-set-view', 'Ansicht', SEL('mg-set-view', [['normal', 'Normal'], ['fpv', 'Ich-Ansicht']], 150), 'ansicht view first person pov ich') +
        R('mg-set-gfx', 'Ich-Ansicht Grafik', SEL('mg-set-gfx', [['auto', 'Automatisch'], ['high', 'Hoch'], ['mid', 'Mittel'], ['low', 'Niedrig']], 150), 'grafik graphics quality qualitaet') +
        R('mg-set-biome', 'Biom', SEL('mg-set-biome', [['auto', 'Automatisch'], ['plains', 'Ebene'], ['forest', 'Wald'], ['mountains', 'Berge'], ['desert', 'Wüste'], ['snow', 'Schnee']], 150), 'biom biome umgebung') +
        R('mg-set-fov', 'Sichtfeld', RNG('mg-set-fov', 60, 100, 2), 'sichtfeld fov') +
        R('mg-set-sens', 'Maus-Empfindlichkeit', RNG('mg-set-sens', 0.5, 2, 0.1), 'maus empfindlichkeit sensitivity') +
        R('mg-set-lock', 'Maus fangen (Ich-Ansicht)', SW('mg-set-lock'), 'maus pointer lock fangen') +
        R('mg-set-wind', 'Gras im Wind', SW('mg-set-wind'), 'gras wind grass') +
        R('mg-set-clouds', 'Wolken', SW('mg-set-clouds'), 'wolken clouds') +
        R('mg-set-fs', 'Vollbild automatisch', SW('mg-set-fs'), 'vollbild fullscreen'),
      emotes:
        R('mg-set-emotes', 'Emotes anzeigen', SW('mg-set-emotes'), 'emotes anzeigen show') +
        R('mg-set-ekey', 'Taste für das Emote-Rad', '<span><button type="button" class="btn" id="mg-set-ekey">B</button><span class="mg-set-ver" id="mg-set-ekey-note" role="status"></span></span>', 'taste key emote rad wheel belegen') +
        '<div class="mg-set-row" data-k="stummgeschaltet muted spieler" style="align-items:flex-start"><span>Stummgeschaltete Spieler</span><span id="mg-set-muted" class="mg-set-ver">–</span></div>' +
        '<p class="mg-set-note">Einzelne Spieler schaltest du in der Spielerliste im Multiplayer stumm. Emotes sind eine feste Liste, es gibt keinen Chat.</p>',
      account:
        '<div class="mg-set-row" data-k="profil skin figur profile"><span>Spielerprofil</span>' + BTN('mg-set-profile', 'Profil, Skin, Figur') + '</div>' +
        '<div class="mg-set-row" data-k="rankliste leaderboard"><span>Rankliste</span>' + BTN('mg-set-rank', 'Rankliste öffnen') + '</div>' +
        '<div class="mg-set-row" data-k="datenexport loeschen export delete konto"><span>Daten exportieren oder löschen</span>' + BTN('mg-set-data', 'Im Profil öffnen') + '</div>' +
        '<p class="mg-set-note">Die Anmeldung mit Google findest du im Startmenü des Spiels. Einstellungen werden nur in deinem Browser gespeichert.</p>',
      privacy:
        '<div class="mg-set-row" data-k="datenschutz privacy"><span>Datenschutzerklärung</span><a class="btn" href="datenschutz.html">Öffnen</a></div>' +
        '<div class="mg-set-row" data-k="impressum imprint"><span>Impressum</span><a class="btn" href="impressum.html">Öffnen</a></div>' +
        '<div class="mg-set-row" data-k="lizenz license"><span>Lizenz</span><a class="btn" href="datenschutz.html#lizenz">Hinweise</a></div>' +
        '<p class="mg-set-note">Alle Einstellungen dieses Fensters werden sofort angewendet und nur lokal im Browser gespeichert (nichts auf dem Server).</p>',
      about:
        '<div class="mg-set-row" data-k="version"><span>Version</span><span id="mg-set-version2" class="mg-set-ver">–</span></div>' +
        '<p class="mg-set-note">MineGuess ist ein inoffizielles Fan-Projekt. © 2026 Cuma Asal (Aquarius Asal). Alle Rechte vorbehalten.</p>' +
        '<p class="mg-set-note">Nicht offizielles Minecraft-Produkt. Nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden. Minecraft-Texturen und -Namen © Mojang Studios / Microsoft.</p>'
    };
  }
  var curCat = 'general';
  function showCat(id) {
    curCat = id;
    [].forEach.call(panel.querySelectorAll('.mgs-cat'), function (b) { var on = b.getAttribute('data-cat') === id; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'true' : 'false'); });
    [].forEach.call(panel.querySelectorAll('.mgs-sec'), function (sec) { sec.hidden = sec.getAttribute('data-cat') !== id; });
    var t = panel.querySelector('#mgs-title'); var c = CATS.filter(function (x) { return x[0] === id; })[0]; if (t && c) t.textContent = c[1];
    panel.querySelector('.mgs').setAttribute('data-view', 'cat');
  }
  function search(q) {
    q = String(q || '').trim().toLowerCase();
    var mgs = panel.querySelector('.mgs'), any = false;
    if (!q) { mgs.classList.remove('searching'); [].forEach.call(panel.querySelectorAll('.mg-set-row, .mg-set-note'), function (r) { r.style.display = ''; }); showCat(curCat); if (matchMedia('(max-width:700px)').matches) mgs.setAttribute('data-view', 'list'); return; }
    mgs.classList.add('searching'); mgs.setAttribute('data-view', 'cat');
    var en = global.MGI18n && MGI18n.lang === 'en';
    [].forEach.call(panel.querySelectorAll('.mgs-sec'), function (sec) {
      var hit = 0;
      [].forEach.call(sec.querySelectorAll('.mg-set-row'), function (r) {
        var txt = (r.getAttribute('data-k') || '') + ' ' + (r.textContent || '').toLowerCase();
        if (en && global.MGI18n) txt += ' ' + String(r.textContent || '').toLowerCase();
        var ok = txt.indexOf(q) >= 0; r.style.display = ok ? '' : 'none'; if (ok) hit++;
      });
      [].forEach.call(sec.querySelectorAll('.mg-set-note'), function (n) { n.style.display = 'none'; });
      sec.hidden = !hit; if (hit) any = true;
    });
    panel.querySelector('#mgs-title').textContent = any ? '' : '';
    panel.querySelector('.mgs-none').hidden = any;
  }
  function build() {
    panel = document.createElement('div');
    panel.id = 'mg-settings';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'mg-set-title');
    var S = sections();
    panel.innerHTML =
      '<div class="mgs" data-view="list">' +
        '<aside class="mgs-side"><div class="mgs-sidehead"><h2 id="mg-set-title" class="mgs-h">Einstellungen</h2><button type="button" class="mg-close" aria-label="Schließen"></button></div>' +
          '<div class="mgs-search"><input type="search" id="mgs-q" placeholder="Einstellungen suchen …" aria-label="Einstellungen suchen" autocomplete="off"></div>' +
          '<nav class="mgs-nav" aria-label="Kategorien">' + CATS.map(function (c) { return '<button type="button" class="mgs-cat" data-cat="' + c[0] + '"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + c[3] + '</svg><span>' + c[1] + '</span></button>'; }).join('') + '</nav>' +
        '</aside>' +
        '<section class="mgs-main"><div class="mgs-top"><button type="button" class="mgs-back" aria-label="Zurück zu den Kategorien">&lsaquo;</button><h3 id="mgs-title"></h3><button type="button" class="mg-close" aria-label="Schließen"></button></div>' +
          '<div class="mgs-body">' + CATS.map(function (c) { return '<div class="mgs-sec" data-cat="' + c[0] + '" hidden>' + S[c[0]] + '</div>'; }).join('') + '<p class="mgs-none" hidden>Keine passende Einstellung gefunden.</p></div>' +
        '</section>' +
      '</div>';
    document.body.appendChild(panel);
    var $ = function (id) { return panel.querySelector('#' + id); };
    [].forEach.call(panel.querySelectorAll('.mgs-cat'), function (b) { b.addEventListener('click', function () { $('mgs-q').value = ''; search(''); showCat(b.getAttribute('data-cat')); }); });
    $('mgs-q').addEventListener('input', function (e) { search(e.target.value); });
    panel.querySelector('.mgs-back').addEventListener('click', function () { $('mgs-q').value = ''; search(''); panel.querySelector('.mgs').setAttribute('data-view', 'list'); });
    $('mg-set-sound').addEventListener('change', function (e) { if (global.MGAudio) MGAudio.setOn(e.target.checked); syncSoundBtn(); });
    $('mg-set-vol').addEventListener('input', function (e) { if (global.MGAudio) MGAudio.setVolume(e.target.value / 100); });
    $('mg-set-vol').addEventListener('change', function () { if (global.MGAudio) MGAudio.play('correct'); });
    $('mg-set-music').addEventListener('click', function () { close(); if (global.MGSpotify) MGSpotify.open(); });
    function bindFlag(id, key) { $(id).addEventListener('change', function (e) { ls(key, e.target.checked ? '1' : '0'); applyA11y(); }); }
    bindFlag('mg-set-contrast', A11Y.contrast); bindFlag('mg-set-font', A11Y.font);
    $('mg-set-time').addEventListener('change', function (e) { ls('mg_more_time', e.target.value); });
    $('mg-set-numhelp').addEventListener('change', function (e) { ls('mg_num_help', e.target.checked ? '1' : '0'); });
    $('mg-set-text').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-t]'); if (!b) return;
      ls(A11Y.text, b.getAttribute('data-t')); applyA11y(); syncText();
    });
    $('mg-set-tutorial').addEventListener('click', function () { close(); if (global.MGTutorial) MGTutorial.open(true); else location.href = 'game.html#tutorial'; });
    $('mg-set-install').addEventListener('click', function () {
      if (installEv) { installEv.prompt(); installEv.userChoice.then(function () { installEv = null; $('mg-set-install-row').hidden = true; }); }
      else if (isIos()) alert('Zum Installieren: Teilen-Symbol tippen und "Zum Home-Bildschirm" wählen.');
    });
    $('mg-set-report').addEventListener('click', function () { close(); if (global.MGReport) MGReport.open(); });
    $('mg-set-view').addEventListener('change', function (e) { ls('mg_view', e.target.value); if (global.MGFpv) { if (e.target.value === 'fpv') MGFpv.enter(false); else MGFpv.exit(); } });
    function sceneDo(fn) { try { var sc = global.__getSoloScene && __getSoloScene(); if (sc) fn(sc); } catch (x) {} }
    $('mg-set-gfx').addEventListener('change', function (e) { ls('mg_fpv_gfx', e.target.value); sceneDo(function (sc) { sc.setGfx(e.target.value); }); });
    $('mg-set-biome').addEventListener('change', function (e) { ls('mg_fpv_biome', e.target.value); sceneDo(function (sc) { sc.setBiome(e.target.value === 'auto' ? '' : e.target.value); }); });
    $('mg-set-fov').addEventListener('input', function (e) { ls('mg_fpv_fov', e.target.value); sceneDo(function (sc) { sc.fpvLook(0, 0); }); });
    $('mg-set-sens').addEventListener('input', function (e) { ls('mg_fpv_sens', e.target.value); });
    $('mg-set-lock').addEventListener('change', function (e) { ls('mg_fpv_lock', e.target.checked ? '1' : '0'); });
    $('mg-set-wind').addEventListener('change', function (e) { ls('mg_fpv_wind', e.target.checked ? '1' : '0'); });
    $('mg-set-clouds').addEventListener('change', function (e) { ls('mg_fpv_clouds', e.target.checked ? '1' : '0'); sceneDo(function (sc) { sc.fpvLook(0, 0); }); });
    $('mg-set-fs').addEventListener('change', function (e) { ls('mg_fpv_fs', e.target.checked ? '1' : '0'); });
    $('mg-set-emotes').addEventListener('change', function (e) { if (global.MGEmote) MGEmote.setShown(e.target.checked); });
    (function () {
      var kb = $('mg-set-ekey'), note = $('mg-set-ekey-note'), RES = { v: 'V (Ich-Ansicht)', t: 'T (Wahr)', m: 'M (Mythos)', w: 'W (Wahr)', s: 'S', '/': '/ (Suche)' };
      kb.addEventListener('click', function () {
        kb.textContent = '…'; note.textContent = ' Drücke eine Taste (Esc = abbrechen)';
        function on(e) {
          e.preventDefault(); e.stopPropagation(); document.removeEventListener('keydown', on, true);
          if (e.key === 'Escape') { kb.textContent = String(ls('mg_emote_key') || 'b').toUpperCase(); note.textContent = ''; return; }
          var k = String(e.key).toLowerCase();
          if (!/^[a-z]$/.test(k)) { kb.textContent = String(ls('mg_emote_key') || 'b').toUpperCase(); note.textContent = ' Nur Buchstaben möglich.'; return; }
          if (RES[k]) { kb.textContent = String(ls('mg_emote_key') || 'b').toUpperCase(); note.textContent = ' Taste belegt: ' + RES[k]; return; }
          ls('mg_emote_key', k); kb.textContent = k.toUpperCase(); note.textContent = ' Gespeichert.';
        }
        document.addEventListener('keydown', on, true);
      });
    })();
    $('mg-set-theme').addEventListener('change', function (e) { applyTheme(e.target.checked ? 'light' : 'dark'); });
    $('mg-set-motion').addEventListener('change', function (e) { applyMotion(e.target.checked); });
    $('mg-set-lang').addEventListener('change', function (e) { if (global.MGI18n) MGI18n.set(e.target.value); });
    $('mg-set-loader').addEventListener('change', function (e) { ls('mg_loader_short', e.target.checked ? '1' : '0'); });
    $('mg-set-profile').addEventListener('click', function () { close(); if (global.MGSkin) MGSkin.openProfile(); });
    $('mg-set-data').addEventListener('click', function () { close(); if (global.MGSkin) MGSkin.openProfile(); });
    $('mg-set-rank').addEventListener('click', function () {
      close();
      if (typeof global.showLeaderboard === 'function') global.showLeaderboard(); else location.href = 'game.html#rankliste';
    });
    [].forEach.call(panel.querySelectorAll('.mg-close'), function (x) { x.addEventListener('click', close); });
    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
    document.addEventListener('keydown', function (e) {
      if (!panel.classList.contains('open')) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      var side = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('mgs-cat');
      if (side && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); var cs = [].slice.call(panel.querySelectorAll('.mgs-cat')), i = cs.indexOf(document.activeElement); i = (i + (e.key === 'ArrowDown' ? 1 : cs.length - 1)) % cs.length; cs[i].focus(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(panel.querySelectorAll('button, input, select, a[href]'), function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }, true);
  }
  function syncText() {
    var cur = ls(A11Y.text); if (cur !== 'l' && cur !== 'xl') cur = 'm';
    [].forEach.call(panel.querySelectorAll('#mg-set-text button'), function (b) { var on = b.getAttribute('data-t') === cur; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('on', on); });
  }
  function syncSoundBtn() {
    var b = document.getElementById('sound-toggle');
    if (b) b.className = 'sound-btn' + (global.MGAudio && MGAudio.isOn() ? ' on' : '');
  }
  function renderMuted() {
    var el = panel && panel.querySelector('#mg-set-muted'); if (!el) return;
    var list = (global.MGEmote && MGEmote.mutedInfo) ? MGEmote.mutedInfo() : [];
    el.innerHTML = '';
    if (!list.length) { el.textContent = '–'; return; }
    list.forEach(function (m) {
      var row = document.createElement('span'); row.style.cssText = 'display:flex;gap:8px;align-items:center;margin:2px 0';
      var n = document.createElement('span'); n.textContent = m.name;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Aufheben'; b.setAttribute('aria-label', 'Stummschaltung aufheben: ' + m.name);
      b.addEventListener('click', function () { MGEmote.mute(m.pid, false); renderMuted(); });
      row.appendChild(n); row.appendChild(b); el.appendChild(row);
    });
  }
  function open() {
    if (!panel) build();
    lastFocus = document.activeElement;
    var $ = function (id) { return panel.querySelector('#' + id); };
    $('mg-set-sound').checked = !global.MGAudio || MGAudio.isOn();
    $('mg-set-vol').value = Math.round((global.MGAudio && MGAudio.getVolume ? MGAudio.getVolume() : 1) * 100);
    $('mg-set-view').value = ls('mg_view') === 'fpv' ? 'fpv' : 'normal'; $('mg-set-lock').checked = ls('mg_fpv_lock') === '1'; $('mg-set-gfx').value = ls('mg_fpv_gfx') || 'auto';
    $('mg-set-biome').value = ls('mg_fpv_biome') || 'auto'; $('mg-set-fov').value = ls('mg_fpv_fov') || '82'; $('mg-set-sens').value = ls('mg_fpv_sens') || '1';
    $('mg-set-wind').checked = ls('mg_fpv_wind') !== '0'; $('mg-set-clouds').checked = ls('mg_fpv_clouds') !== '0'; $('mg-set-fs').checked = ls('mg_fpv_fs') !== '0';
    $('mg-set-emotes').checked = !global.MGEmote || MGEmote.isShown(); $('mg-set-ekey').textContent = String(ls('mg_emote_key') || 'b').toUpperCase(); $('mg-set-ekey-note').textContent = '';
    $('mg-set-theme').checked = document.documentElement.getAttribute('data-theme') === 'light';
    $('mg-set-motion').checked = document.documentElement.getAttribute('data-motion') === 'reduce';
    $('mg-set-lang').value = (global.MGI18n && MGI18n.lang) || 'de';
    $('mg-set-loader').checked = ls('mg_loader_short') === '1';
    $('mg-set-install-row').hidden = standalone() || !(installEv || isIos());
    versionText().then(function (v) { var e = $('mg-set-version'); if (e) e.textContent = v; var e2 = $('mg-set-version2'); if (e2) e2.textContent = v; });
    $('mg-set-time').value = ls('mg_more_time') || '0';
    $('mg-set-numhelp').checked = ls('mg_num_help') === '1';
    $('mg-set-contrast').checked = ls(A11Y.contrast) === '1';
    $('mg-set-font').checked = ls(A11Y.font) === '1';
    syncText();
    $('mg-set-music').style.display = global.MGSpotify ? '' : 'none';
    renderMuted();
    $('mgs-q').value = ''; search('');
    var mobile = global.matchMedia && matchMedia('(max-width:700px)').matches;
    showCat(curCat || 'general'); panel.querySelector('.mgs').setAttribute('data-view', mobile ? 'list' : 'cat');
    panel.classList.add('open');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    (mobile ? panel.querySelector('.mgs-cat') : $('mgs-q')).focus();
  }
  function close() {
    if (!panel) return;
    panel.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function mount(container) {
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mg-chip mg-gear compact';
    btn.setAttribute('aria-label', 'Einstellungen öffnen'); btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = (global.MGIcon ? global.MGIcon.html('px.gear', 22) : 'Einstellungen');
    btn.addEventListener('click', open);
    if (global.MGLang) MGLang.mount(container);   // Sprachflagge links neben dem Zahnrad
    container.appendChild(btn);
    return btn;
  }
  // Service Worker auf jeder Seite registrieren (Offline-Start auch ab der Startseite)
  if ('serviceWorker' in navigator) {
    global.addEventListener('load', function () {
      var had = !!navigator.serviceWorker.controller, reloaded = false;
      // Update: nie mitten in einer Runde oder im Raum neu laden; dann nur dezenter Hinweis. Im Menue/Leerlauf wird einmal automatisch neu geladen.
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (had && !reloaded) { if (isBusy()) showUpdate(); else { reloaded = true; location.reload(); } }
        had = true;
      });
      navigator.serviceWorker.register('/sw.js').then(function (reg) {
        function check() { try { reg.update(); } catch (e) {} }
        setInterval(check, 30 * 60 * 1000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
      }).catch(function () {});
    });
  }
  // Esc schließt alle bekannten Overlays (Abzeichen, Statistik, Report, Rankliste)
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    ['badge-modal', 'stats-modal', 'report-modal'].forEach(function (id) { var m = document.getElementById(id); if (m) m.classList.remove('show'); });
    var lb = document.getElementById('lb-modal'); if (lb) lb.classList.add('hidden');
  });
  // Sanfte Seitenübergänge (nur opacity/transform, nicht bei reduzierter Bewegung)
  (function () {
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { if (localStorage.getItem('mg_reduce_motion') === '1') reduce = true; } catch (e) {}
    if (reduce) return;
    document.addEventListener('DOMContentLoaded', function () { document.body.classList.add('pg-in'); });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
      var h = a.getAttribute('href');
      if (!h || h.charAt(0) === '#' || /^(https?:|mailto:|javascript:)/.test(h)) return;
      e.preventDefault();
      document.body.classList.add('pg-out');
      setTimeout(function () { location.href = h; }, 140);
    });
  })();
  global.MGSettings = { mount: mount, open: open, close: close, isBusy: isBusy };
})(window);
