/* MineGuess Oberflaechen-Uebersetzung DE/EN (Fragen und Antworten bleiben vorerst Deutsch).
   - Sprache: localStorage mg_lang ('de'|'en'), Standard nach Browsersprache; setzt <html lang>.
   - Deutsch ist die Quellsprache: Texte (Text-Knoten und aria-label/title/placeholder/alt) werden live ersetzt, auch wenn Module sie spaeter einfuegen.
   - Woerterbuch i18n-en.json: { "Deutscher Text": "English text" }. Zahlen werden als {n} normalisiert ("Frage {n}"),
     freie Teile als {} (Wert: {1}, {2}), z. B. "{} hat gewonnen": "{1} won". Unbekannte Texte bleiben Deutsch.
   - Sprache wechseln: MGI18n.set('en') speichert und laedt die Seite neu. Entwicklung: localStorage mg_i18n_debug=1 sammelt fehlende Texte in window.__i18nMiss. */
(function (global) {
  'use strict';
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  var saved = ls('mg_lang'), lang = (saved === 'en' || saved === 'de') ? saved : (/^en/i.test((navigator.language || '')) ? 'en' : 'de');
  document.documentElement.setAttribute('lang', lang);
  var api = { lang: lang, set: function (l) { ls('mg_lang', l === 'en' ? 'en' : 'de'); location.reload(); }, t: function (s) { return s; } };
  global.MGI18n = api;
  var debug = ls('mg_i18n_debug') === '1', miss = global.__i18nMiss = {};

  // Hinweis auf rein deutschen Seiten (Datenschutz, Impressum)
  function germanOnlyNote() {
    if (lang !== 'en' || !/(datenschutz|impressum)/i.test(location.pathname)) return;
    document.addEventListener('DOMContentLoaded', function () {
      var n = document.createElement('p'); n.className = 'mg-i18n-note'; n.setAttribute('role', 'note'); n.setAttribute('lang', 'en');
      n.textContent = 'This page is only available in German.';
      document.body.insertBefore(n, document.body.firstChild);
    });
  }
  germanOnlyNote();
  if (lang !== 'en') return;

  var dict = null, exact = {}, tmpl = [];
  var SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE|NOSCRIPT|OPTION)$/;
  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  var NUM = /\d+(?:[.,]\d+)*/g;

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function build(d) {
    dict = d || {};
    Object.keys(dict).forEach(function (k) {
      if (k.indexOf('{}') >= 0) {
        var parts = k.split('{}'), re = '^' + parts.map(function (p) { return esc(p).replace(/\\\{n\\\}/g, '(\\d+(?:[.,]\\d+)*)'); }).join('(.+?)') + '$';
        tmpl.push({ re: new RegExp(re), out: dict[k] });
      } else exact[k] = dict[k];
    });
    tmpl.sort(function (a, b) { return b.re.source.length - a.re.source.length; });
  }
  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function lookup(core) {
    if (exact.hasOwnProperty(core)) return exact[core];
    var nums = core.match(NUM);
    if (nums) {
      var k = core.replace(NUM, '{n}');
      if (exact.hasOwnProperty(k)) { var i = 0; return exact[k].replace(/\{n\}/g, function () { return nums[i++] || ''; }); }
    }
    for (var t = 0; t < tmpl.length; t++) {
      var m = tmpl[t].re.exec(core);
      if (m) return tmpl[t].out.replace(/\{(\d+)\}/g, function (_, n) { return m[+n] == null ? '' : m[+n]; });
    }
    return null;
  }
  function tr(s) {
    if (!s || !/[A-Za-zÄÖÜäöüß]/.test(s)) return null;
    var lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = norm(s);
    if (!core) return null;
    var o = lookup(core);
    if (o == null) { if (debug && core.length > 2) miss[core] = 1; return null; }
    return lead + o + tail;
  }
  var done = new WeakMap();
  function doText(n) {
    var p = n.parentNode; if (!p || (p.nodeType === 1 && (SKIP.test(p.nodeName) || p.closest && p.closest('[translate="no"],.notranslate')))) return;
    var cur = n.nodeValue, rec = done.get(n); if (rec && rec.out === cur) return;
    var out = tr(cur); if (out != null && out !== cur) { done.set(n, { src: cur, out: out }); n.nodeValue = out; }
  }
  function doAttrs(el) {
    if (!el.getAttribute) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute(a); if (!v) continue;
      var key = '__mgi_' + a; if (el[key] === v) continue;
      var out = tr(v); if (out != null && out !== v) { el[key] = out; el.setAttribute(a, out); }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || SKIP.test(root.nodeName)) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    var n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else if (!SKIP.test(n.nodeName)) doAttrs(n); }
  }
  var pending = [], timer = 0;
  function flush() { timer = 0; var q = pending; pending = []; for (var i = 0; i < q.length; i++) { var r = q[i]; if (r.t === 'text') doText(r.n); else if (r.t === 'attr') doAttrs(r.n); else walk(r.n); } }
  function queue(r) { pending.push(r); if (!timer) timer = requestAnimationFrame(flush); }
  var obs = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'childList') { for (var j = 0; j < m.addedNodes.length; j++) queue({ t: 'node', n: m.addedNodes[j] }); }
      else if (m.type === 'characterData') queue({ t: 'text', n: m.target });
      else if (m.type === 'attributes') queue({ t: 'attr', n: m.target });
    }
  });
  function start() { obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS }); }
  start();
  api.t = function (s) { var o = tr(s); return o == null ? s : o; };
  fetch('i18n-en.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (d) {
    build(d); walk(document.documentElement); document.addEventListener('DOMContentLoaded', function () { walk(document.documentElement); });
    try { global.dispatchEvent(new Event('mg-i18n-ready')); } catch (e) {}
  });
  // Entwicklung: fehlende Texte nach kurzer Zeit auflisten
  if (debug) global.__i18nDump = function () { return Object.keys(miss); };
})(window);
