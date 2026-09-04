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
| P0 | `App.tsx`/`store.ts`: Mutationen bleiben während des initialen Ladens aktiv | doppelte Einträge oder leeres Sonntagsarchiv | verzögertes Backend, keine Mutation vor `bereit` | behoben |
| P0 | `Bereichszeile.tsx`: Tastenereignis eines Kindbuttons erreicht den Zeilen-Toggle | Plus/Minus kann den ganzen Tag löschen | Komponenten-/Browser-Tastaturtest | behoben |
| P0 | `noten.ts`: weniger als 300 Punkte werden als 4,0 ausgegeben | nicht bestanden wirkt wie bestandene Abiturnote | Grenztests 299/300 und Blockhürden | behoben |
| P0 | Schlafprojektion berechnet Nachbarsegmente nicht mehr gemeinsam | Bettzeit, Effizienz und Score können trotz Rohdaten fehlen | DB-Test N-1/N/N+1 | blockiert durch Migrationsdrift |
| P0 | Löschen einer Schlaf-Quellnacht löscht Projektion nicht | sensible Gesundheitsdaten bleiben sichtbar | DB- und Zwei-Client-Delete-Test | blockiert durch Migrationsdrift |
| P0 | Duellhistorie zählt vier Trackerbereiche, der Live-Stand fünf Felder inkl. Gewicht | vergangene Sieger/Punkte können falsch sein | Gewicht-only-Woche und Archivtest | behoben |
| P0 | Wochenabschluss wird aus Clientzustand archiviert | konkurrierende/stale Clients können unveränderlich falsch abschließen | atomare RPC-Paralleltests | blockiert durch Migrationsdrift |
| P0 | offene Registrierung + unprofilierte Push-Schreibrechte + beliebiges HTTPS-Ziel | erreichbare serverseitige Request-Forgery | RLS- und Endpoint-Negativtests | offen |
| P0 | Reminder-Function besitzt keine privilegierte Aufruferprüfung | jeder gültige JWT kann Serverversand anstoßen | anon/user/server-Matrix | offen |
| P1 | gemessene und manuelle Einheiten werden als vollständig gemessen summiert | falsche Dauer und Belegquote | Mischquellen-/Überlappungstests | offen; Belegregel braucht Produktentscheidung |
| P1 | Schlafphasenfehler werden verschluckt | Fehler erscheint endlos als Laden oder fälschlich als Health-Leerzustand | idle/loading/empty/error/retry | behoben |
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

### Welle 2: Schreibsperre und sichere Tracker-Tastatur

- Der Store bindet jeden Ladevorgang an einen eigenen Lauf-Token. Vor einem
  vollständig geladenen Zustand, nach Ladefehler, nach Unmount und nach einem
  Backend- oder Kontowechsel bleiben sämtliche Mutationen gesperrt.
- Späte Fehler alter Schreibvorgänge dürfen den Zustand eines neu geladenen
  Kontos nicht mehr zurückrollen. Auch nachgeladene Schlafphasen sind an den
  aktuellen Backendlauf gebunden.
- Während des Ladens ist der produktive Inhaltsbereich `inert`; Abmelden bleibt
  erreichbar. Der Sonntagsabschluss besitzt zusätzlich eine direkte
  Bereitschaftsprüfung und erhält vor Abschluss des Ladens keinen Callback.
- Die Tagesaktion in `Bereichszeile` ist jetzt ein nativer, eigenständiger
  Button. Plus, Minus, weitere Einheit und Undo liegen nicht mehr darin; Enter
  oder Leertaste auf einem dieser Bedienelemente kann daher nicht mehr den
  ganzen Tag umschalten beziehungsweise löschen.
- Erste DOM-Komponententests ergänzen die bisher reine Logiktestsuite. Sie
  prüfen Enter, Leertaste, nicht verschachtelte Interaktionen und den komplett
  deaktivierten Ladezustand. Store-Hook-Tests prüfen verzögertes Laden,
  Ladefehler, Backendwechsel, Unmount und eine verspätete Fehlantwort.
- Paketprüfung: `npm run check`, Exit 0, 19 Testdateien und 303 Tests. Das
  Web-Artefakt umfasst 748.392 Byte JavaScript roh beziehungsweise 214.614 Byte
  gzip; der geringe Zuwachs stammt aus den Laufzeit-Schutzprüfungen, nicht aus
  der nur für Tests installierten DOM-Umgebung. `npm install` meldete 0 bekannte
  Abhängigkeitslücken.
- Visuelle Kontrolle: Prototyp bei 320 CSS-Pixeln nach HMR-Neustart geöffnet;
  die Anzeigetafel-Geometrie blieb ohne neue horizontale Verschiebung. Dies ist
  keine physische iPhone-Abnahme.

### Welle 2: ehrliche MSS-Prognose

- Die amtliche Notentabelle wird nur noch für 300 bis 900 Gesamtpunkte
  ausgewertet. Werte außerhalb dieses Bereichs schlagen intern sichtbar fehl,
  statt still auf 4,0 beziehungsweise 1,0 geklemmt zu werden.
