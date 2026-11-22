/* MineGuess Crafting-Bau-Modus ("Selber bauen"): Ergebnis-Item sehen, Rezept per Suchleiste + Drag-Painting ins 3x3-Raster legen.
   API: MGCraftBuild.mount(host, question, { onCheck(grid), onHint() }) -> Controller
        Controller: getGrid(), setMarks(diff), clearMarks(), applyHint({r,c,key}), finish(won, question), setBusy(b), destroy()
   Frage: { answer (deutscher Name), resultKey, resultCount, solution:{ shapeless, grid:[[[keys]|null]..] | items:[[keys]..] } }
   Katalog: assets/mc/craft-items.json [{key,de,en,aliases,icon}] (Fallback: assets/mc/ingredient-icons.json)
   Bedienung: Item in der Suche waehlen (Cursor-Item), dann klicken oder ueber Slots streichen (Pointer Events, Pfad-Interpolation).
   Rechtsklick/Rechts-Wischen, langer Druck oder Radiergummi entfernt. Tastatur: Pfeile, Enter/Leertaste legt, Entf entfernt, "/" Suche. */
(function (global) {
  'use strict';
  var BASE = 'assets/mc/';
  var RECENT_KEY = 'mg_craft_recent';
  var catalog = null, byKey = {}, loading = null, waiters = [];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fold(s) {
    s = String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function readJSON(url) { return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }

  function loadCatalog(cb) {
    if (catalog) return cb(catalog);
    waiters.push(cb);
    if (loading) return;
    loading = Promise.all([readJSON(BASE + 'craft-items.json'), readJSON(BASE + 'ingredient-icons.json')]).then(function (res) {
      var j = res[0], ing = res[1] || {};
      var arr = (Array.isArray(j) && j.length) ? j : Object.keys(ing).map(function (k) { return { key: k, de: ing[k].de || k.replace(/_/g, ' '), en: k.replace(/_/g, ' '), aliases: [] }; });
      arr.forEach(function (it) { if (!it.icon && ing[it.key] && ing[it.key].icon) it.icon = ing[it.key].icon; });
      return arr;
    }).then(function (arr) {
      catalog = arr.map(function (it) {
        var names = [it.de, it.en].concat(it.aliases || []);
        return { key: it.key, de: it.de || it.en || it.key, en: it.en || '', icon: String(it.icon || '').replace(/\.png$/, ''), f: names.map(fold).filter(Boolean), fd: fold(it.de) };
      });
      catalog.forEach(function (it) { byKey[it.key] = it; });
      var w = waiters; waiters = []; w.forEach(function (f) { f(catalog); });
    });
  }
  function iconOf(key) {
    var it = byKey[key];
    if (it && it.icon) return it.icon;
    return /^(item|block)\//.test(key) ? String(key).replace(/\.png$/, '') : 'item/' + key;
  }
  function en() { return !!(global.MGQ && MGQ.en); }
  function deOf(key) { return byKey[key] ? byKey[key].de : String(key).replace(/^(item|block)[/]/, '').replace(/_/g, ' '); }   // Icon-Label bleibt deutsch
  function nameOf(key) { var it = byKey[key]; return (en() && it && it.en) ? it.en : deOf(key); }   // Anzeige in der gewaehlten Sprache
  function dispName(it) { return (en() && it.en) ? it.en : it.de; }
  function img(key, cls, size) { return imgP(iconOf(key), cls, size, deOf(key)); }
  function imgP(p, cls, size, label) {
    var alt = p.indexOf('item/') === 0 ? 'block/' + p.slice(5) : (p.indexOf('block/') === 0 ? 'item/' + p.slice(6) : '');
    return '<img class="' + cls + '"' + (label ? ' data-iso-label="' + esc(label) + '"' : '') + ' src="' + BASE + esc(p) + '.png" width="' + size + '" height="' + size + '" alt="" draggable="false" data-alt="' + esc(alt) + '" onerror="MGCraftBuild._ie(this)">';
  }

  function search(text) {
    var q = fold(text);
    if (!q || !catalog) return [];
    var out = [];
    catalog.forEach(function (it) {
      var best = 0;
      it.f.forEach(function (n, i) {
        var s = 0;
        if (n === q) s = 100;
        else if (n.indexOf(q) === 0) s = 80;
        else if ((' ' + n).indexOf(' ' + q) >= 0) s = 60;
        else if (n.indexOf(q) >= 0) s = 40;
        if (s && i > 1) s -= 10;
        if (s > best) best = s;
      });
      if (best) out.push({ it: it, s: best - Math.min(20, it.fd.length / 4) });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, 40).map(function (x) { return x.it; });
  }

  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  function reduced() {
    return (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.getAttribute('data-motion') === 'reduce';
  }

  function mount(host, q, opts) {
    opts = opts || {};
    var grid = [[null, null, null], [null, null, null], [null, null, null]];
    var cursor = null, eraser = false, busy = false, done = false, active = [0, 0], marks = null;
    var recent = []; try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(function (k) { return typeof k === 'string'; }).slice(0, 8); } catch (e) {}
    var count = q.resultCount > 1 ? q.resultCount : 0;
    var resKey = q.resultKey || q.answer;
    function resPath() { return global.MGCraft && MGCraft.resultIcon ? MGCraft.resultIcon(q) : iconOf(resKey); }

    host.className = (host.className.replace(/\bcraft-host\b/, '') + ' craft-host').trim();
    host.innerHTML =
      '<div class="craft-wrap cb-wrap">' +
        (count ? '<div class="cb-target"><span class="cb-target-lbl">Menge</span> <b id="cb-target-name">' + count + 'x</b></div>' : '') +
        '<div class="craft-panel cb-panel">' +
          '<div class="craft-grid cb-grid" role="grid" aria-label="Crafting-Raster zum Bauen, 3 mal 3. Pfeiltasten wechseln den Slot, Enter legt das Item aus der Hand, Entfernen löscht.">' +
            [0, 1, 2].map(function (r) {
              return '<div class="craft-row" role="row">' + [0, 1, 2].map(function (c) {
                return '<div class="craft-slot cb-slot" role="gridcell" data-r="' + r + '" data-c="' + c + '" tabindex="' + (r === 0 && c === 0 ? 0 : -1) + '"></div>';
              }).join('') + '</div>';
            }).join('') +
          '</div>' +
          '<div class="craft-arrow" aria-hidden="true"></div>' +
          '<div class="craft-out"><div class="craft-slot out full" id="cb-out" role="img" aria-label="Ergebnis: ' + esc((count ? count + ' mal ' : '') + ((global.MGQ && MGQ.ans(q)) || q.answer || '')) + '">' +
            (global.MGIcon && MGIcon.forLabel && !MGIcon.__ok ? '' : imgP(resPath(), 'craft-big', 64, q.answer)) + (count ? '<span class="craft-count">' + count + '</span>' : '') + '</div></div>' +
        '</div>' +
        '<div class="cb-hand" aria-live="polite"></div>' +
        '<div class="cb-search"><div class="cb-search-in">' +
          '<div class="cb-results" id="cb-results" role="listbox" aria-label="Suchergebnisse" hidden></div>' +
          '<label class="cb-lbl" for="cb-q">Zutat suchen</label>' +
          '<input id="cb-q" class="cb-q" type="search" role="combobox" aria-expanded="false" aria-controls="cb-results" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="z. B. Eichenholzbretter (Taste /)">' +
        '</div></div>' +
        '<div class="cb-recent" aria-label="Zuletzt benutzt"></div>' +
        '<div class="cb-actions">' +
          '<button type="button" class="btn btn-primary" id="cb-check">Prüfen</button>' +
          '<button type="button" class="btn" id="cb-clear">Leeren</button>' +
          '<button type="button" class="btn" id="cb-hint">Tipp</button>' +
          '<button type="button" class="chip cb-eraser" id="cb-eraser" aria-pressed="false">Radiergummi</button>' +
        '</div>' +
        '<div class="cb-status" role="status" aria-live="polite"></div>' +
      '</div>';

    var $ = function (s) { return host.querySelector(s); };
    var gridEl = $('.cb-grid'), slots = [].slice.call(host.querySelectorAll('.cb-slot'));
    var handEl = $('.cb-hand'), qEl = $('#cb-q'), resEl = $('#cb-results'), recEl = $('.cb-recent'), statusEl = $('.cb-status');
    var searchBox = $('.cb-search'), searchIn = $('.cb-search-in'), wrapEl = $('.cb-wrap');
    var checkBtn = $('#cb-check'), eraserBtn = $('#cb-eraser');
    function slotAt(r, c) { return slots[r * 3 + c]; }
    function setStatus(t) { statusEl.textContent = t || ''; }

    // ── Darstellung ──
    function describe(r, c) {
      var k = grid[r][c], m = marks && marks[r] && marks[r][c];
      return 'Reihe ' + (r + 1) + ', Spalte ' + (c + 1) + ': ' + (k ? nameOf(k) : 'leer') + (m === 'ok' && k ? ', richtig' : m === 'bad' ? ', falsch' : '');
    }
    function paintSlot(r, c) {
      var el = slotAt(r, c), k = grid[r][c], m = marks && marks[r] && marks[r][c];
      el.classList.toggle('full', !!k);
      el.classList.toggle('mk-ok', m === 'ok');
      el.classList.toggle('mk-bad', m === 'bad');
      el.innerHTML = k ? img(k, 'craft-ico', 48) : '';
      el.setAttribute('aria-label', describe(r, c));
      el.title = k ? nameOf(k) : 'leer';
    }
    function paintAll() { for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) paintSlot(r, c); updateCheck(); }
    function filled() { var n = 0; grid.forEach(function (row) { row.forEach(function (k) { if (k) n++; }); }); return n; }
    function updateCheck() { checkBtn.disabled = busy || done || filled() === 0; }
    function pop(r, c) {
      if (reduced()) return;
      var el = slotAt(r, c); el.classList.remove('cb-pop'); void el.offsetWidth; el.classList.add('cb-pop');
      setTimeout(function () { el.classList.remove('cb-pop'); }, 220);
    }
    function renderHand() {
      if (eraser) handEl.innerHTML = '<span class="cb-hand-chip">Radiergummi aktiv: Slots antippen oder überstreichen</span>';
      else if (cursor) handEl.innerHTML = '<span class="cb-hand-chip">In der Hand: ' + img(cursor, 'cb-mini', 24) + '<b>' + esc(nameOf(cursor)) + '</b><button type="button" class="mg-close cb-drop" aria-label="Item aus der Hand legen"></button></span>';
      else handEl.innerHTML = '<span class="cb-hand-hint">Suche eine Zutat und streiche damit über das Raster.</span>';
      var d = handEl.querySelector('.cb-drop'); if (d) d.onclick = function () { setCursor(null); };
    }
    function renderRecent() {
      recEl.innerHTML = recent.map(function (k) {
        return '<button type="button" class="cb-rc' + (k === cursor ? ' on' : '') + '" data-k="' + esc(k) + '" aria-label="' + esc(nameOf(k)) + '" aria-pressed="' + (k === cursor) + '" title="' + esc(nameOf(k)) + '">' + img(k, 'cb-mini', 28) + '</button>';
      }).join('');
    }
    recEl.addEventListener('click', function (e) { var b = e.target.closest('.cb-rc'); if (b) setCursor(b.getAttribute('data-k')); });
    var H = global.MGHand || null;
    function setCursor(k) {
      cursor = k || null;
      if (H) H.hold(cursor ? BASE + iconOf(cursor) + '.png' : null);
      if (cursor) { eraser = false; eraserBtn.setAttribute('aria-pressed', 'false'); eraserBtn.classList.remove('on'); remember(cursor); }
      renderHand(); renderRecent();
    }
    function remember(k) {
      recent = [k].concat(recent.filter(function (x) { return x !== k; })).slice(0, 8);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (e) {}
    }
    function setEraser(on) {
      eraser = !!on; eraserBtn.setAttribute('aria-pressed', String(eraser)); eraserBtn.classList.toggle('on', eraser);
      if (eraser) cursor = null;
      renderHand(); renderRecent();
    }
    eraserBtn.onclick = function () { setEraser(!eraser); };

    function changed() { if (marks) { marks = null; slots.forEach(function (s) { s.classList.remove('mk-ok', 'mk-bad'); }); } setStatus(''); }
    function place(r, c, key) {
      if (done || busy) return false;
      if (grid[r][c] === key) return false;
      grid[r][c] = key; changed(); paintSlot(r, c); pop(r, c); vibrate(8); updateCheck(); if (H) H.place(slotAt(r, c)); return true;
    }
    function remove(r, c) {
      if (done || busy || !grid[r][c]) return false;
      grid[r][c] = null; changed(); paintSlot(r, c); pop(r, c); vibrate(8); updateCheck(); if (H) H.remove(slotAt(r, c)); return true;
    }

    // ── Suche ──
    var results = [], activeOpt = -1;
    function openResults(list) {
      results = list; activeOpt = list.length ? 0 : -1;
      resEl.hidden = !list.length && !qEl.value.trim();
      resEl.innerHTML = list.map(function (it, i) {
        return '<button type="button" role="option" class="cb-opt' + (i === 0 ? ' on' : '') + '" id="cb-o' + i + '" data-k="' + esc(it.key) + '" aria-selected="' + (i === 0) + '">' + img(it.key, 'cb-mini', 28) + '<span>' + esc(dispName(it)) + '</span></button>';
      }).join('') || (qEl.value.trim() ? '<div class="cb-none">Keine Zutat gefunden</div>' : '');
      resEl.hidden = !resEl.innerHTML;
      qEl.setAttribute('aria-expanded', String(!resEl.hidden));
      if (activeOpt >= 0) qEl.setAttribute('aria-activedescendant', 'cb-o0'); else qEl.removeAttribute('aria-activedescendant');
    }
    function closeResults() { resEl.hidden = true; qEl.setAttribute('aria-expanded', 'false'); qEl.removeAttribute('aria-activedescendant'); }
    function moveOpt(d) {
      if (!results.length) return;
      activeOpt = (activeOpt + d + results.length) % results.length;
      [].forEach.call(resEl.querySelectorAll('.cb-opt'), function (b, i) { b.classList.toggle('on', i === activeOpt); b.setAttribute('aria-selected', String(i === activeOpt)); });
      var o = resEl.querySelector('#cb-o' + activeOpt); if (o) { qEl.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); }
    }
    function choose(key) {
      setCursor(key); qEl.value = ''; closeResults();
      setStatus(nameOf(key) + ' ausgewählt');
      if (isTouch()) qEl.blur();   // Tastatur schliessen, damit das Raster frei ist
    }
    function isTouch() { return global.matchMedia && matchMedia('(pointer: coarse)').matches; }
    qEl.addEventListener('input', function () {
      var t = qEl.value.trim();
      if (!t) { openResults(recent.map(function (k) { return byKey[k] || { key: k, de: nameOf(k) }; })); return; }
      loadCatalog(function () { openResults(search(t)); });
    });
    qEl.addEventListener('focus', function () { loadCatalog(function () { if (!qEl.value.trim()) openResults(recent.map(function (k) { return byKey[k] || { key: k, de: nameOf(k) }; })); else openResults(search(qEl.value)); }); });
    qEl.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveOpt(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveOpt(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (activeOpt >= 0 && results[activeOpt]) choose(results[activeOpt].key); }
      else if (e.key === 'Escape') { e.stopPropagation(); if (qEl.value) { qEl.value = ''; } closeResults(); qEl.blur(); }
    });
    resEl.addEventListener('pointerdown', function (e) { e.preventDefault(); });   // Fokus bleibt im Feld, kein Tastatur-Flackern
    resEl.addEventListener('click', function (e) { var b = e.target.closest('.cb-opt'); if (b) choose(b.getAttribute('data-k')); });
    function onDocDown(e) { if (!searchBox.contains(e.target)) closeResults(); }
    document.addEventListener('pointerdown', onDocDown, true);

    // ── Bildschirmtastatur: Suchleiste ueber der Tastatur, Raster bleibt sichtbar (visualViewport) ──
    var vv = global.visualViewport, kbOn = false;
    function syncKb() {
      if (!vv || !host.isConnected) return;
      var kb = Math.max(0, global.innerHeight - vv.height - vv.offsetTop);
      var on = isTouch() && document.activeElement === qEl && kb > 80;
      if (on !== kbOn) {
        kbOn = on; wrapEl.classList.toggle('cb-kb', on);
        searchBox.style.minHeight = on ? searchIn.offsetHeight + 'px' : '';
        if (on) { var p = $('.cb-panel'); try { p.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) {} global.scrollBy(0, -8); }
      }
      searchIn.style.transform = on ? 'translateY(' + (-kb) + 'px)' : '';
      resEl.style.maxHeight = on ? Math.max(90, Math.round(vv.height * 0.3)) + 'px' : '';
    }
    if (vv) { vv.addEventListener('resize', syncKb); vv.addEventListener('scroll', syncKb); }
    qEl.addEventListener('focus', function () { setTimeout(syncKb, 250); });
    qEl.addEventListener('blur', function () { setTimeout(syncKb, 50); });

    // ── Pointer: Drag-Painting ──
    var P = null, ghost = null, ghostRaf = 0, gx = 0, gy = 0, longT = 0;
    function bounds() {
      var a = slotAt(0, 0).getBoundingClientRect(), b = slotAt(2, 2).getBoundingClientRect();
      return { l: a.left, t: a.top, r: b.right, b: b.bottom };
    }
    function cellAt(bd, x, y) {
      if (x < bd.l || x > bd.r || y < bd.t || y > bd.b) return null;
      var c = Math.min(2, Math.floor((x - bd.l) / ((bd.r - bd.l) / 3))), r = Math.min(2, Math.floor((y - bd.t) / ((bd.b - bd.t) / 3)));
      return [r, c];
    }
    function pathCells(bd, x0, y0, x1, y1) {
      var out = [], cw = (bd.r - bd.l) / 3, step = Math.max(4, cw / 3), dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
      for (var i = 1; i <= n; i++) {
        var cell = cellAt(bd, x0 + dx * i / n, y0 + dy * i / n);
        if (cell && (!out.length || out[out.length - 1][0] !== cell[0] || out[out.length - 1][1] !== cell[1])) out.push(cell);
      }
      return out;
    }
    function ensureGhost(touch) {
      if (H) return;   // die Skin-Hand traegt das Item, keine zweite Vorschau
      if (!ghost) { ghost = document.createElement('div'); ghost.className = 'cb-ghost'; document.body.appendChild(ghost); }
      var k = P.mode === 'move' ? P.moveKey : cursor;
      ghost.innerHTML = P.mode === 'erase' ? '<span class="cb-ghost-x">&times;</span>' : (k ? img(k, 'craft-ico', 40) : '');
      ghost.style.display = ghost.innerHTML ? '' : 'none';
      ghost.dataset.touch = touch ? '1' : '';
    }
    function moveGhost(x, y) {
      gx = x; gy = y;
      if (ghostRaf || !ghost) return;
      ghostRaf = requestAnimationFrame(function () {
        ghostRaf = 0; if (!ghost) return;
        var touch = ghost.dataset.touch === '1';
        ghost.style.transform = 'translate3d(' + (gx + (touch ? -20 : 14)) + 'px,' + (gy + (touch ? -72 : 14)) + 'px,0)';
      });
    }
    function dropGhost() { if (ghost) { ghost.remove(); ghost = null; } ghostRaf = 0; }
    function apply(cell) {
      var r = cell[0], c = cell[1], id = r * 3 + c;
      if (P.seen[id]) return; P.seen[id] = 1;
      if (P.mode === 'erase') remove(r, c);
      else if (P.mode === 'paint') { P.painted = true; place(r, c, cursor); }
    }
    function endPress() { clearTimeout(longT); longT = 0; }

    gridEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    gridEl.addEventListener('pointerdown', function (e) {
      if (done || busy) return;
      if (P) return;                                   // zweiter Finger / Handballen ignorieren
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      if (e.pointerType === 'touch' && e.width > 60 && e.height > 60) return;   // grosse Kontaktflaeche = Handballen
      var bd = bounds(), cell = cellAt(bd, e.clientX, e.clientY);
      if (!cell) return;
      e.preventDefault();
      try { gridEl.setPointerCapture(e.pointerId); } catch (err) {}
      var touch = e.pointerType !== 'mouse', k = grid[cell[0]][cell[1]];
      if (H) H.moveTo(e.clientX, e.clientY, touch);
      P = { id: e.pointerId, bd: bd, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, seen: {}, touch: touch, painted: false, origin: cell, moved: false, mode: 'paint', tapRemove: false, moveKey: null };
      setActive(cell[0], cell[1], false);
      if (e.button === 2 || eraser) P.mode = 'erase';
      else if (cursor) P.mode = 'paint';
      else if (k) { P.mode = 'move'; P.moveKey = k; }
      else P.mode = 'none';
      if (P.mode === 'erase') { apply(cell); ensureGhost(touch); moveGhost(e.clientX, e.clientY); }
      else if (P.mode === 'paint') {
        if (k === cursor) P.tapRemove = true;          // gleiches Item nochmal antippen = entfernen (bei Pointer-Up, falls nicht gewischt)
        else apply(cell);
        P.seen[cell[0] * 3 + cell[1]] = 1;
        ensureGhost(touch); moveGhost(e.clientX, e.clientY);
        if (touch && k) longT = setTimeout(function () { if (P && !P.moved) { P.mode = 'erase'; P.tapRemove = false; P.seen = {}; apply(P.origin); ensureGhost(true); moveGhost(P.x, P.y); } }, 450);
      } else if (P.mode === 'move') {
        longT = touch ? setTimeout(function () { if (P && !P.moved) { P.mode = 'erase'; P.seen = {}; apply(P.origin); ensureGhost(true); moveGhost(P.x, P.y); } }, 450) : 0;
      }
    });
    gridEl.addEventListener('pointermove', function (e) {
      if (!P || e.pointerId !== P.id) return;
      e.preventDefault();
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      var pts = evs && evs.length ? evs : [e];
      for (var i = 0; i < pts.length; i++) {
        var x = pts[i].clientX, y = pts[i].clientY;
        if (!P.moved && Math.hypot(x - P.sx, y - P.sy) > 8) { P.moved = true; endPress(); P.tapRemove = false; if (P.mode === 'move') ensureGhost(P.touch); }
        if (P.mode === 'paint' || P.mode === 'erase') pathCells(P.bd, P.x, P.y, x, y).forEach(apply);
        P.x = x; P.y = y;
      }
      if (P.mode === 'move' && P.moved) { ensureGhost(P.touch); }
      moveGhost(e.clientX, e.clientY);
      if (H) H.moveTo(e.clientX, e.clientY, P.touch);
    });
    function finishPointer(e, cancel) {
      if (!P || e.pointerId !== P.id) return;
      endPress();
      var p = P; P = null; dropGhost(); if (H) H.release();
      try { gridEl.releasePointerCapture(e.pointerId); } catch (err) {}
      if (cancel) return;
      var cell = cellAt(p.bd, e.clientX, e.clientY);
      if (p.mode === 'paint' && p.tapRemove && !p.moved && !p.painted) remove(p.origin[0], p.origin[1]);
      else if (p.mode === 'move') {
        if (!p.moved || !cell || (cell[0] === p.origin[0] && cell[1] === p.origin[1])) {
          if (!p.moved) { setCursor(p.moveKey); setStatus(nameOf(p.moveKey) + ' aufgenommen'); }   // Tippen auf gefuellten Slot ohne Cursor: Item in die Hand
        } else { var dst = grid[cell[0]][cell[1]]; place(cell[0], cell[1], p.moveKey); if (dst) place(p.origin[0], p.origin[1], dst); else remove(p.origin[0], p.origin[1]); }
      }
    }
    gridEl.addEventListener('pointerup', function (e) { finishPointer(e, false); });
    gridEl.addEventListener('pointercancel', function (e) { finishPointer(e, true); });
    gridEl.addEventListener('lostpointercapture', function (e) { if (P && e.pointerId === P.id) finishPointer(e, true); });
    gridEl.addEventListener('wheel', function (e) {
      if (!cursor || recent.length < 2 || done) return;
      e.preventDefault();
      var i = recent.indexOf(cursor), n = recent.length;
      var next = recent[(i + (e.deltaY > 0 ? 1 : -1) + n) % n]; recent = recent.slice(); setCursorNoReorder(next);
    }, { passive: false });
    function setCursorNoReorder(k) { cursor = k; eraser = false; eraserBtn.setAttribute('aria-pressed', 'false'); eraserBtn.classList.remove('on'); renderHand(); renderRecent(); }

    // ── Tastatur ──
    function setActive(r, c, focus) {
      active = [r, c];
      slots.forEach(function (s, i) { s.tabIndex = (i === r * 3 + c) ? 0 : -1; });
      if (focus) slotAt(r, c).focus();
    }
    gridEl.addEventListener('keydown', function (e) {
      var t = e.target.closest && e.target.closest('.cb-slot'); if (!t) return;
      var r = +t.dataset.r, c = +t.dataset.c, k = e.key;
      if (k === 'ArrowRight') { setActive(r, Math.min(2, c + 1), true); e.preventDefault(); }
      else if (k === 'ArrowLeft') { setActive(r, Math.max(0, c - 1), true); e.preventDefault(); }
      else if (k === 'ArrowDown') { setActive(Math.min(2, r + 1), c, true); e.preventDefault(); }
      else if (k === 'ArrowUp') { setActive(Math.max(0, r - 1), c, true); e.preventDefault(); }
      else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        if (eraser) remove(r, c);
        else if (cursor) { if (grid[r][c] === cursor) remove(r, c); else place(r, c, cursor); }
        else if (grid[r][c]) { setCursor(grid[r][c]); setStatus(nameOf(grid[r][c]) + ' aufgenommen'); }
        else { setStatus('Keine Zutat in der Hand. Mit der Taste / suchen.'); }
      }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); remove(r, c); }
    });
    gridEl.addEventListener('focusin', function (e) { var t = e.target.closest && e.target.closest('.cb-slot'); if (t) active = [+t.dataset.r, +t.dataset.c]; });
    function onKey(e) {
      if (!host.isConnected || done) return;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) { e.preventDefault(); qEl.focus({ preventScroll: true }); }
    }
    document.addEventListener('keydown', onKey);

    // ── Aktionen ──
    checkBtn.onclick = function () { if (!busy && !done && filled() && opts.onCheck) opts.onCheck(grid.map(function (r) { return r.slice(); })); };
    $('#cb-clear').onclick = function () { if (done || busy) return; grid = [[null, null, null], [null, null, null], [null, null, null]]; changed(); paintAll(); setStatus('Raster geleert'); };
    $('#cb-hint').onclick = function () { if (!done && !busy && opts.onHint) opts.onHint(); };

    paintAll(); renderHand(); renderRecent();
    if (global.MGIcon && MGIcon.ready) MGIcon.ready.then(function () { MGIcon.__ok = true; fillOut(); });
    function fillOut() { var n = $('#cb-out'); if (n) n.innerHTML = imgP(resPath(), 'craft-big', 64, q.answer) + (count ? '<span class="craft-count">' + count + '</span>' : ''); }
    loadCatalog(function () { paintAll(); renderHand(); renderRecent(); if (!global.MGIcon || MGIcon.__ok) fillOut(); });

    // ── Controller ──
    var ctl = {
      getGrid: function () { return grid.map(function (r) { return r.slice(); }); },
      setBusy: function (b) { busy = !!b; updateCheck(); },
      setMarks: function (d) {
        if (!d || !d.cells) return;
        marks = d.cells; paintAll();
        setStatus(d.ok ? 'Richtig!' : d.correct + ' von ' + d.total + ' Slots richtig');
      },
      clearMarks: function () { changed(); },
      applyHint: function (h) {
        if (!h || done) return false;
        place(h.r, h.c, h.key); setActive(h.r, h.c, false);
        slotAt(h.r, h.c).classList.add('cb-hinted'); setTimeout(function () { slotAt(h.r, h.c).classList.remove('cb-hinted'); }, 1800);
        setStatus('Tipp: ' + nameOf(h.key) + ' in Reihe ' + (h.r + 1) + ', Spalte ' + (h.c + 1));
        return true;
      },
      finish: function (won, qq) {
        done = true; busy = false; updateCheck(); closeResults(); dropGhost();
        if (H) H.reveal($('#cb-out'));
        [].forEach.call(host.querySelectorAll('button, input'), function (b) { b.disabled = true; });
        var sol = (qq || q).solution;
        if (won) { setStatus('Richtig gebaut!'); return; }
        if (sol) {
          grid = [[null, null, null], [null, null, null], [null, null, null]]; marks = null;
          if (sol.grid) for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) { var cell = sol.grid[r] && sol.grid[r][c]; grid[r][c] = cell && cell.length ? cell[0] : null; }
          else if (sol.items) sol.items.forEach(function (cell, i) { if (i < 9) grid[Math.floor(i / 3)][i % 3] = cell[0]; });
          paintAll(); slots.forEach(function (s) { s.classList.add('cb-solution'); });
          setStatus('So wird es gebaut' + (sol.shapeless ? ' (formlos: Reihenfolge egal)' : '') + '.');
        }
      },
      destroy: function () {
        document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDocDown, true);
        if (vv) { vv.removeEventListener('resize', syncKb); vv.removeEventListener('scroll', syncKb); }
        dropGhost(); host.innerHTML = ''; host.classList.remove('craft-host');
      }
    };
    return ctl;
  }

  function imgError(el) { var a = el.getAttribute('data-alt'); if (a) { el.setAttribute('data-alt', ''); el.src = BASE + a + '.png'; } else { el.onerror = null; el.src = BASE + 'item/barrier.png'; } }
  global.MGCraftBuild = { _ie: imgError, mount: mount, search: search, loadCatalog: loadCatalog, _fold: fold };
})(window);
