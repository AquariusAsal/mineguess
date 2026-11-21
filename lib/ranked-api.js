/**
 * Server-validierter Ranked-Modus (Anti-Cheat).
 * Ablauf eines Laufs (10 Fragen):
 *   POST /api/ranked/start  {uid|gid, name, token?, profile?, history?, seen?}  -> {runId, profile, token, total}
 *   POST /api/ranked/next   {runId}                                            -> {question (ohne Loesung), index, total}
 *   POST /api/ranked/hint   {runId, level}                                     -> {text, hints}
 *   POST /api/ranked/answer {runId, answer | timeout:true}                     -> Rueckmeldung; bei Endergebnis zusaetzlich
 *                                  {final:true, correct, answer, funFact, delta, result{before,after,promoted,demoted,...}, profile, token, runDone}
 * Die Loesung verlaesst den Server erst nach der letzten Antwort einer Frage. MMR wird hier berechnet (ranked.js), das Profil
 * wird mit HMAC-SHA256 signiert (ENV RANKED_SECRET; ohne ENV zufaelliges Secret je Start -> Tokens verfallen beim Neustart).
 * Die Rangliste (GET /api/ranked) zeigt nur Eintraege, die aus diesem Ablauf stammen (verified).
 */
const crypto = require('crypto');
const idToken = require('./idtoken.js');
const seasonId = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + '-Q' + (Math.floor(d.getUTCMonth() / 3) + 1); };   // Kalenderquartal (Anzeige-Saison)
const MGAnswer = require('../answer-check.js');
const MGRanked = require('../ranked.js');
const CraftCheck = require('../craft-check.js');
const MGModes = require('../modes.js');
const fs = require('fs');
const path = require('path');
let CATALOG = {};
try { JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'mc', 'craft-items.json'), 'utf8')).forEach(i => { CATALOG[i.key] = i.de; }); } catch (e) { CATALOG = {}; }
const BUILD_MS = MGModes.BUILD.seconds * 1000;   // Zeit je Bau-Aufgabe (gesamt, nicht je Pruefung)
const BUILD_SPEED_MS = 60000;

