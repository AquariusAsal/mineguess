/* Erzeugt den Hintergrund der Ich-Ansicht aus einem Referenzbild (Chrome headless + Canvas, keine npm-Abhaengigkeit):
   assets/env/bg-shader.jpg (Breite 2048) und assets/env/bg-shader-1024.jpg (Breite 1024).
   Es wird nur das obere Band (Himmel, Wolken, Berg, Baumlinie) ausgeschnitten; die unteren 25 % des Bandes werden weich in den Dunst-Ton ausgeblendet.
   Aufruf: node tools/make-bg.js <pfad/zum/bild.png>   (optional CHROME=<Pfad zu chrome.exe>) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const SRC = process.argv[2]; if (!SRC || !fs.existsSync(SRC)) { console.error('Quelle fehlt: node tools/make-bg.js <bild.png>'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'assets', 'env'); fs.mkdirSync(OUT, { recursive: true });
const chrome = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!chrome) { console.error('Chrome nicht gefunden'); process.exit(1); }
const PAGE = `<!doctype html><body><script>
function load(u){return new Promise(r=>{var i=new Image();i.onload=()=>r(i);i.src=u})}
function save(n,cv,q){return new Promise(r=>cv.toBlob(b=>fetch('/'+n,{method:'POST',body:b}).then(r),'image/jpeg',q))}
(async function(){
 var im=await load('/src.png'),W=im.naturalWidth,H=im.naturalHeight;
 var cropH=Math.round(H*0.61);   // oberes Band bis knapp unter die Baumlinie
 for (var tw of [2048,1024]) {
  var th=Math.round(cropH*tw/W),c=document.createElement('canvas');c.width=tw;c.height=th;var x=c.getContext('2d');x.imageSmoothingQuality='high';
  x.drawImage(im,0,0,W,cropH,0,0,tw,th);
  var g=x.createLinearGradient(0,th*0.74,0,th);g.addColorStop(0,'rgba(196,222,244,0)');g.addColorStop(1,'rgba(196,222,244,1)');x.fillStyle=g;x.fillRect(0,th*0.74,tw,th*0.26);
  await save(tw===2048?'bg-shader.jpg':'bg-shader-1024.jpg',c,0.8);
 }
 await fetch('/done',{method:'POST',body:'1'});
})();</script>`;
const srv = http.createServer((q, r) => {
  if (q.method === 'POST') { const c = []; q.on('data', d => c.push(d)); q.on('end', () => { const n = path.basename(q.url); if (n === 'done') { r.end('ok'); console.log('bg-shader.jpg und bg-shader-1024.jpg erzeugt'); setTimeout(() => process.exit(0), 300); return; } fs.writeFileSync(path.join(OUT, n), Buffer.concat(c)); r.end('ok'); }); return; }
  if (q.url === '/gen.html') { r.setHeader('content-type', 'text/html'); return r.end(PAGE); }
  if (q.url === '/src.png') return r.end(fs.readFileSync(SRC));
  r.statusCode = 404; r.end();
}).listen(3085, () => {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'mgbg-'));
  cp.spawn(chrome, ['--headless', '--disable-gpu', '--user-data-dir=' + ud, '--virtual-time-budget=60000', '--dump-dom', 'http://localhost:3085/gen.html'], { stdio: 'ignore' });
  setTimeout(() => { console.error('Zeitueberschreitung'); process.exit(1); }, 90000);
});
