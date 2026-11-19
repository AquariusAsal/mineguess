/* MineGuess Soziales Teil 2 (haengt sich in mg-social.js ein): Titel/Vitrine/Banner/Rahmen, Duelle, Freunde-Rangliste, Aktivitaetsfeed,
   Vergleich, Gruppen (inkl. Koop-Wochenziel), Wochenziele und Saison, "Wer sieht was?".
   Backend: docs/team/API-NOTES.md "Runde 41". Kein Chat, keine Kommentare, kein Freitext. Alles Meldbare ueber MGReport. */
(function (global) {
  'use strict';
  if (!global.MGSocial) return;
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var BANNER = { ebene: ['block/grass_block_top', 'Ebene'], wueste: ['block/sand', 'Wüste'], taiga: ['block/podzol_top', 'Taiga'], dschungel: ['block/moss_block', 'Dschungel'], ozean: ['block/prismarine', 'Ozean'], kirschhain: ['block/cherry_planks', 'Kirschhain'], nether: ['block/netherrack', 'Nether'], end: ['block/end_stone', 'End'] };
  var FRAME = { keiner: ['', 'Kein Rahmen', null], eisen: ['#c9c9c9', 'Eisen', 'item/iron_ingot'], gold: ['#e8b93a', 'Gold', 'item/gold_ingot'], diamant: ['#5fcfc9', 'Diamant', 'item/diamond'], netherit: ['#7a6666', 'Netherit', 'item/netherite_ingot'] };
  var SYM = { schwert: ['item/iron_sword', 'Schwert'], spitzhacke: ['item/iron_pickaxe', 'Spitzhacke'], schild: ['item/iron_chestplate', 'Schild'], bogen: ['item/bow', 'Bogen'], apfel: ['item/apple', 'Apfel'], diamant: ['item/diamond', 'Diamant'], smaragd: ['item/emerald', 'Smaragd'], totem: ['item/totem_of_undying', 'Totem'], creeper: ['item/gunpowder', 'Creeper'], tnt: ['block/tnt_side', 'TNT'], fackel: ['block/torch', 'Fackel'], herz: ['gui/heart_full', 'Herz'] };
  var COL = { rot: ['#e5604d', 'Rot'], blau: ['#4f9bd9', 'Blau'], gruen: ['#6cbf3c', 'Grün'], gelb: ['#e8b93a', 'Gelb'], lila: ['#a37be0', 'Lila'], orange: ['#f08a2c', 'Orange'], tuerkis: ['#2fbfae', 'Türkis'], pink: ['#ee7fb7', 'Pink'] };
  var REACT = { herz: ['gui/heart_full', 'Herz'], daumen: ['item/emerald', 'Daumen'], feuer: ['item/blaze_powder', 'Feuer'] };
  var ERR = { nicht_freigeschaltet: 'Das ist noch nicht freigeschaltet.', showcase: 'Die Vitrine darf nur eigene Abzeichen enthalten.', rate: 'Bitte kurz warten.', limit: 'Limit erreicht.', name_vergeben: 'Dieser Name ist schon vergeben.', name_unzulaessig: 'Dieser Name ist nicht erlaubt.', name_format: 'Name: 3 bis 16 Zeichen aus a-z, 0-9, _ und -.', nicht_gefunden: 'Nicht gefunden.', verboten: 'Das ist nicht erlaubt.' };
  function err(r) { if (r.st === 429) return 'Bitte kurz warten.'; var e = r.j && r.j.error; return ERR[e] || (e ? 'Das hat nicht geklappt (' + e + ').' : 'Das hat nicht geklappt.'); }
  function ico(p, n) { return '<img class="tm-ico" src="assets/mc/' + p + '.png" width="' + (n || 20) + '" height="' + (n || 20) + '" alt="">'; }
  function chip(sym, col, name) { var s = SYM[sym] || SYM.schwert, c = COL[col] || COL.rot; return '<span class="tm-chip" style="--tc:' + c[0] + '">' + ico(s[0]) + '<span>' + E(name) + '</span></span>'; }
  function badgeName(id) { var l = global.MGBadges && MGBadges.list || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i].name; return id; }
  function badgeTex(id) { var l = global.MGBadges && MGBadges.list || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i].texture; return null; }
  function reqText(rq) {
    if (!rq) return 'frei'; if (rq.badge) return 'Abzeichen ' + badgeName(rq.badge); if (rq.stat) return rq.stat + ' ≥ ' + rq.min; if (rq.category) return rq.min + ' richtige Antworten: ' + rq.category;
    if (rq.rank) return 'Rang ' + rq.rank; if (rq.duelWins) return rq.duelWins + ' Duell-Siege'; if (rq.goals) return rq.goals + ' Wochenziele'; if (rq.group) return 'Mitglied einer Gruppe'; return 'gesperrt';
  }
  function tierLabel(mmr) { try { if (global.MGRanked) return MGRanked.rankInfo(mmr).label; } catch (e) {} return mmr + ' MMR'; }
  function when(ts) { var d = new Date(ts); return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); }
  function left(ts) { var h = Math.max(0, Math.round((ts - Date.now()) / 3600000)); return h >= 24 ? Math.floor(h / 24) + ' T' : h + ' Std.'; }
  function opt(sel, label, disabled, selected) { return '<option value="' + E(sel) + '"' + (disabled ? ' disabled' : '') + (selected ? ' selected' : '') + '>' + E(label) + '</option>'; }

  // ═══ Profil: Titel, Banner, Rahmen, Vitrine ═══
  MGSocial.onProfile(function (p, c) {
    var me = c.me(), cat = c.catalog(); if (!cat) return;
    var hero = p.querySelector('.sc-hero'), fig = p.querySelector('.sc-fig');
    if (hero && me.banner && BANNER[me.banner]) { hero.classList.add('sc-banner'); hero.style.setProperty('--ban', 'url(assets/mc/' + BANNER[me.banner][0] + '.png)'); }
    if (fig && me.frame && FRAME[me.frame] && FRAME[me.frame][0]) { fig.style.borderColor = FRAME[me.frame][0]; fig.style.boxShadow = '0 0 0 3px ' + FRAME[me.frame][0]; fig.setAttribute('data-frame', FRAME[me.frame][1]); }
    var show = (me.showcase || []).map(function (b) { var t = badgeTex(b.id); return '<span class="sc-pin" title="' + E(badgeName(b.id)) + '">' + (t && global.MGIcon ? MGIcon.tex(t, 24, '') : '') + '<span>' + E(badgeName(b.id)) + '</span></span>'; }).join('');
    if (show) { var id = p.querySelector('.sc-id'); if (id) id.insertAdjacentHTML('beforeend', '<div class="sc-pins" aria-label="Vitrine">' + show + '</div>'); }
    // Titel: nur freigeschaltete waehlbar
    var old = p.querySelector('#sc-title-sel'); if (old) {
      old.innerHTML = cat.titles.map(function (t) { return opt(t.id, t.label + (t.unlocked ? '' : ' (' + reqText(t.requires) + ')'), !t.unlocked, (me.title || '') === t.id); }).join('');
    }
    var ext = document.createElement('div'); ext.className = 'sc-ext';
    var ban = cat.banners.map(function (b) { return opt(b.id, (BANNER[b.id] ? BANNER[b.id][1] : b.label) + (b.unlocked ? '' : ' (' + reqText(b.requires) + ')'), !b.unlocked, me.banner === b.id); }).join('');
    var frm = cat.frames.map(function (b) { return opt(b.id, (FRAME[b.id] ? FRAME[b.id][1] : b.label) + (b.unlocked ? '' : ' (' + reqText(b.requires) + ')'), !b.unlocked, (me.frame || 'keiner') === b.id); }).join('');
    var mine = (global.MGBadges && MGBadges.album ? MGBadges.album().filter(function (a) { return a.unlocked; }) : []), pinned = (me.showcase || []).map(function (b) { return b.id; });
    ext.innerHTML = '<h3 class="sc-h">Aussehen</h3><div class="sc-two2"><div class="sc-row"><label for="sc-ban">Banner</label><select id="sc-ban" class="form-input"><option value="">Kein Banner</option>' + ban + '</select></div>' +
      '<div class="sc-row"><label for="sc-frm">Rahmen</label><select id="sc-frm" class="form-input">' + frm + '</select></div></div>' +
      '<h3 class="sc-h">Vitrine (bis zu 3 Lieblingsabzeichen)</h3>' + (mine.length ? '<div class="sc-vit" role="group" aria-label="Vitrine">' + mine.map(function (a) { return '<label class="sc-vitem"><input type="checkbox" value="' + E(a.id) + '"' + (pinned.indexOf(a.id) >= 0 ? ' checked' : '') + '> ' + (global.MGIcon ? MGIcon.tex(a.texture, 20, '') : '') + ' ' + E(a.name) + '</label>'; }).join('') + '</div>' : '<p class="sc-muted">Sobald du Abzeichen hast, kannst du bis zu 3 anpinnen.</p>');
    p.insertBefore(ext, p.querySelector('.sc-code') || null);
    function upd(body) { c.api('profile/update', body).then(function (r) { if (r.ok) { c.reloadMe().then(function () { c.rerender(); c.say('Gespeichert.'); }); } else c.say(err(r), true); }); }
    ext.querySelector('#sc-ban').addEventListener('change', function (e) { upd({ banner: e.target.value || null }); });
    ext.querySelector('#sc-frm').addEventListener('change', function (e) { upd({ frame: e.target.value }); });
    var vit = ext.querySelector('.sc-vit');
    if (vit) vit.addEventListener('change', function (e) {
      var ids = [].filter.call(vit.querySelectorAll('input:checked'), function () { return true; }).map(function (i) { return i.value; });
      if (ids.length > 3) { e.target.checked = false; c.say('Höchstens 3 Abzeichen in der Vitrine.', true); return; }
      upd({ showcase: ids });
    });
    var tsel = p.querySelector('#sc-title-sel'); if (tsel) { var nt = tsel.cloneNode(true); tsel.parentNode.replaceChild(nt, tsel); nt.addEventListener('change', function (e) { upd({ title: e.target.value }); }); }
  });

  // ═══ Duelle ═══
  function duelCard(d, me, pid) {
    var other = d.from.pid === pid ? d.to : d.from, mine = d.results && d.results[pid], theirs = d.results && d.results[other.pid];
    var st = { pending: 'Einladung', active: 'läuft', finished: 'beendet', declined: 'abgelehnt', cancelled: 'zurückgezogen', expired: 'abgelaufen' }[d.status] || d.status;
    var res = '';
    if (d.status === 'finished' || (mine && theirs)) {
      var w = d.winner === 'draw' ? 'Unentschieden' : (d.winner === pid ? 'Du hast gewonnen' : (d.winner ? E(other.name) + ' hat gewonnen' : ''));
      res = '<div class="sc-duel-res"><div><b>Du</b><span class="ch-squares">' + E(mine ? mine.squares : '–') + '</span><span>' + (mine ? mine.correct + '/' + mine.n + ' · ' + mine.points + ' Pkt.' + (mine.seconds ? ' · ' + mine.seconds + ' s' : '') : 'noch offen') + '</span></div>' +
        '<div><b>' + E(other.name) + '</b><span class="ch-squares">' + E(theirs ? theirs.squares : '–') + '</span><span>' + (theirs ? theirs.correct + '/' + theirs.n + ' · ' + theirs.points + ' Pkt.' + (theirs.seconds ? ' · ' + theirs.seconds + ' s' : '') : 'noch offen') + '</span></div></div><p class="sc-win">' + w + '</p>';
    }
    return { other: other, html: '<li class="sc-duel" data-id="' + E(d.id) + '"><div class="sc-duel-top"><span class="sc-av" aria-hidden="true">' + MGSocial.headOf(null, other.character, 'sm') + '</span><b>' + E(other.name) + '</b><span class="sc-muted">' + st + (d.expiresAt && (d.status === 'pending' || d.status === 'active') ? ' · noch ' + left(d.expiresAt) : '') + '</span></div>' + res + '<div class="sc-btns" data-d="' + E(d.id) + '"></div></li>' };
  }
  MGSocial.addTab('duelle', 'Duelle', function (p, c) {
    var me = c.me();
    p.innerHTML = '<p class="sc-note">Fordere einen Freund heraus: Ihr spielt dieselben 10 Fragen, danach vergleicht ihr. Das hat keinen Einfluss auf Rang oder MMR. Einladungen gelten 48 Stunden.</p><div class="sc-row"><label for="sc-dpick">Freund herausfordern</label><span class="sc-inline"><select id="sc-dpick" class="form-input"><option value="">Freund wählen</option></select><button type="button" class="btn btn-primary" id="sc-dgo">Einladen</button></span></div><div id="sc-dl"><p class="sc-muted">Lade …</p></div>';
    c.api('friends').then(function (r) { var s = p.querySelector('#sc-dpick'); if (r.ok && s) (r.j.friends || []).forEach(function (f) { s.insertAdjacentHTML('beforeend', '<option value="' + E(f.pid) + '">' + E(f.name) + '</option>'); }); });
    p.querySelector('#sc-dgo').addEventListener('click', function () { var pid = p.querySelector('#sc-dpick').value; if (!pid) return; c.api('duels/create', { pid: pid }).then(function (r) { if (r.ok) { c.say('Einladung gesendet.'); load(); } else c.say(err(r), true); }); });
    function load() {
      c.api('duels').then(function (r) {
        var l = p.querySelector('#sc-dl'); if (!l) return; if (!r.ok) { l.innerHTML = '<p class="sc-muted">Duelle sind gerade nicht erreichbar.</p>'; return; }
        var j = r.j, h = '', pid = me.pid;
        function sect(title, arr, kind) { if (!arr || !arr.length) return ''; return '<h3 class="sc-h">' + title + '</h3><ul class="sc-flist">' + arr.map(function (d) { var x = duelCard(d, me, pid); return x.html.replace('data-id="' + E(d.id) + '"', 'data-id="' + E(d.id) + '" data-k="' + kind + '"'); }).join('') + '</ul>'; }
        h += sect('Einladungen an dich', j.incoming, 'in') + sect('Laufende Duelle', j.active, 'act') + sect('Gesendet', j.outgoing, 'out') + sect('Beendet', j.finished, 'fin');
        l.innerHTML = h || '<p class="sc-muted">Noch keine Duelle.</p>';
        [].forEach.call(l.querySelectorAll('.sc-duel'), function (li) {
          var k = li.getAttribute('data-k'), id = li.getAttribute('data-id'), b = li.querySelector('.sc-btns'), d = [].concat(j.incoming, j.active, j.outgoing, j.finished).filter(function (x) { return x && x.id === id; })[0];
          var mineDone = d && d.mine && d.mine.submitted;
          if (k === 'in') b.innerHTML = '<button type="button" class="btn btn-primary" data-a="yes">Annehmen</button><button type="button" class="btn" data-a="no">Ablehnen</button>';
          else if (k === 'act') b.innerHTML = mineDone ? '<span class="sc-muted">Du bist fertig. Warte auf den Freund.</span>' : '<button type="button" class="btn btn-primary" data-a="play">Jetzt spielen</button>';
          else if (k === 'out') b.innerHTML = '<button type="button" class="btn btn-ghost" data-a="cancel">Zurückziehen</button>';
          else if (k === 'fin') b.innerHTML = '<button type="button" class="btn" data-a="rematch">Revanche</button>';
          b.onclick = function (e) {
            var a = e.target.closest('button[data-a]'); if (!a) return; var act = a.getAttribute('data-a');
            if (act === 'play') { if (global.startDuel) { c.close(); global.startDuel(d); } else c.say('Duelle starten im Spielmenü.', true); return; }
            var path = { yes: 'duels/respond', no: 'duels/respond', cancel: 'duels/cancel', rematch: 'duels/rematch' }[act], body = (act === 'yes' || act === 'no') ? { id: id, accept: act === 'yes' } : { id: id };
            c.api(path, body).then(function (r2) { if (r2.ok) { c.say(act === 'rematch' ? 'Revanche gesendet.' : 'Gespeichert.'); load(); } else c.say(err(r2), true); });
          };
        });
      });
    }
    load();
  });

  // ═══ Freunde-Rangliste ═══
  var lbPeriod = 'week', lbScope = 'global';
  function globalList(p, c) {
    p.innerHTML += '<div id="sc-lb"><p class="sc-muted">Lade …</p></div>';
    fetch('/api/ranked', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () { return null; }).then(function (list) {
      var l = p.querySelector('#sc-lb'); if (!l) return; if (!Array.isArray(list)) { l.innerHTML = '<p class="sc-muted">Die Rangliste ist gerade nicht erreichbar.</p>'; return; }
      list = list.slice().sort(function (a, b) { return (b.mmr || 0) - (a.mmr || 0); }).slice(0, 50);
      l.innerHTML = '<table class="sc-lbt"><thead><tr><th>#</th><th>Spieler</th><th>Rang</th><th>MMR</th></tr></thead><tbody>' + list.map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td>' + E(x.name || 'Spieler') + '</td><td>' + E(tierLabel(x.mmr || 0)) + '</td><td>' + E(x.mmr || 0) + '</td></tr>'; }).join('') + '</tbody></table>' + (list.length ? '' : '<p class="sc-muted">Noch keine Einträge.</p>') + '<p class="sc-note">Detaillierte Rangliste mit Tagesfilter: <button type="button" class="btn btn-ghost" id="sc-lb-open">Öffnen</button></p>';
      var o = l.querySelector('#sc-lb-open'); if (o) o.addEventListener('click', function () { if (global.showLeaderboard) { c.close(); global.showLeaderboard(); } });
    });
  }
  MGSocial.addTab('rangliste', 'Rangliste', function (p, c) {
    var scopeBar = '<div class="sc-seg" role="group" aria-label="Bereich"><button type="button" class="chip' + (lbScope === 'global' ? ' on' : '') + '" data-s="global" aria-pressed="' + (lbScope === 'global') + '">Global</button><button type="button" class="chip' + (lbScope === 'friends' ? ' on' : '') + '" data-s="friends" aria-pressed="' + (lbScope === 'friends') + '">Freunde</button></div>';
    if (lbScope === 'global' || !c.me()) {
      p.innerHTML = scopeBar; p.querySelector('.sc-seg').addEventListener('click', function (e) { var b = e.target.closest('button[data-s]'); if (b) { lbScope = b.getAttribute('data-s'); c.rerender(); } });
      if (lbScope === 'friends') { p.innerHTML += '<p>Für die Freunde-Rangliste brauchst du ein Profil.</p>'; return; }
      globalList(p, c); return;
    }
    p.innerHTML = scopeBar + '<div class="sc-seg" role="group" aria-label="Zeitraum"><button type="button" class="chip' + (lbPeriod === 'week' ? ' on' : '') + '" data-p="week" aria-pressed="' + (lbPeriod === 'week') + '">Diese Woche</button><button type="button" class="chip' + (lbPeriod === 'all' ? ' on' : '') + '" data-p="all" aria-pressed="' + (lbPeriod === 'all') + '">Gesamt</button></div><div id="sc-lb"><p class="sc-muted">Lade …</p></div>';
    p.querySelector('.sc-seg').addEventListener('click', function (e) { var b = e.target.closest('button[data-s]'); if (b) { lbScope = b.getAttribute('data-s'); c.rerender(); } });
    p.querySelectorAll('.sc-seg')[1].addEventListener('click', function (e) { var b = e.target.closest('button[data-p]'); if (b) { lbPeriod = b.getAttribute('data-p'); c.rerender(); } });
    c.api('friends/leaderboard?period=' + lbPeriod).then(function (r) {
      var l = p.querySelector('#sc-lb'); if (!l) return; if (!r.ok) { l.innerHTML = '<p class="sc-muted">Die Rangliste ist gerade nicht erreichbar.</p>'; return; }
      var rows = r.j.rows || [];
      l.innerHTML = '<table class="sc-lbt"><thead><tr><th>#</th><th>Spieler</th><th>Rang</th><th>' + (lbPeriod === 'week' ? 'MMR diese Woche' : 'MMR') + '</th></tr></thead><tbody>' + rows.map(function (x, i) {
        var d = lbPeriod === 'week' ? (x.weekDelta > 0 ? '+' : '') + x.weekDelta + ' (' + x.weekRuns + ' Läufe)' : x.mmr;
        return '<tr' + (x.isSelf ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td><span class="sc-av" aria-hidden="true">' + MGSocial.headOf(null, x.character, 'sm') + '</span> ' + E(x.name) + (x.isSelf ? ' <small>(du)</small>' : '') + (x.title && c.TITLES[x.title] ? '<small>' + E(c.TITLES[x.title]) + '</small>' : '') + '</td><td>' + E(tierLabel(x.mmr)) + '</td><td>' + E(d) + '</td></tr>';
      }).join('') + '</tbody></table>' + (r.j.hidden ? '<p class="sc-note">' + r.j.hidden + ' Freund' + (r.j.hidden === 1 ? '' : 'e') + ' zeigen ihren Rang nicht.</p>' : '') + (rows.length < 2 ? '<p class="sc-muted">Füge Freunde hinzu, die ihren Rang für Freunde freigegeben haben.</p>' : '');
    });
  });

  // ═══ Feed ═══
  function feedText(e, c) {
    var d = e.data || {}, g = ((c.catalog() || {}).goals || []).filter(function (x) { return x.id === d.id; })[0];
    switch (e.type) {
      case 'rank_up': return 'hat einen neuen Rang erreicht: ' + (d.tier || '') + (d.division ? ' ' + d.division : '');
      case 'badge': return 'hat das Abzeichen „' + badgeName(d.id) + '“ freigeschaltet';
      case 'duel_won': return 'hat ein Duell gegen ' + ((d.opponent && d.opponent.name) || 'einen Freund') + ' gewonnen';
      case 'goal': return 'hat das Wochenziel „' + (g ? g.label : d.id) + '“ geschafft';
      case 'award': return 'hat eine Auszeichnung erhalten (' + d.id + ')';
      default: return 'hat etwas erreicht';
    }
  }
  MGSocial.addTab('feed', 'Feed', function (p, c) {
    p.innerHTML = '<p class="sc-note">Nur automatische Meldungen von Freunden, die ihre Aktivität freigegeben haben. Du kannst mit Herz, Daumen oder Feuer reagieren, mehr nicht. Deine eigene Freigabe steht unter Privatsphäre.</p><div id="sc-fd"><p class="sc-muted">Lade …</p></div>';
    function load() {
      c.api('feed').then(function (r) {
        var l = p.querySelector('#sc-fd'); if (!l) return; if (!r.ok) { l.innerHTML = '<p class="sc-muted">Der Feed ist gerade nicht erreichbar.</p>'; return; }
        var ev = r.j.events || [];
        l.innerHTML = ev.length ? '<ul class="sc-flist">' + ev.map(function (e) {
          return '<li class="sc-fr" data-id="' + E(e.id) + '"><span class="sc-av" aria-hidden="true">' + MGSocial.headOf(null, e.character, 'sm') + '</span><span class="sc-fn"><b>' + E(e.name) + '</b> ' + E(feedText(e, c)) + '<small>' + when(e.ts) + '</small></span><span class="sc-fa">' +
            Object.keys(REACT).map(function (k) { var on = e.mine === k, n = (e.reactions && e.reactions[k]) || 0; return '<button type="button" class="btn sc-react' + (on ? ' on' : '') + '" data-r="' + k + '" aria-pressed="' + on + '" aria-label="' + REACT[k][1] + ' (' + n + ')">' + ico(REACT[k][0], 18) + '<span>' + n + '</span></button>'; }).join('') + '</span></li>';
        }).join('') + '</ul>' : '<p class="sc-muted">Noch nichts im Feed.</p>';
        l.onclick = function (e2) {
          var b = e2.target.closest('button[data-r]'); if (!b) return; var id = b.closest('li').getAttribute('data-id'), k = b.getAttribute('data-r'), on = b.classList.contains('on');
          c.api('feed/react', { eventId: id, reaction: on ? null : k }).then(function (r2) { if (r2.ok) load(); else c.say(err(r2), true); });
        };
      });
    }
    load();
  });

  // ═══ Vergleich im Freundesprofil ═══
  MGSocial.onFriendView(function (root, pid, prof, c) {
    var box = document.createElement('div'); box.className = 'sc-cmp'; box.innerHTML = '<h3 class="sc-h">Vergleich mit dir</h3><p class="sc-muted">Lade …</p>';
    var anchor = root.querySelector('.sc-btns'); if (anchor) anchor.parentNode.insertBefore(box, anchor); else root.appendChild(box);
    c.api('profile/compare?pid=' + encodeURIComponent(pid)).then(function (r) {
      if (!r.ok) { box.innerHTML = ''; return; }
      var j = r.j, nm = { bestStreak: 'Beste Serie', hlBest: 'Höher/Tiefer', hardcoreBest: 'Hardcore', blitzBest: 'Blitz', dailyStreak: 'Tages-Serie', challengeBest: 'Herausforderung' };
      function rate(x) { return x && x.t ? Math.round(x.c / x.t * 100) + ' %' : '–'; }
      var cats = (j.categories || []).filter(function (x) { return x.me && x.me.t; }).slice(0, 10);
      box.innerHTML = '<h3 class="sc-h">Vergleich mit dir</h3>' + ((j.bests || []).length ? '<table class="sc-lbt"><thead><tr><th>Bestwert</th><th>Du</th><th>' + E(j.other.name) + '</th></tr></thead><tbody>' + j.bests.map(function (b) { return '<tr><td>' + E(nm[b.key] || b.key) + '</td><td>' + E(b.me == null ? '–' : b.me) + '</td><td>' + E(b.other == null ? 'nicht freigegeben' : b.other) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
        (cats.length ? '<table class="sc-lbt"><thead><tr><th>Kategorie</th><th>Du</th><th>' + E(j.other.name) + '</th></tr></thead><tbody>' + cats.map(function (x) { return '<tr><td>' + E(x.category) + '</td><td>' + rate(x.me) + '</td><td>' + (x.other ? rate(x.other) : 'nicht freigegeben') + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
        (j.other && j.other.stats === null ? '<p class="sc-note">' + E(j.other.name) + ' zeigt keine Statistik für Freunde.</p>' : '');
    });
  });

  // ═══ Gruppe (inkl. Koop-Wochenziel) ═══
  MGSocial.addTab('gruppe', 'Gruppe', function (p, c) {
    p.innerHTML = '<p class="sc-muted">Lade …</p>';
    function load() {
      c.api('groups/me').then(function (r) {
        if (!r.ok) { p.innerHTML = '<p class="sc-muted">Gruppen sind gerade nicht erreichbar.</p>'; return; }
        var g = r.j.group, me = c.me(), cat = c.catalog() || {};
        if (!g) {
          p.innerHTML = '<p class="sc-note">Eine Gruppe hat bis zu 8 Mitglieder und sammelt gemeinsam Wochenpunkte. Es gibt keinen Gruppenchat.</p><h3 class="sc-h">Gruppe gründen</h3><div class="sc-row"><label for="sc-gn">Gruppenname (3 bis 16 Zeichen: a-z, 0-9, _ und -)</label><input id="sc-gn" class="form-input" maxlength="16" autocomplete="off" autocapitalize="off"></div>' +
            '<div class="sc-two2"><div class="sc-row"><label for="sc-gs">Symbol</label><select id="sc-gs" class="form-input">' + Object.keys(SYM).map(function (k) { return opt(k, SYM[k][1]); }).join('') + '</select></div><div class="sc-row"><label for="sc-gc">Farbe</label><select id="sc-gc" class="form-input">' + Object.keys(COL).map(function (k) { return opt(k, COL[k][1]); }).join('') + '</select></div></div>' +
            '<div class="sc-btns"><button type="button" class="btn btn-primary" id="sc-gmk">Gruppe gründen</button></div><h3 class="sc-h">Mit Code beitreten</h3><div class="sc-inline"><input id="sc-gj" class="form-input" maxlength="8" autocomplete="off" autocapitalize="characters" aria-label="Gruppencode"><button type="button" class="btn" id="sc-gjb">Beitreten</button></div>';
          p.querySelector('#sc-gmk').addEventListener('click', function () { c.api('groups/create', { name: p.querySelector('#sc-gn').value.trim().toLowerCase(), symbol: p.querySelector('#sc-gs').value, color: p.querySelector('#sc-gc').value }).then(function (r2) { if (r2.ok) { c.say('Gruppe gegründet.'); load(); } else c.say(err(r2), true); }); });
          p.querySelector('#sc-gjb').addEventListener('click', function () { c.api('groups/join', { code: p.querySelector('#sc-gj').value.trim().toUpperCase() }).then(function (r2) { if (r2.ok) { c.say('Du bist beigetreten.'); load(); } else c.say(err(r2), true); }); });
          return;
        }
        var owner = g.ownerPid === me.pid, goal = g.week && g.week.goal, pc = goal && goal.target ? Math.min(100, Math.round(goal.points / goal.target * 100)) : 0;
        p.innerHTML = '<div class="sc-ghead">' + chip(g.symbol, g.color, g.name) + '<span class="sc-muted">' + g.members.length + ' / 8 Mitglieder</span></div>' +
          '<h3 class="sc-h">Koop-Wochenziel</h3><div class="sc-bar big" role="img" aria-label="' + (goal ? goal.points + ' von ' + goal.target + ' Punkten' : '') + '"><i style="width:' + pc + '%"></i></div><p>' + (goal ? goal.points + ' von ' + goal.target + ' Wochenpunkten' + (goal.done ? ' · geschafft ✓' : '') : '–') + '</p>' +
          '<h3 class="sc-h">Mitglieder</h3><ul class="sc-flist">' + g.members.map(function (m) { return '<li class="sc-fr"><span class="sc-av" aria-hidden="true">' + MGSocial.headOf(null, m.character, 'sm') + '</span><span class="sc-fn">' + E(m.name) + (m.isOwner ? ' <small>Besitzer</small>' : '') + (m.title && c.TITLES[m.title] ? '<small>' + E(c.TITLES[m.title]) + '</small>' : '') + '</span><span class="sc-fa"><b>' + m.weekPoints + '</b> Pkt.' + (owner && m.pid !== me.pid ? '<button type="button" class="btn btn-ghost" data-a="kick" data-pid="' + E(m.pid) + '" aria-label="' + E(m.name) + ' entfernen">Entfernen</button><button type="button" class="btn btn-ghost" data-a="transfer" data-pid="' + E(m.pid) + '" aria-label="Besitz an ' + E(m.name) + ' übergeben">Besitz übergeben</button>' : '') + '</span></li>'; }).join('') + '</ul>' +
          (owner ? '<div class="sc-code"><span class="sc-muted">Einladungscode (14 Tage gültig)</span><b>' + E(g.code || '–') + '</b><span class="sc-btns"><button type="button" class="btn" data-a="newcode">Neuer Code</button></span></div>' : '') +
          ((g.awards || []).length ? '<p class="sc-note">Auszeichnungen: ' + g.awards.map(function (a) { return E(a.id || a); }).join(', ') + '</p>' : '') +
          '<div class="sc-btns"><button type="button" class="btn" data-a="leave">Gruppe verlassen</button>' + (owner ? '<button type="button" class="btn btn-ghost" data-a="disband">Gruppe auflösen</button>' : '') + '<button type="button" class="btn btn-ghost" data-a="report">Gruppe melden</button></div>';
        p.onclick = function (e) {
          var b = e.target.closest('button[data-a]'); if (!b) return; var a = b.getAttribute('data-a'), pid = b.getAttribute('data-pid');
          if (a === 'report') { if (global.MGReport) MGReport.open({ mode: 'profile', players: [g.name] }); return; }
          if ((a === 'leave' || a === 'disband' || a === 'kick' || a === 'transfer') && !confirm({ leave: 'Die Gruppe wirklich verlassen?', disband: 'Die Gruppe wirklich auflösen?', kick: 'Mitglied wirklich entfernen?', transfer: 'Besitz wirklich übergeben?' }[a])) return;
          c.api('groups/' + a, pid ? { pid: pid } : {}).then(function (r2) { if (r2.ok) { c.say('Erledigt.'); load(); } else c.say(err(r2), true); });
        };
      });
    }
    load();
  });

  // ═══ Ziele und Saison ═══
  MGSocial.addTab('ziele', 'Ziele', function (p, c) {
    p.innerHTML = '<p class="sc-muted">Lade …</p>';
    c.api('goals').then(function (r) {
      if (!r.ok) { p.innerHTML = '<p class="sc-muted">Ziele sind gerade nicht erreichbar.</p>'; return; }
      var j = r.j, s = c.me().season;
      p.innerHTML = '<h3 class="sc-h">Wochenziele (' + E(j.week) + ')</h3><p class="sc-note">' + j.doneCount + ' Ziele insgesamt geschafft. Neue Ziele ab Montag.</p>' +
        '<ul class="sc-flist">' + (j.goals || []).map(function (g) { var pc = g.target ? Math.min(100, Math.round(g.progress / g.target * 100)) : 0; return '<li class="sc-goal"><b>' + E(g.label) + '</b><span class="sc-bar" role="img" aria-label="' + g.progress + ' von ' + g.target + '"><i style="width:' + pc + '%"></i></span><span class="sc-muted">' + g.progress + ' / ' + g.target + (g.done ? ' · geschafft ✓' : '') + '</span></li>'; }).join('') + '</ul>' +
        (s ? '<h3 class="sc-h">Saison ' + E(s.id) + '</h3><div class="sc-grid">' + c.stat('Start-MMR', s.startMmr == null ? '–' : s.startMmr) + c.stat('Jetzt', s.mmr == null ? '–' : s.mmr) + c.stat('Veränderung', s.delta == null ? '–' : (s.delta > 0 ? '+' : '') + s.delta) + '</div><p class="sc-note">Die Saison zeigt nur deinen Verlauf. Dein Rang wird nicht zurückgesetzt. Am Saisonende gibt es eine Auszeichnung für deinen höchsten Rang.</p>' : '') +
        ((j.awards || []).length ? '<h3 class="sc-h">Auszeichnungen</h3><p>' + j.awards.map(function (a) { return E(a.id || a); }).join(', ') + '</p>' : '');
    });
  });

  // ═══ Privatsphaere: "Wer sieht was?" vom Server + Feed-Freigabe ═══
  MGSocial.onPrivacy(function (p, c) {
    var box = document.createElement('div'); box.className = 'sc-priv2'; p.insertBefore(box, p.firstChild);
    c.api('profile/privacy').then(function (r) {
      if (!r.ok) return; var j = r.j, nm = { header: 'Profilkopf und Skin', stats: 'Statistik', badges: 'Abzeichen', rank: 'Rang', feed: 'Aktivitäts-Feed' };
      function lst(a) { return (a && a.length) ? a.map(function (x) { return E(nm[x] || x); }).join(', ') : 'nichts'; }
      var cn = j.counts || {};
      box.innerHTML = '<h3 class="sc-h">Das sehen andere (Server-Stand)</h3><p><b>Fremde sehen:</b> ' + lst(j.strangers) + '.</p><p><b>Freunde sehen:</b> ' + lst(j.friends) + '.</p>' +
        '<p class="sc-note">Freunde: ' + (cn.friends || 0) + ' · Anfragen: ' + (cn.incoming || 0) + ' · Blockiert: ' + (cn.blocked || 0) + ' · Offene Duelle: ' + (cn.openDuels || 0) + ' · Gruppe: ' + (cn.group ? 'ja' : 'nein') + '</p>' +
        '<p class="sc-note">Gespeichert werden: ' + (j.stored || []).map(E).join(', ') + '.</p>' +
        '<div class="sc-row"><label for="sc-feedv">Aktivitäts-Feed für Freunde</label><select id="sc-feedv" class="form-input" style="max-width:260px"><option value="private"' + ((j.visibility && j.visibility.feed) !== 'friends' ? ' selected' : '') + '>Aus (Standard)</option><option value="friends"' + ((j.visibility && j.visibility.feed) === 'friends' ? ' selected' : '') + '>Für Freunde sichtbar</option></select></div>';
      box.querySelector('#sc-feedv').addEventListener('change', function (e) { c.api('profile/update', { visibility: { feed: e.target.value } }).then(function (r2) { if (r2.ok) c.say('Gespeichert.'); else c.say(err(r2), true); }); });
    });
    // "Alles privat" auch ueber den neuen Endpunkt (inkl. Feed)
    var ap = p.querySelector('#sc-allpriv'); if (ap) { var nb = ap.cloneNode(true); ap.parentNode.replaceChild(nb, ap); nb.addEventListener('click', function () { c.api('profile/privacy', { allPrivate: true }).then(function (r) { if (r.ok) { c.reloadMe().then(function () { c.rerender(); c.say('Alles ist jetzt privat.'); }); } else c.say(err(r), true); }); }); }
  });

  // Direktlink #duelle (nach einem Duell)
  if (location.hash === '#duelle' || location.hash === '#profil') {
    var tries = 0, iv = setInterval(function () { tries++; var ms = document.getElementById('mode-screen'), au = document.getElementById('auth-modal'); if (ms && !ms.classList.contains('hidden') && (!au || au.classList.contains('hidden'))) { clearInterval(iv); MGSocial.open(location.hash === '#profil' ? 'profil' : 'duelle'); } else if (tries > 60) clearInterval(iv); }, 400);
  }
})(window);
