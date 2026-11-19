/**
 * Profile, Freundescode und Freunde (Phase 3 / Bonus 2). Alles serverseitig, gespeichert ueber lib/store.js (Dokument 'profiles').
 *
 * Grundsaetze: Pseudonym statt Klarname, kein Freitext/Chat/Foto, Sichtbarkeit je Bereich (Standard ueberall privat), Freunde nur gegenseitig
 * (Anfrage + Bestaetigung), Blockieren, Einwilligung "14+ oder Eltern erlauben es" wird mit Zeitpunkt gespeichert, Konto loeschen und Datenexport (DSGVO).
 * Authentifizierung: das signierte Ranked-Token (HMAC, ENV RANKED_SECRET) beweist den Besitz eines Spielerschluessels; daraus entsteht ein
 * signiertes Profil-Token ("pt", Header Authorization: Bearer <pt>). Ohne festes RANKED_SECRET verfallen Tokens bei jedem Neustart.
 *
 *   POST /api/profile/create   {token, name, age14:true, character?}            -> {ok, pt, me}
 *   POST /api/profile/login    {token}                                          -> {ok, pt, me}
 *   GET  /api/profile/me                                                        -> {ok, me}
 *   POST /api/profile/update   {name?, title?, character?, visibility?, stats?, badges?, newCode?:true} -> {ok, me}
 *   POST /api/profile/lookup   {code}                                           -> {ok, user:{pid,name,character}}
 *   GET  /api/profile/view?pid=                                                 -> {ok, profile}   (nach Sichtbarkeit)
 *   GET  /api/friends                                                           -> {ok, friends, incoming, outgoing, blocked}
 *   POST /api/friends/request  {code | pid}                                     -> {ok, status:'pending'|'friends'}
 *   POST /api/friends/respond  {pid, accept}                                    -> {ok}
 *   POST /api/friends/remove   {pid}                                            -> {ok}
 *   POST /api/profile/block    {pid, block:true|false}                          -> {ok}
 *   GET  /api/profile/export                                                    -> alle eigenen Daten
 *   POST /api/profile/delete   {confirm:'LOESCHEN'}                             -> {ok}
 */
const crypto = require('crypto');

const NAME_RE = /^[a-z0-9_-]{3,16}$/;
const RESERVED = new Set(['admin', 'administrator', 'mod', 'moderator', 'mojang', 'minecraft', 'mineguess', 'support', 'system', 'null', 'undefined', 'server', 'owner', 'staff', 'notch', 'jeb', 'herobrine', 'steve', 'alex']);
// kleiner Wortfilter (nach Normalisierung von Leetspeak und Trennzeichen); keine Garantie, ergaenzt Meldungen
const BAD_WORDS = ['arsch', 'scheis', 'schiess', 'fick', 'ficken', 'hure', 'nazi', 'hitler', 'nigg', 'fuck', 'shit', 'bitch', 'porn', 'sex', 'wichs', 'kack', 'schlampe', 'hurensohn', 'fotze', 'pimmel', 'penis', 'vagina', 'idiot', 'spast', 'behindert', 'kill', 'suicid', 'rape', 'vergewalt', 'isis', 'terror'];
const VIS = new Set(['private', 'friends', 'public']);
const SECTIONS = ['header', 'stats', 'badges', 'rank'];
const TITLES = new Set(['', 'redstone_profi', 'baumeister', 'entdecker', 'sammler', 'kampfhase', 'tueftler']);     // fester Katalog, kein Freitext
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL = 30 * 24 * 3600 * 1000;
const RENAME_MS = 30 * 24 * 3600 * 1000;
const LIMITS = { friends: 100, incoming: 50, outgoing: 50, blocked: 200 };
const CHARACTER_RE = /^[a-z0-9_-]{1,40}$/;
const BADGE_RE = /^[a-z0-9_]{2,30}$/;
const PID_RE = /^[a-z2-7]{10}$/;

