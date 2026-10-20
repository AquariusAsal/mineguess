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
const MGAnswer = require('../answer-check.js');
const MGRanked = require('../ranked.js');

const TOTAL = 10;
const MAX_ATTEMPTS = 3;
const ATTEMPT_MS = 15000;          // Zeit je Versuch (wie im Client)
const ATTEMPT_GRACE_MS = 3000;     // Netzwerk-Toleranz
const SPEED_MAX_MS = 20000;        // Speedbonus faellt ueber 20 s auf 0 (wie COMP_SPEED_MAX im Client)
const MIN_HUMAN_MS = 700;          // schneller beantwortet (gesamte Frage) = verdaechtig
const RUN_TTL_MS = 30 * 60 * 1000;
const MAX_RUNS = 2000;
const UNVERIFIED_START_CAP = 1500; // ohne gueltiges Token wird ein behaupteter Start-MMR hoechstens so hoch uebernommen
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromB64u(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

function create(opts) {
  const { app, express, getQuestions, rankedStore, saveRankedSoon, cleanText, apiAllowed, buildOptions, log } = opts;
  let secret = process.env.RANKED_SECRET || '';
  const fixedSecret = !!secret;
  if (!secret) secret = crypto.randomBytes(32).toString('hex');
  if (!fixedSecret) log('warn', 'ranked_secret_random', { hint: 'RANKED_SECRET setzen, sonst verfallen Profil-Tokens bei jedem Neustart' });

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
  const tokenFor = (key, p) => sign({ k: key, mmr: p.mmr, peak: p.peak, games: p.games, answered: p.answered, correct: p.correct,
    lastPlayedDay: p.lastPlayedDay, mmrDayStart: p.mmrDayStart, mmrToday: p.mmrToday, ts: Date.now() });

  const runs = new Map();
  function gc() {
    const now = Date.now();
    for (const [id, r] of runs) if (now - r.touched > RUN_TTL_MS) runs.delete(id);
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
  app.post('/api/ranked/start', json, (req, res) => {
    try {
      if (!apiAllowed('rstart', req.ip, 6, 20000)) return bad(res, 429, 'rate');
      gc();
      const b = req.body || {};
      let key;
      if (typeof b.uid === 'string' && ID_RE.test(b.uid)) key = 'u:' + b.uid;
      else if (typeof b.gid === 'string' && ID_RE.test(b.gid)) key = 'g:' + b.gid;
      else return bad(res, 400, 'id');
      const name = cleanText(typeof b.name === 'string' ? b.name : 'Gast', 20) || 'Gast';
      // Profil bestimmen: signiertes Token > gespeicherter Stand > begrenzter Anspruch > Neustart
      let profile;
      const tk = verify(b.token);
      const stored = rankedStore.get(key);
      if (tk && tk.k === key) profile = MGRanked.normalizeProfile(tk);
      else if (stored && stored.verified && Number.isInteger(stored.mmr)) profile = MGRanked.normalizeProfile(Object.assign({}, stored));
      else {
        profile = MGRanked.normalizeProfile(b.profile);
        const cap = Math.max(MGRanked.newProfile().mmr, UNVERIFIED_START_CAP);
        if (profile.mmr > cap) { profile.mmr = cap; }
        profile.peak = Math.min(profile.peak, Math.max(profile.mmr, cap));
        profile.games = Math.min(profile.games, 100000);
      }
      profile.history = MGRanked.normalizeHistory(b.history || profile.history);
      for (const [id, r] of runs) if (r.key === key) runs.delete(id);     // nur ein aktiver Lauf je Spieler
      const seen = Array.isArray(b.seen) ? b.seen.filter(Number.isInteger).slice(-3000) : [];
      const id = crypto.randomBytes(12).toString('hex');
      runs.set(id, { id, key, name, profile, startMmr: profile.mmr, history: profile.history, seen, used: new Set(), picked: [], q: null,
        answered: 0, correct: 0, delta: 0, streak: 0, suspicious: 0, invalid: false, started: Date.now(), touched: Date.now(), lastAnswerAt: 0 });
      log('info', 'ranked_start', { verifiedProfile: !!(tk && tk.k === key) });
      res.json({ ok: true, runId: id, total: TOTAL, profile, token: tokenFor(key, profile) });
    } catch (e) { log('error', 'ranked_start_failed', { error: String(e.message).slice(0, 100) }); bad(res); }
  });

  // ── Naechste Frage (ohne Loesung) ─────────────────────────────────────────────────────
  function publicQuestion(q) {
    const o = { id: q.id, type: q.type, category: q.category, question: q.question, rating: q.rating, tier: q.tier };
    if (q.unit) o.unit = q.unit;
    if (Array.isArray(q.choices)) o.choices = q.choices;
    if (q.type === 'crafting') { o.grid = q.grid; o.shapeless = !!q.shapeless; o.resultCount = q.resultCount || 1; }
    return o;
  }
  app.post('/api/ranked/next', json, (req, res) => {
    try {
      if (!apiAllowed('rnext', req.ip, 20, 2000)) return bad(res, 429, 'rate');
      const run = getRun(req, res); if (!run) return;
      if (run.q && !run.qDone) {            // Frage wiederholt anfordern (z. B. Neuladen): dieselbe Frage zurueck
        return res.json({ ok: true, question: publicQuestion(run.q), index: run.answered + 1, total: TOTAL, attempts: run.attempts });
      }
      if (run.answered >= TOTAL) return bad(res, 409, 'fertig');
      const all = getQuestions();
      const ix = MGRanked.pickIndex(all, run.profile.mmr, run.used, Math.random, { seen: run.seen, picked: run.picked });
      run.used.add(ix); run.picked.push(all[ix]);
      run.q = all[ix]; run.qDone = false; run.attempts = 0; run.hints = 0; run.wrong = 0;
      run.qStart = run.attemptStart = Date.now();
      res.json({ ok: true, question: publicQuestion(run.q), index: run.answered + 1, total: TOTAL, attempts: 0 });
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
  app.post('/api/ranked/hint', json, (req, res) => {
    try {
      if (!apiAllowed('rhint', req.ip, 10, 3000)) return bad(res, 429, 'rate');
      const run = getRun(req, res); if (!run) return;
      if (!run.q || run.qDone) return bad(res, 409, 'frage');
      if (run.hints >= 2) return bad(res, 409, 'tipps');
      run.hints++;
      res.json({ ok: true, text: hintText(run.q, run.hints), hints: run.hints });
    } catch (e) { bad(res); }
  });

  // ── Antwort ──────────────────────────────────────────────────────────────────────
  app.post('/api/ranked/answer', json, (req, res) => {
    try {
      if (!apiAllowed('ranswer', req.ip, 40, 1500)) return bad(res, 429, 'rate');
      const run = getRun(req, res); if (!run) return;
      const q = run.q;
      if (!q || run.qDone) return bad(res, 409, 'frage');
      const now = Date.now();
      if (now - run.lastAnswerAt < 250) return bad(res, 429, 'zu schnell');
      let correct = false, info = {};
      const late = now - run.attemptStart > ATTEMPT_MS + ATTEMPT_GRACE_MS;
      const timedOut = req.body.timeout === true || late;
      if (!timedOut) {
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
      const done = correct || run.attempts >= MAX_ATTEMPTS;
      if (!done) {
        run.attemptStart = now;
        return res.json({ ok: true, valid: true, final: false, correct: false, timeout: !!timedOut, attemptsLeft: MAX_ATTEMPTS - run.attempts, ...info });
      }
      // Endergebnis dieser Frage
      run.qDone = true;
      const elapsed = now - run.qStart;
      let speedFrac = correct ? Math.max(0, Math.min(1, (SPEED_MAX_MS - elapsed) / SPEED_MAX_MS)) : 0;
      if (correct && elapsed < MIN_HUMAN_MS) { run.suspicious++; speedFrac = 0; }
      if (run.suspicious >= 3) run.invalid = true;
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
      if (!run.invalid) {
        if (runDone) {
          run.profile.games += 1;
          run.profile = MGRanked.recordRun(Object.assign({}, run.profile, { history: run.history }), { delta: run.delta, correct: run.correct, total: TOTAL });
          run.history = run.profile.history;
        } else run.profile.history = run.history;
        const rd = MGRanked.rankData(run.profile.mmr);
        rankedStore.set(run.key, { key: run.key, uid: run.key.startsWith('u:') ? run.key.slice(2) : null, name: run.name, mmr: run.profile.mmr,
          peak: run.profile.peak, games: run.profile.games, answered: run.profile.answered, correct: run.profile.correct,
          tier: rd.tier, division: rd.division, lastPlayedDay: run.profile.lastPlayedDay || '', mmrToday: run.profile.mmrToday || 0,
          mmrDayStart: run.profile.mmrDayStart, updatedAt: now, verified: true });
        if (rankedStore.size > 5000) {
          const drop = [...rankedStore.values()].sort((a, b) => a.mmr - b.mmr || a.updatedAt - b.updatedAt)[0];
          if (drop) rankedStore.delete(drop.key);
        }
        saveRankedSoon();
      }
      const display = q.type === 'number' ? q.answer : q.answer;
      const publicR = { delta: r.delta, p: r.p, rating: r.rating, before: r.before, after: r.after, promoted: r.promoted, demoted: r.demoted };
      log('info', 'ranked_answer', { correct, tier: q.tier, ms: elapsed, hints: run.hints, invalid: run.invalid || undefined });
      res.json({ ok: true, valid: true, final: true, correct, timeout: !!timedOut, answer: display, funFact: q.funFact || '', acceptedAnswers: q.acceptedAnswers || [],
        delta: r.delta, result: publicR, profile: run.profile, token: tokenFor(run.key, run.profile), runDone, ...info });
    } catch (e) { log('error', 'ranked_answer_failed', { error: String(e.message).slice(0, 100) }); bad(res); }
  });

  return { sign, verify, runs, tokenFor };
}

module.exports = { create, TOTAL };