- Eine Abiturhochrechnung entsteht erst, wenn jedes konfigurierte Fach einen
  Schnitt besitzt, genau drei Leistungskurse vorhanden sind und genau ein
  zulässiges Grundfach als vierte Prüfung gewählt ist. Fehlende Fachwerte
  werden nicht mehr mit dem Durchschnitt anderer Fächer aufgefüllt.
- Gerissene Block-, Unterkurs-, Nullpunkt- oder Prüfungsbedingungen liefern
  `nicht_auswertbar` und ausdrücklich keine numerische Abiturnote. Die UI sagt
  neutral `keine belastbare abiturnote` und nennt die Gründe. Sie behauptet
  bewusst kein endgültiges Nichtbestehen: Ohne Halbjahres- und
  Einbringungsmodell kann etwa ein optionaler Nullpunkte-Kurs ersetzbar sein.
- Der Ergebnistyp schließt widersprüchliche Kombinationen wie `bestanden` plus
  `note: null` aus. Der ungenutzte Zielrechner nennt keinen reinen
  Punkteschnitt, wenn eine andere formale Bedingung die Prognose blockiert.
- Warnungen und Defizite verwenden die Farbe der tatsächlich betrachteten
  Person; Prognoseänderungen werden als höflicher Live-Status angekündigt.
- Noten eines Nutzers fließen nur in dessen eigenes Fach ein, selbst wenn
  beschädigte Daten dieselbe Fach-ID mit einer anderen Person verbinden.
- Die sichtbare Notenansicht wurde bei 320 CSS-Pixeln kontrolliert: im aktuellen
  Prototyp steht nun `für 5 von 10 fächern liegen noten vor` statt einer aus
  fünf fehlenden Fachwerten erfundenen Abiturnote; kein horizontaler Überlauf
  war sichtbar.
