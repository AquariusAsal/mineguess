// Erzeugt assets/mc/block-list.json (Namen aller vorhandenen Block-Texturen), damit mg-iso.js keine nicht vorhandenen Texturen anfragt. Aufruf: node tools/gen-iso-list.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'assets', 'mc', 'block');
const names = fs.readdirSync(dir).filter(f => /\.png$/i.test(f)).map(f => f.replace(/\.png$/i, '')).sort();
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'mc', 'block-list.json'), JSON.stringify(names) + '\n');
console.log('block-list.json:', names.length, 'Texturen');
