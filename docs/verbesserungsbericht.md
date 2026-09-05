# Verbesserungsbericht

Stand: 5. September 2026. Dieses Journal beschreibt den nachweisbaren Stand der
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
| P0 | Wochenabschluss wird aus Clientzustand archiviert | konkurrierende/stale Clients können unveränderlich falsch abschließen | atomare RPC-Paralleltests | lokal behoben; Migration/Staging offen |
| P0 | Push-Versand akzeptiert jedes gespeicherte HTTPS-Ziel und folgt Redirects | serverseitige Request-Forgery und Datenabfluss in Logs/Antworten | Provider-Allowlist, Redirect-, IP- und Log-Negativtests | lokal behoben; Deploy offen |
| P0 | offene Registrierung + unprofilierte Push-Schreibrechte | fremde Konten können Provider-Endpunkte speichern und die Probe missbrauchen | Mitglieder-, RLS- und Rate-Limit-Matrix | blockiert durch Migrationsdrift |
| P0 | Reminder-Function besitzt keine privilegierte Aufruferprüfung | jeder gültige JWT kann Serverversand anstoßen | anon/user/server-Matrix | offen |
| P0 | `fokus` fällt bei fehlendem anon-Key auf Service Role zurück | öffentlich erreichbarer Importweg erhält unnötige Vollrechte | Fehlkonfigurations- und Key-Auswahltests | lokal behoben; Deploy offen |
| P1 | Fokus-GET trägt ein bereichsübergreifend gültiges Token in URL/Logs | Token-Leak erlaubt Schreibzugriff auf mehrere Importwege | POST-Header, Zweck-/Gerätetoken und Rotation | POST lokal fertig; Migration/iPhones offen |
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
- `c5d9858`/`08f3844`: selektiv als `b219144`/`04a7a89` übernommen, nachdem der
  Live-Abgleich beide Migrationen, `schlaf-erinnerung` v1 und die refaktorierte
  `gewicht-erinnerung` v2 bestätigt hat. Die Commits sind patch-id-identisch;
  der neun Commits zurückliegende Featurebranch selbst wurde nicht gemergt.
- Die übrigen Remote-Spitzen sind Vorfahren von `origin/main` oder fachlich
  veraltet; daraus ist kein Sammelmerge vorgesehen.

## Produktions- und Migrationsgrenzen

Der lesende Live-Abgleich meldet 29 produktive und nach der gezielten
Rückführung 28 lokale Migrationen; nur 15 Versionsnummern stimmen überein.
`gewicht.quelle` und `record_gewicht` stehen lokal in einer Migration, existieren
produktiv aber noch nicht. Deshalb werden derzeit keine Migration, kein Reset,
keine Tokenrotation und keine produktive Änderung ausgeführt. Vor einem späteren
Release sind History-Reconciliation, Staging, Backup, Restore-Probe, Advisors
und eine ausdrückliche Freigabe erforderlich.

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

### Welle 2: Push-Netzwerkgrenze und Live-Parität

- Der Browser prüft jedes neue Abo vor dem Upsert; Apple-, Google-, Mozilla-
  und Microsoft-Endpunkte sind eng auf die dokumentierten Hosts begrenzt.
  HTTP, Benutzerinfo, Fragmente, fremde Ports, IP-Literale, localhost,
  private/link-lokale Ziele, falsche Suffixe, Leerraum und überlange Adressen
  werden abgewiesen. Ein dabei neu erzeugtes Browser-Abo wird zurückgenommen.
- Derselbe Validator läuft unmittelbar vor Verschlüsselung und `fetch` in der
  Edge Function. Er schützt damit auch manipulierten Altbestand und direkte
  PostgREST-Schreibungen. Ungültige Endpunkte gelten als dauerhaft weg;
  Gewicht-, Schlaf- und Probeversand entfernen nur die exakt betroffene Zeile.
  Redirects sind verboten.
- Löschungen werden über zurückgegebene Zeilen bestätigt. `error === null` bei
  null betroffenen Zeilen wird nicht mehr als Bereinigung ausgegeben. Das
  gemeinsame Versandmodul meldet Teilfehler und zählt nur bestätigte Deletes.
