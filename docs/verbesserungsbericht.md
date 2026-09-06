# Verbesserungsbericht

Stand: 6. September 2026. Dieses Journal beschreibt den nachweisbaren Stand der
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
| P0 | Löschen einer Schlaf-Quellnacht löscht Projektion nicht | sensible Gesundheitsdaten bleiben sichtbar | DB- und Zwei-Client-Delete-Test | lokal behoben; Migration/Staging offen |
| P0 | Duellhistorie zählt vier Trackerbereiche, der Live-Stand fünf Felder inkl. Gewicht | vergangene Sieger/Punkte können falsch sein | Gewicht-only-Woche und Archivtest | behoben |
| P0 | Wochenabschluss wird aus Clientzustand archiviert | konkurrierende/stale Clients können unveränderlich falsch abschließen | atomare RPC-Paralleltests | lokal behoben; Migration/Staging offen |
| P0 | Push-Versand akzeptiert jedes gespeicherte HTTPS-Ziel und folgt Redirects | serverseitige Request-Forgery und Datenabfluss in Logs/Antworten | Provider-Allowlist, Redirect-, IP- und Log-Negativtests | lokal behoben; Deploy offen |
| P0 | offene Registrierung + unprofilierte Push-Schreibrechte | fremde Konten können Provider-Endpunkte speichern und die Probe missbrauchen | Mitglieder-, RLS- und Rate-Limit-Matrix | lokal behoben; Migration, Live-Signup und Staging offen |
| P0 | Reminder-Function besitzt keine privilegierte Aufruferprüfung | jeder gültige JWT kann Serverversand anstoßen | anon/user/server-Matrix | offen |
| P0 | `fokus` fällt bei fehlendem anon-Key auf Service Role zurück | öffentlich erreichbarer Importweg erhält unnötige Vollrechte | Fehlkonfigurations- und Key-Auswahltests | lokal behoben; Deploy offen |
| P1 | Fokus-GET trägt ein bereichsübergreifend gültiges Token in URL/Logs | Token-Leak erlaubt Schreibzugriff auf mehrere Importwege | POST-Header, Zweck-/Gerätetoken und Rotation | POST lokal fertig; Migration/iPhones offen |
| P1 | gemessene und manuelle Einheiten werden als vollständig gemessen summiert | falsche Dauer und Belegquote | Mischquellen-/Überlappungstests | offen; Belegregel braucht Produktentscheidung |
| P1 | Schlafphasenfehler werden verschluckt | Fehler erscheint endlos als Laden oder fälschlich als Health-Leerzustand | idle/loading/empty/error/retry | behoben |
| P1 | Realtime-DELETE erwartet unter RLS Vollzeilen; Status und Reconnect-Resync fehlen | gelöschte oder verpasste Daten bleiben lokal | PK-only-Delete und Zwei-Client-Reconnect | PK-Delete lokal behoben; Reconnect offen |
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

Der lesende Live-Abgleich meldet 29 produktive und mit den drei neuen
Forward-Fixes 31 lokale Migrationen; nur 15 Versionsnummern stimmen überein.
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

### Welle 2/3: Schlafloeschung und robuste Realtime-Deletes

- Eine neue Statement-Trigger-Migration loescht bei jeder geloeschten
  `schlafnaechte`-Quellzeile atomar die gleichschluesselige sichtbare
  `schlaf_updates`-Projektion. Damit bleiben sensible Schlafdaten nicht mehr
  nach einer fachlichen Loeschung fuer App, View und Realtime erhalten.
- Weil Score v3 die 13 vorherigen Einschlafzeiten nutzt, bewertet derselbe
  Statement-Trigger fuer jede geloeschte Nacht hoechstens die 13 betroffenen
  Folgenaechte neu. Eine `OLD TABLE`-Transition-Relation macht Einzel-, Bulk-
  und Cascade-Deletes sicherer als ein Row-Trigger, der noch zu loeschende
  Zeilen waehrend desselben Statements aktualisieren koennte.
- Realtime-DELETE fuer Einheiten, Faecher und Noten verwendet jetzt nur die
  UUID; Aufenthalte tragen ihre bigint-Tabellen-ID bis in den Zustand und
  werden ebenfalls anhand dieser ID ersetzt oder entfernt. Ein Wetten-Delete
  entfernt den lokalen Schluessel. Damit haengt kein Delete mehr von einer
  unter RLS nicht gelieferten Vollzeile ab.
