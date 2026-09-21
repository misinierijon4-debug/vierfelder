# Wochenbericht: Abschluss und Freigabe

Der Bericht in Tracker- und Schlafkalender zeigt beide Personen gleichberechtigt.
Die Diagramme rechnen deterministisch mit `wochenbericht.ts`; ENI schreibt einen
qualitativen Kommentar ohne eigene Punktesummen. Die laufende Woche bleibt ein
Stand. Zukunftseintraege zaehlen nicht vorzeitig.

## Archivvertrag

`wochenberichte` enthaelt je Montag genau einen gemeinsamen Datenstand mit der
Berichtswoche und ihrer Vorwoche. Der Datenbankjob sichert montags um 00:00 Uhr
Europe/Berlin. Zwei UTC-Termine und die lokale Stundenpruefung beruecksichtigen
Sommer-/Winterzeit. Spaetere Rohdatenkorrekturen aendern das Archiv nicht.

### Die letzte Nacht darf nachlaufen

Genau eine Ausnahme von der Unveraenderlichkeit, und sie ist begruendet: Die
Sonntagnacht endet erst am Montagmorgen, und der Health-Import kommt Stunden
nach Mitternacht (gemessen zwischen 06:50 und 15:20 Uhr). Ein um 00:00 Uhr
eingefrorener Bericht zeigte deshalb systematisch eine Nacht zu wenig.

`private.wochenbericht_nachtrag()` laeuft am Berliner Montag alle 15 Minuten
und **ergaenzt ausschliesslich fehlende** Naechte; eine bereits gesicherte
Nacht wird nie ersetzt. Der Bericht gilt als abgeschlossen, sobald beide
Personen ihre Sonntagnacht haben — spaetestens um 20:00 Uhr. Dann traegt
`naechte_vollstaendig` einen Zeitpunkt. Ohne diese Schranke haette ein Geraet,
das nie importiert, den Bericht fuer immer offen gehalten.

Die Zahlen der vier Felder, Gewicht und Duell bleiben davon unberuehrt: sie
stehen um Mitternacht fest. Nur Schlaf laeuft nach, weil nur Schlaf spaeter
entsteht als der Tag, zu dem er gehoert.

### Die Meldung am Montag

Sobald `naechte_vollstaendig` gesetzt ist, wird die Push-Art `wochenbericht`
faellig — montags zwischen 07:00 und 21:00 Uhr Berliner Zeit, je Person und
Woche genau einmal (Primaerschluessel von `aktivitaets_versand`, `tag` ist der
Berichtsmontag). Sie zeigt auf `./#/bericht?woche=<montag>`; die App schlaegt
das Blatt auf und raeumt den Hash sofort wieder ab, damit er nicht auf einer
Woche stehen bleibt, die man inzwischen weitergeblaettert hat. Abschalten geht
unter Benachrichtigungen (`wochenbericht_aktiv`).

Noch nicht archivierte alte Wochen werden beim ersten Aufruf serverseitig
nachgeholt und sichtbar als „nachtraeglich gesichert“ bezeichnet. Sie behaupten
keinen historischen Montagsstand. Im Prototyp erfolgt die Sicherung beim ersten
Oeffnen nach Wochenabschluss lokal im Browser, erst bei vollstaendig geladenen
Daten; die Anzeige sagt „auf diesem geraet gesichert“.

Der Kalenderrand bleibt ein Einstieg auf Basis des aktuellen Rohdatenstands.
Das geoeffnete Blatt zeigt den archivierten Stand, sobald dieser geladen ist.
Wenn das Archiv nicht erreichbar ist, werden die Zahlen ausdruecklich als
aktueller Datenstand gekennzeichnet, nicht als eingefroren.

## ENI und Zugriffsrechte

Die Function `wochenbericht` prueft JWT und Profilmitgliedschaft, bevor sie mit
Dienstrechten liest. Clients duerfen Archive nur lesen. Die Nachholen-RPC ist
nur fuer `service_role` freigegeben; interne Funktionen liegen in `private`.

Ein Aufruf laedt das Archiv, ein zweiter erzeugt bei Bedarf den Kommentar. Eine
atomare Reservierung (`public.reserviere_wochenbericht_text`) verhindert
parallele Modellaufrufe fuer dieselbe Woche **und dieselbe Person**.
Fehlversuche haben zwei Minuten Abkuehlzeit; ein gueltiger Text wird dauerhaft
wiederverwendet. Modelltimeout: 45 Sekunden, Clienttimeout: 55 Sekunden. Der
bereits konfigurierte Standardanbieter aus `eniAnbieter.ts` wird verwendet.
Es gibt keine neue Modellwahl und keinen Schluessel im Browser.

### Der Text ist persoenlich

Die Zahlen zeigen beide Personen nebeneinander — darum geht das Duell. ENIs
Rueckblick tut das nicht: Er spricht **eine** Person mit „du“ an und sieht auch
nur deren Woche. `fasseBerichtWocheZusammen(daten, person)` filtert die
Zusammenfassung vor dem Modellaufruf; der Name der anderen Person erreicht den
Prompt nicht.

