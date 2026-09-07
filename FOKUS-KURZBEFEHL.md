# Lernen, Lesen und Training per Fokus

„Nicht stören" ist nur einer von beliebig vielen Fokus-Modi. Drei weitere —
**lernen**, **lesen**, **training** — schalten nicht nur die Mitteilungen
stumm, sondern setzen den Wochentick von allein: an heißt Beginn, aus heißt
Ende, und ab 20 Minuten steht der Haken — beim Lesen ab 10.

Das ist dieselbe Mechanik wie bei den Trainingsorten
([TRAINING-STANDORT.md](TRAINING-STANDORT.md)), nur ohne Ort. Der Fokus
schreibt in dieselbe Tabelle, über dieselbe Datenbankfunktion, mit demselben
Token. Was dazukommt, ist ein einziger Aufruf-Link — damit ein Kurzbefehl aus
einer Zeile besteht statt aus einem Formular.

## Warum ein Fokus ein Beleg ist und ein Tick nicht

Ein Tick ist eine Behauptung von abends. Ein Fokus ist eine Handlung von
vorher: man schaltet ihn ein, bevor man anfängt, er läuft eine messbare Zeit,
und man schaltet ihn aus, wenn man fertig ist. Belegt ist damit nicht, dass
gelernt wurde — belegt ist, dass eine Stunde lang alles andere stumm war.

Genau so viel belegt der Standort beim Gym auch: Anwesenheit, nicht
Anstrengung. Der Unterschied zum Tick ist nicht Wahrheit gegen Lüge, sondern
**vorher gegen nachher**. Wer sich abends einen Lerntag erfindet, tippt einmal;
wer ihn sich mit dem Fokus erfindet, muss ihn 20 Minuten lang aussitzen — mit
stummen Mitteilungen.

Der beste Teil daran: der Fokus ist nicht für den Tracker da. Er ist für die
Ruhe da. Der Tracker fährt nur mit.

## Einmalig in Supabase

Der historische Betriebsstand vermerkt Migration `20260831210000_fokus.sql`
und eine frühe Function-Fassung am 31.08.2026. Der aktuelle Branch enthält
zusätzliche Sicherheitsänderungen; daraus folgt nicht, dass genau diese
Fassung bereits produktiv läuft. Migration und Function werden nur über das
[Release- und Migrationsrunbook](docs/release-und-migrationen.md) in einer
konkret benannten Umgebung geprüft und veröffentlicht.

Die Migration erlaubt der Tabelle `aufenthalte` alle vier Bereiche statt nur
`gym` und `boxen`. Die Function `fokus` macht aus dem Melden einen einzigen
Link — dazu gleich mehr.

