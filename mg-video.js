/* MineGuess Video-Hintergrund (selbst gehostet, kein externer Request).
   - Liste: assets/video/clips.json  [{id, mp4, mp4Mobile, poster, duration, tone}] (oder {clips:[...]})
   - Bei jedem Laden anderer Startclip (letzte ID in localStorage), danach Crossfade zum naechsten (zwei <video>, nur opacity).
   - Mobile-Variante bei < 800 px oder saveData; bei prefers-reduced-motion / saveData nur Poster.
   - Pause bei versteckter Seite/Offscreen, Start erst nach canplay, Poster sofort sichtbar.
   - Fehler -> opts.fallback() (WebGL-Panorama/CSS).
   API: MGVideo.mount(container, { fallback }) -> { destroy() } */
(function (global) {
  'use strict';
  var KEY = 'mg_last_clip';
  var CLIPS_URL = 'assets/video/clips.json';

  function conn() { return global.navigator && navigator.connection; }
  function saveData() { var c = conn(); return !!(c && c.saveData); }
  function reduced() {
    if (global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    try { return localStorage.getItem('mg_reduce_motion') === '1'; } catch (e) { return false; }
  }
  function lastId() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function rememberId(id) { try { localStorage.setItem(KEY, String(id)); } catch (e) {} }

  function mount(container, opts) {
    opts = opts || {};
    var dead = false, failed = false, layers = [], cur = 0, order = [], idx = 0, visible = true, clips = [];
    function fail() {
      if (failed || dead) return; failed = true;
      stop();
      if (typeof opts.fallback === 'function') opts.fallback();
    }
    var root = document.createElement('div');
    root.className = 'mgv'; root.setAttribute('aria-hidden', 'true');
    container.appendChild(root);

    function stop() { dead = true; layers.forEach(function (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }); if (root.parentNode) root.remove(); }

    fetch(CLIPS_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      clips = Array.isArray(j) ? j : (j && j.clips) || [];
      clips = clips.filter(function (c) { return c && c.mp4; });
      if (!clips.length) throw 0;
      // Reihenfolge: zufaelliger Start (nicht der letzte Clip), danach der Reihe nach
      var start = Math.floor(Math.random() * clips.length), last = lastId();
      if (clips.length > 1 && String(clips[start].id) === last) start = (start + 1 + Math.floor(Math.random() * (clips.length - 1))) % clips.length;
      for (var i = 0; i < clips.length; i++) order.push(clips[(start + i) % clips.length]);
      rememberId(order[0].id);
      setup(order[0]);
    }).catch(fail);

    function posterOnly(c) {
      var img = document.createElement('img');
      img.className = 'mgv-poster'; img.alt = ''; img.decoding = 'async';
      if (c.poster) img.src = c.poster;
      root.appendChild(img);
      applyTone(c);
    }
    function applyTone(c) {
      var t = c.tone, o = typeof t === 'number' ? t : (t === 'hell' || t === 'light') ? 0.64 : t === 'mid' ? 0.5 : 0.34;   // hell = helles Bild -> staerkeres Overlay
      root.style.setProperty('--mgv-dim', String(o));
    }
    function setup(first) {
      applyTone(first);
      var poster = document.createElement('img');
      poster.className = 'mgv-poster'; poster.alt = ''; poster.decoding = 'async';
      if (first.poster) poster.src = first.poster;
      root.appendChild(poster);
      if (reduced() || saveData()) return;       // nur Poster
      var small = global.innerWidth <= 768;
      // erst nach dem ersten Render laden
      (global.requestIdleCallback || function (f) { setTimeout(f, 300); })(function () { if (!dead) boot(small); });
    }
    function srcOf(c, small) { return (small && c.mp4Mobile) ? c.mp4Mobile : c.mp4; }
    function boot(small) {
      for (var i = 0; i < 2; i++) {
        var v = document.createElement('video');
        v.className = 'mgv-video'; v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', '');
        v.preload = 'metadata'; v.loop = false; v.style.opacity = '0';
        root.appendChild(v); layers.push(v);
      }
      function load(layer, c, atRandom) {
        var v = layers[layer];
        v.onerror = fail;
        v.src = srcOf(c, small);
        v.dataset.id = c.id;
        v.load();
        if (c.poster) v.poster = c.poster;
        v.oncanplay = function () {
          v.oncanplay = null;
          if (atRandom && isFinite(v.duration) && v.duration > 6) { try { v.currentTime = Math.random() * (v.duration - 4); } catch (e) {} }
          if (layer === cur) { v.play().catch(function () {}); v.style.opacity = '1'; }
        };
      }
      load(0, order[0], true);
      v0Watch();
      function v0Watch() {
        layers.forEach(function (v, li) {
          v.ontimeupdate = function () {
            if (li !== cur || !isFinite(v.duration)) return;
            if (v.duration - v.currentTime < 1.2 && !v._next) { v._next = true; crossfade(); }
          };
          v.onended = function () { if (li === cur && !v._next) { v._next = true; crossfade(); } };
        });
      }
      function crossfade() {
        idx = (idx + 1) % order.length;
        var nextLayer = 1 - cur, nv = layers[nextLayer], ov = layers[cur];
        nv._next = false;
        nv.src = srcOf(order[idx], small); nv.load();
        nv.oncanplay = function () {
          nv.oncanplay = null;
          nv.currentTime = 0;
          nv.play().catch(function () {});
          nv.style.opacity = '1';       // weicher Wechsel per CSS-Transition (opacity)
          ov.style.opacity = '0';
          setTimeout(function () { try { ov.pause(); } catch (e) {} }, 900);
          cur = nextLayer; rememberId(order[idx].id);
        };
      }
      // Pause bei Offscreen/versteckt
      function sync() { var v = layers[cur]; if (!v) return; if (document.hidden || !visible) v.pause(); else v.play().catch(function () {}); }
      document.addEventListener('visibilitychange', sync);
      if (global.IntersectionObserver) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }).observe(container);
    }
    return { destroy: stop };
  }
  global.MGVideo = { mount: mount };
})(window);
