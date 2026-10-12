/* MineGuess Skin-Kopf: schneidet clientseitig Gesicht + Hut-Layer aus einem 64x64-Skin (PNG).
   Ergebnis ist ein 8x8-PNG als data-URL (wenige hundert Bytes). Es wird nie als Datei hochgeladen,
   nur der kleine Kopf wird (optional) per Socket an Mitspieler gesendet. */
(function (global) {
  'use strict';
  var KEY = 'mg_skin_head';
  var MAX_BYTES = 256 * 1024;
  var PREFIX = 'data:image/png;base64,';
  var B64 = /^[A-Za-z0-9+\/]+={0,2}$/;

  function isValid(s) {
    return typeof s === 'string' && s.indexOf(PREFIX) === 0 && s.length <= 2000 && B64.test(s.slice(PREFIX.length));
  }

  // Standardkopf: neutrale eigene Pixel-Grafik (kein Minecraft-Charakter)
  var defaultHead = (function () {
    try {
      var c = document.createElement('canvas'); c.width = 8; c.height = 8;
      var x = c.getContext('2d');
      var base = '#7f9aa8', band = '#4d6470', eye = '#15171a';
      x.fillStyle = base; x.fillRect(0, 0, 8, 8);
      x.fillStyle = band; x.fillRect(0, 0, 8, 2);
      x.fillStyle = eye; x.fillRect(1, 4, 2, 2); x.fillRect(5, 4, 2, 2);
      return c.toDataURL('image/png');
    } catch (e) { return ''; }
  })();

  function get() {
    try { var s = localStorage.getItem(KEY); return isValid(s) ? s : null; } catch (e) { return null; }
  }
  function save(s) {
    try { if (s) localStorage.setItem(KEY, s); else localStorage.removeItem(KEY); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('mg-skin-change')); } catch (e) {}
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  /** Sicheres <img>-HTML für Spielerlisten; fällt auf Standardkopf zurück. */
  function imgHTML(skin, size) {
    var src = isValid(skin) ? skin : defaultHead;
    return '<img class="skin-head ' + (size || '') + '" src="' + esc(src) + '" alt="" width="32" height="32">';
  }

  function fail(msg) { var e = new Error(msg); e.userMessage = msg; return e; }

  /** Datei -> Promise<8x8-data-URL>. Wirft Error mit deutscher userMessage. */
  function fromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(fail('Keine Datei ausgewählt.'));
      if (file.size > MAX_BYTES) return reject(fail('Die Datei ist zu groß (maximal 256 KB).'));
      var reader = new FileReader();
      reader.onerror = function () { reject(fail('Die Datei konnte nicht gelesen werden.')); };
      reader.onload = function () {
        var buf = new Uint8Array(reader.result);
        var magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        for (var i = 0; i < magic.length; i++) {
          if (buf[i] !== magic[i]) return reject(fail('Das ist keine PNG-Datei. Bitte einen Minecraft-Skin als PNG wählen.'));
        }
        var url = URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
        var img = new Image();
        img.onerror = function () { URL.revokeObjectURL(url); reject(fail('Das Bild konnte nicht geladen werden.')); };
        img.onload = function () {
          URL.revokeObjectURL(url);
          var w = img.naturalWidth, h = img.naturalHeight;
          if (w !== 64 || (h !== 64 && h !== 32)) {
            return reject(fail('Falsche Größe (' + w + 'x' + h + '). Der Skin muss 64x64 Pixel groß sein.'));
          }
          var c = document.createElement('canvas'); c.width = 8; c.height = 8;
          var x = c.getContext('2d'); x.imageSmoothingEnabled = false;
          x.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);      // Gesicht
          x.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);     // Hut-Layer (Transparenz bleibt erhalten)
          var px = x.getImageData(0, 0, 8, 8).data, vis = false;
          for (var j = 3; j < px.length; j += 4) { if (px[j] > 0) { vis = true; break; } }
          if (!vis) return reject(fail('Der Skin enthält an der Kopfstelle keine sichtbaren Pixel.'));
          var out = c.toDataURL('image/png');
          if (!isValid(out)) return reject(fail('Der Kopf konnte nicht erzeugt werden.'));
          resolve(out);
        };
        img.src = url;
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /** Baut Upload-UI (Datei-Input + Drag&Drop + Vorschau) in einen Container. */
  function mountUploader(container, opts) {
    opts = opts || {};
    var onChange = opts.onChange || function () {};
    container.classList.add('skin-up');
    container.innerHTML =
      '<div class="skin-up-drop" tabindex="-1">' +
        '<img class="skin-head xl" id="skin-up-preview" alt="Vorschau deines Spielerkopfs" width="64" height="64">' +
        '<div class="skin-up-text">' +
          '<label class="btn skin-up-btn" for="skin-up-file">Skin wählen</label>' +
          '<input type="file" id="skin-up-file" accept="image/png" class="sr-only">' +
          '<button type="button" class="btn btn-ghost skin-up-clear" id="skin-up-clear">Entfernen</button>' +
          '<p class="skin-up-hint">64x64 Skin-PNG hochladen, wir nutzen nur den Kopf. Du kannst die Datei auch hierher ziehen. Wird nur im Spiel angezeigt, nicht auf dem Server gespeichert.</p>' +
          '<p class="skin-up-msg" id="skin-up-msg" role="status" aria-live="polite"></p>' +
        '</div>' +
      '</div>';
    var drop = container.querySelector('.skin-up-drop');
    var prev = container.querySelector('#skin-up-preview');
    var input = container.querySelector('#skin-up-file');
    var clear = container.querySelector('#skin-up-clear');
    var msg = container.querySelector('#skin-up-msg');

    function render() {
      var s = get();
      prev.src = s || defaultHead;
      clear.style.display = s ? '' : 'none';
    }
    function say(t, bad) { msg.textContent = t || ''; msg.className = 'skin-up-msg' + (bad ? ' bad' : ''); }
    function handle(file) {
      fromFile(file).then(function (head) {
        save(head); render(); say('Kopf übernommen.'); onChange(head);
      }, function (err) { say(err.userMessage || 'Das hat nicht geklappt.', true); });
    }
    input.addEventListener('change', function () { if (input.files[0]) handle(input.files[0]); input.value = ''; });
    clear.addEventListener('click', function () { save(null); render(); say('Standardkopf wird verwendet.'); onChange(null); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handle(f);
    });
    render();
  }


  // ── Spielerprofil (Name + Kopf), gilt für Gäste und angemeldete Nutzer ──
  var NAME_KEY = 'mg_player_name';
  function getName() { try { return (localStorage.getItem(NAME_KEY) || '').slice(0, 20); } catch (e) { return ''; } }
  function setName(n) {
    try { localStorage.setItem(NAME_KEY, String(n || '').trim().slice(0, 20)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('mg-skin-change')); } catch (e) {}
  }

  var dlg = null, lastFocus = null;
  function closeProfile() {
    if (!dlg) return;
    dlg.classList.remove('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function openProfile() {
    lastFocus = document.activeElement;
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.id = 'mg-profile';
      dlg.setAttribute('role', 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      dlg.setAttribute('aria-labelledby', 'mg-profile-title');
      dlg.innerHTML =
        '<div class="mg-profile-card">' +
          '<h2 id="mg-profile-title">Mein Spielerkopf</h2>' +
          '<label class="mg-profile-label" for="mg-profile-name">Spielername</label>' +
          '<input id="mg-profile-name" class="mg-profile-input" type="text" maxlength="20" autocomplete="nickname" placeholder="SteveXL">' +
          '<div id="mg-profile-skin"></div>' +
          '<button type="button" class="btn btn-primary btn-block" id="mg-profile-close">Fertig</button>' +
        '</div>';
      document.body.appendChild(dlg);
      mountUploader(dlg.querySelector('#mg-profile-skin'));
      var inp = dlg.querySelector('#mg-profile-name');
      inp.addEventListener('input', function () { setName(inp.value); });
      dlg.querySelector('#mg-profile-close').addEventListener('click', closeProfile);
      dlg.addEventListener('click', function (e) { if (e.target === dlg) closeProfile(); });
      document.addEventListener('keydown', function (e) {
        if (!dlg.classList.contains('open')) return;
        if (e.key === 'Escape') { closeProfile(); return; }
        if (e.key !== 'Tab') return;
        var f = Array.prototype.filter.call(dlg.querySelectorAll('button, input, [href], label.btn'), function (n) { return !n.disabled && n.offsetParent !== null && n.tabIndex !== -1; });
        // label.btn ist nicht fokussierbar; der sr-only Datei-Input übernimmt den Fokus
        f = f.filter(function (n) { return n.tagName !== 'LABEL'; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }
    dlg.querySelector('#mg-profile-name').value = getName();
    dlg.classList.add('open');
    dlg.querySelector('#mg-profile-name').focus();
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
    b.addEventListener('click', openProfile);
    window.addEventListener('mg-skin-change', render);
    render();
    container.appendChild(b);
    return b;
  }

  global.MGSkin = { get: get, save: save, isValid: isValid, fromFile: fromFile, imgHTML: imgHTML,
                    defaultHead: defaultHead, mountUploader: mountUploader,
                    getName: getName, setName: setName, openProfile: openProfile, mountChip: mountChip };
})(window);
