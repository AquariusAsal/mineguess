/**
 * Echte Client-IP hinter einem Reverse Proxy (Render).
 * Render (Cloudflare davor) setzt CF-Connecting-IP / True-Client-IP und haengt die Client-IP an X-Forwarded-For an.
 * Diese Header werden nur ausgewertet, wenn der Server hinter einem vertrauenswuerdigen Proxy laeuft:
 *   automatisch auf Render (ENV RENDER gesetzt) oder mit ENV TRUST_PROXY_HEADERS=1. Lokal/direkt werden sie ignoriert (kein Spoofing).
 * Rate-Limits gelten so je echter Client-IP statt je Proxy.
 */
const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;
const trusted = () => process.env.TRUST_PROXY_HEADERS === '1' || !!process.env.RENDER;

function clientIp(headers, remote) {
  headers = headers || {};
  if (trusted()) {
    const pick = (v) => { v = Array.isArray(v) ? v[0] : v; v = typeof v === 'string' ? v.trim() : ''; return IP_RE.test(v) ? v : ''; };
    const cf = pick(headers['cf-connecting-ip']) || pick(headers['true-client-ip']);
    if (cf) return cf;
    const xf = typeof headers['x-forwarded-for'] === 'string' ? headers['x-forwarded-for'].split(',').map(s => s.trim()).filter(Boolean) : [];
    if (xf.length) { const first = xf[0]; if (IP_RE.test(first)) return first; }
  }
  return String(remote || '').replace(/^::ffff:/, '');
}

module.exports = { clientIp, trusted };
