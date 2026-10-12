# Agent Teams – Meister-Referenz

> Quelle: <https://code.claude.com/docs/en/agent-teams> (Stand: 2026-10-12).
> Zweck: Nachschlagewerk für Claude und das Team, um Agent Teams in diesem Projekt gezielt und effizient einzusetzen.
> Agent Teams sind **experimentell**. Bei Unklarheiten zuerst die Originalseite prüfen.

---

## 1. Kurzfassung (TL;DR)

- **Was:** Mehrere Claude-Code-Instanzen arbeiten als Team. Eine Session ist der **Lead**, die anderen sind **Teammates** mit eigenem Kontextfenster. Sie schreiben sich direkt Nachrichten und teilen eine **Task-Liste**.
- **Aktivieren:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. In diesem Projekt steht das bereits in [`.claude/settings.local.json`](../.claude/settings.local.json).
- **Wann:** Paralleles Recherchieren oder Reviewen, unabhängige Module, Debugging mit konkurrierenden Hypothesen, Änderungen über mehrere Schichten.
- **Wann nicht:** Sequenzielle Arbeit, Änderungen an derselben Datei, viele Abhängigkeiten, Routineaufgaben. Dafür sind eine einzelne Session oder Subagents besser.
- **Kosten:** Der Tokenverbrauch wächst **linear mit der Zahl der Teammates**.
- **Faustregel:** 3–5 Teammates mit je 5–6 Tasks. Jeder Teammate bekommt eigene Dateien.

---

## 2. Entscheidungshilfe: Team, Subagent oder Single Session?

| Frage | → Empfehlung |
|---|---|
| Ist nur das Ergebnis wichtig und kein Austausch nötig? | **Subagent** |
| Müssen sich Worker gegenseitig widerlegen, Ergebnisse teilen und sich selbst koordinieren? | **Agent Team** |
| Ist die Aufgabe sequenziell oder betrifft sie nur eine Datei? | **Single Session** |
| Sollen Ergebnisse zwischen Sessions fließen, die ich selbst gestartet habe? | **Cross-Session-Messaging** |
| Sollen parallele Sessions ohne automatische Koordination laufen? | **Git Worktrees** |

| | Subagents | Agent Teams |
|---|---|---|
| Kontext | Eigenes Fenster, Ergebnis geht an den Aufrufer zurück | Eigenes Fenster, vollständig unabhängig |
| Kommunikation | Ergebnis an den Aufrufer (benannte Subagents können sich auch Nachrichten schicken) | Teammates schreiben sich direkt |
| Koordination | Der Haupt-Agent steuert alles | Selbstkoordination über Nachrichten und die geteilte Task-Liste |
| Tokenkosten | Niedriger | Höher, weil jeder Teammate eine eigene Instanz ist |

---

## 3. Setup