- Provider-Antworttexte und native Netzwerkfehler werden nicht weitergereicht.
  Logs und Probeantwort enthalten weder Abo-Adresse noch Gerätebezeichnung;
  sie nennen nur laufende Nummer, Providerklasse und Status. Supabase-Imports
  der drei betroffenen Functions sind exakt auf 2.112.4 gepinnt.
- Die live vorhandenen, auf `origin/main` fehlenden Commits `c5d9858` und
  `08f3844` wurden nach Abgleich als `b219144` und `04a7a89` übernommen. Damit
  enthält das Repository wieder die produktive Schlaf-Erinnerung, den
  gemeinsamen Versandweg und beide bereits angewandten Migrationen. Ein
  sachlich widerlegter Kommentar zur vermeintlichen Health-Ursache wurde
  neutralisiert.
- Der sendeseitige SSRF-Pfad ist lokal geschlossen. Noch offen bleiben der
  Datenbank-CHECK beim Speichern, das serverseitige Zwei-Personen-Limit,
  Rate-Limits und die privilegierte Scheduler-Authentifizierung. Diese Punkte
  benötigen eine Forward-Fix-Migration und werden wegen des History-Drifts
  weder als behoben noch als produktiv bezeichnet.
- Gezielter Lauf: 4 Dateien und 53 Push-/Versandtests, Exit 0. Deno 2.9.6
  prüft `push-test`, `gewicht-erinnerung` und `schlaf-erinnerung`, Exit 0.
  Der unabhängige Diff-Review fand die fehlende Delete-Bestätigung; nach ihrer
  Korrektur endet `npm run check` mit Exit 0, 26 Dateien und 384 Tests.
  TypeScript, Webbuild und Artefaktprüfung bestehen. JavaScript: 759.205 Byte
  roh beziehungsweise 217.718 Byte gzip; gesamtes `dist`: 1.105.591 Byte.

### Welle 2: Fokus fail-closed und sicherer POST-Übergang

- `fokus` kann den Service-Role-Key nicht mehr lesen oder als Fallback nutzen.
  Es bevorzugt `SUPABASE_PUBLISHABLE_KEYS.default`; nur wenn die neue Variable
  vollständig fehlt, bleibt der unprivilegierte Legacy-anon-Key kompatibel.
  Fehlerhaftes JSON, ein fehlender `default`-Eintrag oder eine Secret-Key-
  Klasse führen fail-closed zum Konfigurationsfehler.
- Der bevorzugte POST-Weg liest das Import-Token ausschließlich aus
  `x-import-token` und weist `t`/`token` in der URL ab. Die sechs installierten
  GET-Kurzbefehle bleiben bis zur physischen Umstellung beider iPhones aktiv,
  kennzeichnen Antwort und Header aber als veraltet. Das ist bewusst noch
  keine Tokenrotation und kein Abschalten des Altwegs.
- Bereiche, Ereignisse, Token- und Ortslänge werden vor dem RPC geprüft.
  Unbekannte Datenbank- und Netzwerkfehler geben keine internen Meldungen an
  den Aufrufer weiter. `schlaf-import` setzt nun ebenfalls `no-store`.
- Alle Supabase-JS-Imports der Edge Functions sind exakt auf 2.112.4 gepinnt.
  Ein Quelltest verhindert unbemerkte schwimmende Versionen. Die PR-CI richtet
  Deno 2.9.6 ein und typecheckt alle fünf Functions getrennt vom Webbuild.
- Der zweite Sicherheitsreview bewahrte alle von `record_aufenthalt`
  unterstützten Ereignis-Aliase, verengte die 401-Erkennung auf den exakten
  Tokenfehler, behandelt einen nicht ausgeführten Abgang als HTTP 409 und
  trennt ungültige Serverkonfiguration (500) von einem Netzfehler (502).
- Gezielter Lauf: 2 Dateien und 41 Fokus-/Importtests, Exit 0. Der vollständige
  `npm run check` endet mit Exit 0, 28 Dateien und 425 Tests. TypeScript,
  Webbuild und Artefaktprüfung bestehen. Deno 2.9.6 prüft alle fünf Functions,
  Exit 0. JavaScript: 759.205 Byte roh beziehungsweise 217.718 Byte gzip;
  gesamtes `dist`: 1.105.591 Byte.
