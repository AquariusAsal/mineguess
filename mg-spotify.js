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
      '<button type="button" class="mg-island-close" aria-label="Musik-Insel schließen">Schließen</button></div>' +
      '<div class="mg-island-body"></div>' +
      '<p class="mg-island-note">Lädt Inhalte von Spotify. Dabei werden Daten (z. B. IP-Adresse) an Spotify übertragen.</p>';
    document.body.appendChild(island);
    island.querySelector('.mg-island-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close(); });
    document.addEventListener('pointerdown', function (e) {
      if (isOpen() && !island.contains(e.target) && !(btn && btn.contains(e.target))) close();
    });
  }
  function isOpen() { return island && !island.classList.contains('closed'); }
  function fill() {
    if (loaded) return;
    loaded = true;
    var body = island.querySelector('.mg-island-body'), src = toEmbed(global.MG_SPOTIFY_URL);
    if (src) {
      var f = document.createElement('iframe');
      f.src = src; f.width = '100%'; f.height = '152'; f.title = 'Spotify-Player';
      f.setAttribute('frameborder', '0'); f.setAttribute('loading', 'lazy');
      f.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
      body.appendChild(f);
    } else {
      body.innerHTML = '<p>Noch keine Musik hinterlegt. Hier kann ein Spotify-Link eingebunden werden.</p>' +
        '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://open.spotify.com/search/C418%20Minecraft">In Spotify suchen: C418 Minecraft</a>';
    }
  }
  function open() { if (!island) build(); fill(); island.classList.remove('closed'); if (btn) btn.setAttribute('aria-expanded', 'true'); }
  function close() { if (island) island.classList.add('closed'); if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); } }
  function toggle() { if (isOpen()) close(); else open(); }

  function mount(container) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mg-chip mg-music compact';
    btn.setAttribute('aria-label', 'Musik öffnen (Spotify)');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = (global.MGIcon ? global.MGIcon.html('ui.sound', 24, '') : '') + '<span class="mg-chip-label">Musik</span>';
    btn.addEventListener('click', toggle);
    container.appendChild(btn);
  }
  global.MGSpotify = { mount: mount, open: open, close: close, toEmbed: toEmbed };
})(window);