Die Texte liegen deshalb nicht mehr in `wochenberichte.texte`, sondern in
`public.wochenbericht_texte (woche, person)`. Die Tabelle hat RLS an und
**keine** Policy und kein Client-Grant: Ein Browser kommt gar nicht heran. Die
Edge Function bestimmt die Person aus dem JWT und gibt ausschliesslich deren
Zeile heraus. Zwei Personen, zwei Texte, zwei Modellaufrufe — die gemeinsame
Datengrundlage bleibt dieselbe Momentaufnahme.

ENI erhaelt die archivierten Wochenaktivitaeten, Schlaf-/Gewichtswerte und die
Vorwoche der eigenen Person, keine Chats oder persoenlichen Erinnerungen. Er
nennt keine eigenen Ziffern, Diagnosen, Gewichtsziele oder unbelegten Ursachen.
Texte muessen das vollstaendige gemeinsame Schema erfuellen, insbesondere exakt
zwei Vorschlaege. Die Texte werden bei Bedarf beim Oeffnen erzeugt, nicht im
Mitternachtsjob.

## Geprueft

- Vitest: Berechnung, Zukunftsdaten, Textschema, Mitgliedschaft, gleiche
  Textwiederverwendung, Reservierung, Fehler, Wochenwechsel, lokales Archiv.
- SQL auf isoliertem PostgreSQL (PGlite) ausgefuehrt: Momentaufnahme bleibt nach
  Rohdatenaenderung gleich; beide Mitglieder lesen dasselbe; Fremdkonto/anon und
  Client-Schreibzugriffe gesperrt; ungueltige Wochen abgewiesen; Nachholen geht.
  Dazu der Nachtrag: eine spaet importierte Nacht kommt hinzu, eine vorhandene
  wird nicht ersetzt, die 20-Uhr-Schranke greift, ein Dienstag tut nichts; die
  Montagsmeldung haengt am Archivzustand und schweigt nachts und abgeschaltet;
  Texte je Person reservieren getrennt und sind fuer Clients gesperrt.
  `node scripts/check-wochenbericht-archiv.mjs <pglite/dist/index.js>`
  Die Probe bildet die benoetigten Quellspalten ab; sie ersetzt keinen
  Migrationstest gegen ein vollstaendiges Staging-Schema. pg_cron ist gestubbt.
- Mobile Browserprobe im Prototyp bei 390 x 844.

## Produktionsfreigabe erfolgt (19.09.2026)

Gemäß `release-und-migrationen.md` nach ausdrücklicher Freigabe durchgeführt:

1. Migration `20260919154400_wochenbericht_archiv.sql` einzeln über `apply_migration`
   als produktive Version `20260919160732_wochenbericht_archiv` angewandt. RLS aktiv,
   Cronjob `wochenbericht-montag` aktiv, Security Advisors ohne Befund.
2. Function `wochenbericht` mit JWT-Prüfung (`verify_jwt: true`, Version 1) deployed.
   Unautorisierte Aufrufe werden mit HTTP 401 abgewiesen.
3. Nach Merge auf `main` wird das Frontend über GitHub Pages veröffentlicht.
   Danach mit beiden Konten dieselbe Woche
   oeffnen, Archiv-/Textgleichheit pruefen, Scheduler und RLS-Advisors kontrollieren.
4. Ersten echten Montagslauf und einen echten Modellaufruf bestaetigen.

## Noch nicht freigegeben (21.09.2026)

`20260921180000_wochenbericht_nachtrag_push_und_persoenliche_texte.sql` ist
geschrieben und in PGlite ausgefuehrt, aber **nicht** angewandt. Reihenfolge
nach `release-und-migrationen.md`, erst nach ausdruecklicher Freigabe:

1. Migration einzeln ueber `apply_migration` anwenden. Danach pruefen:
   `wochenberichte.naechte_vollstaendig` gefuellt, Cronjob
   `wochenbericht-nachtrag` aktiv, `wochenbericht_texte` mit RLS und ohne
   Client-Grant, Security Advisors ohne neuen Befund.
   Die Migration traegt dabei die fehlende Sonntagnacht der Woche vom
   14.09. nach; sie war der Anlass.
2. Function `wochenbericht` neu deployen (`verify_jwt: true`). Vorher nicht:
   die alte Version schreibt noch nach `wochenberichte.texte`.
3. Nach Merge auf `main` das Frontend veroeffentlichen. Dann mit beiden Konten
   dieselbe Woche oeffnen: gleiche Zahlen, **verschiedene** ENI-Texte.
4. Ersten echten Montagslauf bestaetigen: Nacht im Bericht, Meldung auf dem
   Handy, Tippen oeffnet das richtige Blatt.

Die alte Spalte `wochenberichte.texte` bleibt stehen und wird nicht mehr
gelesen. Sie zu loeschen ist eine eigene spaetere Migration, kein Teil davon.
