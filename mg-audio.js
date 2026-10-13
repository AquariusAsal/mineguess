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
  // Countdown 3-2-1-Los: notenblock-aehnlicher Ton. Liegt sounds/note-harp.mp3 (ein einzelner Notenblock-Ton,
  // Grundton NOTE_BASE_HZ) im Projekt, wird er per playbackRate auf die Tonhoehe verschoben, sonst synthetisiert.
  var NOTE_BASE_HZ = 369.99;                       // F#4: Tonhoehe der Datei sounds/note-harp.mp3
  var STEPS = [369.99, 440, 554.37, 739.99];       // 3 = F#4, 2 = A4, 1 = C#5, Los = F#5
  var harp = null, harpTried = false, lastNote = null;
  function loadHarp() {
    if (harpTried || !ctx) return;
    harpTried = true;
    fetch('sounds/note-harp.mp3').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
      .then(function (b) { harp = b; }).catch(function () {});
  }
  function countdown(i) {
    if (!isOn()) return;
    unlock(); loadHarp();
    if (!ctx) return;
    var f = STEPS[Math.max(0, Math.min(3, i))], go = i >= 3, t = ctx.currentTime;
    try {
      if (lastNote) { try { lastNote.stop(); } catch (e) {} }   // kein Ueberlappen
      var g = ctx.createGain(), dur = go ? 0.4 : 0.22;
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(go ? 0.55 : 0.45, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (harp) {
        var s = ctx.createBufferSource(); s.buffer = harp; s.playbackRate.value = f / NOTE_BASE_HZ;
        s.connect(g); s.start(t); s.stop(t + dur + 0.05); lastNote = s;
      } else {
        // Harp-Charakter: kurzer Anschlag, Dreieck + Sinus-Oberton (2x), schnelles Ausklingen
        var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o1.type = 'triangle'; o1.frequency.value = f;
        o2.type = 'sine'; o2.frequency.value = f * 2; g2.gain.value = 0.35;
        o1.connect(g); o2.connect(g2); g2.connect(g);
        o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
        lastNote = o1;
      }
    } catch (e) {}
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    global.addEventListener(ev, unlock, { once: true, passive: true });
  });
  load();
  global.MGAudio = { play: play, isOn: isOn, setOn: setOn, unlock: unlock, countdown: countdown };
})(window);
