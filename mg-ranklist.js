/* MineGuess Mini-Rankliste (Top 5): GET /api/ranked (Server-Fallback), stiller Fehlerfall ohne Fehlertext. */
(function (global) {
  'use strict';
  var TEX = { copper: 'copper_ingot', iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond', netherite: 'netherite_ingot' };
  var NAME = { copper: 'Copper', iron: 'Iron', gold: 'Gold', diamond: 'Diamond', netherite: 'Netherite' };
  function ingots(tier, div) {
    var n = Math.max(1, Math.min(3, parseInt(div, 10) || 1)), t = TEX[tier] || 'copper_ingot', h = '';
    for (var i = 0; i < n; i++) h += '<img class="mc-icon" src="assets/mc/item/' + t + '.png" width="18" height="18" alt="">';
    var span = document.createElement('span');
    span.className = 'rk-ingots'; span.setAttribute('role', 'img'); span.setAttribute('aria-label', (NAME[tier] || 'Copper') + ' ' + n); span.innerHTML = h;
    return span;
  }
  function empty(container) { container.innerHTML = '<div class="mini-rank-empty">Noch keine Einträge.</div>'; }
  function mount(container, opts) {
    opts = opts || {};
    container.classList.add('mini-rank');
    container.setAttribute('aria-live', 'polite');
    container.innerHTML = '<div class="mini-rank-empty">Lade …</div>';
    fetch('/api/ranked', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (list) {
      container.innerHTML = '';
      if (!Array.isArray(list) || !list.length) { empty(container); return; }
      var me = (global.MGSkin && MGSkin.getName ? MGSkin.getName() : '').toLowerCase();
      list.slice(0, opts.limit || 5).forEach(function (e, i) {
        var row = document.createElement('div');
        row.className = 'mini-rank-row' + (me && String(e.name || '').toLowerCase() === me ? ' me' : '');
        var pos = document.createElement('span'); pos.className = 'mr-pos'; pos.textContent = '#' + (i + 1);
        var nm = document.createElement('span'); nm.className = 'mr-name'; nm.textContent = e.name || 'Spieler';
        var mm = document.createElement('span'); mm.className = 'mr-mmr'; mm.textContent = (e.mmr || 0) + ' MMR';
        row.appendChild(pos); row.appendChild(ingots(e.tier, e.division)); row.appendChild(nm); row.appendChild(mm);
        container.appendChild(row);
      });
    }).catch(function () { empty(container); });
  }
  global.MGRanklist = { mount: mount };
})(window);
