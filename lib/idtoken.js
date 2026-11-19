/**
 * Serverseitige Pruefung des Firebase-ID-Tokens (Google-Anmeldung), damit eine Spieler-Kennung "u:<uid>" nicht nur eine Behauptung des Clients ist.
 *   - Aktiv nur, wenn die ENV FIREBASE_SERVICE_ACCOUNT gesetzt ist (Admin-Zugang, Paket firebase-admin, modulare API). Dann gilt: ohne gueltiges ID-Token
 *     keine Konto-Kennung (u:...), und das Profil-Login verlangt ein Ranked-Token, das aus einem geprueften ID-Token stammt.
 *   - Ohne Admin-Zugang ist die Pruefung NICHT moeglich (available() === false): Die Kennung wird dann ungeprueft uebernommen. Das heisst: wer die
 *     Firebase-UID eines anderen kennt, kann sich dessen Profil/Rang auf diesem Server aneignen. Die UID ist nicht oeffentlich, aber auch kein Geheimnis.
 * Test: ID_TOKEN_VERIFIER=test (ignoriert bei NODE_ENV=production) akzeptiert Tokens der Form "test:<uid>"; setVerifier() fuer Einheiten.
 */
let verifier = null;
let adminReady = null;

function testMode() { return process.env.ID_TOKEN_VERIFIER === 'test' && process.env.NODE_ENV !== 'production'; }

function adminAuth() {
  if (adminReady !== null) return adminReady;
  adminReady = false;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return adminReady;
  try {
    const app = require('firebase-admin/app'), auth = require('firebase-admin/auth');
    const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const fapp = app.getApps().length ? app.getApp() : app.initializeApp({ credential: app.cert(cred) });
    adminReady = auth.getAuth(fapp);
  } catch (e) { console.warn(JSON.stringify({ level: 'warn', event: 'idtoken_unavailable', error: String(e.message).slice(0, 100) })); adminReady = false; }
  return adminReady;
}

/** true, wenn ID-Tokens serverseitig geprueft werden koennen. */
function available() { return !!verifier || testMode() || !!adminAuth(); }

/** Rueckgabe { uid } oder null (ungueltig/abgelaufen/fremdes Projekt/nicht pruefbar). */
async function verify(token) {
  if (typeof token !== 'string' || !token || token.length > 4096) return null;
  try {
    if (verifier) return await verifier(token);
    if (testMode()) { const m = /^test:([A-Za-z0-9_-]{6,64})$/.exec(token); return m ? { uid: m[1] } : null; }
    const a = adminAuth();
    if (!a) return null;
    const d = await a.verifyIdToken(token);
    return d && typeof d.uid === 'string' ? { uid: d.uid } : null;
  } catch (e) { return null; }
}

module.exports = { available, verify, setVerifier: (f) => { verifier = f; adminReady = null; } };
