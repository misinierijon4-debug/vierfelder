# IDEEN: Kandidaten, keine automatische To-do-Liste

Der Kern bleibt schnelles Eintragen, echte Herkunft und der Vergleich zwischen
genau Erijon und Koray. Eine Idee wird erst gebaut, wenn Nutzen, Datenwahrheit,
Datenschutz, Zustände, Migration, Tests und mobile Bedienung zusammen gelöst
sind.

## Bereits umgesetzt, nicht mehr offen

- Vergangene Wochen sind über den Kalender erreichbar.
- Gewicht wird über Realtime zwischen Clients abgeglichen.
- Der Repository-Stand enthält eine Gewichtserinnerung und eine Erinnerung an
  einen fehlenden Schlafimport.

„Im Repository umgesetzt“ bedeutet bei serverseitigen Erinnerungen nicht
„produktiv aktiv“. Migration, Scheduler-Secret, Function-Deployment und echte
Zustellung brauchen den getrennten Nachweis aus dem
[Release- und Migrationsrunbook](docs/release-und-migrationen.md).

## Sinnvolle nächste Kandidaten

### Sicherer Export und Restore

Ein manueller, versionierter Export kann Gerätewechsel und Backups erleichtern.
Ein nackter JSON-Download reicht dafür nicht. Vor einer Umsetzung braucht es:

- einen klaren Umfang je Datenklasse und Person;
- ausdrückliche Warnung, dass Gewicht, Schlaf, Orte und Noten sensibel sind;
- Schema- und Exportversion;
- Validierung und Vorschau vor jedem Import;
- Duplikat- und Konfliktstrategie mit stabilen IDs;
- keine stillen Überschreibungen oder erfundenen Standardwerte;
- verschlüsselten beziehungsweise bewusst gewählten Speicherort;
- Roundtrip- und Altversions-Tests sowie eine Restore-Probe.

Der lokale Prototyp besitzt derzeit keinen solchen Backupweg. Löschen des
Browserspeichers bleibt dort ohne vorherigen Export endgültig.

### Laufende Automation ehrlich anzeigen

Eine offene Standort- oder Fokussitzung kann „läuft seit …“ zeigen. Sie darf
vor Mindestdauer oder vor einem bestätigten Abgang noch keinen fertigen Tick
und keine fertigen Minuten behaupten. Verwaiste Sitzungen brauchen einen klaren
Fehlerzustand statt stiller Bereinigung.

### Fehlenden Schlafimport verständlicher machen

Neben Push wären Importstatus und Zeitpunkt des letzten erfolgreichen Imports
in der App nützlich. Dabei sind mindestens `noch nicht gelaufen`, `keine
Health-Daten`, `Abruf fehlgeschlagen`, `unvollständig` und `erfolgreich`
auseinanderzuhalten. Rohsegmente und Token-Hashes bleiben unsichtbar.

### Monats- und historische Vergleiche

Eine kompakte Monatsübersicht kann echte Muster zeigen, wenn sie nicht dieselbe
Wochenzahl ein drittes Mal darstellt. Vorher müssen Historien paginiert und mit
mehr als 1.000 Datensätzen getestet sein. Abgeschlossene Wochen lesen ihre
unveränderliche Archivzeile; Legacy-Nachberechnungen bleiben gekennzeichnet.

### Kleine Komfortideen

- Haptisches Feedback auf unterstützten Android-Geräten, immer optional und
  unter Beachtung von Reduced Motion.
- Schnellaktion über einen sicheren, authentifizierten Weg; kein dauerhaftes
  Import-Token in URL, Widget oder Log.
- Zielgewicht nur nach gemeinsamer Produktentscheidung. Es wäre ein Urteil in
  einer sensiblen Datenansicht, nicht bloß eine zusätzliche Linie.

## Neue Benachrichtigungen – umgesetzt am 07.09.2026

- **Lernen:** Montag bis Freitag 18:30, nur ohne heutigen Lerntick und ohne
  laufende Lernsitzung. Nachholfenster endet um 20:00.
- **Lesen:** täglich 20:45, nur ohne heutigen Lesetick und ohne laufende
  Lesesitzung. Nachholfenster endet um 22:00.
- **Wochenendspurt:** Sonntag 18:00, aktueller Vergleich der fünf Felder.
  Ausdrücklich ein Zwischenstand, kein verfrühter Wochenabschluss. Ohne
  Aktivität beider Personen bleibt die Nachricht aus; Nachholfenster bis 19:00.

Die drei Schalter stehen unter „weitere erinnerungen“ und sind unabhängig.
Gezählt werden echte manuelle Einheiten und abgeschlossene gemessene Sitzungen,
jeder Bereich pro Tag höchstens einmal. Laufende Sitzungen werden bis zu zwölf
Stunden berücksichtigt. Versand höchstens einmal je Person, Art und Tag;
keine verspätete Provider-Nachlieferung an offline befindliche Geräte.

Produktionsnachweise und bewusste Grenzen: [Releasebericht](docs/aktivitaets-erinnerungen-release.md).

## Weitere Benachrichtigungskandidaten

Gewicht, Schlafimport sowie die drei oben beschriebenen Meldungen sind gebaut.
Weitere Nachrichten brauchen weiterhin einen konkreten Nutzen und eine eigene
Abschaltmöglichkeit.

Mögliche Kandidaten:

- „2 von 5 heute. was geht noch?“
- „koray hat gym abgehakt. du liegst 2 zurück.“
- „erijon hat dich überholt. 12 zu 11.“
- sonntag 21:00: „woche vorbei: du 28, koray 25.“
- „die wette läuft in 24 stunden ab.“
- „training erkannt: 47 minuten. haken gesetzt.“
- „fokus lernen lief 18 minuten. zwei fehlen zum haken.“

Keine automatische Nachricht behauptet Motivation, Gesundheit oder
Kausalität. Eine Note oder kurze Nacht ist ein Messwert, kein Anlass für
Panik-, Lob- oder Beschämungssprache.

## Regeln für jede neue Nachricht

1. Kein Doppelversand. Ein unklarer Provider-Ausgang wird nicht automatisch
   wiederholt.
2. Standardmäßig nichts nach 22 Uhr; Schlafenszeit-Nachrichten brauchen eine
   eigene, ausdrücklich gewählte Regel.
3. Unmittelbar vor dem Reservieren und Senden wird erneut geprüft, ob der Anlass
   noch besteht.
4. Autor, Zeitpunkt, Datenquelle und Empfänger müssen serverseitig eindeutig
   sein.
5. Jeder Reminder ist einzeln abschaltbar; keine Nachricht setzt einen Tick
   oder verändert Fachlogik.
6. Endpunkte, Tokens, Gesundheitsdaten, Noten und Orte erscheinen nicht in
   Antworten oder Logs.
