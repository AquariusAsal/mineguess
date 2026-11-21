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

  function build() {
    panel = document.createElement('div');
    panel.id = 'mg-settings';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'mg-set-title');
    panel.innerHTML =
      '<div class="mg-set-card">' +
        '<div class="mg-set-head"><h2 id="mg-set-title">Einstellungen</h2><button type="button" class="mg-close" aria-label="Schließen"></button></div>' +
        '<div class="mg-set-row"><label for="mg-set-sound">Ton</label><input type="checkbox" id="mg-set-sound" class="mg-switch"></div>' +
        '<div class="mg-set-row"><label for="mg-set-vol">Lautstärke Effekte</label><input type="range" id="mg-set-vol" min="0" max="100" step="5"></div>' +
        '<div class="mg-set-row"><span>Musik</span><button type="button" class="btn" id="mg-set-music">Spotify öffnen</button></div>' +
        '<div class="mg-set-row"><label for="mg-set-theme">Helles Design</label><input type="checkbox" id="mg-set-theme" class="mg-switch"></div>' +
        '<div class="mg-set-row"><label for="mg-set-motion">Animationen reduzieren</label><input type="checkbox" id="mg-set-motion" class="mg-switch"></div>' +
        '<div class="mg-set-row"><label for="mg-set-lang">Sprache / Language</label><select id="mg-set-lang" class="form-input" style="max-width:140px"><option value="de">Deutsch</option><option value="en">English</option></select></div>' +
        '<div class="mg-set-row"><label for="mg-set-loader">Lade-Bildschirm kurz halten</label><input type="checkbox" id="mg-set-loader" class="mg-switch"></div>' +
        '<div class="mg-set-sec" role="group" aria-labelledby="mg-set-a11y">' +
          '<h3 id="mg-set-a11y">Barrierefreiheit</h3>' +
          '<div class="mg-set-row"><label for="mg-set-contrast">Hoher Kontrast</label><input type="checkbox" id="mg-set-contrast" class="mg-switch"></div>' +
          '<div class="mg-set-row"><label for="mg-set-font">Lesbare Schrift</label><input type="checkbox" id="mg-set-font" class="mg-switch"></div>' +
          '<div class="mg-set-row"><label for="mg-set-time">Mehr Zeit (nur Solo)</label><select id="mg-set-time" class="form-input" style="max-width:150px"><option value="0">Aus</option><option value="50">+50 %</option><option value="100">+100 %</option></select></div>' +
          '<div class="mg-set-row"><label for="mg-set-numhelp">Wertebereich-Hilfe bei Zahlenfragen (nur Solo)</label><input type="checkbox" id="mg-set-numhelp" class="mg-switch"></div>' +
          '<div class="mg-set-row"><span id="mg-set-text-l">Textgröße</span><div class="mg-seg" role="radiogroup" aria-labelledby="mg-set-text-l" id="mg-set-text">' +
            '<button type="button" class="chip" role="radio" data-t="m">Normal</button><button type="button" class="chip" role="radio" data-t="l">Groß</button><button type="button" class="chip" role="radio" data-t="xl">Sehr groß</button></div></div>' +
          '<div class="mg-set-row"><span>Einführung</span><button type="button" class="btn" id="mg-set-tutorial">Tutorial ansehen</button></div>' +
        '</div>' +
        '<div class="mg-set-row" id="mg-set-install-row" hidden><span>App</span><button type="button" class="btn" id="mg-set-install">App installieren</button></div>' +
        '<div class="mg-set-row"><span><img src="brand-64.png" alt="" width="18" height="18" style="vertical-align:-4px;margin-right:6px;border-radius:4px">Version</span><span id="mg-set-version" class="mg-set-ver">–</span></div>' +
        '<div class="mg-set-row"><span>Hilfe</span><button type="button" class="btn" id="mg-set-report">Problem melden</button></div>' +
        '<div class="mg-set-row"><span>Spielerprofil</span><button type="button" class="btn" id="mg-set-profile">Profil, Skin, Figur</button></div>' +
        '<div class="mg-set-row"><span>Rankliste</span><button type="button" class="btn" id="mg-set-rank">Rankliste öffnen</button></div>' +
      '</div>';
    document.body.appendChild(panel);
    var $ = function (id) { return panel.querySelector('#' + id); };
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
    $('mg-set-theme').addEventListener('change', function (e) { applyTheme(e.target.checked ? 'light' : 'dark'); });
    $('mg-set-motion').addEventListener('change', function (e) { applyMotion(e.target.checked); });
    $('mg-set-lang').addEventListener('change', function (e) { if (global.MGI18n) MGI18n.set(e.target.value); });
    $('mg-set-loader').addEventListener('change', function (e) { ls('mg_loader_short', e.target.checked ? '1' : '0'); });
    $('mg-set-profile').addEventListener('click', function () { close(); if (global.MGSkin) MGSkin.openProfile(); });
    $('mg-set-rank').addEventListener('click', function () {
      close();
      if (typeof global.showLeaderboard === 'function') global.showLeaderboard(); else location.href = 'game.html#rankliste';
    });
    panel.querySelector('.mg-close').addEventListener('click', close);
    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
    document.addEventListener('keydown', function (e) {
      if (!panel.classList.contains('open')) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(panel.querySelectorAll('button, input'), function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  function syncText() {
    var cur = ls(A11Y.text); if (cur !== 'l' && cur !== 'xl') cur = 'm';
    [].forEach.call(panel.querySelectorAll('#mg-set-text button'), function (b) { var on = b.getAttribute('data-t') === cur; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('on', on); });
  }
  function syncSoundBtn() {
    var b = document.getElementById('sound-toggle');
    if (b) b.className = 'sound-btn' + (global.MGAudio && MGAudio.isOn() ? ' on' : '');
  }
  function open() {
    if (!panel) build();
    lastFocus = document.activeElement;
    panel.querySelector('#mg-set-sound').checked = !global.MGAudio || MGAudio.isOn();
    panel.querySelector('#mg-set-vol').value = Math.round((global.MGAudio && MGAudio.getVolume ? MGAudio.getVolume() : 1) * 100);
    panel.querySelector('#mg-set-theme').checked = document.documentElement.getAttribute('data-theme') === 'light';
    panel.querySelector('#mg-set-motion').checked = document.documentElement.getAttribute('data-motion') === 'reduce';
    panel.querySelector('#mg-set-lang').value = (global.MGI18n && MGI18n.lang) || 'de';
    panel.querySelector('#mg-set-loader').checked = ls('mg_loader_short') === '1';
    panel.querySelector('#mg-set-install-row').hidden = standalone() || !(installEv || isIos());
    versionText().then(function (v) { var e = panel.querySelector('#mg-set-version'); if (e) e.textContent = v; });
    panel.querySelector('#mg-set-time').value = ls('mg_more_time') || '0';
    panel.querySelector('#mg-set-numhelp').checked = ls('mg_num_help') === '1';
    panel.querySelector('#mg-set-contrast').checked = ls(A11Y.contrast) === '1';
    panel.querySelector('#mg-set-font').checked = ls(A11Y.font) === '1';
    syncText();
    panel.querySelector('#mg-set-music').style.display = global.MGSpotify ? '' : 'none';
    panel.classList.add('open');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    panel.querySelector('#mg-set-sound').focus();
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
  global.MGSettings = { mount: mount, open: open, close: close };
})(window);