Ein neues Token braucht es nicht. Es gilt dasselbe persönliche Import-Token wie
beim Schlaf und beim Standort (siehe [SCHLAF-KURZBEFEHL.md](SCHLAF-KURZBEFEHL.md),
Abschnitt „Einmalig in Supabase einrichten").

## Die drei Fokus-Modi anlegen

**Einstellungen → Fokus → + → Eigener Fokus.** Drei Stück, die Namen sind frei;
in dieser Anleitung heißen sie `lernen`, `lesen` und `training`.

Was der Fokus stummschaltet, entscheidet jeder selbst — das ist sein
eigentlicher Zweck und für den Tracker gleichgültig. Nur eines gehört nicht
dazu: **kein Zeitplan.** Ein Fokus, der sich montags um 18 Uhr von selbst
einschaltet, setzt einen Tick für einen Abend, an dem niemand gelernt hat. Der
Fokus muss von Hand kommen, sonst misst er sich selbst.

## Die sechs Kurzbefehle: POST und Token im Header

Ein fertiger Kurzbefehl lässt sich nicht weitergeben — iOS nimmt nur Dateien
an, die Apple signiert hat, und signieren kann nur ein Apple-Gerät. Also ist
der Kurzbefehl stattdessen so klein, dass beim Nachbauen nichts schiefgehen
kann:

1. In **Kurzbefehle** einen neuen anlegen, Name `lernen an`.
2. Genau eine Aktion: **Inhalte von URL abrufen**.
3. Die URL aus der Tabelle einsetzen.
4. Methode `POST` wählen, keinen Haupttext anlegen.
5. Einen Header `x-import-token` mit dem persönlichen Import-Token hinzufügen.

Damit steht das Token nicht in URL, Browserhistorie oder gewöhnlichen
Request-Logs. Der Header bleibt trotzdem ein Geheimnis: keine Screenshots und
keinen fertigen Kurzbefehl weitergeben.

| Kurzbefehl | URL |
|---|---|
| lernen an | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?b=lernen&e=an` |
| lernen aus | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?b=lernen&e=aus` |
| lesen an | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?b=lesen&e=an` |
| lesen aus | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?b=lesen&e=aus` |
| training an | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?b=boxen&e=an` |
| training aus | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?b=boxen&e=aus` |

`b` ist der Bereich, `e` das Ereignis (`an` oder `aus`). Ein
`o=...` für den Namen der Quelle ist möglich, aber nicht nötig: ohne Angabe
heißt sie `fokus lernen`, `fokus lesen`, `fokus boxen`.

**Warum `training` auf `boxen` zeigt:** die beiden Gyms haken sich schon per
Standort ab. Was dort fehlt, ist das Training ohne Adresse — Boxen zuhause,
Laufen, Hof. Wer stattdessen ein Gym ohne Standort-Automation hat, ändert in
den zwei URLs `b=boxen` auf `b=gym`. Ein Buchstabe, keine Migration.

**Das heutige Import-Token ist noch nicht auf Fokus begrenzt.** Es legitimiert
auch Schlafimport, Kurzbefehl-Diagnose und Gewichtsimport. Wer es kennt, kann in
diesen Bereichen Daten für die gebundene Person schreiben; lesen oder löschen
kann er darüber nicht. Getrennte, widerrufbare Zweck- und Gerätetokens bleiben
eine offene Sicherheitsmigration. Eine spätere Rotation ist ein produktiver,
freigabepflichtiger Schritt und darf erst erfolgen, wenn beide iPhones auf dem
neuen Weg geprüft sind.

Eine Zeitangabe wird nicht mitgeschickt: es gilt der Moment des Aufrufs, und
das ist genau der Moment, in dem der Fokus umschaltet.

## Die sechs Automationen

Je eine pro Kurzbefehl:

1. In **Kurzbefehle** unten auf **Automation**.
2. **Neue Automation** → in der Liste **Fokus** wählen.
3. Den Fokus auswählen (`lernen`) und **Wird aktiviert** ankreuzen — für den
   Gegenstück-Kurzbefehl **Wird deaktiviert**.
4. **Sofort ausführen** wählen und **Bei Ausführung benachrichtigen**
   ausschalten.
5. Als Aktion **Kurzbefehl ausführen** und den passenden Kurzbefehl wählen.

Zwei Automationen je Fokus, also sechs. Danach nie wieder.

## Testen

Den Kurzbefehl `lernen an` von Hand ausführen. Die Antwort muss `"ok": true`
und `"neu": true` enthalten. Dann `lernen aus` ausführen: die Antwort enthält
zusätzlich `dauer_minuten`. Ein Safari-Aufruf der URL ist kein gleichwertiger
Test, weil dabei Methode und Token-Header fehlen. In Supabase lesend prüfen:

```sql
select p.person, a.bereich, a.ort,
       to_char(a.ankunft at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') as beginn,
       round(extract(epoch from (a.abgang - a.ankunft)) / 60) as minuten
from aufenthalte a
join profile p on p.id = a.user_id
order by a.ankunft desc;
```

Ein Testlauf von einer Minute steht in der Tabelle, setzt aber keinen Tick — er
liegt unter der Schwelle (20 Minuten, beim Lesen 10). Testdaten werden nur in
einer entbehrlichen Staging-Umgebung und anhand vorher notierter IDs entfernt;
eine pauschale Löschung kurzer Produktivaufenthalte ist nicht Teil des Tests.

`import-token fehlt oder hat eine ungültige länge` weist auf einen fehlenden
oder falsch kopierten Header; `import-token ist ungültig` auf ein nicht zur
Datenbank passendes Token. Bei `b muss lernen, gym, boxen, lesen sein` stimmt
die URL nicht; `fokus-eingabe ist ungültig` kann zusätzlich auf einen älteren,
nicht passenden RPC-Vertrag hinweisen. `kein passender offener fokus vorhanden`
beim Ausschalten bedeutet, dass kein bestätigter Beginn gefunden wurde. Kommt
gar nichts oder ein 404, stimmen Function-Deployment oder Projekt-URL nicht.
Ein `401 Invalid JWT` weist auf eine nicht zum dokumentierten Importvertrag
passende Gateway-Konfiguration hin. Das wird im Staging-Schritt des
Release-Runbooks eingegrenzt, nicht durch einen spontanen Produktionsdeploy.

## Was von allein passiert, und was nicht

- **Unter 20 Minuten** zählt nicht, beim Lesen unter 10. Ein Fokus, der
  versehentlich an- und ausging, ist kein Lerntag. Lesen hat die kürzere
  Schwelle, weil ein Kapitel kürzer ist als eine Trainingseinheit — und weil
  man am Gym versehentlich vorbeifährt, den Fokus lesen aber nicht
  versehentlich einschaltet.
- **Zweimal am Tag** bleibt ein Tick, steht in der Tagesansicht aber als zwei
  Einheiten mit eigener Uhrzeit.
- **Über Mitternacht**: die Sitzung zählt zu dem Tag, an dem sie begann.
- **Fokus vergessen auszuschalten**: die offene Sitzung wird nach zwölf Stunden
  vom nächsten Einschalten weggeräumt. An dem Tag gibt es dann keinen
  gemessenen Tick — antippen geht weiter, es sieht nur anders aus.
- **Fokus und Standort gleichzeitig** (Fokus `training` im Gym, während die
  Standort-Automation läuft) ergibt keine zwei Einheiten: überschneiden sich
  zwei Sitzungen desselben Bereichs, zählt die längere.
- **Ein Fokus, der von einem Zeitplan kommt**, setzt trotzdem einen Tick. Die
  Datenbank kann nicht sehen, wer den Schalter umgelegt hat. Deshalb steht oben:
  keine Zeitpläne auf diesen drei.

## Beim Lesen zählen weiter die Seiten

Lesen wird in Seiten gezählt, gemessen hat der Fokus aber Minuten. Beides steht
nebeneinander und wird nicht vermischt: der Tick kommt aus der Messung, die
Zeile zeigt `24 seiten · 35 min · gemessen`, und die Schritte für die Seiten
bleiben antippbar. Eine Summe aus Minuten und Seiten wäre eine Zahl, die nichts
bedeutet.

## Was der Beleg nicht ist

Er beweist eine stumme Stunde, nicht einen gelernten Satz. Wer den Fokus
einschaltet und Netflix schaut, bekommt seinen Haken — genau wie der, der sein
Handy im Gym liegen lässt. Technik kann Lügen teuer machen, nicht unmöglich.
20 Minuten Fokus kosten ungefähr so viel wie 20 Minuten lernen; der Unterschied
ist, dass man in der Zeit auch hätte lernen können.

## Übergang von alten GET-URLs

Alte Kurzbefehle mit `?t=TOKEN` sind nur ein abwärtskompatibler Altweg und
antworten mit `"veraltet": true`. Jeder dieser Kurzbefehle wird einzeln auf den
oben beschriebenen POST-Header umgestellt und manuell geprüft. Erst wenn alle
sechs Kurzbefehle auf beiden iPhones erfolgreich über POST gelaufen sind, darf
das gemeinsame Token im kontrollierten Release rotiert werden. GET wird erst
in einem späteren, separat geprüften Release abgeschaltet. Der direkte RPC-Weg
aus älteren Fassungen bleibt technisch kompatibel, ist aber für einen Neubau
nicht der empfohlene Fokuspfad.
