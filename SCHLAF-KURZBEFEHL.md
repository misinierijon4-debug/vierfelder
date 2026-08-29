# Schlafimport per iPhone-Kurzbefehl

Der Health-Export wird nicht importiert. Er diente nur dazu, die vorhandenen
Schlafkategorien zu prüfen. Im täglichen Betrieb sendet jedes iPhone die
Health-Segmente der letzten 24 Stunden an die Edge Function. Die Function wählt
die zuletzt endende Schlafepisode und überschreibt die vorhandene Zeile für
dieselbe Person und Nacht.

## Einmalig in Supabase einrichten

1. Migration und Function veröffentlichen:

   ```powershell
   npx supabase link --project-ref ogxwazageufvalkocywh
   npx supabase db push
   npx supabase functions deploy schlaf-import --no-verify-jwt
   ```

2. Für jede Person ein eigenes zufälliges Token erzeugen. Beispiel in PowerShell:

   ```powershell
   [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
   ```

3. Das Token im Supabase SQL Editor der Person zuordnen:

   ```sql
   select set_schlaf_import_token('erijon', 'HIER_DAS_TOKEN_VON_ERIJON');
   select set_schlaf_import_token('koray', 'HIER_DAS_TOKEN_VON_KORAY');
   ```

   Das Klartext-Token steht danach nur noch auf dem jeweiligen iPhone. In der
   Datenbank liegt sein SHA-256-Hash. Ein neues Token für dieselbe Person ersetzt
   das alte.

## Kurzbefehl bauen

Die folgenden Schritte werden auf beiden iPhones identisch angelegt. Nur
`person`, `sleepGoalMinutes` und `x-schlaf-token` unterscheiden sich.

1. In **Kurzbefehle** einen neuen Kurzbefehl namens `schlaf senden` anlegen.
2. Aktion **Datum** hinzufügen. Sie liefert das aktuelle Datum.
3. Aktion **Datum anpassen** hinzufügen und vom aktuellen Datum `1 Tag`
   abziehen. Das Ergebnis heißt im Folgenden `Beginn`.
4. Aktion **Health-Messungen suchen** hinzufügen:
   - Typ: `Schlaf`
   - Filter: `Startdatum ist nach Beginn`
   - Sortieren nach: `Startdatum`
   - Reihenfolge: `älteste zuerst`
   - Limit: aus
5. Aktion **Mit jedem wiederholen** für die gefundenen Health-Messungen.
6. Innerhalb der Wiederholung die Aktion **Details von Health-Messung abrufen**
   dreimal verwenden:
   - `Startdatum` von `Wiederholungselement`
   - `Enddatum` von `Wiederholungselement`
   - `Wert` von `Wiederholungselement`
7. Startdatum und Enddatum jeweils mit **Datum formatieren** formatieren:
   - Datumsformat: `ISO 8601`
   - Zeitzone: `Aktuell`
8. Innerhalb der Wiederholung eine Aktion **Wörterbuch** mit diesen Feldern
   anlegen:
   - `start`: formatiertes Startdatum
   - `end`: formatiertes Enddatum
   - `value`: abgerufener Wert
9. Das Wörterbuch mit **Zu Variable hinzufügen** an die Variable `Segmente`
   anhängen.
10. Nach **Wiederholung beenden** ein weiteres **Wörterbuch** anlegen:
    - `person`: `erijon` beziehungsweise `koray`, klein geschrieben
    - `sleepGoalMinutes`: persönliches Schlafziel als Minuten, zum Beispiel
      `480` für acht Stunden
    - `segments`: Variable `Segmente`
11. Aktion **Inhalt von URL abrufen** hinzufügen:
    - URL: `https://ogxwazageufvalkocywh.supabase.co/functions/v1/schlaf-import`
    - Methode: `POST`
    - Anfragebody: `JSON`
    - JSON: das Wörterbuch aus Schritt 10
    - Header `Content-Type`: `application/json`
    - Header `x-schlaf-token`: das Token dieser Person

Das gesendete JSON hat genau diese Form:

```json
{
  "person": "erijon",
  "sleepGoalMinutes": 480,
  "segments": [
    {
      "start": "2026-08-25T23:25:42+02:00",
      "end": "2026-08-26T00:14:12+02:00",
      "value": "Awake"
    },
    {
      "start": "2026-08-26T00:14:12+02:00",
      "end": "2026-08-26T00:25:42+02:00",
      "value": "Core"
    }
  ]
}
```

`value` darf als ausgeschriebener HealthKit-Wert, als englischer oder deutscher
Kurztext oder als HealthKit-Rohwert 0 bis 5 ankommen. Unbekannte Werte werden mit
HTTP 422 abgelehnt und nicht gespeichert. `source` ist als viertes Segmentfeld
optional, wird für die Rechnung aber nicht benötigt.

## Persönliche Automation

