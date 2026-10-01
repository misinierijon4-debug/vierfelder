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
2. **Sichern.** `scripts/reset-stand-sichern.sql` — kopiert die Nutzdaten
   vollständig in ein eigenes Schema `sicherung_<datum>` derselben Datenbank
   und zählt beide Seiten gegeneinander. Erst wenn jede Zeile `ok` zeigt, darf
   Schritt 3 laufen. Das ist die Rückfahrkarte; ohne sie ist das Löschen
   endgültig.

   Die Kopie liegt bewusst in der Datenbank und nicht in einer JSON-Datei: die
   Ausgabe aller Tabellen lag am 07.09.2026 bei rund 348 kB, weit überwiegend
   `schlafnaechte` und `schlaf_updates`. `create table as select` ist exakt und
   typgetreu, ein Export durch ein Chatfenster ist es nicht. Das Schema enthält
   keine App-Objekte, `anon` und `authenticated` haben darauf keine Rechte, und
   die App liest es nicht.
3. **Löschen.** `scripts/reset-stand.sql` — eine Transaktion, alles oder
   nichts.
4. **Belegen.** `scripts/reset-stand-pruefen.sql` erneut. Die Gruppe `geleert`
   muss überall `0` zeigen, die Gruppe `bleibt` dieselben Zahlen wie in
   Schritt 1.

## Der Rückweg

`scripts/reset-stand-zuruecknehmen.sql` spielt die Sicherung wieder ein, in
umgekehrter Reihenfolge und in einer Transaktion. Zwei Punkte sind daran nicht
offensichtlich:

- `aufenthalte.id` ist eine Identity-Spalte. Das Skript schreibt mit
  `overriding system value` und setzt den Zähler danach über den höchsten
  wiederhergestellten Wert. Ohne diesen `setval` kollidiert die nächste
  Ankunft mit einer alten Zeile.
- `schlaf_updates` wird ausdrücklich mitgeschrieben und nicht neu abgeleitet.
  Der Einfügetrigger auf `schlafnaechte` erzeugt die Projektion ohnehin;
  `on conflict do nothing` lässt beide Wege nebeneinander bestehen.

Der Rückweg lohnt nur, solange nach dem Reset noch keine neuen Daten
entstanden sind, die dabei verloren gingen.

## Durchführung am 09.09.2026

Ausgeführt um 10:35 UTC gegen das Produktionsprojekt, nach ausdrücklicher
Freigabe.

- Kein offener Aufenthalt zum Zeitpunkt des Eingriffs.
- Sicherung nach `sicherung_20260909`, alle neun Tabellen mit `ok` belegt.
- Gelöscht: 23 Schlafnächte, 23 Projektionszeilen, 27 Aufenthalte,
  2 Wochenabrechnungen, 3 Werte, 2 Gewichte, 1 Einheit, 1 Haken.
  `duell_wetten` war bereits leer.
- Unverändert: 2 Konten, 20 Fächer, 4 Noten, 3 Push-Geräte, 2 Importtoken,
  2 Erinnerungseinstellungen, 15 Versandzeilen.
- Der Rückweg wurde anschließend in einer zurückgerollten Transaktion
  erprobt: alle Zeilen kamen vollständig zurück, danach war der Stand wieder
  leer.

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