- Fachliche Quellen: offizielle RLP-Seiten zur
  [Gesamtqualifikation ab Abitur 2027](https://mss.rlp.de/abitur-und-fh-reife/gesamtqualifikation-1)
  und zum [Prüfungsbereich](https://mss.rlp.de/abitur-und-fh-reife/pruefungsbereich).
- Erster Paketlauf: `npm run check`, Exit 0, 20 Testdateien und 310 Tests;
  TypeScript, Produktions-Webbuild, Manifest- und Bundleprüfung erfolgreich.
  JavaScript-Artefakt: 749.653 Byte roh beziehungsweise 215.056 Byte gzip.
  Der anschließende unabhängige Review fand die zu starke Formulierung
  `nicht bestanden`; nach der Korrektur bestehen die 53 gezielten Logik- und
  Komponententests. Der erneute vollständige Lauf `npm run check` endet mit
  Exit 0, 20 Testdateien und 314 Tests; TypeScript, Webbuild und Artefaktprüfung
  bestehen. JavaScript: 749.706 Byte roh beziehungsweise 215.115 Byte gzip.

### Welle 2: kanonische Duellhistorie

- Archivierte Wochen sind jetzt die unveränderliche Wahrheit für Sieger,
  Tiebreak, Abstand und Beleg. Nachträglich veränderte Tracker-Rohdaten können
  sie nicht mehr umschreiben; Archiv und Rohdaten derselben Woche zählen nur
  einmal.
- Weil das bestehende Archiv nur den Abstand und nicht beide absoluten
  Punktestände speichert, erfindet die UI kein historisches `x:y`. Sie zeigt
  `archiviert` mit dem gespeicherten Abstand beziehungsweise dem gespeicherten
  Beleg-Tiebreak. Noch nicht archivierte Altwochen sind ausdrücklich als
  `nachberechnet` gekennzeichnet.
- Legacy-Wochen werden mit `wocheGesamt` aus denselben fünf Feldern wie
  Live-Stand und Abschluss berechnet; Gewicht-only-Wochen verschwinden nicht
  mehr. Gewicht bleibt wie bisher aus der Belegquote ausgeschlossen.
- Ein am laufenden Sonntag archiviertes Finale zählt sofort in Bilanz und
  Serie. Archiv-only-Zustände bestimmen die Historienreichweite; die
  Kalenderwochenrechnung ist gegen Sommer-/Winterzeit stabil.
- Der Backendvertrag gibt nach dem First-Write-wins-Insert die tatsächlich
  gespeicherte Abrechnung zurück. Supabase liest sie nach einem Konflikt erneut.
  Ein Clientkandidat erscheint bis dahin sichtbar als `wird gespeichert`, aber
  noch nicht als Archiv. Fehler sind inline retrybar. Ein Realtime-Archiv der
  eigenen oder einer anderen Woche bleibt bei verlorener HTTP-Antwort erhalten.
  Bereits geladene und gleichzeitig gesendete Wochen werden nicht erneut
  geschrieben.
- Der erste unabhängige Diff-Review fand noch einen zu frühen optimistischen
  Archivstatus und zwei Rollback-Rennen. Nach der Korrektur bestehen TypeScript
  und 47 gezielte Tests in fünf Dateien, einschließlich sichtbarer
  Pending-/Fehlerzustände, Supabase-Insert-plus-SELECT und Nullzeilenfehlern.
  Vollständiger Paketlauf `npm run check`: Exit 0, 21 Testdateien und 330
  Tests; TypeScript, Produktions-Webbuild und Artefaktprüfung bestehen.
  JavaScript: 752.421 Byte roh beziehungsweise 215.933 Byte gzip.
- Visuelle Kontrolle bei 320 × 568 CSS-Pixeln: zwei echte Beispielarchive
  erscheinen ohne horizontalen Überlauf als `+4` beziehungsweise
  `beleg 12:13`, jeweils sichtbar `archiviert`. Die Herkunftsschrift wurde nach
  dem Review von 9 auf 10 CSS-Pixel angehoben. Keine Browserkonsolenfehler und
  kein physisches iPhone geprüft.

### Welle 3: ehrliche Schlafphasen-Nachladung

- Jede Nacht hat nun den expliziten Verlaufzustand `idle`, `loading`, `loaded`,
  `empty` oder `error`. `Schlafnacht.phasen` bleibt die fachliche Wahrheit:
  `null` ist nicht geladen, `[]` ist erfolgreich ohne Stadien geladen und eine
  nicht leere Liste ist ein vorhandener Verlauf. Der Store hält daneben nur
  laufende beziehungsweise fehlgeschlagene Transportzustände.
- Ein fehlgeschlagener Abruf bleibt nicht mehr unendlich bei `wird geladen` und
  wird nicht als `Health lieferte keine Phasen` umgedeutet. Detail und
  Zwei-Personen-Vergleich nennen den betroffenen Verlauf inline und bieten
  einen gezielten Retry; Nachtkennzahlen bleiben dabei sichtbar.
- Gleiche Abrufe aus Detail und Vergleich werden dedupliziert. Ein Consumer-
  Modell mit verzögertem Abbruch schützt React StrictMode, bricht aber einen
  wirklich verlassenen Nachtabruf ab. Request-ID und Backendlauf verhindern,
  dass eine späte alte Antwort einen Retry oder ein neu geladenes Konto
  überschreibt. Ein vollständiges Realtime-Schlafereignis gewinnt gegen einen
  älteren Pending-Abruf.
- Supabase unterscheidet eine bestätigte Zeile ohne Phasen von einer fehlenden,
  per RLS unsichtbaren oder beschädigten Antwort. Die optionale 56-Tage-
  Verlaufsvorladung darf bei einem Netzfehler nicht mehr den gesamten
  App-Start verhindern. Der lokale Prototyp macht fehlende Verläufe ebenfalls
  nicht zu einem falschen Empty-Erfolg.
- Realtime-Updates brechen einen älteren Abruf derselben Nacht ab und laden bei
  einem weiterhin sichtbaren, invalidierten Verlauf frisch. Ein Delete mit
  stabiler Nutzer- und Nacht-ID entfernt die Projektion samt Pending-Abruf aus
  dem Client. Dass das Löschen der geschützten Quellnacht serverseitig derzeit
  noch kein solches Delete erzeugt, bleibt getrennt als migrationsblockiertes
  P0 dokumentiert.
- Prototyp-Schlafwerte sind oben im Tab und im Vollbildkalender sichtbar als
  Beispieldaten gekennzeichnet. Ein nur aus Schlafdauer berechneter Ring heißt
  `geschätzt`; der Kalender markiert ihn mit `~` und erklärt die Markierung.
- Tests schützen Statusableitung, Deduplizierung, Retry, Abbruch beim
  Backendwechsel, späte Antworten, Supabase-Nullzeilen, beschädigte Payloads,
  lokalen Abort, Realtime-Update/Delete, unvollständige Kurven und die sichtbaren
  Loading-/Error-/Empty-Texte. Vollständiger Lauf `npm run check`: Exit 0,
  24 Testdateien und 352 Tests; TypeScript, Webbuild und Artefaktprüfung
  bestehen. Haupt-JavaScript: 752.869 Byte roh beziehungsweise 215.266 Byte
  gzip; gesamtes JavaScript 758.522 Byte roh beziehungsweise 217.465 Byte gzip.
- Visuelle Kontrolle bei 320 × 568 CSS-Pixeln: Schlaf-Tab und Vollbildkalender
  ohne sichtbaren horizontalen Überlauf; Prototyp- und Schätzungshinweis sind
  sichtbar, die zugänglichen Kalendernamen unterscheiden Schätzung und
  Nachtwert. Keine Browserkonsolenfehler. Ein physisches iPhone und ein echter
  Supabase-Abruffehler bleiben ungeprüft.

## Offene Prüfungen

- physisches iPhone, installierte PWA, Dynamic Type und echte Safe Areas
- zwei echte authentifizierte Browser/Geräte inklusive Realtime-Unterbrechung
- lokaler/staging Supabase-Reset, RLS-/RPC-pgTAP und Edge-Function-Typecheck
- Staging-Migration, Backup und Restore-Probe
- zuverlässiger Lighthouse-Lauf
- öffentliche Preview, Push, PR, Merge und Produktion