### Aktivieren
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```
- Das funktioniert in jeder `settings.json` (User, Projekt, lokal) oder als Shell-Variable.
- **Nebenwirkung:** Benennt Claude einen Subagent selbst (Agent-Tool mit `name`), startet er als **Teammate**. So können Teams entstehen, ohne dass jemand eines angefordert hat. Ausnahmen sind Forks und Aufrufe mit `isolation`.
- **Funktioniert nur interaktiv.** Mit `-p` (Headless) und im Agent SDK werden keine Teammates gespawnt. Benannte Subagents laufen dann als normale Subagents.

### Wieder deaktivieren
Setze `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "0"`. Das wirkt sofort, ohne neue Session.
Achtung bei der Priorität: Projekt-, lokale, `--settings`- und Managed-Settings überschreiben User-Settings.

### Display-Modus (`teammateMode` in `~/.claude/settings.json` oder `claude --teammate-mode <mode>`)
| Wert | Verhalten |
|---|---|
| `"in-process"` (Default) | Alle Teammates laufen im Hauptterminal. Funktioniert überall. |
| `"auto"` | Split-Panes, wenn tmux läuft oder iTerm2 mit `it2` vorhanden ist, sonst in-process |
| `"tmux"` | Split-Panes. Erkennt tmux oder iTerm2 automatisch. |
| `"iterm2"` | Native iTerm2-Panes. Braucht die `it2`-CLI und eine aktivierte Python-API. |

> **Für dieses Projekt (Windows 11 + VS Code):** Split-Pane-Modus wird im VS-Code-Terminal und im Windows Terminal **nicht unterstützt**. Hier gilt immer **in-process**.

---

## 4. Bedienung (in-process)

| Taste | Aktion |
|---|---|
| ↑ / ↓ | Teammate im Agent-Panel unter dem Prompt auswählen |
| Enter | Transkript öffnen und dem Teammate direkt schreiben |
| Esc | Auswahl aufheben. In der Transkript-Ansicht unterbricht Esc den aktuellen Turn. |
| `x` | Ausgewählten Teammate stoppen |
| Ctrl+T | Task-Liste ein- oder ausblenden |

- Idle-Zeilen verschwinden nach 30 s, wenn **alle** idle sind. Der Teammate läuft weiter und ist per Name ansprechbar.
- Bei mehr als 3 idle Teammates werden die übrigen zu einer Zeile `N idle agents` zusammengefasst. Enter klappt sie auf.
- In der Teammate-Ansicht gehen Text und Skills an den **Teammate**. Built-in-Commands gehen an den **Lead**.
  - `/compact`, `/clear` und `/rewind` wirken auf den Lead und fragen vorher nach.
  - `/model` und `/fast` sind dort gesperrt. Modell und Fast-Mode eines Teammates werden beim Spawn festgelegt.

---

## 5. Architektur

| Komponente | Rolle |
|---|---|
| **Team Lead** | Haupt-Session. Spawnt Teammates, verteilt Tasks und fasst die Ergebnisse zusammen. Der Lead bleibt die ganze Session über derselbe. |
| **Teammates** | Eigenständige Claude-Code-Instanzen |
| **Task-Liste** | Geteilte Work Items mit den Zuständen pending, in progress und completed sowie Abhängigkeiten |
| **Mailbox** | Nachrichtensystem zwischen den Agents |

**Dateien (lokal, Team-Name = `session-` + die ersten 8 Zeichen der Session-ID):**
- Team-Config: `~/.claude/teams/{team}/config.json` enthält Runtime-State und das Array `members` (Name, Agent-ID, Agent-Typ; der Lead hat den Typ `team-lead`). **Nicht von Hand bearbeiten**, die Datei wird überschrieben. Sie wird am Session-Ende gelöscht.
- Mailbox: `~/.claude/teams/{team}/inboxes/{agent}.json`. Ungültige Einträge werden entfernt, die gültigen trotzdem zugestellt.
- Tasks: `~/.claude/tasks/{team}/` bleibt erhalten (für Resume). Die Aufbewahrung regelt `cleanupPeriodDays`.
- Eine Projektdatei wie `.claude/teams/teams.json` wird **nicht** als Konfiguration erkannt. Wiederverwendbare Rollen definierst du als Subagent-Definitionen (siehe §7).

**Tasks:**
- Der Lead weist Tasks zu, oder Teammates nehmen sich selbst den nächsten freien, nicht blockierten Task.
- Beim Claimen verhindert File-Locking Race Conditions.
- Abhängige Tasks werden automatisch freigegeben, sobald ihre Vorgänger erledigt sind.
- Agents ohne Task-Tools koordinieren sich nur über Nachrichten.

**Kommunikation:**
- Nachrichten werden automatisch zugestellt. Der Lead muss nicht pollen.
- Ist ein Teammate fertig, bekommt der Lead automatisch eine Idle-Notification mit der finalen Antwort. Bei einem API-Fehler enthält sie den Fehlertext.
- Nachrichten gehen immer an **einen** Empfänger per Name. Einen Broadcast gibt es nicht: Für alle schickst du eine Nachricht pro Empfänger.
- **Tipp:** Lege die Namen beim Spawnen fest (z. B. "nenne sie `ui`, `logic`, `tests`"), damit du sie später gezielt ansprechen kannst.

**Kontext eines Teammates:**
- Er lädt CLAUDE.md, MCP-Server und Skills wie eine normale Session. Bei `--setting-sources` gelten dieselben Quellen.
- Er bekommt den **Spawn-Prompt** des Leads.
- Er sieht den **Verlauf des Leads nicht**. Alles Nötige muss deshalb im Spawn-Prompt stehen.

---

## 6. Modelle, Effort und Permissions

**Modellwahl pro Teammate (die erste zutreffende Regel gewinnt):**
1. Das Modell, das im Spawn-Prompt genannt wird ("Use Sonnet for each teammate")
2. `model` aus der Subagent-Definition (`inherit` übernimmt das Modell des Leads)
3. `CLAUDE_CODE_SUBAGENT_MODEL`, wenn der Wert nicht `inherit` ist
4. Das aktuelle Modell des Leads

- Mit `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` fallen die Regeln 1 und 2 weg (ab v2.1.257).
- `teammateDefaultModel` gibt es seit v2.1.234 nicht mehr. Nenne das Modell stattdessen im Prompt.
- Die `availableModels`-Allowlist der Organisation kann das Modell ersetzen.
- Den Effort-Level erben Teammates standardmäßig vom Lead.

**Permissions:**
- Teammates übernehmen den Permission-Mode des Leads, **außer** `dontAsk`. Läuft der Lead mit `--dangerously-skip-permissions`, gilt das auch für alle Teammates.
- Einen eigenen Mode pro Teammate kannst du erst nach dem Spawn setzen, nicht schon beim Spawn.
- Permission-Prompts der Teammates erscheinen **im Lead** und müssen dort bestätigt werden.
- **Gegen zu viele Prompts:** Häufige Operationen vor dem Spawnen in den Permission-Settings freigeben.
- Nachrichten zwischen Agents gelten als "von einer anderen Claude-Session", nicht als vom User. Ein Teammate kann also keine Freigabe für den User erteilen und keine Ablehnung umgehen. Im Auto-Mode prüft ein Classifier jede Nachricht.

**Plan-Modus:**
Wird ein Teammate gespawnt, während der Lead im Plan-Mode ist, arbeitet er read-only, bis sein Plan steht. Der Lead genehmigt den Plan **automatisch, ohne ihn zu prüfen**. Danach gelten wieder die normalen Permission-Prompts.

---

## 7. Wiederverwendbare Rollen über Subagent-Definitionen

Lege eine Rolle einmal an, z. B. in `.claude/agents/security-reviewer.md`. Du kannst sie dann als Subagent **und** als Teammate verwenden:

```text
Spawn a teammate using the security-reviewer agent type to audit the auth module.
```

| Feld | In-process-Teammate | Split-Pane-Teammate |
|---|---|---|
| `tools` | Wird angewendet (plus `SendMessage` und die Task-Tools) | Wird angewendet |
| `model` | Wird angewendet, wenn der Prompt keins nennt | Wird angewendet, wenn der Prompt keins nennt |
| `disallowedTools` | Wird angewendet (`SendMessage` und die Task-Tools bleiben) | – |
| `effort` | Wird angewendet | – |
| Body | Wird an den System-Prompt **angehängt** | **Ersetzt** den System-Prompt |
| `skills` | Wird **nicht** angewendet | Wird **nicht** angewendet |
| `mcpServers` | Wird ignoriert | Wird angewendet |

Wird ein gestoppter in-process-Teammate per Nachricht wieder geweckt, gilt die Definition aus `.claude/agents/` nur, wenn der Ordner, in dem die Agent-Datei liegt, als **vertrauenswürdig** markiert ist.

---

## 8. Quality Gates mit Hooks

| Hook | Wann | Exit-Code 2 bewirkt |
|---|---|---|
| `TeammateIdle` | Ein Teammate will idle gehen | Feedback senden, der Teammate arbeitet weiter |
| `TaskCreated` | Ein Task wird angelegt | Anlegen verhindern und Feedback senden |
| `TaskCompleted` | Ein Task wird als erledigt markiert | Abschluss verhindern und Feedback senden |

Einsatzidee: `TaskCompleted` lässt Tests oder Lint laufen und schließt den Task erst ab, wenn alles grün ist.

---

## 9. Best Practices (Checkliste)

1. **Prüfe die Alternativen.** Reicht ein Subagent oder eine einzelne Session?
2. **Gib im Spawn-Prompt genug Kontext.** Nenne Dateipfade, den Fokus, technische Rahmenbedingungen und das erwartete Output-Format (z. B. "mit Severity-Rating").
3. **Halte das Team klein.** 3–5 Teammates. Drei fokussierte Teammates schlagen oft fünf, die sich verzetteln. Bei 15 Tasks reichen 3 Teammates als Start.
4. **Schneide die Tasks passend zu.** Jeder Task ist eine abgeschlossene Einheit mit klarem Deliverable, etwa eine Funktion, eine Testdatei oder ein Review. Ziel: 5–6 Tasks pro Teammate.
5. **Trenne Datei-Ownership.** Zwei Teammates in derselben Datei überschreiben sich gegenseitig.
6. **Benenne Teammates beim Spawn**, damit du sie später gezielt ansprechen kannst.
7. **Fang mit Research und Review an.** Das bringt den Nutzen der Parallelität ohne die Koordinationsprobleme beim parallelen Implementieren.
8. **Lass den Lead warten.** Fängt er selbst an zu implementieren, schreib ihm: "Wait for your teammates to complete their tasks before proceeding".
9. **Überwache und steuere.** Lass das Team nicht zu lange unbeaufsichtigt laufen und korrigiere früh.
10. **Nutze Gegenspieler.** Ein Devil's Advocate oder Teammates, die sich gegenseitig widerlegen, verhindern Anchoring.
11. **Erlaube vorab die üblichen Befehle**, damit sich die Permission-Prompts nicht im Lead stapeln.
12. **Denk an den Cache.** In-process-Teammates haben standardmäßig eine Cache-TTL von 5 Minuten. Mit `"subagentPromptCacheTtl": "1h"` werden es 60 Minuten, die Cache-Writes sind dann aber teurer.

---

## 10. Prompt-Vorlagen

**Erkundung aus mehreren Perspektiven**
```text
I'm designing <X>. Spawn three teammates to explore this from different angles:
one on UX, one on technical architecture, one playing devil's advocate.
```

**Paralleles Code-Review**
```text
Spawn three teammates to review <PR/branch>:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

