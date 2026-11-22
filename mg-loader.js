/* MineGuess Lade-Bildschirm (nur game.html und multiplayer.html, NICHT die Startseite).
   Dirt-Hintergrund, drehender Block, Splash-Text, XP-Leiste mit ECHTEM Fortschritt (Schrift, Seite, Fragen, Icons, Verbindung), "Wusstest du?"-Tipp.
   Mindestanzeige: ca. 2,2 s beim ersten Laden pro Sitzung, ca. 0,8 s danach, ca. 0,6 s bei reduzierter Bewegung oder Einstellung "kurz halten".
   Die Leiste fuellt sich weich (nie schneller als der echte Fortschritt) und haelt kurz bei 100 %. Per Klick, Taste oder "Ueberspringen" sofort weg.
   Nur transform/opacity. Hoher Kontrast und Textgroesse werden beachtet. Bei Fehlern: Hinweis + "Neu laden". */
(function (global) {
  'use strict';
  var root = document.getElementById('mg-loader');
  if (!root) return;
  root.hidden = false;
  var SEG = 20, MAX_WAIT = 15000, HOLD = 250;
  var isMp = /multiplayer/.test(location.pathname);
  var SPLASH = ['Jetzt mit tausenden Fragen!', 'Zahl oder Mob?', 'Glocke läuten!', 'Hartes Wissen!', 'Auch für Steve und Alex!', 'Kein Redstone nötig!', 'Sammle Abzeichen!', 'Ein Leben im Hardcore!', 'Baue das Rezept!', 'Höher oder tiefer?', '100 % blockig!', 'Creeper? Awww man!'];
  var TIPS = ['Im Multiplayer gewinnt, wer zuerst läutet und richtig liegt.', 'Mit einem Totem überstehst du einen Fehler im Multiplayer.', 'Im Crafting-Rätsel kannst du das Rezept auch selbst bauen.', 'Der Hardcore-Modus endet beim ersten Fehler.', 'Teile deine Herausforderung per Link, ohne Spoiler.'];
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; }
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  var reduced = (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || ls('mg_reduce_motion') === '1';
  var firstTime = !ss('mg_loader_seen');
  var minShow = (reduced || ls('mg_loader_short') === '1') ? 600 : (firstTime ? 3000 : 1500);
  ss('mg_loader_seen', '1');
  var tasks = [], doneCount = 0, finished = false, failed = false, started = Date.now(), timer = 0, shown = 0, raf = 0, skipped = false, allDoneAt = 0;

  var light = document.documentElement.getAttribute('data-theme') === 'light' || ls('mg_theme') === 'light';
  var still = reduced || document.documentElement.getAttribute('data-motion') === 'reduce';
  root.classList.toggle('mgl-light', light);
  var gifSrc = 'assets/brand/loading-' + (light ? 'light' : 'dark') + (still ? '.png' : '.gif');
  var segs = ''; for (var i = 0; i < SEG; i++) segs += '<i></i>';
  root.innerHTML = '<div class="mgl-box"><img class="mgl-gif" src="' + gifSrc + '" width="640" height="360" alt="" decoding="async">' +
    '<div class="mgl-splash" hidden></div><p class="mgl-tip" id="mgl-tip" hidden></p>' +
    '<div class="mgl-err" id="mgl-err" hidden><p></p><button type="button" class="btn btn-primary" id="mgl-reload">Neu laden</button></div></div>' +
    '<div class="mgl-xp"><div class="mgl-status" id="mgl-status">Loading</div>' +
    '<div class="mgl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Ladefortschritt">' + segs + '</div></div>' +
    '<button type="button" class="mgl-skip" id="mgl-skip" aria-label="Lade-Bildschirm überspringen">tap to skip</button>';
  var gifEl = root.querySelector('.mgl-gif'); if (gifEl && !still) gifEl.addEventListener('load', function () { if (!finished) started = Date.now(); });   // ein GIF-Durchlauf (3 s) ab dem Laden des GIFs
  var bar = root.querySelector('.mgl-bar'), segEls = bar.children, status = root.querySelector('#mgl-status'), tip = root.querySelector('#mgl-tip'), errBox = root.querySelector('#mgl-err');
  root.querySelector('#mgl-reload').addEventListener('click', function () { location.reload(); });
  document.body.setAttribute('aria-busy', 'true');
  root.classList.add('mgl-on');

  // ── Anzeige: weich, nie schneller als der echte Fortschritt ──
  function realP() { return tasks.length ? doneCount / tasks.length : 0; }
  function draw(p) {
    var n = Math.round(p * SEG);
    for (var k = 0; k < segEls.length; k++) { var on = k < n; if ((segEls[k].className === 'on') !== on) segEls[k].className = on ? 'on' : ''; }
    bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }
  function label() { return; }
  function labelOld() { var pend = tasks.filter(function (t) { return !t.done; })[0]; status.textContent = pend ? 'Lade Chunks: ' + pend.label + ' …' : (shown >= 1 ? 'Fertig!' : 'Chunks werden geordnet …'); }
  function tick() {
    raf = 0; if (finished) return;
    var el = Date.now() - started, target = Math.min(realP(), Math.min(1, el / minShow));
    shown += Math.max(0, Math.min(target - shown, 0.06));             // weicher Anstieg
    if (target - shown < 0.004) shown = Math.max(shown, target);
    draw(shown); label();
    var allReal = tasks.length && doneCount === tasks.length;
    if (allReal && shown >= 0.999) { if (!allDoneAt) allDoneAt = Date.now(); if (Date.now() - allDoneAt >= HOLD && el >= minShow) { hide(); return; } }
    if (!failed) raf = requestAnimationFrame(tick);
  }
  function add(label, promise, soft) {
    var t = { label: label, done: false, soft: !!soft };
    tasks.push(t);
    promise.then(function () { fin(true); }, function () { fin(false); });
    function fin(ok) { if (t.done) return; t.done = true; doneCount++; if (!ok && !t.soft) fail('„' + label + '“ konnte nicht geladen werden.'); }
    return t;
  }
  function fail(msg) {
    if (failed || finished) return; failed = true; clearTimeout(timer);
    status.textContent = 'Hoppla!'; errBox.hidden = false; errBox.querySelector('p').textContent = msg + ' Prüfe deine Verbindung und lade die Seite neu.';
    root.querySelector('#mgl-reload').focus();
  }
  function hide() {
    if (finished) return; finished = true; clearTimeout(timer); if (raf) cancelAnimationFrame(raf);
    draw(1);
    root.classList.add('mgl-out');
    var done = function () { root.hidden = true; root.classList.remove('mgl-on', 'mgl-out'); document.body.removeAttribute('aria-busy'); document.removeEventListener('keydown', onKey, true); try { global.dispatchEvent(new Event('mg-loader-done')); } catch (e) {} };
    if (reduced || document.documentElement.getAttribute('data-motion') === 'reduce') done();
    else { var d = false, f = function () { if (!d) { d = true; done(); } }; root.addEventListener('transitionend', f); setTimeout(f, 450); }
  }
  // Ueberspringen: Klick, Taste oder Link (nicht im Fehlerfall)
  function skip() { if (failed || finished) return; skipped = true; hide(); }
  root.addEventListener('click', function (e) { if (e.target.closest('#mgl-reload')) return; skip(); });
  function onKey(e) { if (failed || finished || !root.classList.contains('mgl-on')) return; if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); skip(); } }
  document.addEventListener('keydown', onKey, true);

  // ── echte Aufgaben ──
  add('Schrift', (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve(), true);
  add('Seite', document.readyState === 'complete' ? Promise.resolve() : new Promise(function (res) { global.addEventListener('load', res); }));
  if (isMp) {
    add('Verbindung', new Promise(function (res) {
      var t0 = Date.now(), iv = setInterval(function () { var ok = false; try { ok = (typeof socket !== 'undefined' && socket && socket.connected); } catch (e) {} if (ok || Date.now() - t0 > 6000) { clearInterval(iv); res(); } }, 100);
    }), true);
  } else {
    add('Fragen', fetch('questions.json').then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); }).then(function (qs) {
            /* Tipp-Element ist ausgeblendet; keine deutschen Fun Facts mehr noetig */
    }));
  }
  if (global.MGQ && MGQ.en) add('Englisch', MGQ.ready, true);   // englische Fragen vor dem Start abwarten (weich: bei Fehler Deutsch)
  add('Icons', new Promise(function (res) { var t0 = Date.now(), iv = setInterval(function () { if (global.MGIcon && global.MGIcon.ready) { clearInterval(iv); global.MGIcon.ready.then(res, res); } else if (Date.now() - t0 > 4000) { clearInterval(iv); res(); } }, 50); }), true);
  timer = setTimeout(function () { var p = tasks.filter(function (t) { return !t.done; })[0]; if (p && !p.soft) fail('Das Laden dauert ungewöhnlich lange.'); else tasks.forEach(function (t) { if (!t.done) { t.done = true; doneCount++; } }); }, MAX_WAIT);
  raf = requestAnimationFrame(tick);
  global.MGLoader = { add: function (l, p, s) { return add(l, p, s); }, done: hide };
})(window);
