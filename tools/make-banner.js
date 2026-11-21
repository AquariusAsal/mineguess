/* Erzeugt die freigestellten Kopfzeilen-Banner aus assets/brand/banner.jpg (keine npm-Abhaengigkeit, Chrome headless + Canvas):
   banner-dark-40/80.png (dunkles Design) und banner-light-40/80.png (helles Design, mit duenner dunkler Kontur).
   Hintergrund wird per "Farbe zu Alpha" entfernt (kein Halo, Funken bleiben), Zuschnitt auf den Inhalt.
   Aufruf: node tools/make-banner.js   (optional CHROME=<Pfad zu chrome.exe>) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'assets', 'brand', 'banner.jpg'), PORT = 3079;
const chrome = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!chrome) { console.error('Chrome nicht gefunden (CHROME=...)'); process.exit(1); }
const PAGE = `<!doctype html><body><script>
function load(u){return new Promise(r=>{var i=new Image();i.onload=()=>r(i);i.src=u})}
function save(n,cv){return new Promise(r=>cv.toBlob(b=>fetch('/'+n,{method:'POST',body:b}).then(r),'image/png'))}
(async function(){
 var im=await load('/banner.jpg'),W=im.naturalWidth,H=im.naturalHeight;
 var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);
 var d=x.getImageData(0,0,W,H),p=d.data;
 // Hintergrundfarbe: Mittel aus Eckbereichen
 var bg=[0,0,0],n=0;[[5,5],[W-40,5],[5,H-40],[W-40,H-40]].forEach(function(o){var q=x.getImageData(o[0],o[1],30,30).data;for(var i=0;i<q.length;i+=4){bg[0]+=q[i];bg[1]+=q[i+1];bg[2]+=q[i+2];n++}});bg=bg.map(function(v){return v/n});
 var minx=W,maxx=0,miny=H,maxy=0;
 for(var y=0;y<H;y++)for(var xx=0;xx<W;xx++){var i=(y*W+xx)*4,a=0;
  for(var k=0;k<3;k++){var v=p[i+k],b=bg[k],ac=v>b?(v-b)/(255-b):(b-v)/b;if(ac>a)a=ac}
  a=a<0.07?0:Math.min(1,(a-0.07)/0.93);
  if(a>0){ for(var k=0;k<3;k++){var v=p[i+k],b=bg[k];p[i+k]=Math.max(0,Math.min(255,Math.round(b+(v-b)/a)))} if(a>0.25){if(xx<minx)minx=xx;if(xx>maxx)maxx=xx;if(y<miny)miny=y;if(y>maxy)maxy=y} }
  p[i+3]=Math.round(a*255);}
 x.putImageData(d,0,0);
 var pad=Math.round(W*0.004);minx=Math.max(0,minx-pad);miny=Math.max(0,miny-pad);maxx=Math.min(W-1,maxx+pad);maxy=Math.min(H-1,maxy+pad);
 var cw=maxx-minx+1,ch=maxy-miny+1;
 var keyed=document.createElement('canvas');keyed.width=cw;keyed.height=ch;keyed.getContext('2d').drawImage(c,minx,miny,cw,ch,0,0,cw,ch);
 await fetch('/info.json',{method:'POST',body:JSON.stringify({bg:bg,crop:[minx,miny,cw,ch]})});
 // stufenweise verkleinern (bessere Qualitaet)
 function scaled(h,outline){var w=Math.round(cw*h/ch),o=outline,cv=document.createElement('canvas');cv.width=w+2*o;cv.height=h+2*o;var cx=cv.getContext('2d');cx.imageSmoothingQuality='high';
  var cur=keyed,cwid=cw,chei=ch;while(chei/2>h){var t=document.createElement('canvas');t.width=Math.round(cwid/2);t.height=Math.round(chei/2);var tx=t.getContext('2d');tx.imageSmoothingQuality='high';tx.drawImage(cur,0,0,t.width,t.height);cur=t;cwid=t.width;chei=t.height}
  var s=document.createElement('canvas');s.width=w;s.height=h;var sx=s.getContext('2d');sx.imageSmoothingQuality='high';sx.drawImage(cur,0,0,w,h);
  if(o>0){var sil=document.createElement('canvas');sil.width=w;sil.height=h;var qx=sil.getContext('2d');qx.drawImage(s,0,0);qx.globalCompositeOperation='source-in';qx.fillStyle='#10151f';qx.fillRect(0,0,w,h);
   for(var a=0;a<16;a++){var ang=a/16*Math.PI*2;cx.drawImage(sil,o+Math.round(Math.cos(ang)*o),o+Math.round(Math.sin(ang)*o))}}
  cx.drawImage(s,o,o);return cv}
 for(var h of [44,60,88,120]){await save('banner-dark-'+h+'.png',scaled(h,0));await save('banner-light-'+h+'.png',scaled(h,h>=88?2:1))}
 await fetch('/done',{method:'POST',body:'1'});
})();</script>`;
const out = ROOT;
const srv = http.createServer((q, r) => {
  if (q.method === 'POST') { const c = []; q.on('data', d => c.push(d)); q.on('end', () => { const n = path.basename(q.url); const b = Buffer.concat(c); if (n === 'done') { r.end('ok'); finish(); return; } fs.writeFileSync(path.join(n === 'info.json' ? os.tmpdir() : out, n), b); r.end('ok'); }); return; }
  if (q.url === '/gen.html') { r.setHeader('content-type', 'text/html'); return r.end(PAGE); }
  if (q.url === '/banner.jpg') return r.end(fs.readFileSync(SRC));
  r.statusCode = 404; r.end();
}).listen(PORT, () => {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'mgb-'));
  const ch = cp.spawn(chrome, ['--headless', '--disable-gpu', '--user-data-dir=' + ud, '--virtual-time-budget=60000', '--dump-dom', 'http://localhost:' + PORT + '/gen.html'], { stdio: 'ignore' });
  setTimeout(() => { console.error('Zeitueberschreitung'); process.exit(1); }, 90000);
});
function finish() { console.log('banner-dark/light-44/60/88/120.png erzeugt'); setTimeout(() => process.exit(0), 300); }
