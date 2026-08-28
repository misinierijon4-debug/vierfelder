# Gym und Boxen per Standort-Automation

Niemand hakt gym und boxen mehr ab. Das iPhone meldet, wenn du am Trainingsort
ankommst und wenn du wieder gehst; aus dem Paar ergibt sich die Dauer, und ab
20 Minuten setzt sich der Wochentick von allein.

Das Prinzip ist dasselbe wie beim Gewicht: **kein Tick ohne Messung**. Eine
gemessene Zeile ist im Raster voll ausgefüllt, eine angetippte nur blass — beide
zählen gleich, aber man sieht den Unterschied. Antippen bleibt möglich, weil eine
Standort-Automation ausfallen kann und Boxen auch zuhause stattfindet.

Geschrieben wird ausschließlich über die Datenbankfunktion mit deinem
persönlichen Token. Die App selbst hat auf `aufenthalte` kein Schreibrecht —
das ist der Grund, warum eine Messung mehr wert ist als ein Tick.

## Einmalig in Supabase einrichten

```powershell
npx supabase link --project-ref ogxwazageufvalkocywh
npx supabase db push
```

Eine Edge Function braucht es nicht, und ein neues Token auch nicht: die
Funktion prüft dasselbe Import-Token, das der Schlaf-Kurzbefehl schon benutzt
(siehe [SCHLAF-KURZBEFEHL.md](SCHLAF-KURZBEFEHL.md), Abschnitt „Einmalig in
Supabase einrichten"). Wer noch keins hat, legt es dort an.

## Der Kurzbefehl

Ein Kurzbefehl pro iPhone, den alle Automationen aufrufen. Er nimmt einen Text
der Form `bereich|ereignis|ort` entgegen, zum Beispiel `gym|ankunft|gym nord`.

1. In **Kurzbefehle** einen neuen Kurzbefehl `aufenthalt senden` anlegen.
2. Aktion **Text aus Eingabe abrufen** hinzufügen. Sie liefert den Text, den die
   Automation übergibt.
3. Aktion **Text teilen** hinzufügen:
   - Text: das Ergebnis aus Schritt 2
   - Trennzeichen: **Benutzerdefiniert**, `|`
4. Dreimal **Element aus Liste abrufen** hinzufügen, jeweils vom geteilten Text:
   - `Erstes Element` → das ist der **Bereich**
   - `Element am Index 2` → das ist das **Ereignis**
   - `Letztes Element` → das ist der **Ort**
5. Aktion **Inhalte von URL abrufen** hinzufügen:
   - URL: `https://ogxwazageufvalkocywh.supabase.co/rest/v1/rpc/record_aufenthalt`
   - Methode: `POST`
   - Header `Content-Type`: `application/json`
   - Header `apikey`: der Publishable Key des Projekts
   - Haupttext: `JSON`, mit vier Feldern, **alle vier als Typ Text angelegt**:
     - `p_token`: dein persönliches Import-Token
     - `p_bereich`: das Element aus Schritt 4 (`gym` oder `boxen`)
     - `p_ereignis`: das Element aus Schritt 4 (`ankunft` oder `abgang`)
     - `p_ort`: das Element aus Schritt 4

Die Wahl **Text** ist wichtig. Eine nachträglich eingesetzte Variable ändert den
ursprünglichen Feldtyp nicht; ein als Boolean angelegtes Feld würde iOS als
`true` senden. Dieselbe Falle wie beim Schlafimport.

`p_zeit` wird nicht mitgeschickt: ohne Angabe gilt der Moment des Aufrufs, und
das ist genau der Moment, in dem die Automation auslöst.

## Die Automationen

Pro Ort zwei Stück — eine fürs Ankommen, eine fürs Weggehen. Bei zwei Gyms und
einer Boxhalle sind das sechs. Klingt nach viel, ist aber einmal eine
Viertelstunde und danach nie wieder.

1. In **Kurzbefehle** zu **Automation** wechseln.
2. **Neue Automation** → **Ankunft**.
3. Ort wählen (Adresse des Gyms), Radius wenn möglich klein halten.
   Zeitraum: **Ganztägig**.
4. **Sofort ausführen** wählen und **Bei Ausführung benachrichtigen**
   ausschalten.
5. Als Aktion **Kurzbefehl ausführen** → `aufenthalt senden`, und als Eingabe
   den passenden Text:

| Automation | Auslöser | Eingabe |
|---|---|---|
| Gym A an | Ankunft | `gym\|ankunft\|gym nord` |
| Gym A aus | Verlassen | `gym\|abgang\|gym nord` |
| Gym B an | Ankunft | `gym\|ankunft\|gym sued` |
| Gym B aus | Verlassen | `gym\|abgang\|gym sued` |
| Boxen an | Ankunft | `boxen\|ankunft\|boxhalle` |
| Boxen aus | Verlassen | `boxen\|abgang\|boxhalle` |

Der Ortsname ist frei wählbar, er muss nur bei Ankunft und Abgang **exakt
gleich** geschrieben sein — daran findet die Funktion die offene Ankunft wieder.
Der Bereich entscheidet, welcher Haken gesetzt wird; deshalb kosten zwei Gyms
keine Änderung an der Datenbank, sondern nur zwei weitere Automationen.

Ein drittes Gym später: dieselben zwei Automationen mit neuem Ortsnamen anlegen,
sonst nichts.

## Testen

Kurzbefehl einmal von Hand ausführen (mit `gym|ankunft|gym nord` als Eingabe),
eine Minute warten, dann mit `gym|abgang|gym nord` — die Antwort enthält
`"ok": true` und die Dauer. In Supabase nachsehen:

```sql
select p.person, a.bereich, a.ort,
       to_char(a.ankunft at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') as ankunft,
       round(extract(epoch from (a.abgang - a.ankunft)) / 60) as minuten
from aufenthalte a
join profile p on p.id = a.user_id
order by a.ankunft desc;
```

Weniger als 20 Minuten erscheinen in der Tabelle, setzen aber keinen Tick. Zum
Testen also entweder länger warten oder in der Datenbank nachhelfen.

## Was von allein passiert, und was nicht

- **Zwei Besuche an einem Tag** bleiben ein Tick. Angezeigt wird der längere.
- **Über Mitternacht**: der Aufenthalt zählt zu dem Tag, an dem er begonnen hat.
- **Doppelt ausgelöste Ankunft** wird ignoriert, es entsteht kein zweiter Besuch.
- **Abgang ohne Ankunft** wird verworfen. Sonst wäre eine Vorbeifahrt ein
  Training.
- **Vergessener Abgang**: die offene Ankunft wird nach zwölf Stunden von der
  nächsten Ankunft am selben Ort weggeräumt. An dem Tag gibt es dann keinen
  gemessenen Tick — antippen geht weiter, es sieht nur anders aus.
- **iOS ist bei Standortautomationen nicht zuverlässig.** Wenn ein Tag fehlt,
  ist das der Preis dafür, nichts tun zu müssen. Ein Antippen kostet drei
  Sekunden und zählt genauso.

## Was nicht damit geht

Boxen zuhause, lernen und lesen. Kein Standort und kein Gerät weiß, ob du
gelesen hast — dort bleibt der Tick eine Behauptung, und deshalb zeigt die App
bei lernen und lesen auch keinen Unterschied an. Eine Unterscheidung, die nichts
unterscheiden kann, wäre kein Urteil, sondern Rauschen.