1. In **Kurzbefehle** zu **Automation** wechseln.
2. **Neue persönliche Automation** und **Tageszeit** wählen.
3. Eine Uhrzeit am Morgen wählen, zu der die Schlafaufzeichnung sicher beendet
   ist, und `Täglich` einstellen.
4. Den Kurzbefehl `schlaf senden` ausführen lassen.
5. Auf aktuellen iOS-Versionen **Sofort ausführen** wählen. Falls stattdessen
   **Vor Ausführen bestätigen** erscheint, diese Abfrage ausschalten.
6. **Bei Ausführung benachrichtigen** ausschalten.

Zum ersten Test den Kurzbefehl einmal manuell ausführen und danach in Supabase
prüfen:

```sql
select p.person, s.nacht, s.schlaf_minuten, s.wachphasen,
       s.wach_minuten, s.nachtwert, s.bewertungsbasis
from schlafnaechte s
join profile p on p.id = s.user_id
order by s.nacht desc;
```

Ein zweiter Lauf für dieselbe Nacht aktualisiert dieselbe Zeile. Er legt keine
zweite Nacht an.

## Alternative: direkter Aufruf der RPC-Funktion

Statt über die Edge Function kann der Kurzbefehl auch direkt `/rest/v1/rpc/record_sleep_night` aufrufen. Die Migration `supabase/migrations/20260827100000_record_sleep_night_rpc.sql` legt dazu eine verzeihende JSONB-Funktion an: Zahlen dürfen als Text ankommen ("9" oder "9,5"), Daten mit oder ohne Zeitzone, Schlafwerte als HealthKit-Text, deutscher Kurztext oder Rohwert 0 bis 5.

Gesendet werden (alle Namen exakt so):

- `p_raw_segments`: Array mit {`start`, `end`, `value`}-Objekten
- `p_target_hours`: Schlafziel in Stunden, z.B. 9
- `p_night_date`: optional, sonst wird die Nacht aus dem letzten Segmentende abgeleitet
- `p_source_name`: optional
- `p_user_id`: wird ignoriert, nur aus Kompatibilität vorhanden
- `p_token`: das persönliche Import-Token (Klartext, mindestens 32 Zeichen)

Beide Wege wählen aus dem gesendeten Fenster dieselbe Nacht: die zuletzt endende
Schlafepisode, getrennt an einer Lücke von drei Stunden. Läuft der Kurzbefehl
später als sonst, stehen zwei Nächte im 24-Stunden-Fenster — gezählt wird nur
die letzte. Überlappende Segmente (Uhr und iPhone melden denselben Zeitraum)
zählen einmal, Wachzeit innerhalb der Episode wird abgezogen.

Die Identität kommt ausschließlich aus dem Token gegen die Tabelle `schlaf_import_tokens`. Ohne gültiges Token schreibt die Funktion nichts. Die Rückgabe ist ein JSON-Objekt mit `ok`, `nacht`, `schlaf_minuten`, `nachtwert` und weiteren Details.

### Auf iOS getesteter RPC-Aufbau

Für den direkten RPC-Aufruf keine Hilfsvariable `Segmente`, keine separate
`Liste` und kein zusätzliches Payload-Wörterbuch nach der Wiederholung anlegen.
Die Ausgabe des letzten Segment-Wörterbuchs wird über
`Wiederholungsergebnisse` gesammelt.

Innerhalb von `Mit jedem wiederholen`:

1. `Startdatum`, `Enddatum` und `Wert` aus `Objekt wiederholen` abrufen.
2. Beide Daten als `ISO 8601` formatieren und
   `Einschließlich ISO 8601-Zeit` einschalten.
3. Ein Wörterbuch mit drei ausdrücklich als **Text** angelegten Feldern bauen:
   - `start`: formatiertes Startdatum
   - `end`: formatiertes Enddatum
   - `value`: Health-Wert

Die Wahl `Text` ist wichtig. Eine nachträglich eingesetzte Variable ändert den
ursprünglichen Feldtyp nicht; bei einem als Boolean angelegten Feld würde iOS
das Datum beziehungsweise den Schlafwert als `true` oder `false` senden.

In `Inhalte von URL abrufen`:

- URL: `https://ogxwazageufvalkocywh.supabase.co/rest/v1/rpc/record_sleep_night`
- Methode: `POST`
- Header `Content-Type`: `application/json`
- Header `apikey`: der Publishable Key des Projekts
- Haupttext: `JSON`
- `p_raw_segments`: Feldtyp **Array**, Wert `Wiederholungsergebnisse`
- `p_target_hours`: Feldtyp **Zahl**, Wert `9`
- `p_token`: Feldtyp **Text**, persönliches Import-Token

Ein erfolgreicher Test liefert unter anderem `"ok": true`. Die getestete
Automation läuft täglich um 11:00 Uhr mit `Sofort ausführen`; die
Ausführungsbenachrichtigung ist ausgeschaltet.
