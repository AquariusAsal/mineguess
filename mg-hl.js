/* MineGuess "Höher oder Tiefer": Karte A zeigt Name + Wert, Karte B nur Name + Icon. Ist B höher oder tiefer?
   Paare/Regeln/Serie/Leben: MGPairs (pairs.js, Pool aus pairs.json). Hier nur UI: Herzen (offizielle GUI-Sprites assets/mc/gui/heart_*.png),
   Reveal mit Count-up, orb/anvil ueber MGAudio, Bestserie lokal (mg_hl_best). Bedienung: Buttons, Pfeil hoch/runter (auch W/S),
   Wischen auf Karte B, Weiter mit Leertaste/Enter. Keine Ranked-Wirkung. */
(function (global) {
  'use strict';
  var LIVES = 3, KEY_BEST = 'mg_hl_best';
  var pool = null, loading = null, root = null, st = null, raf = 0, adv = 0;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function reduced() { return (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.getAttribute('data-motion') === 'reduce'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(v) { return MGPairs.format(v); }
  function load() {
    if (pool) return Promise.resolve(pool);
    if (!loading) loading = fetch('pairs.json').then(function (r) { return r.json(); }).then(function (j) { pool = MGPairs.fromMeasures(j); return pool; });
    return loading;
  }
  function heart(full) {
    return '<span class="hl-heart' + (full ? ' full' : '') + '" aria-hidden="true"><img src="assets/mc/gui/heart_container.png" alt="" width="27" height="27">' +
      (full ? '<img class="hl-heart-fill" src="assets/mc/gui/heart_full.png" alt="" width="27" height="27">' : '') + '</span>';
  }
  function arrow(up) { return '<img class="hl-arrow ' + (up ? 'up' : 'down') + '" src="assets/mc/item/arrow.png" alt="" width="28" height="28">'; }

  function build() {
    root = document.createElement('section'); root.id = 'mg-hl'; root.className = 'hl'; root.hidden = true; root.setAttribute('aria-label', 'Höher oder Tiefer');
    root.innerHTML =
      '<div class="hl-top"><button type="button" class="btn btn-ghost hl-back">Zurück zum Menü</button><button type="button" class="btn btn-ghost hl-report" id="hl-report">Melden</button>' +
        '<div class="hl-stats"><span>Serie <b id="hl-streak">0</b></span><span>Bestserie <b id="hl-best">0</b></span><span class="hl-hearts" id="hl-hearts" role="img"></span></div></div>' +
      '<h2 class="hl-q" id="hl-q"></h2>' +
      '<div class="hl-cards"><article class="hl-card" id="hl-a" aria-label="Vergleichswert"></article><div class="hl-vs" aria-hidden="true">VS</div>' +
        '<article class="hl-card hl-b" id="hl-b"></article></div>' +
      '<div class="hl-btns" id="hl-btns"><button type="button" class="btn hl-up" id="hl-up">' + arrow(true) + 'Höher</button><button type="button" class="btn hl-down" id="hl-down">' + arrow(false) + 'Tiefer</button></div>' +
      '<button type="button" class="btn btn-primary hl-next" id="hl-next" hidden>Weiter</button>' +
      '<p class="hl-hint">Pfeiltaste hoch oder runter, oder auf die rechte Karte nach oben oder unten wischen.</p>' +
      '<div class="hl-status" id="hl-status" role="status" aria-live="polite"></div>' +
      '<div class="hl-end" id="hl-end" role="dialog" aria-modal="true" aria-labelledby="hl-end-t" hidden></div>';
    var ms0 = document.getElementById('mode-screen'); if (ms0 && ms0.parentNode) ms0.parentNode.insertBefore(root, ms0.nextSibling); else document.body.appendChild(root);
    root.querySelector('.hl-back').addEventListener('click', close);
    root.querySelector('#hl-report').addEventListener('click', function () { if (global.MGReport) MGReport.open({ mode: 'hl', format: 'hl', round: st ? st.s.rounds + 1 : 0 }); });
    root.querySelector('#hl-up').addEventListener('click', function () { guess('higher'); });
    root.querySelector('#hl-down').addEventListener('click', function () { guess('lower'); });
    root.querySelector('#hl-next').addEventListener('click', next);
    var b = root.querySelector('#hl-b'), y0 = null, pid = null;
    b.addEventListener('pointerdown', function (e) { if (pid !== null) return; pid = e.pointerId; y0 = e.clientY; try { b.setPointerCapture(pid); } catch (x) {} });
    b.addEventListener('pointerup', function (e) { if (e.pointerId !== pid) return; var dy = e.clientY - y0; pid = null; if (Math.abs(dy) > 40) guess(dy < 0 ? 'higher' : 'lower'); });
    b.addEventListener('pointercancel', function () { pid = null; });
    document.addEventListener('keydown', function (e) {
      if (root.hidden) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (!root.querySelector('#hl-end').hidden) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); guess('higher'); }
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); guess('lower'); }
      else if ((e.key === ' ' || e.key === 'Enter') && st && st.revealed && e.target.tagName !== 'BUTTON') { e.preventDefault(); next(); }
    }, true);
  }
  function card(el, c, tpl, hidden) {
    el.innerHTML = '<div class="hl-ico">' + (c.icon ? '<img src="assets/mc/' + esc(c.icon) + '.png" width="48" height="48" alt="" onerror="this.hidden=true">' : '') + '</div>' +
      '<h3 class="hl-name">' + esc(c.name) + '</h3><div class="hl-meas">' + esc(tpl.label) + '</div>' +
      '<div class="hl-val" id="' + el.id + '-v">' + (hidden ? '<span class="hl-q-mark" aria-hidden="true">?</span>' : esc(c.text)) + '</div>'+
      '';
    el.className = 'hl-card' + (el.id === 'hl-b' ? ' hl-b' : '');
  }
  function stats() {
    var s = st.s, h = root.querySelector('#hl-hearts'); h.innerHTML = '';
    for (var i = 0; i < LIVES; i++) h.insertAdjacentHTML('beforeend', heart(i < s.lives));
    h.setAttribute('aria-label', 'Leben: ' + s.lives + ' von ' + LIVES);
    root.querySelector('#hl-streak').textContent = s.streak;
    root.querySelector('#hl-best').textContent = Math.max(st.best, s.best);
  }
  function setBtns(active) { root.querySelector('#hl-btns').hidden = !active; root.querySelector('#hl-next').hidden = active; }
  function round() {
    clearTimeout(adv);
    var p = st.p;
    root.querySelector('#hl-status').textContent = '';
    card(root.querySelector('#hl-a'), p.a, p.tpl, false);
    card(root.querySelector('#hl-b'), p.b, p.tpl, true);
    root.querySelector('#hl-q').innerHTML = esc(p.tpl.ask) + ' <span class="hl-q-sub">' + esc(p.b.name) + ' im Vergleich zu ' + esc(p.a.name) + '</span>';
    st.revealed = false; stats(); setBtns(true);
    if (!reduced()) { var b = root.querySelector('#hl-b'); b.classList.add('in'); setTimeout(function () { b.classList.remove('in'); }, 320); }
  }
  function countUp(el, to, finalText, done) {
    if (reduced()) { el.textContent = finalText; done && done(); return; }
    var t0 = performance.now(), dur = 700;
    (function tick(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(to * e * 100) / 100);
      if (k < 1) raf = requestAnimationFrame(tick); else { el.textContent = finalText; done && done(); }
    })(t0);
  }
  function guess(dir) {
    if (!st || st.revealed || root.hidden) return;
    st.revealed = true; setBtns(false);
    var p = st.p, ok = MGPairs.answer(p, dir).correct, bEl = root.querySelector('#hl-b'), vEl = root.querySelector('#hl-b-v');
    vEl.innerHTML = ''; var span = document.createElement('span'); vEl.appendChild(span);
    var before = st.s.lives;
    MGPairs.advance(st.s, p, ok);
    if (st.s.best > st.best) { st.best = st.s.best; ls(KEY_BEST, String(st.best)); }
    countUp(span, p.b.value, p.b.text, function () {
      bEl.classList.add(ok ? 'ok' : 'bad');
      root.querySelector('#hl-status').textContent = (ok ? 'Richtig. ' : 'Falsch. ') + p.b.name + ': ' + p.b.text + ', das ist ' + (p.higher ? 'höher' : 'tiefer') + ' als ' + p.a.name + ' (' + p.a.text + ').';
      if (!root.querySelector('#hl-next').hidden) root.querySelector('#hl-next').focus({ preventScroll: true });
    });
    bEl.setAttribute('data-res', ok ? '✓ Richtig' : '✕ Falsch');
    if (global.MGAudio) MGAudio.play(ok ? 'correct' : 'wrong');
    stats();
    if (!ok && !reduced() && before > st.s.lives) { var lost = root.querySelectorAll('.hl-heart')[st.s.lives]; if (lost) lost.classList.add('lose'); }
    if (st.s.lives <= 0) { root.querySelector('#hl-next').hidden = true; adv = setTimeout(end, reduced() ? 900 : 1800); return; }
    adv = setTimeout(next, reduced() ? 4000 : 2800);
  }
  function next() {
    if (!st || !st.revealed) return;
    clearTimeout(adv); cancelAnimationFrame(raf);
    st.p = MGPairs.next(pool, st.s);
    round();
    root.querySelector('#hl-up').focus({ preventScroll: true });
  }
  function end() {
    var e = root.querySelector('#hl-end'), nb = st.s.best > st.prevBest;
    e.innerHTML = '<div class="hl-end-card"><h2 id="hl-end-t">Alle Herzen verloren</h2><div class="hl-end-n">' + st.s.best + '</div><p>beste Serie in dieser Runde</p>' +
      '<p class="hl-end-best">' + (nb ? 'Neue Bestserie!' : 'Bestserie: ' + st.best) + '</p>' +
      '<div class="hl-end-btns"><button type="button" class="btn btn-primary" id="hl-again">Nochmal</button><button type="button" class="btn" id="hl-menu">Zum Menü</button></div></div>';
    e.hidden = false;
    e.querySelector('#hl-again').addEventListener('click', function () { e.hidden = true; start(); });
    e.querySelector('#hl-menu').addEventListener('click', close);
    e.querySelector('#hl-again').focus();
  }
  function start() {
    load().then(function () {
      var best = parseInt(ls(KEY_BEST), 10) || 0, s = MGPairs.newState();
      st = { s: s, best: best, prevBest: best, revealed: false };
      st.p = MGPairs.next(pool, s);
      root.querySelector('#hl-end').hidden = true; round();
      root.querySelector('#hl-up').focus({ preventScroll: true });
    });
  }
  function open() {
    if (!root) build();
    var ms = document.getElementById('mode-screen'); if (ms) ms.classList.add('hidden');
    root.hidden = false; document.body.classList.add('hl-open'); start(); global.scrollTo(0, 0);
  }
  function close() {
    clearTimeout(adv); cancelAnimationFrame(raf);
    if (root) { root.hidden = true; root.querySelector('#hl-end').hidden = true; }
    document.body.classList.remove('hl-open'); st = null;
    var ms = document.getElementById('mode-screen'); if (ms) ms.classList.remove('hidden');
    if (global.renderMenuStatus) setTimeout(global.renderMenuStatus, 30);
  }
  global.MGHL = { open: open, close: close };
})(window);
