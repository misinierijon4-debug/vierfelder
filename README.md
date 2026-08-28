# vierfelder

Wochentracker für zwei: lernen, gym, boxen, lesen. Ein Tick pro Bereich und Tag, geteiltes Wochenraster, sonntags Bilanz, montags von vorn.

Dazu das tägliche Gewicht: eingetragen zählt wie ein Tick (Wochenstand also bis 35), und ein
Diagramm zeigt die Entwicklung beider als Veränderung in Kilogramm.

Gym und Boxen haken sich selbst ab: eine Standort-Automation auf dem iPhone meldet Ankunft und
Abgang am Trainingsort, ab 20 Minuten setzt sich der Tick. Das Raster zeigt, wie ein Haken
entstanden ist — voll heißt gemessen, blass heißt getippt. Anleitung in
[TRAINING-STANDORT.md](TRAINING-STANDORT.md).

Design und Begründungen stehen in [DESIGN.md](DESIGN.md).

## Starten

```bash
npm install
npm run dev
```

Läuft auf `http://localhost:5199`.

```bash
npm test      # logik, 83 tests
npm run build # typecheck + produktionsbuild + pwa
```

## Supabase

Projekt `vierfelder`, Region eu-central-1, Ref `ogxwazageufvalkocywh`. Schema, RLS und Realtime sind eingespielt (siehe `supabase/schema.sql`).

Die Tabelle `gewicht` liegt wie `eintraege` offen für beide Konten — der Vergleich ist der
Zweck. Es gibt dort bewusst kein Realtime und keine zweite Zeile in `eintraege`: der Wochentick
fürs Wiegen wird aus dem Gewichtseintrag abgeleitet, damit es keinen Tick ohne Messung gibt.

Die Schlafintegration nutzt eine Edge Function mit einem eigenen, pro Person
gehashten Import-Token. Migration, Function und die vollständige iPhone-Anleitung
stehen in [SCHLAF-KURZBEFEHL.md](SCHLAF-KURZBEFEHL.md).

Die Tabelle `aufenthalte` liegt bewusst anders als alle übrigen: angemeldete Konten dürfen nur
lesen. Geschrieben wird ausschließlich über `record_aufenthalt`, die die Person aus demselben
Import-Token bestimmt. Ohne dieses entzogene Schreibrecht könnte die App eine Messung erfinden,
und die Unterscheidung zwischen gemessen und getippt wäre wertlos.

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
src/lib/motion.ts      alle dauern an einer stelle
supabase/functions/    schlafimport und gemeinsame berechnung
src/components/        kopf, bereichszeile, marke, schritt, raster, schlafdiagramm,
                       gewichtszeile, gewichtsdiagramm, zahl, anmeldung
```

Welches Backend läuft, entscheidet allein, ob `VITE_SUPABASE_URL` gesetzt ist.