- Der Store fuehrt doppelte ID-Deletes idempotent zusammen und behaelt, soweit
  vorhanden, die lokale Einheitenzeile nur fuer die Animation. Aufenthalt-
  Updates vergleichen alle fachlich relevanten Felder einschliesslich Bereich.
- Der lokale Prototyp sendet Gewichts-Aenderung und -Loeschung nun ueber den
  bestehenden BroadcastChannel. Delete-Nachrichten enthalten waehrend des
  Versionsuebergangs zugleich stabile ID und Vollzeile: neue Tabs nutzen die
  ID, bereits offene alte Tabs bleiben lesefaehig. Der Empfaenger normalisiert
  beide Richtungen auf den neuen Store-Vertrag.
- Gezielter Schlusslauf: 5 Dateien und 86 Tests, Exit 0. Vollstaendiger Lauf
  `npm run check`: Exit 0, 30 Dateien und 448 Tests; TypeScript, Webbuild und
  Artefaktpruefung bestehen. JavaScript: 764.841 Byte roh beziehungsweise
  219.089 Byte gzip; gesamtes `dist`: 1.111.405 Byte. (Der dokumentierte
  Bytewert stammt aus dem letzten Vollbuild; der anschliessende Kommentarfix
  aendert keinen Laufzeitcode.)
- Die Schlaf-Migration `20260905123543_schlaf_quellloeschung_propagieren.sql`
  ist nur vorbereitet. Regex-Quelltests ersetzen keinen PostgreSQL-Lauf. Vor
  Freigabe fehlen Einzel-/Bulk-/Cascade-Fixtures, beide Profile, der Vergleich
  der 13 neu berechneten Folgenaechte, RLS sowie ein echter Zwei-Client-Delete.
  Bei Live-Loeschungen muessen parallele Importe pausieren oder pro Nutzer
  serialisiert werden. Subscription-Status, Initial-Gap und Reconnect-
  Vollabgleich bleiben das naechste eigenstaendige Zuverlaessigkeitspaket.

### Welle 2: serverseitige Zwei-Personen-Grenze

- `public.profile` ist nun auch fuer Own-Row-Operationen die ausdrueckliche
  Mitgliedschaftsquelle. Die zentrale `private.ist_duellprofil()`-Funktion hat
  einen leeren Suchpfad und voll qualifizierte Objekte. Gemeinsame Daten bleiben
  fuer Erijon und Koray sichtbar; private Werte, Push-Abos und
  Erinnerungseinstellungen bleiben zusaetzlich auf den Eigentuemer begrenzt.
- Alle 13 bisher nur an `auth.users` gebundenen `user_id`-Tabellen erhalten
  einen zusaetzlichen, validierten Profil-Fremdschluessel. Die alten FKs bleiben
  fuer Kompatibilitaet erhalten. Der neue FK kaskadiert bewusst nicht von einer
  Profilzeile: Eine versehentliche Membership-Aenderung darf keine Gesundheits-,
  Noten- oder Trackerhistorie loeschen.
- Vor der Constraint-Anlage sucht die Migration tabellenweise nach fremden
  Altzeilen. Bei einem Fund bricht sie mit den betroffenen Tabellennamen ab;
  nichts wird automatisch geloescht oder umgedeutet. Der letzte lesende
  Live-Audit fand zwei Auth-Nutzer, zwei Profile und keine solchen Zeilen. Das
  ersetzt keinen unmittelbar vor Staging und Produktion wiederholten Check.
- `kurzbefehl_laeufe` ist nicht mehr fuer jedes beliebige authentifizierte Konto
  lesbar. Die Push-Probe validiert das JWT serverseitig, prueft das konkrete
  Profil vor dem ersten Abo-Lesen und reserviert atomar hoechstens einen Versand
  pro Mitglied und Minute. Fremdkonten erhalten 403; zu schnelle Wiederholungen
  429 mit `Retry-After`, ohne Push-Dienstzugriff.
