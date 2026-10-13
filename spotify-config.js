/* MineGuess: Spotify-Link für die Musik-Insel (Notenblock im Header).
   So bekommst du den Link:
     1. In Spotify (App oder open.spotify.com) den gewünschten Song, das Album oder die Playlist öffnen
        (z. B. C418 – Minecraft, Album "Minecraft - Volume Alpha").
     2. Teilen -> "Link kopieren".
     3. Hier unten zwischen die Anführungszeichen einfügen. Normale open.spotify.com-Links werden
        automatisch in die /embed/-Form umgewandelt.
   Leer lassen = die Insel zeigt nur einen "In Spotify suchen"-Knopf.
   Beispiel: 'https://open.spotify.com/album/XXXXXXXXXXXXXXXXXXXXXX' */
// Standard: MineGuess-Playlist. Eigenen Link hier eintragen, um sie zu ersetzen.
window.MG_SPOTIFY_URL = 'https://open.spotify.com/playlist/7Js97HGm16FWMfZJVYI1Re';
/* Hinweis: Mini-Player nutzt die Spotify iFrame API (Play/Pause, Fortschritt). Skip/Like sind ueber den Embed
   technisch nicht moeglich; das ginge nur mit Spotify Web API/Playback SDK, einer eigenen Client-ID und Spotify-Premium-Login. */

/* Lautstärke: Die Spotify iFrame API (Embed) bietet KEINEN Lautstärkeregler (nur togglePlay/pause/resume/seek/loadUri).
   Die Musik-Lautstärke regelt man im Embed selbst bzw. am Gerät. Ein eigener Regler wäre nur mit dem Spotify Web
   Playback SDK möglich (eigene Client-ID + Spotify-Premium-Login des Nutzers). Optional vorgesehen, derzeit ungenutzt: */
window.MG_SPOTIFY_CLIENT_ID = '';
