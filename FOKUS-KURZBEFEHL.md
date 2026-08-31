# Lernen, Lesen und Training per Fokus

„Nicht stören" ist nur einer von beliebig vielen Fokus-Modi. Drei weitere —
**lernen**, **lesen**, **training** — schalten nicht nur die Mitteilungen
stumm, sondern setzen den Wochentick von allein: an heißt Beginn, aus heißt
Ende, und ab 20 Minuten steht der Haken.

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

Zwei Dinge, beides einmal:

```powershell
npx supabase link --project-ref ogxwazageufvalkocywh
npx supabase db push
npx supabase functions deploy fokus
```

Die Migration `20260831210000_fokus.sql` erlaubt der Tabelle `aufenthalte` alle
vier Bereiche statt nur `gym` und `boxen`. Die Function `fokus` macht aus dem
Melden einen einzigen Link — dazu gleich mehr.

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

## Die sechs Kurzbefehle: eine Aktion, eine URL

Ein fertiger Kurzbefehl lässt sich nicht weitergeben — iOS nimmt nur Dateien
an, die Apple signiert hat, und signieren kann nur ein Apple-Gerät. Also ist
der Kurzbefehl stattdessen so klein, dass beim Nachbauen nichts schiefgehen
kann:

1. In **Kurzbefehle** einen neuen anlegen, Name `lernen an`.
2. Genau eine Aktion: **Inhalte von URL abrufen**.
3. Die URL aus der Tabelle einsetzen, `DEIN-TOKEN` durch das eigene ersetzen.

Das war alles. Keine Methode umstellen, keine Header, keine JSON-Felder — und
damit auch nicht die Falle, dass iOS ein Feld als Boolean anlegt und statt des
Tokens ein `true` schickt.

| Kurzbefehl | URL |
|---|---|
| lernen an | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?t=DEIN-TOKEN&b=lernen&e=an` |
| lernen aus | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?t=DEIN-TOKEN&b=lernen&e=aus` |
| lesen an | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?t=DEIN-TOKEN&b=lesen&e=an` |
| lesen aus | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?t=DEIN-TOKEN&b=lesen&e=aus` |
| training an | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?t=DEIN-TOKEN&b=boxen&e=an` |
| training aus | `https://ogxwazageufvalkocywh.functions.supabase.co/fokus?t=DEIN-TOKEN&b=boxen&e=aus` |

`b` ist der Bereich, `e` das Ereignis (`an` oder `aus`), `t` das Token. Ein
`o=...` für den Namen der Quelle ist möglich, aber nicht nötig: ohne Angabe
heißt sie `fokus lernen`, `fokus lesen`, `fokus boxen`.

**Warum `training` auf `boxen` zeigt:** die beiden Gyms haken sich schon per
Standort ab. Was dort fehlt, ist das Training ohne Adresse — Boxen zuhause,
Laufen, Hof. Wer stattdessen ein Gym ohne Standort-Automation hat, ändert in
den zwei URLs `b=boxen` auf `b=gym`. Ein Buchstabe, keine Migration.

**Das Token steht in der URL.** Behandle die sechs Kurzbefehle wie ein
Passwort: keine Screenshots, nicht weiterschicken. Wer die URL hat, kann
Sitzungen für dich eintragen — mehr nicht, lesen oder löschen kann er nichts.
In den Function-Logs von Supabase taucht die aufgerufene Adresse auf; das ist
der Preis dafür, dass ein Kurzbefehl aus einer einzigen Zeile besteht. Wem das
zu viel ist, nimmt die Variante ganz unten.

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

Die URL von `lernen an` in Safari öffnen — das ist derselbe Aufruf, den der
Kurzbefehl macht. Die Antwort muss `"ok": true` und `"neu": true` enthalten.
Dann die von `lernen aus`: die Antwort enthält zusätzlich `dauer_minuten`.
In Supabase nachsehen:

```sql
select p.person, a.bereich, a.ort,
       to_char(a.ankunft at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') as beginn,
       round(extract(epoch from (a.abgang - a.ankunft)) / 60) as minuten
from aufenthalte a
join profile p on p.id = a.user_id
order by a.ankunft desc;
```

Ein Testlauf von einer Minute steht in der Tabelle, setzt aber keinen Tick — er
liegt unter der Schwelle. Wegräumen:

```sql
delete from aufenthalte where abgang - ankunft < interval '5 minutes';
```

Kommt `kein gueltiges import-token`, stimmt `t` nicht. Kommt `p_bereich muss
lernen, gym, boxen oder lesen sein`, ist die Migration noch nicht eingespielt.
Kommt gar nichts oder ein 404, fehlt `npx supabase functions deploy fokus`.

## Was von allein passiert, und was nicht

- **Unter 20 Minuten** zählt nicht. Ein Fokus, der versehentlich an- und
  ausging, ist kein Lerntag.
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

## Anhang: dieselbe Sache ohne Edge Function

Wer das Token nicht in der URL haben will, baut die Kurzbefehle wie die
Standort-Kurzbefehle in [TRAINING-STANDORT.md](TRAINING-STANDORT.md): **Inhalte
von URL abrufen** auf
`https://ogxwazageufvalkocywh.supabase.co/rest/v1/rpc/record_aufenthalt`,
Methode `POST`, Header `Content-Type: application/json` und `apikey` mit dem
Publishable Key, Haupttext `JSON` mit vier Feldern — **alle vom Typ Text**:

| Kurzbefehl | `p_token` | `p_bereich` | `p_ereignis` | `p_ort` |
|---|---|---|---|---|
| lernen an | Token | `lernen` | `an` | `fokus lernen` |
| lernen aus | Token | `lernen` | `aus` | `fokus lernen` |
| lesen an | Token | `lesen` | `an` | `fokus lesen` |
| lesen aus | Token | `lesen` | `aus` | `fokus lesen` |
| training an | Token | `boxen` | `an` | `fokus boxen` |
| training aus | Token | `boxen` | `aus` | `fokus boxen` |

Es ist dieselbe Datenbankfunktion und dasselbe Ergebnis — nur sechsmal sechs
Felder statt sechsmal einer Zeile. `p_ort` steht hier genauso, wie die Function
ihn ohne `o=` bildet; nur wenn Ein- und Ausschalten denselben Namen schreiben,
findet der Abgang seine Ankunft wieder. `p_ereignis` versteht `an`/`aus` genauso wie
`ankunft`/`abgang`.
