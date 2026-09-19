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
Nach Mitternacht eingehende Importe (insbesondere die noch laufende Sonntagnacht)
sind damit nicht Teil dieses Abschlusses. Das ist ein Stichtagsbericht.

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
atomare Reservierung verhindert parallele Modellaufrufe fuer dieselbe Woche.
Fehlversuche haben zwei Minuten Abkuehlzeit; ein gueltiger Text wird dauerhaft
wiederverwendet. Modelltimeout: 45 Sekunden, Clienttimeout: 55 Sekunden. Der
bereits konfigurierte Standardanbieter aus `eniAnbieter.ts` wird verwendet.
Es gibt keine neue Modellwahl und keinen Schluessel im Browser.

ENI erhaelt die archivierten Wochenaktivitaeten, Schlaf-/Gewichtswerte und die
Vorwoche, keine Chats oder persoenlichen Erinnerungen. Er nennt keine eigenen
Ziffern, Diagnosen, Gewichtsziele oder unbelegten Ursachen. Texte muessen das
vollstaendige gemeinsame Schema erfuellen, insbesondere exakt zwei Vorschlaege.
Die Texte werden bei Bedarf beim Oeffnen erzeugt, nicht im Mitternachtsjob.

## Geprueft

- Vitest: Berechnung, Zukunftsdaten, Textschema, Mitgliedschaft, gleiche
  Textwiederverwendung, Reservierung, Fehler, Wochenwechsel, lokales Archiv.
- SQL auf isoliertem PostgreSQL (PGlite) ausgefuehrt: Momentaufnahme bleibt nach
  Rohdatenaenderung gleich; beide Mitglieder lesen dasselbe; Fremdkonto/anon und
  Client-Schreibzugriffe gesperrt; ungueltige Wochen abgewiesen; Nachholen geht.
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
