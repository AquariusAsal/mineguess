/* MineGuess Sound: EIN Modul, WebAudio-Buffer vorgeladen, Autoplay-Freischaltung beim ersten Klick/Taste.
   Mute über localStorage 'mg_sound' (gemeinsam mit dem Sound-Button). Gleicher Sound überlappt nie. */
(function (global) {
  'use strict';
  var FILES = {
    correct: { src: 'sounds/orb.mp3', vol: 0.5 },
    wrong:   { src: 'sounds/anvil-drop.mp3', vol: 0.45 },
    joker:   { src: 'sounds/totem.mp3', vol: 0.6 },
    rankup:  { src: 'sounds/rare-achievement.mp3', vol: 0.6 },
    bell:    { src: 'sounds/bell.mp3', vol: 0.8 }
  };
  var ctx = null, started = false, buffers = {}, current = {};

  function AC() { return global.AudioContext || global.webkitAudioContext; }
  function isOn() { try { return JSON.parse(localStorage.getItem('mg_sound') || 'true'); } catch (e) { return true; } }
  function setOn(v) {
    try { localStorage.setItem('mg_sound', JSON.stringify(!!v)); } catch (e) {}
    if (!v) Object.keys(current).forEach(function (k) { try { current[k].stop(); } catch (e) {} });
  }
  function load() {
    if (started || !AC()) return;
    started = true;
    try { ctx = new (AC())(); } catch (e) { ctx = null; return; }
    Object.keys(FILES).forEach(function (k) {
      fetch(FILES[k].src).then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
        .then(function (b) { buffers[k] = b; }).catch(function () {});
    });
  }
  function unlock() { load(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {}); }
  function play(name) {
    if (!isOn()) return;
    unlock();
    var f = FILES[name], b = buffers[name];
    if (!f || !b || !ctx) return;
    try {
      if (current[name]) { try { current[name].stop(); } catch (e) {} }
      var src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = b; g.gain.value = f.vol;
      src.connect(g); g.connect(ctx.destination);
      src.onended = function () { if (current[name] === src) delete current[name]; };
      current[name] = src; src.start(0);
    } catch (e) {}
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    global.addEventListener(ev, unlock, { once: true, passive: true });
  });
  load();
  global.MGAudio = { play: play, isOn: isOn, setOn: setOn, unlock: unlock };
})(window);