const TOTAL = 10;
const MAX_ATTEMPTS = 3;
const ATTEMPT_MS = 15000;          // Zeit je Versuch (wie im Client)
const ATTEMPT_GRACE_MS = 3000;     // Netzwerk-Toleranz
const SPEED_MAX_MS = 20000;        // Speedbonus faellt ueber 20 s auf 0 (wie COMP_SPEED_MAX im Client)
const MIN_HUMAN_MS = 500;          // schneller beantwortet (gesamte Frage) = verdaechtig
const RUN_TTL_MS = 30 * 60 * 1000;
const RUN_MAX_AGE_MS = 25 * 60 * 1000;   // ein Lauf verfaellt nach 25 min
const MIN_RUN_MS = 12000;                // 10 Fragen in weniger als 12 s gesamt = unmoeglich
const MAX_RUN_GAIN = 450;                // hoechster MMR-Zuwachs je gueltigem Lauf
const MAX_HOUR_GAIN = 900;               // und je Stunde je Spieler
const STRICT = process.env.RANKED_STRICT !== '0';   // '0' nur in Tests: schaltet Lesezeit- und Mindest-Laufzeit-Pruefung ab
const STARTS_PER_HOUR_KEY = 20, STARTS_PER_HOUR_IP = 80, NEW_KEYS_PER_IP_HOUR = Number(process.env.RANKED_NEW_KEYS_HOUR) > 0 ? Number(process.env.RANKED_NEW_KEYS_HOUR) : 10, NEW_KEYS_PER_IP_DAY = Number(process.env.RANKED_NEW_KEYS_DAY) > 0 ? Number(process.env.RANKED_NEW_KEYS_DAY) : 40;   // ENV nur fuer Tests
const MIN_MEDIAN_MS = 1200;              // Median der Antwortzeiten richtiger Antworten im Lauf (Mindestdauer-Staffel)
const ABANDON_MIN_ANSWERS = 5;           // Abbruch ab so vielen Antworten mit negativem Zwischenstand = Niederlage
const MAX_RUNS = 2000;
const UNVERIFIED_START_CAP = 2000; // ohne gueltiges Token wird ein behaupteter Start-MMR hoechstens so hoch uebernommen
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromB64u(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

function create(opts) {
  const { app, express, getQuestions, rankedStore, saveRankedSoon, cleanText, apiAllowed, log, keyHash } = opts;
  let secret = process.env.RANKED_SECRET || '';
  const fixedSecret = !!secret;
  if (!secret) secret = crypto.randomBytes(32).toString('hex');
  if (!fixedSecret) log('warn', 'ranked_secret_random', { hint: 'ENV RANKED_SECRET fehlt: Ranked-Profil-Tokens verfallen bei jedem Neustart. In Render unter Environment RANKED_SECRET setzen; Wert erzeugen z. B. mit: openssl rand -hex 32 (siehe docs/team/RENDER.md)' });

  const mac = (body) => b64u(crypto.createHmac('sha256', secret).update(body).digest());
  function sign(payload) { const body = b64u(JSON.stringify(payload)); return body + '.' + mac(body); }
  function verify(token) {
    if (typeof token !== 'string' || token.length > 2000) return null;
    const i = token.indexOf('.'); if (i < 1) return null;
    const body = token.slice(0, i), sig = token.slice(i + 1);
    const want = mac(body);
    const a = Buffer.from(sig), b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try { return JSON.parse(fromB64u(body).toString('utf8')); } catch (e) { return null; }
  }
  const tokenFor = (key, p, uv) => sign({ k: key, uv: uv ? 1 : undefined, mmr: p.mmr, peak: p.peak, games: p.games, answered: p.answered, correct: p.correct,
    lastPlayedDay: p.lastPlayedDay, mmrDayStart: p.mmrDayStart, mmrToday: p.mmrToday, ts: Date.now() });

  const hooks = {};               // onRankUp(key, {tier, division}) fuer den Aktivitaetsfeed (lib/social.js)
  const runs = new Map();
  const penalties = new Map();   // key -> { ts, mmr }: Niederlage durch Abbruch; aeltere Tokens duerfen den MMR nicht wiederherstellen
  const newKeys = new Map();      // IP -> { d: Tag, keys: Set } (nur Zaehlung, keine Speicherung)
  const hourGain = new Map();     // key -> { t, gain } committed MMR-Zuwachs der letzten Stunde
  function gc() {
    const now = Date.now();
    for (const [id, r] of runs) if (now - r.touched > RUN_TTL_MS || now - r.started > RUN_MAX_AGE_MS) runs.delete(id);
    if (runs.size > MAX_RUNS) { const old = [...runs.entries()].sort((a, b) => a[1].touched - b[1].touched).slice(0, runs.size - MAX_RUNS); old.forEach(([id]) => runs.delete(id)); }
  }

  const json = express.json({ limit: '16kb' });
  const bad = (res, code, error) => res.status(code || 400).json({ ok: false, error: error || 'ungueltig' });
  const getRun = (req, res) => {
    const id = req.body && req.body.runId;
    const r = typeof id === 'string' ? runs.get(id) : null;
    if (!r) { bad(res, 404, 'run'); return null; }
    r.touched = Date.now();
    return r;
  };

  // ── Start ────────────────────────────────────────────────────────────────
  app.post('/api/ranked/start', json, async (req, res) => {
    try {
      if (!apiAllowed('rstart', req.ip, 40, 1500)) return bad(res, 429, 'rate');
      if (!apiAllowed('rstart-key', String(req.body && (req.body.uid || req.body.gid)), 3, 20000)) return bad(res, 429, 'rate');   // Lauf-Starts je Spieler begrenzen
      gc();
      const b = req.body || {};
      let key, uv = false;
      // Konto-Kennung (Google): bei verfuegbarem Admin-Zugang nur aus dem serverseitig geprueften Firebase-ID-Token, nie aus der Behauptung des Clients.
      // Ohne Admin-Zugang wird die behauptete uid ungeprueft uebernommen (siehe lib/idtoken.js, docs/team/PROFIL-SETUP.md).
      if (typeof b.idToken === 'string' && idToken.available()) {
        const v = await idToken.verify(b.idToken);
        if (!v || !ID_RE.test(v.uid)) return bad(res, 401, 'id_token');
        key = 'u:' + v.uid; uv = true;
      } else if (typeof b.uid === 'string' && ID_RE.test(b.uid)) {
        if (idToken.available()) return bad(res, 401, 'id_token');          // uid ohne ID-Token: nicht beweisbar
        key = 'u:' + b.uid;
      } else if (typeof b.gid === 'string' && ID_RE.test(b.gid)) key = 'g:' + b.gid;
      else return bad(res, 400, 'id');
      // Starts je Stunde (Spieler und IP), neue Spieler-IDs je IP und Tag begrenzen
      if (!apiAllowed('rstart-hour-key', key, STARTS_PER_HOUR_KEY, 3600000 / STARTS_PER_HOUR_KEY)) return bad(res, 429, 'limit');
      if (!apiAllowed('rstart-hour-ip', req.ip, STARTS_PER_HOUR_IP, 3600000 / STARTS_PER_HOUR_IP)) return bad(res, 429, 'limit');
      if (!rankedStore.has(key)) {
        const nowT = Date.now(), e = newKeys.get(req.ip) || { seen: new Map() };    // key -> erster Zeitpunkt (nur Zaehlung, nicht gespeichert)
        for (const [k, t] of e.seen) if (nowT - t > 86400000) e.seen.delete(k);
        if (!e.seen.has(key)) {
          const lastHour = [...e.seen.values()].filter(t => nowT - t <= 3600000).length;
          if (lastHour >= NEW_KEYS_PER_IP_HOUR || e.seen.size >= NEW_KEYS_PER_IP_DAY) return bad(res, 429, 'neue ids');
          e.seen.set(key, nowT);
        }
        newKeys.set(req.ip, e);
        if (newKeys.size > 5000) newKeys.clear();
      }
      const name = cleanText(typeof b.name === 'string' ? b.name : 'Gast', 20) || 'Gast';
      // Profil bestimmen: signiertes Token > gespeicherter Stand > begrenzter Anspruch > Neustart
      let profile;
      const tk = verify(b.token);
      const stored = rankedStore.get(key);
      // Token gilt, solange der gespeicherte Serverstand nicht neuer ist (verhindert Replay alter Tokens nach einer Niederlage/Abbruch)
      if (tk && tk.k === key && !(stored && stored.verified && Number(stored.updatedAt) > Number(tk.ts))) profile = MGRanked.normalizeProfile(tk);
      else if (stored && stored.verified && Number.isInteger(stored.mmr)) profile = MGRanked.normalizeProfile(Object.assign({}, stored));
      else {
        profile = MGRanked.normalizeProfile(b.profile);
        const cap = Math.max(MGRanked.newProfile().mmr, UNVERIFIED_START_CAP);
        if (profile.mmr > cap) { profile.mmr = cap; }
        profile.peak = Math.min(profile.peak, Math.max(profile.mmr, cap));
        profile.games = Math.min(profile.games, 100000);
      }
      const pen = penalties.get(key);
      if (pen && tk && tk.k === key && Number(tk.ts) < pen.ts && profile.mmr > pen.mmr) { profile.mmr = pen.mmr; profile.mmrToday = Math.min(profile.mmrToday, pen.mmr - profile.mmrDayStart); }
      profile.history = MGRanked.normalizeHistory(b.history || profile.history);
      // Abbruch eines Laufs: ab ABANDON_MIN_ANSWERS Antworten mit negativem Zwischenstand gilt er als Niederlage (positiver Stand verfaellt)
      for (const [id, r] of runs) {
        if (r.key !== key) continue;
        if (!r.invalid && !r.finished && r.answered >= ABANDON_MIN_ANSWERS && r.profile.mmr < r.startMmr && profile.mmr >= r.startMmr) {
          profile = MGRanked.normalizeProfile(Object.assign({}, profile, { mmr: r.profile.mmr, mmrToday: r.profile.mmrToday, lastPlayedDay: r.profile.lastPlayedDay, mmrDayStart: r.profile.mmrDayStart }));
          penalties.set(key, { ts: Date.now(), mmr: profile.mmr }); if (penalties.size > 5000) penalties.clear();
          if (profile.games >= 1) {
            const rd = MGRanked.rankData(profile.mmr);
            const old = rankedStore.get(key);
            if (old) { Object.assign(old, { mmr: profile.mmr, tier: rd.tier, division: rd.division, mmrToday: profile.mmrToday, updatedAt: Date.now() }); saveRankedSoon(); }
          }
        }
        runs.delete(id);                                                       // nur ein aktiver Lauf je Spieler
      }
      const committedToken = tokenFor(key, profile, uv);
      const seen = Array.isArray(b.seen) ? b.seen.filter(Number.isInteger).slice(-3000) : [];
      const id = crypto.randomBytes(12).toString('hex');
      runs.set(id, { id, key, uv, name, profile, buildOk: b.build === true, committedToken, startMmr: profile.mmr, startPeak: profile.peak, history: profile.history, seen, used: new Set(), picked: [], q: null,
        answered: 0, correct: 0, delta: 0, times: [], finished: false, streak: 0, suspicious: 0, invalid: false, started: Date.now(), touched: Date.now(), lastAnswerAt: 0 });
      log('info', 'ranked_start', { verifiedProfile: !!(tk && tk.k === key) });
      res.json({ ok: true, runId: id, total: TOTAL, profile, token: committedToken, key: keyHash(key), idVerified: uv });
    } catch (e) { log('error', 'ranked_start_failed', { error: String(e.message).slice(0, 100) }); bad(res); }
  });

  // ── Naechste Frage (ohne Loesung) ─────────────────────────────────────────────────────
  // variant 'build' (nur Crafting): Ergebnis-Name wird gezeigt, das Raster (= Loesung) NICHT gesendet
  function publicQuestion(q, variant) {
    if (variant === 'build') return { id: q.id, type: 'crafting', category: q.category, question: q.question, rating: q.rating, tier: q.tier, mode: 'build', answer: q.answer, resultKey: q.resultKey, resultCount: q.resultCount || 1, buildSeconds: MGModes.BUILD.seconds, checks: MAX_ATTEMPTS };
    const o = { id: q.id, type: q.type, category: q.category, question: q.question, rating: q.rating, tier: q.tier, mode: 'guess' };
    if (q.unit) o.unit = q.unit;
    if (Array.isArray(q.choices)) o.choices = q.choices;
    if (q.fmt === 'tf') o.fmt = 'tf';                // Wahr oder Mythos: nur die Darstellung, keine Loesung
    if (q.type === 'crafting') { o.grid = q.grid; o.shapeless = !!q.shapeless; o.resultCount = q.resultCount || 1; }
    return o;
  }
  app.post('/api/ranked/next', json, (req, res) => {
    try {
      if (!apiAllowed('rnext-ip', req.ip, 300, 100)) return bad(res, 429, 'rate');
      const run = getRun(req, res); if (!run) return;
      if (!apiAllowed('rnext-run', run.id, 10, 1000)) return bad(res, 429, 'rate');
      if (run.q && !run.qDone) {            // Frage wiederholt anfordern (z. B. Neuladen): dieselbe Frage zurueck
        return res.json({ ok: true, question: publicQuestion(run.q, run.variant), index: run.answered + 1, total: TOTAL, attempts: run.attempts });
      }
      if (run.answered >= TOTAL) return bad(res, 409, 'fertig');
      const all = getQuestions();
      let ix = MGRanked.pickIndex(all, run.profile.mmr, run.used, Math.random, { seen: run.seen, picked: run.picked });
      if (process.env.RANKED_TEST_FORCE_BUILD === '1' && run.buildOk) {       // nur Tests: immer ein baubares Crafting-Raetsel
        const bi = all.map((q, i) => (q.type === 'crafting' && q.buildable && !run.used.has(i) ? i : -1)).filter((i) => i >= 0);
        if (bi.length) ix = bi[Math.floor(Math.random() * bi.length)];
      }
      run.used.add(ix); run.picked.push(all[ix]);
      run.q = all[ix]; run.qDone = false; run.attempts = 0; run.hints = 0; run.wrong = 0;
      run.variant = run.buildOk ? (process.env.RANKED_TEST_FORCE_BUILD === '1' && all[ix].buildable ? 'build' : MGModes.craftVariant(all[ix], 'ranked', 'mix', Math.random)) : 'guess';   // Bau nur, wenn der Client es beim Start angemeldet hat
      run.qStart = run.attemptStart = Date.now();
      res.json({ ok: true, question: publicQuestion(run.q, run.variant), index: run.answered + 1, total: TOTAL, attempts: 0 });
    } catch (e) { log('error', 'ranked_next_failed', { error: String(e.message).slice(0, 100) }); bad(res); }
  });

  // ── Tipp (Text entsteht auf dem Server, die Loesung bleibt dort) ───────────────────
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function hintText(q, level) {
    if (q.type === 'number') {
      const ans = q.answer, margin = Math.max(Math.round(Math.abs(ans || 1) * (level === 1 ? 0.3 : 0.12)), 3);
      return `Tipp ${level}: Die Antwort liegt zwischen <strong>${ans - margin}</strong> und <strong>${ans + margin}</strong>${q.unit ? ' ' + esc(q.unit) : ''}.`;
    }
    const ans = String(q.answer);
    if (level === 1) return `Tipp 1: Die Antwort beginnt mit <strong>"${esc(ans[0].toUpperCase())}"</strong>.`;
    return `Tipp 2: Die Antwort hat <strong>${ans.length} Buchstaben</strong> und enthält in der Mitte ein <strong>"${esc(ans[Math.floor(ans.length / 2)].toUpperCase())}"</strong>.`;
  }
  // Raster des Spielers: 3x3, Zellen null oder Item-Schluessel (a-z0-9_), sonst null
  function cleanGrid(g) {
    if (!Array.isArray(g) || g.length !== 3) return null;
    const out = [];
    for (const row of g) {
      if (!Array.isArray(row) || row.length !== 3) return null;
      const cells = [];
      for (const k of row) {
        if (k == null || k === '') cells.push(null);
        else if (typeof k === 'string' && /^[a-z0-9_]{1,60}$/.test(k)) cells.push(k);
        else return null;
      }
      out.push(cells);
    }
    return out;
  }
  app.post('/api/ranked/hint', json, (req, res) => {
    try {
      if (!apiAllowed('rhint-ip', req.ip, 300, 100)) return bad(res, 429, 'rate');
      const run = getRun(req, res); if (!run) return;
      if (!apiAllowed('rhint-run', run.id, 6, 2000)) return bad(res, 429, 'rate');
      if (!run.q || run.qDone) return bad(res, 409, 'frage');
      if (run.hints >= 2) return bad(res, 409, 'tipps');
      run.hints++;
      if (run.variant === 'build') {                       // Bau-Tipp: ein richtiger Slot (Position + Item), das restliche Raster bleibt geheim
        const h = CraftCheck.hint(run.q, cleanGrid(req.body.grid) || CraftCheck.emptyGrid());
        if (!h) { run.hints--; return bad(res, 409, 'kein Tipp'); }
        const de = CATALOG[h.key] || h.key;
        return res.json({ ok: true, text: `Tipp ${run.hints}: Zeile ${h.r + 1}, Spalte ${h.c + 1} braucht <strong>${esc(de)}</strong>.`, hint: { r: h.r, c: h.c, key: h.key }, hints: run.hints });
      }
      res.json({ ok: true, text: hintText(run.q, run.hints), hints: run.hints });
    } catch (e) { bad(res); }
  });

  // ── Antwort ──────────────────────────────────────────────────────────────────────
  app.post('/api/ranked/answer', json, (req, res) => {
    try {
      // Limits je Lauf (grosszuegig) und eine hohe IP-Obergrenze (Schul-/Mobilfunk-NAT); eine gueltige Antwort wird nie wegen Tempo verworfen
      if (!apiAllowed('ranswer-ip', req.ip, 300, 100)) return bad(res, 429, 'rate');
      const run = getRun(req, res); if (!run) return;
      if (!apiAllowed('ranswer-run', run.id, 20, 1000)) return bad(res, 429, 'rate');
      const q = run.q;
      if (!q || run.qDone) return bad(res, 409, 'frage');
      const now = Date.now();
      let correct = false, info = {};
      const isBuild = run.variant === 'build';
      const late = isBuild ? now - run.qStart > BUILD_MS + ATTEMPT_GRACE_MS : now - run.attemptStart > ATTEMPT_MS + ATTEMPT_GRACE_MS;
      const timedOut = req.body.timeout === true || late;
      if (isBuild) {
        if (!timedOut) {
          const grid = cleanGrid(req.body.grid);
          if (!grid || !grid.flat().some(Boolean)) return res.json({ ok: true, valid: false, final: false });
          const d = CraftCheck.diff(q, grid);
          correct = !!d.ok;
          info = { diff: { correct: d.correct, total: d.total, cells: d.cells } };
        }
      } else if (!timedOut) {
        const raw = (typeof req.body.answer === 'string' || typeof req.body.answer === 'number') ? String(req.body.answer).slice(0, 120) : '';
        if (Array.isArray(q.choices) && q.choices.length === 2 && !q.choices.some((c) => MGAnswer.normText(c) === MGAnswer.normText(raw))) {
          return res.json({ ok: true, valid: false, final: false });
        }
        const r = MGAnswer.check(q, raw);
        if (!r.valid) return res.json({ ok: true, valid: false, final: false });
        correct = !!r.correct;
        info = { close: !!r.close, dir: r.dir || null };
      }
      run.lastAnswerAt = now;
      if (!correct) { run.attempts++; run.wrong++; }
      const maxAtt = (!isBuild && Array.isArray(q.choices) && q.choices.length === 2) ? 1 : MAX_ATTEMPTS;     // ODER-/Wahr-oder-Mythos-Fragen: nur ein Versuch (sonst waere Raten mit zweitem Versuch fast gratis)
      const done = correct || run.attempts >= maxAtt || (isBuild && timedOut);
      if (!done) {
        run.attemptStart = now;
        return res.json({ ok: true, valid: true, final: false, correct: false, timeout: !!timedOut, attemptsLeft: MAX_ATTEMPTS - run.attempts, ...info });
      }
      // Endergebnis dieser Frage
      run.qDone = true;
      const elapsed = now - run.qStart;
      const speedWin = isBuild ? BUILD_SPEED_MS : SPEED_MAX_MS;
      let speedFrac = correct ? Math.max(0, Math.min(1, (speedWin - elapsed) / speedWin)) : 0;
      const slots = isBuild ? (q.solution.shapeless ? q.solution.items.length : q.solution.grid.flat().filter(Boolean).length) : 0;
      const minRead = STRICT ? (isBuild ? Math.max(MIN_HUMAN_MS, 1500 + 700 * slots) : Math.max(MIN_HUMAN_MS, 300 + 10 * String(q.question).length)) : MIN_HUMAN_MS;   // Mindestzeit: Lesen bzw. Bauen (je Slot)   // Mindest-Lesezeit nach Fragelaenge
      if (correct && elapsed < minRead) { run.suspicious++; speedFrac = 0; }
      if (run.suspicious >= 3) run.invalid = true;
      if (correct) run.times.push(elapsed);
      run.streak = correct ? run.streak + 1 : 0;
      const result = correct ? Math.max(0.4, 1 - 0.15 * run.wrong - 0.1 * run.hints) : 0;
      let r;
      if (run.invalid) {                                   // verdaechtiger Lauf: keine MMR-Aenderung, kein Ranglisten-Update
        r = MGRanked.applyAnswer(run.profile, q.rating, result, { speedFrac: 0, streak: 0 });
        r.profile = MGRanked.normalizeProfile(run.profile); r.delta = 0;
      } else {
        r = MGRanked.applyAnswer(run.profile, q.rating, result, { speedFrac, streak: run.streak });
        run.profile = r.profile;
        run.delta += r.delta;
      }
      run.answered++; if (correct) run.correct++;
      const runDone = run.answered >= TOTAL;
      // MMR ist waehrend des Laufs nur vorlaeufig (Anzeige). Ins signierte Profil und in die Rangliste kommt sie erst bei gueltigem Lauf-Ende;
      // abgebrochene oder ungueltige Laeufe werden verworfen (Farming-Schutz).
      if (!run.invalid && !runDone) run.profile.history = run.history;
      if (!run.invalid && runDone) {
        // Gesamtlaufzeit-Minimum und Zuwachs-Caps (je Lauf und je Stunde)
        const hg = hourGain.get(run.key) || { t: now, gain: 0 };
        if (now - hg.t > 3600000) { hg.t = now; hg.gain = 0; }
        const ts = run.times.slice().sort((a, b) => a - b), med = ts.length ? ts[Math.floor(ts.length / 2)] : Infinity;
        if (STRICT && (now - run.started < MIN_RUN_MS || med < MIN_MEDIAN_MS)) run.invalid = true;
        else {
          const gain = Math.max(0, run.profile.mmr - run.startMmr);
          const allowed = Math.max(0, Math.min(MAX_RUN_GAIN, MAX_HOUR_GAIN - hg.gain));
          if (gain > allowed) { run.profile.mmr = run.startMmr + allowed; run.profile.peak = Math.max(run.startPeak, run.profile.mmr); run.profile.mmrToday = run.profile.mmr - run.profile.mmrDayStart; }
          hg.gain += Math.min(gain, allowed); hourGain.set(run.key, hg);
        }
      }
      if (!run.invalid && runDone) {
        {
          run.profile.games += 1;
          run.profile = MGRanked.recordRun(Object.assign({}, run.profile, { history: run.history }), { delta: run.delta, correct: run.correct, total: TOTAL });
          run.history = run.profile.history;
        }
        const rd = MGRanked.rankData(run.profile.mmr);
        rankedStore.set(run.key, { key: run.key, uid: run.key.startsWith('u:') ? run.key.slice(2) : null, name: run.name, mmr: run.profile.mmr,
          peak: run.profile.peak, games: run.profile.games, answered: run.profile.answered, correct: run.profile.correct,
          tier: rd.tier, division: rd.division, lastPlayedDay: run.profile.lastPlayedDay || '', mmrToday: run.profile.mmrToday || 0,
          mmrDayStart: run.profile.mmrDayStart, updatedAt: now, verified: true, history: MGRanked.normalizeHistory(run.profile.history),
          season: { id: seasonId(now), peak: Math.max(((rankedStore.get(run.key) || {}).season || {}).id === seasonId(now) ? rankedStore.get(run.key).season.peak : 0, run.startMmr, run.profile.mmr) } });
        if (rankedStore.size > 5000) {
          const drop = [...rankedStore.values()].sort((a, b) => a.mmr - b.mmr || a.updatedAt - b.updatedAt)[0];
          if (drop) rankedStore.delete(drop.key);
        }
        saveRankedSoon();
        run.committedToken = tokenFor(run.key, run.profile, run.uv);
        try { if (hooks.onCommit) hooks.onCommit(run.key); } catch (e) { /* optional */ }
        try { const bf = MGRanked.rankInfo(run.startMmr), af = MGRanked.rankInfo(run.profile.mmr); if (hooks.onRankUp && af.idx * 3 + af.tier > bf.idx * 3 + bf.tier) hooks.onRankUp(run.key, { tier: af.rankId, division: af.tier }); } catch (e) { /* Feed ist optional */ }
      }
      if (runDone) run.finished = true;
      const display = q.type === 'number' ? q.answer : q.answer;
      const publicR = { delta: r.delta, p: r.p, rating: r.rating, before: r.before, after: r.after, promoted: r.promoted, demoted: r.demoted };
      log('info', 'ranked_answer', { correct, tier: q.tier, ms: elapsed, hints: run.hints, invalid: run.invalid || undefined });
      res.json({ ok: true, valid: true, final: true, correct, timeout: !!timedOut, answer: display, funFact: q.funFact || '', acceptedAnswers: q.acceptedAnswers || [], variant: run.variant, solutionGrid: isBuild ? q.grid : undefined,
        delta: r.delta, result: publicR, profile: run.profile, token: run.committedToken, runDone, notCounted: run.invalid || undefined, ...info });
    } catch (e) { log('error', 'ranked_answer_failed', { error: String(e.message).slice(0, 100) }); bad(res); }
  });

  return { sign, verify, runs, tokenFor, hooks };
}

module.exports = { create, TOTAL };
