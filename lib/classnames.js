// Feste Namensliste fuer Klassenraeume (Tiere und Bloecke aus Minecraft): kein Freitext, keine Klarnamen.
// Alle Namen sind hoechstens 16 Zeichen lang und eindeutig.
const NAMES = [
  'Creeper', 'Schwein', 'Kuh', 'Schaf', 'Huhn', 'Wolf', 'Katze', 'Papagei', 'Panda', 'Fuchs', 'Biene', 'Axolotl', 'Frosch', 'Lama', 'Pferd',
  'Esel', 'Delfin', 'Schildkröte', 'Kaninchen', 'Ozelot', 'Eisbär', 'Pilzkuh', 'Kamel', 'Schnüffler', 'Glühwürmchen', 'Eisengolem', 'Schneegolem',
  'Tintenfisch', 'Kabeljau', 'Lachs',
  'Smaragd', 'Diamant', 'Gold', 'Eisen', 'Kohle', 'Redstone', 'Lapis', 'Obsidian', 'Bambus', 'Kürbis', 'Melone', 'Kaktus', 'Eiche', 'Birke',
  'Fichte', 'Sand', 'Kies', 'Lehm', 'Schnee', 'Eis', 'Honig', 'Kupfer', 'Amethyst', 'Magma', 'Pilz', 'Beere', 'Kirsche', 'Mangrove', 'Karotte', 'Kartoffel',
];
module.exports = { NAMES: NAMES.filter((n, i) => NAMES.indexOf(n) === i && n.length <= 16) };
