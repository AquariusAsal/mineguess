/**
 * E-Mail-Versand fuer Meldungen, ohne neue npm-Abhaengigkeit (Node-fetch).
 * Transporte (Auswahl per ENV, erster vorhandener gewinnt):
 *   RESEND_API_KEY  -> Resend (https://resend.com)         optional RESEND_API_URL (nur Tests)
 *   BREVO_API_KEY   -> Brevo (https://www.brevo.com)        optional BREVO_API_URL (nur Tests)
 *   SMTP_URL        -> SMTP, nur wenn das Paket `nodemailer` installiert ist (sonst ignoriert)
 * Empfaenger: ENV REPORT_MAIL_TO (Standard admin.mineguess@gmail.com), Absender: ENV REPORT_MAIL_FROM
 * (Standard "MineGuess <onboarding@resend.dev>"; fuer Brevo eine verifizierte Absenderadresse eintragen).
 * Die Empfaengeradresse verlaesst den Server nie: nicht in API-Antworten, nicht in Logs, nicht im Client.
 *
 * Versandregeln:
 *   sofort   (Kategorien cheat, bug, name): jede Meldung als eigene Mail, hoechstens SOFORT_PRO_STUNDE je Kategorie und Stunde,
 *            danach Sammelmail (Digest)
 *   gebuendelt (frage, vorschlag, sonstiges): Digest nach DIGEST_MS (10 min); bei Ansturm (>= 5 wartende Meldungen) hoechstens 1 Mail je Stunde je Kategorie
 *   Ohne Schluessel: nichts wird gesendet (Meldungen werden trotzdem gespeichert), Hinweis einmalig im Log.
 */

const DEFAULT_TO = 'admin.mineguess@gmail.com';
const IMMEDIATE = new Set(['cheat', 'bug', 'name']);
const SOFORT_PRO_STUNDE = 10;
const SURGE = 5;
const HOUR = 3600 * 1000;

/** Header-Injection-Schutz: keine Steuerzeichen/Zeilenumbrueche, begrenzte Laenge. */
function sanitizeHeader(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 150);
}
/** Text fuer den Mail-Body: Steuerzeichen (ausser Zeilenumbruch) entfernen, Laenge begrenzen. */
function sanitizeBody(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, ' ').slice(0, max || 4000);
}
function parseFrom(from) {
  const m = /^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: sanitizeHeader(m[1] || 'MineGuess', 60), email: sanitizeHeader(m[2], 120) } : { name: 'MineGuess', email: sanitizeHeader(from || 'onboarding@resend.dev', 120) };
}

const LABEL = { frage: 'Frage', bug: 'Fehler/Bug', cheat: 'Cheat/Regelverstoss', name: 'Name/Skin', vorschlag: 'Vorschlag', sonstiges: 'Sonstiges' };

function lineFor(r) {
  const parts = [];
  parts.push(`Kategorie: ${LABEL[r.category] || r.category}${r.reason ? ' (' + r.reason + ')' : ''}`);
  if (r.mode) parts.push(`Modus: ${r.mode}${r.format ? ', Format ' + r.format : ''}${r.round != null ? ', Runde ' + r.round : ''}`);
  if (r.questionId != null) parts.push(`Frage: #${r.questionId}${r.questionText ? ' - ' + r.questionText : ''}`);
  if (r.room) parts.push(`Raum: ${r.room}`);
  if (r.player) parts.push(`Gemeldeter Spieler: ${r.player}`);
  if (r.text) parts.push(`Text: ${r.text}`);
  if (r.contact) parts.push(`Rueckfrage-E-Mail (freiwillig): ${r.contact}`);
  const c = r.ctx || {};
  const tech = [c.app && 'App ' + c.app, c.browser && c.browser, c.os && c.os, c.device && c.device].filter(Boolean).join(', ');
  if (tech) parts.push(`Technik: ${tech}`);
  if (r.errors && r.errors.length) parts.push('Konsolenfehler:\n  - ' + r.errors.join('\n  - '));
  parts.push(`Zeit: ${new Date(r.ts).toISOString()}${r.count > 1 ? ` (${r.count}x gemeldet)` : ''}`);
  return parts.join('\n');
}

/** Betreff und Text fuer eine Liste von Meldungen (einzeln oder Digest). */
function buildMail(list) {
  const first = list[0], cat = first.category;
  let subject;
  if (list.length === 1) {
    subject = `[MineGuess] ${LABEL[cat] || cat}${first.mode ? ' (' + first.mode + ')' : ''}${first.room ? ' - Raum ' + first.room : ''}`;
  } else {
    subject = `[MineGuess] ${list.length} Meldungen: ${LABEL[cat] || cat}`;
  }
  const text = sanitizeBody(list.map((r, i) => (list.length > 1 ? `--- Meldung ${i + 1} von ${list.length} ---\n` : '') + lineFor(r)).join('\n\n') + '\n\n(Automatische Nachricht von MineGuess. Nicht auf diese Mail antworten, wenn keine Rueckfrage-Adresse genannt ist.)');
  return { subject: sanitizeHeader(subject, 150), text };
}

