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
