/** Schreibt challenge-pool.json (Schnappschuss der Auswahl-Merkmale je Frage-ID je Pool-Version).
 *  Nur ausfuehren, wenn eine NEUE Pool-Version in challenge.js hinzugefuegt wurde: bestehende Versionen bleiben unveraendert, damit alte Links stabil sind. */
const fs = require('fs');
const path = require('path');
const C = require('../challenge.js');
const root = path.join(__dirname, '..');
const qs = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));
const f = path.join(root, 'challenge-pool.json');
let old = {}; try { old = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
const fresh = C.buildSnapshot(qs);
const versions = Object.assign({}, fresh.versions, old.versions || {});   // vorhandene Versionen nie ueberschreiben
fs.writeFileSync(f, JSON.stringify({ v: 1, versions }));
console.log('challenge-pool.json: Versionen', Object.keys(versions).join(','), '(' + Object.values(versions).map(m => Object.keys(m).length).join('/') + ' Fragen)');