function create(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const doFetch = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  const log = opts.log || function () {};
  const DIGEST_MS = Number(env.REPORT_DIGEST_MS) > 0 ? Number(env.REPORT_DIGEST_MS) : 10 * 60 * 1000;
  const to = sanitizeHeader(env.REPORT_MAIL_TO || DEFAULT_TO, 120);
  const from = env.REPORT_MAIL_FROM || 'MineGuess <onboarding@resend.dev>';

  let kind = 'off';
  if (env.RESEND_API_KEY) kind = 'resend';
  else if (env.BREVO_API_KEY) kind = 'brevo';
  else if (env.SMTP_URL) { try { require.resolve('nodemailer'); kind = 'smtp'; } catch (e) { kind = 'off'; } }
  if (kind === 'off') log('info', 'mail_off', { hint: 'Kein RESEND_API_KEY/BREVO_API_KEY gesetzt: Meldungen werden nur gespeichert (docs/team/MELDUNGEN-SETUP.md)' });

  const stats = { sent: 0, failed: 0, lastError: null };    // nur Zaehler und Kurztext ohne Adressen (fuer /health)
  const state = {};     // category -> { pending:[], sent:[ts], timer, failUntil }
  const st = (c) => state[c] || (state[c] = { pending: [], sent: [], timer: null, failUntil: 0 });
  const sentLastHour = (s, now) => { s.sent = s.sent.filter((t) => now - t < HOUR); return s.sent.length; };

  async function transport(mail) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    try {
      let res;
      if (kind === 'resend') {
        res = await doFetch(env.RESEND_API_URL || 'https://api.resend.com/emails', { method: 'POST', signal: ctrl && ctrl.signal,
          headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: sanitizeHeader(from, 160), to: [to], subject: mail.subject, text: mail.text }) });
      } else if (kind === 'brevo') {
        const f = parseFrom(from);
        res = await doFetch(env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email', { method: 'POST', signal: ctrl && ctrl.signal,
          headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ sender: f, to: [{ email: to }], subject: mail.subject, textContent: mail.text }) });
      } else if (kind === 'smtp') {
        const nm = require('nodemailer');
        await nm.createTransport(env.SMTP_URL).sendMail({ from: sanitizeHeader(from, 160), to, subject: mail.subject, text: mail.text });
        return true;
      } else return false;
      if (!res.ok) { const e = new Error('http ' + res.status); e.status = res.status; throw e; }
      return true;
    } finally { if (timer) clearTimeout(timer); }
  }

  async function flush(cat, why) {
    const s = st(cat);
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (!s.pending.length) return;
    const now = Date.now();
    if (now < s.failUntil) { schedule(cat, s.failUntil - now); return; }
    // Ansturm: ab SURGE wartenden Meldungen hoechstens 1 Mail je Stunde je Kategorie
    if (s.pending.length >= SURGE && sentLastHour(s, now) >= 1) { schedule(cat, Math.max(1000, HOUR - (now - Math.min.apply(null, s.sent)))); return; }
    const batch = s.pending.splice(0, 25);
    try {
      const ok = await transport(buildMail(batch));
      if (ok) { s.sent.push(Date.now()); stats.sent++; log('info', 'mail_sent', { category: cat, count: batch.length, why }); }
    } catch (e) {
      s.failUntil = Date.now() + 5 * 60 * 1000; stats.failed++; stats.lastError = String(e && e.message).slice(0, 40);
      s.pending = batch.concat(s.pending).slice(0, 200);
      log('warn', 'mail_failed', { category: cat, count: batch.length, error: String(e && e.message).slice(0, 60) });
    }
    if (s.pending.length) schedule(cat, DIGEST_MS);
  }
  function schedule(cat, ms) {
    const s = st(cat);
    if (s.timer) return;
    s.timer = setTimeout(() => { s.timer = null; flush(cat, 'digest'); }, ms);
    if (s.timer.unref) s.timer.unref();
  }

  /** Meldung zur Zustellung einreihen (kehrt sofort zurueck, Versand im Hintergrund). */
  function enqueue(report) {
    if (kind === 'off') return false;
    const cat = report.category, s = st(cat), now = Date.now();
    if (s.pending.length >= 200) return false;
    s.pending.push(report);
    if (IMMEDIATE.has(cat) && sentLastHour(s, now) < SOFORT_PRO_STUNDE && now >= s.failUntil) {
      // sofort: nur diese Meldung (nicht mit wartenden mischen)
      const idx = s.pending.indexOf(report); s.pending.splice(idx, 1);
      transport(buildMail([report])).then((ok) => { if (ok) { stats.sent++; s.sent.push(Date.now()); log('info', 'mail_sent', { category: cat, count: 1, why: 'sofort' }); } })
        .catch((e) => { stats.failed++; stats.lastError = String(e && e.message).slice(0, 40); s.failUntil = Date.now() + 5 * 60 * 1000; s.pending.push(report); schedule(cat, DIGEST_MS); log('warn', 'mail_failed', { category: cat, count: 1, error: String(e && e.message).slice(0, 60) }); });
    } else schedule(cat, DIGEST_MS);
    return true;
  }

  /** Test-Mail sofort senden (tools/mail-test.js): { ok, kind, status?, error? } ohne Schluessel/Adressen. */
  async function sendTest() {
    if (kind === 'off') return { ok: false, kind, error: 'kein Schluessel gesetzt' };
    try { const ok = await transport({ subject: '[MineGuess] Test-Mail', text: 'Das ist eine Test-Mail von MineGuess. Wenn du sie liest, funktioniert der Versand.' }); return { ok: !!ok, kind }; }
    catch (e) { return { ok: false, kind, status: e.status || null, error: String(e && e.message).slice(0, 80) }; }
  }
  return { enqueue, flush, kind: () => kind, configured: () => kind !== 'off', buildMail, state, stats: () => ({ sent: stats.sent, failed: stats.failed, lastError: stats.lastError }), sendTest };
}

module.exports = { create, buildMail, sanitizeHeader, sanitizeBody, IMMEDIATE, DEFAULT_TO, LABEL };
