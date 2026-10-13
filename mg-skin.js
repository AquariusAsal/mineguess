/* MineGuess Spielerprofil: Name, Charakter (Steve/Alex) und optionaler Ganzkörper-Skin.
   - Skin: 64x64 oder altes 64x32 PNG. Die Original-Bytes werden unverändert als Data-URL im localStorage
     abgelegt ("mg_skin_full"); kein Canvas-Readback/Re-Encoding (Anti-Fingerprinting-sicher).
   - Kopf-Anzeige in Listen wird per CSS-Ausschnitt (Gesicht + Hut-Layer) aus demselben Skin abgeleitet.
   - Die Datei verlässt das Gerät nicht; nur im Multiplayer wird die normalisierte PNG an den Raum gesendet. */
(function (global) {
  'use strict';
  var KEY_SKIN = 'mg_skin_v2';          // v2: Original-Bytes (ältere, per Canvas neu kodierte Skins werden verworfen)
  try { localStorage.removeItem('mg_skin_full'); localStorage.removeItem('mg_skin_head'); } catch (e) {}
  var KEY_CHAR = 'mg_character';
  var KEY_NAME = 'mg_player_name';
  var MAX_FILE = 256 * 1024;
  var MAX_DATA = 16000;               // Obergrenze der Data-URL (Zeichen), entspricht dem Server-Limit
  var PREFIX = 'data:image/png;base64,';
  var B64 = /^[A-Za-z0-9+\/]+={0,2}$/;
  var STEVE = 'assets/mc/entity/player/wide/steve.png';
  var ALEX = 'assets/mc/entity/player/slim/alex.png';

  function isValid(s) {
    return typeof s === 'string' && s.indexOf(PREFIX) === 0 && s.length <= MAX_DATA + 2000 && s.length > 100 && B64.test(s.slice(PREFIX.length));
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function emit() { try { window.dispatchEvent(new CustomEvent('mg-skin-change')); } catch (e) {} }

  // ── Speicher (alles in try/catch: privater Modus, blockierte Cookies) ──
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  function get() { var s = lsGet(KEY_SKIN); return isValid(s) ? s : null; }          // Ganzkörper-Skin (Data-URL) oder null
  function save(s) { lsSet(KEY_SKIN, s || null); emit(); }
  // Gespeicherten Skin einmal prüfen: verrauschte/beschädigte Skins verwerfen (Standardfigur greift)
  (function purge() {
    var cur = null; try { cur = localStorage.getItem(KEY_SKIN); } catch (e) {}
    if (!cur || !global.MGPng) return;
    var b = global.MGPng.dataUrlBytes(cur);
    if (!b) { lsSet(KEY_SKIN, null); return; }
    global.MGPng.alpha(b).then(function (res) { if (res && !global.MGPng.plausible(res)) save(null); });
  })();
  function getCharacter() { var c = lsGet(KEY_CHAR); return c === 'alex' || c === 'steve' ? c : null; }
  function setCharacter(c) { lsSet(KEY_CHAR, c === 'alex' ? 'alex' : c === 'steve' ? 'steve' : null); emit(); }
  function getName() { return (lsGet(KEY_NAME) || '').slice(0, 20); }
  function setName(n) { lsSet(KEY_NAME, String(n || '').trim().slice(0, 20)); emit(); }
  function defaultSrc(ch) { return ch === 'alex' ? ALEX : STEVE; }

  // ── Kopf-Anzeige: Gesicht (8,8) + Hut-Layer (40,8) aus dem Skin, pixelscharf, synchron ──
  var SIZE = { '': 32, sm: 24, lg: 48, xl: 64 };
  function imgHTML(skin, size, character) {
    var px = SIZE[size || ''] || 32, k = px / 8;
    var src = isValid(skin) ? skin : defaultSrc(character || getCharacter());
    var u = 'url(&quot;' + esc(src) + '&quot;)';
    var st = 'background-image:' + u + ',' + u + ';background-size:' + (64 * k) + 'px auto,' + (64 * k) + 'px auto;' +
             'background-position:' + (-40 * k) + 'px ' + (-8 * k) + 'px,' + (-8 * k) + 'px ' + (-8 * k) + 'px;' +
             'width:' + px + 'px;height:' + px + 'px';
    return '<span class="skin-head ' + (size || '') + '" role="img" aria-label="Spielerkopf" style="' + st + '"></span>';
  }

  // ── Datei -> Skin-Data-URL aus den ORIGINAL-Bytes (kein Canvas-Readback, keine Neukodierung) ──
  function fail(msg) { var e = new Error(msg); e.userMessage = msg; return e; }
  function fromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(fail('Keine Datei ausgewählt.'));
      if (file.size > MAX_FILE) return reject(fail('Die Datei ist zu groß (maximal 256 KB).'));
      var reader = new FileReader();
      reader.onerror = function () { reject(fail('Die Datei konnte nicht gelesen werden.')); };
      reader.onload = function () {
        var bytes = new Uint8Array(reader.result), P = global.MGPng;
        if (!P || !P.isPng(bytes)) return reject(fail('Das ist keine PNG-Datei. Bitte einen Minecraft-Skin als PNG wählen.'));
        var hd = P.header(bytes);
        if (!hd) return reject(fail('Die PNG-Datei ist beschädigt.'));
        if (hd.w !== 64 || (hd.h !== 64 && hd.h !== 32)) {
          return reject(fail('Falsche Größe (' + hd.w + 'x' + hd.h + '). Der Skin muss 64x64 Pixel groß sein.'));
        }
        var maxBytes = Math.floor(MAX_DATA * 3 / 4);
        if (bytes.length > maxBytes) {
          return reject(fail('Der Skin ist zu groß (' + (bytes.length / 1024).toFixed(1).replace('.', ',') + ' KB, erlaubt sind ' + Math.floor(maxBytes / 1024) + ' KB). Bitte eine stärker komprimierte PNG wählen.'));
        }
        P.alpha(bytes).then(function (res) {
          if (res) {
            var vis = false, y, x;
            for (y = 8; y < 16 && !vis; y++) for (x = 8; x < 16; x++) if (res.alpha[y * res.w + x] > 0) { vis = true; break; }
            if (!vis) return reject(fail('Der Skin enthält an der Gesichtsstelle keine sichtbaren Pixel.'));
            if (!P.plausible(res)) return reject(fail('Der Skin sieht verrauscht oder beschädigt aus (zufällige Pixel). Bitte die Original-PNG verwenden.'));
            var opaque = 0; for (var i = 0; i < res.alpha.length; i++) if (res.alpha[i] > 0) opaque++;
            if (opaque < res.w * res.h * 0.05) return reject(fail('Der Skin ist praktisch leer (fast alles transparent).'));
          }
          var out = P.toDataUrl(bytes);
          if (!isValid(out)) return reject(fail('Der Skin konnte nicht verarbeitet werden.'));
          resolve(out);
        });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Upload-UI ──
  function mountUploader(container, opts) {
    opts = opts || {};
    var onChange = opts.onChange || function () {};
    container.classList.add('skin-up');
    container.innerHTML =
      '<div class="skin-up-drop">' +
        '<span id="skin-up-preview"></span>' +
        '<div class="skin-up-text">' +
          '<label class="btn skin-up-btn" for="skin-up-file">Skin wählen</label>' +
          '<input type="file" id="skin-up-file" accept="image/png" class="sr-only">' +
          '<button type="button" class="btn btn-ghost skin-up-clear" id="skin-up-clear">Entfernen</button>' +
          '<p class="skin-up-hint">64x64 Skin-PNG hochladen, wir nutzen den ganzen Skin für deine Figur. Du kannst die Datei auch hierher ziehen. Wird nur im Spiel angezeigt, nicht auf dem Server gespeichert.</p>' +
          '<p class="skin-up-msg" id="skin-up-msg" role="status" aria-live="polite"></p>' +
        '</div>' +
      '</div>';
    var drop = container.querySelector('.skin-up-drop'), prev = container.querySelector('#skin-up-preview');
    var input = container.querySelector('#skin-up-file'), clear = container.querySelector('#skin-up-clear'), msg = container.querySelector('#skin-up-msg');
    function render() {
      prev.innerHTML = imgHTML(get(), 'xl');
      clear.style.display = get() ? '' : 'none';
    }
    function say(t, bad) { msg.textContent = t || ''; msg.className = 'skin-up-msg' + (bad ? ' bad' : ''); }
    function handle(file) {
      fromFile(file).then(function (s) { save(s); render(); say('Skin übernommen.'); onChange(s); },
        function (err) { say(err.userMessage || 'Das hat nicht geklappt.', true); });
    }
    input.addEventListener('change', function () { if (input.files[0]) handle(input.files[0]); input.value = ''; });
    clear.addEventListener('click', function () { save(null); render(); say('Standardfigur wird verwendet.'); onChange(null); });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handle(f); });
    window.addEventListener('mg-skin-change', render);
    render();
  }

  // ── Dialoge: Profil + Charakterwahl ──
  var dlg = null, lastFocus = null, preview = null;
  function trapTab(root, e) {
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(root.querySelectorAll('button, input, [href]'), function (n) { return !n.disabled && n.offsetParent !== null && n.tabIndex !== -1; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function updatePreview() {
    if (!preview && global.MGScene) {
      var host = dlg.querySelector('#mg-profile-preview');
      host.classList.add('mg-preview');
      preview = global.MGScene.createPreview(host, { skin: get(), character: getCharacter() || 'steve' });
    } else if (preview) {
      preview.update({ skin: get(), character: getCharacter() || 'steve' });
    }
  }
  function closeProfile() {
    if (!dlg) return;
    dlg.classList.remove('open');
    if (preview) { preview.destroy(); preview = null; }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function charButtons() {
    var cur = getCharacter();
    return ['steve', 'alex'].map(function (c) {
      return '<button type="button" class="mg-char' + (cur === c ? ' on' : '') + '" data-char="' + c + '" aria-pressed="' + (cur === c) + '">' +
        imgHTML(null, 'lg', c) + '<span>' + (c === 'steve' ? 'Steve' : 'Alex') + '</span></button>';
    }).join('');
  }
  function openProfile(opts) {
    opts = opts || {};
    lastFocus = document.activeElement;
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.id = 'mg-profile';
      dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'mg-profile-title');
      dlg.innerHTML =
        '<div class="mg-profile-card">' +
          '<h2 id="mg-profile-title">Mein Spielerkopf</h2>' +
          '<p class="mg-profile-intro" id="mg-profile-intro"></p>' +
          '<div class="mg-profile-row">' +
            '<div id="mg-profile-preview" aria-label="Vorschau deiner Figur"></div>' +
            '<div class="mg-profile-col">' +
              '<label class="mg-profile-label" for="mg-profile-name">Spielername</label>' +
              '<input id="mg-profile-name" class="mg-profile-input" type="text" maxlength="20" autocomplete="nickname" placeholder="SteveXL">' +
              '<span class="mg-profile-label" id="mg-char-label">Figur</span>' +
              '<div class="mg-chars" role="group" aria-labelledby="mg-char-label" id="mg-chars"></div>' +
            '</div>' +
          '</div>' +
          '<div id="mg-profile-skin"></div>' +
          '<button type="button" class="btn btn-primary btn-block" id="mg-profile-close">Fertig</button>' +
        '</div>';
      document.body.appendChild(dlg);
      mountUploader(dlg.querySelector('#mg-profile-skin'));
      var inp = dlg.querySelector('#mg-profile-name');
      inp.addEventListener('input', function () { setName(inp.value); });
      dlg.querySelector('#mg-char-label');
      dlg.querySelector('#mg-chars').addEventListener('click', function (e) {
        var b = e.target.closest('.mg-char'); if (!b) return;
        setCharacter(b.getAttribute('data-char'));
      });
      dlg.querySelector('#mg-profile-close').addEventListener('click', function () {
        closeProfile(); if (dlg.__after) { var cb = dlg.__after; dlg.__after = null; cb(); }
      });
      dlg.addEventListener('click', function (e) { if (e.target === dlg && !dlg.__required) closeProfile(); });
      document.addEventListener('keydown', function (e) {
        if (!dlg.classList.contains('open')) return;
        if (e.key === 'Escape' && !dlg.__required) { closeProfile(); return; }
        trapTab(dlg, e);
      });
      window.addEventListener('mg-skin-change', function () {
        if (!dlg.classList.contains('open')) return;
        dlg.querySelector('#mg-chars').innerHTML = charButtons();
        updatePreview();
      });
    }
    dlg.__required = !!opts.requireCharacter;
    dlg.__after = opts.after || null;
    dlg.querySelector('#mg-profile-intro').textContent = (opts.requireCharacter || !getCharacter())
      ? 'Wähle deine Figur: Steve oder Alex. Du kannst sie später im Spielerprofil ändern.'
      : 'Name, Figur und optional dein eigener Skin. Das gilt für Gäste und angemeldete Spieler.';
    dlg.querySelector('#mg-profile-name').value = getName();
    dlg.querySelector('#mg-chars').innerHTML = charButtons();
    dlg.classList.add('open');
    updatePreview();
    dlg.querySelector('#mg-profile-name').focus();
  }
  /** Fragt beim ersten Mal nach der Figur (Gäste und neue Konten); ruft danach cb auf. */
  function ensureCharacter(cb) {
    if (getCharacter()) { if (cb) cb(); return; }
    openProfile({ requireCharacter: true, after: function () { if (!getCharacter()) setCharacter('steve'); if (cb) cb(); } });
  }

  /** Kopf-Chip (Vorschau + Name) in einen Container setzen; öffnet das Profil. */
  function mountChip(container, opts) {
    opts = opts || {};
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mg-chip' + (opts.className ? ' ' + opts.className : '');
    b.setAttribute('aria-label', 'Mein Spielerkopf: Profil öffnen');
    function render() {
      var n = getName();
      b.innerHTML = imgHTML(get(), 'sm') + '<span class="mg-chip-label">' + esc(n || 'Mein Spielerkopf') + '</span>';
    }
    b.addEventListener('click', function () { openProfile(); });
    window.addEventListener('mg-skin-change', render);
    render();
    container.appendChild(b);
    return b;
  }

  global.MGSkin = {
    get: get, save: save, isValid: isValid, fromFile: fromFile, imgHTML: imgHTML,
    getCharacter: getCharacter, setCharacter: setCharacter, ensureCharacter: ensureCharacter,
    getName: getName, setName: setName, openProfile: openProfile, mountChip: mountChip, mountUploader: mountUploader,
    defaultSrc: defaultSrc
  };
})(window);
