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
const zlib = require('zlib');
const PNG = require('../tools/png.js');
const MGRanked = require('../ranked.js');
const idToken = require('./idtoken.js');

const NAME_RE = /^[a-z0-9_-]{3,16}$/;
const RESERVED = new Set(['admin', 'administrator', 'mod', 'moderator', 'mojang', 'minecraft', 'mineguess', 'support', 'system', 'null', 'undefined', 'server', 'owner', 'staff', 'notch', 'jeb', 'herobrine', 'steve', 'alex']);
// kleiner Wortfilter (nach Normalisierung von Leetspeak und Trennzeichen); keine Garantie, ergaenzt Meldungen
const BAD_WORDS = ['arsch', 'scheis', 'schiess', 'fick', 'ficken', 'hure', 'nazi', 'hitler', 'nigg', 'fuck', 'shit', 'bitch', 'porn', 'sex', 'wichs', 'kack', 'schlampe', 'hurensohn', 'fotze', 'pimmel', 'penis', 'vagina', 'idiot', 'spast', 'behindert', 'kill', 'suicid', 'rape', 'vergewalt', 'isis', 'terror'];
const VIS = new Set(['private', 'friends', 'public']);
const SECTIONS = ['header', 'stats', 'badges', 'rank', 'feed'];      // der Skin gehoert zum Kopf (header); feed: private|friends
const MAX_SKINS = 2000;
const SKIN_DATA_MAX = 24000, SKIN_BYTES_MAX = 16384;
const PNG_ALLOWED = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'pHYs', 'cHRM', 'sBIT']);
const BADGE_MAX = 40;
const TODAY = () => new Date().toISOString().slice(0, 10);
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

const SKIN_BURST = Number(process.env.PROFILE_SKIN_BURST) > 0 ? Number(process.env.PROFILE_SKIN_BURST) : 6;     // Skin-Aenderungen je Profil (danach 1 alle 10 min)
const RATE_FACTOR = Number(process.env.PROFILE_RATE_FACTOR) > 0 ? Number(process.env.PROFILE_RATE_FACTOR) : 1;       // Faktor auf alle Burst-Limits (nur Tests)
const CREATE_BURST = Number(process.env.PROFILE_CREATE_BURST) > 0 ? Number(process.env.PROFILE_CREATE_BURST) : 5;

/**
 * Skin pruefen und normalisieren: PNG-Data-URL, 64x64 oder 64x32, <= 16384 Byte, nur Bild-Chunks mit gueltiger CRC, begrenzte Entpackgroesse.
 * Rueckgabe { ok:true, b64 } (neu kodiertes, sauberes RGBA-PNG) oder { ok:false, error }.
 */
function normalizeSkin(dataUrl) {
  const PRE = 'data:image/png;base64,';
  if (typeof dataUrl !== 'string' || dataUrl.length > SKIN_DATA_MAX || !dataUrl.startsWith(PRE)) return { ok: false, error: 'skin_png' };
  const b64 = dataUrl.slice(PRE.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, error: 'skin_png' };
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > SKIN_BYTES_MAX) return { ok: false, error: 'skin_groesse' };
  if (buf.length < 45 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return { ok: false, error: 'skin_png' };
  let pos = 8, w = 0, h = 0, seenEnd = false, first = true; const idat = [];
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8);
    if (len > buf.length || pos + 12 + len > buf.length) return { ok: false, error: 'skin_png' };
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (PNG.crc32(buf.subarray(pos + 4, pos + 8 + len)) !== buf.readUInt32BE(pos + 8 + len)) return { ok: false, error: 'skin_png' };
    if (!PNG_ALLOWED.has(type)) return { ok: false, error: 'skin_png' };
    if (first && type !== 'IHDR') return { ok: false, error: 'skin_png' };
    first = false;
    if (type === 'IHDR') {
      if (len !== 13) return { ok: false, error: 'skin_png' };
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[12] !== 0 || data[10] !== 0 || data[11] !== 0) return { ok: false, error: 'skin_png' };   // kein Interlace
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { seenEnd = true; break; }
    pos += 12 + len;
  }
  if (!seenEnd || !idat.length) return { ok: false, error: 'skin_png' };
  if (!((w === 64 && h === 64) || (w === 64 && h === 32))) return { ok: false, error: 'skin_masse' };
  let img;
  try {
    zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: h * (w * 4 + 1) + 16 });       // Zip-Bomben abfangen
    img = PNG.decode(buf);
  } catch (e) { return { ok: false, error: 'skin_png' }; }
  if (img.w !== w || img.h !== h) return { ok: false, error: 'skin_png' };
  return { ok: true, b64: PNG.encode(img).toString('base64') };
}