- Der neue Publishable-Key-Resolver wird nun von Fokus und Push-Probe gemeinsam
  verwendet. Kaputtes `SUPABASE_PUBLISHABLE_KEYS`-JSON faellt nicht auf den
  Legacy-Key zurueck; Secret-, Service-Role- und fremde JWT-Rollen werden
  abgewiesen. Auth-401/403 bleibt eine abgelaufene Anmeldung, waehrend ein
  Auth-Infrastrukturfehler ehrlich als 502 erscheint.
- Pro Profil sind hoechstens fuenf Push-Abos zulaessig. Ein Advisory Lock macht
  auch parallele Inserts zaehlsicher; bestehende Endpunkte koennen weiterhin
  aktualisiert werden. Der lesende Live-Check fand zwei Abos fuer Erijon und
  eines fuer Koray, also keinen blockierenden Altbestand. Der privilegierte
  Rate-Limit-Kern liegt in `private`; die exponierte RPC ist nur ein
  `SECURITY INVOKER`-Wrapper.
- Die lokale Supabase-Reproduktionskonfiguration deaktiviert normale und
  anonyme Registrierung. Die produktive Auth-Einstellung ist weiterhin offen
  und wurde nicht veraendert; ihr Abschalten bleibt eine ausdrueckliche
  Freigabeaktion. RLS/FKs bleiben unabhaengig davon erforderlich.
