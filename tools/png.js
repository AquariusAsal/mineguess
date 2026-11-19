/** Minimaler PNG-Decoder/-Encoder (8 Bit, nicht interlaced, Farbtypen 0/2/3/4/6) nur mit zlib. Pixel als RGBA-Uint8Array. */
const zlib = require('zlib');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function decode(buf) {
  if (!buf || buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) throw new Error('kein PNG');
  let pos = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0, plte = null, trns = null; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'PLTE') plte = data; else if (type === 'tRNS') trns = data; else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (![1, 2, 4, 8].includes(depth) || interlace) throw new Error('nur 1-8 Bit ohne Interlace');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error('Farbtyp ' + ctype);
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = Math.max(1, Math.ceil(ch * depth / 8)), stride = Math.ceil(w * ch * depth / 8), out0 = Buffer.alloc(h * stride);
  const out = out0;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  // niedrige Bittiefen auf 8-Bit-Samples entpacken (Palettenindex bzw. Grau)
  let samples = out;
  if (depth < 8) {
    samples = Buffer.alloc(w * h * ch); const mask = (1 << depth) - 1, scale = ctype === 3 ? 1 : 255 / mask;
    for (let y = 0; y < h; y++) for (let x = 0; x < w * ch; x++) { const bit = x * depth, v = (out[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & mask; samples[y * w * ch + x] = Math.round(v * scale); }
  }
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (ctype === 6) { r = samples[i * 4]; g = samples[i * 4 + 1]; b = samples[i * 4 + 2]; a = samples[i * 4 + 3]; }
    else if (ctype === 2) { r = samples[i * 3]; g = samples[i * 3 + 1]; b = samples[i * 3 + 2]; if (trns && trns.length >= 6 && trns.readUInt16BE(0) === r && trns.readUInt16BE(2) === g && trns.readUInt16BE(4) === b) a = 0; }
    else if (ctype === 0) { r = g = b = samples[i]; if (trns && trns.length >= 2 && Math.round(trns.readUInt16BE(0) * (depth < 8 ? 255 / ((1 << depth) - 1) : 1)) === r) a = 0; }
    else if (ctype === 4) { r = g = b = samples[i * 2]; a = samples[i * 2 + 1]; }
    else { const p = samples[i]; r = plte[p * 3]; g = plte[p * 3 + 1]; b = plte[p * 3 + 2]; a = trns && p < trns.length ? trns[p] : 255; }
    px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = a;
  }
  return { w, h, px };
}

function encode(img) {
  const { w, h, px } = img, raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(px.buffer, px.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Multiplikativ einfaerben (Minecraft-Tint): Kanal * Farbe / 255, Alpha bleibt. */
function tint(img, hex) {
  const n = parseInt(String(hex).replace('#', ''), 16), R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255, px = new Uint8Array(img.px);
  for (let i = 0; i < img.w * img.h; i++) { px[i * 4] = Math.round(px[i * 4] * R / 255); px[i * 4 + 1] = Math.round(px[i * 4 + 1] * G / 255); px[i * 4 + 2] = Math.round(px[i * 4 + 2] * B / 255); }
  return { w: img.w, h: img.h, px };
}
/** "Over"-Komposition: top liegt ueber bottom. */
function over(bottom, top) {
  const px = new Uint8Array(bottom.px);
  for (let i = 0; i < bottom.w * bottom.h; i++) {
    const ta = top.px[i * 4 + 3] / 255, ba = px[i * 4 + 3] / 255, oa = ta + ba * (1 - ta);
    if (oa <= 0) continue;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.round((top.px[i * 4 + c] * ta + px[i * 4 + c] * ba * (1 - ta)) / oa);
    px[i * 4 + 3] = Math.round(oa * 255);
  }
  return { w: bottom.w, h: bottom.h, px };
}
/** Mittlere Saettigung der sichtbaren Pixel (0..1) und Anteil sichtbarer Pixel. */
function stats(img) {
  let s = 0, n = 0;
  for (let i = 0; i < img.w * img.h; i++) { if (img.px[i * 4 + 3] < 128) continue; const r = img.px[i * 4], g = img.px[i * 4 + 1], b = img.px[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); s += mx ? (mx - mn) / mx : 0; n++; }
  return { sat: n ? s / n : 0, visible: n / (img.w * img.h) };
}

module.exports = { decode, encode, tint, over, stats, crc32 };
