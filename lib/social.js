/**
 * Soziales (Runde 41): Kataloge (Titel, Banner, Rahmen), Freunde-Duelle, Freunde-Rangliste, Aktivitaetsfeed, Vergleich, "Wer sieht was?",
 * Gruppen, Wochenziele, Saison. Wird von lib/profiles.js eingehaengt (gleiche Anmeldung, gleiche Sichtbarkeits- und Block-Regeln).
 * Datenschutz-Standards: kein Chat, keine Direktnachrichten, kein Freitext, keine Kommentare; alles stammt aus festen Listen oder geprueften Daten.
 */
const crypto = require('crypto');
const Challenge = require('../challenge.js');
const MGRanked = require('../ranked.js');

const TIER_ORDER = ['copper', 'iron', 'gold', 'diamond', 'netherite'];
const DAY = 86400000;
const REACTIONS = ['herz', 'daumen', 'feuer'];
const SYMBOLS = ['schwert', 'spitzhacke', 'schild', 'bogen', 'apfel', 'diamant', 'smaragd', 'totem', 'creeper', 'tnt', 'fackel', 'herz'];
const COLORS = ['rot', 'blau', 'gruen', 'gelb', 'lila', 'orange', 'tuerkis', 'pink'];

// Voraussetzungen: null | {badge} | {stat,min} | {category,min} | {rank} | {duelWins} | {goals} | {group:true}
const TITLES = [
  { id: '', label: 'Kein Titel', requires: null }, { id: 'neuling', label: 'Neuling', requires: null }, { id: 'tueftler', label: 'Tüftler', requires: null },
  { id: 'seriensieger', label: 'Seriensieger', requires: { stat: 'bestStreak', min: 20 } }, { id: 'blitzer', label: 'Blitzer', requires: { stat: 'blitzBest', min: 5000 } },
  { id: 'redstone_profi', label: 'Redstone-Profi', requires: { category: 'Redstone', min: 50 } }, { id: 'baumeister', label: 'Baumeister', requires: { badge: 'craft_master' } },
  { id: 'entdecker', label: 'Entdecker', requires: { badge: 'all_categories' } }, { id: 'sammler', label: 'Sammler', requires: { stat: 'badges', min: 10 } },
  { id: 'kampfhase', label: 'Kampfhase', requires: { stat: 'hardcoreBest', min: 10 } }, { id: 'rangjaeger', label: 'Rangjäger', requires: { rank: 'iron' } },
  { id: 'duellant', label: 'Duellant', requires: { duelWins: 3 } }, { id: 'wochenheld', label: 'Wochenheld', requires: { goals: 5 } }, { id: 'gruppenfreund', label: 'Gruppenfreund', requires: { group: true } },
];
const BANNERS = [
  { id: 'ebene', label: 'Ebene', requires: null }, { id: 'wueste', label: 'Wüste', requires: null }, { id: 'taiga', label: 'Taiga', requires: null }, { id: 'dschungel', label: 'Dschungel', requires: null },
  { id: 'ozean', label: 'Ozean', requires: { stat: 'answered', min: 200 } }, { id: 'kirschhain', label: 'Kirschhain', requires: { badge: 'daily_7' } },
  { id: 'nether', label: 'Nether', requires: { rank: 'iron' } }, { id: 'end', label: 'Ende', requires: { rank: 'gold' } },
];
const FRAMES = [
  { id: 'keiner', label: 'Kein Rahmen', requires: null }, { id: 'eisen', label: 'Eisen', requires: { rank: 'iron' } }, { id: 'gold', label: 'Gold', requires: { rank: 'gold' } },
  { id: 'diamant', label: 'Diamant', requires: { rank: 'diamond' } }, { id: 'netherit', label: 'Netherit', requires: { rank: 'netherite' } },
];
const KINDS = { title: TITLES, banner: BANNERS, frame: FRAMES };

// Wochenziele (Fortschritt aus Statistik-Zuwachs seit Wochenbeginn bzw. geprueften Ranked-Laeufen/Duellen)
const GOALS = [
  { id: 'g_answered200', label: '200 Fragen beantworten', type: 'answered', target: 200 }, { id: 'g_correct150', label: '150 Fragen richtig beantworten', type: 'correct', target: 150 },
  { id: 'g_craft50', label: '50 Crafting-Fragen richtig', type: 'category', category: 'Crafting', target: 50 }, { id: 'g_redstone30', label: '30 Redstone-Fragen richtig', type: 'category', category: 'Redstone', target: 30 },
  { id: 'g_mobs40', label: '40 Mob-Fragen richtig', type: 'category', category: 'Mobs', target: 40 }, { id: 'g_ranked5', label: '5 gewertete Ranked-Läufe', type: 'ranked_runs', target: 5 },
  { id: 'g_duel1', label: 'Ein Freunde-Duell gewinnen', type: 'duel_wins', target: 1 }, { id: 'g_daily5', label: '5 Tage täglich spielen (Serie)', type: 'dailyStreak', target: 5 },
];

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - (day - 1));
  const thu = new Date(d); thu.setUTCDate(d.getUTCDate() + 4 - day);
  const y = thu.getUTCFullYear(), w = Math.ceil((((thu - Date.UTC(y, 0, 1)) / DAY) + 1) / 7);
  return { id: y + '-W' + String(w).padStart(2, '0'), startMs: monday.getTime(), endMs: monday.getTime() + 7 * DAY, startDay: monday.toISOString().slice(0, 10) };
}
function season(date) {
  const y = date.getUTCFullYear(), q = Math.floor(date.getUTCMonth() / 3);
  return { id: y + '-Q' + (q + 1), startsAt: Date.UTC(y, q * 3, 1), endsAt: Date.UTC(y, q * 3 + 3, 1) };
}
function seededPick(list, seedStr, n) {
  let h = 2166136261; for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const arr = list.slice(); const out = [];
  for (let k = 0; k < n && arr.length; k++) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; out.push(arr.splice(h % arr.length, 1)[0]); }
  return out;
}

