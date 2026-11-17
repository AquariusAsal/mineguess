/* MineGuess Skin-Hand: kleine animierte Ego-Hand (rechter Arm des Spielers) am Crafting-Raster, reine CSS-3D-Quader aus dem Skin-PNG
   (kein WebGL, keine Textur-Uploads). Dekorativ: aria-hidden, pointer-events:none, verdeckt nichts Bedienbares (Versatz nach unten/rechts).
   Skin: MGSkin.get() (geprueft ueber MGScene.loadSkin: Rauschen/unverifizierbar -> verworfen), sonst Steve (wide) bzw. Alex (slim).
   Maße/UV: docs/team/BUZZER-SCENE-SPEC.md (rechter Arm 4x12x4 bzw. 3x12x4, Basis bei (40,16), Aermel bei (40,32)).
   API: MGHand.show(anchorEl) · hide() · idle() · hold(iconUrl|null) · moveTo(x,y,touch) · place(el) · sweep(fromEl,toEl) · remove(el) ·
        reveal(el) · release() · setAnchor(el) · destroy()
   Die Spiellogik reagiert sofort; die Hand folgt nur visuell. "Animationen reduzieren": statische Hand an der Ruheposition. */
(function (global) {
  'use strict';
  var S = 10;                                     // Pixel je Skin-Pixel (Arm 48 px breit)
  var STEVE = 'assets/mc/entity/player/wide/steve.png', ALEX = 'assets/mc/entity/player/slim/alex.png';
  var root = null, posEl = null, bobEl = null, tiltEl = null, armEl = null, slvEl = null, itemEl = null;
  var anchor = null, rest = { x: 0, y: 0 }, cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 };
  var active = false, raf = 0, last = 0, relT = 0, skinKey = '', lean = -52, baseLean = -52, holdSrc = '';

  function reduced() {
    return (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.getAttribute('data-motion') === 'reduce';
  }
  function face(cls, u, v, fw, fh, w, h, tf, left, top, src) {
    return '<i class="mgh-f ' + cls + '" style="width:' + (fw * S) + 'px;height:' + (fh * S) + 'px;left:' + left + 'px;top:' + top + 'px;' +
      'background-image:url(' + src + ');background-size:' + (64 * S) + 'px ' + (64 * S) + 'px;background-position:-' + (u * S) + 'px -' + (v * S) + 'px;transform:' + tf + '"></i>';
  }
  function box(src, u0, v0, w, h, d) {
    var W = w * S, H = h * S, D = d * S;
    return face('f', u0 + d, v0 + d, w, h, w, h, 'translateZ(' + D / 2 + 'px)', 0, 0, src) +
      face('b', u0 + d + w + d, v0 + d, w, h, w, h, 'rotateY(180deg) translateZ(' + D / 2 + 'px)', 0, 0, src) +
      face('r', u0, v0 + d, d, h, w, h, 'rotateY(90deg) translateZ(' + W / 2 + 'px)', (W - D) / 2, 0, src) +
      face('l', u0 + d + w, v0 + d, d, h, w, h, 'rotateY(-90deg) translateZ(' + W / 2 + 'px)', (W - D) / 2, 0, src) +
      face('t', u0 + d, v0, w, d, w, h, 'rotateX(90deg) translateZ(' + H / 2 + 'px)', 0, (H - D) / 2, src) +
      face('u', u0 + d + w, v0, w, d, w, h, 'rotateX(-90deg) translateZ(' + H / 2 + 'px)', 0, (H - D) / 2, src);
  }
  function build(src, slim) {
    var w = slim ? 3 : 4, W = w * S, H = 12 * S;
    [armEl, slvEl].forEach(function (e, i) {
      e.style.width = W + 'px'; e.style.height = H + 'px'; e.style.left = (-W / 2) + 'px';
      e.innerHTML = box(src, 40, i ? 32 : 16, w, 12, 4);
    });
  }
  function resolveSkin() {
    var ch = (global.MGSkin && global.MGSkin.getCharacter && global.MGSkin.getCharacter()) || 'steve';
    var custom = global.MGSkin && global.MGSkin.get ? global.MGSkin.get() : null;
    var def = ch === 'alex' ? ALEX : STEVE, key = (custom || def) + '|' + ch;
    if (key === skinKey) return;
    skinKey = key;
    build(def, ch === 'alex');                       // sofort Standardfigur, dann ggf. eigener (geprueft)
    if (custom && global.MGScene && global.MGScene.loadSkin) {
      global.MGScene.loadSkin(custom).then(function (s) { if (skinKey === key) build(custom, !!s.slim); },
        function (err) { try { console.warn('[MineGuess] Hand: eigener Skin verworfen (' + ((err && err.message) || '?') + '), Standardfigur wird gezeigt.'); } catch (e) {} });
    }
  }

  function ensure() {
    if (root) return;
    root = document.createElement('div'); root.className = 'mgh'; root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="mgh-pos"><div class="mgh-bob"><div class="mgh-tilt"><div class="mgh-arm"></div><div class="mgh-arm mgh-sleeve"></div></div></div><img class="mgh-item" alt="" hidden></div>';
    document.body.appendChild(root);
    posEl = root.querySelector('.mgh-pos'); bobEl = root.querySelector('.mgh-bob'); tiltEl = root.querySelector('.mgh-tilt');
    armEl = root.querySelectorAll('.mgh-arm')[0]; slvEl = root.querySelector('.mgh-sleeve'); itemEl = root.querySelector('.mgh-item');
    global.addEventListener('resize', measure); global.addEventListener('scroll', measure, { passive: true });
    global.addEventListener('mg-skin-change', function () { skinKey = ''; if (root && !root.hidden) resolveSkin(); });
  }
  function draw() {
    posEl.style.transform = 'translate3d(' + cur.x.toFixed(1) + 'px,' + cur.y.toFixed(1) + 'px,0)';
    tiltEl.style.transform = 'rotateZ(' + lean.toFixed(1) + 'deg) rotateX(-42deg)';
  }
  function measure() {
    if (!root || root.hidden || !anchor) return;
    if (!anchor.isConnected) { hide(); return; }
    var r = anchor.getBoundingClientRect();
    rest = { x: r.right - 34, y: r.bottom - 70 };
    if (!active) { tgt = { x: rest.x, y: rest.y }; if (!raf) { cur = { x: tgt.x, y: tgt.y }; lean = baseLean; draw(); } }
  }
  function tick(t) {
    raf = 0;
    var dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    var k = 1 - Math.exp(-dt * 20), dx = tgt.x - cur.x, dy = tgt.y - cur.y;
    cur.x += dx * k; cur.y += dy * k;
    var lt = baseLean + Math.max(-12, Math.min(12, dx * 0.25));
    lean += (lt - lean) * (1 - Math.exp(-dt * 14));   // neigt sich in Bewegungsrichtung
    draw();
    if (Math.abs(dx) + Math.abs(dy) > 0.4 || Math.abs(lean - baseLean - Math.max(-12, Math.min(12, dx * 0.25))) > 0.5) raf = requestAnimationFrame(tick);
  }
  function go(x, y) {
    tgt = { x: x, y: y };
    if (reduced()) return;
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function dip(kind) {
    if (reduced() || !tiltEl.animate) return;
    var L = lean.toFixed(1), base = 'rotateZ(' + L + 'deg) rotateX(-42deg)';
    var fr = kind === 'flick'
      ? [{ transform: base }, { transform: 'rotateZ(' + (lean + 24) + 'deg) rotateX(-30deg) translateY(-8px)', offset: 0.4 }, { transform: base }]
      : [{ transform: base }, { transform: 'rotateZ(' + L + 'deg) rotateX(-58deg) scale(.93)', offset: 0.4 }, { transform: base }];
    tiltEl.animate(fr, { duration: kind === 'flick' ? 200 : 170, easing: 'ease-out' });
  }
  function center(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function show(a) {
    ensure(); root.hidden = false; if (a) anchor = a;
    resolveSkin(); active = false; measure();
    cur = { x: rest.x, y: rest.y }; tgt = { x: rest.x, y: rest.y }; draw(); idle();
  }
  function hide() { if (root) root.hidden = true; active = false; clearTimeout(relT); }
  function idle() { if (!root) return; baseLean = -52; active = false; clearTimeout(relT); bobEl.classList.toggle('on', !reduced()); go(rest.x, rest.y); }
  function hold(src) {
    if (!root) return; holdSrc = src || '';
    if (src) { itemEl.hidden = false; itemEl.src = src; itemEl.onerror = function () { itemEl.onerror = null; itemEl.src = 'assets/mc/item/barrier.png'; }; } else { itemEl.hidden = true; }
  }
  function moveTo(x, y, touch) {
    if (!root || root.hidden || reduced()) return;
    active = true; baseLean = -34; clearTimeout(relT); bobEl.classList.remove('on');
    go(x + (touch ? 26 : 12), y + (touch ? 46 : 18));
  }
  function place(el) {
    if (!root || root.hidden) return;
    if (!active && el) { var c = center(el); baseLean = -34; go(c.x + 8, c.y + 14); }
    dip('tap'); if (!active) { clearTimeout(relT); relT = setTimeout(idle, 700); }
  }
  function remove(el) {
    if (!root || root.hidden) return;
    if (!active && el) { var c = center(el); baseLean = -34; go(c.x + 8, c.y + 14); }
    dip('flick'); if (!active) { clearTimeout(relT); relT = setTimeout(idle, 700); }
  }
  function sweep(a, b) {
    if (!root || root.hidden || !a || !b) return;
    var p = center(a), q = center(b); baseLean = -34;
    go(p.x + 8, p.y + 14);
    setTimeout(function () { dip('tap'); go(q.x + 8, q.y + 14); }, 140);
    clearTimeout(relT); relT = setTimeout(idle, 800);
  }
  function reveal(el) {
    if (!root || root.hidden || !el) return;
    hold(null);
    var c = center(el); baseLean = -34; go(c.x + 8, c.y + 16);
    setTimeout(function () { dip('tap'); }, reduced() ? 0 : 320);
    clearTimeout(relT); relT = setTimeout(idle, 1600);
  }
  function release() { if (!root) return; active = false; clearTimeout(relT); relT = setTimeout(idle, 500); }
  function setAnchor(el) { anchor = el; measure(); }
  function destroy() { if (!root) return; if (raf) cancelAnimationFrame(raf); raf = 0; root.remove(); root = null; }

  global.MGHand = { show: show, hide: hide, idle: idle, hold: hold, moveTo: moveTo, place: place, sweep: sweep, remove: remove, reveal: reveal, release: release, setAnchor: setAnchor, destroy: destroy };
})(window);
