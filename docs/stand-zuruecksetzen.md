# Stand zurücksetzen (Start am 09.09.2026)

Vor dem offiziellen Start benutzen Erijon und Koray die App zur Erprobung. Die
dabei entstandenen Haken, Einheiten, Messungen und Wochenwertungen sind kein
Vergleich, sondern Testrauschen. Dieses Runbook setzt genau dieses Rauschen auf
Null — und nichts sonst.

Es ergänzt das [Release- und Migrationsrunbook](release-und-migrationen.md).
Dessen Sperre gilt weiter: eine Änderung produktiver Daten braucht eine
ausdrückliche Freigabe. Dieses Dokument beschreibt, wofür die Freigabe gilt.

## Was der Reset ist — und was er nicht ist

Der Reset ist ein `delete` auf Nutzdaten in einer Transaktion. Er ist keine
Migration:

- kein `create`, `alter` oder `drop` auf Tabellen, Funktionen, Triggern,
  Policies oder Grants;
- keine Datei unter `supabase/migrations/`, also auch kein `supabase db push`;
- keine Veröffentlichung einer Edge Function und keine Tokenrotation.

An den Funktionen der App ändert sich dadurch nichts. Der Reset benutzt die
bestehenden Mechanismen: das Löschen einer Schlafnacht räumt über den
vorhandenen Trigger `schlaf_quellloeschung_projektion` auch die sichtbare
Projektion `schlaf_updates` mit ab.

## Was geleert wird

| Tabelle | Inhalt |
|---|---|
| `wochenabrechnung` | abgeschlossene Wochen |
| `duell_wetten` | Wetten und ihr CAS-Stand |
| `einheiten` | die einzelnen Durchführungen |
| `eintraege` | die Haken je Person, Bereich und Tag |
| `werte` | Minuten und Seiten je Tag |
| `gewicht` | die täglichen Gewichte |
| `schlafnaechte` | die Quellnächte |
| `schlaf_updates` | die Projektion (fällt über den Trigger ohnehin) |
| `aufenthalte` | **nur abgeschlossene** Aufenthalte |

## Was bleibt — und warum

| Tabelle | Grund |
|---|---|
| `profile` | die beiden Konten. Ohne sie kein Login |
| `faecher`, `noten` | echte Schulnoten, kein Erprobungsstand |
| `push_abos` | angemeldete Geräte. Sonst Push je Handy neu einrichten |
| `schlaf_import_tokens` | Kurzbefehlstoken. Sonst Kurzbefehle neu einrichten |
| `erinnerungs_einstellungen` | die eingestellten Uhrzeiten |
| `erinnerungs_versand` | Zustandsmaschine des Versands. Ein Löschen könnte eine bereits gesendete Erinnerung erneut auslösen |
| `kurzbefehl_laeufe` | Idempotenzschlüssel. Ein Löschen ließe eine Wiederholung doppelt zählen |
| offene `aufenthalte` | ein Training, das gerade läuft. Ohne Ankunft liefe der spätere Abgang ins Leere |

Der letzte Punkt ist der Grund für die frühe Uhrzeit: morgens vor dem
Aufstehen läuft weder eine Standort- noch eine Fokusmessung.

## Ablauf

Die drei SQL-Dateien liegen in `scripts/`. Sie werden in dieser Reihenfolge
gegen die Produktionsdatenbank ausgeführt.

1. **Zählen.** `scripts/reset-stand-pruefen.sql` — der Stand vor dem Eingriff,
   als Notiz festhalten.
2. **Sichern.** `scripts/reset-stand-sichern.sql` — eine Anweisung je
   Tabelle, jede Ausgabe als eigene JSON-Datei ablegen. Das ist die
   Rückfahrkarte; ohne sie ist das Löschen endgültig. Am 07.09.2026 ergaben
   alle Tabellen zusammen rund 348 kB, weit überwiegend aus `schlafnaechte`
   und `schlaf_updates`.
3. **Löschen.** `scripts/reset-stand.sql` — eine Transaktion, alles oder
   nichts.
4. **Belegen.** `scripts/reset-stand-pruefen.sql` erneut. Die Gruppe `geleert`
   muss überall `0` zeigen, die Gruppe `bleibt` dieselben Zahlen wie in
   Schritt 1.

## Die Handys nicht vergessen

Der Reset trifft nur Supabase. Wer die App im Prototyp-Modus ohne Login
benutzt, hat seinen Stand zusätzlich im `localStorage` des Browsers unter den
Schlüsseln `vierfelder.*`. Dieser Stand bleibt bestehen und muss auf jedem
Gerät einmal selbst gelöscht werden (Website-Daten der installierten
PWA entfernen).

## Die angebrochene Woche

Das Raster beginnt montags. Ein Reset am Mittwoch lässt Montag und Dienstag
dieser Woche dauerhaft leer; die erste vollständige Vergleichswoche ist damit
erst die Woche ab dem 14.09.2026. Wer eine saubere erste Woche will, setzt
stattdessen am Montagmorgen zurück. Der Ablauf ist derselbe.
