/* MineGuess Einfuehrung: 4 kurze Schritte (Modi, Wertung, Glocke/Antwortphase, Ranked), ueberspringbar, im Zahnrad wiederholbar.
   Mini-Grafiken als SVG. Dialog mit Fokus-Falle, Esc/Ueberspringen, Pfeiltasten. Merkt sich mg_tutorial_done. */
(function (global) {
  'use strict';
  var KEY = 'mg_tutorial_done';
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function rect(x, y, w, h, c) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>'; }
  function svg(inner) { return '<svg class="tu-art" viewBox="0 0 96 56" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' + inner + '</svg>'; }
  var ART = [
    '<img class="tu-art tu-brand" src="banner-600.png" alt="MineGuess" width="260" height="109" style="width:100%;max-width:260px;height:auto;aspect-ratio:2532/1060;border-radius:10px;display:block;margin:0 auto">',
    svg(rect(8, 10, 12, 12, 'var(--green)') + rect(26, 10, 12, 12, 'var(--gold)') + rect(44, 10, 12, 12, 'var(--bg3)') + rect(8, 32, 80, 6, 'var(--bg3)') + rect(8, 32, 54, 6, 'var(--green)') + rect(8, 44, 40, 4, 'var(--muted2)')),
    svg(rect(40, 6, 16, 4, 'var(--gold)') + rect(34, 10, 28, 8, 'var(--gold)') + rect(30, 18, 36, 14, 'var(--gold)') + rect(26, 32, 44, 6, 'var(--gold)') + rect(42, 40, 12, 6, 'var(--muted)') + rect(20, 14, 4, 8, 'var(--muted2)') + rect(72, 14, 4, 8, 'var(--muted2)')),
    svg(rect(6, 38, 16, 10, 'var(--dirt)') + rect(26, 30, 16, 18, 'var(--muted)') + rect(46, 22, 16, 26, 'var(--gold)') + rect(66, 12, 16, 36, 'var(--blue)'))
  ];
  var STEPS = [
    { t: 'Wähle deinen Modus', p: 'Solo: Endlos, Blitz, tägliche Challenge, Crafting-Rätsel oder Ranked. Im Multiplayer spielst du live gegen Freunde, ganz ohne Anmeldung.' },
    { t: 'So wird gewertet', p: 'Du hast pro Frage 3 Versuche. Je früher richtig, desto mehr Punkte. Tipps kosten Punkte, eine Serie richtiger Antworten gibt Bonus.' },
    { t: 'Glocke und Antwortphase', p: 'Im Multiplayer drückt jeder die Glocke. Wer zuerst klingelt, darf antworten. Eine falsche Antwort sperrt dich kurz, danach sind die anderen dran.' },
    { t: 'Ranked und Rang', p: 'Ranked sind 10 Fragen mit steigender Schwierigkeit. Dein MMR bestimmt den Rang von Copper bis Netherite. Es gibt kein Versuchslimit, nur Fortschritt.' }
  ];
  var dlg = null, idx = 0, last = null;

  function render() {
    var s = STEPS[idx], dots = STEPS.map(function (_, i) { return '<span class="tu-dot' + (i === idx ? ' on' : '') + '"></span>'; }).join('');
    dlg.querySelector('.tu-body').innerHTML = ART[idx] + '<h2 id="tu-title">' + s.t + '</h2><p>' + s.p + '</p>';
    dlg.querySelector('.tu-dots').innerHTML = dots;
    dlg.querySelector('.tu-dots').setAttribute('aria-label', 'Schritt ' + (idx + 1) + ' von ' + STEPS.length);
    dlg.querySelector('#tu-back').style.visibility = idx ? 'visible' : 'hidden';
    dlg.querySelector('#tu-next').textContent = idx === STEPS.length - 1 ? 'Los geht’s' : 'Weiter';
    dlg.querySelector('.tu-count').textContent = (idx + 1) + ' / ' + STEPS.length;
  }
  function build() {
    dlg = document.createElement('div'); dlg.id = 'mg-tutorial'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'tu-title');
    dlg.innerHTML = '<div class="tu-card"><button type="button" class="mg-close mg-close-abs" id="tu-x" aria-label="Einführung schließen"></button>' +
      '<div class="tu-body" aria-live="polite"></div><div class="tu-dots" role="img"></div>' +
      '<div class="tu-nav"><button type="button" class="btn btn-ghost" id="tu-back">Zurück</button><span class="tu-count" aria-hidden="true"></span><button type="button" class="btn btn-primary" id="tu-next">Weiter</button></div>' +
      '<button type="button" class="tu-skip" id="tu-skip">Überspringen</button></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#tu-next').addEventListener('click', function () { if (idx >= STEPS.length - 1) close(); else { idx++; render(); } });
    dlg.querySelector('#tu-back').addEventListener('click', function () { if (idx) { idx--; render(); } });
    dlg.querySelector('#tu-skip').addEventListener('click', close);
    dlg.querySelector('#tu-x').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (!dlg.classList.contains('open')) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight') { dlg.querySelector('#tu-next').click(); }
      else if (e.key === 'ArrowLeft') { dlg.querySelector('#tu-back').click(); }
      else if (e.key === 'Tab') {
        var f = [].filter.call(dlg.querySelectorAll('button'), function (n) { return n.offsetParent !== null && getComputedStyle(n).visibility !== 'hidden'; });
        if (!f.length) return;
        if (!dlg.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
        else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }, true);
  }
  function open() {
    if (!dlg) build();
    last = document.activeElement; idx = 0; render();
    dlg.classList.add('open'); dlg.querySelector('#tu-next').focus();
  }
  function close() {
    if (!dlg) return;
    dlg.classList.remove('open'); ls(KEY, '1');
    if (last && last.focus) try { last.focus(); } catch (e) {}
  }
  // Verschwindet das Menue (Spiel startet), darf die Einfuehrung nicht darueber haengen bleiben
  function watch(ms) {
    try { new MutationObserver(function (_, o) { if (ms.classList.contains('hidden') && dlg && dlg.classList.contains('open')) { close(); o.disconnect(); } }).observe(ms, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
  }
  // Automatisch beim ersten Besuch im Spiel-Menue (nach dem Anmelde-Dialog), nie bei Challenge-Links
  function auto() {
    if (ls(KEY) === '1' || !/game\.html$|\/game$/.test(location.pathname) || /[?&]c=/.test(location.search)) return;
    var tries = 0, iv = setInterval(function () {
      tries++;
      var auth = document.getElementById('auth-modal'), ms = document.getElementById('mode-screen');
      var authOpen = auth && !auth.classList.contains('hidden');
      if (!authOpen && ms && !ms.classList.contains('hidden')) { clearInterval(iv); setTimeout(function () { if (ls(KEY) !== '1' && ms && !ms.classList.contains('hidden')) { open(); watch(ms); } }, 600); }
      else if (tries > 60) clearInterval(iv);
    }, 500);
  }
  document.addEventListener('DOMContentLoaded', function () { if (location.hash === '#tutorial') open(); else auto(); });
  global.MGTutorial = { open: open, close: close };
})(window);
