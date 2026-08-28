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

## Supabase

Die Migration ist am 28.08.2026 auf `ogxwazageufvalkocywh` eingespielt. Bei
einem neuen Projekt:

```powershell
npx supabase link --project-ref ogxwazageufvalkocywh
npx supabase db push
```

Eine Edge Function braucht es nicht, und ein neues Token auch nicht: die
Funktion prüft dasselbe Import-Token, das der Schlaf-Kurzbefehl schon benutzt
(siehe [SCHLAF-KURZBEFEHL.md](SCHLAF-KURZBEFEHL.md), Abschnitt „Einmalig in
Supabase einrichten"). Wer noch keins hat, legt es dort an.

## Der Kurzbefehl

Sechs Kurzbefehle pro iPhone — aber nur einer wird gebaut, die anderen fünf sind
Duplikate mit zwei geänderten Feldern. Keine Variablen, kein Text zerlegen.

**Den ersten bauen:**

1. In **Kurzbefehle** einen neuen Kurzbefehl anlegen und ihn `gym nord an`
   nennen.
2. Genau eine Aktion hinzufügen: **Inhalte von URL abrufen**.
3. Auf den Pfeil tippen, um die Details aufzuklappen, und ausfüllen:
   - URL: `https://ogxwazageufvalkocywh.supabase.co/rest/v1/rpc/record_aufenthalt`
   - Methode: `POST`
   - Header hinzufügen — `Content-Type` mit dem Wert `application/json`
   - Header hinzufügen — `apikey` mit dem Publishable Key des Projekts
   - Haupttext anfordern: `JSON`
4. Im JSON vier Felder anlegen, **alle vier vom Typ Text**:

   | Schlüssel | Wert |
   |---|---|
   | `p_token` | dein persönliches Import-Token |
   | `p_bereich` | `gym` |
   | `p_ereignis` | `ankunft` |
   | `p_ort` | `gym nord` |

Der Typ **Text** ist wichtig. iOS legt neue Felder gern als Boolean an, und dann
kommt statt des Tokens ein `true` an.

**Die fünf anderen:** den fertigen Kurzbefehl gedrückt halten → **Duplizieren**,
umbenennen und im JSON nur `p_bereich`, `p_ereignis` und `p_ort` ändern. Das
Token bleibt unangetastet, es wird also nur einmal getippt.

| Name | `p_bereich` | `p_ereignis` | `p_ort` |
|---|---|---|---|
| gym nord an | `gym` | `ankunft` | `gym nord` |
| gym nord aus | `gym` | `abgang` | `gym nord` |
| gym sued an | `gym` | `ankunft` | `gym sued` |
| gym sued aus | `gym` | `abgang` | `gym sued` |
| boxen an | `boxen` | `ankunft` | `boxhalle` |
| boxen aus | `boxen` | `abgang` | `boxhalle` |

Die Ortsnamen sind frei wählbar, sie müssen bei Ankunft und Abgang nur **exakt
gleich** geschrieben sein — daran findet die Funktion die offene Ankunft wieder.
`p_bereich` entscheidet, welcher Haken gesetzt wird; deshalb kosten zwei Gyms
keine Änderung an der Datenbank, sondern nur zwei weitere Kurzbefehle.

`p_zeit` wird nicht mitgeschickt: ohne Angabe gilt der Moment des Aufrufs, und
das ist genau der Moment, in dem die Automation auslöst.

## Die Automationen

Sechs Stück, je eine pro Kurzbefehl. Für jede:

1. In **Kurzbefehle** unten auf **Automation**.
2. **Neue Automation** → in der Liste **Ankunft** (bzw. **Verlassen**) wählen.
3. Ort wählen — die Adresse des Gyms. Radius so klein wie möglich ziehen.
   Zeitraum: **Ganztägig**.
4. **Sofort ausführen** wählen und **Bei Ausführung benachrichtigen**
   ausschalten. (Auf älteren iOS-Versionen heißt das **Vor dem Ausführen
   fragen** — dann muss dieser Schalter aus.)
5. Als Aktion **Kurzbefehl ausführen** wählen und den passenden Kurzbefehl aus
   der Tabelle oben eintragen.

Zwei Automationen pro Ort, also sechs insgesamt. Das ist einmal eine
Viertelstunde und danach nie wieder.

## Testen

`gym nord an` von Hand ausführen. Die Antwort muss `"ok": true` enthalten.
Dann `gym nord aus` ausführen — die Antwort enthält zusätzlich `dauer_minuten`.
In Supabase nachsehen:

```sql
select p.person, a.bereich, a.ort,
       to_char(a.ankunft at time zone 'Europe/Berlin', 'DD.MM. HH24:MI') as ankunft,
       round(extract(epoch from (a.abgang - a.ankunft)) / 60) as minuten
from aufenthalte a
join profile p on p.id = a.user_id
order by a.ankunft desc;
```

Ein Testlauf von einer Minute steht in der Tabelle, setzt aber keinen Tick — er
liegt unter der Schwelle von 20 Minuten. Das ist richtig so; die Zeile im SQL
ist der Beleg, dass die Kette funktioniert. Testzeilen kann man wegräumen:

```sql
delete from aufenthalte where ort = 'gym nord' and abgang - ankunft < interval '5 minutes';
```

Kommt stattdessen `kein gueltiges import-token`, stimmt `p_token` nicht oder das
Feld wurde nicht als **Text** angelegt.

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
