/* MineGuess Buzzer-Szene: Tisch, roter Buzzer, Minecraft-Spielerfiguren (WebGL, ein Canvas).
   - Originale Spielermodell-Maße (Kopf 8x8x8, Körper 8x12x4, Arme 4|3x12x4, Beine 4x12x4), UV wie im Spiel,
     Overlay-Schicht (Hut, Jacke, Ärmel, Hosen), NEAREST-Filter (pixelscharf).
   - Skins: 64x64 und altes 64x32 (linke Gliedmaßen werden gespiegelt), wide/slim-Erkennung.
   - Fallback ohne WebGL: Kopf-Reihe (DOM) mit denselben Sprechblasen.
   API:  const s = MGScene.create(container, { myId });
         s.setPlayers([{id,name,skin,character,connected}]); s.buzz(id); s.think(id,true|false);
         s.say(id,text,'neutral'|'correct'|'wrong'); s.react(id,'correct'|'wrong'); s.setLocked([ids]);
         s.resetRound(); s.destroy();
         MGScene.createPreview(container, {skin, character})  -> { update({skin,character}), destroy() } */
(function (global) {
  'use strict';

  var REDUCED = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) || (function () { try { return localStorage.getItem('mg_reduce_motion') === '1'; } catch (e) { return false; } })();
  var BASE = 'assets/mc/';
  var STEVE = BASE + 'entity/player/wide/steve.png';
  var ALEX = BASE + 'entity/player/slim/alex.png';

  // ───────────────────────── Mathe (spaltenweise 4x4) ─────────────────────────
  var M = {
    id: function () { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    mul: function (a, b) {
      var o = new Float32Array(16);
      for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    t: function (x, y, z) { var m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
    s: function (x, y, z) { var m = M.id(); m[0] = x; m[5] = y; m[10] = z; return m; },
    rx: function (a) { var c = Math.cos(a), s = Math.sin(a), m = M.id(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
    ry: function (a) { var c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    rz: function (a) { var c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
    persp: function (fovy, asp, n, f) {
      var t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
      m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m;
    },
    look: function (e, c, u) {
      var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      var xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      var m = M.id();
      m[0] = xx; m[4] = xy; m[8] = xz; m[1] = yx; m[5] = yy; m[9] = yz; m[2] = zx; m[6] = zy; m[10] = zz;
      m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
      return m;
    },
    pt: function (m, x, y, z) {
      var w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
    }
  };

  // ───────────────────────── Skin laden / normalisieren ─────────────────────────
  var skinCache = {};
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { rej(new Error('skin load')); };
      i.src = src;
    });
  }
  function mirrorBlock(ctx, sx, sy, dx, dy, w, h) {
    ctx.save(); ctx.translate(dx + w, dy); ctx.scale(-1, 1);
    ctx.drawImage(ctx.canvas, sx, sy, w, h, 0, 0, w, h);
    ctx.restore();
  }
  // altes 64x32 -> 64x64: linke Gliedmaßen aus rechten, jede Fläche einzeln gespiegelt, rechts/links getauscht
  function legacyToModern(ctx, srcX, srcY, dstX, dstY, d, w, h) {
    // Layout: right(d) front(w) left(d) back(w); oben top(w x d), unten bottom(w x d)
    function m(sx, sy, dx, dy, ww, hh) { mirrorBlock(ctx, srcX + sx, srcY + sy, dstX + dx, dstY + dy, ww, hh); }
    m(d, 0, d, 0, w, d);                    // top
    m(d + w, 0, d + w, 0, w, d);            // bottom
    m(0, d, d + w, d, d, h);                // right -> left
    m(d, d, d, d, w, h);                    // front
    m(d + w, d, 0, d, d, h);                // left -> right
    m(d + d + w, d, d + d + w, d, w, h);    // back
  }
  // Alles ohne Canvas-Readback (Anti-Fingerprinting-Browser verrauschen getImageData/toDataURL):
  // Pixel kommen nur per drawImage -> Textur; Slim/Leer-Erkennung aus den PNG-Bytes (MGPng.alpha).
  function bytesFor(src) {
    if (src.indexOf('data:') === 0) return Promise.resolve(global.MGPng ? global.MGPng.dataUrlBytes(src) : null);
    return fetch(src).then(function (r) { if (!r.ok) throw new Error('http'); return r.arrayBuffer(); }).then(function (ab) { return new Uint8Array(ab); });
  }
  function buildSkin(img, src, bytes) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (w !== 64 || (h !== 64 && h !== 32)) throw new Error('size');
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(img, 0, 0);
    if (h === 32) {
      legacyToModern(x, 0, 16, 16, 48, 4, 4, 12);
      legacyToModern(x, 40, 16, 32, 48, 4, 4, 12);
    }
    var pngP = (bytes && global.MGPng) ? global.MGPng.alpha(bytes) : Promise.resolve(null);
    return pngP.then(function (res) {
      var slim = false;
      if (res) {
        var opaque = 0, i;
        for (i = 0; i < res.alpha.length; i++) if (res.alpha[i] > 0) opaque++;
        if (opaque < res.w * res.h * 0.05) throw new Error('empty');
        if (global.MGPng && !global.MGPng.plausible(res)) throw new Error('noise');
        if (h !== 32) {
          var clear = true, yy, xx;
          for (yy = 20; yy < 32 && clear; yy++) for (xx = 54; xx < 56; xx++) if (res.alpha[yy * res.w + xx] !== 0) { clear = false; break; }
          slim = clear;
        }
      } else if (src.indexOf('data:') === 0) { throw new Error('unverified'); }   // eigener Skin, den wir nicht pruefen koennen: Standardfigur
      else if (src.indexOf('/slim/') >= 0) { slim = true; }
      return { canvas: h === 64 ? img : c, slim: slim };
    });
  }
  function loadSkin(src) {
    if (skinCache[src]) return skinCache[src];
    var p = bytesFor(src).then(function (bytes) {
      var url = src;
      if (bytes && global.MGPng) {
        var hd = global.MGPng.header(bytes);
        if (!hd || hd.w !== 64 || (hd.h !== 64 && hd.h !== 32)) throw new Error('size');
        url = src.indexOf('data:') === 0 ? src : URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      }
      return loadImage(url).then(function (img) { return buildSkin(img, src, bytes); });
    });
    skinCache[src] = p;
    return p;
  }
  function characterSrc(ch) { return ch === 'alex' ? ALEX : STEVE; }

  // ───────────────────────── Geometrie ─────────────────────────
  // Würfel mit Flächen-UVs nach Minecraft-Layout. size in Skin-Pixeln, origin (u,v) der Part-Region.
  function boxVerts(w, h, d, u, v, inflate, texW, texH) {
    var g = inflate || 0, hw = w / 2 + g, hh = h / 2 + g, hd = d / 2 + g;
    function uv(px, py) { return [px / texW, py / texH]; }
    var out = [];
    // Fläche: 4 Ecken (BL, BR, TR, TL aus Sicht des Betrachters der Außenseite), Normale, UV-Rechteck (x,y,w,h)
    function face(c, n, r, flipU, flipV) {
      var u0 = r[0], v0 = r[1], u1 = r[0] + r[2], v1 = r[1] + r[3];
      if (flipU) { var t = u0; u0 = u1; u1 = t; }
      if (flipV) { var s = v0; v0 = v1; v1 = s; }
      var q = [uv(u0, v1), uv(u1, v1), uv(u1, v0), uv(u0, v0)]; // BL, BR, TR, TL
      [0, 1, 2, 0, 2, 3].forEach(function (i) { out.push(c[i][0], c[i][1], c[i][2], q[i][0], q[i][1], n[0], n[1], n[2]); });
    }
    // front (+z): x aufsteigend nach rechts
    face([[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]], [0, 0, 1], [u + d, v + d, w, h]);
    // back (-z): Betrachter bei -z, rechts = -x
    face([[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]], [0, 0, -1], [u + d + w + d, v + d, w, h]);
    // right-Fläche des Charakters (-x): Betrachter bei -x, rechts = +z
    face([[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]], [-1, 0, 0], [u, v + d, d, h]);
    // left (+x): rechts = -z
    face([[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]], [1, 0, 0], [u + d + w, v + d, d, h]);
    // top (+y): v wächst nach +z (Vorderseite unten im Bild)
    face([[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]], [0, 1, 0], [u + d, v, w, d]);
    // bottom (-y)
    face([[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]], [0, -1, 0], [u + d + w, v, w, d]);
    return new Float32Array(out);
  }
  function plainBox(w, h, d, uvr) { // eine UV-Region auf allen Seiten (für Tisch)
    var hw = w / 2, hh = h / 2, hd = d / 2, out = [];
    function face(c, n, r) {
      var q = [[r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]]];
      [0, 1, 2, 0, 2, 3].forEach(function (i) { out.push(c[i][0], c[i][1], c[i][2], q[i][0], q[i][1], n[0], n[1], n[2]); });
    }
    var top = uvr.top || uvr.all, side = uvr.side || uvr.all;
    face([[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]], [0, 0, 1], side);
    face([[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]], [0, 0, -1], side);
    face([[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]], [-1, 0, 0], side);
    face([[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]], [1, 0, 0], side);
    face([[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]], [0, 1, 0], top);
    face([[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]], [0, -1, 0], side);
    return new Float32Array(out);
  }
  function cylinder(r, h, seg) {
    var out = [], i, a0, a1, x0, z0, x1, z1;
    function tri(p, q, s, n) { [p, q, s].forEach(function (v, k) { out.push(v[0], v[1], v[2], 0.5, 0.5, n[k][0], n[k][1], n[k][2]); }); }
    for (i = 0; i < seg; i++) {
      a0 = i / seg * Math.PI * 2; a1 = (i + 1) / seg * Math.PI * 2;
      x0 = Math.cos(a0) * r; z0 = Math.sin(a0) * r; x1 = Math.cos(a1) * r; z1 = Math.sin(a1) * r;
      var n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
      tri([x0, 0, z0], [x1, 0, z1], [x1, h, z1], [n0, n1, n1]);
      tri([x0, 0, z0], [x1, h, z1], [x0, h, z0], [n0, n1, n0]);
      tri([0, h, 0], [x0, h, z0], [x1, h, z1], [[0, 1, 0], [0, 1, 0], [0, 1, 0]]);
    }
    return new Float32Array(out);
  }

  // ───────────────────────── WebGL ─────────────────────────
  var VS = 'attribute vec3 aPos;attribute vec2 aUV;attribute vec3 aNor;uniform mat4 uVP;uniform mat4 uM;uniform float uWind;uniform float uTime;' +
    'varying vec2 vUV;varying float vL;varying vec3 vN;varying vec3 vW;' +
    'void main(){vec4 w=uM*vec4(aPos,1.0);if(uWind>0.0){float k=1.0-aUV.y;w.x+=sin(uTime*1.8+w.z*0.17+w.x*0.11)*uWind*k;w.z+=cos(uTime*1.4+w.x*0.13)*uWind*0.6*k;}gl_Position=uVP*w;vUV=aUV;vW=w.xyz;' +
    'vec3 n=normalize(mat3(uM[0].xyz,uM[1].xyz,uM[2].xyz)*aNor);vN=n;' +
    'vL=0.58+0.42*clamp(dot(n,normalize(vec3(0.25,0.9,0.5))),0.0,1.0);}';
  var FS = 'precision mediump float;varying vec2 vUV;varying float vL;varying vec3 vN;varying vec3 vW;' +
    'uniform sampler2D uTex;uniform vec3 uTint;uniform vec3 uEye;uniform float uGloss;uniform float uFogOn;uniform vec3 uFogC;uniform vec2 uFogR;' +
    'void main(){vec4 c=texture2D(uTex,vUV);if(c.a<0.5)discard;' +
    'vec3 col=c.rgb*uTint*vL;' +
    'if(uGloss>0.0){vec3 V=normalize(uEye-vW);vec3 Lh=normalize(vec3(0.25,0.9,0.5));vec3 H=normalize(Lh+V);' +
    'float sp=pow(max(dot(normalize(vN),H),0.0),28.0)*uGloss;col+=vec3(sp);}' +
    'if(uFogOn>0.0){float fd=length(uEye-vW);col=mix(col,uFogC,uFogOn*clamp((fd-uFogR.x)/(uFogR.y-uFogR.x),0.0,1.0));}' +
    'gl_FragColor=vec4(col,1.0);}';

  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function Renderer(canvas) {
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false }) ||
             canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(p);
    this.prog = p;
    this.loc = {
      pos: gl.getAttribLocation(p, 'aPos'), uv: gl.getAttribLocation(p, 'aUV'), nor: gl.getAttribLocation(p, 'aNor'),
      vp: gl.getUniformLocation(p, 'uVP'), m: gl.getUniformLocation(p, 'uM'),
      tex: gl.getUniformLocation(p, 'uTex'), tint: gl.getUniformLocation(p, 'uTint'),
      eye: gl.getUniformLocation(p, 'uEye'), gloss: gl.getUniformLocation(p, 'uGloss'), fogOn: gl.getUniformLocation(p, 'uFogOn'), wind: gl.getUniformLocation(p, 'uWind'), time: gl.getUniformLocation(p, 'uTime'), fogC: gl.getUniformLocation(p, 'uFogC'), fogR: gl.getUniformLocation(p, 'uFogR')
    };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enableVertexAttribArray(this.loc.pos); gl.enableVertexAttribArray(this.loc.uv); gl.enableVertexAttribArray(this.loc.nor);
    this.white = this.texFromCanvas(whiteCanvas());
  }
  function whiteCanvas() { var c = document.createElement('canvas'); c.width = 1; c.height = 1; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1, 1); return c; }
  Renderer.prototype.texFromCanvas = function (src) {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    try { while (gl.getError() !== gl.NO_ERROR) { /* alte Fehler leeren */ } gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); }
    catch (e) { gl.deleteTexture(t); return null; }
    if (gl.getError() !== gl.NO_ERROR) { gl.deleteTexture(t); return null; }   // Upload fehlgeschlagen: nie eine halbfertige/undefinierte Textur zeichnen
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  // Kachel-Textur (REPEAT, nearest) fuer Boden/Huegel/Baeume der Ich-Ansicht (16x16 Minecraft-Texturen)
  Renderer.prototype.texRepeat = function (src) {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try { while (gl.getError() !== gl.NO_ERROR) { } gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) { gl.deleteTexture(t); return null; }
    if (gl.getError() !== gl.NO_ERROR) { gl.deleteTexture(t); return null; }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    try { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST); } catch (e) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return t;
  };
  Renderer.prototype.texLinear = function (src) {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try { while (gl.getError() !== gl.NO_ERROR) { } gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) { gl.deleteTexture(t); return null; }
    if (gl.getError() !== gl.NO_ERROR) { gl.deleteTexture(t); return null; }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  Renderer.prototype.wind = function (amp, t) { var gl = this.gl, L = this.loc; gl.uniform1f(L.wind, amp || 0); if (amp) gl.uniform1f(L.time, t || 0); };
  Renderer.prototype.fog = function (on, c, r) { var gl = this.gl, L = this.loc; gl.uniform1f(L.fogOn, on || 0); if (on) { gl.uniform3f(L.fogC, c[0], c[1], c[2]); gl.uniform2f(L.fogR, r[0], r[1]); } };
  Renderer.prototype.buffer = function (data, noCull) {
    var gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buf: b, n: data.length / 8, noCull: !!noCull };
  };
  Renderer.prototype.draw = function (geo, model, tex, tint, gloss) {
    var gl = this.gl, L = this.loc;
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.buf);
    gl.vertexAttribPointer(L.pos, 3, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(L.uv, 2, gl.FLOAT, false, 32, 12);
    gl.vertexAttribPointer(L.nor, 3, gl.FLOAT, false, 32, 20);
    gl.uniformMatrix4fv(L.m, false, model);
    gl.uniform3f(L.tint, tint[0], tint[1], tint[2]);
    gl.uniform1f(L.gloss, gloss || 0);
    if (geo.noCull) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(L.tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, geo.n);
    this.calls = (this.calls || 0) + 1; this.tris = (this.tris || 0) + geo.n / 3;
  };

  // ───────────────────────── Figur-Modell ─────────────────────────
  // Teile: pivot-Position (relativ zum Körper-Ursprung = Boden), Größe, Basis-/Overlay-UV
  function partDefs(slim) {
    var aw = slim ? 3 : 4;
    return {
      head:  { w: 8, h: 8, d: 8, base: [0, 0], over: [32, 0], inf: 0.5, piv: [0, 24, 0], off: [0, 4, 0] },
      body:  { w: 8, h: 12, d: 4, base: [16, 16], over: [16, 32], inf: 0.25, piv: [0, 12, 0], off: [0, 6, 0] },
      armR:  { w: aw, h: 12, d: 4, base: [40, 16], over: [40, 32], inf: 0.25, piv: [-(4 + aw / 2), 22, 0], off: [0, -4, 0] },
      armL:  { w: aw, h: 12, d: 4, base: [32, 48], over: [48, 48], inf: 0.25, piv: [(4 + aw / 2), 22, 0], off: [0, -4, 0] },
      legR:  { w: 4, h: 12, d: 4, base: [0, 16], over: [0, 32], inf: 0.25, piv: [-2, 12, 0], off: [0, -6, 0] },
      legL:  { w: 4, h: 12, d: 4, base: [16, 48], over: [0, 48], inf: 0.25, piv: [2, 12, 0], off: [0, -6, 0] }
    };
  }
  var geoCache = {};
  function partGeos(R, slim) {
    var key = slim ? 's' : 'w';
    if (geoCache[key] && geoCache[key].R === R) return geoCache[key].g;
    var defs = partDefs(slim), g = {};
    Object.keys(defs).forEach(function (k) {
      var p = defs[k];
      g[k] = {
        def: p,
        base: R.buffer(boxVerts(p.w, p.h, p.d, p.base[0], p.base[1], 0, 64, 64)),
        over: R.buffer(boxVerts(p.w, p.h, p.d, p.over[0], p.over[1], p.inf, 64, 64))
      };
    });
    geoCache[key] = { R: R, g: g };
    return g;
  }

  // ───────────────────────── Pose / Animation ─────────────────────────
  function ease(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

  function newPose() { return { lift: 0, bend: 0, headX: 0, headY: 0, headZ: 0, armRx: 0, armRz: 0, armLx: 0, armLz: 0, lean: 0, hop: 0, tilt: 0, legRx: 0, legLx: 0, yaw: 0 }; }

  // Zielpose je Zustand (Zeit t in Sekunden seit Zustandsbeginn, ph = Phasenversatz der Figur)
  function reachAngle(f) { // Armwinkel zur Glockenmitte (Körper bei 11,5, Glocke Mitte y=28)
    return Math.atan2(9, (f.lift || 0));   // Glocke (Skala 0.85): Mitte y=22
  }
  function reporterPose(f, t, now) {
    var p = newPose(), w = REDUCED ? 0 : 1, ph = f.phase;
    p.armRx = -1.25 + Math.sin(now * 1.1 + ph) * 0.03 * w; p.armLx = p.armRx;
    p.armRz = -0.36; p.armLz = 0.42;
    p.headX = 0.1; p.headY = Math.sin(now * 0.5 + ph) * 0.1 * w;
    if (f.state === 'cheer') { p.headX = 0.1 + Math.sin(t * 10) * 0.28 * Math.max(0, 1 - t / 1.0) * w; }
    else if (f.state === 'wrong') { p.headY = Math.sin(t * 14) * 0.45 * Math.max(0, 1 - t / 0.9) * w; }
    p.hop = Math.sin(now * 1.3 + ph) * 0.1 * w;
    return p;
  }
  function targetPose(f, t, now) {
    if (f.reporter) return reporterPose(f, t, now);
    var p = newPose(), ph = f.phase, w = REDUCED ? 0 : 1;
    // Idle: Atmen + leichter Armschwung, Blick zur Tischmitte
    p.armRx = Math.sin(now * 1.3 + ph) * 0.05 * w;
    p.armLx = -Math.sin(now * 1.3 + ph) * 0.05 * w;
    p.armRz = 0.06 + Math.sin(now * 0.9 + ph) * 0.02 * w;
    p.armLz = -0.06 - Math.sin(now * 0.9 + ph) * 0.02 * w;
    p.headY = Math.sin(now * 0.6 + ph) * 0.06 * w;
    p.headX = 0.12;
    p.hop = Math.sin(now * 1.3 + ph) * 0.12 * w;
    switch (f.state) {
      case 'buzz': {
        // 0-0.18s: Schritt vor + Arm hebt; 0.18-0.480s: Schlag; danach Hand auf Buzzer
        var a = ease(t / 0.18);
        p.lean = f.reach * a;
        p.armRx = -(reachAngle(f) * a + (t > 0.18 && t < 0.3 ? 0.25 * Math.sin((t - 0.18) / 0.12 * Math.PI) : 0)); p.lift = f.lift * a;
        p.armRz = 0; p.headX = 0.2 + 0.1 * a; p.headY = 0; p.bend = 0.1 * a;
        break;
      }
      case 'hold': // nach dem Buzz, Hand bleibt kurz auf dem Buzzer, Blick zum Publikum
        p.lean = f.reach; p.lift = f.lift; p.armRx = -reachAngle(f); p.armRz = 0; p.headX = 0.15; p.bend = 0.1;
        break;
      case 'think': {
        var bob = Math.sin(t * 2.4) * 0.05 * w;
        p.lean = f.reach * 0.35;
        p.armRx = -1.62 + bob;         // Arm waagerecht nach vorn: Hand auf Kinnhöhe
        p.armRz = -0.25;               // zur Körpermitte
        p.headZ = 0.2; p.headX = 0.22 + bob * 0.5; p.headY = 0.15;
        break;
      }
      case 'speak':
        p.lean = f.reach * 0.2; p.armRx = -0.5 + Math.sin(t * 5) * 0.08 * w; p.armRz = 0.2; p.headX = 0.05; p.headY = 0;
        break;
      case 'cheer': {
        var osc = Math.sin(t * 9) * 0.18 * w;
        p.armRx = -2.9 + osc; p.armLx = -2.9 - osc; p.armRz = 0.25; p.armLz = -0.25;
        p.hop = Math.abs(Math.sin(t * 7)) * 1.6 * w * Math.max(0, 1 - t / 1.4);
        p.headX = -0.15; p.headY = 0;
        break;
      }
      case 'wrong': {
        var shake = Math.sin(t * 16) * 0.45 * Math.max(0, 1 - t / 0.9) * w;
        p.headY = shake; p.headX = 0.45 * ease(t / 0.25);
        p.armRx = 0.05; p.armLx = 0.05; p.armRz = 0.02; p.armLz = -0.02;
        p.hop = -0.48 * ease(t / 0.3); p.tilt = 0.06 * ease(t / 0.3);
        break;
      }
      case 'timeout':
        p.headX = 0.35; p.armRx = 0; p.armLx = 0; p.hop = -0.2; p.headY = 0;
        break;
    }
    return p;
  }

  // ───────────────────────── Szene ─────────────────────────
  function Scene(container, opts) {
    opts = opts || {};
    var self = this;
    this.box = container;
    this.myId = opts.myId || null;
    this.preview = !!opts.preview;
    this.solo = !!opts.solo;
    this.bookRoll = opts.bookRoll !== undefined ? opts.bookRoll : Math.PI / 2;   // Auftraggeber: Buch um 90 Grad gedreht
    this.labelsBelow = opts.labelsBelow !== undefined ? !!opts.labelsBelow : !!opts.solo;   // Schilder unter die Fuesse: Blase kollidiert nie damit
    this.zoom = opts.zoom || 1;              // <1: Kamera naeher (Titelbild)
    this.bellScale = opts.bellScale || 0.85; // Glockengroesse
    this.players = [];
    this.figs = {};
    this.bubbles = {};
    this.locked = {};
    this.destroyed = false;
    this.activeId = null;
    this.t0 = performance.now();
    this.last = this.t0;
    this.needsRender = true;
    this.view = null;

    container.classList.add('mg-scene');
    if (opts.solo) container.classList.add('solo');
    container.innerHTML = '<canvas class="mg-scene-canvas" aria-hidden="true"></canvas><div class="mg-scene-layer"></div>';
    this.canvas = container.querySelector('canvas');
    this.layer = container.querySelector('.mg-scene-layer');

    try {
      this.R = new Renderer(this.canvas);
      this.initGL();
    } catch (e) {
      this.R = null;
      container.classList.add('no-gl');
    }

    this._onResize = function () { self.resize(); };
    global.addEventListener('resize', this._onResize);
    if (global.ResizeObserver) { this._ro = new ResizeObserver(this._onResize); this._ro.observe(container); }
    this._onVis = function () { if (!document.hidden) { self.last = performance.now(); self.loop(); } };
    document.addEventListener('visibilitychange', this._onVis);
    this.resize();
    this.loop();
  }

  Scene.prototype.initGL = function () {
    var R = this.R, self = this;
    this.geo = {
      table: R.buffer(plainBox(20, 2, 20, { top: [0, 0, 1, 1], side: [0, 0, 1, 1] })),
      leg: R.buffer(plainBox(2, 12, 2, { all: [0, 0, 0.125, 0.75] })),
      floor: R.buffer(cylinder(1, 0.01, 40), true),
      post: R.buffer(plainBox(2, 13, 4, { all: [0, 0, 1, 1] })),
      beam: R.buffer(plainBox(12, 2, 2, { all: [0, 0, 1, 1] })),
      bellBody: R.buffer(boxVerts(6, 7, 6, 0, 0, 0, 32, 32)),
      bellLip: R.buffer(boxVerts(8, 2, 8, 0, 13, 0, 32, 32)),
      book: R.buffer(plainBox(20, 20, 0.35, { all: [0, 0, 1, 1] }))
    };
    this.tex = { top: null, side: null };
    function img(src, key) {
      loadImage(src).then(function (i) { self.tex[key] = R.texFromCanvas(i); self.needsRender = true; }, function () {});
    }
    img(BASE + 'block/scaffolding_top.png', 'top');
    img(BASE + 'block/scaffolding_side.png', 'side');
    img('assets/ui/buch.png', 'book');
    img(BASE + 'block/stone.png', 'stone');
    img(BASE + 'block/oak_log.png', 'log');
    img(BASE + 'entity/bell/bell_body.png', 'bell');
  };

  // ── Ich-Ansicht: Minecraft-Umgebung (Gras-Boden, Grasbueschel, Blumen, Baeume in mehreren Typen, Berge mit Schnee, Block-Wolken, Sonne, Dunst) ──
  // Alles ist zu wenigen Meshes verschmolzen (ca. 12 Draw-Calls); Qualitaet hoch/mittel/niedrig (Einstellung mg_fpv_gfx, "auto" senkt bei niedriger FPS).
  var BIOMES = {
    plains: { bg: 'bg-shader', ground: 'grass_block_top', gt: [0.52, 0.8, 0.32], trees: ['oak', 'birch'], n: 1, grass: 1, flowers: 1, mount: 0.6, sky: [[0.36, 0.6, 0.93], [0.76, 0.88, 0.98]] },
    forest: { bg: 'bg-shader', ground: 'grass_block_top', gt: [0.42, 0.7, 0.27], trees: ['oak', 'birch', 'darkoak'], n: 1.6, grass: 0.8, flowers: 0.5, mount: 0.6, sky: [[0.34, 0.56, 0.88], [0.72, 0.85, 0.96]] },
    desert: { bg: null, ground: 'sand', gt: [1, 0.96, 0.82], trees: ['cactus'], n: 0.8, grass: 0, flowers: 0, mount: 0.5, sky: [[0.46, 0.68, 0.95], [0.96, 0.89, 0.74]] },
    snow: { bg: null, ground: 'snow', gt: [1, 1, 1], trees: ['spruce'], n: 1, grass: 0, flowers: 0, mount: 1.2, sky: [[0.52, 0.64, 0.8], [0.84, 0.89, 0.94]] }
  };
  var LEAF = { oak: [0.46, 0.74, 0.28], birch: [0.6, 0.8, 0.38], darkoak: [0.28, 0.54, 0.2], spruce: [0.5, 0.72, 0.55] };
  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mergeBoxes(list) {   // Quader {x,y,z (Mitte), w,h,d, rx,ry (UV-Wiederholung)} -> ein Vertex-Puffer
    var out = [];
    list.forEach(function (b) { var v = plainBox(b.w, b.h, b.d, { top: [0, 0, b.rx, b.rx], side: [0, 0, b.rx, b.ry] }); for (var i = 0; i < v.length; i += 8) out.push(v[i] + b.x, v[i + 1] + b.y, v[i + 2] + b.z, v[i + 3], v[i + 4], v[i + 5], v[i + 6], v[i + 7]); });
    return new Float32Array(out);
  }
  function crossQuads(list) {   // zwei gekreuzte Quads je Buschel (Alpha-Cutout), Normale nach oben (weiches Licht)
    var out = [];
    list.forEach(function (t) {
      [Math.PI / 4, -Math.PI / 4].forEach(function (an) {
        var dx = Math.cos(an) * t.s / 2, dz = Math.sin(an) * t.s / 2, c = [[t.x - dx, 0, t.z - dz, 0, 1], [t.x + dx, 0, t.z + dz, 1, 1], [t.x + dx, t.h, t.z + dz, 1, 0], [t.x - dx, t.h, t.z - dz, 0, 0]];
        [0, 1, 2, 0, 2, 3].forEach(function (i) { out.push(c[i][0], c[i][1], c[i][2], c[i][3], c[i][4], 0, 1, 0); });
      });
    });
    return new Float32Array(out);
  }
  // Hintergrund-Ring: 4 gespiegelte Kopien des Bildes (je 90 Grad), nahtlos; Mitte der ersten Kopie zeigt in Blickrichtung
  function bgRing(R, rad, hgt, fwd) {
    var out = [], N = 64, per = N / 4, i, j, a0 = fwd - Math.PI / 4;
    for (i = 0; i < N; i++) {
      var k = Math.floor(i / per), lj = i % per, u0 = lj / per, u1 = (lj + 1) / per;
      if (k % 2 === 1) { u0 = 1 - u0; u1 = 1 - u1; }
      var A0 = a0 + i / N * Math.PI * 2, A1 = a0 + (i + 1) / N * Math.PI * 2;
      var x0 = Math.sin(A0) * rad, z0 = -Math.cos(A0) * rad, x1 = Math.sin(A1) * rad, z1 = -Math.cos(A1) * rad;
      var q = [[x0, -6, z0, u0, 1], [x1, -6, z1, u1, 1], [x1, hgt, z1, u1, 0], [x0, hgt, z0, u0, 0]];
      [0, 1, 2, 0, 2, 3].forEach(function (t) { out.push(q[t][0], q[t][1], q[t][2], q[t][3], q[t][4], 0, 0, 1); });
    }
    return R.buffer(new Float32Array(out), true);
  }
  // Blatt-Textur: Loecher werden deckend (dunkler), damit die Kronen dicht und ruhig wirken
  function denseLeaves(im) {
    try { var c = document.createElement('canvas'); c.width = im.width; c.height = im.height; var x = c.getContext('2d'); x.drawImage(im, 0, 0); var d = x.getImageData(0, 0, c.width, c.height), p = d.data; for (var i = 0; i < p.length; i += 4) { if (p[i + 3] < 128) { p[i] = p[i + 1] = p[i + 2] = 110; } p[i + 3] = 255; } x.putImageData(d, 0, 0); return c; } catch (e) { return im; }
  }
  Scene.prototype.setBiome = function (name) { if (!name) { this.biomeName = null; this.env = null; return; } if (!BIOMES[name]) name = 'plains'; if (this.biomeName !== name) { this.biomeName = name; this.env = null; } };
  Scene.prototype.setGfx = function (q) { var m = { high: 0, mid: 1, low: 2 }; if (m[q] != null) { this._gfxFix = m[q]; } else { this._gfxFix = null; this._gfxAuto = null; } this.env = null; };
  Scene.prototype.gfxLevel = function () {
    if (this._gfxFix != null) return this._gfxFix;
    var saved = null; try { saved = localStorage.getItem('mg_fpv_gfx'); } catch (e) {}
    var m = { high: 0, mid: 1, low: 2 };
    if (m[saved] != null) return m[saved];
    return this._gfxAuto != null ? this._gfxAuto : (global.innerWidth < 700 ? 1 : 0);
  };
  Scene.prototype.ensureEnv = function () {
    if (this.env || !this.R || this.preview) return;
    var R = this.R, self = this, q = this.gfxLevel(), qf = [1, 0.5, 0.2][q];
    var pref = ''; try { pref = localStorage.getItem('mg_fpv_biome') || ''; } catch (x) {}
    var name = this.biomeName || (BIOMES[pref] ? pref : '') || ['plains', 'forest', 'plains', 'forest', 'snow', 'desert'][Math.floor(Math.random() * 7)], cfg = BIOMES[name] || BIOMES.plains;
    this.biomeName = name; this._envQ = q;
    var E = { cfg: cfg, tex: {}, g: {}, clouds: [], trees: {}, q: q }, rnd = rng(name.length * 7919 + (this.biomeSeed || 12345));
    var i, a, r;
    E.g.ground = R.buffer(mergeBoxes([{ x: 0, y: -0.5, z: 0, w: 900, h: 1, d: 900, rx: 56, ry: 1 }]));
    function scatter(n, rmin, rmax, fn) { var l = []; for (var k = 0; k < n; k++) { var an = rnd() * Math.PI * 2, rr = rmin + Math.sqrt(rnd()) * (rmax - rmin); l.push(fn(Math.sin(an) * rr, -Math.cos(an) * rr)); } return l; }
    if (cfg.grass) E.g.grass = R.buffer(crossQuads(scatter(Math.round(380 * qf * cfg.grass), 22, 95, function (x, z) { return { x: x, z: z, s: 10 + rnd() * 6, h: 8 + rnd() * 8 }; })), true);
    if (cfg.flowers && q < 2) E.g.flowers = R.buffer(crossQuads(scatter(Math.round(70 * qf * cfg.flowers), 24, 80, function (x, z) { return { x: x, z: z, s: 8, h: 9 }; })), true);
    var nTrees = Math.round(10 * qf * cfg.n), byType = {};
    cfg.trees.forEach(function (t) { byType[t] = { trunk: [], crown: [] }; });
    for (i = 0; i < nTrees; i++) {
      var tp = cfg.trees[Math.floor(rnd() * cfg.trees.length)], T = byType[tp];
      a = rnd() * Math.PI * 2; r = 190 + rnd() * 70;
      var x = Math.sin(a) * r, z = -Math.cos(a) * r, th = 32 + Math.floor(rnd() * 2) * 16, far = false;
      if (tp === 'cactus') { T.trunk.push({ x: x, y: th / 3, z: z, w: 16, h: th * 2 / 3, d: 16, rx: 1, ry: th / 48 }); continue; }
      T.trunk.push({ x: x, y: th / 2, z: z, w: 16, h: th, d: 16, rx: 1, ry: th / 16 });
      var cs = (tp === 'spruce' ? 32 : 32) + (rnd() < 0.4 ? 8 : 0);
      if (tp === 'spruce') { T.crown.push({ x: x, y: th - 8, z: z, w: cs + 16, h: 24, d: cs + 16, rx: (cs + 16) / 16, ry: 1.5 }, { x: x, y: th + 16, z: z, w: cs, h: 24, d: cs, rx: cs / 16, ry: 1.5 }, { x: x, y: th + 40, z: z, w: cs - 24, h: 24, d: cs - 24, rx: (cs - 24) / 16, ry: 1.5 }); }
      else { T.crown.push({ x: x, y: th + 16, z: z, w: cs, h: 48, d: cs, rx: cs / 16, ry: 3 }, { x: x, y: th + 48, z: z, w: cs - 16, h: 16, d: cs - 16, rx: (cs - 16) / 16, ry: 1 }); }
    }
    Object.keys(byType).forEach(function (t) { var T = byType[t]; E.trees[t] = { trunk: T.trunk.length ? R.buffer(mergeBoxes(T.trunk)) : null, crown: T.crown.length ? R.buffer(mergeBoxes(T.crown)) : null }; });
    var nc = Math.round(18 * (q === 2 ? 0.35 : q === 1 ? 0.65 : 1));
    for (i = 0; i < nc; i++) { var hi = i % 2; E.clouds.push({ a: i / nc * Math.PI * 2 + rnd() * 0.3, r: (hi ? 300 : 250) + rnd() * 40, y: (hi ? 80 : 60) + rnd() * 14, w: 80 + Math.floor(rnd() * 4) * 24, d: 36 + Math.floor(rnd() * 3) * 16, h: 10 + Math.floor(rnd() * 2) * 4 }); }
    E.g.cloud = R.buffer(plainBox(1, 1, 1, { all: [0, 0, 1, 1] }));
    E.g.sun = R.buffer(plainBox(40, 40, 2, { all: [0, 0, 1, 1] }));
    var files = { dirt: 'dirt', ground: cfg.ground, oak_log: 'oak_log', birch_log: 'birch_log', darkoak_log: 'dark_oak_log', spruce_log: 'spruce_log', oak_leaves: 'oak_leaves', birch_leaves: 'birch_leaves', darkoak_leaves: 'dark_oak_leaves', spruce_leaves: 'spruce_leaves', cactus: 'cactus_side', snow: 'snow', grass: 'short_grass', flower: 'dandelion' };
    Object.keys(files).forEach(function (k) { loadImage(BASE + 'block/' + files[k] + '.png').then(function (im) { E.tex[k] = R.texRepeat(/_leaves$/.test(k) ? denseLeaves(im) : im); self.needsRender = true; }, function () {}); });
    var bgOn = !!cfg.bg; try { bgOn = bgOn && localStorage.getItem('mg_fpv_bg') !== '0'; } catch (x) {}   // Bild nur in Biomen mit cfg.bg (Ebene, Wald); je Biom spaeter eigener Dateiname moeglich
    if (bgOn) {
      loadImage(BASE.replace(/mc[/]$/, '') + 'env/' + cfg.bg + (q === 0 ? '' : '-1024') + '.jpg').then(function (im) {
        if (self.env !== E) return;
        var tx = R.texLinear(im); if (!tx) return;
        E.bg = { tex: tx, geo: bgRing(R, 380, 260, Math.PI - (self._camYaw || 0)), t0: performance.now() / 1000 }; self.needsRender = true;
      }, function () {});
    }
    this.env = E;
  };
  Scene.prototype.drawEnv = function (fk, now) {
    var R = this.R, E = this.env, cfg, white = R.white; if (!E) return; cfg = E.cfg;
    var T = E.tex, I = M.t(0, 0, 0);
    if (E.bg) {   // hinterste Ebene: Bild, tiefenmaessig ganz hinten; Einblenden ueber den Nebel-Mix zur Himmelsfarbe
      var bk = Math.min(1, (now - E.bg.t0) / 0.9);
      R.fog(1 - bk, cfg.sky[1], [0, 1]);
      R.draw(E.bg.geo, M.t((this.eye ? this.eye[0] : 0), 0, (this.eye ? this.eye[2] : 0)), E.bg.tex, [1.0, 1.02, 1.04]);
      R.fog(0);
      this.needsRender = bk < 1 || this.needsRender;
    }
    R.fog(fk, cfg.sky[1], [250, 560]);
    R.draw(E.g.ground, I, T.ground || white, T.ground ? cfg.gt : [0.45, 0.62, 0.3]);
    var wamp = REDUCED || (function () { try { return localStorage.getItem('mg_fpv_wind') === '0'; } catch (e) { return false; } })() ? 0 : 1.1;
    R.wind(wamp, now);
    if (E.g.grass) R.draw(E.g.grass, I, T.grass || white, T.grass ? [0.5, 0.78, 0.28] : [0.4, 0.7, 0.2]);
    if (E.g.flowers) R.draw(E.g.flowers, I, T.flower || white, T.flower ? [1, 1, 1] : [0.95, 0.85, 0.2]);
    R.wind(0);
    Object.keys(E.trees).forEach(function (t) {
      var G = E.trees[t], lg = T[t === 'cactus' ? 'cactus' : t + '_log'];
      if (G.trunk) R.draw(G.trunk, I, lg || white, lg ? (t === 'cactus' ? [0.8, 1, 0.8] : [1, 1, 1]) : [0.4, 0.28, 0.16]);
      if (G.crown) R.draw(G.crown, I, T[t + '_leaves'] || white, LEAF[t] || [0.4, 0.7, 0.2]);
    });
    R.fog(0);
    var ay = this._camYaw || 0, sa = ay + 0.5, sl = 330, se = 0.2;
    if (!E.bg && E.q < 2) R.draw(E.g.sun, M.mul(M.t(Math.sin(sa) * Math.cos(se) * sl, Math.sin(se) * sl + 36, Math.cos(sa) * Math.cos(se) * sl), M.ry(sa + Math.PI)), white, [2.2, 1.9, 1]);
    var drift = REDUCED ? 0 : now * 0.01, cl = true; try { cl = localStorage.getItem('mg_fpv_clouds') !== '0'; } catch (x) {}
    if (cl && !E.bg) E.clouds.forEach(function (c) { var an = c.a + drift; R.draw(E.g.cloud, M.mul(M.t(Math.sin(an) * c.r, c.y, Math.cos(an) * c.r), M.mul(M.ry(an), M.s(c.w, c.h, c.d))), white, [1.45, 1.42, 1.4]); });
  };
  Scene.prototype.updateSky = function (fk, pitchTot, fovRad) {
    var E = this.env, b = this.box; if (!b) return;
    if (!E || fk < 0.5) { if (this._skyOn) { b.style.background = ''; this._skyOn = false; } return; }
    var hy = this.h / 2 - Math.tan(-pitchTot) / Math.tan(fovRad / 2) * this.h / 2, key = Math.round(hy) + E.cfg.sky[0].join();
    if (this._skyKey === key && this._skyOn) return; this._skyKey = key; this._skyOn = true;
    function c(v) { return 'rgb(' + Math.round(v[0] * 255) + ',' + Math.round(v[1] * 255) + ',' + Math.round(v[2] * 255) + ')'; }
    var top = c(E.cfg.sky[0]), hor = c(E.cfg.sky[1]), y = Math.max(0, Math.round(hy));
    b.style.background = 'linear-gradient(to bottom,' + top + ' 0,' + hor + ' ' + y + 'px,' + hor + ' 100%)';
  };
  Scene.prototype.resize = function () {
    var r = this.box.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    this.needsRender = true;
    if (this.players.length) this.layout();
  };

  Scene.prototype.layout = function () {
    var n = this.players.length, A, R, rows = n > 4 ? 2 : 1, perRow = Math.ceil(n / rows);
    if (this.preview) { this.ring = { R: 0, A: 0 }; return; }
    if (this.solo) {
      // Spieler links vom Tisch, Reporter gegenüber (keine Glocke)
      var pi, pf;
      for (pi = 0; pi < n; pi++) {
        pf = this.figs[this.players[pi].id]; if (!pf) continue;
        var rep = this.players[pi].id === 'reporter';
        pf.x = rep ? 15 : -15; pf.z = 0; pf.yaw = rep ? -Math.PI / 2 : Math.PI / 2; pf.reach = 0; pf.lift = 0; pf.reporter = rep;
      }
      this.tableScale = 1; this.ring = { R: 15, A: 0 };
      var el0 = this.elev = 0.62, ce0 = Math.cos(el0), se0 = Math.sin(el0), th0 = Math.tan(16 * Math.PI / 180), asp0 = this.w / this.h;
      var uMax0 = 41 * ce0 + 12 * se0, uMin0 = -12 * se0, Hh0 = (uMax0 - uMin0) / 2 + 2;
      this.camDist = Math.max(Hh0 / th0, 24 / (th0 * asp0));
      this.camTargetY = ((uMax0 + uMin0) / 2) / ce0;
      this.needsRender = true;
      return;
    }
    this.box.classList.toggle('many', n > 5);
    A = n <= 1 ? 0 : n === 2 ? 0.95 : rows === 2 ? 1.3 : Math.min(1.5, 0.7 + 0.19 * perRow);
    var ts = this.tableScale = n <= 2 ? 1 : Math.min(2.2, 1 + 0.25 * (n - 2));
    var Rt = 10 * ts + 7;   // Platz zwischen Tischkante und Figuren
    R = n <= 1 ? 13.5 : Math.max(Rt, 11 * (perRow - 1) / (2 * A));
    var R2 = rows === 2 ? R + 11 : R;
    this.ring = { R: R2, A: A };
    var i, f, a, row, rr, k, idxInRow, maxX = 12, maxZnear = 10, maxZfar = 10;
    for (i = 0; i < n; i++) {
      f = this.figs[this.players[i].id]; if (!f) continue;
      row = rows === 2 ? i % 2 : 0;
      idxInRow = rows === 2 ? Math.floor(i / 2) : i;
      k = rows === 2 ? (row === 0 ? Math.ceil(n / 2) : Math.floor(n / 2)) : n;
      a = k === 1 ? 0 : -A + (2 * A) * idxInRow / (k - 1);
      if (rows === 2 && row === 1) a = -A + (2 * A) * (idxInRow + 0.5) / Math.max(1, Math.ceil(n / 2) - 1);
      rr = row === 1 ? R2 : R;
      f.x = Math.sin(a) * rr; f.z = -Math.cos(a) * rr;
      f.yaw = -a;
      f.reach = Math.max(0, rr - 11.5);   // Körper bis 11,5 an die Glocke heran
      f.lift = (10 * ts + 1.5 > 11.5) ? 14 : 0;   // bei großem Tisch steigt die Figur auf die Platte
      maxX = Math.max(maxX, Math.abs(f.x) + 6);
      maxZnear = Math.max(maxZnear, f.z + 5);
      maxZfar = Math.max(maxZfar, -f.z + 5);
    }
    maxX = Math.max(maxX, 10 * ts + 3); maxZnear = Math.max(maxZnear, 10 * ts + 6);   // Tisch bleibt im Bild
    // Kamera so wählen, dass alles knapp den Rahmen füllt (Tisch + Buzzer frei)
    var el = this.elev = n > 5 ? 0.78 : 0.7, ce = Math.cos(el), se = Math.sin(el);
    var uMax = 41 * ce + maxZfar * se, uMin = -maxZnear * se;      // Bildschirm-oben/-unten (inkl. Blase über dem Kopf)
    var fov = 32 * Math.PI / 180, th = Math.tan(fov / 2), asp = this.w / this.h;
    var Hh = (uMax - uMin) / 2 + 2, uC = (uMax + uMin) / 2;
    var D = Math.max(Hh / th, (maxX + 1) / (th * asp));
    this.camDist = D * (this.zoom || 1);
    this.camTargetY = uC / ce;
    this.needsRender = true;
  };

    Scene.prototype.setPlayers = function (list) {
    var self = this, ids = {};
    this.players = list.slice(0, 8);
    this.players.forEach(function (p, idx) {
      ids[p.id] = 1;
      var f = self.figs[p.id];
      if (!f) {
        f = self.figs[p.id] = {
          id: p.id, x: 0, z: 0, yaw: 0, reach: 0, state: 'idle', stateT: performance.now() / 1000, phase: idx * 1.7,
          pose: newPose(), tex: null, slim: false, geos: null, srcKey: '', connected: true, name: p.name
        };
        var lab = document.createElement('div'); lab.className = 'mg-fig-label'; f.label = lab; self.layer.appendChild(lab);
      }
      f.name = p.name; f.connected = p.connected !== false; f.idx = idx;
      f.label.textContent = p.name + (p.id === self.myId ? ' (du)' : '');
      f.label.classList.toggle('me', p.id === self.myId);
      f.label.classList.toggle('gone', !f.connected);
      var src = (MG_isFull(p.skin)) ? p.skin : characterSrc(p.character);
      if (f.srcKey !== src) {
        f.srcKey = src;
        loadSkin(src).then(function (s) {
          if (f.srcKey !== src || self.destroyed) return;
          if (self.R) {
            var tex = self.R.texFromCanvas(s.canvas);
            if (!tex) throw new Error('texture');
            if (f.tex) self.R.gl.deleteTexture(f.tex);
            f.tex = tex; f.geos = partGeos(self.R, s.slim);
          }
          f.slim = s.slim;
          self.needsRender = true;
        }).catch(function (err) {
          if (f.srcKey !== src || self.destroyed) return;
          if (src !== characterSrc(p.character)) {
            var why = (err && err.message) || 'unbekannt';
            try { console.warn('[MineGuess] Eigener Skin verworfen (' + why + '), Standardfigur wird gerendert.'); } catch (e) {}
            if (global.MGSkin && global.MGSkin.discard && p.id === self.myId || (global.MGSkin && global.MGSkin.get && src === global.MGSkin.get())) { try { global.MGSkin.discard(why); } catch (e) {} }
            f.srcKey = ''; self.setPlayers(self.players.map(function (q) { return q.id === p.id ? { id: q.id, name: q.name, character: q.character, connected: q.connected } : q; }));
          }
        });
      }
    });
    Object.keys(this.figs).forEach(function (id) {
      if (!ids[id]) { var f = self.figs[id]; if (f.label) f.label.remove(); if (f.tex && self.R) self.R.gl.deleteTexture(f.tex); delete self.figs[id]; self.clearBubble(id); }
    });
    this.layout();
    if (!this.R) this.renderFallback();
  };

  function MG_isFull(s) { return typeof s === 'string' && s.indexOf('data:image/png;base64,') === 0 && s.length > 120; }

  Scene.prototype.setState = function (id, st) {
    var f = this.figs[id]; if (!f) return;
    f.state = st; f.stateT = performance.now() / 1000; this.needsRender = true;
    if (f.emote) { if (f.emote.keys && f.emote.keys.yaw) { f.pose.yaw = 0; if (f.vel) f.vel.yaw = 0; } f.emote = null; }   // Antwort/Glocke/neue Frage bricht ein Emote ab
  };
  // Ich-Ansicht: Kamera auf Augenhoehe der Figur id; Umsehen relativ zur Tischrichtung
  Scene.prototype.setFpv = function (on, id) { this.fpvOn = !!on; if (id) this.fpvId = id; if (on) { this.fpvYaw = 0; this.fpvPitch = -0.36; } this.needsRender = true; if (this.wake) this.wake(); };
  Scene.prototype.fpvLook = function (dyaw, dpitch) { this.fpvYaw = Math.max(-1.745, Math.min(1.745, (this.fpvYaw || 0) + dyaw)); this.fpvPitch = Math.max(-1.15, Math.min(0.35, (this.fpvPitch == null ? -0.36 : this.fpvPitch) + dpitch)); this.needsRender = true; if (this.wake) this.wake(); };
  // Fremde Blickrichtung (Multiplayer): yaw/pitch in Grad relativ zum Tisch -> Kopf der Figur (nur Optik)
  Scene.prototype.setLook = function (id, yawDeg, pitchDeg) { var f = this.figs[id]; if (!f) return; f.look = { y: Math.max(-100, Math.min(100, +yawDeg || 0)) * Math.PI / 180, p: Math.max(-66, Math.min(20, +pitchDeg || 0)) * Math.PI / 180, t: performance.now() / 1000 }; this.needsRender = true; if (this.wake) this.wake(); };
  // Emote abspielen (nur Transform); bei reduzierter Bewegung 2 s Symbol-Popup statt Animation
  Scene.prototype.playEmote = function (id, eid) {
    var f = this.figs[id]; if (!f || !global.MGEmote) return;
    var self = this;
    if (REDUCED) { this.say(id, '', 'neutral'); var b = this.bubbles[id]; if (b) b.innerHTML = MGEmote.svg(eid, 26); clearTimeout(f._emT); f._emT = setTimeout(function () { self.clearBubble(id); }, 2000); this.needsRender = true; return; }
    f.emote = { id: eid, t0: performance.now() / 1000, keys: {} }; this.needsRender = true; if (this.wake) this.wake();
  };
  Scene.prototype.buzz = function (id) {
    this.activeId = id;
    this.setState(id, 'buzz');
    this.bellT0 = performance.now();
    var self = this;
    clearTimeout(this._holdT);
    this._holdT = setTimeout(function () { var f = self.figs[id]; if (f && f.state === 'buzz') self.setState(id, 'hold'); }, 420);
  };
  Scene.prototype.think = function (id, on) {
    var f = this.figs[id]; if (!f) return;
    if (on) { if (f.state !== 'think') this.setState(id, 'think'); this.say(id, '…', 'think'); }
    else if (f.state === 'think') this.setState(id, 'hold');
  };
  Scene.prototype.say = function (id, text, kind) {
    var b = this.bubbles[id];
    if (!b) {
      b = this.bubbles[id] = document.createElement('div');
      b.className = 'mg-bubble'; b.setAttribute('aria-hidden', 'true');
      this.layer.appendChild(b);
    }
    b.className = 'mg-bubble ' + (kind || 'neutral');
    b.textContent = String(text).slice(0, kind === 'ask' ? 70 : 60); // nie als HTML
    if (kind === 'think') { b.textContent = ''; b.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>'; }
    if (kind !== 'think') { var f = this.figs[id]; if (f && f.state === 'think') this.setState(id, 'speak'); }
    this.needsRender = true;
  };
  Scene.prototype.clearBubble = function (id) {
    var b = this.bubbles[id]; if (b) { b.remove(); delete this.bubbles[id]; }
  };
  Scene.prototype.react = function (id, kind) {
    if (kind === 'correct') this.setState(id, 'cheer');
    else if (kind === 'wrong') this.setState(id, 'wrong');
    else if (kind === 'timeout') this.setState(id, 'timeout');
  };
  Scene.prototype.setLocked = function (ids) {
    var m = {}; (ids || []).forEach(function (i) { m[i] = 1; }); this.locked = m; this.needsRender = true;
  };
  Scene.prototype.resetRound = function () {
    var self = this;
    Object.keys(this.figs).forEach(function (id) { self.setState(id, 'idle'); self.clearBubble(id); });
    this.activeId = null; this.locked = {};
    this.needsRender = true;
  };

  // Rückfall ohne WebGL: Kopf-Reihe
  Scene.prototype.renderFallback = function () {
    var self = this, wrap = this.layer.querySelector('.mg-fallback');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'mg-fallback'; this.layer.appendChild(wrap); }
    wrap.innerHTML = '';
    this.players.forEach(function (p) {
      var d = document.createElement('div'); d.className = 'mg-fb-fig'; d.dataset.id = p.id;
      d.innerHTML = (global.MGSkin ? global.MGSkin.imgHTML(p.skin, 'lg', p.character) : '');
      var nm = document.createElement('span'); nm.textContent = p.name; d.appendChild(nm);
      wrap.appendChild(d);
    });
  };

  Scene.prototype.loop = function () {
    var self = this;
    if (this.destroyed || this._raf) return;
    this._raf = requestAnimationFrame(function (now) {
      self._raf = 0;
      if (self.destroyed) return;
      if (document.hidden) return;
      self.frame(now);
      var animating = !REDUCED || self.needsRender || self.anyTransient();
      if (animating) self.loop();
    });
  };
  Scene.prototype.anyTransient = function () {
    var now = performance.now() / 1000, self = this;
    return Object.keys(this.figs).some(function (id) { var f = self.figs[id]; return now - f.stateT < 2.5; });
  };

  Scene.prototype.frame = function (nowMs) {
    var now = nowMs / 1000, dt = Math.min(0.05, (nowMs - this.last) / 1000); this.last = nowMs;
    var self = this;
    // Ich-Ansicht: Mischwert 0..1 (Kamerafahrt 0,25 s, bei reduzierter Bewegung sofort)
    var fT = this.fpvOn ? 1 : 0, fK = this.fpvK || 0;
    if (fK !== fT) { fK = REDUCED ? fT : (fT > fK ? Math.min(fT, fK + dt / 0.25) : Math.max(fT, fK - dt / 0.25)); this.fpvK = fK; this.needsRender = true; }
    if (fK > 0 && fK < 1) this.needsRender = true;
    if (fK > 0.99 && this.env && !REDUCED) { this._ft = (this._ft || 0) + dt; this._fn = (this._fn || 0) + 1; if ((this._fn >= 45 || this._ft >= 1.0)) { var avg = this._ft / this._fn; this._ft = 0; this._fn = 0; this._fpsAvg = Math.round(1 / avg); var lvl = this.gfxLevel(), saved = null; try { saved = localStorage.getItem('mg_fpv_gfx'); } catch (e) {} if ((saved == null || saved === 'auto') && avg > 0.021 && lvl < 2) { this._gfxAuto = lvl + 1; this.env = null; } } }

    // Glockenrahmen dreht sich weich zum aktiven Spieler (offene Seite zeigt zur Figur)
    var af = this.activeId && this.figs[this.activeId];
    if (af && !this.solo) {
      var dyaw = af.yaw - (this.bellYawCur || 0);
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      this.bellYawCur = (this.bellYawCur || 0) + dyaw * Math.min(1, REDUCED ? 1 : (dt || 0.016) * 8);
    }
    Object.keys(this.figs).forEach(function (id) {
      var f = self.figs[id], t = performance.now() / 1000 - f.stateT;
      var tp = targetPose(f, t, now), om = f.state === 'buzz' ? 30 : (f.state === 'cheer' ? 16 : 11), key, d = dt || 0.016;
      if (f.look && id !== self.fpvId && performance.now() / 1000 - f.look.t < 4) { tp.headY = Math.max(-1, Math.min(1, f.look.y * 0.8)); tp.headX = Math.max(-0.2, Math.min(0.7, -f.look.p * 0.9)); }
      f.vel = f.vel || newPose();
      // Emote: Zielwerte ueberlagern die Grundpose (direkt gesetzt, 60 fps, Ein-/Ausblenden 0,25 s); Ende: zurueck zur Grundpose
      var direct = null, em = f.emote;
      if (em && !REDUCED && global.MGEmote) {
        var te = performance.now() / 1000 - em.t0, sm = MGEmote.sample(em.id, te);
        if (!sm || sm.done) { if (em.keys.yaw) { f.pose.yaw = 0; f.vel.yaw = 0; } f.emote = null; }
        else { direct = {}; for (var ek in sm.v) { var bv = tp[ek] || 0; f.pose[ek] = (sm.abs && sm.abs[ek]) ? sm.v[ek] : bv + (sm.v[ek] - bv) * sm.env; f.vel[ek] = 0; direct[ek] = 1; em.keys[ek] = 1; } }
      }
      for (key in tp) {
        if (direct && direct[key]) continue;
        if (REDUCED) { f.pose[key] = tp[key]; continue; }
        // kritisch gedämpfte Feder: sanftes Anfahren und Abbremsen (Ease in/out)
        f.vel[key] += (om * om * (tp[key] - f.pose[key]) - 2 * om * f.vel[key]) * d;
        f.pose[key] += f.vel[key] * d;
      }
    });
    this.needsRender = false;
    if (this.R) this.draw();
    this.positionOverlays();
  };

  Scene.prototype.draw = function () {
    var R = this.R, gl = R.gl, self = this;
    if (this.canvas.width < 2) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    var fov = 32 * Math.PI / 180, asp = this.w / this.h, el = this.preview ? 0.18 : (this.elev || 0.7);
    var D = this.preview ? 78 : (this.camDist || 70);
    var target = this.preview ? [0, 16, 0] : [0, this.camTargetY || 17, 0];
    var vy = this.viewYaw || 0;   // sanfte Kamerafahrt/Parallax (Titelbild)
    var eye = [target[0] + D * Math.cos(el) * Math.sin(vy), target[1] + D * Math.sin(el), target[2] + D * Math.cos(el) * Math.cos(vy)];
    var near = 5, fk = this.preview ? 0 : (this.fpvK || 0), fme = fk > 0 ? this.figs[this.fpvId] : null;
    if (fme) {   // Ich-Ansicht: Augen der eigenen Figur (y=28), Yaw +-100 Grad, Pitch -66..+20 Grad, Weitwinkel
      var e = fk * fk * (3 - 2 * fk), ay = fme.yaw + (this.fpvYaw || 0), pp = (this.fpvPitch == null ? -0.36 : this.fpvPitch), cp = Math.cos(pp);
      var fe = [fme.x - Math.sin(fme.yaw) * 14, 36, fme.z - Math.cos(fme.yaw) * 14], ft = [fe[0] + Math.sin(ay) * cp * 20, fe[1] + Math.sin(pp) * 20, fe[2] + Math.cos(ay) * cp * 20];
      this._camYaw = ay; var lp = function (a, b) { return a + (b - a) * e; }, ffov = ((function () { var v = 84; try { v = parseFloat(localStorage.getItem('mg_fpv_fov')) || 84; } catch (x) {} v = Math.max(60, Math.min(100, v)); return asp < 1 ? v + 4 : v; })()) * Math.PI / 180;
      eye = [lp(eye[0], fe[0]), lp(eye[1], fe[1]), lp(eye[2], fe[2])]; target = [lp(target[0], ft[0]), lp(target[1], ft[1]), lp(target[2], ft[2])]; fov = lp(fov, ffov); near = lp(5, 0.5);
    }
    var P = M.persp(fov, asp, near, fk > 0 ? 640 : 400), V = M.look(eye, target, [0, 1, 0]);
    R.calls = 0; R.tris = 0;
    this.VP = M.mul(P, V);
    R.fog(0);
    this.updateSky(fk, fme ? pp : 0, fov);
    gl.uniformMatrix4fv(R.loc.vp, false, this.VP);
    gl.uniform3f(R.loc.eye, eye[0], eye[1], eye[2]);
    this.eye = eye;

    var white = R.white, i, f;
    if (!this.preview) {
      // Boden (Scheibe)
      var fr = (this.ring ? this.ring.R : 14) + 9, fkk = this.fpvK || 0;
      if (fkk > 0.5) { this.ensureEnv(); }
      if (fkk > 0.5 && this.env) { this.drawEnv(fkk, performance.now() / 1000); }
      else R.draw(this.geo.floor, M.mul(M.t(0, -0.02, 0), M.s(fr, 1, fr)), white, [0.26, 0.29, 0.3]);
      // Tisch
      var top = this.tex.top || white, side = this.tex.side || white;
      var tint = this.tex.top ? [1, 1, 1] : [0.62, 0.52, 0.28];
      var tsc = this.tableScale || 1;
      R.draw(this.geo.table, M.mul(M.t(0, 13, 0), M.s(tsc, 1, tsc)), top, tint);
      var lx = [-9 * tsc, 9 * tsc], lz = [-9 * tsc, 9 * tsc];
      for (i = 0; i < 4; i++) R.draw(this.geo.leg, M.t(lx[i & 1], 6, lz[i >> 1]), side, this.tex.side ? [1, 1, 1] : [0.55, 0.45, 0.22]);
      if (this.solo) {
        /* Tischplatte bleibt frei */
      } else {
        // Glocke: Steinpfosten, Balken, goldene Glocke (Pendel um die Balkenachse), Rahmen dreht sich zum Läutenden
        var G = M.mul(M.t(0, 14, 0), M.mul(M.ry(this.bellYawCur || 0), M.s(this.bellScale, this.bellScale, this.bellScale)));
        var stoneT = this.tex.stone || white, logT = this.tex.log || white, bellT = this.tex.bell || white;
        var stTint = this.tex.stone ? [1, 1, 1] : [0.55, 0.55, 0.58], lgTint = this.tex.log ? [0.5, 0.38, 0.27] : [0.35, 0.25, 0.15];
        R.draw(this.geo.post, M.mul(G, M.t(-7, 6.5, 0)), stoneT, stTint);
        R.draw(this.geo.post, M.mul(G, M.t(7, 6.5, 0)), stoneT, stTint);
        R.draw(this.geo.beam, M.mul(G, M.t(0, 14, 0)), logT, lgTint);
        var bt = (performance.now() - (this.bellT0 || -1e9)) / 1000;
        var sw = REDUCED ? (bt < 1.2 ? 0.25 : 0) : 0.55 * Math.exp(-bt / 1.15) * Math.sin(bt * 11.5);
        var BM = M.mul(G, M.mul(M.t(0, 14, 0), M.mul(M.rx(sw), M.t(0, -14, 0))));
        var bTint = this.tex.bell ? [1, 1, 1] : [0.95, 0.78, 0.2];
        R.draw(this.geo.bellBody, M.mul(BM, M.t(0, 9.5, 0)), bellT, bTint, 0.35);
        R.draw(this.geo.bellLip, M.mul(BM, M.t(0, 5, 0)), bellT, bTint, 0.35);
      }
    }

    var ids = Object.keys(this.figs);
    ids.forEach(function (id) {
      var fg = self.figs[id];
      if (!fg.tex || !fg.geos) return;
      var base = M.mul(M.t(fg.x, 0, fg.z), M.ry(fg.yaw + (fg.pose.yaw || 0) + (self.preview ? self.previewYaw || 0 : 0)));
      var many = self.players.length > 5;
      var sc = fg.id === self.activeId ? 1.12 : (many ? 0.82 : 1);
      if (self.preview) sc = 1;
      base = M.mul(base, M.s(sc, sc, sc));
      var p = fg.pose, ownFp = (self.fpvK || 0) > 0.5 && fg.id === self.fpvId && !self.preview;
      if (ownFp) { p = Object.assign({}, p, { armRx: -1.3, armLx: -1.3, armRz: -0.48, armLz: 0.3, hop: 0, bend: 0 }); }
      // Schritt zum Tisch (lean) entlang lokaler +z, Hüpfen, Neigung
      base = M.mul(base, M.t(0, p.hop + (p.lift || 0), p.lean));
      base = M.mul(base, M.rz(p.tilt));
      var tintv = (!fg.connected) ? [0.45, 0.45, 0.45] : self.locked[fg.id] ? [0.7, 0.7, 0.7] : [1, 1, 1];
      var g = fg.geos;
      var up = M.mul(base, M.mul(M.t(0, 12, 0), M.mul(M.rx(p.bend || 0), M.t(0, -12, 0))));
      function part(name, rx, ry, rz) {
        var d = g[name].def;
        var m = M.mul(name.indexOf('leg') === 0 ? base : up, M.t(d.piv[0], d.piv[1], d.piv[2]));
        if (rz) m = M.mul(m, M.rz(rz));
        if (ry) m = M.mul(m, M.ry(ry));
        if (rx) m = M.mul(m, M.rx(rx));
        m = M.mul(m, M.t(d.off[0], d.off[1], d.off[2]));
        R.draw(g[name].base, m, fg.tex, tintv);
        R.draw(g[name].over, m, fg.tex, tintv);
      }
      if (ownFp) return;   // Ich-Ansicht: die Haende kommen als Skin-Haende (mg-hand.js) an die Karte, keine 3D-Arme im Bild
      part('legR', p.legRx || 0, 0, 0); part('legL', p.legLx || 0, 0, 0);
      if (fg.reporter && (self.fpvK || 0) < 0.5) {
        // Buch (assets/ui/buch.png) in beiden Haenden vor der Brust, zur Kamera geneigt; bewegt sich mit dem Oberkoerper
        var bookM = M.mul(up, M.mul(M.t(0, 19.5, 10), M.mul(M.ry(1.25), M.mul(M.rx(-0.28), M.rz(self.bookRoll || 0)))));
        R.draw(self.geo.book, bookM, self.tex.book || R.white, self.tex.book ? [1, 1, 1] : [0.8, 0.6, 0.3]);
      }
      part('body', 0, 0, 0);
      part('armR', p.armRx, 0, p.armRz); part('armL', p.armLx, 0, p.armLz);
      part('head', p.headX, p.headY, p.headZ);
    });
  };

  Scene.prototype.screenPoint = function (x, y, z) {
    var c = M.pt(this.VP, x, y, z);
    return [(c[0] * 0.5 + 0.5) * this.w, (1 - (c[1] * 0.5 + 0.5)) * this.h];
  };

  Scene.prototype.positionOverlays = function () {
    var self = this;
    if (!this.R || !this.VP) { // Fallback: an Elementen ausrichten
      var host = this.box.getBoundingClientRect();
      Object.keys(this.bubbles).forEach(function (id) {
        var el = self.layer.querySelector('.mg-fb-fig[data-id="' + id + '"]'), b = self.bubbles[id];
        if (!el) return;
        var r = el.getBoundingClientRect();
        b.style.transform = 'translate(' + (r.left - host.left + r.width / 2) + 'px,' + (r.top - host.top - 4) + 'px) translate(-50%,-100%)';
      });
      return;
    }
    Object.keys(this.figs).forEach(function (id) {
      var f = self.figs[id], p = f.pose;
      var lean = p.lean, fx = f.x - Math.sin(f.yaw) * -lean, fz = f.z + Math.cos(f.yaw) * lean * 0; // Label bleibt am Standort
      var feet = self.screenPoint(f.x, 0, f.z), headP = self.screenPoint(f.x, 36 * (id === self.activeId ? 1.12 : 1), f.z);
      var lab = f.label, many = self.players.length > 5, full = !many || id === self.activeId || id === self.myId;
      var want = String(f.name || '') + (id === self.myId ? ' (' + ((global.MGI18n && MGI18n.t) ? MGI18n.t('du') : 'du') + ')' : '');
      if (f.labelText !== want) { f.labelText = want; lab.textContent = want; lab.title = f.name; lab.setAttribute('aria-label', f.name); }
      lab.classList.toggle('short', !full); lab.style.display = ((self.fpvK || 0) > 0.5 && id === self.fpvId) ? 'none' : '';
      // Minecraft-Nametag: schwebt ueber dem Kopf, folgt der Figur, skaliert mit ihr (Billboard im DOM)
      var sz = Math.max(30, feet[1] - headP[1]), sc = Math.max(0.7, Math.min(1.25, sz / 95));
      f.labelTop = !self.labelsBelow; f.labelH = self.labelsBelow ? 0 : 24 * sc;
      lab.style.transformOrigin = self.labelsBelow ? '50% 0' : '50% 100%';
      lab.style.transform = self.labelsBelow
        ? 'translate(' + feet[0].toFixed(1) + 'px,' + (feet[1] + 3).toFixed(1) + 'px) translate(-50%,0) scale(' + sc.toFixed(2) + ')'
        : 'translate(' + headP[0].toFixed(1) + 'px,' + (headP[1] - 4).toFixed(1) + 'px) translate(-50%,-100%) scale(' + sc.toFixed(2) + ')';
      var b = self.bubbles[id];
      if (b) {
        var bw = b.offsetWidth || 120, half = bw / 2 + 6;
        var bx = Math.max(half, Math.min(self.w - half, headP[0]));
        var tail = Math.max(-(bw / 2 - 16), Math.min(bw / 2 - 16, headP[0] - bx));
        var by = Math.max((b.offsetHeight || 40) + 14, headP[1] - 2 - (f.labelH || 0) - (self.labelsBelow ? 12 : 18));   // Platz fuer Blasenspitze, Schild bleibt frei
        b.style.setProperty('--tx', tail.toFixed(1) + 'px');
        b.style.transform = 'translate(' + bx.toFixed(1) + 'px,' + by.toFixed(1) + 'px) translate(-50%,-100%)';
      }
    });
  };

  Scene.prototype.destroy = function () {
    this.destroyed = true;
    cancelAnimationFrame(this._raf);
    global.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
    if (this._ro) this._ro.disconnect();
    this.box.innerHTML = '';
    this.box.classList.remove('mg-scene');
  };

  // needsRender sorgt dafür, dass im Reduced-Motion-Modus nach Änderungen genau gezeichnet wird
  Scene.prototype.wake = function () { if (!this._raf && !this.destroyed) this.loop(); };
  ['setState', 'say', 'setLocked', 'resetRound', 'setPlayers', 'resize', 'playEmote'].forEach(function (n) {
    var o = Scene.prototype[n];
    Scene.prototype[n] = function () { var r = o.apply(this, arguments); this.needsRender = true; this.wake(); return r; };
  });

  // ───────────────────────── Öffentliche API ─────────────────────────
  function create(container, opts) {
    var s = new Scene(container, opts);
    return {
      setPlayers: function (l) { s.setPlayers(l); },
      buzz: function (id) { s.buzz(id); }, think: function (id, on) { s.think(id, on); },
      say: function (id, t, k) { s.say(id, t, k); }, clearBubble: function (id) { s.clearBubble(id); },
      react: function (id, k) { s.react(id, k); }, setLocked: function (ids) { s.setLocked(ids); },
      resetRound: function () { s.resetRound(); }, setMyId: function (id) { s.myId = id; },
      playEmote: function (id, e) { s.playEmote(id, e); }, setFpv: function (on, id) { s.setFpv(on, id); }, setLook: function (id, y, p) { s.setLook(id, y, p); }, setBiome: function (n) { s.setBiome(n); }, get stats() { return s.R ? { calls: s.R.calls || 0, tris: Math.round(s.R.tris || 0), gfx: s.gfxLevel() } : null; }, setGfx: function (q) { s.setGfx(q); }, get fps() { return s._fpsAvg || 0; }, get gfx() { return s.gfxLevel(); }, get fpvYaw() { return s.fpvYaw || 0; }, get fpvPitch() { return s.fpvPitch == null ? -0.36 : s.fpvPitch; }, fpvLook: function (a, b) { s.fpvLook(a, b); }, get fpvOn() { return !!s.fpvOn; }, get fpvAmount() { return s.fpvK || 0; }, get figs() { return s.figs; },
      isGL: function () { return !!s.R; }, setViewYaw: function (v) { s.viewYaw = v; s.needsRender = true; s.wake(); }, destroy: function () { s.destroy(); }
    };
  }

  // Vorschau einer einzelnen Figur (Profil), langsame Drehung
  function createPreview(container, opts) {
    opts = opts || {};
    var s = new Scene(container, { preview: true, myId: 'preview' });
    s.previewYaw = -0.5;
    var spin = !REDUCED;
    s.frameOrig = s.frame;
    s.frame = function (n) { if (spin) this.previewYaw = -0.55 + Math.sin(n / 1800) * 0.55; this.frameOrig(n); };
    function set(o) {
      s.setPlayers([{ id: 'p', name: '', skin: o.skin, character: o.character, connected: true }]);
      var f = s.figs.p; if (f) { f.x = 0; f.z = 0; f.yaw = 0; f.label.style.display = 'none'; }
    }
    set(opts);
    return { update: set, destroy: function () { s.destroy(); } };
  }

  global.MGScene = { create: create, createPreview: createPreview, loadSkin: loadSkin, characterSrc: characterSrc, reducedMotion: REDUCED };
})(window);
