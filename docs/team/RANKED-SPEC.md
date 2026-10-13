# RANKED-SPEC (forscher, Runde 4)

Kurzfassung für backend/frontend. Parameter sind Startwerte und per Konstanten justierbar.

## 1. Modellwahl
| Variante | Inhalt | Passt hier? |
|---|---|---|
| Elo pro Frage ("Spieler vs. Frage") | Frage hat Rating, Spieler hat MMR, p = 1/(1+10^((Rf−Rs)/400)) | **Ja**, einfach, deterministisch, wenige Daten nötig |
| Glicko / Glicko-2 | zusätzlich Unsicherheit (RD) und Volatilität | Genauer bei Pausen, aber mehr Zustand und Erklärungsaufwand; erst nötig, wenn Spielerzahlen groß sind |
| TrueSkill / Bradley-Terry | Mehrspieler-Ranking | Nur für Multiplayer-Raum-Ranglisten, nicht für Solo |
| Punkte-Summe (aktuell) | Summe | belohnt nur Spielmenge, kein Skill |

Empfehlung: **Elo pro Frage** (wie vom Lead beschlossen), optional später Glicko-RD nur für Spieler (K variabel, siehe §3).

## 2. Formeln
- Erwartung: `p = 1 / (1 + 10^((R_frage − MMR) / 400))`.
- Ergebnis `S` = 1 (richtig) oder 0 (falsch); optional S = 0,5 für "knapp daneben" bei Zahlenfragen (innerhalb 2x Toleranz).
- Änderung Spieler: `ΔMMR = round(K · (S − p))`. Frage-Rating wird **nicht** live verändert (Fragen fest kalibriert, nur Offline-Update, siehe §4), damit Manipulation und Rauschen klein bleiben.
- Grenzen: `MMR ≥ 0`, Rundung ganze Zahlen, Anzeige "+37"/"−12".
- Speed-Bonus (optional, klein): `ΔMMR += round(0.2 · K · speed)` nur bei richtig, `speed ∈ [0,1]` = Restzeit/Gesamtzeit. Streak-Bonus: +1 je 5 richtige in Folge, max +5 pro Frage.

## 3. K-Faktor
| Phase | K |
|---|---|
| Neu (erste 30 Fragen) | 40 (schnell einsortieren) |
| Normal | 28 |
| ab Diamond | 20 |
| ab Netherite | 16 (Stabilität) |
Beispiel: MMR 1500, Frage 2800 (schwer): p = 1/(1+10^(1300/400)) ≈ 0,0006, richtig = +K ≈ +28; Frage 700 (leicht), richtig: p ≈ 0,99 → +0,3, falsch → −27.

## 4. Schwierigkeitskalibrierung
Startwerte per Heuristik (backend): Tier 1 ≈ 700, Tier 2 ≈ 1700, Tier 3 ≈ 2800, Tier 4 ≈ 3800. Heuristik-Merkmale: Typ (entity leichter als number), Größenordnung/Seltenheit der Zahl, Toleranz (0 = schwerer), Kategorie, Antwortlänge, ob Allgemeinwissen. **Datenbasierte Nachkalibrierung (offline, Skript):** pro Frage richtig/gesamt zählen, ab 200 Antworten aus der Trefferquote q (bei Durchschnittsspielern MMR 1700) das Rating setzen: `R = 1700 − 400·log10(q/(1−q))`, begrenzt auf 300–4200, Zwischenschritt mit Glättung (0,5 alt + 0,5 neu).
Duplikate/zu schwere Fragen (q < 5 %, etwa Haltbarkeitswerte) zur Prüfung markieren.

## 5. Fragenauswahl
Zielschwierigkeit je Frage = MMR + Zufall: Normal 55 % bei MMR ± 400, 25 % leichter (−800…−400), 20 % schwerer (+400…+1000). Wiederholungssperre: dieselbe Frage nicht innerhalb von 50 Fragen. Mindestens 1 Frage pro 5 aus unterschiedlicher Kategorie.

## 6. Anti-Frust
- **Abstiegsschutz:** Rangverlust erst, wenn MMR 50 Punkte unter der Rangschwelle (Puffer), Rang wird beim Aufstieg sofort vergeben. Demote-Schild nach Aufstieg: 5 Fragen ohne Abstieg.
- **Tageslimit-Verlust:** pro Session maximal −150 MMR (danach nur noch Gewinne zählen), damit ein schlechter Abend nicht alles löscht.
- **Rating-Einbruch durch Unlust:** wenn 5 Fragen in Folge leer/abgelaufen, Session pausieren statt Strafe stapeln.
- Keine Strafe für leere Eingabe (entspricht A1); Timeout zählt als falsch, aber höchstens −K/2.
- Leichte Fragen bei starkem Lauf nicht überproportional belohnen (Gewinnkappe +K pro Frage).
- Klarheit: Anzeige "+37 (Schwer)" mit Fragestufe, Fortschrittsbalken zum nächsten Rang, Prozent bis Rang, nie Zahlen ohne Erklärung.
- Gäste: lokales Ranking, klar beschriftet "nur auf diesem Gerät"; Manipulation im Client möglich (Grenze dokumentieren).

## 7. Offene Parameter für den Auftraggeber
Startwert 500 vs. 1000, Rangschwellen, Strafe bei Timeout, Streak-Bonus ja/nein.
