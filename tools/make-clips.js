/**
 * Schneidet aus dem Cinematic-Quellvideo kurze, stark komprimierte Hintergrund-Clips.
 *
 * Aufruf (Projektordner):
 *   FFMPEG="C:\\pfad\\ffmpeg.exe" SOURCE="C:\\pfad\\cinematic-source.mp4" node tools/make-clips.js
 * FFMPEG kann ein ffmpeg-static aus einem Ordner AUSSERHALB des Projekts sein
 * (npm install ffmpeg-static in einem Temp-Ordner). SOURCE liegt ebenfalls ausserhalb des Repos.
 * Ohne Umgebungsvariablen wird `ffmpeg` aus dem PATH und ../mineguess-source/cinematic-source.mp4 genutzt.
 *
 * Auswahl der Ausschnitte (START, Sekunden im Quellvideo): Szenenwechsel per
 *   ffmpeg -i SOURCE -vf "select='gt(scene,0.3)',showinfo" -f null -
 * ermittelt, nur Abschnitte >= 8,8 s ohne Schnitt, mittlere Helligkeit (signalstats YAVG) zwischen 40 und 180,
 * 0,9 s Abstand zum Schnitt. Text/HUD wurde per Sichtkontrolle der Poster ausgeschlossen.
 *
 * Ausgabe (kleine Web-Dateien, werden mit der Seite ausgeliefert; das Quellvideo gehoert NICHT ins Repo):
 *   assets/video/clip-NN.mp4            1280x720, 30 fps, H.264 CRF 30, ohne Ton, faststart
 *   assets/video/mobile/clip-NN.mp4     854x480, CRF 31
 *   assets/video/poster/clip-NN.webp    Standbild aus der Clipmitte (<= 80 KB)
 *   assets/video/clips.json             [{id, mp4, mp4Mobile, poster, duration, tone}]
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const SOURCE = process.env.SOURCE || path.join(__dirname, '..', '..', 'mineguess-source', 'cinematic-source.mp4');
const OUT = path.join(__dirname, '..', 'assets', 'video');
const DURATION = 7;                       // Sekunden je Clip
const STARTS = [7.4, 28.4, 69.1, 86.2, 97.5, 115.0, 158.7, 171.4, 183.0, 235.1, 307.3, 347.2];

function run(args, cwd) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', cwd });
  if (r.status !== 0) throw new Error('ffmpeg: ' + (r.stderr || r.error));
}
function meanBrightness(file) {
  const tmp = path.join(OUT, '_yavg.txt');
  // relative Ausgabedatei (Laufwerksbuchstabe "C:" wuerde die Filter-Syntax stoeren), daher cwd = OUT
  run(['-i', file, '-vf', 'fps=2,scale=160:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=_yavg.txt', '-an', '-f', 'null', '-'], OUT);
  const vals = (fs.readFileSync(tmp, 'utf8').match(/YAVG=([0-9.]+)/g) || []).map(s => parseFloat(s.slice(5)));
  fs.unlinkSync(tmp);
  return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
}

if (!fs.existsSync(SOURCE)) { console.error('Quellvideo nicht gefunden:', SOURCE); process.exit(1); }
for (const d of ['', 'mobile', 'poster']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const list = [];
STARTS.forEach((start, i) => {
  const id = 'clip-' + String(i + 1).padStart(2, '0');
  const mp4 = path.join(OUT, id + '.mp4');
  const mobile = path.join(OUT, 'mobile', id + '.mp4');
  const poster = path.join(OUT, 'poster', id + '.webp');
  const common = ['-ss', String(start), '-t', String(DURATION), '-i', SOURCE, '-an', '-pix_fmt', 'yuv420p',
                  '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'main', '-r', '30', '-movflags', '+faststart'];
  run([...common, '-vf', 'scale=1280:720:flags=lanczos', '-crf', '30', mp4]);
  run([...common, '-vf', 'scale=854:480:flags=lanczos', '-crf', '31', mobile]);
  run(['-ss', String(start + DURATION / 2), '-i', SOURCE, '-frames:v', '1', '-vf', 'scale=1280:-1',
       '-c:v', 'libwebp', '-quality', '55', '-compression_level', '6', poster]);
  const y = meanBrightness(mp4);
  list.push({
    id, mp4: `assets/video/${id}.mp4`, mp4Mobile: `assets/video/mobile/${id}.mp4`,
    poster: `assets/video/poster/${id}.webp`, duration: DURATION, tone: y >= 90 ? 'hell' : 'dunkel',
  });
  console.log(id, 'ab', start, 's, Helligkeit', y.toFixed(0), '->', list[list.length - 1].tone,
              '| ' + (fs.statSync(mp4).size / 1048576).toFixed(2) + ' MB, mobil ' + (fs.statSync(mobile).size / 1048576).toFixed(2) + ' MB');
});
fs.writeFileSync(path.join(OUT, 'clips.json'), JSON.stringify(list, null, 2));
console.log('clips.json geschrieben,', list.length, 'Clips');
