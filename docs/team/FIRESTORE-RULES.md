# Firestore-Regeln für MineGuess (Projekt `mineguessv1`)

## Befund Leaderboard (Runde 3, A3)
1. **Button hinter dem Overlay (Client-Bug, behoben):** `#lb-modal` hatte `z-index: 200`, `#comp-end` ebenfalls 200 (später im DOM) und `#blitz-end`/`#daily-end` 300. Das Leaderboard öffnete sich *hinter* dem Wettkampf-/Blitz-/Daily-Ende, der Button wirkte tot. Jetzt `z-index: 400`.
2. **Fehler wurden verschluckt:** Schreibfehler (`submitLeaderboard`) nur `console.warn`, Lesefehler nur "Fehler beim Laden". Jetzt Toast/Hinweis mit Ursache (keine Berechtigung / keine Verbindung / Index fehlt).
3. **Reports nie gesendet:** `window.fbDb` existiert nicht (`let fbDb`), deshalb wurde `reports` nie geschrieben. Behoben (`fbDb`).
4. **Gast/Fehler:** Lokale Bestenliste (`localStorage`, "Nur auf diesem Gerät gespeichert") wird bei Gästen und bei Firestore-Fehlern angezeigt; Einträge entstehen bei Wettkampf, Blitz und Daily.
5. **Mögliche Ursache auf der Konsole des Auftraggebers (nicht prüfbar):** Firestore im "Production mode" ohne Regeln = alles verboten (oder Testmodus abgelaufen) -> `permission-denied`. Regeln unten einspielen: Firebase Console -> Firestore Database -> Regeln -> Veröffentlichen.
- Die Abfrage `orderBy('score','desc').limit(100)` braucht **keinen** Composite-Index (nur ein Feld).

## Empfohlene Regeln
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Eigene Nutzerdaten. `premium` darf der Client NICHT setzen/ändern
    // (nur Konsole/Admin oder Cloud Function nach Zahlung).
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create: if request.auth != null && request.auth.uid == uid
        && !('premium' in request.resource.data);
      allow update: if request.auth != null && request.auth.uid == uid
        && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['premium']);
      allow delete: if false;
    }

    // Bestenliste: lesen für alle, schreiben nur der eigene Eintrag mit plausiblen Werten.
    match /leaderboard/{uid} {
      allow read: if true;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.uid == uid
        && request.resource.data.displayName is string
        && request.resource.data.displayName.size() <= 40
        && request.resource.data.score is int
        && request.resource.data.score >= 0 && request.resource.data.score <= 60000
        && request.resource.data.correct is int && request.resource.data.correct >= 0 && request.resource.data.correct <= 10
        && request.resource.data.total is int && request.resource.data.total >= 0 && request.resource.data.total <= 10;
      allow delete: if false;
    }

    // Fragen-Meldungen (auch von Gästen): nur anlegen, nichts lesen.
    match /reports/{id} {
      allow create: if request.resource.data.keys().hasOnly(['questionId','question','reason','uid','ts'])
        && request.resource.data.question is string && request.resource.data.question.size() <= 300
        && request.resource.data.reason is string && request.resource.data.reason.size() <= 100;
      allow read, update, delete: if false;
    }
  }
}
```

Hinweise:
- Das Leaderboard bleibt clientseitig manipulierbar (jeder angemeldete Nutzer kann seinen Score bis zum Limit schreiben). Echter Schutz bräuchte eine Cloud Function; die Limits begrenzen nur den Schaden.
- `premium` ist ohne serverseitige Prüfung weiterhin clientseitig umgehbar (`?premium=1` im Multiplayer). Die Regel oben verhindert wenigstens, dass Nutzer das Feld in ihrem Dokument selbst setzen.
- Ein Feld `character` im Nutzerdokument ist durch die Regeln erlaubt.
- `questionId` in reports kann eine Zahl oder ein String sein; die Regel prüft nur die Feldliste. Bei Problemen `questionId` aus `hasOnly` nicht ändern, aber Typprüfung weglassen.


## Runde 4: Ranked-Collection (zusätzlich/ersatzweise zu `leaderboard`)
Das Spiel schreibt/liest jetzt `ranked/{uid}` (nicht mehr `leaderboard`). Ohne diese Regel zeigt die Rangliste "keine Berechtigung" und nutzt den lokalen Rang. Block in die Regeln einfügen (die `leaderboard`-Regel kann entfallen):

```
    match /ranked/{uid} {
      allow read: if true;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.uid == uid
        && request.resource.data.displayName is string
        && request.resource.data.displayName.size() <= 40
        && request.resource.data.mmr is int
        && request.resource.data.mmr >= 0 && request.resource.data.mmr <= 20000
        && request.resource.data.peak is int && request.resource.data.peak >= request.resource.data.mmr
        && request.resource.data.answered is int && request.resource.data.answered >= 0
        && request.resource.data.correct is int && request.resource.data.correct <= request.resource.data.answered
        && request.resource.data.games is int && request.resource.data.games >= 0;
      allow delete: if false;
    }
```
Bekannte Grenzen (nicht lösbar ohne Server-Konto/Cloud Function):
- Der Client berechnet MMR selbst und schreibt es; jeder angemeldete Nutzer kann sich per Konsole/API einen beliebigen MMR bis 20000 setzen. Die Regeln begrenzen nur Wertebereich und Konsistenz (`correct <= answered`, `peak >= mmr`).
- Optionaler Schutz: Regel `request.resource.data.mmr <= resource.data.mmr + 600` (max. Anstieg pro Schreibvorgang), dann ist ein Sprung auf 20000 nicht in einem Schritt möglich. Echte Absicherung nur über Cloud Function, die Antworten gegen die Fragen prüft.
- Lokaler Rang (Gäste) ist per `localStorage` frei änderbar und nur auf diesem Gerät sichtbar.

## Runde 6: neue Felder in ranked/{uid}
Zusätzlich: `tier` (String-Rang-Id), `division` (1-3), `lastPlayedDay` (YYYY-MM-DD), `mmrToday` (int). Die Regel oben verbietet sie nicht; optional härten: `request.resource.data.division in [1,2,3]`, `request.resource.data.lastPlayedDay is string`, `request.resource.data.mmrToday is int`. Das Leaderboard-Query `orderBy(mmr)` braucht keinen Composite-Index; "Heute" wird clientseitig gefiltert.

## Premium abgeschafft
Das Feld `premium` im Nutzerdokument wird nicht mehr verwendet. Die Regel `!(premium in ...)` kann bleiben (schadet nicht) oder entfallen; `users/{uid}` braucht nur noch streak/best/played/displayName/photoURL/updatedAt (und optional `character`). Das Thema "Premium clientseitig umgehbar" ist damit erledigt.
