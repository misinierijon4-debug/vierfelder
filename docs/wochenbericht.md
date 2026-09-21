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

Der Wortlaut ist **„dein wochenbericht für letzte woche ist fertig."** — sonst
nichts. Die erste Fassung haengte „— mit der letzten nacht" an; das war beim
ersten Lauf eine Antwort auf eine frische Beschwerde und als Dauertext eine
Mechanikerklaerung, die sich jeden Montag wiederholt. Nachgetragen wird die
Nacht weiterhin, die Meldung schweigt nur darueber.

Noch nicht archivierte alte Wochen werden beim ersten Aufruf serverseitig
nachgeholt und sichtbar als „nachtraeglich gesichert“ bezeichnet. Sie behaupten
keinen historischen Montagsstand. Im Prototyp erfolgt die Sicherung beim ersten
Oeffnen nach Wochenabschluss lokal im Browser, erst bei vollstaendig geladenen
Daten; die Anzeige sagt „auf diesem geraet gesichert“.

Der Kalenderrand bleibt ein Einstieg auf Basis des aktuellen Rohdatenstands.
Das geoeffnete Blatt zeigt den archivierten Stand, sobald dieser geladen ist —
vorher **kein** Ergebnis, nur einen Platzhalter (`wartetAufArchiv`). Die erste
Fassung rechnete waehrenddessen aus den Rohdaten und nannte gross einen
Sieger, der zwei Sekunden spaeter ein anderer war. Eine kurze Luecke ist
ehrlicher als ein widerrufenes Ergebnis. Wenn das Archiv nicht erreichbar ist,
werden die Zahlen ausdruecklich als aktueller Datenstand gekennzeichnet, nicht
als eingefroren — dann sind sie das Einzige, was es gibt.

### Was um Mitternacht noch laeuft, fehlt im Archiv

Ein Aufenthalt ohne `abgang` hat keine Dauer und zaehlt darum nicht
(`zaehlt` in `src/lib/training.ts`). Eine Sitzung gehoert aber zu dem Tag, an
dem sie begann. Wer sonntags um 23:45 startet und um 00:20 aufhoert, hat den
Tick in der App — im Montagsstand nicht, weil der um 00:00 einen noch offenen
Aufenthalt fotografiert.

In der Nacht auf den 21.09.2026 hat genau das einen Boxpunkt gekostet:
`fokus boxen` von 23:45:58 bis 00:20:49, live 11:12, im Archiv 11:11. Der
Nachtrag ergaenzt nur Naechte, keine Aufenthalte — die Abweichung bleibt also
stehen. Sie ist bekannt und in Kauf genommen; behoben ist nur die Anzeige.

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

## Produktionsfreigabe erfolgt (21.09.2026)

Gemaess `release-und-migrationen.md` nach ausdruecklicher Freigabe durchgefuehrt:

| Datei | produktive Version |
|---|---|
| `20260921180000_wochenbericht_nachtrag_push_und_persoenliche_texte.sql` | `20260921164009_wochenbericht_nachtrag_push_und_persoenliche_texte` |

**Auch hier stimmen die Versionsnummern nicht ueberein, die Namen schon.** Der
Versatz in `release-und-migrationen.md` waechst um eine Zeile; die Sperre gegen
`db push` gilt unveraendert weiter.

Vor der Anwendung gelesen und bestaetigt: `wochenbericht_texte` gab es noch
nicht, `naechte_vollstaendig` und `wochenbericht_aktiv` fehlten, der Cronjob
`wochenbericht-nachtrag` existierte nicht, und `public.aktivitaets_kandidaten`
hatte genau die Signatur und Rueckgabeform, die `create or replace` braucht.

Nach der Anwendung: Die Woche vom 14.09. hat 24 statt 22 Naechte — beide
Sonntagnaechte sind nachgetragen, und genau die hatten gefehlt. Beide Wochen
tragen `naechte_vollstaendig`. Der Cronjob laeuft. Der Sicherheitsbericht
meldet nur `rls_enabled_no_policy` fuer `wochenbericht_texte`, Stufe INFO —
das ist die Absicht: RLS an, keine Policy, kein Client-Grant, also kommt
niemand ausser `service_role` heran. Dieselbe Rollenverteilung wie bei
`aktivitaets_versand` und `erinnerungs_versand`. `reserviere_wochenbericht_text`
taucht in keiner Definer-Warnung auf, weil `anon` und `authenticated` kein
Execute haben. Keine neue WARN- oder ERROR-Meldung.

