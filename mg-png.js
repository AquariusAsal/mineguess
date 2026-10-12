/* MineGuess PNG-Helfer ohne Canvas-Readback.
   Manche Browser/Erweiterungen (Brave "Farbling", Firefox resistFingerprinting, Tor, Datenschutz-Add-ons)
   verrauschen getImageData/toDataURL. Deshalb werden Skins nie über Canvas ausgelesen oder neu kodiert:
   - IHDR wird aus den Bytes gelesen,
   - der Alphakanal wird selbst dekodiert (DecompressionStream + Unfilter), nur für Slim-Erkennung und
     "Skin leer"-Prüfung.
   API: MGPng.header(bytes) -> {w,h,bitDepth,colorType,interlace}|null
        MGPng.alpha(bytes)  -> Promise<{w,h,alpha:Uint8Array}|null>
        MGPng.dataUrlBytes(dataUrl) -> Uint8Array|null,  MGPng.toDataUrl(bytes) -> string */
(function (global) {
  'use strict';
  var SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  function u32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
  function isPng(b) { if (!b || b.length < 33) return false; for (var i = 0; i < 8; i++) if (b[i] !== SIG[i]) return false; return true; }

  function header(b) {
    if (!isPng(b)) return null;
    if (u32(b, 8) !== 13 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
    return { w: u32(b, 16), h: u32(b, 20), bitDepth: b[24], colorType: b[25], interlace: b[28] };
  }

  function dataUrlBytes(s) {
    var p = 'data:image/png;base64,';
    if (typeof s !== 'string' || s.indexOf(p) !== 0) return null;
    try {
      var bin = atob(s.slice(p.length)), out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch (e) { return null; }
  }
  function toDataUrl(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return 'data:image/png;base64,' + btoa(s);
  }

  function inflate(data) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('no DecompressionStream'));
    var ds = new DecompressionStream('deflate');
    var stream = new Blob([data]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  function paeth(a, b, c) {
    var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  }

  function alpha(bytes) {
    try {
      var hd = header(bytes);
      if (!hd || hd.interlace !== 0 || hd.w > 1024 || hd.h > 1024) return Promise.resolve(null);
      var ct = hd.colorType, bd = hd.bitDepth;
      var chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
      if (!chans || (ct === 3 && [1, 2, 4, 8].indexOf(bd) < 0) || (ct !== 3 && bd !== 8 && bd !== 16)) return Promise.resolve(null);
      // Chunks sammeln
      var pos = 8, idat = [], total = 0, trns = null;
      while (pos + 12 <= bytes.length) {
        var len = u32(bytes, pos), type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
        var d = bytes.subarray(pos + 8, pos + 8 + len);
        if (type === 'IDAT') { idat.push(d); total += d.length; }
        else if (type === 'tRNS') trns = d;
        else if (type === 'IEND') break;
        pos += 12 + len;
      }
      if (!total) return Promise.resolve(null);
      var all = new Uint8Array(total), o = 0;
      idat.forEach(function (c) { all.set(c, o); o += c.length; });
      var bpp = Math.max(1, (chans * bd) >> 3), stride = Math.ceil(hd.w * chans * bd / 8);
      return inflate(all).then(function (raw) {
        if (raw.length < (stride + 1) * hd.h) return null;
        var out = new Uint8Array(hd.w * hd.h), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
        for (var y = 0; y < hd.h; y++) {
          var ft = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
          for (var i = 0; i < stride; i++) {
            var a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0, x = line[i];
            switch (ft) {
              case 0: break;
              case 1: x += a; break;
              case 2: x += b; break;
              case 3: x += (a + b) >> 1; break;
              case 4: x += paeth(a, b, c); break;
              default: return null;
            }
            cur[i] = x & 255;
          }
          for (var px = 0; px < hd.w; px++) {
            var al = 255;
            if (ct === 6) al = bd === 8 ? cur[px * 4 + 3] : cur[px * 8 + 6];
            else if (ct === 4) al = bd === 8 ? cur[px * 2 + 1] : cur[px * 4 + 2];
            else if (ct === 3) {
              var idx;
              if (bd === 8) idx = cur[px];
              else { var perByte = 8 / bd, by = cur[Math.floor(px / perByte)], sh = 8 - bd * (px % perByte + 1); idx = (by >> sh) & ((1 << bd) - 1); }
              al = trns && idx < trns.length ? trns[idx] : 255;
            }
            out[y * hd.w + px] = al;
          }
          var t = prev; prev = cur; cur = t;
        }
        return { w: hd.w, h: hd.h, alpha: out };
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  global.MGPng = { header: header, alpha: alpha, dataUrlBytes: dataUrlBytes, toDataUrl: toDataUrl, isPng: isPng };
})(window);
