/* MineGuess Mini-Rankliste als Karussell: "Heute" und "Allzeit" (Top 5), Daten von GET /api/ranked.
   - Auto-Wechsel alle ~5,5 s mit Slide + Ausblenden (nur transform/opacity), Pause bei Hover/Fokus/Touch.
   - Manuell: Tabs/Punkte, Wischen, Pfeiltasten. Bei prefers-reduced-motion/"Animationen reduzieren": kein Auto-Wechsel.
   - Fehlerfall still: freundlicher Hinweis statt Fehlertext. */
(function (global) {
  'use strict';
  var TEX = { copper: 'copper_ingot', iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond', netherite: 'netherite_ingot' };
  var NAME = { copper: 'Copper', iron: 'Iron', gold: 'Gold', diamond: 'Diamond', netherite: 'Netherite' };
  var EMPTY = 'Noch keine Einträge – spiel eine Ranked-Runde.';

  function reduced() {
    if (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    try { return localStorage.getItem('mg_reduce_motion') === '1'; } catch (e) { return false; }
  }
  function todayKey() {
    if (global.MGRanked && MGRanked.dayKey) { try { return MGRanked.dayKey(); } catch (e) {} }
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function ingots(tier, div) {
    var n = Math.max(1, Math.min(3, parseInt(div, 10) || 1)), t = TEX[tier] || 'copper_ingot', h = '';
    for (var i = 0; i < n; i++) h += '<img class="mc-icon" src="assets/mc/item/' + t + '.png" width="18" height="18" alt="">';
    var span = document.createElement('span');
    span.className = 'rk-ingots'; span.setAttribute('role', 'img'); span.setAttribute('aria-label', (NAME[tier] || 'Copper') + ' ' + n); span.innerHTML = h;
    return span;
  }
  function pane(list, today) {
    var wrap = document.createElement('div');
    wrap.className = 'rl-pane';
    if (!list.length) { wrap.innerHTML = '<div class="mini-rank-empty">' + EMPTY + '</div>'; return wrap; }
    var me = (global.MGSkin && MGSkin.getName ? MGSkin.getName() : '').toLowerCase();
    list.slice(0, 5).forEach(function (e, i) {
      var row = document.createElement('div');
      row.className = 'mini-rank-row' + (me && String(e.name || '').toLowerCase() === me ? ' me' : '');
      var pos = document.createElement('span'); pos.className = 'mr-pos'; pos.textContent = '#' + (i + 1);
      var nm = document.createElement('span'); nm.className = 'mr-name'; nm.textContent = e.name || 'Spieler';
      var mm = document.createElement('span'); mm.className = 'mr-mmr';
      mm.textContent = (e.mmr || 0) + ' MMR' + (today && typeof e.mmrToday === 'number' && e.mmrToday ? ' (' + (e.mmrToday > 0 ? '+' : '') + e.mmrToday + ')' : '');
      row.appendChild(pos); row.appendChild(ingots(e.tier, e.division)); row.appendChild(nm); row.appendChild(mm);
      wrap.appendChild(row);
    });
    return wrap;
  }

  function mount(container) {
    container.classList.add('rl');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-roledescription', 'Karussell');
    container.setAttribute('aria-label', 'Rankliste');
    container.tabIndex = 0;
    container.innerHTML =
      '<div class="rl-head"><div class="rl-tabs" role="tablist" aria-label="Rankliste Zeitraum">' +
      '<button type="button" role="tab" class="rl-tab on" data-i="0" aria-selected="true">Heute</button>' +
      '<button type="button" role="tab" class="rl-tab" data-i="1" aria-selected="false">Allzeit</button></div>' +
      '<div class="rl-dots" aria-hidden="true"><i class="on"></i><i></i></div></div>' +
      '<div class="rl-view"><div class="rl-pane"><div class="mini-rank-empty">Lade …</div></div></div>' +
      '<div class="sr-only" aria-live="polite" id="rl-live"></div>';
    var view = container.querySelector('.rl-view'), tabs = container.querySelectorAll('.rl-tab'), dots = container.querySelectorAll('.rl-dots i');
    var live = container.querySelector('#rl-live');
    var panes = [], cur = 0, timer = null, paused = false, manual = false;

    function show(i, announce) {
      i = (i + 2) % 2;
      if (!panes.length || i === cur && panes[cur].classList.contains('act')) { cur = i; }
      panes.forEach(function (p, k) { p.classList.toggle('act', k === i); p.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
      tabs.forEach(function (t, k) { t.classList.toggle('on', k === i); t.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
      cur = i;
      if (announce && live) live.textContent = 'Rankliste ' + (i === 0 ? 'Heute' : 'Allzeit');
    }
    function auto() {
      clearInterval(timer);
      if (reduced() || manual) return;
      timer = setInterval(function () { if (!paused && !document.hidden) show(cur + 1, false); }, 5500);
    }
    tabs.forEach(function (t) { t.addEventListener('click', function () { manual = true; clearInterval(timer); show(+t.getAttribute('data-i'), true); }); });
    container.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); manual = true; clearInterval(timer); show(cur + (e.key === 'ArrowRight' ? 1 : -1), true); }
    });
    ['mouseenter', 'focusin', 'touchstart'].forEach(function (ev) { container.addEventListener(ev, function () { paused = true; }, { passive: true }); });
    ['mouseleave', 'focusout', 'touchend'].forEach(function (ev) { container.addEventListener(ev, function () { paused = false; }, { passive: true }); });
    // Wischen
    var sx = null;
    view.addEventListener('pointerdown', function (e) { sx = e.clientX; });
    view.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 40) { manual = true; clearInterval(timer); show(cur + (dx < 0 ? 1 : -1), true); }
    });

    fetch('/api/ranked', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () { return []; }).then(function (list) {
      if (!Array.isArray(list)) list = [];
      var day = todayKey();
      var sorted = list.slice().sort(function (a, b) { return (b.mmr || 0) - (a.mmr || 0); });
      var heute = sorted.filter(function (e) { return e.lastPlayedDay === day; });
      view.innerHTML = '';
      panes = [pane(heute, true), pane(sorted, false)];
      panes.forEach(function (p) { view.appendChild(p); });
      show(0, false);
      auto();
    });
  }
  global.MGRanklist = { mount: mount };
})(window);
