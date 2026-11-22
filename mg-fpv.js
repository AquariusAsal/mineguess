/* MineGuess Ich-Ansicht (FPV), Etappe 1: Solo-Modi. Die Kamera der Szene (mg-scene.js) wechselt auf Augenhoehe der eigenen Figur
   (Auge y=28, FOV 70 Grad, Yaw +-100 Grad, Pitch -66..+20 Grad), die eigenen Arme sind sichtbar, der Reporter steht gegenueber.
   Die Frage-/Antwort-Spalte (<main>) wird zur "Karte" in der Hand (Frage oben, Antwortfeld unten). Dieselbe Szene, nur Kamera und Sichtbarkeit:
   kein Neuladen, Wechsel in 0,25 s (bei reduzierter Bewegung sofort). Crafting: Ich-Sicht auf die Werkbank (Perspektive, Skin-Hand).
   Bedienung: Knopf "Ich-Ansicht", Taste V, Zahnrad "Ansicht: Normal / Ich-Ansicht". Klick auf den Knopf aktiviert Vollbild (Fehler -> Hinweis, Fenster).
   Umsehen: Maus ziehen (oder "Maus fangen" = Pointer Lock), Pfeiltasten, Wischen. Esc beendet Vollbild und Ich-Ansicht. */
(function (global) {
  'use strict';
  var cfg = {}, poseIv = 0, lastPose = { y: 99, p: 99 }, on = false, fsOwn = false, btn = null, host = null, home = null, toastEl = null, auto = false;
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function tr(s) { return (global.MGI18n && MGI18n.t) ? MGI18n.t(s) : s; }
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'fpv-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }
  function scene() { return cfg.getScene ? cfg.getScene() : null; }
  function gameVisible() { var g = document.getElementById(cfg.mode === 'mp' ? 'game-screen' : 'game-wrapper'); return !!(g && g.offsetParent !== null); }
  // Aktuelle Frage (game.html: question, multiplayer.html: currentQ; globale let-Variablen) und Sperrliste
  function curQ() { try { if (cfg.mode === 'mp') return typeof currentQ !== 'undefined' ? currentQ : null; return typeof question !== 'undefined' ? question : null; } catch (e) { return null; } }
  function overlayOpen() { var sel = '#blitz-end,#daily-end,.hl-end,.hc-end,#mg-hl,#mg-rounds,#mg-profile,#mg-social,#lb-modal,#rankup,#stats-modal,#badge-modal'; var l = document.querySelectorAll(sel); for (var i = 0; i < l.length; i++) { var e = l[i]; if (e.offsetParent !== null && !e.hidden && getComputedStyle(e).display !== 'none') return true; } return false; }
  // Zentral: Ich-Ansicht nur bei klassischen Fragen (Zahl, Entity, ODER, Wahr/Mythos); nie bei Crafting, Hoeher/Tiefer, Sonderformaten, Menue/Endkarten
  function blocked() { var q = curQ(); return craftActive() || overlayOpen() || !(global.MGFpvRules && q && MGFpvRules.fpvAllowed(q)); }
  function craftActive() { var c = document.getElementById('craft-host'); return !!(c && c.offsetParent !== null && c.querySelector('.craft-panel')); }
  function typing(e) { var t = e.target; if (!t) return false; var n = t.tagName; return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || t.isContentEditable; }
  function eyeSvg() { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'; }

  // Gemeinsames Layout: Elemente fuer Solo und Multiplayer mit denselben Klassen markieren
  var TAGS = [['fpv-map', '#game-wrapper main, #game-screen > div.card:nth-of-type(1), #game-screen > #result-panel'], ['fpv-timer', '#timer-wrap, #game-screen .timer-wrap'], ['fpv-att', '#attempts-bar, .attempt-label'], ['fpv-side', '.hint-area'], ['fpv-sidel', '#game-screen #totem-row'], ['fpv-hist', '#guesses-list']];
  function tag(on) { TAGS.forEach(function (t) { document.querySelectorAll(t[1]).forEach(function (e) { e.classList.toggle(t[0], !!on); }); }); }
  function moveSceneToBody() {
    var s = document.getElementById(cfg.sceneId || 'solo-scene'); if (!s || host) return;
    host = s; s.classList.add('fpv-scene'); home = { parent: s.parentNode, next: s.nextSibling }; document.body.appendChild(s);
  }
  function moveSceneHome() { if (host) host.classList.remove('fpv-scene'); if (!host || !home) return; try { home.parent.insertBefore(host, home.next && home.next.parentNode === home.parent ? home.next : null); } catch (e) {} host = null; home = null; }

  // Crafting-Ich-Sicht: zweite (gespiegelte) Hand links unten, rechte Hand ist die Skin-Hand von mg-hand.js
  var leftHand = null, handIv = 0, fitMo = null;
  // Fragetext auf der Karte: Schrift verkleinern statt abschneiden (11-16 px)
  function fitQuestion() {
    var q = document.getElementById('question-text'); if (!q) return; if (!on || document.body.classList.contains('fpv-craft')) { q.style.fontSize = ''; return; }
    var fs = 16; q.style.fontSize = fs + 'px';
    while (fs > 11 && q.scrollHeight > q.clientHeight + 1 || fs > 11 && q.scrollHeight > Math.max(60, innerHeight * 0.13)) { fs -= 1; q.style.fontSize = fs + 'px'; }
  }
  function anchorEl() { return document.querySelector('.fpv-map'); }
  // Haende greifen die untere Kartenkante: unsichtbarer Anker links/rechts neben der Karte, linke Hand = gespiegelter Klon
  var anchorBox = null;
  function placeLeft() {
    if (blocked()) return;
    var panel = anchorEl(), src = document.querySelector('.mgh:not(.mgh-left)');
    if (!panel || !src) return;
    var r = panel.getBoundingClientRect(), x, y;
    {
      if (!anchorBox) { anchorBox = document.createElement('div'); anchorBox.className = 'fpv-hand-anchor'; document.body.appendChild(anchorBox); }
      anchorBox.style.left = (r.left - 22) + 'px'; anchorBox.style.top = r.top + 'px'; anchorBox.style.width = (r.width + 44) + 'px'; anchorBox.style.height = (r.height + 40) + 'px';
      if (global.MGHand && MGHand.setAnchor) { try { MGHand.setAnchor(anchorBox); } catch (e) {} }
      x = r.left - 16; y = r.bottom - 30;
    }
    if (!leftHand) { leftHand = src.cloneNode(true); leftHand.classList.add('mgh-left'); var it = leftHand.querySelector('.mgh-item'); if (it) it.hidden = true; document.body.appendChild(leftHand); }
    var pos = leftHand.querySelector('.mgh-pos');
    leftHand.hidden = src.hidden; leftHand.style.transformOrigin = '0 0'; leftHand.style.transform = 'translateX(' + innerWidth + 'px) scaleX(-1)';
    if (pos) pos.style.transform = 'translate3d(' + (innerWidth - x).toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
  }
  function startLeft() { stopLeft(); placeLeft(); handIv = setInterval(placeLeft, 400); }
  function stopLeft() { clearInterval(handIv); handIv = 0; if (leftHand) { leftHand.remove(); leftHand = null; } if (anchorBox) { anchorBox.remove(); anchorBox = null; } }
  function enter(gesture) {
    if (on) return;
    var sc = scene(), craft = blocked();
    if (craft) { toast(tr('Bei Crafting-Fragen nicht verfügbar')); return; }
    if (!sc) { toast(tr('Die Ich-Ansicht ist hier nicht verfügbar.')); return; }
    if (sc && !sc.isGL()) { toast(tr('Ich-Ansicht braucht WebGL. Du bleibst in der Normalansicht.')); return; }
    on = true; document.body.classList.add('fpv-on'); tag(true);
    if (sc) { moveSceneToBody(); sc.setFpv(true, (typeof cfg.id === 'function' ? cfg.id() : cfg.id) || 'player'); }
    if (global.MGHand) { var an = anchorEl(); if (an) { try { MGHand.show(an); MGHand.idle(); } catch (e) {} startLeft(); } }
    fitQuestion(); if (!fitMo && global.MutationObserver) { var qt = document.getElementById('question-text'); if (qt) { fitMo = new MutationObserver(fitQuestion); fitMo.observe(qt, { childList: true, characterData: true, subtree: true }); } }
    document.body.classList.toggle('fpv-mp', cfg.mode === 'mp'); ls('mg_view', 'fpv'); update();
    if (cfg.onChange) cfg.onChange(true);
    if (cfg.sendPose) { clearInterval(poseIv); poseIv = setInterval(sendPose, 100); }
    if (gesture) fullscreen();
    try { global.dispatchEvent(new Event('resize')); } catch (e) {}
  }
  function exit(keepPref) {
    if (!on) return; on = false;
    var sc = scene(); if (sc) sc.setFpv(false);
    document.body.classList.remove('fpv-on', 'fpv-craft'); tag(false); moveSceneHome(); stopLeft(); var qq = document.getElementById('question-text'); if (qq) qq.style.fontSize = ''; if (fitMo) { fitMo.disconnect(); fitMo = null; } if (global.MGHand) { var cp = craftActive() && document.querySelector('#craft-host .craft-panel'); try { if (cp) MGHand.setAnchor(cp); else MGHand.hide(); } catch (e) {} }
    if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
    if (fsOwn && document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
    fsOwn = false; if (!keepPref) ls('mg_view', 'normal'); update(); clearInterval(poseIv); document.body.classList.remove('fpv-mp');
    if (cfg.onChange) cfg.onChange(false);
    try { global.dispatchEvent(new Event('resize')); } catch (e) {}
  }
  function fullscreen() {
    var de = document.documentElement, rq = de.requestFullscreen || de.webkitRequestFullscreen;
    if (!rq || document.fullscreenEnabled === false) { toast(tr('Vollbild ist auf diesem Gerät nicht möglich. Die Ansicht läuft im Fenster.')); return; }
    toast(tr('Vollbildmodus wird aktiviert'));
    try { var p = rq.call(de); fsOwn = true; if (p && p.catch) p.catch(function () { fsOwn = false; toast(tr('Vollbild wurde nicht erlaubt. Die Ansicht läuft im Fenster.')); }); } catch (e) { fsOwn = false; toast(tr('Vollbild wurde nicht erlaubt. Die Ansicht läuft im Fenster.')); }
  }
  function sendPose() {
    var sc = scene(); if (!sc || !on || !cfg.sendPose || blocked()) return;   // pose nur bei klassischen Fragen
    var y = Math.round(sc.fpvYaw * 180 / Math.PI * 10) / 10, p = Math.round(sc.fpvPitch * 180 / Math.PI * 10) / 10;
    if (Math.abs(y - lastPose.y) < 1 && Math.abs(p - lastPose.p) < 1) return; lastPose = { y: y, p: p }; cfg.sendPose(y, p);
  }
  // Angebot des Hosts ("Ich-Ansicht fuer alle"): jeder entscheidet selbst, 15 s ohne Antwort = Normalansicht
  function offer(by) {
    var old = document.getElementById('fpv-offer'); if (old) old.remove();
    var d = document.createElement('div'); d.id = 'fpv-offer'; d.className = 'fpv-offer'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'fpv-offer-t');
    d.innerHTML = '<div class="fpv-offer-box"><p id="fpv-offer-t">' + tr('Der Host möchte die Ich-Ansicht aktivieren.') + '<br><small>' + tr('Hinweis: Die Ich-Ansicht ist noch in der Alpha-Phase.') + '</small></p><div class="fpv-offer-row"><button type="button" class="btn btn-primary" data-a="1">' + tr('Mitmachen') + '</button><button type="button" class="btn" data-a="0">' + tr('Normale Ansicht') + '</button></div></div>';
    document.body.appendChild(d);
    var fin = function (yes) { clearTimeout(t); d.remove(); if (yes) { enter(true); } else { if (cfg.onChange) cfg.onChange(false); } };
    var t = setTimeout(function () { fin(false); }, 15000);
    d.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) fin(b.getAttribute('data-a') === '1'); });
    var nb = d.querySelector('[data-a="0"]'); if (nb) nb.focus();
  }
  // Alpha-Hinweis: Wechsel in die Ich-Ansicht braucht eine Bestaetigung (einmal je Browser-Sitzung)
  function alphaOk() { try { return sessionStorage.getItem('mg_fpv_alpha') === '1'; } catch (e) { return false; } }
  function askAlpha(go) {
    var old = document.getElementById('fpv-alpha'); if (old) old.remove();
    var d = document.createElement('div'); d.id = 'fpv-alpha'; d.className = 'fpv-offer'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'fpv-alpha-t');
    d.innerHTML = '<div class="fpv-offer-box"><p id="fpv-alpha-t"><b>' + tr('Ich-Ansicht (Alpha-Phase)') + '</b><br>' + tr('Die Ich-Ansicht ist noch in der Alpha-Phase. Es kann zu Fehlern kommen. Möchtest du trotzdem wechseln?') + '</p><div class="fpv-offer-row"><button type="button" class="btn btn-primary" data-a="1">' + tr('Trotzdem wechseln') + '</button><button type="button" class="btn" data-a="0">' + tr('Abbrechen') + '</button></div></div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; d.remove(); if (b.getAttribute('data-a') === '1') { try { sessionStorage.setItem('mg_fpv_alpha', '1'); } catch (er) {} go(); } });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); d.remove(); } });
    var nb = d.querySelector('[data-a="1"]'); if (nb) nb.focus();
  }
  function toggle(gesture) { if (on) { exit(); return; } if (alphaOk()) { enter(gesture); return; } askAlpha(function () { enter(true); }); }

  // ── Umsehen ──
  var drag = null, K = 0.004;
  function look(dx, dy) { var sc = scene(); if (sc && on && !document.body.classList.contains('fpv-craft')) sc.fpvLook(-dx * K * (parseFloat(ls('mg_fpv_sens')) || 1), -dy * K * (parseFloat(ls('mg_fpv_sens')) || 1)); }
  document.addEventListener('pointerdown', function (e) {
    if (!on || !host || !host.contains(e.target)) return;
    if (ls('mg_fpv_lock') === '1' && e.pointerType === 'mouse' && host.requestPointerLock && !document.pointerLockElement) { try { host.requestPointerLock(); } catch (x) {} }
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  document.addEventListener('pointermove', function (e) {
    if (!on) return;
    if (document.pointerLockElement) { look(e.movementX || 0, e.movementY || 0); return; }
    if (!drag || e.pointerId !== drag.id) return; look(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY;
  });
  document.addEventListener('pointerup', function () { drag = null; });
  document.addEventListener('focusin', function (e) { if (document.pointerLockElement && typing(e)) { try { document.exitPointerLock(); } catch (x) {} } });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    if ((e.key === 'v' || e.key === 'V') && gameVisible() && !blocked() && scene()) { e.preventDefault(); if (blocked()) { toast(tr('Bei Crafting-Fragen nicht verfügbar')); return; } toggle(false); return; }
    if (!on) return;
    var st = 0.06;
    if (e.key === 'ArrowLeft') { var s1 = scene(); if (s1) { e.preventDefault(); s1.fpvLook(st, 0); } }
    else if (e.key === 'ArrowRight') { var s2 = scene(); if (s2) { e.preventDefault(); s2.fpvLook(-st, 0); } }
    else if (e.key === 'ArrowUp') { var s3 = scene(); if (s3) { e.preventDefault(); s3.fpvLook(0, 0.05); } }
    else if (e.key === 'ArrowDown') { var s4 = scene(); if (s4) { e.preventDefault(); s4.fpvLook(0, -0.05); } }
  });
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && fsOwn && on) { fsOwn = false; exit(); } });

  // ── Knopf ──
  // Fragewechsel Crafting <-> Szene-Frage: Variante der Ich-Ansicht passend nachziehen (ohne Neuladen)
  function syncMode() {
    if (!on) return;
    if (blocked()) { exit(true); return; }   // Crafting: nie Ich-Ansicht, Auswahl bleibt fuer die naechste Frage erhalten
    tag(true);
    var sc = scene();
    if (sc && !host) { moveSceneToBody(); sc.setFpv(true, (typeof cfg.id === 'function' ? cfg.id() : cfg.id) || 'player'); }
  }
  function update() {
    if (!btn) return; syncMode();
    var craftNow = blocked(), vis = gameVisible() && !craftNow && !!scene() && (!cfg.canUse || cfg.canUse());
    btn.hidden = !vis;
    btn.disabled = craftNow; btn.setAttribute('aria-disabled', craftNow ? 'true' : 'false'); btn.title = craftNow ? tr('Bei Crafting-Fragen nicht verfügbar') : '';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.innerHTML = eyeSvg() + '<span>' + tr(on ? 'Normalansicht' : 'Ich-Ansicht') + '</span>';
    btn.setAttribute('aria-label', tr(on ? 'Zur Normalansicht wechseln (Taste V)' : 'Ich-Ansicht einschalten (Taste V, aktiviert Vollbild)'));
    if (!vis && on) exit(true);
    // Voreinstellung "Ansicht: Ich-Ansicht" (ohne Vollbild, da keine Geste)
    if (vis && !on && !auto && ls('mg_view') === 'fpv' && scene()) { auto = true; enter(false); }
    if (!vis) auto = false;
  }
  function init(o) {
    cfg = o || {};
    if (!btn) {
      btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fpv-btn'; btn.hidden = true;
      btn.addEventListener('click', function () { toggle(true); });
      document.body.appendChild(btn);
      setInterval(update, 150);
    }
    update();
  }
  global.MGFpv = { init: init, enter: enter, exit: exit, toggle: toggle, isOn: function () { return on; }, offer: offer };
})(window);
