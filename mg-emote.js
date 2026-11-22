/* MineGuess Emotes: feste Liste (emotes.json, 24 Emotes auf 3 Seiten), Posen als Keyframe-Funktionen fuer das Rig in mg-scene.js,
   Emote-Rad (8 Segmente je Seite) und Anbindung. Kein Freitext: nur IDs aus emotes.json. Nichts wird gespeichert.
   API: MGEmote.init({ getScene, selfId, send, enabled, solo }) · MGEmote.receive(pid, id) · MGEmote.open()/close() · MGEmote.sample(id, t) · MGEmote.svg(id)
   Posen: Radiant; hop/lift in Modell-Pixeln (siehe docs/team/EMOTES.md). Bewegungsreduktion: kein Animieren, 2 s Symbol-Popup (eigenes SVG). */
(function (global) {
  'use strict';
  var TAU = Math.PI * 2;
  function sn(f, t) { return Math.sin(TAU * f * t); }
  function ease(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function lang() { return (global.MGI18n && MGI18n.lang === 'en') ? 'en' : 'de'; }
  function reduced() { return !!(global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || ls('mg_reduce_motion') === '1' || document.documentElement.getAttribute('data-motion') === 'reduce'; }

  // ── Posen: t = Sekunden seit Start; Rueckgabe = Zielwerte der genannten Felder (Rest bleibt Grundpose) ──
  var POSES = {
    wave: function (t) { return { armRx: -2.55, armRz: 1.0 + 0.3 * sn(2.5, t), headY: -0.15, headZ: -0.1 }; },
    cheer: function (t) { return { armRx: -2.9 + 0.18 * sn(1.4, t), armLx: -2.9 - 0.18 * sn(1.4, t), armRz: 0.25, armLz: -0.25, hop: Math.abs(sn(0.9, t)) * 1.6, headX: -0.15 }; },
    clap: function (t) { return { armRx: -1.45, armLx: -1.45, armRz: -0.30 + 0.22 * sn(4, t), armLz: 0.30 - 0.22 * sn(4, t), headX: 0.1 }; },
    bow: function () { return { bend: 0.9, headX: 0.3, armRx: 0.2, armLx: 0.2 }; },
    thumbs: function (t) { return { armRx: -1.2, armRz: -0.10, armLx: 0.05, headX: -0.05, hop: 0.4 * Math.abs(sn(1.2, t)) }; },
    laugh: function (t) { return { headX: -0.2 + 0.12 * sn(6, t), bend: -0.15 + 0.08 * sn(6, t), armRx: -0.6, armLx: -0.6, armRz: 0.2, armLz: -0.2, hop: 0.5 + 0.5 * sn(4, t) }; },
    dance: function (t) { return { tilt: 0.18 * sn(2, t), hop: Math.abs(sn(2, t)) * 1.2, armRx: -2.2 + 0.5 * sn(2, t), armLx: -2.2 - 0.5 * sn(2, t), headZ: 0.2 * sn(2, t), legRx: 0.45 * sn(2, t), legLx: -0.45 * sn(2, t) }; },
    heart: function (t) { return { armRx: -2.5, armLx: -2.5, armRz: -0.45, armLz: 0.45, headX: -0.1, hop: 0.3 * sn(2, t) }; },
    think: function (t) { return { armRx: -1.62 + 0.03 * sn(1, t), armRz: -0.25, headZ: 0.2, headX: 0.22, headY: 0.15, armLx: -0.5 }; },
    no: function (t) { return { headY: 0.55 * sn(1.9, t), armRx: 0.05, armLx: 0.05 }; },
    yes: function (t) { return { headX: 0.35 + 0.3 * sn(1.9, t), bend: 0.05 }; },
    shrug: function (t) { return { armRx: -0.35, armLx: -0.35, armRz: 0.85, armLz: -0.85, hop: 0.8 * ease(t / 0.3), headZ: 0.18 }; },
    wow: function (t) { return { bend: -0.2, headX: -0.3, armRx: -0.9, armLx: -0.9, armRz: 0.7, armLz: -0.7, hop: t < 0.5 ? 1.0 * Math.sin(Math.PI * t / 0.5) : 0 }; },
    oops: function (t) { return { armRx: -2.6, armLx: -2.6, armRz: -0.35, armLz: 0.35, headX: 0.25, hop: -0.3, tilt: 0.04 * sn(8, t) }; },
    sad: function (t) { return { headX: 0.5, bend: 0.25 + 0.03 * sn(0.8, t), armRx: 0.05, armLx: 0.05, hop: -0.4 }; },
    sleep: function (t) { return { headX: 0.45, headZ: 0.35, bend: 0.2 + 0.05 * sn(0.5, t), armRx: 0, armLx: 0, hop: -0.5 }; },
    flex: function (t) { return { armRx: -1.2, armRz: 0.9, armLx: -1.2, armLz: -0.9, headX: -0.1, hop: 0.4 * Math.max(0, sn(1.2, t)) }; },
    salute: function () { return { armRx: -2.3, armRz: -0.3, headX: 0, bend: -0.05 }; },
    hop: function (t) { return { hop: Math.abs(sn(1.5, t)) * 2.0, armRx: -0.8 + 0.4 * sn(3, t), armLx: -0.8 - 0.4 * sn(3, t), legRx: 0.2, legLx: 0.2 }; },
    spin: function (t) { return { yaw: TAU * ease(t / 1.0), armRx: -1.2, armLx: -1.2, armRz: 0.7, armLz: -0.7 }; },
    robot: function (t) { var k = Math.floor(t / 0.25) % 2; return { armRx: k ? -1.57 : 0, armLx: k ? 0 : -1.57, headY: k ? 0.5 : -0.5, bend: 0 }; },
    gg: function (t) { return { armRx: -1.5, armRz: -0.2, armLx: 0.05, headX: 0.15, hop: 0.3 * Math.abs(sn(1, t)) }; },
    point: function () { return { armRx: -1.57, armRz: 0.05, headY: 0.2, armLx: 0.05 }; },
    hand: function (t) { return { armRx: -3.1, armRz: 0.08 + 0.05 * sn(1, t) }; }
  };
  var ABS = { spin: { yaw: 1 } };   // Felder ohne Ein-/Ausblend-Mischung
  var DUR = { wave: 2000, cheer: 2000, clap: 2000, bow: 2000, thumbs: 1800, laugh: 2000, dance: 3000, heart: 2000, think: 2500, no: 1600, yes: 1600, shrug: 1800, wow: 1600, oops: 2000, sad: 2500, sleep: 3000, flex: 2000, salute: 1800, hop: 1600, spin: 1600, robot: 2500, gg: 2000, point: 1600, hand: 5000 };

  // ── Symbole (eigene SVG, 24x24, currentColor) ──
  var G = {
    wave: '<path d="M7 14V8a1.4 1.4 0 012.8 0v4m0-5.5a1.4 1.4 0 012.8 0V12m0-4.5a1.4 1.4 0 012.8 0V13m0-3a1.4 1.4 0 012.8 0v5c0 3.5-2.6 6-6 6-3 0-4.6-1.6-5.7-4L5 13.5a1.4 1.4 0 012.2-1.6L9 14"/><path d="M3 5c.8-1.4 2-2.2 3.4-2.5M2 9.5c-.4-1.2-.3-2.4.1-3.4"/>',
    cheer: '<path d="M9 21v-6l-2-3V5M15 21v-6l2-3V5"/><circle cx="12" cy="9" r="2.2"/><path d="M4 3l.7 1.5L6 5 4.7 5.6 4 7 3.3 5.6 2 5l1.3-.5zM20 3l.7 1.5L22 5l-1.3.6L20 7l-.7-1.4L18 5l1.3-.5z"/>',
    clap: '<path d="M6 8l4 4M18 8l-4 4M7 13l3 3 2-2 2 2 3-3"/><path d="M12 3v3M8 4l1 2M16 4l-1 2"/>',
    bow: '<circle cx="9" cy="6" r="2.2"/><path d="M9 9l5 5v7M9 9l-3 6 4 3"/><path d="M18 6c1.3 1 2 2.4 2 4"/>',
    thumbs: '<path d="M8 11v9H4v-9zM8 12l4-8c1.4 0 2.4 1 2.2 2.6L13.6 10H19a2 2 0 012 2.2l-1 6A2 2 0 0118 20H8"/>',
    laugh: '<circle cx="12" cy="12" r="9"/><path d="M8 10.5l1.6-1M16 10.5l-1.6-1M7.5 13.5h9c0 3-2 5-4.5 5s-4.5-2-4.5-5z"/>',
    dance: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    heart: '<path d="M12 20s-8-4.7-8-10.2A4.3 4.3 0 0112 7a4.3 4.3 0 018 2.8C20 15.3 12 20 12 20z"/>',
    think: '<circle cx="12" cy="9" r="6"/><circle cx="8" cy="18" r="1.6"/><circle cx="5" cy="21" r="1"/><path d="M9.5 9h.01M12 9h.01M14.5 9h.01"/>',
    no: '<circle cx="12" cy="12" r="5"/><path d="M3 9l-1.5 3L3 15M21 9l1.5 3L21 15"/>',
    yes: '<circle cx="12" cy="12" r="5"/><path d="M9 2.5L12 1l3 1.5M9 21.5L12 23l3-1.5"/>',
    shrug: '<circle cx="12" cy="7" r="3"/><path d="M12 10v6M12 12L5 10M12 12l7-2M10 21l2-5 2 5"/><path d="M12 1.5v.01"/>',
    wow: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="16" rx="2" ry="2.6"/><path d="M8.5 9.5h.01M15.5 9.5h.01"/>',
    oops: '<circle cx="11" cy="13" r="8"/><path d="M8 12h.01M14 12h.01M8.5 17c1.5-1.4 4.5-1.4 6 0"/><path d="M19.5 4c1.3 1.7 1.8 2.7 1.8 3.6a1.8 1.8 0 01-3.6 0c0-.9.5-1.9 1.8-3.6z"/>',
    sad: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8.5 17c1.5-1.8 5.5-1.8 7 0"/><path d="M8.8 12.2c-.8 1.2-1 1.8-1 2.2a1 1 0 002 0c0-.4-.2-1-1-2.2z"/>',
    sleep: '<path d="M5 5h6l-6 7h6M14 12h5l-5 6h5"/><path d="M15 3h3l-3 3.5h3"/>',
    flex: '<path d="M4 17c2-1 3-3 3-6l3-3 3 2 2-2c3 0 6 2 6 6 0 3-3 5-6 5H8c-2 0-3-.5-4-2z"/>',
    salute: '<circle cx="11" cy="9" r="3.5"/><path d="M11 12.5V21M11 15l-5 1M16 4l-3 3.5M17.5 5.5L21 4"/>',
    hop: '<path d="M12 21V8M7 12l5-5 5 5"/><path d="M6 21h12"/>',
    spin: '<path d="M20 12a8 8 0 11-3-6.2M20 4v4h-4"/>',
    robot: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    gg: '<path d="M3 12h4l3-3h4l3 3h4M7 12v4M17 12v4M10 9l4 6"/>',
    point: '<path d="M3 12h14M13 7l5 5-5 5"/><circle cx="20.5" cy="12" r=".8"/>',
    hand: '<path d="M8 21v-9a1.4 1.4 0 012.8 0V6.5a1.4 1.4 0 012.8 0V12m0-4a1.4 1.4 0 012.8 0v4.5m0-2a1.4 1.4 0 012.8 0V16c0 3-2 5-5 5h-3c-2 0-3-1-4-3l-2-4"/><path d="M20 3v3M20 8.5v.01"/>'
  };
  function svg(id, size) { var g = G[id] || G.heart; return '<svg class="mge-ico" viewBox="0 0 24 24" width="' + (size || 28) + '" height="' + (size || 28) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + g + '</svg>'; }

  // ── Daten (emotes.json) ──
  var DATA = null, loading = null;
  function load() {
    if (DATA) return Promise.resolve(DATA); if (loading) return loading;
    loading = fetch('emotes.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
      DATA = (j && Array.isArray(j.emotes) && j.emotes.length) ? j : fallbackData(); return DATA;
    });
    return loading;
  }
  function fallbackData() {
    var ids = Object.keys(POSES), names = { wave: ['Winken', 'Wave'], cheer: ['Jubeln', 'Cheer'], clap: ['Klatschen', 'Clap'], bow: ['Verbeugen', 'Bow'], thumbs: ['Daumen hoch', 'Thumbs up'], laugh: ['Lachen (freudig)', 'Laugh'], dance: ['Tanzen', 'Dance'], heart: ['Herz', 'Heart'], think: ['Nachdenken', 'Thinking'], no: ['Kopf schütteln', 'Shake head'], yes: ['Nicken', 'Nod'], shrug: ['Schulterzucken', 'Shrug'], wow: ['Staunen', 'Wow'], oops: ['Oje', 'Oops'], sad: ['Traurig', 'Sad'], sleep: ['Schlafen', 'Sleep'], flex: ['Muskeln', 'Flex'], salute: ['Salut', 'Salute'], hop: ['Hüpfen', 'Hop'], spin: ['Drehen', 'Spin'], robot: ['Roboter', 'Robot'], gg: ['Gut gespielt', 'Good game'], point: ['Zeigen', 'Point'], hand: ['Hand heben', 'Raise hand'] };
    return { pages: [{ de: 'Grüßen & Freuen', en: 'Greet & Cheer' }, { de: 'Reagieren', en: 'React' }, { de: 'Spaß & Fairness', en: 'Fun & Fair Play' }], emotes: ids.map(function (id, i) { return { id: id, page: Math.floor(i / 8) + 1, slot: (i % 8) + 1, de: names[id][0], en: names[id][1], ms: DUR[id] }; }) };
  }
  function byId(id) { var l = DATA ? DATA.emotes : fallbackData().emotes; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function nameOf(id) { var e = byId(id); return e ? (e[lang()] || e.de) : id; }
  function durOf(id) { var e = byId(id); return (e && e.ms) || DUR[id] || 2000; }

  // ── Probe: Zielwerte + Huellkurve (0,25 s Ein-/Ausblenden) ──
  function sample(id, t) {
    var f = POSES[id]; if (!f) return null;
    var d = durOf(id) / 1000, env = ease(t / 0.25) * ease((d - t) / 0.25);
    return { v: f(Math.max(0, t)), env: env, abs: ABS[id] || null, done: t >= d, dur: d };
  }

  var live = null, lastAnnounce = 0, shown = ls('mg_emotes_show') !== '0', muted = {}, cfg = {}, lastSend = 0, wheel = null, fab = null, page = 1, sel = 0;
  function toast(msg) {
    var n = document.getElementById('mge-toast');
    if (!n) { n = document.createElement('div'); n.id = 'mge-toast'; n.className = 'mge-toast'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
    n.textContent = msg; n.hidden = false; clearTimeout(n._t); n._t = setTimeout(function () { n.hidden = true; }, 3200);
  }
  function tr(s) { return (global.MGI18n && MGI18n.t) ? MGI18n.t(s) : s; }
  function announce(pid, id) {
    var now = Date.now(); if (now - lastAnnounce < 3000) return; lastAnnounce = now;
    if (!live) { live = document.createElement('div'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); document.body.appendChild(live); }
    var sc = cfg.getScene && cfg.getScene(), f = sc && sc.figs && sc.figs[pid], who = f ? f.name : '';
    live.textContent = (who ? who + ': ' : '') + nameOf(id);
  }

  // ── Empfangen / Ausloesen ──
  function receive(pid, id) {
    if (!POSES[id] || !shown || muted[pid]) return;
    var sc = cfg.getScene && cfg.getScene(); if (!sc || !sc.playEmote) return;
    sc.playEmote(pid, id); announce(pid, id);
  }
  function trigger(id) {
    if (!POSES[id]) return;
    if (cfg.enabled && !cfg.enabled()) { toast(tr('Emotes sind in diesem Raum ausgeschaltet.')); return; }
    var now = Date.now(); if (now - lastSend < 1500) { toast(tr('Emotes kurz pausiert')); return; }
    lastSend = now;
    if (cfg.solo) { var me = cfg.selfId && cfg.selfId(), sc = cfg.getScene && cfg.getScene(); if (sc && sc.playEmote) sc.playEmote(me, id); }
    else if (cfg.send) cfg.send(id);
  }
  function denied(reason) {
    toast(reason === 'off' ? tr('Emotes sind in diesem Raum ausgeschaltet.') : reason === 'rate' ? tr('Emotes kurz pausiert') : tr('Dieses Emote gibt es nicht.'));
  }

  // ── Rad ──
  function typing(e) { var t = e.target; if (!t) return false; var n = t.tagName; return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || t.isContentEditable; }
  function pageList(p) { return (DATA ? DATA.emotes : fallbackData().emotes).filter(function (e) { return e.page === p; }).sort(function (a, b) { return a.slot - b.slot; }); }
  function pages() { return DATA && DATA.pages ? DATA.pages.length : 3; }
  function build() {
    if (wheel) return;
    wheel = document.createElement('div'); wheel.id = 'mg-emote'; wheel.className = 'mge'; wheel.hidden = true;
    wheel.setAttribute('role', 'dialog'); wheel.setAttribute('aria-modal', 'true'); wheel.setAttribute('aria-label', tr('Emotes'));
    wheel.innerHTML = '<div class="mge-ring" role="menu"></div>' +
      '<div class="mge-mid"><button type="button" class="mge-nav" data-d="-1" aria-label="' + tr('Vorherige Seite') + '">&lsaquo;</button><div class="mge-pg" aria-live="polite"></div><button type="button" class="mge-nav" data-d="1" aria-label="' + tr('Nächste Seite') + '">&rsaquo;</button></div>' +
      '<button type="button" class="mge-x" aria-label="' + tr('Schließen') + '">&times;</button>';
    document.body.appendChild(wheel);
    wheel.addEventListener('click', function (e) {
      if (e.target === wheel) { close(); return; }
      var s = e.target.closest('.mge-seg'); if (s) { pick(s.getAttribute('data-id')); return; }
      var n = e.target.closest('.mge-nav'); if (n) { setPage(page + parseInt(n.getAttribute('data-d'), 10)); return; }
      if (e.target.closest('.mge-x')) close();
    });
    wheel.addEventListener('wheel', function (e) { e.preventDefault(); setPage(page + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
    var tx = 0; wheel.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    wheel.addEventListener('touchend', function (e) { var dx = (e.changedTouches[0].clientX - tx); if (Math.abs(dx) > 60) setPage(page + (dx < 0 ? 1 : -1)); }, { passive: true });
  }
  function setPage(p) { var n = pages(); page = ((p - 1 + n) % n) + 1; sel = 0; render(); focusSeg(); }
  function render() {
    var ring = wheel.querySelector('.mge-ring'), list = pageList(page), R = 118, html = '';
    list.forEach(function (e, i) {
      var a = (-90 + i * 45) * Math.PI / 180, x = Math.cos(a) * R, y = Math.sin(a) * R, nm = e[lang()] || e.de, pn = (DATA && DATA.pages && DATA.pages[page - 1]) ? (DATA.pages[page - 1][lang()] || '') : '';
      html += '<button type="button" role="menuitem" class="mge-seg" data-id="' + e.id + '" data-i="' + i + '" tabindex="' + (i === sel ? 0 : -1) + '" style="--x:' + x.toFixed(1) + 'px;--y:' + y.toFixed(1) + 'px" aria-label="' + nm + ', ' + (i + 1) + ' / ' + list.length + ', ' + tr('Seite') + ' ' + page + ' / ' + pages() + '">' + svg(e.id, 28) + '<span class="mge-lbl">' + nm + '</span></button>';
    });
    ring.innerHTML = html;
    var pg = wheel.querySelector('.mge-pg'), nmP = (DATA && DATA.pages && DATA.pages[page - 1]) ? (DATA.pages[page - 1][lang()] || '') : '';
    pg.innerHTML = '<b>' + page + '/' + pages() + '</b><span>' + nmP + '</span>';
  }
  function focusSeg() { var b = wheel && wheel.querySelector('.mge-seg[data-i="' + sel + '"]'); if (b) b.focus(); }
  function pick(id) { close(); trigger(id); }
  var lastFocus = null;
  function open() {
    if (!shown && cfg.solo === false) { /* Anzeige aus: Senden bleibt moeglich */ }
    load().then(function () {
      build(); page = page || 1; sel = 0; render(); wheel.hidden = false; lastFocus = document.activeElement; document.body.classList.add('mge-open'); focusSeg();
    });
  }
  function close() { if (!wheel || wheel.hidden) return; wheel.hidden = true; document.body.classList.remove('mge-open'); if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} } }
  function isOpen() { return !!(wheel && !wheel.hidden); }
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!isOpen()) {
      if ((e.key === 'b' || e.key === 'B') && !typing(e) && cfg.getScene && cfg.getScene()) { e.preventDefault(); open(); }
      return;
    }
    var k = e.key, segs = wheel.querySelectorAll('.mge-seg');
    if (k === 'Escape' || k === 'b' || k === 'B') { e.preventDefault(); close(); return; }
    if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % segs.length; render(); focusSeg(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); sel = (sel + segs.length - 1) % segs.length; render(); focusSeg(); return; }
    if (k === 'PageDown' || k === '.') { e.preventDefault(); setPage(page + 1); return; }
    if (k === 'PageUp' || k === ',') { e.preventDefault(); setPage(page - 1); return; }
    if (/^[1-8]$/.test(k)) { e.preventDefault(); var s = segs[parseInt(k, 10) - 1]; if (s) pick(s.getAttribute('data-id')); return; }
    if (k === 'Enter' || k === ' ') { var f = document.activeElement; if (f && f.classList && f.classList.contains('mge-seg')) { e.preventDefault(); pick(f.getAttribute('data-id')); } }
  }, true);

  function mountFab() {
    if (fab) return;
    fab = document.createElement('button'); fab.type = 'button'; fab.className = 'mge-fab'; fab.setAttribute('aria-haspopup', 'dialog');
    fab.setAttribute('aria-label', tr('Emotes öffnen (Taste B)')); fab.innerHTML = svg('heart', 26) + '<span class="mge-fab-t">' + tr('Emotes') + '</span>';
    fab.addEventListener('click', function () { if (isOpen()) close(); else open(); });
    document.body.appendChild(fab); updateFab();
  }
  function updateFab() {
    if (!fab) return; var sc = cfg.getScene && cfg.getScene(); fab.hidden = !sc || (cfg.enabled && !cfg.enabled() && !cfg.solo);
    // Multiplayer: Knopf direkt neben den Glockenknopf; Solo: am rechten Rand mittig (ueberdeckt keine Tipp-Zeile)
    var bell = !cfg.solo && (document.getElementById('buzzer-btn'));
    if (bell && bell.offsetParent) { var r = bell.getBoundingClientRect(); if (r.right + 62 < innerWidth && r.width > 0) { fab.style.left = (r.right + 10) + 'px'; fab.style.top = (r.top + (r.height - 52) / 2) + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto'; return; } }
    fab.style.left = fab.style.top = fab.style.bottom = ''; fab.style.right = cfg.solo ? '6px' : '14px'; if (cfg.solo) { fab.style.top = '46%'; fab.style.bottom = 'auto'; }
  }

  function init(o) { cfg = o || {}; load(); mountFab(); setInterval(updateFab, 1500); }
  function setShown(on) { shown = !!on; ls('mg_emotes_show', on ? '1' : '0'); }
  function mute(pid, on) { if (on) muted[pid] = 1; else delete muted[pid]; }
  function isMuted(pid) { return !!muted[pid]; }

  global.MGEmote = { init: init, receive: receive, denied: denied, trigger: trigger, open: open, close: close, sample: sample, svg: svg, nameOf: nameOf, durOf: durOf, load: load, setShown: setShown, isShown: function () { return shown; }, mute: mute, isMuted: isMuted, reduced: reduced, list: function () { return DATA ? DATA.emotes : fallbackData().emotes; }, toast: toast };
})(window);
