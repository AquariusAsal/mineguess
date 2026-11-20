/**
 * Mail-Test: sendet eine Test-Mail mit den Einstellungen aus der Umgebung und sagt, ob es funktioniert.
 *   RESEND_API_KEY=re_xxx REPORT_MAIL_TO=admin.mineguess@gmail.com node tools/mail-test.js
 *   (oder BREVO_API_KEY=... REPORT_MAIL_FROM="MineGuess <bestaetigte@adresse>")
 * Liest: RESEND_API_KEY / BREVO_API_KEY, REPORT_MAIL_TO (Standard admin.mineguess@gmail.com), REPORT_MAIL_FROM.
 * Ausgabe ohne Schluessel und ohne Adressen. Exit-Code 0 = gesendet, 1 = Fehler.
 */
const { create } = require('../lib/mailer.js');

const HINTS = {
  401: 'Schluessel ungueltig oder abgelaufen: im Dashboard einen neuen API-Key erzeugen und in Render unter Environment eintragen.',
  403: 'Nicht erlaubt. Resend: Absenderdomain nicht verifiziert oder die Empfaengeradresse ist nicht die des Resend-Kontos (Gratis-Konto sendet nur an die Adresse der Registrierung, Absender onboarding@resend.dev). Brevo: Absenderadresse nicht bestaetigt.',
  422: 'Eingaben abgelehnt: REPORT_MAIL_FROM oder REPORT_MAIL_TO hat ein ungueltiges Format (z. B. MineGuess <onboarding@resend.dev>).',
  429: 'Zu viele Anfragen: kurz warten und erneut versuchen.',
};

(async () => {
  const m = create({ log: () => {} });
  console.log('Transport: ' + m.kind());
  if (!m.configured()) {
    console.log('FEHLER: Es ist kein RESEND_API_KEY oder BREVO_API_KEY gesetzt (in Render unter Environment eintragen; lokal als Umgebungsvariable davor schreiben).');
    process.exit(1);
  }
  const r = await m.sendTest();
  if (r.ok) { console.log('OK: Test-Mail wurde an den Dienstleister uebergeben. Jetzt im Posteingang (und Spam-Ordner) von REPORT_MAIL_TO nachsehen.'); process.exit(0); }
  console.log('FEHLER: ' + (r.status ? 'HTTP ' + r.status : r.error));
  if (r.status && HINTS[r.status]) console.log('Hinweis: ' + HINTS[r.status]);
  else if (!r.status) console.log('Hinweis: Keine Verbindung zum Dienstleister (Netzwerk/DNS) oder Zeitueberschreitung.');
  process.exit(1);
})();