**Debugging mit konkurrierenden Hypothesen**
```text
<Symptom>. Spawn 5 agent teammates to investigate different hypotheses. Have them
talk to each other to try to disprove each other's theories, like a scientific
debate. Update the findings doc with whatever consensus emerges.
```

**Parallele Implementierung mit Datei-Ownership** (angepasst an dieses Projekt)
```text
Create an agent team with 3 teammates using Sonnet. Name them "ui", "logic", "qa".
- ui: owns styles/markup only (files: ...). 
- logic: owns game logic only (files: ...).
- qa: writes/runs tests and reviews the other two; does not edit their files.
Split the work into 5-6 tasks per teammate with dependencies. Wait for teammates
to finish before synthesizing. No two teammates edit the same file.
```

**Kontextreicher Spawn**
```text
Spawn a security reviewer teammate with the prompt: "Review <path> for security
vulnerabilities. Focus on <A, B, C>. Context: <stack details>. Report any issues
with severity ratings."
```

**Steuern und Beenden**
```text
Ask the <name> teammate to shut down
Wait for your teammates to complete their tasks before proceeding
Keep going – not all tasks are complete yet.
```

---

## 11. Troubleshooting

| Problem | Lösung |
|---|---|
| Teammates erscheinen nicht | Schau ins Agent-Panel (↑/↓). Die Zeile ist eventuell nur versteckt: Schick dem Teammate per Name eine Nachricht. War die Aufgabe zu klein, fordere ausdrücklich ein **Agent Team** an. |
| Claude nimmt Subagents statt eines Teams | Das Panel allein beweist kein Team. Fordere ausdrücklich ein "agent team" an. |
| Claude spawnt ungewollt Teammates | Setze `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` auf `"0"` (wirkt sofort). |
| Zu viele Permission-Prompts | Erlaube die Befehle vorab in den Permission-Settings. |
| Ein Teammate hört nach einem Fehler auf | Öffne sein Transkript und gib neue Anweisungen, oder spawne einen Ersatz. Eine Nachricht weckt auch einen Teammate, der gerade auf einen API-Retry wartet. |
| Der Lead hört zu früh auf | Schreib ihm: "Keep going". |
| Ein Task hängt in "in progress" | Prüfe, ob die Arbeit erledigt ist. Setze dann den Status manuell oder lass den Lead den Teammate anstoßen. |
| Der Lead schreibt nach `/resume` an Teammates, die es nicht mehr gibt | Lass ihn neue Teammates spawnen. |
| Verwaiste tmux-Sessions | `tmux ls` und danach `tmux kill-session -t <name>` |