- Der aktuelle Supabase-Keyweg folgt der offiziellen
  [Migrationsanleitung](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
  und den dokumentierten
  [Function-Umgebungsvariablen](https://supabase.com/docs/guides/functions/secrets).
  Scheduler-Secret, Zweck-/Gerätetokens und Abschaltung des GET-Altwegs bleiben
  migrations-, staging- und freigabepflichtig.

### Welle 2: serverautoritiver Wochenabschluss

- Der Browser darf keine Archivzeile mehr direkt einfuegen und sendet nur noch
  den Wochenmontag an eine schmale RPC. Eine nicht exponierte, privilegierte
  Datenbankfunktion prueft die Zwei-Personen-Mitgliedschaft, den Montag und den
  Abschlusszeitpunkt in `Europe/Berlin` und berechnet Sieger, Abstand, Beleg,
  Wette und Auditwerte in einem SQL-Statement aus den kanonischen Tabellen.
- Ein transaktionsgebundener Advisory Lock, der Primaerschluessel und
  `ON CONFLICT DO NOTHING` machen zwei gleichzeitige Abschluesse idempotent.
  Eine bereits vorhandene Zeile gewinnt unveraendert; bestehende Clientarchive
  werden nicht aus spaeter veraenderten Rohdaten neu erfunden.
- Neue Archive tragen Berechnungsversion, absolute Punktestaende,
  ausloesendes Profil sowie `server_planmaessig` oder `server_nachgeholt`.
  Legacy-Zeilen bleiben als Version 0 erhalten. Eine CHECK-Invariante bindet
  Differenz, Sieger, Grund und Auditpunkte widerspruchsfrei zusammen.
- Verpasste Wochen werden im Supabase-Modus sequenziell von alt nach neu
  nachgeholt, aber nur wenn Tracker-/Gewichtsdaten oder eine echte Wette
  existieren. Leere Kalenderluecken werden nicht nachtraeglich als Remis
  erfunden. Pending und Fehler sind sichtbar; ein fehlgeschlagener Abschluss
  kann direkt erneut angestossen werden.
- Der Client betrachtet auch eine technisch erfolgreiche RPC-Antwort erst dann
  als Bestaetigung, wenn Woche, Wertebereiche, Version, Herkunft, absolute
  Punkte und Tiebreak-Entscheidung zusammenpassen. Die Historie zeigt fuer neue
  Serverarchive echte absolute Staende, fuer Legacyarchive weiterhin nur den
  belegten Abstand.
- Der unabhaengige Review bestaetigte Formelparitaet, Mischquellen-
  Deduplizierung, Schwellen, Berliner Kalendertage, konsistenten Snapshot und
  Race-Schutz. Gezielter Schlusslauf: 5 Dateien und 69 Tests, Exit 0.
  Vollstaendiger Lauf `npm run check`: Exit 0, 29 Dateien und 439 Tests;
  TypeScript, Webbuild und Artefaktpruefung bestehen. JavaScript: 762.981 Byte
  roh beziehungsweise 218.734 Byte gzip; gesamtes `dist`: 1.109.521 Byte.
- Die Migration `20260905120728_duell_wochenabschluss_serverautoritaer.sql`
  wurde bewusst weder lokal noch produktiv angewandt. Vor Freigabe fehlen ein
  frischer beziehungsweise Staging-Reset, Legacy-Upgradefixture, Rollenmatrix,
  echte parallele Transaktionen und der Nachweis, dass spaetere Rohdaten- oder
  Wettenaenderungen das Archiv nicht beeinflussen.

## Offene Prüfungen

- physisches iPhone, installierte PWA, Dynamic Type und echte Safe Areas
- zwei echte authentifizierte Browser/Geräte inklusive Realtime-Unterbrechung
- lokaler/staging Supabase-Reset und RLS-/RPC-pgTAP
- Staging-Migration, Backup und Restore-Probe
- zuverlässiger Lighthouse-Lauf
- öffentliche Preview, Push, PR, Merge und Produktion
