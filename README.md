# vierfelder

Wochentracker für zwei: lernen, gym, boxen, lesen. Ein Tick pro Bereich und Tag, geteiltes Wochenraster, sonntags Bilanz, montags von vorn.

Design und Begründungen stehen in [DESIGN.md](DESIGN.md).

## Starten

```bash
npm install
npm run dev
```

Läuft auf `http://localhost:5199`.

```bash
npm test      # logik, 11 tests
npm run build # typecheck + produktionsbuild + pwa
```

## Supabase

Projekt `vierfelder`, Region eu-central-1, Ref `ogxwazageufvalkocywh`. Schema, RLS und Realtime sind eingespielt (siehe `supabase/schema.sql`).

Zugangsdaten liegen in `.env.local` (nicht im Git). Ohne diese Datei startet die App im Prototyp-Modus mit localStorage.

### Was noch fehlt: die zwei Konten

Konten anlegen und Passwörter setzen musst du selbst machen.

1. Dashboard → Authentication → Add user → Create new user.
   Zwei Konten anlegen, bei beiden **Auto Confirm User** anhaken — sonst lehnt die Anmeldung mit „email not confirmed" ab.
   Für Koray ein **zufälliges Startpasswort** nehmen. Beim ersten Login zwingt ihn die App,
   ein eigenes zu setzen (`src/components/PasswortSetzen.tsx`); danach kennst du es nicht mehr.
   Die App merkt sich das über das Flag `passwort_gesetzt` in den User-Metadaten.
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
src/lib/motion.ts      alle dauern an einer stelle
src/components/        kopf, bereichszeile, marke, raster, zahl, anmeldung
```

Welches Backend läuft, entscheidet allein, ob `VITE_SUPABASE_URL` gesetzt ist.
