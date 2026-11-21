/**
 * Meldungen aus allen Modi: Validierung, Bereinigung, Duplikat-Erkennung, Speicherung (store 'reports', 12 Monate) und Weiterleitung per Mail.
 * Format (POST /api/report, JSON):
 *   { category:'frage'|'bug'|'cheat'|'name'|'vorschlag'|'sonstiges', reason?:'falsch'|'unklar'|'doppelt' (nur frage),
 *     mode:'endless|blitz|daily|joker|categories|crafting|ranked|hardcore|challenge|hl|multiplayer|teams|menu|other',
 *     format?:'number|entity|choice|craft-guess|craft-build|hl', questionId?:int, round?:int, text?:<=300, email?:<=120 (nur mit consent:true),
 *     room?:string, player?:string, context?:{ app, device:'mobil'|'desktop', browser, errors:[<=5] }, elapsed?:ms, website?:'' (Honeypot) }
 * Altes Format { questionId, reason (falsch|unklar|doppelt|beleidigend|sonstiges), text? } bleibt gueltig (= category 'frage').
 * Gespeichert werden nur: category, reason, mode, format, questionId, round, text, ts, count, ctx{app,device,browser,os}, errors, room, player, contact.
 * Keine IP, keine Nutzer-ID. Die Mail-Adresse des Empfaengers kommt nur aus der ENV und wird nie ausgeliefert.
 */
const crypto = require('crypto');

const CATS = new Set(['frage', 'bug', 'cheat', 'name', 'vorschlag', 'sonstiges']);
const MODES = new Set(['endless', 'blitz', 'daily', 'joker', 'categories', 'crafting', 'ranked', 'hardcore', 'challenge', 'hl', 'multiplayer', 'teams', 'profile', 'menu', 'other']);
const FORMATS = new Set(['number', 'entity', 'choice', 'tf', 'craft-guess', 'craft-build', 'hl']);
const REASONS = new Set(['falsch', 'unklar', 'doppelt']);
const LEGACY_REASONS = new Set(['falsch', 'unklar', 'doppelt', 'beleidigend', 'sonstiges']);
const EMAIL_RE = /^[^\s@<>"',;:\\]+@[^\s@<>"',;:\\]+\.[A-Za-z]{2,}$/;
const MIN_OPEN_MS = 1200;          // Dialog muss mindestens so lange offen gewesen sein (Bots)
const DEDUPE_MS = 3600 * 1000;
const MAX_STORED = 5000;

function ctl(s) { return String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); }

/** Grobe Browser-/System-Erkennung aus dem User-Agent (keine Versionen, keine Identifikation). */
function coarseUA(ua) {
  ua = String(ua || '');
  const browser = /Edg\//.test(ua) ? 'edge' : /OPR\/|Opera/.test(ua) ? 'opera' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\/|CriOS\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
  const os = /Android/.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Windows/.test(ua) ? 'windows' : /Mac OS X|Macintosh/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'linux' : 'other';
  const device = /Mobi|Android|iPhone|iPod/.test(ua) ? 'mobil' : 'desktop';
  return { browser, os, device };
}

