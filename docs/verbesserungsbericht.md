# Verbesserungsbericht

Stand: 4. September 2026. Dieses Journal beschreibt den nachweisbaren Stand der
Arbeitsbranch `codex/ganzprojekt-verbesserung`; es ist kein Produktionsfreigabeprotokoll.

## Ausgangszustand und Baseline

- Lokaler `main`: `ae9d97c`, sauber und vier Commits hinter `origin/main`.
- Aktuelle Basis: `origin/main` bei `0a8301d`; neue Arbeitsbranch direkt davon erstellt.
- Installation: `npm ci`, Exit 0, 405 Pakete, circa 5 Minuten.
- Tests: `npm test`, Exit 0, 17 Dateien und 292 Tests, Vitest-Laufzeit 3,56 s.
- TypeScript: `npx tsc -b`, Exit 0, 15,29 s.
- Alter Gesamtbuild: `npm run build`, Exit 0, 57,84 s. Er vermischte Web- und
  Sites-Ausgabe.
- Haupt-JavaScript: 741.384 Byte roh und 212.133 Byte gzip (zlib Level 9).
- CSS: 33.890 Byte roh und 8.934 Byte gzip.
- PWA-Precache laut Build: 766,18 KiB. Gesamtes `dist`: 2.553.757 Byte; davon
  1.460.359 Byte Sites-Worker, der im Pages-Artefakt nichts zu suchen hat.
- Alle 17 Testdateien lagen in `src/lib`; Komponenten-, Browser-, A11y-, RLS-
  und echte Supabase-Adaptertests fehlten.
- Ein mobiler Lighthouse-Lauf blieb reproduzierbar ohne Ergebnis hängen und
  wurde abgebrochen. Er zählt nicht als Messwert.
- Browser-Baseline: Login und Prototyp wurden bei 320 CSS-Pixeln sichtbar
  geprüft. Das Hauptraster lief dort nicht horizontal über. Bei einer effektiven
  Breite von rund 174 CSS-Pixeln (Zoom-/Reflow-Stresstest) entstand dagegen
  horizontaler Überlauf. Ein echtes iPhone wurde noch nicht geprüft.
- Lokaler Supabase-Reset ist derzeit extern blockiert: Docker ist auf diesem
  Rechner nicht installiert. Supabase CLI 2.116.0 und der pgTAP-Befehl wurden
  anhand ihrer Hilfe verifiziert.

## Datenflusskarte

`Browseraktion → useTracker/store → Backend-Vertrag → lokal.ts oder supabase.ts
→ Tabelle/RPC/Edge Function → Realtime-Kanal → Store-Ereignis des zweiten
Clients → sichtbarer Zustand`

Optimistische Mutationen laufen heute vor der Serverbestätigung durch den Store.
Genau deshalb müssen Schreibreihenfolge, Rückgabeprüfung, Rollback, Outbox und
Realtime-Deduplizierung gemeinsam geschützt werden.

## Bestätigte Befunde und Priorisierung

