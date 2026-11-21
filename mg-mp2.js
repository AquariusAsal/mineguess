/* MineGuess Multiplayer Phase 2 (laedt nach dem Haupt-Skript von multiplayer.html, nutzt dessen Globals: socket, el, esc, showToast, myId, myRoomId, hostId, lastPlayers, currentQ).
   - Rundenuebersicht (game_over.history / get_round_overview), Host-Report (host_report / get_host_report)
   - Teams: Host-Einstellungen, Zuordnung in der Lobby, Team-Rangliste live, Team-Podium; Symbol + Name + Farbe (nie Farbe allein)
   - Bau-Runde: Host-Einstellung build off|mix|only, gleichzeitiges Bauen (mg-craft-build.js), Pruefung am Server (build_check/build_result), Zeitrang-Anzeige */
(function () {
  'use strict';
  var SYM = { schwert: ['item/iron_sword', 'Schwert'], spitzhacke: ['item/iron_pickaxe', 'Spitzhacke'], schild: ['item/iron_chestplate', 'Schild'], bogen: ['item/bow', 'Bogen'], apfel: ['item/apple', 'Apfel'], diamant: ['item/diamond', 'Diamant'],
    smaragd: ['item/emerald', 'Smaragd'], totem: ['item/totem_of_undying', 'Totem'], creeper: ['item/gunpowder', 'Creeper'], tnt: ['block/tnt_side', 'TNT'], fackel: ['block/torch', 'Fackel'], herz: ['gui/heart_full', 'Herz'] };
  var COL = { rot: ['#e5604d', 'Rot'], blau: ['#4f9bd9', 'Blau'], gruen: ['#6cbf3c', 'Grün'], gelb: ['#e8b93a', 'Gelb'], lila: ['#a37be0', 'Lila'], orange: ['#f08a2c', 'Orange'], tuerkis: ['#2fbfae', 'Türkis'], pink: ['#ee7fb7', 'Pink'] };
  var TEAM_ERR = { host: 'Nur der Host darf das.', phase: 'Das geht nur in der Lobby.', count: 'Anzahl der Teams ungültig.', name: 'Teamname nicht erlaubt.', symbol: 'Symbol ungültig.', color: 'Farbe ungültig.', duplicate: 'Name, Symbol und Farbe müssen je Team verschieden sein.' };
  var S = { teams: null, scores: [], settings: {}, history: null, report: null, built: [], phase: '' };
  var $ = function (id) { return document.getElementById(id); };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function ico(p, n) { return '<img class="tm-ico" src="assets/mc/' + p + '.png" width="' + (n || 20) + '" height="' + (n || 20) + '" alt="">'; }
  function chip(t) {
    if (!t) return '';
    var s = SYM[t.symbol] || SYM.schwert, c = COL[t.color] || COL.rot;
    return '<span class="tm-chip" style="--tc:' + c[0] + '" title="' + E(t.name) + '">' + ico(s[0]) + '<span>' + E(t.name) + '</span></span>';
  }
  function teamOf(id) { return S.teams && S.teams.list ? S.teams.list.filter(function (t) { return t.id === id; })[0] : null; }
  function fmtMs(ms) { return ms == null ? '–' : (ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' s'; }
  function amHost() { return typeof hostId !== 'undefined' && hostId && hostId === myId; }
  function names() { return (lastPlayers || []).filter(function (p) { return p.id !== myId; }).map(function (p) { return p.name; }); }
  function dialog(id, title, extra) {
    var d = $(id);
    if (!d) {
      d = document.createElement('div'); d.id = id; d.className = 'mp2-dlg'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', id + '-t');
      d.innerHTML = '<div class="mp2-card"><button type="button" class="mg-close mg-close-abs" aria-label="Schließen"></button><h2 id="' + id + '-t">' + title + '</h2><div class="mp2-body"></div><button type="button" class="btn mp2-close">Schließen</button></div>';
      document.body.appendChild(d);
      var close = function () { d.classList.remove('open'); if (d.__last && d.__last.focus) try { d.__last.focus(); } catch (e) {} };
      d.querySelector('.mg-close').addEventListener('click', close); d.querySelector('.mp2-close').addEventListener('click', close);
      d.addEventListener('click', function (e) { if (e.target === d) close(); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    }
    d.__last = document.activeElement; return d;
  }
  function openDlg(d) { d.classList.add('open'); var c = d.querySelector('.mp2-close'); if (c) c.focus(); }

  // ── Rundenuebersicht ──
  function renderRounds(history) {
    var d = dialog('mp2-rounds', 'Rundenübersicht'), b = d.querySelector('.mp2-body'), h = history || [];
    var modeL = { exact: 'exakt', closest: 'am nächsten', none: 'niemand', skipped: 'übersprungen', build: 'Bau-Runde' };
    b.innerHTML = h.length ? h.map(function (r) {
      var rows = (r.answers || []).map(function (a) {
        return '<tr><td>' + E(a.name) + '</td><td>' + E(a.noAnswer ? 'keine' : (a.skipped ? 'Totem' : (a.text == null || a.text === '' ? (r.mode === 'build' ? (a.correct ? 'gebaut' : 'nicht gelöst') : '–') : a.text))) + '</td><td>' + (a.correct ? '✓ richtig' : '✕ falsch') + '</td><td>' + (a.delta >= 0 ? '+' : '') + (a.delta || 0) + '</td><td>' + fmtMs(a.ms) + (a.rank ? ' (Platz ' + a.rank + ')' : '') + '</td></tr>';
      }).join('');
      return '<section class="mp2-round"><h3>' + r.n + '. ' + E(r.mode === 'build' ? 'Baue: ' + r.answer : (r.question || '')) + '</h3><p class="mp2-sub">Richtig: <b>' + E(r.answer) + '</b> · ' + E(modeL[r.mode] || r.mode) + '</p>' +
        '<div class="mp2-scroll"><table class="mp2-table"><thead><tr><th>Spieler</th><th>Antwort</th><th>Ergebnis</th><th>Punkte</th><th>Zeit</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<button type="button" class="btn btn-ghost mp2-rep" data-n="' + r.n + '">Frage melden</button></section>';
    }).join('') : '<p class="mp2-sub">Noch keine abgeschlossene Runde.</p>';
    b.onclick = function (e) {
      var x = e.target.closest('.mp2-rep'); if (!x || !window.MGReport) return; var r = h.filter(function (q) { return String(q.n) === x.getAttribute('data-n'); })[0]; if (!r) return;
      MGReport.open({ mode: 'multiplayer', room: myRoomId, players: names(), questionId: r.qid, round: r.n, format: r.format });
    };
    openDlg(d);
  }
  window.mpShowRounds = function () { if (S.history) renderRounds(S.history); else socket.emit('get_round_overview'); };
  socket.on('round_overview', function (o) { S.history = (o && o.history) || []; renderRounds(S.history); });

  // ── Host-Report ──
  function renderReport(r) {
    var d = dialog('mp2-hr', 'Host-Report'), b = d.querySelector('.mp2-body');
    if (!r) { b.innerHTML = '<p class="mp2-sub">Noch kein Report. Er erscheint nach dem Spielende.</p>'; openDlg(d); return; }
    var pl = (r.players || []).map(function (p) { return '<tr><td>' + E(p.name) + '</td><td>' + p.answered + '</td><td>' + p.correct + '</td><td>' + p.points + '</td><td>' + fmtMs(p.avgMs) + '</td><td>' + fmtMs(p.fastestMs) + '</td><td>' + (p.noAnswers || 0) + '</td></tr>'; }).join('');
    var qs = (r.questions || []).map(function (q) { var pc = Math.round((q.hitRate || 0) * 100); return '<tr><td>' + q.n + '</td><td>' + E(q.question) + '</td><td>' + pc + ' %<span class="mp2-bar" role="img" aria-label="' + pc + ' Prozent richtig"><i style="width:' + pc + '%"></i></span></td><td>' + fmtMs(q.avgMs) + '</td><td>' + (q.fastest ? E(q.fastest.name) + ' ' + fmtMs(q.fastest.ms) : '–') + '</td></tr>'; }).join('');
    function qn(x) { return x ? 'Frage ' + x.n + ' (' + Math.round((x.hitRate || 0) * 100) + ' %)' : '–'; }
    b.innerHTML = '<p class="mp2-sub">' + (r.rounds || 0) + ' Runden · Trefferquote ' + Math.round(((r.totals && r.totals.avgHitRate) || 0) * 100) + ' % · Ø Antwortzeit ' + fmtMs(r.totals && r.totals.avgMs) + '</p>' +
      '<p class="mp2-sub">Schwerste: ' + qn(r.hardest) + ' · Leichteste: ' + qn(r.easiest) + (r.fastest ? ' · Schnellste Antwort: ' + E(r.fastest.name) + ' ' + fmtMs(r.fastest.ms) + ' (Frage ' + r.fastest.n + ')' : '') + '</p>' +
      '<h3>Spieler</h3><div class="mp2-scroll"><table class="mp2-table"><thead><tr><th>Name</th><th>Beantwortet</th><th>Richtig</th><th>Punkte</th><th>Ø Zeit</th><th>Schnellste</th><th>Ohne Antwort</th></tr></thead><tbody>' + pl + '</tbody></table></div>' +
      '<h3>Fragen</h3><div class="mp2-scroll"><table class="mp2-table"><thead><tr><th>#</th><th>Frage</th><th>Trefferquote</th><th>Ø Zeit</th><th>Schnellste</th></tr></thead><tbody>' + qs + '</tbody></table></div>';
    openDlg(d);
  }
  socket.on('host_report', function (r) { S.report = r; var b = $('mp2-hr-btn'); if (b) b.hidden = false; });
  window.mpShowReport = function () { if (S.report) renderReport(S.report); else { socket.emit('get_host_report'); setTimeout(function () { if (S.report) renderReport(S.report); else renderReport(null); }, 700); } };

  // ── Game-over: Buttons, Team-Podium ──
  function decorateGameOver(data) {
    S.history = data.history || S.history;
    var btns = document.querySelector('#gameover-overlay .gameover-btns'); if (!btns) return;
    if (!$('mp2-rounds-btn')) {
      var b = document.createElement('button'); b.type = 'button'; b.id = 'mp2-rounds-btn'; b.className = 'btn-ceremony'; b.textContent = 'Rundenübersicht'; b.addEventListener('click', window.mpShowRounds); btns.appendChild(b);
      var h = document.createElement('button'); h.type = 'button'; h.id = 'mp2-hr-btn'; h.className = 'btn-ceremony'; h.textContent = 'Host-Report'; h.hidden = true; h.addEventListener('click', window.mpShowReport); btns.appendChild(h);
    }
    $('mp2-hr-btn').hidden = !amHost();
    var ts = data.teamScores || S.scores, box = $('mp2-podium');
    if (!box) { box = document.createElement('div'); box.id = 'mp2-podium'; box.className = 'mp2-podium'; var sc = $('gameover-scores'); sc.parentNode.insertBefore(box, sc); }
    if (data.teamScores && data.teamScores.length) {
      box.innerHTML = '<h3>Team-Podium</h3>' + data.teamScores.map(function (t, i) { return '<div class="mp2-trow' + (t.id === data.winnerTeamId || i === 0 ? ' win' : '') + '"><span class="px">' + (i + 1) + '.</span>' + chip(t) + '<span class="mp2-tpts">' + t.score + ' Pkt.</span></div>'; }).join('');
      box.hidden = false;
    } else box.hidden = true;
  }
  socket.on('game_over', function (d) { decorateGameOver(d || {}); });

  // ── Teams: Zustand, Lobby, Rangliste ──
  function barUpdate() {
    var bar = $('mp2-teambar');
    if (!S.teams || !S.scores || !S.scores.length) { if (bar) bar.hidden = true; return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'mp2-teambar'; bar.className = 'mp2-teambar'; bar.setAttribute('aria-label', 'Team-Rangliste'); var ls = $('live-scores'); ls.parentNode.insertBefore(bar, ls); }
    bar.hidden = false;
    bar.innerHTML = S.scores.map(function (t, i) { return '<span class="mp2-tb">' + (i + 1) + '. ' + chip(t) + '<b>' + t.score + '</b></span>'; }).join('');
  }
  function takeState(d) {
    if (!d) return;
    if (d.teams !== undefined) S.teams = d.teams;
    if (d.settings && d.settings.teams !== undefined) S.teams = d.settings.teams;
    if (d.settings) S.settings = Object.assign({}, S.settings, d.settings);
    if (d.teamScores) S.scores = d.teamScores;
  }
  function decorateLobby(players) {
    var host = amHost();
    [].forEach.call(document.querySelectorAll('#lobby-players .player-row'), function (row) {
      var p = (players || []).filter(function (x) { return x.id === row.dataset.pid; })[0]; if (!p || !S.teams) return;
      var t = teamOf(p.teamId), span = document.createElement('span'); span.className = 'mp2-team';
      span.innerHTML = chip(t);
      if ((host || p.id === myId) && S.teams.list) {
        var sel = document.createElement('select'); sel.className = 'mp2-tsel'; sel.setAttribute('aria-label', 'Team von ' + p.name);
        sel.innerHTML = S.teams.list.map(function (x) { return '<option value="' + x.id + '"' + (x.id === p.teamId ? ' selected' : '') + '>' + E(x.name) + '</option>'; }).join('');
        sel.addEventListener('change', function () { socket.emit('move_player', { id: p.id, teamId: sel.value }); });
        span.appendChild(sel);
      }
      row.insertBefore(span, row.querySelector('.player-score'));
    });
  }
  var ts = null;
  function buildTeamPanel() {
    var hs = $('host-settings'); if (!hs) return null;
    var p = $('mp2-teampanel');
    if (!p) {
      p = document.createElement('div'); p.id = 'mp2-teampanel'; p.className = 'host-settings mp2-panel'; p.hidden = true; hs.parentNode.insertBefore(p, hs.nextSibling);
      p.addEventListener('change', pushTeams); p.addEventListener('click', function (e) { if (e.target.id === 'mp2-bal') socket.emit('balance_teams'); });
    }
    return p;
  }
  function renderTeamPanel() {
    var p = buildTeamPanel(); if (!p) return;
    var host = amHost() && (S.phase === 'waiting' || !S.phase); p.hidden = !host; if (!host) return;
    if (p.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') return;   // nicht waehrend der Eingabe neu zeichnen
    var on = !!(S.teams && S.teams.enabled), list = (S.teams && S.teams.list) || [];
    p.innerHTML = '<h3 class="hs-title">Teams (Host)</h3><label class="mp2-chk"><input type="checkbox" id="mp2-on"' + (on ? ' checked' : '') + '> Teams aktivieren</label>' +
      (on ? '<div class="hs-row"><label for="mp2-cnt" class="form-label">Anzahl Teams</label><select id="mp2-cnt" class="form-input" style="max-width:120px">' + [2, 3, 4].map(function (n) { return '<option' + (n === list.length ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
        list.map(function (t, i) {
          return '<div class="mp2-trow2" data-id="' + t.id + '"><label class="sr-only" for="mp2-n' + i + '">Name Team ' + (i + 1) + '</label><input id="mp2-n' + i + '" class="form-input mp2-name" maxlength="16" value="' + E(t.name) + '">' +
            '<select class="form-input mp2-sym" aria-label="Symbol Team ' + (i + 1) + '">' + Object.keys(SYM).map(function (k) { return '<option value="' + k + '"' + (k === t.symbol ? ' selected' : '') + '>' + SYM[k][1] + '</option>'; }).join('') + '</select>' +
            '<select class="form-input mp2-col" aria-label="Farbe Team ' + (i + 1) + '">' + Object.keys(COL).map(function (k) { return '<option value="' + k + '"' + (k === t.color ? ' selected' : '') + '>' + COL[k][1] + '</option>'; }).join('') + '</select>' + chip(t) + '</div>';
        }).join('') + '<button type="button" class="btn" id="mp2-bal">Automatisch ausgleichen</button><p class="mp2-sub">Spieler wählen ihr Team in der Lobby selbst, der Host kann jeden verschieben.</p>' : '');
  }
  var pushT = null;
  function pushTeams(e) {
    clearTimeout(pushT);
    pushT = setTimeout(function () {
      var p = $('mp2-teampanel'); if (!p) return; var on = $('mp2-on').checked;
      if (!on) { socket.emit('update_teams', { enabled: false }); return; }
      var cnt = $('mp2-cnt'), body = { enabled: true, count: cnt ? parseInt(cnt.value, 10) : 2 }, rows = p.querySelectorAll('.mp2-trow2');
      if (rows.length) body.teams = [].map.call(rows, function (r) { return { id: r.dataset.id, name: r.querySelector('.mp2-name').value.trim().slice(0, 16), symbol: r.querySelector('.mp2-sym').value, color: r.querySelector('.mp2-col').value }; });
      if (e && e.target && e.target.id === 'mp2-cnt') delete body.teams;
      socket.emit('update_teams', body);
    }, 250);
  }
  socket.on('teams_updated', function (d) { takeState({ teams: d }); renderTeamPanel(); barUpdate(); });
  socket.on('teams_denied', function (d) { showToast(TEAM_ERR[d && d.reason] || 'Teams: nicht möglich', 3500); renderTeamPanel(); });
  socket.on('joined', function (d) { takeState(d); S.phase = 'waiting'; });
  socket.on('settings_updated', function (d) { takeState({ settings: d }); renderTeamPanel(); renderBuildRows(); });
  socket.on('room_state', function (d) {
    takeState(d); if (d && d.phase) S.phase = d.phase;
    decorateLobby(d && d.players); renderTeamPanel(); barUpdate(); renderBuildRows();
  });
  socket.on('result', function (d) { if (d && d.teamScores) { S.scores = d.teamScores; barUpdate(); } });
  socket.on('host_changed', function () { setTimeout(function () { renderTeamPanel(); renderBuildRows(); }, 50); });

  // ── Bau-Runde: Host-Einstellung ──
  function renderBuildRows() {
    var hs = $('host-settings'); if (!hs) return;
    var host = amHost(), row = $('mp2-buildrow');
    if (!row) {
      row = document.createElement('div'); row.id = 'mp2-buildrow'; row.className = 'hs-row';
      row.innerHTML = '<span class="form-label" id="mp2-bl">Bau-Runden (alle bauen gleichzeitig)</span><div class="toggle-row" role="group" aria-labelledby="mp2-bl" data-g="build"><button type="button" class="toggle-opt" data-v="off">Aus</button><button type="button" class="toggle-opt" data-v="mix">Gemischt</button><button type="button" class="toggle-opt" data-v="only">Nur bauen</button></div>' +
        '<span class="form-label" id="mp2-tl">Wahr oder Mythos</span><div class="toggle-row" role="group" aria-labelledby="mp2-tl" data-g="tf"><button type="button" class="toggle-opt" data-v="off">Aus</button><button type="button" class="toggle-opt" data-v="mix">Gemischt</button><button type="button" class="toggle-opt" data-v="only">Nur Wahr/Mythos</button></div>' +
        '<span class="form-label" id="mp2-bt">Bauzeit</span><div class="toggle-row" role="group" aria-labelledby="mp2-bt" data-g="buildSeconds"><button type="button" class="toggle-opt" data-v="45">45 s</button><button type="button" class="toggle-opt" data-v="60">60 s</button></div>';
      hs.appendChild(row);
      row.addEventListener('click', function (e) {
        var b = e.target.closest('.toggle-opt'); if (!b) return; var g = b.parentNode.getAttribute('data-g'), v = b.getAttribute('data-v'), o = {}; o[g] = (g === 'build' || g === 'tf') ? v : parseInt(v, 10);
        socket.emit('update_settings', o);
      });
    }
    var s = S.settings || {};
    [].forEach.call(row.querySelectorAll('.toggle-opt'), function (b) { var g = b.parentNode.getAttribute('data-g'), on = String(s[g] == null ? (g === 'build' ? 'off' : (g === 'tf' ? 'mix' : '60')) : s[g]) === b.getAttribute('data-v'); b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }

  // ── Bau-Runde: Spiel ──
  var ctl = null;
  function builtList() {
    var b = $('mp2-built'); if (!b) { b = document.createElement('div'); b.id = 'mp2-built'; b.className = 'mp2-built'; b.setAttribute('role', 'status'); b.setAttribute('aria-live', 'polite'); var h = $('craft-host'); h.parentNode.insertBefore(b, h.nextSibling); }
    b.hidden = false; b.innerHTML = S.built.length ? '<b>Fertig:</b> ' + S.built.map(function (x, i) { return (i + 1) + '. ' + E(x); }).join(' · ') : 'Noch niemand fertig.';
  }
  window.mpBuildStart = function (q) {
    S.built = []; S.myDone = false; builtList();
    var host = $('craft-host'); if (!host || !window.MGCraftBuild) return;
    try { if (ctl) ctl.destroy(); } catch (e) {}
    ctl = MGCraftBuild.mount(host, q, { onCheck: function (grid) { socket.emit('build_check', { grid: grid }); }, onHint: null });
    var hb = host.querySelector('#cb-hint'); if (hb) hb.style.display = 'none';
  };
  window.mpBuildReset = function () { var b = $('mp2-built'); if (b) b.hidden = true; if (ctl) { try { ctl.destroy(); } catch (e) {} ctl = null; } };
  socket.on('build_result', function (r) {
    if (!ctl || !r) return;
    if (!r.valid) { showToast('Lege zuerst Zutaten ins Raster.', 2500); return; }
    if (r.diff) ctl.setMarks({ ok: !!r.correct, correct: r.diff.correct, total: r.diff.total, cells: r.diff.cells });
    if (r.final) { S.myDone = true; ctl.finish(!!r.correct, null); showToast(r.correct ? 'Richtig gebaut! Warte auf die anderen.' : 'Keine Prüfungen mehr. Warte auf die Auflösung.', 3500); }
    else showToast('Noch ' + r.attemptsLeft + ' Prüfung' + (r.attemptsLeft === 1 ? '' : 'en') + ' übrig', 2200);
  });
  socket.on('player_built', function (d) { if (d && d.playerName) { S.built[(d.order || S.built.length + 1) - 1] = d.playerName; S.built = S.built.filter(Boolean); builtList(); } });
  socket.on('build_state', function (d) { if (d && d.done) { S.built = d.done.map(function (id) { var p = (lastPlayers || []).filter(function (x) { return x.id === id; })[0]; return p ? p.name : '?'; }); builtList(); } });
  window.mpBuildReveal = function (answers, solutionGrid, correctAnswer) {
    if (ctl && solutionGrid) { ctl.finish(false, { solution: { grid: solutionGrid.map(function (r) { return r.map(function (k) { return k ? [k] : null; }); }) } }); }
    var b = $('mp2-built'); if (b) {
      var ranked = (answers || []).filter(function (a) { return a.correct; }).sort(function (a, c) { return (a.rank || 99) - (c.rank || 99); });
      b.hidden = false; b.innerHTML = ranked.length ? '<b>Zeitrang:</b> ' + ranked.map(function (a) { return (a.rank || '') + '. ' + E(a.playerName) + ' ' + fmtMs(a.ms) + ' (+' + (a.points || 0) + ')'; }).join(' · ') : 'Niemand hat es gelöst.';
    }
    try { if (window.MGAudio) MGAudio.play(answers && answers.some(function (a) { return a.correct; }) ? 'correct' : 'wrong'); } catch (e) {}
    var mine = (answers || []).filter(function (a) { return a.playerId === myId; })[0];
    if (mine && !S.myDone) showToast(mine.correct ? 'Gelöst!' : 'Nicht gelöst', 2500);
  };

  // ═══ Raum-Einladungen von Freunden (Profil-Token noetig) ═══
  var PT = function () { try { return localStorage.getItem('mg_pt'); } catch (e) { return null; } };
  var INV_ERR = { auth: 'Erstelle zuerst ein Profil (im Spiel unter Freunde).', room: 'Du bist in keinem Raum.', friend: 'Ihr seid nicht befreundet.', offline: 'Dein Freund ist gerade nicht online.', rate: 'Zu viele Einladungen. Bitte kurz warten.', limit: 'Dein Freund hat schon mehrere offene Einladungen.' };
  function profAuth() { var t = PT(); if (t) socket.emit('profile_auth', { pt: t }); }
  socket.on('connect', profAuth); if (socket.connected) profAuth();
  var authed = false;
  socket.on('profile_auth_ok', function () { authed = true; var b = $('mp2-invbtn'); if (b) b.hidden = false; });
  socket.on('profile_auth_failed', function () { authed = false; var b = $('mp2-invbtn'); if (b) b.hidden = true; });
  function invBanner() {
    var b = $('mp2-invites'); if (!b) { b = document.createElement('div'); b.id = 'mp2-invites'; b.className = 'mp2-invites'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Einladungen'); b.setAttribute('aria-live', 'polite'); document.body.appendChild(b); } return b;
  }
  socket.on('room_invite', function (d) {
    if (!d || !d.inviteId) return; var b = invBanner(), id = 'inv-' + d.inviteId; if ($(id)) return;
    var n = document.createElement('div'); n.id = id; n.className = 'mp2-inv';
    n.innerHTML = '<span><b>' + E(d.from && d.from.name) + '</b> lädt dich in den Raum „' + E(d.roomName || d.roomId) + '“ ein.</span><span class="mp2-inv-b"><button type="button" class="btn btn-primary" data-a="yes">Beitreten</button><button type="button" class="btn" data-a="no">Ablehnen</button></span>';
    n.addEventListener('click', function (e) { var x = e.target.closest('button[data-a]'); if (!x) return; socket.emit('invite_respond', { inviteId: d.inviteId, accept: x.getAttribute('data-a') === 'yes' }); n.remove(); });
    b.appendChild(n); try { n.querySelector('button').focus({ preventScroll: true }); } catch (e) {}
    setTimeout(function () { if (n.isConnected) n.remove(); }, (d.expiresIn || 300) * 1000);
  });
  socket.on('invite_expired', function (d) { var n = d && $('inv-' + d.inviteId); if (n) n.remove(); });
  socket.on('invite_accepted', function (d) {
    if (!d || !d.roomId) return;
    var nm = ''; try { nm = ($('input-name') && $('input-name').value.trim()) || (window.MGSkin && MGSkin.getName && MGSkin.getName()) || ''; } catch (e) {}
    socket.emit('join_room', { roomId: d.roomId, inviteId: d.inviteId, playerName: nm || 'Spieler', password: null, skin: typeof mySkin === 'function' ? mySkin() : null, character: typeof myChar === 'function' ? myChar() : 'steve' });
  });
  socket.on('invite_sent', function () { showToast('Einladung gesendet.', 2200); });
  socket.on('invite_declined', function () { showToast('Dein Freund hat abgelehnt.', 2500); });
  socket.on('invite_denied', function (d) { showToast(INV_ERR[d && d.reason] || 'Einladung nicht möglich.', 3500); });
  // Lobby: "Freunde einladen"
  function ensureInviteBtn() {
    if ($('mp2-invbtn')) return; var rb = $('btn-ready'); if (!rb || !PT()) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'mp2-invbtn'; b.className = 'btn-ceremony'; b.textContent = 'Freunde einladen'; b.hidden = !authed;
    b.addEventListener('click', openInvite); rb.parentNode.insertBefore(b, rb.nextSibling);
  }
  function openInvite() {
    var d = dialog('mp2-invdlg', 'Freunde einladen'), b = d.querySelector('.mp2-body'); b.innerHTML = '<p class="mp2-sub">Lade …</p>'; openDlg(d);
    fetch('api/friends', { headers: { Authorization: 'Bearer ' + PT() } }).then(function (r) { return r.json(); }).then(function (j) {
      var fr = (j && j.friends) || [];
      b.innerHTML = fr.length ? '<ul class="mp2-flist">' + fr.map(function (f) { return '<li><span>' + E(f.name) + '</span><button type="button" class="btn" data-pid="' + E(f.pid) + '">Einladen</button></li>'; }).join('') + '</ul><p class="mp2-sub">Nur Freunde, die gerade online sind, können eingeladen werden. Einladungen gelten 5 Minuten.</p>' : '<p class="mp2-sub">Noch keine Freunde. Füge im Spiel unter „Freunde“ welche hinzu.</p>';
      b.onclick = function (e) { var x = e.target.closest('button[data-pid]'); if (!x) return; socket.emit('invite_friend', { pid: x.getAttribute('data-pid') }); x.disabled = true; x.textContent = 'Gesendet'; };
    }).catch(function () { b.innerHTML = '<p class="mp2-sub">Die Freundesliste ist gerade nicht erreichbar.</p>'; });
  }
  socket.on('joined', function () { ensureInviteBtn(); });
  // Neues Geraet: Profil-Skin uebernehmen, wenn lokal keiner gewaehlt ist (nur geprueft)
  (function () {
    var t = PT(); if (!t || !window.MGSkin || MGSkin.get() || !window.MGPng) return;
    fetch('api/profile/me', { headers: { Authorization: 'Bearer ' + t } }).then(function (r) { return r.json(); }).then(function (j) {
      var u = j && j.me && j.me.skin; if (typeof u !== 'string' || !MGSkin.isValid(u)) return;
      var by = MGPng.dataUrlBytes(u); if (!by) return;
      MGPng.alpha(by).then(function (res) { if (res && MGPng.plausible(res) && !MGSkin.get()) MGSkin.save(u); });
    }).catch(function () {});
  })();

  // ═══ Klassenraum (Lehrkraft + Schueler, ohne Konto, feste Namen, kein Freitext) ═══
  var CLS = { code: '', token: '', max: 30, settings: {}, players: [], phase: 'waiting', round: 0, rounds: 0, q: '', over: false, exp: null };
  var CLS_KEY = 'mg_class_t';
  try { var sv = JSON.parse(sessionStorage.getItem(CLS_KEY) || 'null'); if (sv && sv.code && sv.token) { CLS.code = sv.code; CLS.token = sv.token; } } catch (e) {}
  var CLS_ERR = { rate: 'Zu viele Versuche. Bitte kurz warten.', busy: 'Der Server ist gerade ausgelastet.', phase: 'Das geht gerade nicht (Spiel läuft schon).', students: 'Es ist noch kein Schüler im Raum.', notfound: 'Klassenraum nicht gefunden.' };
  var JOIN_ERR = { notfound: 'Klassenraum nicht gefunden. Prüfe den Code.', full: 'Der Klassenraum ist voll.', running: 'Das Spiel läuft schon. Bitte warte auf die nächste Runde.', name: 'Dieser Name ist nicht in der Liste.', name_taken: 'Dieser Name ist schon vergeben.', rate: 'Zu viele Versuche. Bitte eine Minute warten.' };
  function clsSave() { try { sessionStorage.setItem(CLS_KEY, JSON.stringify({ code: CLS.code, token: CLS.token })); } catch (e) {} }
  function clsClear() { CLS.code = ''; CLS.token = ''; CLS.over = false; try { sessionStorage.removeItem(CLS_KEY); } catch (e) {} }
  function addClassEntry() {
    var jc = document.querySelector('#join-screen .card'); if (!jc || $('mp2-class-open')) return;
    var box = document.createElement('div'); box.className = 'mp2-classbox';
    box.innerHTML = '<h3 class="hs-title">Klassenraum</h3><p class="mp2-sub">Für Schulklassen: ohne Konto, mit festen Tiernamen, ohne Chat. Die Lehrkraft steuert das Spiel.</p><div class="mp2-btnrow"><button type="button" class="btn" id="mp2-class-open">Klassenraum öffnen</button></div>';
    jc.appendChild(box); $('mp2-class-open').addEventListener('click', openClass);
  }
  document.addEventListener('DOMContentLoaded', addClassEntry); addClassEntry();
  function clsDlg() { return dialog('mp2-class', 'Klassenraum'); }
  function openClass() {
    var d = clsDlg(), b = d.querySelector('.mp2-body');
    if (CLS.code && CLS.token) { socket.emit('class_rejoin', { code: CLS.code, token: CLS.token }); b.innerHTML = '<p class="mp2-sub">Verbinde …</p>'; openDlg(d); return; }
    b.innerHTML = '<div class="mp2-btnrow"><button type="button" class="btn btn-primary" data-a="teacher">Ich bin Lehrkraft</button><button type="button" class="btn" data-a="student">Ich bin Schüler oder Schülerin</button></div><p class="mp2-sub">Es werden keine Namen, Konten oder Chats benötigt. Ein Klassenraum löscht sich nach 4 Stunden ohne Aktivität.</p>';
    b.onclick = function (e) { var x = e.target.closest('button[data-a]'); if (x) (x.getAttribute('data-a') === 'teacher' ? teacherSetup : studentStart)(d, b); };
    openDlg(d);
  }
  // ── Lehrkraft ──
  function seg(g, label, opts, cur) { return '<div class="hs-row"><span class="form-label" id="cl-' + g + '">' + label + '</span><div class="toggle-row" role="group" aria-labelledby="cl-' + g + '" data-g="' + g + '">' + opts.map(function (o) { return '<button type="button" class="toggle-opt' + (String(cur) === String(o[0]) ? ' selected' : '') + '" aria-pressed="' + (String(cur) === String(o[0])) + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>'; }
  function teacherSetup(d, b) {
    var cfg = { rounds: 10, tf: 'mix', build: 'off' };
    function draw() {
      b.innerHTML = '<p class="mp2-sub">Die Lehrkraft spielt nicht mit, sondern startet das Spiel und sieht die Ergebnisse je Tiername.</p>' + seg('rounds', 'Runden', [[10, '10'], [25, '25'], [50, '50']], cfg.rounds) + seg('tf', 'Wahr oder Mythos', [['off', 'Aus'], ['mix', 'Gemischt'], ['only', 'Nur Wahr/Mythos']], cfg.tf) + seg('build', 'Bau-Runden', [['off', 'Aus'], ['mix', 'Gemischt'], ['only', 'Nur bauen']], cfg.build) +
        '<div class="mp2-btnrow"><button type="button" class="btn btn-primary" id="cl-make">Klassenraum erstellen</button></div><p class="mp2-sub" id="cl-msg" role="status"></p>';
    }
    draw();
    b.onclick = function (e) {
      var t = e.target.closest('.toggle-opt');
      if (t) { var g = t.parentNode.getAttribute('data-g'), v = t.getAttribute('data-v'); cfg[g] = g === 'rounds' ? parseInt(v, 10) : v; draw(); return; }
      if (e.target.id === 'cl-make') { $('cl-msg').textContent = 'Erstelle …'; socket.emit('create_class', { rounds: cfg.rounds, tf: cfg.tf, build: cfg.build }); }
    };
  }
  function teacherPanel() {
    var d = clsDlg(), b = d.querySelector('.mp2-body'); if (!d.classList.contains('open')) openDlg(d);
    var run = CLS.phase !== 'waiting' && !CLS.over;
    b.innerHTML = '<div class="mp2-codebox"><span class="mp2-sub">Code für die Klasse</span><b class="mp2-code" aria-label="Klassencode ' + E(CLS.code.split('').join(' ')) + '">' + E(CLS.code) + '</b><button type="button" class="btn" data-a="copy">Kopieren</button></div>' +
      '<p class="mp2-sub">' + CLS.players.length + ' von ' + CLS.max + ' Schülern im Raum' + (run ? ' · Runde ' + CLS.round + (CLS.rounds ? ' von ' + CLS.rounds : '') : (CLS.over ? ' · Spiel beendet' : '')) + '</p>' +
      (run && CLS.q ? '<p class="mp2-q">' + E(CLS.q) + '</p>' : '') +
      '<ul class="mp2-flist">' + (CLS.players.length ? CLS.players.map(function (p) { return '<li><span>' + E(p.name) + '</span>' + (CLS.phase === 'waiting' || CLS.over ? '<button type="button" class="btn btn-ghost" data-k="' + E(p.id) + '" aria-label="' + E(p.name) + ' entfernen">Entfernen</button>' : '<b>' + E(p.score || 0) + ' Pkt.</b>') + '</li>'; }).join('') : '<li class="mp2-sub">Noch niemand beigetreten. Schüler öffnen diese Seite und wählen „Klassenraum öffnen“.</li>') + '</ul>' +
      '<div class="mp2-btnrow">' + (CLS.phase === 'waiting' ? '<button type="button" class="btn btn-primary" data-a="start"' + (CLS.players.length ? '' : ' disabled') + '>Spiel starten</button>' : '') +
      '<button type="button" class="btn" data-a="export">Ergebnisse (CSV)</button><button type="button" class="btn" data-a="print">Druckansicht</button><button type="button" class="btn btn-ghost" data-a="close">Klassenraum schließen</button></div><p class="mp2-sub" id="cl-msg" role="status" aria-live="polite"></p>';
    b.onclick = function (e) {
      var x = e.target.closest('button'); if (!x) return;
      if (x.dataset.k) { socket.emit('kick_player', { id: x.dataset.k }); return; }
      var a = x.getAttribute('data-a');
      if (a === 'copy') { (navigator.clipboard ? navigator.clipboard.writeText(CLS.code) : Promise.reject()).then(function () { $('cl-msg').textContent = 'Code kopiert.'; }, function () { $('cl-msg').textContent = 'Bitte den Code abschreiben.'; }); }
      else if (a === 'start') socket.emit('class_start');
      else if (a === 'export' || a === 'print') { CLS.want = a; socket.emit('class_export'); }
      else if (a === 'close') { if (confirm('Klassenraum für alle schließen?')) socket.emit('class_close'); }
    };
  }
  socket.on('class_created', function (d) {
    if (!d) return; CLS.code = d.code; CLS.token = d.token || CLS.token; CLS.max = d.max || 30; CLS.settings = d.settings || {}; CLS.over = false; clsSave(); teacherPanel();
  });
  socket.on('class_denied', function (d) { var t = CLS_ERR[d && d.reason] || 'Das hat nicht geklappt.'; var m = $('cl-msg'); if (m) m.textContent = t; else showToast(t, 3000); if (d && d.reason === 'notfound') { clsClear(); } });
  socket.on('class_closed', function (d) { clsClear(); CLS.players = []; var dl = $('mp2-class'); if (dl) dl.classList.remove('open'); showToast(d && d.reason === 'idle' ? 'Klassenraum wegen Inaktivität geschlossen.' : 'Klassenraum wurde geschlossen.', 4000); if (!amStudent) return; location.reload(); });
  var amStudent = false;
  socket.on('room_state', function (d) {
    if (!d) return;
    if (CLS.code && CLS.token) { CLS.players = (d.players || []).filter(function (p) { return p.id !== myId; }); CLS.phase = d.phase || CLS.phase; var dl = $('mp2-class'); if (dl && dl.classList.contains('open') && !dl.__student) teacherPanel(); }
  });
  socket.on('question', function (q) { if (CLS.code && CLS.token) { CLS.round = q.roundNum || 0; CLS.rounds = q.maxRounds || CLS.rounds; CLS.q = q.mode === 'build' ? 'Bau-Runde: ' + (q.answer || '') : (q.question || ''); CLS.phase = 'running'; var dl = $('mp2-class'); if (dl && dl.classList.contains('open')) teacherPanel(); } });
  socket.on('game_over', function () { if (CLS.code && CLS.token) { CLS.over = true; CLS.phase = 'waiting'; var dl = $('mp2-class'); if (dl && dl.classList.contains('open')) teacherPanel(); } });
  function csvDownload(csv) {
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'klassenraum-ergebnisse.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function printView(x) {
    var old = $('mp2-print'); if (old) old.remove();
    var p = document.createElement('div'); p.id = 'mp2-print';
    p.innerHTML = '<h1>MineGuess Klassenraum: Ergebnisse</h1><p>' + (x.rounds || 0) + ' Runden · durchschnittliche Trefferquote ' + (x.avgHitPct == null ? '–' : x.avgHitPct + ' %') + ' · ohne Personenbezug (Tiernamen)</p>' +
      '<h2>Schüler (Tiername)</h2><table><thead><tr><th>Name</th><th>Beantwortet</th><th>Richtig</th><th>Trefferquote</th><th>Punkte</th></tr></thead><tbody>' + (x.students || []).map(function (s) { return '<tr><td>' + E(s.name) + '</td><td>' + s.answered + '</td><td>' + s.correct + '</td><td>' + s.hitPct + ' %</td><td>' + s.points + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h2>Fragen</h2><table><thead><tr><th>#</th><th>Frage</th><th>Format</th><th>Beantwortet</th><th>Richtig</th><th>Trefferquote</th></tr></thead><tbody>' + (x.questions || []).map(function (q) { return '<tr><td>' + q.n + '</td><td>' + E(q.question) + '</td><td>' + E(q.format) + '</td><td>' + q.answered + '</td><td>' + q.correct + '</td><td>' + q.hitPct + ' %</td></tr>'; }).join('') + '</tbody></table>';
    document.body.appendChild(p); document.body.classList.add('mp2-printing');
    var done = function () { document.body.classList.remove('mp2-printing'); p.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(function () { window.print(); }, 50);
  }
  socket.on('class_export', function (x) {
    if (!x || !x.ok) { var m = $('cl-msg'); if (m) m.textContent = 'Es gibt noch keine Ergebnisse.'; return; }
    if (CLS.want === 'print') printView(x); else if (x.csv) csvDownload(x.csv);
    var m2 = $('cl-msg'); if (m2) m2.textContent = CLS.want === 'print' ? 'Druckansicht geöffnet.' : 'CSV heruntergeladen.'; CLS.want = '';
  });
  socket.on('connect', function () { if (CLS.code && CLS.token) socket.emit('class_rejoin', { code: CLS.code, token: CLS.token }); });
  // ── Schueler ──
  function studentStart(d, b) {
    d.__student = true; amStudent = true;
    b.innerHTML = '<div class="hs-row"><label class="form-label" for="cl-code">Code der Klasse (6 Zeichen)</label><input id="cl-code" class="form-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" style="max-width:200px;text-transform:uppercase"></div><div class="mp2-btnrow"><button type="button" class="btn btn-primary" id="cl-next">Weiter</button></div><p class="mp2-sub" id="cl-msg" role="status" aria-live="polite"></p><div id="cl-names"></div>';
    var chosen = '';
    function ask() { var c = $('cl-code').value.trim().toUpperCase(); if (c.length < 6) { $('cl-msg').textContent = 'Bitte den 6-stelligen Code eingeben.'; return; } $('cl-msg').textContent = 'Prüfe …'; socket.emit('class_info', { code: c }); }
    b.onclick = function (e) {
      if (e.target.id === 'cl-next') ask();
      var n = e.target.closest('button[data-name]'); if (n) { chosen = n.getAttribute('data-name'); [].forEach.call(b.querySelectorAll('button[data-name]'), function (x) { var on = x === n; x.classList.toggle('picked', on); x.setAttribute('aria-pressed', String(on)); }); }
      if (e.target.id === 'cl-join') socket.emit('join_class', { code: $('cl-code').value.trim().toUpperCase(), name: chosen || undefined });
    };
    $('cl-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') ask(); });
    setTimeout(function () { $('cl-code').focus(); }, 50);
  }
  socket.on('class_info', function (d) {
    var box = $('cl-names'), m = $('cl-msg'); if (!box || !m) return;
    if (!d || !d.ok) { m.textContent = 'Klassenraum nicht gefunden. Prüfe den Code.'; box.innerHTML = ''; return; }
    if (d.phase && d.phase !== 'waiting') { m.textContent = 'Das Spiel läuft schon. Bitte warte auf die nächste Runde.'; box.innerHTML = ''; return; }
    m.textContent = (d.count || 0) + ' von ' + (d.max || 30) + ' Plätzen belegt. Wähle deinen Namen oder lass dir einen zufällig geben.';
    box.innerHTML = '<div class="mp2-names" role="group" aria-label="Freie Namen">' + (d.free || []).map(function (n) { return '<button type="button" class="chip" data-name="' + E(n) + '" aria-pressed="false">' + E(n) + '</button>'; }).join('') + '</div><div class="mp2-btnrow"><button type="button" class="btn btn-primary" id="cl-join">Beitreten</button></div>';
  });
  socket.on('join_error', function (d) { var m = $('cl-msg'); if (m && d && d.code && JOIN_ERR[d.code]) m.textContent = JOIN_ERR[d.code]; });
  socket.on('joined', function (d) {
    if (!(d && d.settings && d.settings.isClass)) return;
    var cd = $('mp2-class'); if (cd) cd.classList.remove('open');
    var rb = $('btn-ready'); if (rb) rb.hidden = true;
    var ib = $('mp2-invbtn'); if (ib) ib.hidden = true;
    if (!$('mp2-classnote')) { var n = document.createElement('p'); n.id = 'mp2-classnote'; n.className = 'mp2-sub'; n.textContent = 'Klassenraum: Die Lehrkraft startet das Spiel. Du brauchst nichts zu tun.'; var lc = $('lobby-code'); if (lc && lc.parentNode) lc.parentNode.appendChild(n); }
  });
})();
