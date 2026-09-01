# zweikampf

Wochentracker für zwei: lernen, gym, boxen, lesen. Ein Tick pro Bereich und Tag, geteiltes Wochenraster, sonntags Bilanz, montags von vorn.

Ein Kalenderknopf über dem Raster öffnet die Historie: ein Tag darin führt zu seiner Woche, und
das Raster zeigt sie statt der laufenden. „Zurück zu heute" holt einen wieder ab.

Jede Durchführung wird einzeln gespeichert: zweimal Gym an einem Tag sind zwei Einheiten mit
eigener Dauer und eigener Uhrzeit, in der Zeile steht die Tagessumme und ein `2×`. Ein Tipp auf
ein Kalenderfeld öffnet die Tagesansicht mit den einzelnen Einheiten und der Gesamtdauer —
vergangene Tage nur zum Nachschlagen, geändert wird immer oben in der Bereichszeile.

Dazu das tägliche Gewicht: eingetragen zählt wie ein Tick (Wochenstand also bis 35), und ein
Diagramm zeigt die Entwicklung beider als Veränderung in Kilogramm.

Gym und Boxen haken sich selbst ab: eine Standort-Automation auf dem iPhone meldet Ankunft und
Abgang am Trainingsort, ab 20 Minuten setzt sich der Tick. Das Raster zeigt, wie ein Haken
entstanden ist — voll heißt gemessen, blass heißt getippt. Anleitung in
[TRAINING-STANDORT.md](TRAINING-STANDORT.md).

Lernen und Lesen haben keinen Ort, aber einen Fokus. Drei Fokus-Modi — lernen, lesen, training —
melden beim Ein- und Ausschalten dasselbe wie eine Ankunft und ein Abgang, und ab 20 Minuten
steht auch dort der Haken von allein — beim Lesen ab 10, weil ein Kapitel kürzer ist als eine
Trainingseinheit. Damit gilt die Unterscheidung zwischen gemessen und
getippt in allen vier Bereichen. Anleitung in [FOKUS-KURZBEFEHL.md](FOKUS-KURZBEFEHL.md).

Design und Begründungen stehen in [DESIGN.md](DESIGN.md).

## Der Name und das Zeichen

Die App hieß bis zum 31.08.2026 `vierfelder`. Der Name zählte die Bereiche mit,
und die Bereiche sind mehr geworden — mit dem Gewicht sind es fünf. Der neue
Name zählt nicht, sondern benennt, worum es geht: zwei, die gegeneinander
antreten. Passend auch zum Boxen, das ohnehin eine der Disziplinen ist.

Das Zeichen sind zwei Keile, die ineinander stoßen: der warme von links oben,
der kühle von rechts unten, die Spitzen laufen aneinander vorbei, dazwischen
bleibt ein schmaler diagonaler Schlitz. Punktsymmetrisch, weil keiner der beiden
im Vorteil ist, und in denselben zwei Personenfarben wie das Raster. Es benutzt
nur Tokens aus [DESIGN.md](DESIGN.md) und folgt derselben Bildsprache wie die
App: harte Kanten, eine Ebene, kein Verlauf, kein Schatten.

`scripts/icons.py` erzeugt alle Dateien in `public/` aus einer einzigen
Geometrie — die zwei SVGs fürs Web und die vier PNGs für Homescreen und Tab:

```bash
python3 scripts/icons.py
```

Das Skript bringt einen eigenen Rasterizer und PNG-Encoder mit und braucht
weder npm-Pakete noch ein Grafikprogramm. Wer das Zeichen ändern will, ändert
die Konstanten oben im Skript und lässt es einmal laufen; von Hand bearbeitete
PNGs würden beim nächsten Lauf überschrieben.

**Technische Namen bleiben `vierfelder`:** das Repository und damit die
Pages-URL, das Supabase-Projekt und die localStorage-Schlüssel des
Prototyp-Modus. Ein Repository umzubenennen ändert `VITE_BASE` und die
öffentliche Adresse, ein Umbenennen der Schlüssel würde lokale Daten
wegwerfen — beides wäre Aufwand ohne Gegenwert.

## Starten

```bash
npm install
npm run dev
```

Läuft auf `http://localhost:5199`.

```bash
npm test      # logik, 158 tests
npm run build # typecheck + produktionsbuild + pwa
```

## Supabase

Projekt `vierfelder` (der technische Name blieb bei der Umbenennung stehen, siehe unten), Region eu-central-1, Ref `ogxwazageufvalkocywh`. Schema, RLS und Realtime sind eingespielt: `supabase/schema.sql` legt den Grundstand an, `supabase/migrations/` alles danach.

Der Schlaf liegt seit dem 01.09.2026 in zwei Schichten: `schlafnaechte` hält die Rohsegmente und ist für niemanden außer der Importfunktion lesbar, `schlaf_updates` hält die Kennzahlen samt fertig gerechnetem Nachtwert. Die App liest ausschließlich `schlafnaechte_ansicht` darüber — Kennzahlen und Phasen, keine Rohdaten. Der Nachtwert entsteht in einem Trigger, damit Edge Function und Kurzbefehl nicht zwei verschiedene Zahlen für dieselbe Nacht speichern können; Grenzen und Rechnung stehen in [SCHLAF-KURZBEFEHL.md](SCHLAF-KURZBEFEHL.md).