function create(opts) {
  const { store, cleanText, redactText, knownQuestion, mailer, log, profileOfToken, onConfirm } = opts;
  const recent = new Map();      // Hash -> { ts, ref }  (Duplikat-Erkennung, nur im Speicher)
  const perCat = new Map();      // Kategorie -> { start, n }  (Schutz vor Ansturm)

  const str = (v, max) => (typeof v === 'string' ? ctl(v).slice(0, max) : null);

  /** Rueckgabe: { status, body } ; status 200 auch bei still verworfenen Bot-Meldungen. */
  function process(body, headers, now) {
    now = now || Date.now();
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    if (!b) return { status: 400, body: { ok: false } };
    // Honeypot: versteckte Felder duerfen nie gefuellt sein -> still verwerfen (Bots merken nichts)
    if ((typeof b.website === 'string' && b.website.trim()) || (typeof b.hp === 'string' && b.hp.trim())) return { status: 200, body: { ok: true } };

    const legacy = b.category === undefined;
    const category = legacy ? 'frage' : b.category;
    if (typeof category !== 'string' || !CATS.has(category)) return { status: 400, body: { ok: false } };
    let reason;
    if (category === 'frage') {
      reason = b.reason;
      if (typeof reason !== 'string' || !(legacy ? LEGACY_REASONS : REASONS).has(reason)) return { status: 400, body: { ok: false } };
    } else if (b.reason !== undefined && b.reason !== null && typeof b.reason !== 'string') return { status: 400, body: { ok: false } };

    const mode = legacy ? undefined : (typeof b.mode === 'string' && MODES.has(b.mode) ? b.mode : null);
    if (mode === null) return { status: 400, body: { ok: false } };
    let format;
    if (b.format !== undefined && b.format !== null) { if (typeof b.format !== 'string' || !FORMATS.has(b.format)) return { status: 400, body: { ok: false } }; format = b.format; }

    let questionId, questionText;
    if (b.questionId !== undefined && b.questionId !== null) {
      if (!Number.isInteger(b.questionId) || !knownQuestion(b.questionId)) return { status: 400, body: { ok: false } };
      questionId = b.questionId; questionText = knownQuestion(b.questionId).slice(0, 110);
    } else if (category === 'frage') return { status: 400, body: { ok: false } };

    if (b.text != null && typeof b.text !== 'string') return { status: 400, body: { ok: false } };
    const text = redactText(cleanText(b.text || '', 300));
    if (category !== 'frage' && !text && category !== 'cheat' && category !== 'name') return { status: 400, body: { ok: false } };   // Bug/Vorschlag/Sonstiges brauchen einen Text

    let round;
    if (b.round !== undefined && b.round !== null) { if (!Number.isInteger(b.round) || b.round < 0 || b.round > 9999) return { status: 400, body: { ok: false } }; round = b.round; }

    // Mindestzeit: Formular zu schnell abgeschickt -> still verwerfen
    if (b.elapsed !== undefined && (typeof b.elapsed !== 'number' || !isFinite(b.elapsed) || b.elapsed < MIN_OPEN_MS)) return { status: 200, body: { ok: true } };

    // Raum/Spieler nur fuer Multiplayer-Kategorien sinnvoll, gekuerzt
    let room, player;
    if (typeof b.room === 'string' && /^[a-z0-9-]{3,30}$/i.test(b.room.trim()) && (mode === 'multiplayer' || mode === 'teams')) room = b.room.trim().toLowerCase();
    if ((category === 'cheat' || category === 'name') && typeof b.player === 'string') { const p = redactText(cleanText(b.player, 20)); if (p) player = p; }

    // freiwillige Rueckfrage-Adresse nur mit ausdruecklicher Einwilligung
    let contact;
    const mailIn = b.email !== undefined ? b.email : b.contact;
    if (typeof mailIn === 'string' && mailIn.trim() && b.consent === true) {
      const m = mailIn.trim();
      if (m.length <= 120 && EMAIL_RE.test(m)) contact = m; else return { status: 400, body: { ok: false } };
    }

    // technischer Kontext: App-Version, grobe Geraeteart/Browser (Server-seitig aus dem User-Agent, Client-Angabe nur ergaenzend), bereinigte Konsolenfehler
    const ua = coarseUA(headers && headers['user-agent']);
    const c = b.context && typeof b.context === 'object' ? b.context : {};
    const ctx = { app: (str(c.app, 30) || '').replace(/[^A-Za-z0-9._-]/g, '') || undefined, device: c.device === 'mobil' || c.device === 'desktop' ? c.device : ua.device, browser: ua.browser, os: ua.os };
    const errors = (Array.isArray(c.errors) ? c.errors : []).slice(0, 5).filter((e) => typeof e === 'string' && e.trim())
      .map((e) => redactText(ctl(e).replace(/https?:\/\/[^\s)]+/g, '[url]').replace(/[?#]\S*/g, '')).slice(0, 160));

    // Schutz vor Ansturm je Kategorie (Speicher): hoechstens 300 neue Meldungen je Kategorie und Stunde
    const pc = perCat.get(category) || { start: now, n: 0 };
    if (now - pc.start > DEDUPE_MS) { pc.start = now; pc.n = 0; }
    perCat.set(category, pc);

    // Duplikate (gleiche Meldung binnen 1 h): nur Zaehler erhoehen, keine neue Mail
    const h = crypto.createHash('sha1').update([category, reason || '', mode || '', questionId == null ? '' : questionId, player || '', room || '', text.toLowerCase().replace(/\s+/g, ' ')].join('|')).digest('hex');
    for (const [k, v] of recent) if (now - v.ts > DEDUPE_MS) recent.delete(k);
    const dup = recent.get(h);
    if (dup) { dup.ref.count = (dup.ref.count || 1) + 1; dup.ts = now; store.set('reports', store.get('reports')); return { status: 200, body: { ok: true } }; }
    if (pc.n >= 300) return { status: 429, body: { ok: false } };
    pc.n++;

    // Fehlerjaeger: nur mit gueltigem Profil-Token wird die Meldung intern einem anonymen Profil zugeordnet (wird nach der Pruefung wieder entfernt)
    let rk;
    if (typeof b.pt === 'string' && b.pt.length > 20 && b.pt.length < 600 && profileOfToken) { try { rk = profileOfToken(b.pt) || undefined; } catch (e) { rk = undefined; } }
    const entry = { id: crypto.randomBytes(5).toString('hex'), status: 'open', category, reason, mode, format, questionId, round, text, ts: now, count: 1, ctx, errors: errors.length ? errors : undefined, room, player, contact, rk };
    Object.keys(entry).forEach((k) => { if (entry[k] === undefined) delete entry[k]; });
    let reports = store.get('reports');
    if (!Array.isArray(reports)) reports = [];
    if (reports.length >= MAX_STORED) reports.shift();
    reports.push(entry);
    store.set('reports', reports);
    recent.set(h, { ts: now, ref: entry });
    if (mailer) { try { mailer.enqueue(Object.assign({}, entry, { questionText, rk: undefined })); } catch (e) { log && log('warn', 'mail_enqueue_failed', {}); } }
    if (log) log('info', 'report', { category, mode: mode || 'legacy' });
    return { status: 200, body: { ok: true } };
  }

  /** Admin-Liste ohne Freitext, Kontakt, Spieler, Raum und Profil-Kennung. */
  function list(o2) {
    const o = o2 || {}, status = ['open', 'confirmed', 'rejected'].includes(o.status) ? o.status : null;
    const limit = Math.max(1, Math.min(200, Number(o.limit) || 50));
    const all = Array.isArray(store.get('reports')) ? store.get('reports') : [];
    return all.filter((r) => r.id && (!status || (r.status || 'open') === status)).slice(-limit).reverse().map((r) => ({
      id: r.id, status: r.status || 'open', category: r.category, reason: r.reason || null, mode: r.mode || null, format: r.format || null, questionId: r.questionId == null ? null : r.questionId,
      question: r.questionId != null && knownQuestion(r.questionId) ? String(knownQuestion(r.questionId)).slice(0, 110) : null, count: r.count || 1, ts: r.ts, device: r.ctx ? r.ctx.device : null, browser: r.ctx ? r.ctx.browser : null,
      errors: r.errors || [], linked: !!r.rk }));
  }
  /** Admin-Aktion: confirm (berechtigt), reject (abgelehnt), reopen. Bei confirm bekommt ein verknuepftes Profil einen Fehlerjaeger-Punkt (einmal je Meldung). */
  function act(id, action) {
    if (typeof id !== 'string' || !/^[0-9a-f]{10}$/.test(id) || !['confirm', 'reject', 'reopen'].includes(action)) return { status: 400, body: { ok: false } };
    const all = store.get('reports');
    const r = Array.isArray(all) ? all.find((x) => x.id === id) : null;
    if (!r) return { status: 404, body: { ok: false } };
    let rewarded = false;
    if (action === 'confirm') {
      if (r.status !== 'confirmed' && r.rk && !r.rewarded && onConfirm) { rewarded = !!onConfirm(r.rk); r.rewarded = rewarded || undefined; }
      r.status = 'confirmed'; delete r.rk;          // Zuordnung wird nach der Pruefung nicht mehr gebraucht
    } else if (action === 'reject') { r.status = 'rejected'; delete r.rk; }
    else r.status = 'open';
    store.set('reports', all);
    return { status: 200, body: { ok: true, id, status: r.status, rewarded } };
  }
  return { process, list, act, coarseUA, CATS, MODES };
}

module.exports = { create, coarseUA, CATS, MODES, FORMATS, REASONS };
