# Gewicht per Health-Automation

Bis hierher galt jede Gewichtszahl als Messung. Getippt wurde sie trotzdem — in
der App, mit dem Daumen. Ab jetzt gilt dieselbe Regel wie bei gym und boxen:

**Gemessen ist, was die Automation schreibt. Alles andere ist getippt.**

Die Waage synchronisiert nach Apple Health, ein Kurzbefehl liest den neuesten
Gewichtseintrag des heutigen Tages und schickt ihn an die Datenbank. Wer keine
Waage hat, tippt weiter in der App — das ist kein Nachteil im Duell, siehe
unten.

`gemessen` bezeichnet dabei die technische Herkunft über den persönlichen
Importweg, nicht eine kryptografische Bestätigung durch Apple Health oder die
Waage. Ein Inhaber des Import-Tokens könnte denselben RPC mit einem frei
gewählten Wert aufrufen. Genau deshalb zählt Gewicht nicht in die Belegquote.

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
Sie wird nicht aus dieser Einzelanleitung eingespielt. Wegen der noch nicht
vollständig reconciliierten Migrationshistorie gilt ausschließlich das
[Release- und Migrationsrunbook](docs/release-und-migrationen.md) mit lokalem
Reset, Staging, Backup/Restore-Probe, Invarianten, Rollenmatrix, Advisors und
ausdrücklicher Produktionsfreigabe.

Eine Edge Function braucht es nicht, und ein neues Token auch nicht: die
Funktion prüft dasselbe Import-Token wie der Schlaf-Kurzbefehl und die
Standort-Automation (siehe [SCHLAF-KURZBEFEHL.md](SCHLAF-KURZBEFEHL.md),
Abschnitt „Einmalig in Supabase einrichten"). Wer noch keins hat, legt es dort
an.

Die App selbst kann `quelle` nicht auf `gemessen` setzen. Ein Trigger schreibt
bei jeder Schreibung aus der App `getippt` — das ist der Grund, warum eine
Messung mehr wert ist als eine Eingabe.

## Der Kurzbefehl

Der Netzaufruf selbst bleibt klein. Davor wird aber ausdrücklich geprüft, dass
Health einen Gewichtswert von **heute** liefert. Ein älterer letzter Wert darf
nicht als neue Messung für den heutigen Tag gespeichert werden.

1. In **Kurzbefehle** einen neuen Kurzbefehl anlegen und ihn `gewicht senden`
   nennen.
2. **Health-Messungen suchen** hinzufügen: Typ `Gewicht`, Datum ist heute,
   nach Datum absteigend, Limit 1.
3. Mit **Wenn** prüfen, ob ein Ergebnis vorhanden ist. Ohne heutigen Wert endet
   der Kurzbefehl ohne Netzaufruf.
4. Für das gefundene Ergebnis den Gewichtswert abrufen.
5. **Inhalte von URL abrufen** hinzufügen und ausfüllen:
   - URL: `https://ogxwazageufvalkocywh.supabase.co/rest/v1/rpc/record_gewicht`
   - Methode: `POST`
   - Header hinzufügen — `Content-Type` mit dem Wert `application/json`
   - Header hinzufügen — `apikey` mit dem Publishable Key des Projekts
   - Haupttext anfordern: `JSON`
6. Im JSON zwei Felder anlegen, **beide vom Typ Text**:

   | Schlüssel | Wert |
   |---|---|
   | `p_token` | dein persönliches Import-Token |
   | `p_kg` | der Gewichtswert des heutigen Health-Ergebnisses |

Der Typ **Text** ist wichtig. iOS legt neue Felder gern als Boolean an, und dann
kommt statt des Tokens ein `true` an. Aus demselben Grund parst die Funktion die
Zahl selbst: Komma statt Punkt und ein angehängtes „kg" stören sie nicht.

`p_tag` ist optional. Ohne Angabe zählt der heutige Tag in Berliner Zeit — die
Waage am frühen Morgen gehört zu diesem Morgen.

## Die Automation

Apple dokumentiert für persönliche Kurzbefehls-Automationen Ereignis-, Reise-,
Kommunikations-, Transaktions- und Einstellungs-Auslöser; ein neuer
Health-Gewichtseintrag ist dort kein allgemeiner Trigger. Deshalb wird hier
keine nicht vorhandene „Gesundheit → Gewicht aktualisiert“-Automation
versprochen. Siehe [Apple: persönliche Automationen](https://support.apple.com/guide/shortcuts/intro-to-personal-automation-apd690170742/ios)
und [Apple: Ereignisauslöser](https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/ios).

Der belastbare Standard ist eine **Tageszeit** nach der üblichen Wiegezeit:

1. In **Kurzbefehle** → **Automation** → **+** → **Tageszeit**.
2. Eine Zeit wählen, zu der die Waage gewöhnlich bereits mit Health
   synchronisiert hat.
3. `gewicht senden` ausführen lassen, **Sofort ausführen**, Rückfrage aus.
4. Den ersten Lauf entsperrt beobachten und in App sowie Datenbank prüfen.

War an diesem Tag noch keine Health-Messung vorhanden, schreibt der Kurzbefehl
nichts. Spätes Wiegen wird nicht erfunden; der Kurzbefehl kann dann von Hand
gestartet oder eine zweite, spätere Tageszeit eingerichtet werden. Erst ein
echter Lauf auf jedem verwendeten iPhone ist ein Gerätebeleg.

## Wenn die Waage ausfällt

Antippen bleibt möglich, genau wie bei gym und boxen. Die Zahl zählt dann voll
für den Tick, den Verlauf und die Streak — sie trägt nur keinen Haken. Wer eine
gemessene Zahl in der App überschreibt, macht daraus wieder eine getippte. Das
ist Absicht: die Anzeige folgt der letzten Schreibung.