Die Tabelle `einheiten` hält eine Zeile je Durchführung (`supabase/migrations/20260830190000_einheiten.sql`).
Sie ist die Quelle des Hakens — mindestens eine Einheit heißt erledigt —, liegt offen für beide
Konten und wird über Realtime verteilt. Die `id` erzeugt der Client, damit ein wiederholter
Schreibversuch keine zweite Einheit anlegt. `eintraege` und `werte` bleiben als Altbestand
stehen: die Migration übernimmt sie verlustfrei und erfindet dabei keine Minuten. **Die
Migration gehört vor den Deploy** — fehlt die Tabelle noch, läuft die App im Altbestandsmodus
weiter (eine Einheit pro Tag, kein `+ einheit`), statt leer auszusehen.

Die Tabelle `gewicht` liegt wie `eintraege` offen für beide Konten — der Vergleich ist der
Zweck. Es gibt dort bewusst kein Realtime und keine zweite Zeile in `eintraege`: der Wochentick
fürs Wiegen wird aus dem Gewichtseintrag abgeleitet, damit es keinen Tick ohne Messung gibt.

Die Schlafintegration nutzt eine Edge Function mit einem eigenen, pro Person
gehashten Import-Token. Migration, Function und die vollständige iPhone-Anleitung
stehen in [SCHLAF-KURZBEFEHL.md](SCHLAF-KURZBEFEHL.md).

Die Edge Function `fokus` ist der Aufruf-Link der Fokus-Automationen:
`/fokus?t=TOKEN&b=lernen&e=an`. Sie schreibt nichts selbst, sondern ruft
`record_aufenthalt` auf — dieselbe Funktion wie die Standort-Kurzbefehle. Ihr
Zweck ist allein, dass ein Kurzbefehl aus einer Aktion und einer Zeile besteht:
ein fertiger Kurzbefehl lässt sich nicht weitergeben, weil iOS nur von Apple
signierte Dateien annimmt, also muss das Nachbauen trivial sein.

Die Tabelle `aufenthalte` liegt bewusst anders als alle übrigen: angemeldete Konten dürfen nur
lesen. Geschrieben wird ausschließlich über `record_aufenthalt`, die die Person aus demselben
Import-Token bestimmt. Ohne dieses entzogene Schreibrecht könnte die App eine Messung erfinden,
und die Unterscheidung zwischen gemessen und getippt wäre wertlos. Sie hält jede gemessene
Sitzung, egal woher sie kommt: `ort` trägt den Namen der Quelle, einen Trainingsort oder einen
Fokus (`supabase/migrations/20260831210000_fokus.sql`).

Zugangsdaten liegen in `.env.local` (nicht im Git). Ohne diese Datei startet die App im Prototyp-Modus mit localStorage.

### Die zwei Konten

Angelegt am 26.08.2026. Konten anlegen und Passwörter setzen läuft über das Dashboard,
die App hat dafür keine Maske — auch nicht zum Ändern. Wer ein neues Passwort braucht,
bekommt es unter Authentication → Users.

1. Dashboard → Authentication → Add user → Create new user.
   Zwei Konten anlegen, bei beiden **Auto Confirm User** anhaken — sonst lehnt die Anmeldung mit „email not confirmed" ab.
2. Danach einmal im SQL Editor, mit den echten E-Mail-Adressen:

```sql
insert into profile (id, person)
select id,
       case when email = 'DEINE@mail' then 'erijon' else 'koray' end
from auth.users;
```

3. App neu laden, anmelden.

Ohne Zeile in `profile` meldet die App: „kein profil für dieses konto".

## Hosting (GitHub Pages)

Live: <https://misinierijon4-debug.github.io/vierfelder/>

Jeder Push auf `main` baut und veröffentlicht neu (`.github/workflows/pages.yml`, Tests laufen
vorher). `vite.config.ts` liest `VITE_BASE`; die drei Repository-Variablen sind gesetzt:
`VITE_BASE=/vierfelder/`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

- Repo heißt `<name>.github.io` → `VITE_BASE=/`
- Repo heißt anders → `VITE_BASE=/<reponame>/`

Auf dem kostenlosen Plan muss das Repository öffentlich sein. Die Seite ist damit für jeden
erreichbar, der die URL kennt — die Daten nicht, die liegen hinter Anmeldung und RLS.
URL und Publishable Key stehen im gebauten JavaScript; das ist so vorgesehen, beide sind
öffentliche Schlüssel.

## Aufbau

```
src/lib/backend.ts     das interface, das die app kennt
src/lib/lokal.ts       prototyp: localStorage + BroadcastChannel
src/lib/supabase.ts    postgrest + realtime + anmeldung
src/lib/store.ts       zustand, optimistisches schreiben, rücknahme bei fehlern
src/lib/tracker.ts     reine logik, getestet
src/lib/gewicht.ts     gleitender schnitt, achse, parsen — reine logik, getestet
src/lib/training.ts    aufenthalte zu ticks — reine logik, getestet
src/lib/kalender.ts    monatsraster und wochenzeitraum, von beiden kalendern benutzt
src/lib/motion.ts      alle dauern an einer stelle
supabase/functions/    schlafimport und gemeinsame berechnung
src/components/        kopf, bereichszeile, marke, schritt, raster, tagesdetail,
                       trackerkalender, schlafdiagramm, gewichtszeile,
                       gewichtsdiagramm, zahl, anmeldung
```

Welches Backend läuft, entscheidet allein, ob `VITE_SUPABASE_URL` gesetzt ist.
