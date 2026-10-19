/**
 * Baut die Antwortliste (assets/mc/answers.json) und die Icon-Zuordnung (assets/mc/icons.json) fuer das
 * Antwort-Dropdown und laedt fehlende 16x16-Texturen aus dem GitHub-Mirror PrismarineJS/minecraft-assets (1.21.11)
 * nach assets/mc/item bzw. assets/mc/block.
 *
 * Aufruf (Projektordner):
 *   FFMPEG="C:\pfad\ffmpeg.exe" node tools/fetch-icons.js [--dry]
 *   MC_CACHE  Cache ausserhalb des Repos (Standard ../mineguess-cache; de_de.json/en_us.json werden dort erwartet,
 *             Texturen landen in <cache>/icons)
 * FFMPEG schneidet jede Textur auf 16x16 (erstes Frame bei Animationsstreifen). Ohne FFMPEG werden Texturen
 * unveraendert uebernommen, wenn sie bereits 16x16 sind (PNG-Header-Pruefung).
 *
 * Ergebnis:
 *   assets/mc/answers.json  { names: [kanonische deutsche Namen], aliases: { "kleinschreibung": "Kanonischer Name" } }
 *   assets/mc/icons.json    { "Kanonischer Name": "item/ender_pearl.png" | "block/..." }
 *   docs/team/ICONS-REPORT.md
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CACHE = process.env.MC_CACHE || path.join(ROOT, '..', 'mineguess-cache');
const FFMPEG = process.env.FFMPEG || '';
const DRY = process.argv.includes('--dry');
const MIRROR = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.11/';
const MC = path.join(ROOT, 'assets', 'mc');
const ICON_CACHE = path.join(CACHE, 'icons');

const DOWNLOADED = new Set();
const norm = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
const J = f => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));

function get(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { 'User-Agent': 'mineguess-icons' } }, res => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve(Buffer.concat(c)));
    }).on('error', () => resolve(null));
  });
}
function pngSize(buf) { return buf && buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null; }

// Textur holen (lokal vorhanden, Cache, sonst Mirror); Rueckgabe Pfad relativ zu assets/mc oder null
async function ensureTexture(rel) {
  const local = path.join(MC, rel);
  if (fs.existsSync(local)) return rel;
  const [folder, file] = rel.split('/');
  const cacheFile = path.join(ICON_CACHE, folder + '__' + file);
  const miss = cacheFile + '.404';
  if (fs.existsSync(miss)) return null;
  let buf = fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile) : null;
  if (!buf) {
    buf = await get(MIRROR + (folder === 'item' ? 'items/' : 'blocks/') + file);
    fs.mkdirSync(ICON_CACHE, { recursive: true });
    if (!buf) { fs.writeFileSync(miss, ''); return null; }
    fs.writeFileSync(cacheFile, buf);
  }
  const size = pngSize(buf);
  if (!size) return null;
  fs.mkdirSync(path.dirname(local), { recursive: true });
  DOWNLOADED.add(rel);
  if (size[0] === 16 && size[1] === 16) {
    if (!DRY) fs.writeFileSync(local, buf);
  } else if (FFMPEG) {
    if (!DRY) {
      const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', cacheFile, '-vf', 'crop=16:16:0:0', '-frames:v', '1', local], { encoding: 'utf8' });
      if (r.status !== 0 || !fs.existsSync(local)) return null;
    }
  } else return null;
  return rel;
}

async function main() {
  const q = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions.json'), 'utf8'));
  const de = J('de_de.json'), en = J('en_us.json');

  // Index: normalisierter Name -> {kind,id}; Prioritaet Item > Block > Entity
  const idx = new Map();
  const put = (name, kind, id, prio) => { const k = norm(name); const old = idx.get(k); if (!old || prio < old.prio) idx.set(k, { kind, id, prio }); };
  const kinds = [['item.minecraft.', 'item', 1], ['block.minecraft.', 'block', 2], ['entity.minecraft.', 'entity', 3]];
  for (const lang of [de, en]) for (const [key, val] of Object.entries(lang)) {
    for (const [pre, kind, prio] of kinds) if (key.startsWith(pre) && !key.slice(pre.length).includes('.')) put(val, kind, key.slice(pre.length), prio);
  }
  const deById = {};
  for (const [pre, kind] of kinds) for (const [k, v] of Object.entries(de)) if (k.startsWith(pre) && !k.slice(pre.length).includes('.')) deById[kind + ':' + k.slice(pre.length)] = v;

  // Namen und Aliase aus den Fragen sammeln. canonOf: Antwort -> kanonischer deutscher Anzeigename
  const names = new Map();      // canonical -> { cat }
  const aliases = {};           // lower -> canonical
  const canonOf = new Map();    // Antwortname -> canonical
  // Offizielle deutsche Namen statt alter/falscher Bezeichnungen
  const OFFICIAL = { antikesgestein: 'Antiker Schrott', lectern: 'Lesepult' };
  const bad = a => / oder |\/|^\s*$/.test(a) || a.length > 40;
  q.filter(x => x.type === 'entity').forEach(x => {
    const canon = String(x.answer);
    if (!names.has(canon)) names.set(canon, { cat: x.category });
  });
  // 1) gleiche Normalform nur einmal ("Ghastträne"/"Ghasttraene")
  const seen = new Map();
  for (const n of [...names.keys()]) {
    const k = norm(n);
    if (seen.has(k)) { canonOf.set(n, seen.get(k)); names.delete(n); } else { seen.set(k, n); canonOf.set(n, n); }
  }
  // 2) offizielle deutsche Namen (Override) und englische Namen auf den deutschen Registry-Namen abbilden (auch wenn er schon existiert: zusammenfuehren)
  const deValues = new Set(Object.values(de).map(norm));
  const rename = (from, to) => {
    if (norm(from) === norm(to)) return;
    const meta = names.get(from);
    names.delete(from);
    if (!names.has(to)) names.set(to, meta);
    for (const [k, v] of canonOf) if (v === from) canonOf.set(k, to);
    aliases[from.toLowerCase()] = to;
  };
  for (const n of [...names.keys()]) {
    const ov = OFFICIAL[norm(n)];
    if (ov) { rename(n, ov); continue; }
    if (deValues.has(norm(n))) continue;
    const hit0 = idx.get(norm(n));
    if (!hit0) continue;
    const deName = deById[hit0.kind + ':' + hit0.id];
    if (deName && norm(deName) !== norm(n)) rename(n, deName);
  }
  // 3) Aliase aus den acceptedAnswers: jeder Alias zeigt auf den kanonischen Namen SEINER Frage
  const canonical = a => canonOf.get(String(a)) || canonOf.get([...canonOf.keys()].find(k => norm(k) === norm(a)) || '') || String(a);
  q.filter(x => x.type === 'entity').forEach(x => {
    const c = canonical(x.answer);
    (x.acceptedAnswers || []).forEach(a => {
      if (!a || bad(a) || norm(a) === norm(c)) return;
      const k = String(a).toLowerCase();
      if (!aliases[k] && !names.has(a)) aliases[k] = c;
    });
  });
  // Aliase, die selbst kanonische Namen sind oder auf nicht existierende zeigen, bereinigen
  Object.keys(aliases).forEach(a => { if (!names.has(aliases[a]) || norm(a) === norm(aliases[a]) || bad(a)) delete aliases[a]; });
  // 4) Einheitliche Annahme: jede Frage akzeptiert ihren kanonischen Namen und alle Aliase desselben Objekts (Solo = Multiplayer)
  let accepted = 0;
  if (!DRY) {
    q.filter(x => x.type === 'entity').forEach(x => {
      const c = canonical(x.answer);
      const have = new Set((x.acceptedAnswers || []).map(norm));
      const add = [c, ...Object.keys(aliases).filter(a => aliases[a] === c)].filter(a => !have.has(norm(a)));
      if (add.length) { x.acceptedAnswers = [...(x.acceptedAnswers || [x.answer]), ...add]; accepted += add.length; }
    });
    fs.writeFileSync(path.join(ROOT, 'questions.json'), JSON.stringify(q, null, 2));
  }

  // Stellvertreter fuer Namen ohne Registry-Eintrag
  const PROXY = {
    spitzhacke: 'item/iron_pickaxe.png', axt: 'item/iron_axe.png', schaufel: 'item/iron_shovel.png', hacke: 'item/iron_hoe.png', schere: 'item/shears.png',
    nether: 'block/netherrack.png', ende: 'block/end_stone.png', oberwelt: 'block/grass_block_side.png',
    festung: 'block/stone_bricks.png', endfestung: 'block/stone_bricks.png', ozeanmonument: 'block/prismarine_bricks.png', 'ozean-monument': 'block/prismarine_bricks.png',
    dorf: 'item/bell.png', wither: 'item/nether_star.png', enderdrache: 'block/dragon_egg.png', truhe: 'block/barrel_side.png', endertruhe: 'block/obsidian.png',
    bett: 'block/white_wool.png', eisengolem: 'block/iron_block.png', schneegolem: 'block/snow_block.png', wollblock: 'block/white_wool.png',
    verbrennung: 'item/blaze_powder.png', haltbarkeit: 'item/anvil.png', blitz: 'item/lightning_rod.png', laub: 'block/oak_leaves.png', feuersteinundstahl: 'item/flint_and_steel.png', amethystgeode: 'block/amethyst_block.png', antikesgestein: 'block/ancient_debris_side.png',
    armbrust: 'item/crossbow_standby.png', fermentiertesspinneauge: 'item/fermented_spider_eye.png', froschlicht: 'block/ochre_froglight_side.png',
    geselle: 'item/emerald.png', magmablock: 'block/magma.png', markierungderhimmelsrichtungen: 'item/compass_00.png', minecon2012: 'item/firework_rocket.png',
    schild: 'item/iron_helmet.png', redstone: 'item/redstone.png', roheskupfer: 'item/raw_copper.png', schiesspulver: 'item/gunpowder.png', verzauberterGoldenerapfel: 'item/golden_apple.png',
    verzaubertergoldenerapfel: 'item/golden_apple.png', nuetzlich: 'item/emerald.png', schaedlich: 'item/spider_eye.png', positiv: 'item/emerald.png', negativ: 'item/spider_eye.png',
  };
  const CAT_PROXY = { Biome: 'block/grass_block_side.png', Strukturen: 'block/stone_bricks.png', Weltgenerierung: 'block/grass_block_top.png',
    'Geschichte & Updates': 'item/book.png', Dimensionen: 'block/obsidian.png', Dorfbewohner: 'item/emerald.png', Redstone: 'item/redstone.png',
    Crafting: 'block/crafting_table_front.png', Mobs: 'item/name_tag.png', Spielmechanik: 'item/name_tag.png', 'Hardcore-Wissen': 'item/name_tag.png', Verzauberungen: 'item/enchanted_book.png' };

  const icons = {}, how = {};
  const sortedNames = [...names.keys()].sort((a, b) => a.localeCompare(b, 'de'));
  for (const name of sortedNames) {
    const key = norm(name);
    let rel = null, mode = 'fallback';
    const hit = idx.get(key) || idx.get(norm((name.match(/\(([^)]+)\)/) || [])[1] || '')) ;
    if (hit) {
      const id = hit.id;
      const cands = hit.kind === 'item' ? [`item/${id}.png`, `block/${id}.png`, `block/${id}_side.png`, `block/${id}_front.png`, `block/${id}_top.png`]
        : hit.kind === 'block' ? [`block/${id}.png`, `block/${id}_side.png`, `block/${id}_front.png`, `block/${id}_top.png`, `block/${id}_still.png`, `item/${id}.png`]
        : [`item/${id}_spawn_egg.png`, `item/${id}.png`];
      for (const c of cands) { rel = await ensureTexture(c); if (rel) { mode = 'echt'; break; } }
    }
    if (!rel && PROXY[key]) { rel = await ensureTexture(PROXY[key]); if (rel) mode = 'stellvertreter'; }
    if (!rel && /\+|^\d/.test(name)) { rel = 'block/crafting_table_front.png'; mode = 'stellvertreter'; }
    if (!rel) { const cp = CAT_PROXY[names.get(name).cat]; if (cp && cp !== 'item/barrier.png') { rel = await ensureTexture(cp); if (rel) mode = 'stellvertreter'; } }
    if (!rel) { rel = 'item/barrier.png'; mode = 'fallback'; }
    icons[name] = rel; how[name] = mode;
  }

  const out = { names: sortedNames, aliases };
  if (!DRY) {
    // Liste der per Skript geladenen Texturen: tools/gen-sw-assets.js cached sie nicht vor (nur on demand)
    const odPath = path.join(MC, 'ondemand.json');
    let od = []; try { od = JSON.parse(fs.readFileSync(odPath, 'utf8')); } catch (e) {}
    fs.writeFileSync(odPath, JSON.stringify([...new Set([...od, ...DOWNLOADED])].sort()));
    fs.writeFileSync(path.join(MC, 'icons.json'), JSON.stringify(icons, null, 1));
    fs.writeFileSync(path.join(MC, 'answers.json'), JSON.stringify(out));
  }
  const cnt = { echt: 0, stellvertreter: 0, fallback: 0 };
  Object.values(how).forEach(m => cnt[m]++);
  const fall = Object.keys(how).filter(n => how[n] === 'fallback');
  const proxy = Object.keys(how).filter(n => how[n] === 'stellvertreter');
  // Gesamtgroesse der verwendeten neuen Dateien
  const used = [...new Set(Object.values(icons))];
  let bytes = 0; used.forEach(r => { const p = path.join(MC, r); if (fs.existsSync(p)) bytes += fs.statSync(p).size; });
  const md = `# ICONS-REPORT

Erzeugt von \`tools/fetch-icons.js\`.

- Antwortoptionen (kanonische deutsche Namen): **${sortedNames.length}**, Aliase (englisch/Varianten, nur zum Suchen): ${Object.keys(aliases).length}
- Icon echt (Registry-Textur): **${cnt.echt}**, Stellvertreter: **${cnt.stellvertreter}**, neutrales Fallback (\`item/barrier.png\`): **${cnt.fallback}**
- Verwendete Textur-Dateien: ${used.length}, Gesamtgröße ca. ${Math.round(bytes / 1024)} KB (inkl. bereits vorhandener)
- Quelle fehlender Texturen: PrismarineJS/minecraft-assets 1.21.11 (16x16, erstes Frame)

## Stellvertreter
${proxy.map(n => `- ${n} -> ${icons[n]}`).join('\n') || '-'}

## Ohne Icon (Fallback barrier)
${fall.map(n => `- ${n}`).join('\n') || '-'}
`;
  if (!DRY) fs.writeFileSync(path.join(ROOT, 'docs', 'team', 'ICONS-REPORT.md'), md);
  console.log(JSON.stringify({ options: sortedNames.length, aliases: Object.keys(aliases).length, ...cnt, files: used.length, kb: Math.round(bytes / 1024) }));
}
main().catch(e => { console.error(e); process.exit(1); });
