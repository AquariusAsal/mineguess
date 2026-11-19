/** Datenschutz-Helfer: Freitext schwaerzen, alte Meldungen loeschen. Keine IP, keine User-ID, kein Name in Meldungen. */
const RETENTION_MS = 365 * 24 * 3600 * 1000;      // Meldungen hoechstens 12 Monate

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const PHONE = /(?:\+|00)?\d[\d\s().\/-]{6,}\d/g;     // Folgen mit mindestens 8 Ziffern/Trennzeichen
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/g;

/** Offensichtliche Kontaktdaten im Freitext durch Platzhalter ersetzen. */
function redactText(s) {
  return String(s == null ? '' : s)
    .replace(EMAIL, '[E-Mail entfernt]')
    .replace(URL_RE, '[Link entfernt]')
    .replace(IBAN, '[Nummer entfernt]')
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 7 ? '[Nummer entfernt]' : m));
}

/** Nur erlaubte Felder behalten; Altbestand ohne Zeitstempel bekommt `now`. Gibt die bereinigte Liste zurueck. */
function purgeReports(list, now) {
  now = now || Date.now();
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const o = { questionId: r.questionId, reason: r.reason, text: redactText(r.text || ''), ts: Number.isFinite(r.ts) ? r.ts : now };
      // erweiterte Felder (Runde 40, Bonus 3): nur erlaubte Schluessel, Texte bereinigt
      ['category', 'mode', 'format', 'round', 'count', 'room', 'player', 'contact'].forEach((k) => { if (r[k] !== undefined && r[k] !== null) o[k] = typeof r[k] === 'string' ? redactText(r[k]) : r[k]; });
      if (r.contact !== undefined) o.contact = String(r.contact).slice(0, 120);
      if (r.ctx && typeof r.ctx === 'object') o.ctx = { app: r.ctx.app, device: r.ctx.device, browser: r.ctx.browser, os: r.ctx.os };
      if (Array.isArray(r.errors)) o.errors = r.errors.slice(0, 5).map((e) => redactText(String(e)).slice(0, 160));
      Object.keys(o).forEach((k) => { if (o[k] === undefined) delete o[k]; });
      return o;
    })
    .filter((r) => now - r.ts <= RETENTION_MS);
}

module.exports = { redactText, purgeReports, RETENTION_MS };
