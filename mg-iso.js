/* MineGuess isometrische Item-Icons (Stufen, Treppen, Zaeune, Zauntore, Mauern, Falltueren, Druckplatten, Knoepfe, Teppiche und Bloecke mit Seitenansicht).
   Aus den vorhandenen offiziellen Texturen (assets/mc/block/*.png) mit Seitenschattierung per Canvas 2D gerendert, einmal je Name, als dataURL gecacht
   (Speicher + localStorage mg_iso_v1). Rendern nur bei Bedarf (kein Frame-Loop). Fallback bei jedem Fehler: das bisherige flache Icon.
   Einbindung: <img data-iso-label="Quarzstufe"> oder MGIso.attach(img, 'Quarzstufe'). Modelltyp aus dem deutschen Namen (Muster) bzw. aus
   assets/mc/models.json ({ "Name": { "m": "slab_bottom", "t": "block/x" } }), falls vorhanden.
   Textur-Zuordnung: Pfad des flachen Icons aus MGIcon.forLabel(name). Vorhandene Texturen werden nie veraendert. */
(function (global) {
  'use strict';
  var BASE = 'assets/mc/', SIZE = 96, KEY = 'mg_iso_v1', cache = {}, pending = {}, imgs = {}, meta = null, metaP = null;
  try { var st = JSON.parse(localStorage.getItem(KEY) || '{}'); if (st && typeof st === 'object') cache = st; } catch (e) {}
  function persist() { try { var s = JSON.stringify(cache); if (s.length < 450000) localStorage.setItem(KEY, s); } catch (e) {} }

  var blocks = null, catIcon = null, catKey = {};
  function loadImg(path) {
    if (imgs[path]) return imgs[path];
    if (blocks && path.indexOf('block/') === 0 && !blocks[path.slice(6)]) return (imgs[path] = Promise.resolve(null));   // gibt es nicht: keine Anfrage
    imgs[path] = new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = BASE + path + '.png'; });
    return imgs[path];
  }
  function loadMeta() {
    if (metaP) return metaP;
    var get = function (f) { return fetch(BASE + f).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    metaP = Promise.all([get('models.json'), get('block-list.json'), get('craft-items.json')]).then(function (r) {
      meta = r[0] || {};
      if (Array.isArray(r[1])) { blocks = {}; r[1].forEach(function (n) { blocks[n] = 1; }); }
      catIcon = {}; if (Array.isArray(r[2])) r[2].forEach(function (it) { if (it && it.de && it.key) catKey[it.de] = it.key; if (it && it.de && it.icon && /^block[/]/.test(it.icon)) catIcon[it.de] = String(it.icon).replace(/[.]png$/, ''); });
      return meta;
    });
    return metaP;
  }
  // ── Modelle: Boxen in 0..16 (x Osten, y oben, z Sueden). Kein Modell = flaches Icon (ausser Block-Wuerfel). ──
  var M = {
    slab_bottom: [[0, 0, 0, 16, 8, 16]],
    stairs: [[0, 0, 0, 16, 8, 16], [0, 8, 0, 8, 16, 16]],
    fence: [[6, 0, 6, 10, 16, 10], [0, 12, 7, 6, 15, 9], [10, 12, 7, 16, 15, 9], [0, 6, 7, 6, 9, 9], [10, 6, 7, 16, 9, 9]],
    fence_gate: [[0, 5, 7, 2, 16, 9], [14, 5, 7, 16, 16, 9], [2, 6, 7, 6, 9, 9], [10, 6, 7, 14, 9, 9], [2, 12, 7, 6, 15, 9], [10, 12, 7, 14, 15, 9], [6, 6, 7, 10, 15, 9]],
    wall: [[4, 0, 4, 12, 16, 12], [5, 0, 0, 11, 14, 4], [5, 0, 12, 11, 14, 16], [0, 0, 5, 4, 14, 11], [12, 0, 5, 16, 14, 11]],
    trapdoor: [[0, 0, 0, 16, 3, 16]],
    pressure_plate: [[1, 0, 1, 15, 1, 15]],
    button: [[5, 0, 6, 11, 4, 10]],
    carpet: [[0, 0, 0, 16, 1, 16]],
    cube: [[0, 0, 0, 16, 16, 16]],
    anvil: [[2, 0, 2, 14, 4, 14], [4, 4, 3, 12, 5, 13], [6, 5, 4, 10, 10, 12], [3, 10, 0, 13, 16, 16]]
  };
  var PATTERNS = [[/zauntor$/i, 'fence_gate'], [/zaun$/i, 'fence'], [/stufe$/i, 'slab_bottom'], [/treppe$/i, 'stairs'], [/mauer$/i, 'wall'], [/falltür$/i, 'trapdoor'], [/druckplatte$/i, 'pressure_plate'], [/knopf$/i, 'button'], [/teppich$/i, 'carpet'], [/amboss$/i, 'anvil']];
  // assets/mc/models.json: { items: { <key>: { m, side, top, bottom } } }, Schluessel ueber den Katalog (de -> key)
  function entry(label) { var k = catKey[label]; return (k && meta && meta.items && meta.items[k]) || null; }
  function tp(p) { p = String(p || '').replace(/[.]png$/, ''); return /(^|[/])null$/.test(p) ? '' : p; }
  function modelOf(label) {
    var e = entry(label); if (e && e.m && !FLAT.test(label)) return e.m === 'slab' ? 'slab_bottom' : e.m;
    if (meta && meta[label] && meta[label].m) return meta[label].m;
    for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i][0].test(label)) return PATTERNS[i][1];
    return 'cube';
  }
  var EXTRA = { 'Amboss': 'block/anvil', 'Bruchsteintreppe': 'block/cobblestone', 'Bruchsteinstufe': 'block/cobblestone', 'Bruchsteinmauer': 'block/cobblestone' };
  // Im Spiel flache Sprites: nie 3D (Tueren, Schilder, Boote, Floesse, Laternen, Ketten, Kerzen, Fackeln, Scheiben, Truhe)
  var FLAT = /(^|[^l])tür$|schild$|boot$|floß$|laterne$|kette$|kerze$|fackel$|scheibe$|^truhe$/i;
  function flatPath(label) {
    if (FLAT.test(label)) return '';
    if (meta && meta[label] && meta[label].t) return meta[label].t;
    if (catIcon && catIcon[label]) return catIcon[label];
    var X = EXTRA[label]; if (X) return X;
    var p = global.MGIcon && MGIcon.forLabel ? MGIcon.forLabel(label, '') : '';
    return (p && p.indexOf('block/') === 0) ? p : '';
  }

  // ── Rendering ──
  function render(boxes, tex, canvas) {
    // Projektion: X = (x - z) * a, Y = (x + z) * b - y * c (k = Skalierung)
    function bbox(k) {
      var a = 0.866 * k, b = 0.5 * k, c = k, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      boxes.forEach(function (bx) { [[bx[0], bx[1], bx[2]], [bx[3], bx[1], bx[2]], [bx[0], bx[1], bx[5]], [bx[3], bx[1], bx[5]], [bx[0], bx[4], bx[2]], [bx[3], bx[4], bx[2]], [bx[0], bx[4], bx[5]], [bx[3], bx[4], bx[5]]].forEach(function (p) { var X = (p[0] - p[2]) * a, Y = (p[0] + p[2]) * b - p[1] * c; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }); });
      return { x0: x0, x1: x1, y0: y0, y1: y1 };
    }
    var bb = bbox(1), k = (SIZE * 0.94) / Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0), a = 0.866 * k, b = 0.5 * k, c = k;
    var ox = SIZE / 2 - (bb.x0 + bb.x1) / 2 * k, oy = SIZE / 2 - (bb.y0 + bb.y1) / 2 * k;
    var ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, SIZE, SIZE);
    var order = boxes.slice().sort(function (p, q) { return ((p[0] + p[3]) / 2 + (p[2] + p[5]) / 2 + (p[1] + p[4]) * 0.01) - ((q[0] + q[3]) / 2 + (q[2] + q[5]) / 2 + (q[1] + q[4]) * 0.01); });
    order.forEach(function (bx) {
      var x0 = bx[0], y0 = bx[1], z0 = bx[2], x1 = bx[3], y1 = bx[4], z1 = bx[5];
      function face(img, m, su, sv, sw, sh, shade) {
        if (!img || sw <= 0 || sh <= 0) return;
        ctx.save(); ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        ctx.drawImage(img, su, sv, sw, sh, su, sv, sw, sh);
        if (shade) { ctx.fillStyle = 'rgba(0,0,0,' + shade + ')'; ctx.fillRect(su, sv, sw, sh); }
        ctx.restore();
      }
      // Ost (rechts, dunkler), Sued (links), Oben
      face(tex.right, [a, -b, 0, c, ox + a * (x1 - 16), oy + b * (x1 + 16) - 16 * c], 16 - z1, 16 - y1, z1 - z0, y1 - y0, 0.4);
      face(tex.left, [a, b, 0, c, ox - a * z1, oy + b * z1 - 16 * c], x0, 16 - y1, x1 - x0, y1 - y0, 0.18);
      face(tex.top, [a, b, -a, b, ox, oy - y1 * c], x0, z0, x1 - x0, z1 - z0, 0);
    });
  }

  function build(label) {
    return Promise.all([loadMeta(), (global.MGIcon && MGIcon.ready) ? MGIcon.ready : Promise.resolve()]).then(function () {
      var e = entry(label), m = modelOf(label), T = flatPath(label); if (!T) return null;
      if (e && !FLAT.test(label) && !(m === 'cube' && tp(e.top) === tp(e.side))) {
        var sd = tp(e.side) || T, tpP = tp(e.top) || sd;
        return Promise.all([loadImg(sd), loadImg(tpP)]).then(function (q) { if (!q[0]) return null; return { boxes: M[m] || [[0, 0, 0, 16, 16, 16]], tex: { top: q[1] || q[0], left: q[0], right: q[0] } }; });
      }
      var base = T.replace(/_(side|front|top|bottom)$/, '');
      var topP = m === 'anvil' ? 'block/anvil_top' : T.replace(/_(side|front|bottom)$/, '_top');
      if (m !== 'cube') {
        return Promise.all([loadImg(T), loadImg(topP)]).then(function (r) { if (!r[0]) return null; return { boxes: M[m], tex: { top: r[1] || r[0], left: r[0], right: r[0] } }; });
      }
      // Wuerfel nur, wenn es eine eigene Oberseite oder Vorderseite gibt (sonst bleibt das flache Icon)
      var cand = [loadImg(T), loadImg(base + '_top'), loadImg(base + '_front'), loadImg(base + '_side'), loadImg(base)];
      return Promise.all(cand).then(function (r) {
        var self = r[0]; if (!self) return null;
        var top = (/_top$/.test(T) ? self : r[1]), front = /_front$/.test(T) ? self : r[2], side = /_side$/.test(T) ? self : (r[3] || r[4]);
        if (!top && !front) return null;
        top = top || side || self; side = side || front || self; front = front || side;
        return { boxes: [[0, 0, 0, 16, 16, 16]], tex: { top: top, left: front, right: side } };
      });
    });
  }
  function url(label) {
    label = String(label || '').trim(); if (!label) return Promise.resolve(null);
    if (cache.hasOwnProperty(label)) return Promise.resolve(cache[label] || null);
    if (pending[label]) return pending[label];
    pending[label] = build(label).then(function (def) {
      if (!def) { cache[label] = ''; return null; }
      var cv = document.createElement('canvas'); cv.width = cv.height = SIZE; render(def.boxes, def.tex, cv);
      var u = cv.toDataURL('image/png'); cache[label] = u; persist(); return u;
    }).catch(function () { return null; });
    return pending[label];
  }
  function apply(img) {
    var label = img.getAttribute('data-iso-label'); if (!label || img.__isoDone === label) return;
    img.__isoDone = label;
    url(label).then(function (u) { if (u && img.getAttribute('data-iso-label') === label) { img.src = u; img.style.imageRendering = 'pixelated'; } });
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 1) { if (root.tagName === 'IMG' && root.hasAttribute('data-iso-label')) apply(root); if (root.querySelectorAll) [].forEach.call(root.querySelectorAll('img[data-iso-label]'), apply); }
  }
  var obs = new MutationObserver(function (muts) { muts.forEach(function (m) { if (m.type === 'attributes') scan(m.target); else [].forEach.call(m.addedNodes, scan); }); });
  function start() { obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-iso-label'] }); scan(document.documentElement); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  global.MGIso = { url: url, modelOf: modelOf, attach: function (img, label) { img.setAttribute('data-iso-label', label); img.__isoDone = null; apply(img); }, _render: render };
})(window);
