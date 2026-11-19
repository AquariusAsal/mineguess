/* MineGuess Musik-Insel: Notenblock-Knopf klappt eine kompakte "Insel" mit dem offiziellen Spotify-Embed auf.
   - Der iframe wird erst NACH dem ersten Klick geladen (Click-to-load, kein Request beim Seitenaufruf).
   - Einklappen versteckt die Insel nur; die Musik läuft weiter (iframe bleibt im DOM).
   - Link aus window.MG_SPOTIFY_URL (spotify-config.js). Keine Audiodateien. */
(function (global) {
  'use strict';
  var island = null, btn = null, loaded = false;

  function toEmbed(url) {
    url = String(url || '').trim();
    if (!url) return '';
    var m = url.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)$/);
    if (m) return 'https://open.spotify.com/embed/' + m[1] + '/' + m[2];
    try {
      var u = new URL(url);
      if (u.hostname !== 'open.spotify.com') return '';
      var p = u.pathname.replace(/^\/(intl-[a-z]+\/)?/, '/');
      if (p.indexOf('/embed/') === 0) return 'https://open.spotify.com' + p;
      if (/^\/(track|album|playlist|artist|episode|show)\/[A-Za-z0-9]+/.test(p)) return 'https://open.spotify.com/embed' + p;
    } catch (e) {}
    return '';
  }

  function build() {
    island = document.createElement('div');
    island.className = 'mg-island closed';
    island.setAttribute('role', 'dialog');
    island.setAttribute('aria-label', 'Musik');
    island.innerHTML =
      '<div class="mg-island-head"><span>Musik</span>' +
      '<button type="button" class="mg-close" aria-label="Schließen"></button></div>' +
      '<div class="mg-island-body"></div>' +
      '<div class="mg-island-vol"><label for="mg-sp-vol">Lautstärke Spiel-Töne</label><div class="mg-sp-volrow"><input type="range" id="mg-sp-vol" min="0" max="100" step="5" aria-describedby="mg-sp-volnote"><label class="mg-sp-mute"><input type="checkbox" id="mg-sp-mute"> Ton aus</label></div>' +
      '<p class="mg-island-note" id="mg-sp-volnote">Die Lautstärke der Spotify-Musik regelst du im Player selbst (Lautsprecher-Symbol) oder mit der Geräte-Lautstärke. Der Spotify-Player lässt sich von außen nicht leiser stellen.</p></div>' +
      '<p class="mg-island-note">Lädt Inhalte von Spotify. Dabei werden Daten (z. B. IP-Adresse) an Spotify übertragen.</p>';
    document.body.appendChild(island);
    island.querySelector('.mg-close').addEventListener('click', close);
    var vol = island.querySelector('#mg-sp-vol'), mute = island.querySelector('#mg-sp-mute');
    function syncVol() { try { vol.value = Math.round((global.MGAudio && MGAudio.getVolume ? MGAudio.getVolume() : 1) * 100); mute.checked = !!(global.MGAudio && MGAudio.isOn && !MGAudio.isOn()); } catch (e) {} }
    syncVol(); island.__sync = syncVol;
    vol.addEventListener('input', function () { if (global.MGAudio) MGAudio.setVolume(vol.value / 100); });
    vol.addEventListener('change', function () { if (global.MGAudio && !mute.checked) MGAudio.play('correct'); });
    mute.addEventListener('change', function () { if (global.MGAudio) MGAudio.setOn(!mute.checked); var sb = document.getElementById('sound-toggle'); if (sb) sb.className = 'sound-btn' + (!mute.checked ? ' on' : ''); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close(); });
    document.addEventListener('pointerdown', function (e) {
      if (isOpen() && !island.contains(e.target) && !(btn && btn.contains(e.target))) close();
    });
  }
  function isOpen() { return island && !island.classList.contains('closed'); }
  var ctrl = null;
  function fmt(ms) { var t = Math.max(0, Math.floor(ms / 1000)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function uriOf(embed) { var m = embed.match(/embed[/]([a-z]+)[/]([A-Za-z0-9]+)/); return m ? 'spotify:' + m[1] + ':' + m[2] : ''; }
  function fill() {
    if (loaded) return;
    loaded = true;
    var body = island.querySelector('.mg-island-body'), src = toEmbed(global.MG_SPOTIFY_URL), uri = uriOf(src);
    if (!src || !uri) {
      body.innerHTML = '<p>Noch keine Musik hinterlegt. Hier kann ein Spotify-Link eingebunden werden.</p>' +
        '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://open.spotify.com/search/C418%20Minecraft">In Spotify suchen: C418 Minecraft</a>';
      return;
    }
    // Mini-Player: eigene Bedienelemente (Play/Pause, Fortschritt) ueber die Spotify iFrame API.
    // Skip und Like bietet der Embed nicht; sie werden bewusst nicht angezeigt.
    body.innerHTML = '<div class="mg-sp-host"><div id="mg-sp-embed"></div></div>' +
      '<div class="mg-sp-controls"><button type="button" class="btn mg-sp-play" disabled aria-label="Wiedergabe">Play</button>' +
      '<div class="mg-sp-prog" role="progressbar" aria-label="Fortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>' +
      '<span class="mg-sp-time">0:00</span></div>';
    var play = body.querySelector('.mg-sp-play'), bar = body.querySelector('.mg-sp-prog i'), time = body.querySelector('.mg-sp-time'),
        pb = body.querySelector('.mg-sp-prog');
    global.onSpotifyIframeApiReady = function (API) {
      API.createController(document.getElementById('mg-sp-embed'), { uri: uri, width: '100%', height: 152 }, function (c) {
        ctrl = c; play.disabled = false;
        c.addListener('playback_update', function (e) {
          var d = e.data || {}, pct = d.duration ? Math.min(100, d.position / d.duration * 100) : 0;
          play.textContent = d.isPaused ? 'Play' : 'Pause';
          play.setAttribute('aria-label', d.isPaused ? 'Wiedergabe' : 'Pause');
          bar.style.width = pct + '%'; pb.setAttribute('aria-valuenow', Math.round(pct));
          time.textContent = fmt(d.position || 0);
        });
      });
    };
    play.addEventListener('click', function () { if (ctrl) ctrl.togglePlay(); });
    var sc = document.createElement('script'); sc.src = 'https://open.spotify.com/embed/iframe-api/v1'; sc.async = true;
    sc.onerror = function () { body.innerHTML = '<p>Der Spotify-Player konnte nicht geladen werden.</p>'; };
    document.body.appendChild(sc);
  }
  function open() { if (!island) build(); if (island.__sync) island.__sync(); fill(); island.classList.remove('closed'); if (btn) btn.setAttribute('aria-expanded', 'true'); }
  function close() { if (island) island.classList.add('closed'); if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); } }
  function toggle() { if (isOpen()) close(); else open(); }

  function mount(container) {
    var b0 = document.createElement('button'); btn = b0;
    btn.type = 'button';
    btn.className = 'mg-chip mg-music compact';
    btn.setAttribute('aria-label', 'Musik öffnen (Spotify)');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = (global.MGIcon ? global.MGIcon.html('ui.sound', 24, '') : '') + '<span class="mg-chip-label">Musik</span>';
    b0.addEventListener('click', function () { btn = b0; toggle(); });
    container.appendChild(b0);
  }
  global.MGSpotify = { mount: mount, open: open, close: close, toEmbed: toEmbed };
})(window);