const leet = (s) => s.toLowerCase().replace(/[01345$@7!|]/g, (c) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', $: 's', '@': 'a', 7: 't', '!': 'i', '|': 'i' }[c])).replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
function nameProblem(n) {
  if (typeof n !== 'string' || !NAME_RE.test(n)) return 'format';
  if (RESERVED.has(n)) return 'reserviert';
  const l = leet(n);
  if (BAD_WORDS.some((w) => l.includes(leet(w)))) return 'unzulaessig';
  if (/^[0-9_-]+$/.test(n)) return 'format';
  return null;
}

const CREATE_BURST = Number(process.env.PROFILE_CREATE_BURST) > 0 ? Number(process.env.PROFILE_CREATE_BURST) : 5;

function create(opts) {
  const { app, express, store, rankedStore, saveRankedSoon, sign, verify, apiAllowed, log, categories } = opts;
  let profiles = store.get('profiles');
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) { profiles = {}; store.set('profiles', profiles); }
  const byKey = new Map(), byName = new Map(), byCode = new Map();
  const save = () => store.set('profiles', profiles);
  function reindex() {
    byKey.clear(); byName.clear(); byCode.clear();
    Object.values(profiles).forEach((p) => { byKey.set(p.key, p.pid); byName.set(p.name, p.pid); if (p.code && p.codeExp > Date.now()) byCode.set(p.code, p.pid); });
  }
  reindex();

  const json = express.json({ limit: '4kb' });
  const fail = (res, status, error) => res.status(status).json({ ok: false, error });
  const newPid = () => { const a = 'abcdefghijklmnopqrstuvwxyz234567'; for (;;) { let s = ''; const b = crypto.randomBytes(10); for (let i = 0; i < 10; i++) s += a[b[i] % 32]; if (!profiles[s]) return s; } };
  function newCode() {
    for (;;) { let s = ''; const b = crypto.randomBytes(8); for (let i = 0; i < 8; i++) s += CODE_CHARS[b[i] % 32]; if (!byCode.has(s)) return s; }
  }
  const showCode = (c) => c.slice(0, 4) + '-' + c.slice(4);
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const mkPt = (pid) => sign({ t: 'p', pid, ts: Date.now() });

  function auth(req) {
    const h = String(req.headers.authorization || '');
    const tk = verify(h.startsWith('Bearer ') ? h.slice(7).trim() : '');
    if (!tk || tk.t !== 'p' || !PID_RE.test(String(tk.pid))) return null;
    const p = profiles[tk.pid];
    return p || null;
  }
  const rankOf = (p) => { const e = rankedStore.get(p.key); return e && e.verified && e.games >= 1 ? { mmr: e.mmr, peak: e.peak, tier: e.tier, division: e.division, games: e.games } : null; };
  const short = (p) => ({ pid: p.pid, name: p.name, character: p.character || null });
  const rel = (viewer, p) => (viewer.pid === p.pid ? 'self' : p.friends.includes(viewer.pid) ? 'friend' : 'none');

  function ownView(p) {
    return { pid: p.pid, name: p.name, title: p.title || '', character: p.character || null, visibility: p.visibility, createdAt: p.createdAt,
      consent: p.consent, friendCode: p.code && p.codeExp > Date.now() ? showCode(p.code) : null, friendCodeExpires: p.code ? p.codeExp : null,
      stats: p.stats || null, badges: p.badges || [], rank: rankOf(p), counts: { friends: p.friends.length, incoming: p.incoming.length, outgoing: p.outgoing.length, blocked: p.blocked.length },
      renameAllowedAt: (p.renamedAt || 0) + RENAME_MS };
  }
  function viewFor(viewer, p) {
    const r = rel(viewer, p);
    if (r === 'self') return Object.assign({ relation: 'self' }, ownView(p));
    if (p.blocked.includes(viewer.pid) || viewer.blocked.includes(p.pid)) return null;
    const ok = (sec) => { const v = p.visibility[sec]; return v === 'public' || (v === 'friends' && r === 'friend'); };
    if (r !== 'friend' && !ok('header')) return null;                 // Fremde sehen ein privates Profil gar nicht
    const out = { relation: r, pid: p.pid, name: p.name, character: p.character || null, title: p.title || '' };
    if (ok('stats')) out.stats = p.stats || null;
    if (ok('badges')) out.badges = p.badges || [];
    if (ok('rank')) out.rank = rankOf(p);
    return out;
  }
  const stripFrom = (list, pid) => { const i = list.indexOf(pid); if (i >= 0) list.splice(i, 1); };

  function cleanStats(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const n = (v, hi) => (Number.isInteger(v) && v >= 0 && v <= hi ? v : null);
    const answered = n(s.answered, 1e6), correct = n(s.correct, 1e6), bestStreak = n(s.bestStreak, 10000);
    if (answered === null || correct === null || bestStreak === null || correct > answered) return null;
    const by = {};
    if (s.byCategory !== undefined) {
      if (!s.byCategory || typeof s.byCategory !== 'object' || Array.isArray(s.byCategory)) return null;
      const keys = Object.keys(s.byCategory);
      if (keys.length > 30) return null;
      for (const k of keys) {
        const v = s.byCategory[k];
        if ((categories && !categories.has(k)) || !v || n(v.c, 1e6) === null || n(v.t, 1e6) === null || v.c > v.t) return null;
        by[k] = { c: v.c, t: v.t };
      }
    }
    const out = { answered, correct, bestStreak, byCategory: by };
    if (s.hlBest !== undefined) { const h = n(s.hlBest, 10000); if (h === null) return null; out.hlBest = h; }
    if (s.hardcoreBest !== undefined) { const h = n(s.hardcoreBest, 10000); if (h === null) return null; out.hardcoreBest = h; }
    return out;
  }

  // ── Konto anlegen / anmelden ───────────────────────────────────────────────────
  app.post('/api/profile/create', json, (req, res) => {
    try {
      if (!apiAllowed('prof-create', req.ip, CREATE_BURST, 720000)) return fail(res, 429, 'rate');   // je IP: 5, danach 1 alle 12 min (NAT: ENV PROFILE_CREATE_BURST)
      const b = req.body || {};
      const tk = verify(b.token);
      if (!tk || typeof tk.k !== 'string' || tk.t) return fail(res, 401, 'token');
      if (b.age14 !== true) return fail(res, 403, 'einwilligung');                 // "14+ oder Eltern erlauben es"
      if (byKey.has(tk.k)) return fail(res, 409, 'existiert');
      const name = typeof b.name === 'string' ? b.name.trim().toLowerCase() : '';
      const problem = nameProblem(name);
      if (problem) return fail(res, 400, 'name_' + problem);
      if (byName.has(name)) return fail(res, 409, 'name_vergeben');
      if (b.character !== undefined && b.character !== null && (typeof b.character !== 'string' || !CHARACTER_RE.test(b.character))) return fail(res, 400, 'character');
      if (Object.keys(profiles).length >= 20000) return fail(res, 503, 'voll');
      const pid = newPid(), now = Date.now(), code = newCode();
      profiles[pid] = { pid, key: tk.k, name, title: '', character: b.character || null, createdAt: now, lastDay: new Date(now).toISOString().slice(0, 10),
        visibility: { header: 'private', stats: 'private', badges: 'private', rank: 'private' }, consent: { age14: true, at: now, v: 1 },
        code, codeExp: now + CODE_TTL, stats: null, badges: [], friends: [], incoming: [], outgoing: [], blocked: [], renamedAt: 0 };
      byKey.set(tk.k, pid); byName.set(name, pid); byCode.set(code, pid);
      save();
      log('info', 'profile_created', {});
      res.json({ ok: true, pt: mkPt(pid), me: ownView(profiles[pid]) });
    } catch (e) { log('error', 'profile_create_failed', { error: String(e.message).slice(0, 80) }); fail(res, 400, 'ungueltig'); }
  });

  app.post('/api/profile/login', json, (req, res) => {
    try {
      if (!apiAllowed('prof-login', req.ip, 20, 30000)) return fail(res, 429, 'rate');
      const tk = verify((req.body || {}).token);
      if (!tk || typeof tk.k !== 'string' || tk.t) return fail(res, 401, 'token');
      const pid = byKey.get(tk.k);
      if (!pid) return fail(res, 404, 'kein_profil');
      const p = profiles[pid]; p.lastDay = new Date().toISOString().slice(0, 10); save();
      res.json({ ok: true, pt: mkPt(pid), me: ownView(p) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  const guard = (req, res, kind, burst, refill) => {
    const me = auth(req);
    if (!me) { fail(res, 401, 'auth'); return null; }
    if (!apiAllowed(kind, me.pid, burst, refill) || !apiAllowed(kind + '-ip', req.ip, burst * 10, refill)) { fail(res, 429, 'rate'); return null; }
    return me;
  };

  app.get('/api/profile/me', (req, res) => { const me = guard(req, res, 'prof-me', 30, 2000); if (me) res.json({ ok: true, me: ownView(me) }); });

  app.post('/api/profile/update', json, (req, res) => {
    try {
      const me = guard(req, res, 'prof-upd', 20, 3000); if (!me) return;
      const b = req.body || {}, now = Date.now();
      // erst alles pruefen, dann uebernehmen
      let name;
      if (b.name !== undefined) {
        name = typeof b.name === 'string' ? b.name.trim().toLowerCase() : '';
        if (name !== me.name) {
          const problem = nameProblem(name); if (problem) return fail(res, 400, 'name_' + problem);
          if (byName.has(name)) return fail(res, 409, 'name_vergeben');
          if (me.renamedAt && now - me.renamedAt < RENAME_MS) return fail(res, 429, 'umbenennen_gesperrt');
        } else name = undefined;
      }
      if (b.title !== undefined && (typeof b.title !== 'string' || !TITLES.has(b.title))) return fail(res, 400, 'title');
      if (b.character !== undefined && b.character !== null && (typeof b.character !== 'string' || !CHARACTER_RE.test(b.character))) return fail(res, 400, 'character');
      let vis;
      if (b.visibility !== undefined) {
        if (!b.visibility || typeof b.visibility !== 'object' || Array.isArray(b.visibility)) return fail(res, 400, 'visibility');
        vis = Object.assign({}, me.visibility);
        for (const k of Object.keys(b.visibility)) { if (!SECTIONS.includes(k) || !VIS.has(b.visibility[k])) return fail(res, 400, 'visibility'); vis[k] = b.visibility[k]; }
      }
      let stats;
      if (b.stats !== undefined) { stats = cleanStats(b.stats); if (!stats) return fail(res, 400, 'stats'); }
      let badges;
      if (b.badges !== undefined) { if (!Array.isArray(b.badges) || b.badges.length > 60 || b.badges.some((x) => typeof x !== 'string' || !BADGE_RE.test(x))) return fail(res, 400, 'badges'); badges = [...new Set(b.badges)]; }
      if (name) { byName.delete(me.name); me.name = name; byName.set(name, me.pid); me.renamedAt = now; }
      if (b.title !== undefined) me.title = b.title;
      if (b.character !== undefined) me.character = b.character;
      if (vis) me.visibility = vis;
      if (stats) me.stats = stats;
      if (badges) me.badges = badges;
      if (b.newCode === true) { if (me.code) byCode.delete(me.code); me.code = newCode(); me.codeExp = now + CODE_TTL; byCode.set(me.code, me.pid); }
      save();
      res.json({ ok: true, me: ownView(me) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  // ── Suche nur ueber Freundescode (kein Durchsuchen aller Nutzer) ───────────────────
  app.post('/api/profile/lookup', json, (req, res) => {
    try {
      const me = guard(req, res, 'prof-look', 20, 180000); if (!me) return;     // 20 Versuche, danach 1 alle 3 min
      const code = normCode((req.body || {}).code);
      const pid = code.length === 8 ? byCode.get(code) : null;
      const p = pid && profiles[pid];
      if (!p || p.codeExp < Date.now() || p.blocked.includes(me.pid) || p.pid === me.pid) return fail(res, 404, 'nicht_gefunden');
      res.json({ ok: true, user: short(p), relation: p.friends.includes(me.pid) ? 'friend' : p.incoming.includes(me.pid) ? 'requested' : p.outgoing.includes(me.pid) ? 'incoming' : 'none' });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  app.get('/api/profile/view', (req, res) => {
    const me = guard(req, res, 'prof-view', 40, 1500); if (!me) return;
    const pid = String(req.query.pid || '');
    const p = PID_RE.test(pid) ? profiles[pid] : null;
    const v = p && viewFor(me, p);
    if (!v) return fail(res, 404, 'nicht_gefunden');
    res.json({ ok: true, profile: v });
  });

  // ── Freunde ──────────────────────────────────────────────────────────────────────
  app.get('/api/friends', (req, res) => {
    const me = guard(req, res, 'fr-list', 30, 2000); if (!me) return;
    const list = (ids) => ids.map((id) => profiles[id]).filter(Boolean).map(short);
    res.json({ ok: true, friends: list(me.friends), incoming: list(me.incoming), outgoing: list(me.outgoing), blocked: list(me.blocked) });
  });

  app.post('/api/friends/request', json, (req, res) => {
    try {
      const me = guard(req, res, 'fr-req', 10, 360000); if (!me) return;         // 10 Anfragen, danach 1 alle 6 min
      const b = req.body || {};
      let target = null;
      if (b.code !== undefined) { const pid = byCode.get(normCode(b.code)); target = pid && profiles[pid]; if (target && target.codeExp < Date.now()) target = null; }
      else if (typeof b.pid === 'string' && PID_RE.test(b.pid)) { target = profiles[b.pid]; if (target && !(me.incoming.includes(target.pid))) target = null; }   // per pid nur als Antwort auf eine Anfrage
      if (!target || target.pid === me.pid || target.blocked.includes(me.pid) || me.blocked.includes(target.pid)) return fail(res, 404, 'nicht_gefunden');
      if (me.friends.includes(target.pid)) return res.json({ ok: true, status: 'friends' });
      if (me.outgoing.includes(target.pid)) return res.json({ ok: true, status: 'pending' });
      if (me.incoming.includes(target.pid)) {                                       // beide wollen: sofort Freunde
        stripFrom(me.incoming, target.pid); stripFrom(target.outgoing, me.pid);
        me.friends.push(target.pid); target.friends.push(me.pid); save();
        return res.json({ ok: true, status: 'friends' });
      }
      if (me.friends.length >= LIMITS.friends || target.friends.length >= LIMITS.friends) return fail(res, 409, 'limit_freunde');
      if (me.outgoing.length >= LIMITS.outgoing || target.incoming.length >= LIMITS.incoming) return fail(res, 409, 'limit_anfragen');
      me.outgoing.push(target.pid); target.incoming.push(me.pid); save();
      res.json({ ok: true, status: 'pending' });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  app.post('/api/friends/respond', json, (req, res) => {
    try {
      const me = guard(req, res, 'fr-resp', 20, 3000); if (!me) return;
      const b = req.body || {};
      const other = typeof b.pid === 'string' && PID_RE.test(b.pid) ? profiles[b.pid] : null;
      if (!other || typeof b.accept !== 'boolean' || !me.incoming.includes(other.pid)) return fail(res, 404, 'keine_anfrage');
      stripFrom(me.incoming, other.pid); stripFrom(other.outgoing, me.pid);
      if (b.accept) {
        if (me.friends.length >= LIMITS.friends || other.friends.length >= LIMITS.friends) { save(); return fail(res, 409, 'limit_freunde'); }
        me.friends.push(other.pid); other.friends.push(me.pid);
      }
      save();
      res.json({ ok: true });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  app.post('/api/friends/remove', json, (req, res) => {
    try {
      const me = guard(req, res, 'fr-rm', 20, 3000); if (!me) return;
      const other = typeof (req.body || {}).pid === 'string' && PID_RE.test(req.body.pid) ? profiles[req.body.pid] : null;
      if (!other) return fail(res, 404, 'nicht_gefunden');
      [me, other].forEach((p, i) => { const o = i ? me : other; stripFrom(p.friends, o.pid); stripFrom(p.incoming, o.pid); stripFrom(p.outgoing, o.pid); });
      save(); res.json({ ok: true });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  app.post('/api/profile/block', json, (req, res) => {
    try {
      const me = guard(req, res, 'prof-block', 20, 3000); if (!me) return;
      const b = req.body || {};
      const other = typeof b.pid === 'string' && PID_RE.test(b.pid) ? profiles[b.pid] : null;
      if (!other || other.pid === me.pid || typeof b.block !== 'boolean') return fail(res, 400, 'ungueltig');
      if (b.block) {
        if (!me.blocked.includes(other.pid)) { if (me.blocked.length >= LIMITS.blocked) return fail(res, 409, 'limit_blockiert'); me.blocked.push(other.pid); }
        [me, other].forEach((p, i) => { const o = i ? me : other; stripFrom(p.friends, o.pid); stripFrom(p.incoming, o.pid); stripFrom(p.outgoing, o.pid); });
      } else stripFrom(me.blocked, other.pid);
      save(); res.json({ ok: true });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  // ── DSGVO: Auskunft und Loeschung ────────────────────────────────────────────────
  app.get('/api/profile/export', (req, res) => {
    const me = guard(req, res, 'prof-exp', 5, 60000); if (!me) return;
    res.set('Content-Disposition', 'attachment; filename="mineguess-profil.json"');
    res.json({ exportedAt: new Date().toISOString(), profile: ownView(me), friends: me.friends.map((id) => profiles[id]).filter(Boolean).map(short),
      incoming: me.incoming.map((id) => profiles[id]).filter(Boolean).map(short), outgoing: me.outgoing.map((id) => profiles[id]).filter(Boolean).map(short),
      blocked: me.blocked.map((id) => profiles[id]).filter(Boolean).map(short) });
  });

  app.post('/api/profile/delete', json, (req, res) => {
    try {
      const me = guard(req, res, 'prof-del', 3, 600000); if (!me) return;
      if ((req.body || {}).confirm !== 'LOESCHEN') return fail(res, 400, 'bestaetigung');
      Object.values(profiles).forEach((p) => { stripFrom(p.friends, me.pid); stripFrom(p.incoming, me.pid); stripFrom(p.outgoing, me.pid); stripFrom(p.blocked, me.pid); });
      byKey.delete(me.key); byName.delete(me.name); if (me.code) byCode.delete(me.code);
      delete profiles[me.pid];
      const e = rankedStore.get(me.key);                                            // Ranglisten-Eintrag anonymisieren (Rang bleibt, Name nicht)
      if (e) { e.name = 'Spieler'; saveRankedSoon(); }
      save();
      log('info', 'profile_deleted', {});
      res.json({ ok: true });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  return { profiles: () => profiles, reindex, nameProblem, NAME_RE, LIMITS };
}

/** Wortfilter fuer freie Kurztexte (z. B. Teamnamen) */
function badText(t) { const l = leet(String(t || '')); return BAD_WORDS.some((w) => l.includes(leet(w))); }

module.exports = { create, nameProblem, badText, NAME_RE, VIS, SECTIONS, TITLES };