function create(opts) {
  const { app, express, store, rankedStore, saveRankedSoon, sign, verify, apiAllowed, log, categories, getQuestions } = opts;
  let social = null;       // Runde 41: lib/social.js (wird am Ende eingehaengt)
  let profiles = store.get('profiles');
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) { profiles = {}; store.set('profiles', profiles); }
  let skins = store.get('skins');
  if (!skins || typeof skins !== 'object' || Array.isArray(skins)) { skins = {}; store.set('skins', skins); }
  const saveSkins = () => store.set('skins', skins);
  const skinUrl = (pid) => (skins[pid] ? 'data:image/png;base64,' + skins[pid] : null);
  const skinVer = (pid) => (skins[pid] ? crypto.createHash('sha1').update(skins[pid]).digest('hex').slice(0, 8) : null);
  const byKey = new Map(), byName = new Map(), byCode = new Map();
  const save = () => store.set('profiles', profiles);
  function reindex() {
    byKey.clear(); byName.clear(); byCode.clear();
    Object.values(profiles).forEach((p) => { byKey.set(p.key, p.pid); byName.set(p.name, p.pid); if (p.code && p.codeExp > Date.now()) byCode.set(p.code, p.pid); });
  }
  reindex();

  const json = express.json({ limit: '4kb' });
  const jsonBig = express.json({ limit: '48kb' });        // Skin (Data-URL bis 24000 Zeichen)
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
  function authToken(str) { const tk = verify(typeof str === 'string' ? str : ''); if (!tk || tk.t !== 'p' || !PID_RE.test(String(tk.pid))) return null; return profiles[tk.pid] || null; }
  const rankOf = (p) => { const e = rankedStore.get(p.key); return e && e.verified && e.games >= 1 ? { mmr: e.mmr, peak: e.peak, tier: e.tier, division: e.division, games: e.games, history: MGRanked.normalizeHistory(e.history) } : null; };
  const short = (p) => ({ pid: p.pid, name: p.name, character: p.character || null });
  const rel = (viewer, p) => (viewer.pid === p.pid ? 'self' : p.friends.includes(viewer.pid) ? 'friend' : 'none');

  // 'verified' = Google-Konto, serverseitig geprueft (geraeteuebergreifend sicher), 'unverified' = uid vom Client behauptet (Pruefung nicht moeglich), 'device' = nur dieses Geraet (Gast)
  const kindOf = (key, uv) => (key.startsWith('g:') ? 'device' : (uv ? 'verified' : 'unverified'));
  // mit Admin-Zugang zaehlen Konto-Kennungen nur aus geprueften ID-Tokens
  const tokenOk = (tk) => !(tk.k.startsWith('u:') && idToken.available() && !tk.uv);
  const hunterOf = (p) => { const n = p.hunter || 0; return { n, level: n >= 10 ? 3 : n >= 5 ? 2 : n >= 1 ? 1 : 0 }; };   // Fehlerjaeger-Abzeichen: Stufen bei 1/5/10 bestaetigten Meldungen
  function ownView(p) {
    return { pid: p.pid, hunter: hunterOf(p), accountKind: p.keyKind || kindOf(p.key, false), name: p.name, title: p.title || '', character: p.character || null, skin: skinUrl(p.pid), skinV: skinVer(p.pid), banner: p.banner || null, frame: p.frame || null, showcase: showcaseOf(p), awards: p.awards || [], duelWins: p.duelWins || 0, season: social ? social.seasonOf(p) : null, group: social && social.groupOf(p) ? { id: p.groupId, name: social.groupOf(p).name, symbol: social.groupOf(p).symbol, color: social.groupOf(p).color } : null,
      visibility: Object.assign({ feed: 'private' }, p.visibility), createdAt: p.createdAt,
      consent: p.consent, friendCode: p.code && p.codeExp > Date.now() ? showCode(p.code) : null, friendCodeExpires: p.code ? p.codeExp : null,
      stats: p.stats || null, badges: badgeList(p), rank: rankOf(p), counts: { friends: p.friends.length, incoming: p.incoming.length, outgoing: p.outgoing.length, blocked: p.blocked.length },
      renameAllowedAt: (p.renamedAt || 0) + RENAME_MS };
  }
  function viewFor(viewer, p) {
    const r = rel(viewer, p);
    if (r === 'self') return Object.assign({ relation: 'self' }, ownView(p));
    if (p.blocked.includes(viewer.pid) || viewer.blocked.includes(p.pid)) return null;
    const ok = (sec) => { const v = p.visibility[sec]; return v === 'public' || (v === 'friends' && r === 'friend'); };
    if (r !== 'friend' && !ok('header')) return null;                 // Fremde sehen ein privates Profil gar nicht
    const out = { relation: r, pid: p.pid, name: p.name, character: p.character || null, title: p.title || '' };
    if (skins[p.pid]) { out.skin = skinUrl(p.pid); out.skinV = skinVer(p.pid); }       // Skin gehoert zum Kopf (Freunde sehen ihn immer, Fremde nur bei oeffentlichem Kopf)
    if (ok('stats')) out.stats = p.stats || null;
    out.banner = p.banner || null; out.frame = p.frame || null;
    if (ok('badges')) { out.hunter = hunterOf(p); out.badges = badgeList(p); out.showcase = showcaseOf(p); out.awards = p.awards || []; }
    if (ok('rank')) out.rank = rankOf(p);
    return out;
  }
  const badgeList = (p) => (p.badges || []).map((b) => (typeof b === 'string' ? { id: b, date: null } : { id: b.id, date: b.date || null }));
  const showcaseOf = (p) => (p.showcase || []).map((id) => { const b = (p.badges || []).find((x) => (typeof x === 'string' ? x : x.id) === id); return b ? { id, date: (typeof b === 'string' ? null : b.date) || null } : null; }).filter(Boolean);
  const stripFrom = (list, pid) => { const i = list.indexOf(pid); if (i >= 0) list.splice(i, 1); };

  /**
   * Statistik pruefen (selbstberichtet, nur Anzeige). Grenzen und Plausibilitaet gegen Fake-Werte:
   * answered <= 1e6, correct <= answered, bestStreak <= min(answered, 10000), Summe der Kategorien <= answered/correct, Zaehler duerfen nicht
   * sinken und nicht unplausibel schnell wachsen. Rueckgabe { stats } oder { error }.
   */
  function cleanStats(s, prev, prevAt, now) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return { error: 'stats' };
    const n = (v, hi) => (Number.isInteger(v) && v >= 0 && v <= hi ? v : null);
    const answered = n(s.answered, 1e6), correct = n(s.correct, 1e6), bestStreak = n(s.bestStreak, 10000);
    if (answered === null || correct === null || bestStreak === null || correct > answered || bestStreak > answered) return { error: 'stats' };
    const out = { answered, correct, bestStreak, byCategory: {} };
    const opt = { dailyStreak: 3650, blitzBest: 1e6, hlBest: 10000, hardcoreBest: 10000, challengeBest: 10 };
    for (const k of Object.keys(opt)) if (s[k] !== undefined) { const v = n(s[k], opt[k]); if (v === null) return { error: 'stats' }; out[k] = v; }
    if (s.byCategory !== undefined) {
      if (!s.byCategory || typeof s.byCategory !== 'object' || Array.isArray(s.byCategory)) return { error: 'stats' };
      const keys = Object.keys(s.byCategory);
      if (keys.length > 30) return { error: 'stats' };
      let sumT = 0, sumC = 0;
      for (const k of keys) {
        const v = s.byCategory[k];
        if ((categories && !categories.has(k)) || !v || n(v.c, 1e6) === null || n(v.t, 1e6) === null || v.c > v.t) return { error: 'stats' };
        out.byCategory[k] = { c: v.c, t: v.t }; sumT += v.t; sumC += v.c;
      }
      if (sumT > answered || sumC > correct) return { error: 'stats' };
    }
    if (prev) {
      for (const k of ['answered', 'correct', 'bestStreak', 'dailyStreak', 'blitzBest', 'hlBest', 'hardcoreBest', 'challengeBest']) {
        if (out[k] !== undefined && prev[k] !== undefined && out[k] < prev[k]) return { error: 'stats_niedriger' };
        if (out[k] === undefined && prev[k] !== undefined) out[k] = prev[k];            // fehlende Felder behalten den alten Wert
      }
      const hours = Math.max(0, (now - (prevAt || now)) / 3600000);
      if (out.answered - (prev.answered || 0) > 2000 + 1500 * hours) return { error: 'stats_plausibel' };
    }
    return { stats: out };
  }
  /** Abzeichen: Liste von Id-Strings oder {id,date}; Datum nicht in der Zukunft und nicht vor 2025-01-01, hoechstens BADGE_MAX. */
  function cleanBadges(input, prev) {
    if (!Array.isArray(input) || input.length > BADGE_MAX) return null;
    const had = new Map((prev || []).map((b) => (typeof b === 'string' ? [b, null] : [b.id, b.date || null])));
    const today = TODAY(), tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10), out = new Map();
    for (const x of input) {
      const id = typeof x === 'string' ? x : (x && typeof x === 'object' ? x.id : null);
      if (typeof id !== 'string' || !BADGE_RE.test(id)) return null;
      let date = typeof x === 'string' ? (had.get(id) || today) : x.date;
      if (date === undefined || date === null) date = had.get(id) || today;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > tomorrow || date < '2025-01-01') return null;
      if (!out.has(id)) out.set(id, date);
    }
    return [...out.entries()].map(([id, date]) => ({ id, date }));
  }
  /** Skin-Aenderung: null = entfernen, String = pruefen+speichern. Rueckgabe { error } oder {} (nach Anwendung). */
  function applySkin(me, input) {
    if (input === null) { if (skins[me.pid]) { delete skins[me.pid]; saveSkins(); } return {}; }
    const r = normalizeSkin(input);
    if (!r.ok) return { error: r.error };
    if (!skins[me.pid] && Object.keys(skins).length >= MAX_SKINS) return { error: 'skin_voll' };
    skins[me.pid] = r.b64; saveSkins();
    return {};
  }

  // ── Konto anlegen / anmelden ───────────────────────────────────────────────────
  app.post('/api/profile/create', jsonBig, (req, res) => {
    try {
      if (!apiAllowed('prof-create', req.ip, CREATE_BURST, 720000)) return fail(res, 429, 'rate');   // je IP: 5, danach 1 alle 12 min (NAT: ENV PROFILE_CREATE_BURST)
      const b = req.body || {};
      const tk = verify(b.token);
      if (!tk || typeof tk.k !== 'string' || tk.t || !tokenOk(tk)) return fail(res, 401, tk && tk.k && !tokenOk(tk) ? 'id_token' : 'token');
      if (b.age14 !== true) return fail(res, 403, 'einwilligung');                 // "14+ oder Eltern erlauben es"
      if (byKey.has(tk.k)) return fail(res, 409, 'existiert');
      const name = typeof b.name === 'string' ? b.name.trim().toLowerCase() : '';
      const problem = nameProblem(name);
      if (problem) return fail(res, 400, 'name_' + problem);
      if (byName.has(name)) return fail(res, 409, 'name_vergeben');
      if (b.character !== undefined && b.character !== null && (typeof b.character !== 'string' || !CHARACTER_RE.test(b.character))) return fail(res, 400, 'character');
      if (Object.keys(profiles).length >= 20000) return fail(res, 503, 'voll');
      const pid = newPid(), now = Date.now(), code = newCode();
      profiles[pid] = { pid, key: tk.k, keyKind: kindOf(tk.k, !!tk.uv), name, title: '', character: b.character || null, createdAt: now, lastDay: new Date(now).toISOString().slice(0, 10),
        visibility: { header: 'private', stats: 'private', badges: 'private', rank: 'private', feed: 'private' }, consent: { age14: true, at: now, v: 1 },
        banner: null, frame: null, showcase: [], awards: [], goalsDone: 0, duelWins: 0, groupId: null,
        code, codeExp: now + CODE_TTL, stats: null, badges: [], friends: [], incoming: [], outgoing: [], blocked: [], renamedAt: 0 };
      byKey.set(tk.k, pid); byName.set(name, pid); byCode.set(code, pid);
      let skinError;
      if (b.skin !== undefined && b.skin !== null) { const sk = applySkin(profiles[pid], b.skin); if (sk.error) skinError = sk.error; }      // ungueltiger Skin: kein Skin, Konto wird trotzdem angelegt
      save();
      log('info', 'profile_created', {});
      res.json({ ok: true, pt: mkPt(pid), me: ownView(profiles[pid]), ...(skinError ? { skinError } : {}) });
    } catch (e) { log('error', 'profile_create_failed', { error: String(e.message).slice(0, 80) }); fail(res, 400, 'ungueltig'); }
  });

  app.post('/api/profile/login', json, (req, res) => {
    try {
      if (!apiAllowed('prof-login', req.ip, 20, 30000)) return fail(res, 429, 'rate');
      const tk = verify((req.body || {}).token);
      if (!tk || typeof tk.k !== 'string' || tk.t || !tokenOk(tk)) return fail(res, 401, tk && tk.k && !tokenOk(tk) ? 'id_token' : 'token');
      const pid = byKey.get(tk.k);
      if (!pid) return fail(res, 404, 'kein_profil');
      const p = profiles[pid]; p.lastDay = new Date().toISOString().slice(0, 10);
      if (tk.k.startsWith('u:') && tk.uv) p.keyKind = 'verified';
      save();
      res.json({ ok: true, pt: mkPt(pid), me: ownView(p) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  const guard = (req, res, kind, burst, refill) => {
    const me = auth(req);
    if (!me) { fail(res, 401, 'auth'); return null; }
    if (!apiAllowed(kind, me.pid, burst * RATE_FACTOR, refill) || !apiAllowed(kind + '-ip', req.ip, burst * 10 * RATE_FACTOR, refill)) { fail(res, 429, 'rate'); return null; }
    return me;
  };

  app.get('/api/profile/me', (req, res) => { const me = guard(req, res, 'prof-me', 30, 2000); if (me) res.json({ ok: true, me: ownView(me) }); });

  app.post('/api/profile/update', jsonBig, (req, res) => {
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
      if (b.title !== undefined) { if (typeof b.title !== 'string' || !social.hasId('title', b.title)) return fail(res, 400, 'title'); if (!social.canUse(me, 'title', b.title)) return fail(res, 400, 'nicht_freigeschaltet'); }
      for (const k of ['banner', 'frame']) if (b[k] !== undefined && b[k] !== null) { if (typeof b[k] !== 'string' || !social.hasId(k, b[k])) return fail(res, 400, k); if (!social.canUse(me, k, b[k])) return fail(res, 400, 'nicht_freigeschaltet'); }
      if (b.character !== undefined && b.character !== null && (typeof b.character !== 'string' || !CHARACTER_RE.test(b.character))) return fail(res, 400, 'character');
      let vis;
      if (b.visibility !== undefined) {
        if (!b.visibility || typeof b.visibility !== 'object' || Array.isArray(b.visibility)) return fail(res, 400, 'visibility');
        vis = Object.assign({}, me.visibility);
        for (const k of Object.keys(b.visibility)) { if (!SECTIONS.includes(k) || !VIS.has(b.visibility[k]) || (k === 'feed' && b.visibility[k] === 'public')) return fail(res, 400, 'visibility'); vis[k] = b.visibility[k]; }
      }
      let stats;
      if (b.stats !== undefined) { const cs = cleanStats(b.stats, me.stats, me.statsAt, now); if (cs.error) return fail(res, cs.error === 'stats' ? 400 : 409, cs.error); stats = cs.stats; }
      let badges;
      if (b.badges !== undefined) { badges = cleanBadges(b.badges, me.badges); if (!badges) return fail(res, 400, 'badges'); }
      let showcase;
      if (b.showcase !== undefined) {
        const have = new Set((badges || me.badges || []).map((x) => (typeof x === 'string' ? x : x.id)));
        if (!Array.isArray(b.showcase) || b.showcase.length > 3 || new Set(b.showcase).size !== b.showcase.length || b.showcase.some((x) => typeof x !== 'string' || !have.has(x))) return fail(res, 400, 'showcase');
        showcase = b.showcase;
      }
      if (name) { byName.delete(me.name); me.name = name; byName.set(name, me.pid); me.renamedAt = now; }
      if (b.title !== undefined) me.title = b.title;
      if (b.banner !== undefined) me.banner = b.banner;
      if (b.frame !== undefined) me.frame = b.frame;
      if (b.character !== undefined) me.character = b.character;
      if (vis) me.visibility = vis;
      if (stats) { social.beforeStats(me, stats); me.stats = stats; me.statsAt = now; social.onProgress(me); }
      if (badges) { const had = new Set((me.badges || []).map((x) => (typeof x === 'string' ? x : x.id))); const fresh = badges.map((x) => x.id).filter((id) => !had.has(id)); me.badges = badges; if (fresh.length) social.onNewBadges(me, fresh); }
      if (showcase) me.showcase = showcase; else if (badges && me.showcase) me.showcase = me.showcase.filter((id) => badges.some((x) => x.id === id));
      let skinError;
      if (b.skin !== undefined) { const sk = applySkin(me, b.skin); if (sk.error) skinError = sk.error; }      // ungueltiger Skin: alter Skin bleibt, Rest wird uebernommen
      if (b.newCode === true) { if (me.code) byCode.delete(me.code); me.code = newCode(); me.codeExp = now + CODE_TTL; byCode.set(me.code, me.pid); }
      save();
      res.json({ ok: true, me: ownView(me), ...(skinError ? { skinError } : {}) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  // ── Skin: eigenes Bild und (nach Sichtbarkeit) das von Freunden/Fremden ────────────
  app.post('/api/profile/skin', jsonBig, (req, res) => {
    try {
      const me = guard(req, res, 'prof-skin', SKIN_BURST, 600000); if (!me) return;
      const b = req.body || {};
      if (b.skin === undefined) return fail(res, 400, 'skin_png');
      const sk = applySkin(me, b.skin);
      if (sk.error) return fail(res, 400, sk.error);
      res.json({ ok: true, skin: skinUrl(me.pid), skinV: skinVer(me.pid) });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });
  app.get('/api/profile/skin', (req, res) => {
    const me = guard(req, res, 'prof-skinget', 60, 1000); if (!me) return;
    const pid = req.query.pid === undefined ? me.pid : String(req.query.pid);
    const p = PID_RE.test(pid) ? profiles[pid] : null;
    const v = p && viewFor(me, p);
    if (!v) return fail(res, 404, 'nicht_gefunden');
    res.json({ ok: true, skin: v.skin || null, skinV: v.skinV || null });
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
    const withSkins = req.query.skins === '1';
    const friends = me.friends.map((id) => profiles[id]).filter(Boolean).map((p, i) => {
      const o = Object.assign(short(p), { title: p.title || '' });
      if (skins[p.pid]) { o.skinV = skinVer(p.pid); if (withSkins && i < 40) o.skin = skinUrl(p.pid); }       // Skin-Bilder auf Wunsch fuer die ersten 40, sonst per /api/profile/skin?pid=
      if (p.visibility.stats === 'friends' || p.visibility.stats === 'public') o.lastSeenDay = p.lastDay || null;
      return o;
    });
    res.json({ ok: true, friends, incoming: list(me.incoming), outgoing: list(me.outgoing), blocked: list(me.blocked) });
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
      social.dropRelation(me.pid, other.pid);
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
        social.dropRelation(me.pid, other.pid);
      } else stripFrom(me.blocked, other.pid);
      save(); res.json({ ok: true });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  // ── DSGVO: Auskunft und Loeschung ────────────────────────────────────────────────
  app.get('/api/profile/export', (req, res) => {
    const me = guard(req, res, 'prof-exp', 5, 60000); if (!me) return;
    res.set('Content-Disposition', 'attachment; filename="mineguess-profil.json"');
    res.json({ exportedAt: new Date().toISOString(), profile: ownView(me), skin: skinUrl(me.pid), social: social.exportFor(me), friends: me.friends.map((id) => profiles[id]).filter(Boolean).map(short),
      incoming: me.incoming.map((id) => profiles[id]).filter(Boolean).map(short), outgoing: me.outgoing.map((id) => profiles[id]).filter(Boolean).map(short),
      blocked: me.blocked.map((id) => profiles[id]).filter(Boolean).map(short) });
  });

  app.post('/api/profile/delete', json, (req, res) => {
    try {
      const me = guard(req, res, 'prof-del', 3, 600000); if (!me) return;
      if ((req.body || {}).confirm !== 'LOESCHEN') return fail(res, 400, 'bestaetigung');
      Object.values(profiles).forEach((p) => { stripFrom(p.friends, me.pid); stripFrom(p.incoming, me.pid); stripFrom(p.outgoing, me.pid); stripFrom(p.blocked, me.pid); });
      byKey.delete(me.key); byName.delete(me.name); if (me.code) byCode.delete(me.code);
      social.onDelete(me.pid);
      try { const rp = store.get('reports'); if (Array.isArray(rp) && rp.some((r) => r.rk === me.pid)) { rp.forEach((r) => { if (r.rk === me.pid) delete r.rk; }); store.set('reports', rp); } } catch (e) { /* ignorieren */ }   // Zuordnung offener Meldungen entfernen
      delete profiles[me.pid];
      if (skins[me.pid]) { delete skins[me.pid]; saveSkins(); }
      const e = rankedStore.get(me.key);                                            // Ranglisten-Eintrag anonymisieren (Rang bleibt, Name nicht)
      if (e) { e.name = 'Spieler'; saveRankedSoon(); }
      save();
      log('info', 'profile_deleted', {});
      res.json({ ok: true });
    } catch (e) { fail(res, 400, 'ungueltig'); }
  });

  social = require('./social.js').mount({ app, express, store, fail, guard, rankedStore, rankOf, log, getQuestions, apiAllowed, profiles: () => profiles, saveProfiles: save, skinVer, nameProblem, badText, categories, viewFor, pidByKey: (k) => byKey.get(k) });
  /** Fuer Meldungen/Admin: anonyme Profil-Kennung zum Token (oder null) und Fehlerjaeger-Zaehler erhoehen. */
  const pidOfToken = (str) => { const p = authToken(str); return p ? p.pid : null; };
  const addHunter = (pid) => { const p = profiles[pid]; if (!p) return false; p.hunter = (p.hunter || 0) + 1; save(); return true; };
  return { profiles: () => profiles, reindex, nameProblem, NAME_RE, LIMITS, social, authToken, pidOfToken, addHunter, hunterOf };
}

/** Wortfilter fuer freie Kurztexte (z. B. Teamnamen) */
function badText(t) { const l = leet(String(t || '')); return BAD_WORDS.some((w) => l.includes(leet(w))); }

module.exports = { create, nameProblem, badText, normalizeSkin, NAME_RE, VIS, SECTIONS, TITLES };
