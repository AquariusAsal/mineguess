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
        '<div class="mg-set-row"><span>Spielerprofil</span><button type="button" class="btn" id="mg-set-profile">Profil, Skin, Figur</button></div>' +
        '<div class="mg-set-row"><span>Rankliste</span><button type="button" class="btn" id="mg-set-rank">Rankliste öffnen</button></div>' +
      '</div>';
    document.body.appendChild(panel);
    var $ = function (id) { return panel.querySelector('#' + id); };
    $('mg-set-sound').addEventListener('change', function (e) { if (global.MGAudio) MGAudio.setOn(e.target.checked); syncSoundBtn(); });
    $('mg-set-vol').addEventListener('input', function (e) { if (global.MGAudio) MGAudio.setVolume(e.target.value / 100); });
    $('mg-set-vol').addEventListener('change', function () { if (global.MGAudio) MGAudio.play('correct'); });
    $('mg-set-music').addEventListener('click', function () { close(); if (global.MGSpotify) MGSpotify.open(); });
    $('mg-set-theme').addEventListener('change', function (e) { applyTheme(e.target.checked ? 'light' : 'dark'); });
    $('mg-set-motion').addEventListener('change', function (e) { applyMotion(e.target.checked); });
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
