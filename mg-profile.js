/* MineGuess Profilseite: Kategorie-Radar, MMR-Verlauf, Kennzahlen, Abzeichen-Album. Nur lokale Daten (MGBadges, rankedEnsure). */
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(x) { return Math.round(x * 100) + ' %'; }
  function fmtDate(d) { var p = String(d || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ''; }

  function radar(stats) {
    var cats = stats.slice(0, 8);
    if (cats.length < 3) return '<p class="pf-empty">Spiele mehr Fragen in mindestens drei Kategorien, dann erscheint dein Radar.</p>';
    var S = 300, c = S / 2, R = 88, n = cats.length;
    function pt(i, f) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * R * f, c + Math.sin(a) * R * f]; }
    var g = '';
    [0.25, 0.5, 0.75, 1].forEach(function (f) { g += '<polygon class="pf-grid" points="' + cats.map(function (_, i) { return pt(i, f).join(','); }).join(' ') + '"/>'; });
    cats.forEach(function (_, i) { var p = pt(i, 1); g += '<line class="pf-grid" x1="' + c + '" y1="' + c + '" x2="' + p[0] + '" y2="' + p[1] + '"/>'; });
    g += '<polygon class="pf-area" points="' + cats.map(function (k, i) { return pt(i, Math.max(0.03, k.rate)).join(','); }).join(' ') + '"/>';
    cats.forEach(function (k, i) {
      var p = pt(i, 1.2), a = p[0] < c - 6 ? 'end' : p[0] > c + 6 ? 'start' : 'middle';
      g += '<text class="pf-lbl" x="' + p[0] + '" y="' + p[1] + '" text-anchor="' + a + '" dominant-baseline="middle">' + esc(k.category.length > 14 ? k.category.slice(0, 13) + '.' : k.category) + '</text>';
    });
    var desc = cats.map(function (k) { return k.category + ' ' + pct(k.rate); }).join(', ');
    return '<svg class="pf-radar" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="Trefferquote je Kategorie: ' + esc(desc) + '">' + g + '</svg>' +
      '<ul class="pf-catlist">' + cats.map(function (k) { return '<li><span>' + esc(k.category) + '</span><b>' + pct(k.rate) + '</b> <small>(' + k.correct + '/' + k.total + ')</small></li>'; }).join('') + '</ul>';
  }

  function mmrChart(hist) {
    if (!hist || hist.length < 2) return '<p class="pf-empty">Der Verlauf erscheint nach zwei abgeschlossenen Ranked-Läufen.</p>';
    var W = 320, H = 120, pad = 14, v = hist.map(function (h) { return h.mmr; });
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v); if (hi === lo) { hi++; lo--; }
    var pts = hist.map(function (h, i) { return [pad + i * (W - 2 * pad) / (hist.length - 1), H - pad - (h.mmr - lo) / (hi - lo) * (H - 2 * pad)]; });
    return '<svg class="pf-line" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="MMR-Verlauf der letzten ' + hist.length + ' Läufe, von ' + v[0] + ' auf ' + v[v.length - 1] + '">' +
      '<polyline class="pf-path" points="' + pts.map(function (p) { return p.join(','); }).join(' ') + '"/>' +
      pts.map(function (p) { return '<circle class="pf-dot" cx="' + p[0] + '" cy="' + p[1] + '" r="3"/>'; }).join('') +
      '<text class="pf-lbl" x="' + pad + '" y="10">' + hi + '</text><text class="pf-lbl" x="' + pad + '" y="' + (H - 2) + '">' + lo + '</text></svg>';
  }

  function stat(label, val) { return '<div class="pf-stat"><b>' + esc(val) + '</b><span>' + esc(label) + '</span></div>'; }

  function card(a) {
    var pr = a.progress || {}, pc = pr.target ? Math.min(100, Math.round(pr.value / pr.target * 100)) : 0;
    return '<div class="badge-item r-' + a.rarity + ' ' + (a.unlocked ? 'earned' : 'locked') + '">' +
      '<div class="bi-icon">' + (root.MGIcon ? MGIcon.tex(a.texture, 32, '') : '') + '</div>' +
      '<div class="bi-name">' + esc(a.name) + '</div><div class="bi-rarity">' + esc(a.rarityLabel) + '</div>' +
      '<div class="bi-desc">' + (a.unlocked ? '' : 'Bedingung: ') + esc(a.desc) + '</div>' +
      (a.unlocked ? '<div class="bi-prog">' + (a.date ? 'Freigeschaltet am ' + fmtDate(a.date) : 'Freigeschaltet') + '</div>'
        : (a.countable ? '<div class="bi-bar" role="img" aria-label="Fortschritt ' + pr.value + ' von ' + pr.target + '"><i style="width:' + pc + '%"></i></div><div class="bi-prog">' + Math.min(pr.value, pr.target) + ' / ' + pr.target + '</div>' : '<div class="bi-prog">Gesperrt</div>')) +
      '</div>';
  }

  var last = null;
  function open() {
    var B = root.MGBadges; if (!B) return;
    var sum = B.summary(), alb = B.album().slice().sort(function (a, b) { return (Number(b.unlocked) - Number(a.unlocked)) || (b.rarityRank - a.rarityRank); });
    var hist = []; try { hist = (root.rankedEnsure && root.rankedEnsure().history) || []; } catch (e) {}
    var m = document.getElementById('profile-modal');
    if (!m) {
      m = document.createElement('div'); m.id = 'profile-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Profil'); document.body.appendChild(m);
      m.addEventListener('click', function (e) { if (e.target === m) close(); });
    }
    m.innerHTML = '<div class="pf-box"><button type="button" class="mg-close mg-close-abs" aria-label="Schließen" id="pf-close"></button>' +
      '<h2>Profil</h2>' +
      '<div class="pf-stats">' + stat('Spiele', sum.played) + stat('Antworten', sum.answered) + stat('Trefferquote', pct(sum.rate)) + stat('Beste Serie', sum.bestStreak) +
        stat('Tages-Serie', sum.dailyStreak) + stat('Blitz-Bestwert', sum.blitzBest) + stat('Ranked-Läufe', sum.rankedGames) + stat('Höchste MMR', sum.peakMmr) + '</div>' +
      '<h3>Kategorien</h3>' + radar(B.categoryStats()) +
      '<h3>MMR-Verlauf (letzte ' + Math.min(30, hist.length) + ' Läufe)</h3>' + mmrChart(hist) +
      '<h3>Abzeichen-Album (' + sum.badgesEarned + '/' + sum.badgesTotal + ')</h3><div class="pf-album">' + alb.map(card).join('') + '</div>' +
      '<div class="pf-actions"><button type="button" class="btn" id="pf-share">Karte teilen</button><button type="button" class="btn" id="pf-close2">Schließen</button></div></div>';
    m.classList.add('show'); last = document.activeElement;
    document.getElementById('pf-close').onclick = document.getElementById('pf-close2').onclick = close;
    document.getElementById('pf-share').onclick = function () {
      var t = 'MineGuess: ' + sum.answered + ' Antworten, ' + pct(sum.rate) + ' richtig, beste Serie ' + sum.bestStreak + ', ' + sum.badgesEarned + '/' + sum.badgesTotal + ' Abzeichen.';
      if (navigator.share) navigator.share({ text: t }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { document.getElementById('pf-share').textContent = 'Kopiert'; });
    };
    document.getElementById('pf-close').focus();
  }
  function close() { var m = document.getElementById('profile-modal'); if (m) m.classList.remove('show'); if (last && last.focus) last.focus(); }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var m = document.getElementById('profile-modal');
    if (m && m.classList.contains('show')) { e.stopPropagation(); close(); }
  }, true);
  root.MGProfile = { open: open, close: close };
})(window);