function evalSeason(p, e, atMs) {
  const sn = season(new Date(atMs)), st = p.seasonState;
  let award = null, state = st;
  if (st && st.id !== sn.id) {                         // Saison gewechselt: Auszeichnung fuer die alte, wenn dort gewertet wurde
    const sp = e && e.season && e.season.id === st.id ? e.season : null;
    if (sp) { const tier = TIER_ORDER[MGRanked.rankInfo(sp.peak).idx]; award = 'saison_' + st.id.toLowerCase().replace('-', '') + '_' + tier; }
    state = null;
  }
  if (!state && e && e.verified) state = { id: sn.id, startMmr: e.mmr };
  return { sn, award, state };
}

function mount(ctx) {
  const { app, express, store, fail, guard, rankedStore, rankOf, log, getQuestions, apiAllowed } = ctx;
  const profiles = ctx.profiles;                          // () => Objekt pid -> Profil
  let soc = store.get('social');
  if (!soc || typeof soc !== 'object' || Array.isArray(soc)) soc = {};
  soc.duels = soc.duels || {}; soc.groups = soc.groups || {}; soc.feed = soc.feed || {};
  store.set('social', soc);
  const save = () => store.set('social', soc);
  const json = express.json({ limit: '4kb' });
  const jsonBig = express.json({ limit: '16kb' });
  const rid = (n) => { const a = 'abcdefghijklmnopqrstuvwxyz234567'; const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += a[b[i] % 32]; return s; };
  const P = (pid) => profiles()[pid] || null;
  const friends = (a, b) => !!a && !!b && a.friends.includes(b.pid);
  const blockedEither = (a, b) => a.blocked.includes(b.pid) || b.blocked.includes(a.pid);
  const tierIdx = (t) => TIER_ORDER.indexOf(t);
  const peakTierIdx = (p) => { const e = rankedStore.get(p.key); if (!e || !e.verified || e.games < 1) return -1; return MGRanked.rankInfo(Math.max(e.peak || 0, e.mmr || 0)).idx; };

  // ── Freischaltungen ─────────────────────────────────────────────────────────
  function meets(p, rq) {
    if (!rq) return true;
    const st = p.stats || {};
    if (rq.badge) return (p.badges || []).some((b) => (typeof b === 'string' ? b : b.id) === rq.badge);
    if (rq.stat === 'badges') return (p.badges || []).length >= rq.min;
    if (rq.stat) return (st[rq.stat] || 0) >= rq.min;
    if (rq.category) return ((st.byCategory || {})[rq.category] || { c: 0 }).c >= rq.min;
    if (rq.rank) return peakTierIdx(p) >= tierIdx(rq.rank);
    if (rq.duelWins) return (p.duelWins || 0) >= rq.duelWins;
    if (rq.goals) return (p.goalsDone || 0) >= rq.goals;
    if (rq.group) return !!p.groupId;
    return false;
  }
  const catalogOf = (p, list) => list.map((x) => ({ id: x.id, label: x.label, requires: x.requires, unlocked: meets(p, x.requires) }));
  function canUse(p, kind, id) { const x = (KINDS[kind] || []).find((e) => e.id === id); return !!x && meets(p, x.requires); }
  const hasId = (kind, id) => (KINDS[kind] || []).some((e) => e.id === id);

  app.get('/api/profile/catalog', (req, res) => {
    const me = guard(req, res, 'cat', 30, 2000); if (!me) return;
    const sn = season(new Date());
    res.json({ ok: true, titles: catalogOf(me, TITLES), banners: catalogOf(me, BANNERS), frames: catalogOf(me, FRAMES), reactions: REACTIONS, symbols: SYMBOLS, colors: COLORS,
      goals: GOALS.map((g) => ({ id: g.id, label: g.label, type: g.type, target: g.target })), season: { id: sn.id, startsAt: sn.startsAt, endsAt: sn.endsAt } });
  });

  // ── Feed (Eintraege entstehen automatisch, Anzeige nur nach Freigabe) ───────────
  function addFeed(pid, type, data) {
    const list = soc.feed[pid] || (soc.feed[pid] = []);
    list.push({ id: rid(10), type, data: data || {}, ts: Date.now(), react: {} });
    while (list.length > 50) list.shift();
    save();
  }

  // ── Duelle ─────────────────────────────────────────────────────────────────────
  const DUEL_TTL = Number(process.env.DUEL_TTL_MS) > 0 ? Number(process.env.DUEL_TTL_MS) : 48 * 3600 * 1000, MAX_OPEN = 5, MAX_PER_DAY = 20;   // ENV nur fuer Tests
  const mini = (p) => ({ pid: p.pid, name: p.name, character: p.character || null });
  function winnerOf(d) {
    const [x, y] = [d.a, d.b], rx = d.results[x], ry = d.results[y];
    if (rx && !ry) return x; if (ry && !rx) return y; if (!rx && !ry) return null;
    if (rx.correct !== ry.correct) return rx.correct > ry.correct ? x : y;
    if (rx.points !== ry.points) return rx.points > ry.points ? x : y;
    const sx = rx.seconds == null ? Infinity : rx.seconds, sy = ry.seconds == null ? Infinity : ry.seconds;
    if (sx !== sy) return sx < sy ? x : y;
    return 'draw';
  }
  function finishDuel(d, expired) {
    if (d.status === 'finished') return;
    d.status = 'finished'; d.winner = winnerOf(d); d.doneAt = Date.now(); d.expiredEarly = !!expired;
    if (d.winner && d.winner !== 'draw') {
      const w = P(d.winner), l = P(d.winner === d.a ? d.b : d.a);
      if (w) { w.duelWins = (w.duelWins || 0) + 1; (w.duelLog = w.duelLog || []).push(Date.now()); if (w.duelLog.length > 60) w.duelLog.shift(); addFeed(w.pid, 'duel_won', { opponent: l ? { pid: l.pid, name: l.name } : null }); ctx.saveProfiles(); onProgress(w); }
    }
  }
  function touchDuel(d) {
    if (['pending', 'active'].includes(d.status) && Date.now() > d.expiresAt) {
      if (d.status === 'pending') { d.status = 'expired'; d.doneAt = Date.now(); }
      else if (d.results[d.a] || d.results[d.b]) finishDuel(d, true);
      else { d.status = 'expired'; d.doneAt = Date.now(); }
      save();
    }
    return d;
  }
  function duelView(d, me) {
    touchDuel(d);
    const a = P(d.a), b = P(d.b);
    const both = !!(d.results[d.a] && d.results[d.b]), seeAll = d.status === 'finished' || both;
    const results = {}; results[d.a] = (seeAll || me.pid === d.a) ? (d.results[d.a] || null) : (d.results[d.a] ? { submitted: true } : null);
    results[d.b] = (seeAll || me.pid === d.b) ? (d.results[d.b] || null) : (d.results[d.b] ? { submitted: true } : null);
    const out = { id: d.id, status: d.status, from: a ? mini(a) : { pid: d.a, name: '?' }, to: b ? mini(b) : { pid: d.b, name: '?' }, createdAt: d.createdAt, expiresAt: d.expiresAt, results, mine: { submitted: !!d.results[me.pid] }, winner: d.status === 'finished' ? d.winner : null };
    if (d.seed && ['active', 'finished'].includes(d.status)) { out.seed = d.seed; out.questionIds = d.qids; }
    return out;
  }
  const myDuels = (me) => Object.values(soc.duels).filter((d) => d.a === me.pid || d.b === me.pid).map(touchDuel);
  const openCount = (pid) => Object.values(soc.duels).filter((d) => (d.a === pid || d.b === pid) && ['pending', 'active'].includes(touchDuel(d).status)).length;

  app.post('/api/duels/create', json, (req, res) => {
    try {
      const me = guard(req, res, 'duel-new', 10, 60000); if (!me) return;
      const other = typeof (req.body || {}).pid === 'string' ? P(req.body.pid) : null;
      if (!other || other.pid === me.pid || !friends(me, other) || blockedEither(me, other)) return fail(res, 404, 'nicht_gefunden');
      const now = Date.now();
      const created = Object.values(soc.duels).filter((d) => d.a === me.pid && now - d.createdAt < DAY).length;
      if (created >= MAX_PER_DAY) return fail(res, 429, 'limit_tag');
      if (openCount(me.pid) >= MAX_OPEN || openCount(other.pid) >= MAX_OPEN) return fail(res, 409, 'limit_offen');
      const dup = Object.values(soc.duels).some((d) => ((d.a === me.pid && d.b === other.pid) || (d.a === other.pid && d.b === me.pid)) && ['pending', 'active'].includes(touchDuel(d).status));
      if (dup) return fail(res, 409, 'bereits_offen');
      if (Object.keys(soc.duels).length > 20000) return fail(res, 503, 'voll');
      const id = rid(10), seed = Challenge.newSeed();
      const sel = Challenge.select(getQuestions(), seed);
      if (!sel.ok) return fail(res, 503, 'fragen');
      soc.duels[id] = { id, a: me.pid, b: other.pid, status: 'pending', createdAt: now, expiresAt: now + DUEL_TTL, seed, qids: sel.ids, results: {}, winner: null };
      save();
      res.json({ ok: true, duel: duelView(soc.duels[id], me) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });
  app.get('/api/duels', (req, res) => {
    const me = guard(req, res, 'duel-list', 30, 2000); if (!me) return;
    const list = myDuels(me).filter((d) => { const o = P(d.a === me.pid ? d.b : d.a); return o && !blockedEither(me, o); }).sort((x, y) => y.createdAt - x.createdAt);
    const v = (d) => duelView(d, me);
    res.json({ ok: true, incoming: list.filter((d) => d.status === 'pending' && d.b === me.pid).map(v), outgoing: list.filter((d) => d.status === 'pending' && d.a === me.pid).map(v),
      active: list.filter((d) => d.status === 'active').map(v), finished: list.filter((d) => ['finished', 'declined', 'expired', 'cancelled'].includes(d.status)).slice(0, 20).map(v) });
  });
  app.get('/api/duels/get', (req, res) => {
    const me = guard(req, res, 'duel-get', 40, 1500); if (!me) return;
    const d = soc.duels[String(req.query.id || '')];
    if (!d || (d.a !== me.pid && d.b !== me.pid)) return fail(res, 404, 'nicht_gefunden');
    const o = P(d.a === me.pid ? d.b : d.a); if (!o || blockedEither(me, o)) return fail(res, 404, 'nicht_gefunden');
    res.json({ ok: true, duel: duelView(d, me) });
  });
  const duelOf = (req, res, me, body) => {
    const d = soc.duels[String((body || {}).id || '')];
    if (!d || (d.a !== me.pid && d.b !== me.pid)) { fail(res, 404, 'nicht_gefunden'); return null; }
    const o = P(d.a === me.pid ? d.b : d.a);
    if (!o || blockedEither(me, o)) { fail(res, 404, 'nicht_gefunden'); return null; }
    touchDuel(d); return d;
  };
  app.post('/api/duels/respond', json, (req, res) => {
    try {
      const me = guard(req, res, 'duel-resp', 20, 3000); if (!me) return;
      const d = duelOf(req, res, me, req.body); if (!d) return;
      if (d.b !== me.pid || d.status !== 'pending' || typeof req.body.accept !== 'boolean') return fail(res, 409, 'status');
      d.status = req.body.accept ? 'active' : 'declined'; if (req.body.accept) d.expiresAt = Date.now() + DUEL_TTL; else d.doneAt = Date.now();
      save(); res.json({ ok: true, duel: duelView(d, me) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });
  app.post('/api/duels/cancel', json, (req, res) => {
    try {
      const me = guard(req, res, 'duel-cancel', 20, 3000); if (!me) return;
      const d = duelOf(req, res, me, req.body); if (!d) return;
      if (d.a !== me.pid || d.status !== 'pending') return fail(res, 409, 'status');
      d.status = 'cancelled'; d.doneAt = Date.now(); save(); res.json({ ok: true });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });
  app.post('/api/duels/result', jsonBig, (req, res) => {
    try {
      const me = guard(req, res, 'duel-res', 20, 3000); if (!me) return;
      const d = duelOf(req, res, me, req.body); if (!d) return;
      if (d.status !== 'active') return fail(res, 409, 'status');
      if (d.results[me.pid]) return fail(res, 409, 'bereits_abgegeben');
      const r = (req.body || {}).results;
      if (!Array.isArray(r) || r.length !== 10) return fail(res, 400, 'ergebnis');
      let total = 0;
      for (const x of r) {
        if (!x || typeof x.correct !== 'boolean' || !Number.isInteger(x.attempts) || x.attempts < 1 || x.attempts > 3 || !Number.isInteger(x.ms) || x.ms < 0 || x.ms > 600000) return fail(res, 400, 'ergebnis');
        if (x.ms < 400) return fail(res, 400, 'unplausibel');
        total += x.ms;
      }
      if (total < 8000) return fail(res, 400, 'unplausibel');
      const points = (req.body || {}).points == null ? 0 : (Number.isInteger(req.body.points) && req.body.points >= 0 && req.body.points <= 4000 ? req.body.points : null);
      if (points === null) return fail(res, 400, 'ergebnis');
      d.results[me.pid] = Challenge.summary({ seed: d.seed, results: r, points });
      if (d.results[d.a] && d.results[d.b]) finishDuel(d, false);
      save();
      res.json({ ok: true, duel: duelView(d, me) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });
  app.post('/api/duels/rematch', json, (req, res) => {
    try {
      const me = guard(req, res, 'duel-new', 10, 60000); if (!me) return;
      const d = duelOf(req, res, me, req.body); if (!d) return;
      if (d.status !== 'finished') return fail(res, 409, 'status');
      const other = P(d.a === me.pid ? d.b : d.a);
      if (!friends(me, other)) return fail(res, 404, 'nicht_gefunden');
      req.body = { pid: other.pid };
      const now = Date.now();
      if (openCount(me.pid) >= MAX_OPEN || openCount(other.pid) >= MAX_OPEN) return fail(res, 409, 'limit_offen');
      const id = rid(10), seed = Challenge.newSeed(), sel = Challenge.select(getQuestions(), seed);
      if (!sel.ok) return fail(res, 503, 'fragen');
      soc.duels[id] = { id, a: me.pid, b: other.pid, status: 'pending', createdAt: now, expiresAt: now + DUEL_TTL, seed, qids: sel.ids, results: {}, winner: null };
      save(); res.json({ ok: true, duel: duelView(soc.duels[id], me) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  // ── Freunde-Rangliste (nur geprueftes Ranked, nur freigegebene Bereiche) ──────────
  function weekDelta(e, days) {
    const from = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
    const h = MGRanked.normalizeHistory(e && e.history).filter((x) => x.day && x.day >= from);
    return { delta: h.reduce((n, x) => n + x.delta, 0), runs: h.length };
  }
  app.get('/api/friends/leaderboard', (req, res) => {
    const me = guard(req, res, 'fr-lb', 20, 3000); if (!me) return;
    const period = req.query.period === 'week' ? 'week' : 'all';
    const rows = []; let hidden = 0;
    const consider = [me].concat(me.friends.map(P).filter(Boolean));
    for (const p of consider) {
      const self = p.pid === me.pid;
      if (!self && !['friends', 'public'].includes((p.visibility || {}).rank)) { hidden++; continue; }
      const e = rankedStore.get(p.key), r = rankOf(p);
      if (!r) { if (self) rows.push({ pid: p.pid, name: p.name, character: p.character || null, title: p.title || '', isSelf: true, mmr: null, tier: null, division: null, games: 0, weekDelta: 0, weekRuns: 0 }); else hidden++; continue; }
      const w = weekDelta(e, 7);
      const row = { pid: p.pid, name: p.name, character: p.character || null, title: p.title || '', isSelf: self, mmr: r.mmr, tier: r.tier, division: r.division, games: r.games, weekDelta: w.delta, weekRuns: w.runs };
      if (ctx.skinVer(p.pid)) row.skinV = ctx.skinVer(p.pid);
      rows.push(row);
    }
    rows.sort((x, y) => (period === 'week' ? (y.weekDelta - x.weekDelta) : 0) || ((y.mmr || -1) - (x.mmr || -1)));
    res.json({ ok: true, period, rows, hidden });
  });

  // ── Feed lesen und reagieren ────────────────────────────────────────────────────
  const FEED_DAYS = 30;
  const feedAudience = (me) => [me].concat(me.friends.map(P).filter(Boolean)).filter((p) => p.pid === me.pid || (((p.visibility || {}).feed === 'friends') && !blockedEither(me, p)));
  function feedEvents(me) {
    const cut = Date.now() - FEED_DAYS * DAY, out = [];
    for (const p of feedAudience(me)) {
      const list = soc.feed[p.pid]; if (!list) continue;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].ts < cut) list.splice(i, 1);
      for (const ev of list) out.push({ p, ev });
    }
    return out;
  }
  app.get('/api/feed', (req, res) => {
    const me = guard(req, res, 'feed', 30, 2000); if (!me) return;
    const events = feedEvents(me).sort((a, b) => b.ev.ts - a.ev.ts).slice(0, 50).map(({ p, ev }) => {
      const reactions = { herz: 0, daumen: 0, feuer: 0 };
      Object.values(ev.react).forEach((r) => { if (reactions[r] !== undefined) reactions[r]++; });
      return { id: ev.id, pid: p.pid, name: p.name, character: p.character || null, type: ev.type, data: ev.data, ts: ev.ts, reactions, mine: ev.react[me.pid] || null };
    });
    res.json({ ok: true, events });
  });
  app.post('/api/feed/react', json, (req, res) => {
    try {
      const me = guard(req, res, 'feed-react', 60, 10000); if (!me) return;
      const b = req.body || {};
      if (typeof b.eventId !== 'string' || !(b.reaction === null || REACTIONS.includes(b.reaction))) return fail(res, 400, 'ungueltig');
      const hit = feedEvents(me).find(({ ev }) => ev.id === b.eventId);
      if (!hit || hit.p.pid === me.pid) return fail(res, 404, 'nicht_gefunden');            // nur Eintraege von Freunden
      if (b.reaction === null) delete hit.ev.react[me.pid]; else hit.ev.react[me.pid] = b.reaction;
      save(); res.json({ ok: true });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  // ── Vergleich mit Freunden (nur sichtbare Bereiche) ──────────────────────────────
  const BEST_KEYS = ['bestStreak', 'hlBest', 'hardcoreBest', 'blitzBest', 'dailyStreak', 'challengeBest'];
  app.get('/api/profile/compare', (req, res) => {
    const me = guard(req, res, 'cmp', 20, 3000); if (!me) return;
    const other = P(String(req.query.pid || ''));
    if (!other || !friends(me, other) || blockedEither(me, other)) return fail(res, 404, 'nicht_gefunden');
    const v = ctx.viewFor(me, other);
    if (!v) return fail(res, 404, 'nicht_gefunden');
    const mine = me.stats || null, theirs = v.stats || null;
    const cats = new Set([...Object.keys((mine && mine.byCategory) || {}), ...Object.keys((theirs && theirs.byCategory) || {})]);
    res.json({ ok: true, me: { name: me.name, stats: mine, rank: rankOf(me) }, other: { name: other.name, stats: theirs, rank: v.rank || null },
      categories: [...cats].sort().map((c) => ({ category: c, me: (mine && mine.byCategory && mine.byCategory[c]) || null, other: (theirs && theirs.byCategory && theirs.byCategory[c]) || null })),
      bests: BEST_KEYS.map((k) => ({ key: k, me: mine && mine[k] !== undefined ? mine[k] : null, other: theirs && theirs[k] !== undefined ? theirs[k] : null })) });
  });

  // ── "Wer sieht was?" ─────────────────────────────────────────────────────────────
  const SECTION_NAMES = ['header', 'stats', 'badges', 'rank'];
  function privacyView(me) {
    const vis = Object.assign({ header: 'private', stats: 'private', badges: 'private', rank: 'private', feed: 'private' }, me.visibility);
    const strangers = SECTION_NAMES.filter((s) => vis[s] === 'public');
    const fr = ['header'].concat(SECTION_NAMES.filter((s) => s !== 'header' && ['friends', 'public'].includes(vis[s])));
    if (vis.feed === 'friends') fr.push('feed');
    const open = Object.values(soc.duels).filter((d) => (d.a === me.pid || d.b === me.pid) && ['pending', 'active'].includes(touchDuel(d).status)).length;
    return { allPrivate: SECTION_NAMES.concat('feed').every((s) => vis[s] === 'private'), visibility: vis, strangers, friends: fr,
      counts: { friends: me.friends.length, incoming: me.incoming.length, outgoing: me.outgoing.length, blocked: me.blocked.length, openDuels: open, group: !!me.groupId },
      stored: ['pseudonym', 'titel', 'banner', 'rahmen', 'skin', 'statistik', 'abzeichen', 'rang', 'freunde', 'duelle', 'feed', 'gruppe', 'wochenziele', 'einwilligung'] };
  }
  app.get('/api/profile/privacy', (req, res) => { const me = guard(req, res, 'priv', 30, 2000); if (me) res.json(Object.assign({ ok: true }, privacyView(me))); });
  app.post('/api/profile/privacy', json, (req, res) => {
    try {
      const me = guard(req, res, 'priv-set', 10, 5000); if (!me) return;
      if ((req.body || {}).allPrivate !== true) return fail(res, 400, 'ungueltig');
      me.visibility = { header: 'private', stats: 'private', badges: 'private', rank: 'private', feed: 'private' };
      ctx.saveProfiles();
      res.json(Object.assign({ ok: true }, privacyView(me)));
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  // ── Hooks fuer geprueften Rangaufstieg ───────────────────────────────────────────
  function onRankUp(key, d) { const pid = ctx.pidByKey(key); if (pid) addFeed(pid, 'rank_up', { tier: d.tier, division: d.division }); }
  function onNewBadges(p, ids) { ids.slice(0, 5).forEach((id) => addFeed(p.pid, 'badge', { id })); }

  // ── Wochenziele und Auszeichnungen ───────────────────────────────────────────────
  const nowMs = () => Date.now();
  const weekNow = () => isoWeek(new Date(nowMs()));
  const rankedGames = (p) => { const e = rankedStore.get(p.key); return e && e.verified ? (e.games || 0) : 0; };
  const statSnap = (st) => ({ answered: (st && st.answered) || 0, correct: (st && st.correct) || 0, cats: Object.fromEntries(Object.entries((st && st.byCategory) || {}).map(([k, v]) => [k, v.c])) });
  /** Wochenbasis anlegen, wenn die Woche wechselt: Zuwachs zaehlt ab dem Stand vor der ersten Meldung der Woche. */
  function ensureWeek(p, incoming) {
    const w = weekNow();
    if (p.goals && p.goals.week === w.id) return p.goals;
    const base = Object.assign(statSnap(p.stats || incoming), { ranked: rankedGames(p), duelWins: p.duelWins || 0 });
    p.goals = { week: w.id, base, done: [], noStats: !p.stats && !incoming };
    return p.goals;
  }
  const weekGoals = (w) => seededPick(GOALS, w.id, 3);
  function progressOf(p, g) {
    const base = p.goals.base, st = p.stats || {};
    if (g.type === 'answered') return Math.max(0, (st.answered || 0) - base.answered);
    if (g.type === 'correct') return Math.max(0, (st.correct || 0) - base.correct);
    if (g.type === 'category') return Math.max(0, (((st.byCategory || {})[g.category] || { c: 0 }).c) - (base.cats[g.category] || 0));
    if (g.type === 'ranked_runs') return Math.max(0, rankedGames(p) - base.ranked);
    if (g.type === 'duel_wins') return Math.max(0, (p.duelWins || 0) - base.duelWins);
    if (g.type === 'dailyStreak') return st.dailyStreak || 0;
    return 0;
  }
  function addAward(p, id) {
    p.awards = p.awards || [];
    if (p.awards.some((a) => a.id === id)) return false;
    p.awards.push({ id, date: new Date(nowMs()).toISOString().slice(0, 10) });
    addFeed(p.pid, 'award', { id });
    return true;
  }
  /** Ziele pruefen: neu erreichte zaehlen genau einmal; Meilensteine geben Auszeichnungen. */
  function onProgress(p) {
    if (!p) return;
    const w = weekNow(), goals = ensureWeek(p, null);
    let changed = false;
    for (const g of weekGoals(w)) {
      if (goals.done.includes(g.id) || progressOf(p, g) < g.target) continue;
      goals.done.push(g.id); p.goalsDone = (p.goalsDone || 0) + 1; changed = true;
      addFeed(p.pid, 'goal', { id: g.id });
      for (const m of [1, 5, 10]) if (p.goalsDone >= m) addAward(p, 'wochenziel_' + m);
    }
    if (changed) { ctx.saveProfiles(); save(); }
  }
  /** Vor dem Uebernehmen neuer Statistik (profiles.update): Wochenbasis sichern. */
  function beforeStats(p, incoming) {
    const g = ensureWeek(p, incoming);
    if (g.noStats && !p.stats) { g.base = Object.assign(statSnap(incoming), { ranked: rankedGames(p), duelWins: p.duelWins || 0 }); g.noStats = false; }   // erste Statistik: kein Fortschritt aus Altbestand
  }
  function goalsView(p) {
    const w = weekNow(); ensureWeek(p, null); onProgress(p);
    const goals = weekGoals(w).map((g) => { const pr = progressOf(p, g); return { id: g.id, label: g.label, type: g.type, target: g.target, progress: Math.min(pr, g.target), done: p.goals.done.includes(g.id) }; });
    return { week: w.id, endsAt: w.endMs, goals, doneCount: p.goalsDone || 0, awards: p.awards || [] };
  }
  app.get('/api/goals', (req, res) => { const me = guard(req, res, 'goals', 30, 2000); if (me) res.json(Object.assign({ ok: true }, goalsView(me))); });

  // ── Saison (Kalenderquartal, nur Anzeige; die MMR-Logik bleibt unveraendert) ─────────
  function seasonOf(p) {
    const e = rankedStore.get(p.key), r = evalSeason(p, e, nowMs());
    p.seasonState = r.state;
    if (r.award && addAward(p, r.award)) { ctx.saveProfiles(); save(); }
    const sn = r.sn, now = e && e.verified ? e.mmr : null, sp = e && e.season && e.season.id === sn.id ? e.season.peak : null;
    return { id: sn.id, startsAt: sn.startsAt, endsAt: sn.endsAt, startMmr: r.state ? r.state.startMmr : null, mmr: now, delta: r.state && now != null ? now - r.state.startMmr : null,
      peakTier: sp != null ? TIER_ORDER[MGRanked.rankInfo(sp).idx] : null };
  }

  // ── Gruppen (bis 8, kein Chat) ───────────────────────────────────────────────────
  const GROUP_MAX = 8, GROUP_CODE_TTL = 14 * DAY;
  const G = (id) => soc.groups[id] || null;
  const groupOf = (p) => (p.groupId ? G(p.groupId) : null);
  const gname = (s) => String(s || '').trim().toLowerCase();
  function newGroupCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (;;) { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += a[b[i] % 32]; if (!Object.values(soc.groups).some((g) => g.code === s)) return s; } }
  function weekPoints(p, w) {
    const e = rankedStore.get(p.key);
    const h = MGRanked.normalizeHistory(e && e.verified ? e.history : []).filter((x) => x.day && x.day >= w.startDay);
    const duels = (p.duelLog || []).filter((t) => t >= w.startMs && t < w.endMs).length;
    const goals = p.goals && p.goals.week === w.id ? p.goals.done.length : 0;
    return h.reduce((n, x) => n + 100 + 10 * x.correct, 0) + duels * 50 + goals * 100;
  }
  function groupView(g, me) {
    const w = weekNow();
    const members = g.members.map(P).filter(Boolean).map((m) => ({ pid: m.pid, name: m.name, character: m.character || null, title: m.title || '', isOwner: m.pid === g.owner, weekPoints: weekPoints(m, w) })).sort((a, b) => b.weekPoints - a.weekPoints);
    const points = members.reduce((n, m) => n + m.weekPoints, 0), target = 1000 + 500 * (g.members.length - 1);
    const done = points >= target;
    if (done && !(g.awards || []).some((a) => a.id === 'koop_' + w.id)) { (g.awards = g.awards || []).push({ id: 'koop_' + w.id, date: new Date(nowMs()).toISOString().slice(0, 10) }); save(); }
    const out = { id: g.id, name: g.name, symbol: g.symbol, color: g.color, ownerPid: g.owner, createdAt: g.createdAt, members, week: { id: w.id, points, goal: { target, points: Math.min(points, target), done } }, awards: g.awards || [] };
    if (g.owner === me.pid) { out.code = g.codeExp > nowMs() ? g.code : null; out.codeExpires = g.codeExp; }
    return out;
  }
  function removeMember(g, pid) {
    const i = g.members.indexOf(pid); if (i >= 0) g.members.splice(i, 1);
    const p = P(pid); if (p) p.groupId = null;
    if (!g.members.length) delete soc.groups[g.id];
    else if (g.owner === pid) { g.owner = g.members[0]; g.code = newGroupCode(); g.codeExp = nowMs() + GROUP_CODE_TTL; }     // dienstaeltestes Mitglied uebernimmt, neuer Code
  }
  app.get('/api/groups/me', (req, res) => { const me = guard(req, res, 'grp-me', 30, 2000); if (!me) return; const g = groupOf(me); res.json({ ok: true, group: g ? groupView(g, me) : null }); });
  app.post('/api/groups/create', json, (req, res) => {
    try {
      const me = guard(req, res, 'grp-new', 3, 600000); if (!me) return;
      const b = req.body || {}, name = gname(b.name);
      if (groupOf(me)) return fail(res, 409, 'bereits_in_gruppe');
      const problem = ctx.nameProblem(name); if (problem) return fail(res, 400, 'name_' + problem);
      if (!SYMBOLS.includes(b.symbol)) return fail(res, 400, 'symbol');
      if (!COLORS.includes(b.color)) return fail(res, 400, 'color');
      if (Object.values(soc.groups).some((g) => g.name === name)) return fail(res, 409, 'name_vergeben');
      if (Object.keys(soc.groups).length >= 5000) return fail(res, 503, 'voll');
      const id = rid(8), now = nowMs();
      soc.groups[id] = { id, name, symbol: b.symbol, color: b.color, owner: me.pid, members: [me.pid], code: newGroupCode(), codeExp: now + GROUP_CODE_TTL, createdAt: now, awards: [] };
      me.groupId = id; ctx.saveProfiles(); save();
      res.json({ ok: true, group: groupView(soc.groups[id], me) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });
  app.post('/api/groups/join', json, (req, res) => {
    try {
      const me = guard(req, res, 'grp-join', 10, 120000); if (!me) return;
      if (groupOf(me)) return fail(res, 409, 'bereits_in_gruppe');
      const code = String((req.body || {}).code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const g = code.length === 8 ? Object.values(soc.groups).find((x) => x.code === code && x.codeExp > nowMs()) : null;
      if (!g) return fail(res, 404, 'nicht_gefunden');
      if (g.members.length >= GROUP_MAX) return fail(res, 409, 'voll');
      if (g.members.some((m) => { const o = P(m); return o && blockedEither(me, o); })) return fail(res, 404, 'nicht_gefunden');
      g.members.push(me.pid); me.groupId = g.id; ctx.saveProfiles(); save();
      res.json({ ok: true, group: groupView(g, me) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });
  const ownerGroup = (req, res, kind) => { const me = guard(req, res, kind, 20, 3000); if (!me) return {}; const g = groupOf(me); if (!g || g.owner !== me.pid) { fail(res, 403, 'nur_besitzer'); return {}; } return { me, g }; };
  app.post('/api/groups/leave', json, (req, res) => { try { const me = guard(req, res, 'grp-leave', 10, 3000); if (!me) return; const g = groupOf(me); if (!g) return fail(res, 404, 'keine_gruppe'); removeMember(g, me.pid); ctx.saveProfiles(); save(); res.json({ ok: true }); } catch (e) { fail(res, 400, 'ungueltig'); } });
  app.post('/api/groups/kick', json, (req, res) => {
    try {
      const { me, g } = ownerGroup(req, res, 'grp-kick'); if (!g) return;
      const pid = (req.body || {}).pid;
      if (typeof pid !== 'string' || pid === me.pid || !g.members.includes(pid)) return fail(res, 404, 'nicht_gefunden');
      removeMember(g, pid); ctx.saveProfiles(); save(); res.json({ ok: true, group: groupView(g, me) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });
  app.post('/api/groups/transfer', json, (req, res) => {
    try {
      const { me, g } = ownerGroup(req, res, 'grp-transfer'); if (!g) return;
      const pid = (req.body || {}).pid;
      if (typeof pid !== 'string' || pid === me.pid || !g.members.includes(pid)) return fail(res, 404, 'nicht_gefunden');
      g.owner = pid; save(); res.json({ ok: true, group: groupView(g, me) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });
  app.post('/api/groups/newcode', json, (req, res) => { try { const { me, g } = ownerGroup(req, res, 'grp-code'); if (!g) return; g.code = newGroupCode(); g.codeExp = nowMs() + GROUP_CODE_TTL; save(); res.json({ ok: true, group: groupView(g, me) }); } catch (e) { fail(res, 400, 'ungueltig'); } });
  app.post('/api/groups/disband', json, (req, res) => {
    try {
      const { me, g } = ownerGroup(req, res, 'grp-disband'); if (!g) return;
      g.members.slice().forEach((pid) => { const p = P(pid); if (p) p.groupId = null; });
      delete soc.groups[g.id]; ctx.saveProfiles(); save(); res.json({ ok: true });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  // ── Aufraeumen / Auskunft ──────────────────────────────────────────────────────
  function dropRelation(a, b) {                           // Freundschaft beendet oder blockiert: offene Duelle schliessen
    let ch = false;
    Object.values(soc.duels).forEach((d) => { if (((d.a === a && d.b === b) || (d.a === b && d.b === a)) && ['pending', 'active'].includes(d.status)) { d.status = 'cancelled'; d.doneAt = Date.now(); ch = true; } });
    if (ch) save();
  }
  function onDelete(pid) {
    const gp = P(pid) && groupOf(P(pid)); if (gp) removeMember(gp, pid);
    Object.keys(soc.duels).forEach((id) => { const d = soc.duels[id]; if (d.a === pid || d.b === pid) delete soc.duels[id]; });
    delete soc.feed[pid];
    Object.values(soc.feed).forEach((list) => list.forEach((ev) => { delete ev.react[pid]; }));
    save();
  }
  function exportFor(p) {
    const g = groupOf(p);
    return { group: g ? { id: g.id, name: g.name, symbol: g.symbol, color: g.color, isOwner: g.owner === p.pid, members: g.members.length } : null, goals: p.goals || null, awards: p.awards || [], duels: Object.values(soc.duels).filter((d) => d.a === p.pid || d.b === p.pid).map((d) => duelView(d, p)), feed: (soc.feed[p.pid] || []).map((e) => ({ id: e.id, type: e.type, data: e.data, ts: e.ts })) };
  }

  return { onRankedCommit: (key) => { const pid = ctx.pidByKey(key); if (pid) onProgress(P(pid)); }, ensureWeek, beforeStats, onProgress, goalsView, seasonOf, evalSeason, weekPoints, groupOf, groupView, weekGoals, onRankUp, onNewBadges, canUse, hasId, meets, catalogOf, addFeed, dropRelation, onDelete, exportFor, soc: () => soc, saveSoc: save, isoWeek, season, seededPick, GOALS, REACTIONS, SYMBOLS, COLORS, TITLES, BANNERS, FRAMES, P, friends, blockedEither, onProgress: (p) => onProgress(p) };
}

module.exports = { mount, evalSeason, isoWeek, season, TITLES, BANNERS, FRAMES, GOALS, REACTIONS, SYMBOLS, COLORS };
