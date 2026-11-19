const test = require('node:test');
const assert = require('node:assert');
const store = require('../lib/store.js');
const { startServer, post } = require('./helpers.js');

// kleine Fake-Sammlung mit der Firestore-Schnittstelle (doc().get/set/delete)
function fakeCollection() {
  const m = new Map();
  return {
    m,
    doc(id) {
      return {
        async get() { return { exists: m.has(id), data: () => m.get(id) }; },
        async set(v) { m.set(id, JSON.parse(JSON.stringify(v))); },
        async delete() { m.delete(id); },
      };
    },
  };
}

test('Firestore-Adapter: grosse Dokumente werden geteilt und fehlerfrei gelesen', async () => {
  const col = fakeCollection(), be = store.firestoreBackendFor(col);
  const big = { profiles: Object.fromEntries(Array.from({ length: 6000 }, (_, i) => ['p' + i, { name: 'spieler' + i, pad: 'x'.repeat(300) }])) };
  const size = JSON.stringify(big).length;
  assert.ok(size > 1500000, 'Testdaten sollen > 1 Chunk sein');
  await be.save('profiles', big);
  const meta = col.m.get('profiles');
  assert.strictEqual(meta.chunks, Math.ceil(size / store.FS_CHUNK));
  [...col.m.entries()].filter(([k]) => /__\d+$/.test(k)).forEach(([k, v]) => assert.ok(v.json.length <= store.FS_CHUNK, k));
  assert.deepStrictEqual(await be.load('profiles'), big);
  // Schrumpfen entfernt ueberzaehlige Teile
  await be.save('profiles', { a: 1 });
  assert.strictEqual(col.m.get('profiles').chunks, 1);
  assert.deepStrictEqual([...col.m.keys()].sort(), ['profiles', 'profiles__0']);
  assert.deepStrictEqual(await be.load('profiles'), { a: 1 });
  assert.strictEqual(await be.load('gibtsnicht'), undefined);
  // Altformat {json} wird weiter gelesen
  col.m.set('alt', { json: JSON.stringify({ x: 2 }), updatedAt: 1 });
  assert.deepStrictEqual(await be.load('alt'), { x: 2 });
});

test('Store: waehlt Firestore bei FIREBASE_SERVICE_ACCOUNT (Fake-Sammlung), schreibt verzoegert, ueberlebt Neustart', async () => {
  const col = fakeCollection();
  process.env.FIREBASE_SERVICE_ACCOUNT = '{"x":1}';
  store.setFirestoreFactory(() => col);
  try {
    assert.strictEqual(await store.init(['profiles', 'reports'], { profiles: {}, reports: [] }), 'firestore');
    assert.strictEqual(store.info().backend, 'firestore');
    store.set('profiles', { p1: { name: 'abc' } });
    await store.flush();
    assert.ok(col.m.has('profiles') && col.m.has('profiles__0'));
    // "Neustart": neuer Init liest den gespeicherten Stand
    assert.strictEqual(await store.init(['profiles', 'reports'], { profiles: {}, reports: [] }), 'firestore');
    assert.deepStrictEqual(store.get('profiles'), { p1: { name: 'abc' } });
  } finally { store.setFirestoreFactory(null); delete process.env.FIREBASE_SERVICE_ACCOUNT; }
});

test('Store: ohne ENV bleibt Datei-Speicher Standard; defektes FIREBASE_SERVICE_ACCOUNT faellt auf Datei zurueck, Server und Profile laufen weiter', async () => {
  const S = await startServer();
  try { assert.strictEqual((await (await fetch(S.url + '/health')).json()).persist, 'file'); } finally { S.stop(); }
  const S2 = await startServer({ FIREBASE_SERVICE_ACCOUNT: 'das ist kein json' });
  try {
    const h = await (await fetch(S2.url + '/health')).json();
    assert.strictEqual(h.persist, 'file'); assert.strictEqual(h.persistError, true);
    const st = await post(S2.url + '/api/ranked/start', { gid: 'fallback_' + Date.now() + 'abcdef', name: 'T' });
    const pr = await post(S2.url + '/api/profile/create', { token: st.body.token, name: 'fallback_user', age14: true });
    assert.strictEqual(pr.status, 200);
  } finally { S2.stop(); }
});