| Prio | Problem und Beleg | Nutzerwirkung | Vorgesehener Nachweis | Status |
| --- | --- | --- | --- | --- |
| P0 | `App.tsx`/`store.ts`: Mutationen bleiben während des initialen Ladens aktiv | doppelte Einträge oder leeres Sonntagsarchiv | verzögertes Backend, keine Mutation vor `bereit` | offen |
| P0 | `Bereichszeile.tsx`: Tastenereignis eines Kindbuttons erreicht den Zeilen-Toggle | Plus/Minus kann den ganzen Tag löschen | Komponenten-/Browser-Tastaturtest | offen |
| P0 | `noten.ts`: weniger als 300 Punkte werden als 4,0 ausgegeben | nicht bestanden wirkt wie bestandene Abiturnote | Grenztests 299/300 und Blockhürden | offen |
| P0 | Schlafprojektion berechnet Nachbarsegmente nicht mehr gemeinsam | Bettzeit, Effizienz und Score können trotz Rohdaten fehlen | DB-Test N-1/N/N+1 | blockiert durch Migrationsdrift |
| P0 | Löschen einer Schlaf-Quellnacht löscht Projektion nicht | sensible Gesundheitsdaten bleiben sichtbar | DB- und Zwei-Client-Delete-Test | blockiert durch Migrationsdrift |
| P0 | Duellhistorie zählt vier Trackerbereiche, der Live-Stand fünf Felder inkl. Gewicht | vergangene Sieger/Punkte können falsch sein | Gewicht-only-Woche und Archivtest | offen |
| P0 | Wochenabschluss wird aus Clientzustand archiviert | konkurrierende/stale Clients können unveränderlich falsch abschließen | atomare RPC-Paralleltests | blockiert durch Migrationsdrift |
| P0 | offene Registrierung + unprofilierte Push-Schreibrechte + beliebiges HTTPS-Ziel | erreichbare serverseitige Request-Forgery | RLS- und Endpoint-Negativtests | offen |
| P0 | Reminder-Function besitzt keine privilegierte Aufruferprüfung | jeder gültige JWT kann Serverversand anstoßen | anon/user/server-Matrix | offen |
| P1 | gemessene und manuelle Einheiten werden als vollständig gemessen summiert | falsche Dauer und Belegquote | Mischquellen-/Überlappungstests | offen; Belegregel braucht Produktentscheidung |
| P1 | Schlafphasenfehler werden verschluckt | Fehler erscheint endlos als Laden | idle/loading/empty/error/retry | offen |
| P1 | Realtime-Status und Reconnect-Resync fehlen | gelöschte oder verpasste Daten bleiben lokal | Zwei-Client-Reconnect | offen |
| P1 | Historienabfragen sind nicht paginiert | ab 1.000 Zeilen stille Trunkierung | 1.001+-Datensatz-Test | offen |
| P1 | Prüfungsfachwechsel besteht aus zwei Updates | bei Teilfehler fehlt das vierte Fach | transaktionale RPC | blockiert durch Migrationsdrift |
| P1 | PWA `autoUpdate` kann offene Eingaben neu laden | Entwürfe gehen verloren | Zwei-Build-SW-Test mit offenem Formular | offen |
| P1 | Tabs und Dialoge sind tastaturseitig unvollständig | Fokus entkommt; Navigation ist unklar | Komponenten- und Browser-A11y-Tests | offen |

## Remote-Branches

- `9b467ae`/`41b9010`: nicht pauschal übernommen. Die Outbox verliert bei
  Speicherfehlern und zwei Tabs weiter Daten, bindet nur an Alias statt Session
  und löscht permanente Fehler. Testideen werden für eine neue Implementierung
  verwendet.
- `2b6be46`: nicht pauschal übernommen. Bedarfsweises Kalender-Rendering und
  gezieltes Code-Splitting sind Kandidaten; Produktions-Demobypass und sofortiges
  Komplett-Prefetch werden verworfen.
- `c5d9858`/`08f3844`: nicht als Feature übernommen. Die Migrationen scheinen
  jedoch produktiv angewandt und fehlen auf `main`; ihre unveränderte Historie
  muss vor neuen Migrationen ins Repository zurückgeführt und anschließend per
  neuer Migration gehärtet werden.
- Die übrigen Remote-Spitzen sind Vorfahren von `origin/main` oder fachlich
  veraltet; daraus ist kein Sammelmerge vorgesehen.

## Produktions- und Migrationsgrenzen

Der lesende Live-Abgleich meldet eine abweichende produktive Migrationshistorie
und live-only Tabellen/Funktionen. Deshalb werden derzeit keine Migration, kein
Reset, keine Tokenrotation und keine produktive Änderung ausgeführt. Vor einem
späteren Release sind History-Reconciliation, Staging, Backup, Restore-Probe,
Advisors und eine ausdrückliche Freigabe erforderlich.

## Umgesetzte Pakete

### Welle 1: reproduzierbare Prüfpfade

- Web-, Pages- und Sites-Build getrennt.
- PR-CI ergänzt; Produktionsdeploy bleibt ein eigener Job auf `main`.
- Pages-Unterpfad `/vierfelder/`, Supabase-URL und Publishable-Key-Klasse werden
  vor dem Build validiert; `sb_secret_` in `VITE_*` wird abgewiesen.
- Web-Artefakt prüft Manifest, Referenzen, Kern-PWA-Dateien und ein initiales
  JavaScript-Budget.
- Sites-Worker liefert PNGs mit korrektem MIME-Typ; HTML, Manifest und Worker
  sind nicht langfristig cachebar, gehashte Assets dagegen immutable.
- Die sichtbare Fassungszeit wird aus dem Commit abgeleitet. Identische Commits
  erzeugen dadurch nicht allein wegen der Uhrzeit einen neuen Hauptchunk.

## Offene Prüfungen

- physisches iPhone, installierte PWA, Dynamic Type und echte Safe Areas
- zwei echte authentifizierte Browser/Geräte inklusive Realtime-Unterbrechung
- lokaler/staging Supabase-Reset, RLS-/RPC-pgTAP und Edge-Function-Typecheck
- Staging-Migration, Backup und Restore-Probe
- zuverlässiger Lighthouse-Lauf
- öffentliche Preview, Push, PR, Merge und Produktion