Deployt: `wochenbericht` Version 5 (`verify_jwt: true`).

### Der Worker musste mit (derselbe Lauf)

Der erste Versandlauf um 18:40 hat die Meldung fuer beide **uebersprungen**.
Grund war nicht diese Migration: `aktivitaets-erinnerung` lief produktiv noch
in der Fassung von vor `wochen_partner_erinnerungen` (20260913). Die Migration
war angewandt, die Function nie neu deployt. Diese alte Fassung kennt weder
`sendetag` noch die Arten `partner`, `wochenrueckblick`, `wochenbericht`; ihre
letzte Schranke lautete schlicht `ort.tag !== k.tag`. Fuer jede Wochenart ist
`tag` der Montag und `ort.tag` der Sendetag — das ist nie gleich.

Damit war auch die Sonntagseinladung „Willst du, dass Eni deine Woche
zusammenfasst?" seit ihrem Release **nie zugestellt**: `aktivitaets_versand`
hatte zur Art `wochenrueckblick` null Zeilen. `partner` kam nur durch, weil
dessen `tag` zufaellig der Sendetag ist, und dann mit `url: './'` statt dem
Wochenlink, weil die alte Fassung die Adresse gar nicht ausliest.

`aktivitaets-erinnerung` wurde deshalb auf den Repo-Stand gebracht (Version 9,
`verify_jwt: false`, Autorisierung weiterhin ueber `x-erinnerungs-secret`). Das
repariert die Montagsmeldung, die Sonntagseinladung, die Deep Links und den
Aufruf von `sichere_faellige_eni_wochen_einladungen`.

Die beiden `uebersprungen`-Zeilen vom 18:40-Lauf wurden geloescht, damit die
Meldung am selben Montag noch faellig werden konnte. Das ist unbedenklich und
bleibt die Ausnahme: `uebersprungen` wird ausschliesslich auf Pfaden gesetzt,
die **vor** jedem Provideraufruf abbrechen. Eine Zeile in `gesendet` oder
`unbestaetigt` darf nie geloescht werden — dort kann eine Nachricht
herausgegangen sein.

**Merksatz fuer den naechsten Release:** Eine neue Push-Art ist nie nur eine
Migration. `aktivitaets_kandidaten` liefert sie, aber `istNochImFenster` im
Worker muss sie kennen, sonst wird jede Meldung still uebersprungen.

## Nachtrag am selben Abend: der Wortlaut (21.09.2026)

Der Zusatz „— mit der letzten nacht" sollte nicht jede Woche wiederkommen. Er
war die Antwort auf eine frische Beschwerde, nicht der Dauertext. Angewandt
nach ausdruecklicher Freigabe:

| Datei | produktive Version |
|---|---|
| `20260921193000_wochenbericht_meldung_ohne_nachtzusatz.sql` | `20260921170717_wochenbericht_meldung_ohne_nachtzusatz` |

Geaendert ist **genau eine Zeichenkette**; ein Vitest vergleicht die neue
Funktion Zeile fuer Zeile mit der Vorgaengerfassung und laesst nur diesen einen
Unterschied durch. Die PGlite-Probe zeigt vorher den Zusatz, nachher den kurzen
Satz, bei unveraendertem Fenster, unveraenderter Archivbindung und unveraenderten
uebrigen Erinnerungen. Produktiv geprueft: beide Konten bekommen
„dein wochenbericht für letzte woche ist fertig." Die Zeilen vom 21.09. stehen
bereits auf `gesendet`, heute geht also nichts ein zweites Mal raus.

### Veroeffentlicht und einmal echt durchgelaufen

Pull Request #49 ist auf `main`, Pages hat um 18:56 Uhr gebaut. Der ganze Weg
ist damit am selben Abend einmal echt gelaufen: 18:50 Meldung an beide Konten,
18:51 Bericht geoeffnet und ENIs persoenlicher Text erzeugt
(„Deine Woche im Rückblick", `deepseek-flash`), 18:56 neue App-Fassung live.
In `wochenbericht_texte` stand danach genau eine Zeile — die des Kontos, das
geoeffnet hatte. Die Trennung je Person greift also im Betrieb.

Offen bleibt nur die Gegenprobe mit dem zweiten Konto: gleiche Zahlen,
**verschiedener** ENI-Text.

Die alte Spalte `wochenberichte.texte` bleibt stehen und wird nicht mehr
gelesen. Sie zu loeschen ist eine eigene spaetere Migration, kein Teil davon.