---

## 12. Limitierungen (Stand: Doku)

- `/resume` und `/rewind` stellen **keine** in-process-Teammates wieder her.
- Der Task-Status kann hinterherhinken und so abhängige Tasks blockieren.
- Das Herunterfahren kann dauern, weil jeder Teammate erst seinen aktuellen Request oder Tool-Call beendet.
- Es gibt **ein Team pro Session**. Ein Team lässt sich nicht über mehrere Sessions teilen.
- **Keine verschachtelten Teams.** Nur der Lead spawnt Teammates.
- In-process-Teammates können **keine Hintergrund-Subagents** starten. `background: true` und `run_in_background: true` schlagen fehl oder laufen im Vordergrund.
- Der Lead steht fest. Die Führung lässt sich nicht übertragen.
- Den Permission-Mode pro Teammate kannst du erst nach dem Spawn ändern.
- Split-Panes funktionieren nur mit tmux oder iTerm2, **nicht** in VS Code, Windows Terminal oder Ghostty.

---

## 13. Projektnotizen (Guessing-Game)

- Agent Teams sind über [`.claude/settings.local.json`](../.claude/settings.local.json) aktiviert. Die Datei ist lokal und gehört nicht ins Repo.
- Die Umgebung ist Windows 11 mit VS Code. Deshalb wird nur der **in-process**-Modus verwendet.
- Die Codebasis besteht größtenteils aus einer großen Einzeldatei. Teams lohnen sich hier vor allem für **Research, Review und Debugging**. Beim parallelen Implementieren muss die Arbeit streng nach Dateien oder klar getrennten Bereichen aufgeteilt werden, sonst überschreiben sich die Teammates.
