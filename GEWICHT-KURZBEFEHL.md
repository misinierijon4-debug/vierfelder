# Gewicht per Health-Automation

Bis hierher galt jede Gewichtszahl als Messung. Getippt wurde sie trotzdem — in
der App, mit dem Daumen. Ab jetzt gilt dieselbe Regel wie bei gym und boxen:

**Gemessen ist, was die Automation schreibt. Alles andere ist getippt.**

Die Waage synchronisiert nach Apple Health, eine Health-Automation schickt die
Zahl an die Datenbank. Wer keine Waage hat, tippt weiter in der App — das ist
kein Nachteil im Duell, siehe unten.

## Was das für die Belegquote heißt

Die Belegquote zählt nur noch die vier Bereiche: gym, boxen, lernen, lesen. Das
Gewicht steht nicht mehr drin.

Für die vier Bereiche hat jeder dieselbe Messquelle im Telefon — Standort und
Fokus laufen auf beiden iPhones. Eine Waage, die nach Health schreibt, hat nicht
jeder. Ein Tiebreaker, der an der Ausrüstung hängt, misst den Einkauf und nicht
die Woche.

Im Aktivitätsfeed und in der Gewichtszeile bleibt die Unterscheidung sichtbar:
eine gemessene Zahl trägt den Haken, eine getippte nicht.

## Supabase

Die Migration liegt in `supabase/migrations/20260902220000_gewicht_quelle.sql`.
Einspielen:

```powershell
npx supabase link --project-ref ogxwazageufvalkocywh
npx supabase db push
```

Eine Edge Function braucht es nicht, und ein neues Token auch nicht: die
Funktion prüft dasselbe Import-Token wie der Schlaf-Kurzbefehl und die
Standort-Automation (siehe [SCHLAF-KURZBEFEHL.md](SCHLAF-KURZBEFEHL.md),
Abschnitt „Einmalig in Supabase einrichten"). Wer noch keins hat, legt es dort
an.

Die App selbst kann `quelle` nicht auf `gemessen` setzen. Ein Trigger schreibt
bei jeder Schreibung aus der App `getippt` — das ist der Grund, warum eine
Messung mehr wert ist als eine Eingabe.

## Der Kurzbefehl

Ein Kurzbefehl, eine Aktion. Keine Variablen, kein Text zerlegen.

1. In **Kurzbefehle** einen neuen Kurzbefehl anlegen und ihn `gewicht senden`
   nennen.
2. Genau eine Aktion hinzufügen: **Inhalte von URL abrufen**.
3. Auf den Pfeil tippen, um die Details aufzuklappen, und ausfüllen:
   - URL: `https://ogxwazageufvalkocywh.supabase.co/rest/v1/rpc/record_gewicht`
   - Methode: `POST`
   - Header hinzufügen — `Content-Type` mit dem Wert `application/json`
   - Header hinzufügen — `apikey` mit dem Publishable Key des Projekts
   - Haupttext anfordern: `JSON`
4. Im JSON zwei Felder anlegen, **beide vom Typ Text**:

   | Schlüssel | Wert |
   |---|---|
   | `p_token` | dein persönliches Import-Token |
   | `p_kg` | die Gewichtsvariable aus der Automation |

Der Typ **Text** ist wichtig. iOS legt neue Felder gern als Boolean an, und dann
kommt statt des Tokens ein `true` an. Aus demselben Grund parst die Funktion die
Zahl selbst: Komma statt Punkt und ein angehängtes „kg" stören sie nicht.

`p_tag` ist optional. Ohne Angabe zählt der heutige Tag in Berliner Zeit — die
Waage am frühen Morgen gehört zu diesem Morgen.

## Die Automation

1. In **Kurzbefehle** → **Automation** → **+** → **Gesundheit**.
2. Als Auslöser **Gewicht** wählen, „Wird aktualisiert".
3. **Sofort ausführen**, Rückfrage aus.
4. Als Aktion: die Gesundheitsdaten des Tages abrufen (Gewicht, neuester
   Eintrag) und den Wert als `p_kg` an den Kurzbefehl oben übergeben.

Danach steht die Zahl morgens von allein in der App, mit Haken.

## Wenn die Waage ausfällt

Antippen bleibt möglich, genau wie bei gym und boxen. Die Zahl zählt dann voll
für den Tick, den Verlauf und die Streak — sie trägt nur keinen Haken. Wer eine
gemessene Zahl in der App überschreibt, macht daraus wieder eine getippte. Das
ist Absicht: die Anzeige folgt der letzten Schreibung.
