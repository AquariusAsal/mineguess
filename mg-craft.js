/* MineGuess Crafting-Raetsel: Werkbank-Panel mit 3x3-Raster, Zutaten als Item-Icons.
   Frage: { type:'crafting', grid:[[a,b,c],[d,e,f],[g,h,i]] (Item-Schluessel oder null), resultCount, answer (deutscher Name),
            shapeless? (bool), gridLabels? (gleiche Form, deutsche Namen) }
   API: MGCraft.render(host, question)  -> Raster zeigen
        MGCraft.reveal(host, question)  -> Ergebnis gross (Pop, Menge, Name)
        MGCraft.clear(host)
   Barrierefreiheit: role=grid mit Textbeschreibung je Slot ("Reihe 1, Spalte 1: Eichenbretter" / "leer") und Gesamtbeschreibung. */
(function (global) {
  'use strict';
  var BASE = 'assets/mc/';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pretty(key) { return String(key).replace(/^(item|block)\//, '').replace(/_/g, ' '); }

  // Item-Schluessel -> Textur-Pfad (ohne .png). Akzeptiert "item/stick", "oak_planks" oder deutsche Namen (icons.json).
  // ingredient-icons.json: { registryName: { icon:'item/x.png', de:'Deutscher Name', real:bool } } einmal laden
  var ING = null, lastRender = null;
  fetch(BASE + 'ingredient-icons.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (j) {
    ING = j || {};
    if (lastRender && lastRender[0].isConnected) render(lastRender[0], lastRender[1]);   // nach dem Laden neu zeichnen
  });
  function texOf(key) {
    if (!key) return '';
    var k = String(key);
    if (ING && ING[k] && ING[k].icon) return String(ING[k].icon).replace(/.png$/, '');
    if (/^(item|block)\//.test(k)) return k.replace(/\.png$/, '');
    if (global.MGIcon && MGIcon.forLabel) return MGIcon.forLabel(k, k.replace(/_/g, ' '));
    return 'item/' + k;
  }
  function label(q, r, c) {
    var key = q.grid[r][c];
    if (!key) return 'leer';
    var l = q.gridLabels && q.gridLabels[r] && q.gridLabels[r][c];
    if (!l && ING && ING[key] && ING[key].de) l = ING[key].de;
    return l || pretty(key);
  }
  function img(path, size, cls) {
    return '<img class="' + (cls || 'craft-ico') + '" src="' + BASE + esc(path) + '.png" width="' + size + '" height="' + size +
      '" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'' + BASE + 'item/barrier.png\'">';
  }

  function render(host, q) {
    if (!host || !q || !Array.isArray(q.grid)) return;
    lastRender = [host, q];
    var grid = [0, 1, 2].map(function (r) { return [0, 1, 2].map(function (c) { return (q.grid[r] && q.grid[r][c]) || null; }); });
    q = { grid: grid, gridLabels: q.gridLabels, shapeless: q.shapeless, resultCount: q.resultCount, answer: q.answer };
    var desc = [], rows = '';
    for (var r = 0; r < 3; r++) {
      var cells = '', rd = [];
      for (var c = 0; c < 3; c++) {
        var key = grid[r][c], lab = label(q, r, c);
        rd.push(lab);
        cells += '<div class="craft-slot' + (key ? ' full' : '') + '" role="gridcell" aria-label="Reihe ' + (r + 1) + ', Spalte ' + (c + 1) + ': ' + esc(lab) + '" title="' + esc(lab) + '">' +
          (key ? img(texOf(key), 48) : '') + '</div>';
      }
      desc.push('Reihe ' + (r + 1) + ': ' + rd.join(', '));
      rows += '<div class="craft-row" role="row">' + cells + '</div>';
    }
    host.className = (host.className.replace(/craft-host/, '') + ' craft-host').trim();
    host.classList.remove('revealed');
    host.innerHTML =
      '<div class="craft-wrap">' +
        '<div class="craft-panel">' +
          '<div class="craft-grid" role="grid" aria-label="Crafting-Raster, 3 mal 3. ' + esc(desc.join('. ')) + (q.shapeless ? '. Formloses Rezept' : '') + '">' + rows + '</div>' +
          '<div class="craft-arrow" aria-hidden="true"></div>' +
          '<div class="craft-out"><div class="craft-slot out" id="craft-out" aria-label="Ergebnis: noch unbekannt" title="Ergebnis"><span class="craft-q" aria-hidden="true">?</span></div></div>' +
          (q.shapeless ? '<span class="craft-tag">formlos</span>' : '') +
        '</div>' +
        '<div class="craft-name" id="craft-name" role="status"></div>' +
      '</div>';
  }

  // Ergebnis erst NACH der Antwort/Aufloesung: fuellt den Ergebnis-Slot rechts vom Raster (Pop), Name darunter
  function reveal(host, q) {
    if (!host || !q) return;
    var out = host.querySelector('.craft-slot.out'), name = host.querySelector('.craft-name');
    if (!out) return;
    var path = texOf(q.resultKey || q.answer), n = q.resultCount > 1 ? q.resultCount : 0;
    out.innerHTML = img(path, 64, 'craft-big') + (n ? '<span class="craft-count">' + n + '</span>' : '');
    out.classList.add('pop');
    out.setAttribute('aria-label', 'Ergebnis: ' + (n ? n + ' mal ' : '') + (q.answer || ''));
    if (name) name.textContent = (n ? n + 'x ' : '') + (q.answer || '');
    host.classList.add('revealed');
  }
  function clear(host) { if (host) { host.innerHTML = ''; host.classList.remove('revealed'); host.className = host.className.replace(/\bcraft-host\b/, '').trim(); } }

  global.MGCraft = { render: render, reveal: reveal, clear: clear };
})(window);