- Die Umsetzung folgt der aktuellen offiziellen
  [RLS-Anleitung](https://supabase.com/docs/guides/database/postgres/row-level-security),
  der [Function-Haertung](https://supabase.com/docs/guides/database/functions)
  und der [CLI-Konfigurationsreferenz](https://supabase.com/docs/guides/local-development/cli/config).
- Gezielter Schlusslauf: 4 Dateien und 58 Tests, Exit 0. Vollstaendiger Lauf
  `npm run check`: Exit 0, 32 Dateien und 465 Tests; TypeScript, Webbuild und
  Artefaktpruefung bestehen. Deno 2.9.0 prueft alle fuenf Functions, Exit 0.
  JavaScript: 764.841 Byte roh beziehungsweise 219.090 Byte gzip; gesamtes
  `dist`: 1.111.405 Byte. SQL-Quelltests sind kein Datenbankbeweis: Docker oder
  Podman fehlen, daher bleiben Reset, pgTAP-Rollenmatrix, Migration und Staging
  offen. Die Datenbankmigration muss vor der neuen `push-test`-Function
  ausgerollt werden; umgekehrt fehlt der Handler-RPC und endet fail-closed mit
  500.

### Welle 2: Scheduler nur mit benanntem Secret-Key

- Die beiden privilegierten Erinnerungs-Functions akzeptieren nicht mehr den
  oeffentlichen anon-/publishable-Key. `@supabase/server` 1.5.3 prueft jetzt
  ausschliesslich den Dashboard-Secret-Key mit dem Namen `automations`; erst
  danach erhaelt die Fachlogik den administrativen Datenbank-Client. Der
  Gateway-JWT-Check ist fuer diesen dokumentierten Service-to-Service-Weg
  deaktiviert, die eigene Secret-Pruefung dagegen zwingend.
- CORS ist fuer die reinen Serverendpunkte abgeschaltet. Eine OPTIONS-Anfrage,
  ein fehlender Key und ein publishable Key erreichen deshalb die Fachlogik
  nicht und enden im lokalen Wrapper-Lauf mit 401. Nur der passende Test-Key
  erreicht den Handler; ohne VAPID-Konfiguration endet er dort erwartbar mit
  500, bevor Daten gelesen oder Pushes gesendet werden.
- Die neue Scheduler-Migration entfernt die Legacy-`Authorization`-Header und
  liest nur `vierfelder_automations_secret_key` aus Vault. Eine private
  `SECURITY DEFINER`-Funktion mit leerem Suchpfad erlaubt nur die zwei bekannten
  Function-Namen und prueft bei jedem Lauf die feste Projekt-URL
  `ogxwazageufvalkocywh.supabase.co`. Damit kann ein falscher Vault-URL-Wert den
  Secret-Key nicht an ein fremdes Projekt weiterleiten.
- Fehlende Secrets blockieren keinen reproduzierbaren Datenbank-Reset: Die
  Jobs werden angelegt, der spaetere Cron-Lauf bricht aber vor jedem HTTP-
  Request fail-closed ab. Vor Staging muss der benannte Dashboard-Key erstellt
  und derselbe Wert im Vault hinterlegt werden. Function plus
  `verify_jwt=false` muessen gemeinsam ausgerollt werden; danach folgt erst die
  Cron-Migration. Keiner dieser Schritte wurde produktiv ausgefuehrt.
- Grundlage sind die am 6. September 2026 gelesene offizielle
  [Function-Authentifizierung](https://supabase.com/docs/guides/functions/auth),
  die [Scheduler-Anleitung](https://supabase.com/docs/guides/functions/schedule-functions)
  und der aktuelle Supabase-Changelog. Darin steht kein zusaetzlicher
  Scheduler-spezifischer Breaking Change; direkte Aenderungen an `cron.job`
  bleiben unzulaessig, daher verwendet die Migration nur `cron.schedule` und
  `cron.unschedule`.
- Gezielter Schlusslauf: 2 Dateien und 6 Tests, Exit 0. `npm run check`: Exit 0,
  33 Dateien und 470 Tests; TypeScript, Webbuild und Artefaktpruefung bestehen.
  JavaScript: 764.841 Byte roh beziehungsweise 219.089 Byte gzip; gesamtes
  `dist`: 1.111.405 Byte. Deno 2.9.0 prueft beide geaenderten Functions, Exit 0;
  der Modulgraph enthaelt exakt `@supabase/server` 1.5.3 und `supabase-js`
  2.112.4. SQL-Quelltests und Handler-Smokes ersetzen weder Staging-Cron noch
  echte negative Aufrufe gegen die bereitgestellten Functions.

### Welle 2: crash-tolerantes Erinnerungsversandbuch

- Das bisherige reine INSERT-Versandbuch konnte nach einem Function-Abbruch
  dauerhaft haengen bleiben. Eine explizite Zustandsmaschine trennt nun
  `bereit`, `sendet`, `wiederholen`, `gesendet`, `fehlgeschlagen` und
  `unbestaetigt`. Jede Claim-, Start- und Abschlussaenderung wird mit einer
  UUID-Lease gezaeunt und muss genau eine Zeile bestaetigen.
- Nur explizit abgelehnte HTTP-Antworten 408, 425 und 429 duerfen nach fuenf
  Minuten erneut versucht werden, insgesamt hoechstens viermal. Ein
  Netzwerkabbruch, eine geworfene Transportausnahme oder 5xx ist bei einem
  nicht-idempotenten Push-POST fachlich mehrdeutig und bleibt
  `unbestaetigt`, statt eine moegliche zweite Nachricht zu erzeugen. Web Push
  kann dadurch weiterhin keine Ende-zu-Ende-Genau-einmal-Zustellung
  versprechen.
- Bestaetigt mindestens ein Geraet die Providerannahme, bleibt die bestehende
  Pro-Person-Semantik erhalten; Fehler weiterer Geraete erzeugen keinen
  Doppelversand. Tote oder unzulaessige Abos werden nur als entfernt gezaehlt,
  wenn die Datenbank die geloeschten Endpunkte zurueckliefert. Providertexte
  und Endpunkte werden weder im Versandbuch gespeichert noch ausgegeben.
- Alte Zeilen mit `gesendet` werden verlustfrei auf `gesendet` uebernommen.
  Alte Zeilen ohne Bestaetigung sind nicht sicher von einem abgebrochenen
  Versand zu unterscheiden und werden deshalb als `legacy_unbestaetigt`
  archiviert, nie blind erneut gesendet. Der letzte rein lesende Live-Check vor
  der Umsetzung fand neun Zeilen, alle neun bereits mit `gesendet`; dieser
  Zeitpunktbeleg muss vor einem Rollout wiederholt werden.
- Die vier exponierten RPCs laufen als `SECURITY INVOKER` mit leerem Suchpfad;
  EXECUTE ist fuer `public`, `anon` und `authenticated` entzogen und nur fuer
  `service_role` erlaubt. Der Secret-Key-geschuetzte Scheduler ist damit der
  einzige vorgesehene Aufrufer.
- Gezielter Eigenlauf nach dem unabhaengigen Retry-Review: 2 Dateien und 38
  Tests, Exit 0. Deno 2.9.6 prueft beide
  Reminder-Einstiegspunkte. Eine echte PostgreSQL-Ausfuehrung, konkurrierende
  RPC-Transaktionen und ein Staging-Crash zwischen Claim, Start, Provider und
  Abschluss sind weiterhin offen; SQL-Quelltests beweisen diese Eigenschaften
  nicht. Die Migration ist vorbereitet, aber nicht angewandt.
- Alte und neue Writer sind waehrend dieses Vertragswechsels absichtlich nicht
  miteinander kompatibel: Der alte INSERT kennt weder Zustand noch Lease, der
  neue Handler benoetigt die vier RPCs. Deshalb muessen beim spaeteren
  Staging-/Produktionsrollout beide Reminder-Cronjobs zuerst pausiert werden.
  Danach folgen Migration, Deploy beider Functions, negative Auth- und
  Zustands-Smokes und erst dann die Reaktivierung. Eine "Migration oder
  Function zuerst"-Liveausrollung ohne Pause kann Erinnerungen im Zeitfenster
  auslassen und ist nicht freigegeben. Der Rueckweg ist ein Forward-Fix oder
  die zuvor gepruefte Wiederherstellung, nicht der alte Writer auf dem neuen
  Schema.

### Welle 3: gemessene, getippte und gemischte Tracker-Tage

- Ein Tag mit mindestens einer Automationsmessung und mindestens einem
  manuellen Eintrag ist jetzt ausdrücklich `gemischt`, statt insgesamt als
  `gemessen` zu gelten. Rohquellen bleiben unverändert und auditierbar.
- Die Duellformel bleibt unverändert: `gemessen` und `gemischt` sind je ein
  belegter Tag; die Zahl der Rohsitzungen erzeugt keinen Zusatzpunkt. Feed,
  Wochenstand, Tiebreak und Archiv verwenden denselben Belegbegriff.
- Die Hauptzeile zeigt Mess- und Handanteil getrennt und hält auch während des
  Undo-Fensters `+ einheit` erreichbar. Bei gemischter Herkunft entfernt die
  Kopfaktion nur manuelle Einträge und behauptet keine Toggle-Semantik.
- Es gibt keine automatische Verschmelzung oder Löschung. Nur bei einer
  belegten Zeitüberschneidung erscheint eine vorsichtige Warnung; Lesen wird
  nicht unsinnig von Fokusminuten in Seiten umgerechnet.
- Gezielter Kernlauf: 3 Dateien und 67 Tests, Exit 0. Ein unabhängiger Review
  bestätigte Formelparität und fand drei Darstellungs-/Bedienlücken; deren
  Detailkorrekturen stehen im folgenden Accessibility-Paket.

### Welle 3: PWA-Update, Offline-Grenze und getrennte Auslieferung

- Der Service Worker verwendet jetzt den Prompt-Modus. Eine neue Fassung wird
  angezeigt, aber weder automatisch aktiviert noch geladen. Offene Formulare,
  Store-Mutationen und Push-Einstellungen setzen einen gemeinsamen
  Neustartblocker; auch ein zweiter Tab darf einen Entwurf nicht wegReloaden.
- Aktivierung, ausstehender Reload, Offline-Hinweis und Fehler besitzen einen
  sichtbaren, per `aria-live` angekündigten Status. Der feste Hinweis reserviert
  seine gemessene Höhe, damit er keine untere Bedienfläche verdeckt. Verspätete
  Worker-Callbacks nach dem Abbau erzeugen keine neuen Timer.
- Bekannte Offline-Zustände sperren Supabase-Mutationen ausdrücklich. Ohne eine
  kontogebundene, idempotente Outbox wird kein nur optimistisch sichtbarer
  Erfolg versprochen; der lokale Prototyp bleibt davon unabhängig bedienbar.
- Das Manifest erzwingt kein Hochformat mehr. Push-Klickziele bleiben auf
  denselben Origin und den `/vierfelder/`-Scope begrenzt.
- Pages akzeptiert ausschließlich die feste Supabase-Projektidentität und eine
  Publishable-Key-Klasse. Web-, Pages- und Sites-Build sind getrennt; Sites
  baut immer unter `/`, ohne produktive Supabase-Variablen, und prüft Root,
  HTML-Assets, MIME-Typen, PWA-Dateien, Navigation, 404 sowie HEAD gegen den
  generierten Worker. Normale Web-/Pages-Builds laden das Sites-Plugin nicht.
- Gezielter Paketlauf: 6 Dateien und 37 Tests, Exit 0. `npm run build:sites`:
  Exit 0; 568.644 Byte JavaScript roh, 170.215 Byte gzip, 870.433 Byte
  Webartefakt. Der Worker-Smoke bestätigte Root plus fünf HTML-Assets. Ein
  echter Zwei-Build-/Zwei-Tab-Test einer installierten PWA bleibt offen.

### Welle 4: Tastatur, Dialoge und bedarfsweise Kalender

- Die Hauptnavigation verwendet jetzt ein echtes Tabmuster mit roving
  `tabIndex`, Pfeiltasten sowie Home/End und verknüpft Tabs und Tabpanel über
  stabile IDs. Tages- und Notendialoge sperren den Hintergrund, halten den
  Tastaturfokus im Dialog, schließen per Escape und geben den Fokus zurück.
- Raster-, Schlaf- und Detailaktionen erhalten eindeutige zugängliche Namen
  mit Person, vollständigem Datum, Wert und Herkunft. Fehlende manuelle Werte
  werden als fehlend benannt und nicht als null Minuten ausgegeben.
- Tracker- und Schlafkalender berechnen und rendern ihren umfangreichen Inhalt
  erst nach dem Öffnen. Die kompakte Hauptansicht bleibt erhalten; die
  Kalenderdialoge sind mit eindeutigen Überschriften beschrieben.
- Gezielter Paketlauf: 8 Dateien und 20 Tests, Exit 0. Die Browserprüfung fand
  anschließend noch eine konkrete Fokuslücke beim zeitgesteuerten Entfernen
  des Noten-Undo-Buttons; sie wird zusammen mit dem Notenpaket geschlossen.

### Welle 3: kanonischer Realtime-Abgleich und ehrlicher App-Start

- Realtime-Kanäle sind pro Backendinstanz eindeutig. Der Store unterscheidet
  Transportaufbau, Replikationsbereitschaft, laufenden Abgleich und einen
  möglicherweise veralteten Stand. Ereignisse vor dem ersten autoritativen
  Snapshot werden FIFO gepuffert; alte Kanal-Epochen und doppelte Ereignisse
  dürfen den aktuellen Stand nicht mehr zurückdrehen.
- Nach Reconnect, Rückkehr in einen sichtbaren Tab und Browser-Online-Ereignis
  wird gedrosselt vollständig nachgeladen. Mutationen warten den laufenden
  Abgleich ab; ein Fehler verwirft vorhandene Daten nicht als vermeintlich
  leeren Zustand. Ein zweiter Client kann so Deletes über stabile IDs und
  anschließenden Vollabgleich nachvollziehen.
- Authentifizierung und Datenstart besitzen jetzt getrennte Loading- und
  Vollfehlerzustände mit Retry. Ein Session-Lesefehler wird nicht mehr als
  sichere Abmeldung ausgegeben. Bekannte Offline-Zustände blockieren
  Supabase-Schreibaktionen, bis eine kontogebundene idempotente Outbox wirklich
  verfügbar ist.
- Dieser Stand ist mit simulierten Kanalfolgen, Reconnect, veralteten Events,
  Mutationsreihenfolge und Reload geprüft. Zwei echte authentifizierte
  Browser/Geräte und eine reale Netzwerkunterbrechung bleiben offen.

### Welle 2: atomare und bestätigte Notenmutationen

- Der Wechsel des vierten Prüfungsfachs ist als additive `SECURITY INVOKER`-
  RPC vorbereitet. Sie sperrt die Fächer eines Nutzers in stabiler Reihenfolge,
  prüft den erwarteten Ausgangsstand, ist nach verlorener Erfolgsantwort
  idempotent und bestätigt die Ziel-UUID. Ein verzögerter Constraint-Trigger
  schützt auch alte direkte Writer vor einem Zustand ohne oder mit mehreren
  vierten Prüfungsfächern.
- Die Migration stoppt bei widersprüchlichen Bestandsdaten und erzwingt drei
  LK plus genau einen ausgewählten GK, wobei Sport ausgeschlossen ist. Eine
  zusammengesetzte Fremdschlüsselbeziehung verhindert Noten an einem Fach
  eines anderen Nutzers. Grundlage für den Sport-Ausschluss ist die aktuelle
  MSS-Broschüre des Landes Rheinland-Pfalz; die bestehende Punkte- und
  Prognoseformel wurde nicht verändert.
- Noten-Insert und -Delete gelten erst nach kanonischer Zeilenbestätigung als
  erfolgreich. Ein Lösch-Undo schreibt dieselbe UUID und denselben Inhalt
  zurück. Optimistische Fehler rollen nur die betroffene Entität zurück oder
  fordern einen autoritativen Abgleich an, statt eine gesamte Liste über
  neuere Realtime-Änderungen zu kopieren.
- Im lokalen Prototyp umfassen Web Locks je gemeinsamen Fächer- und Noten-
  Schlüssel den gesamten Read-Modify-Write-Zyklus samt Broadcast. Parallele
  Tabs können deshalb nicht mehr beide denselben Ausgangsstand bestätigen oder
  unterschiedliche Notenarrays überschreiben; ein Browser ohne Web Locks
  bricht diese sensiblen Schreibpfade fail-closed ab.
- Der Notendialog lässt die einzige Auswahl nicht vollständig abwählen, bietet
  Sport nicht an und hält den Fokus auch nach Ablauf des sieben Sekunden
  sichtbaren Undo-Fensters im Dialog.
- Die Migration hält bereits vor dem Bestandscheck schreibblockierende
  Tabellensperren bis COMMIT, damit ein alter Client die geprüfte Invariante
  nicht zwischen Vorabcheck und Constraint-Anlage verändern kann. Ein lokales
  Zehn-Sekunden-Lock-Limit lässt den Rollout bei lang blockierenden Alt-
  Transaktionen kontrolliert scheitern, statt unbegrenzt zu warten.
- Gemeinsamer gezielter Lauf für Start, Realtime, Noten, Offline-Sperre und
  Undo: 6 Dateien und 88 Tests, Exit 0; TypeScript Exit 0. Die neue SQL-Datei
  wurde nur statisch geprüft und weder lokal gegen PostgreSQL noch in Staging
  oder Produktion angewandt.

### Welle 2: bestätigte Push- und Erinnerungseinstellungen

- Session-Lesefehler werden bei Push-Probe, Push-Anmeldung und
  Erinnerungseinstellung nicht mehr als Logout oder Erfolg behandelt. Upserts
  müssen Nutzer, Endpoint beziehungsweise minutengenaue Uhrzeit und den
  persistierten Zustand exakt zurückliefern; ein fehlerloser RLS-Nulltreffer
  gilt als unbestätigt.
- Ein bereits vorhandenes Browser-Abo wird für das aktuell angemeldete Konto
  erneut serverseitig abgeglichen. Gehört der Endpoint noch zu einer anderen
  Sitzung oder ist der Ausgang unter RLS unklar, wird das lokale Abo beendet
  und ein sichtbarer, wiederholbarer Fehler geliefert; ein Folgetipp erstellt
  danach kontrolliert ein neues Abo.
- Beim Abmelden wird zuerst die eigene Datenbankzeile gelöscht und bestätigt,
  erst danach das Browser-Abo. Bei Netzfehler oder unklarem Nulltreffer bleibt
  das Browser-Abo für einen Retry erhalten. Weil „bereits serverseitig weg“
  und „unter RLS verborgen“ ohne engere RPC nicht unterscheidbar sind, nennt
  der Fehler als sicheren manuellen Ausstieg die App-/Browser-Einstellungen.
- Gezielter Lauf: 5 Dateien und 41 Tests, Exit 0. Ein echter Push-Browser,
  Providerannahme, Konto-Wechsel und RLS-Test gegen Staging bleiben offen.

## Offene Prüfungen

- physisches iPhone, installierte PWA, Dynamic Type und echte Safe Areas
- zwei echte authentifizierte Browser/Geräte inklusive Realtime-Unterbrechung
- lokaler/staging Supabase-Reset und RLS-/RPC-pgTAP
- Staging-Migration, Backup und Restore-Probe
- zuverlässiger Lighthouse-Lauf
- öffentliche Preview, Push, PR, Merge und Produktion
