/* MineGuess Blockpanorama: prozedurale Voxelwelt (Heightmap) mit offiziellen Block-Texturen aus assets/mc/block,
   langsam rotierende Kamera, Tageshimmel, ruhiger Nebel. Ein WebGL-Canvas hinter dem Inhalt.
   - Kein Canvas-Readback; Texturatlas nur per drawImage -> texImage2D.
   - Pausiert bei versteckter Seite oder wenn nicht sichtbar; niedrigere Aufloesung auf Mobile;
     prefers-reduced-motion = ein einzelnes Standbild; ohne WebGL: CSS-Fallback (Klasse .pano-fallback).
   API: MGPanorama.mount(container) -> { destroy() } */
(function (global) {
  'use strict';
  var BASE = 'assets/mc/block/';
  var TILES = ['grass_block_top', 'grass_block_side', 'dirt', 'stone', 'oak_log', 'oak_log_top', 'oak_leaves', 'water_still', 'sand'];
  var T = { grassTop: 0, grassSide: 1, dirt: 2, stone: 3, log: 4, logTop: 5, leaves: 6, water: 7, sand: 8 };
  var N = 44, WATER = 3, SKY = [0.56, 0.78, 0.95];
  var REDUCED = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) || (function () { try { return localStorage.getItem('mg_reduce_motion') === '1'; } catch (e) { return false; } })();

  // ── Welt ──
  function hash(x, z) { var h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); }
  function vnoise(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    var a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function height(x, z) {
    var h = vnoise(x * 0.08, z * 0.08) * 9 + vnoise(x * 0.19, z * 0.19) * 3.2 + vnoise(x * 0.4, z * 0.4) * 1.2;
    var dx = (x - N / 2) / (N / 2), dz = (z - N / 2) / (N / 2);
    h -= (dx * dx + dz * dz) * 2.2;          // Mulde zum Rand: kleine Insel/Hügel
    return Math.max(1, Math.round(h));
  }
  function build() {
    var H = [], x, z;
    for (x = 0; x < N; x++) { H[x] = []; for (z = 0; z < N; z++) H[x][z] = height(x, z); }
    var v = [];  // pos(3) uv(2) col(3)
    function quad(p, tile, col) {
      var u0 = tile / TILES.length, u1 = (tile + 1) / TILES.length;
      var uv = [[u0, 1], [u1, 1], [u1, 0], [u0, 0]];
      [0, 1, 2, 0, 2, 3].forEach(function (i) { v.push(p[i][0], p[i][1], p[i][2], uv[i][0], uv[i][1], col[0], col[1], col[2]); });
    }
    function side(x0, y0, z0, dir, hFrom, hTo, tile, col) {
      // senkrechte Flaeche zwischen hFrom (oben) und hTo (unten) an Kante dir
      for (var y = hTo; y < hFrom; y++) {
        var p;
        if (dir === 0) p = [[x0 + 1, y, z0], [x0 + 1, y, z0 + 1], [x0 + 1, y + 1, z0 + 1], [x0 + 1, y + 1, z0]];      // +x
        else if (dir === 1) p = [[x0, y, z0 + 1], [x0, y, z0], [x0, y + 1, z0], [x0, y + 1, z0 + 1]];                 // -x
        else if (dir === 2) p = [[x0 + 1, y, z0 + 1], [x0, y, z0 + 1], [x0, y + 1, z0 + 1], [x0 + 1, y + 1, z0 + 1]]; // +z
        else p = [[x0, y, z0], [x0 + 1, y, z0], [x0 + 1, y + 1, z0], [x0, y + 1, z0]];                                // -z
        var t = (y === hFrom - 1) ? tile : (y > hFrom - 4 ? T.dirt : T.stone);
        var sh = dir < 2 ? 0.72 : 0.82;
        quad(p, t, [col[0] * sh, col[1] * sh, col[2] * sh]);
      }
    }
    for (x = 0; x < N; x++) for (z = 0; z < N; z++) {
      var h = H[x][z], top = h <= WATER ? T.sand : T.grassTop;
      var tint = h <= WATER ? [0.95, 0.9, 0.7] : [0.55, 0.82, 0.32];
      var sideTile = h <= WATER ? T.sand : T.grassSide, stint = h <= WATER ? [0.9, 0.86, 0.68] : [1, 1, 1];
      if (h <= WATER) {
        // Wasserflaeche
        quad([[x, WATER + 0.85, z + 1], [x + 1, WATER + 0.85, z + 1], [x + 1, WATER + 0.85, z], [x, WATER + 0.85, z]], T.water, [0.28, 0.5, 0.95]);
      }
      quad([[x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z], [x, h, z]], top, tint);
      var nb = [[x + 1, z, 0], [x - 1, z, 1], [x, z + 1, 2], [x, z - 1, 3]];
      nb.forEach(function (n) {
        var nh = (n[0] >= 0 && n[0] < N && n[1] >= 0 && n[1] < N) ? H[n[0]][n[1]] : 0;
        if (nh < h) side(x, 0, z, n[2], h, nh, sideTile, stint);
      });
      // Baeume
      if (h > WATER + 1 && hash(x * 3.1, z * 7.7) > 0.965 && x > 2 && z > 2 && x < N - 3 && z < N - 3) {
        var th = 4 + Math.floor(hash(x, z) * 2), i, dx, dz, dy;
        for (i = 0; i < th; i++) { // Stamm
          quad([[x, h + i, z + 1], [x + 1, h + i, z + 1], [x + 1, h + i + 1, z + 1], [x, h + i + 1, z + 1]], T.log, [0.8, 0.8, 0.8]);
          quad([[x + 1, h + i, z], [x, h + i, z], [x, h + i + 1, z], [x + 1, h + i + 1, z]], T.log, [0.7, 0.7, 0.7]);
          quad([[x + 1, h + i, z + 1], [x + 1, h + i, z], [x + 1, h + i + 1, z], [x + 1, h + i + 1, z + 1]], T.log, [0.68, 0.68, 0.68]);
          quad([[x, h + i, z], [x, h + i, z + 1], [x, h + i + 1, z + 1], [x, h + i + 1, z]], T.log, [0.72, 0.72, 0.72]);
        }
        for (dy = th - 2; dy <= th; dy++) for (dx = -2; dx <= 2; dx++) for (dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > 3 || (dy === th && Math.abs(dx) + Math.abs(dz) > 1)) continue;
          var bx = x + dx, by = h + dy, bz = z + dz, lc = [0.38, 0.72, 0.28];
          quad([[bx, by + 1, bz + 1], [bx + 1, by + 1, bz + 1], [bx + 1, by + 1, bz], [bx, by + 1, bz]], T.leaves, lc);
          quad([[bx, by, bz + 1], [bx + 1, by, bz + 1], [bx + 1, by + 1, bz + 1], [bx, by + 1, bz + 1]], T.leaves, [lc[0] * .82, lc[1] * .82, lc[2] * .82]);
          quad([[bx + 1, by, bz], [bx, by, bz], [bx, by + 1, bz], [bx + 1, by + 1, bz]], T.leaves, [lc[0] * .74, lc[1] * .74, lc[2] * .74]);
          quad([[bx + 1, by, bz + 1], [bx + 1, by, bz], [bx + 1, by + 1, bz], [bx + 1, by + 1, bz + 1]], T.leaves, [lc[0] * .7, lc[1] * .7, lc[2] * .7]);
          quad([[bx, by, bz], [bx, by, bz + 1], [bx, by + 1, bz + 1], [bx, by + 1, bz]], T.leaves, [lc[0] * .76, lc[1] * .76, lc[2] * .76]);
        }
      }
    }
    return new Float32Array(v);
  }

  // ── Mathe ──
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function persp(f, a, n, fr) { var t = 1 / Math.tan(f / 2), m = new Float32Array(16); m[0] = t / a; m[5] = t; m[10] = (fr + n) / (n - fr); m[11] = -1; m[14] = 2 * fr * n / (n - fr); return m; }
  function look(e, c) {
    var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    var xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xz); xx /= l; xz /= l;
    var yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;
    var m = new Float32Array(16);
    m[0] = xx; m[4] = xy; m[8] = xz; m[1] = yx; m[5] = yy; m[9] = yz; m[2] = zx; m[6] = zy; m[10] = zz; m[15] = 1;
    m[12] = -(xx * e[0] + xz * e[2]); m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
    return m;
  }

  var VS = 'attribute vec3 p;attribute vec2 t;attribute vec3 c;uniform mat4 vp;uniform vec3 eye;varying vec2 uv;varying vec3 col;varying float fog;' +
    'void main(){gl_Position=vp*vec4(p,1.0);uv=t;col=c;float d=distance(p,eye);fog=clamp((d-26.0)/60.0,0.0,1.0);}';
  var FS = 'precision mediump float;varying vec2 uv;varying vec3 col;varying float fog;uniform sampler2D tex;uniform vec3 sky;' +
    'void main(){vec4 s=texture2D(tex,uv);if(s.a<0.5)discard;vec3 c=s.rgb*col;gl_FragColor=vec4(mix(c,sky,fog),1.0);}';

  function mount(container) {
    var canvas = document.createElement('canvas');
    canvas.className = 'pano-canvas'; canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    var gl = canvas.getContext('webgl', { antialias: false, alpha: false }) || canvas.getContext('experimental-webgl');
    if (!gl) { container.classList.add('pano-fallback'); canvas.remove(); return { destroy: function () {} }; }
    var done = false, raf = 0, visible = true, t0 = performance.now(), yaw0 = 0.6, vbo, n, tex, loc = {}, prog;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    loc.p = gl.getAttribLocation(prog, 'p'); loc.t = gl.getAttribLocation(prog, 't'); loc.c = gl.getAttribLocation(prog, 'c');
    loc.vp = gl.getUniformLocation(prog, 'vp'); loc.eye = gl.getUniformLocation(prog, 'eye'); loc.sky = gl.getUniformLocation(prog, 'sky');
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.disable(gl.CULL_FACE);
    var verts = build(); n = verts.length / 8;
    vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    // Texturatlas (nur drawImage)
    var atlas = document.createElement('canvas'); atlas.width = 16 * TILES.length; atlas.height = 16;
    var ax = atlas.getContext('2d'); ax.imageSmoothingEnabled = false;
    var loaded = 0;
    tex = gl.createTexture();
    TILES.forEach(function (name, i) {
      var im = new Image();
      im.onload = im.onerror = function () {
        if (im.naturalWidth) ax.drawImage(im, 0, 0, 16, 16, i * 16, 0, 16, 16);
        if (++loaded === TILES.length && !done) {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          draw(0); schedule();
        }
      };
      im.src = BASE + name + '.png';
    });
    function resize() {
      var r = container.getBoundingClientRect(), small = Math.min(r.width, global.innerWidth) < 700;
      var dpr = Math.min(global.devicePixelRatio || 1, small ? 1 : 1.5) * (small ? 0.7 : 0.85);
      canvas.width = Math.max(2, Math.round(r.width * dpr)); canvas.height = Math.max(2, Math.round(r.height * dpr));
    }
    function draw(now) {
      if (done) return;
      var ang = yaw0 + (REDUCED ? 0 : (now - t0) / 1000 * 0.045);
      var c = N / 2, R = 30, e = [c + Math.sin(ang) * R, 17, c + Math.cos(ang) * R], tgt = [c, 5, c];
      var aspect = canvas.width / canvas.height;
      var vp = mul(persp(0.9, aspect, 0.5, 200), look(e, tgt));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(SKY[0], SKY[1], SKY[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(loc.t); gl.vertexAttribPointer(loc.t, 2, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(loc.c); gl.vertexAttribPointer(loc.c, 3, gl.FLOAT, false, 32, 20);
      gl.uniformMatrix4fv(loc.vp, false, vp); gl.uniform3f(loc.eye, e[0], e[1], e[2]); gl.uniform3f(loc.sky, SKY[0], SKY[1], SKY[2]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.drawArrays(gl.TRIANGLES, 0, n);
    }
    function schedule() {
      if (REDUCED || done || raf) return;
      raf = requestAnimationFrame(function (now) { raf = 0; if (visible && !document.hidden) draw(now); schedule(); });
    }
    resize();
    global.addEventListener('resize', function () { resize(); if (REDUCED) draw(0); });
    if (global.IntersectionObserver) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(container);
    return { destroy: function () { done = true; cancelAnimationFrame(raf); canvas.remove(); } };
  }
  global.MGPanorama = { mount: mount };
})(window);
