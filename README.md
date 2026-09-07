# zweikampf

Wochentracker für zwei: lernen, gym, boxen, lesen und das tägliche Gewicht.
Mehrere Durchführungen bleiben einzeln erhalten; für die Wochenwertung zählt
jedes der fünf Felder höchstens einmal pro Tag. Das gemeinsame Raster beginnt
montags neu, abgeschlossene Wochen bleiben als Archiv nachvollziehbar.

Ein Kalenderknopf über dem Raster öffnet die Historie: ein Tag darin führt zu seiner Woche, und
das Raster zeigt sie statt der laufenden. „Zurück zu heute" holt einen wieder ab.

Jede Durchführung wird einzeln gespeichert: zweimal Gym an einem Tag sind zwei Einheiten mit
eigener Dauer und eigener Uhrzeit, in der Zeile steht die Tagessumme und ein `2×`. Ein Tipp auf
ein Kalenderfeld öffnet die Tagesansicht mit den einzelnen Einheiten und der Gesamtdauer —
vergangene Tage nur zum Nachschlagen, geändert wird immer oben in der Bereichszeile.

Dazu das tägliche Gewicht: eingetragen zählt wie ein Tick (Wochenstand also bis 35), und ein
Diagramm zeigt die Entwicklung beider als Veränderung in Kilogramm. Auch hier gilt gemessen
gegen getippt: eine Waage, die nach Apple Health schreibt, kann die Zahl selbst schicken —
alles andere ist getippt. Anleitung in [GEWICHT-KURZBEFEHL.md](GEWICHT-KURZBEFEHL.md).

Gym und Boxen haken sich selbst ab: eine Standort-Automation auf dem iPhone meldet Ankunft und
Abgang am Trainingsort, ab 20 Minuten setzt sich der Tick. Das Raster zeigt, wie ein Haken
entstanden ist — gemessen, getippt oder gemischt, wenn beide Quellen am selben Tag vorkommen. Anleitung in
[TRAINING-STANDORT.md](TRAINING-STANDORT.md).

Lernen und Lesen haben keinen Ort, aber einen Fokus. Drei Fokus-Modi — lernen, lesen, training —
melden beim Ein- und Ausschalten dasselbe wie eine Ankunft und ein Abgang, und ab 20 Minuten
steht auch dort der Haken von allein — beim Lesen ab 10, weil ein Kapitel kürzer ist als eine
Trainingseinheit. Damit gilt die Unterscheidung zwischen gemessen und
getippt in allen vier Bereichen. Anleitung in [FOKUS-KURZBEFEHL.md](FOKUS-KURZBEFEHL.md).

Die App darf aufs Handy melden. Ein Schalter unten meldet das Gerät an, ein Knopf
daneben schickt eine Probe durch die ganze Kette. Gewicht- und
Schlafimport-Erinnerung sind im Repository implementiert; ob Migration,
Scheduler, Secrets und Functions in einer konkreten Supabase-Umgebung
tatsächlich aktiv sind, muss getrennt belegt werden. Auf dem iPhone geht Web
Push nur aus der installierten Home-Bildschirm-App. Einrichtung in
[BENACHRICHTIGUNGEN.md](BENACHRICHTIGUNGEN.md), weitere Kandidaten in
[IDEEN.md](IDEEN.md).

Design und Begründungen stehen in [DESIGN.md](DESIGN.md).

Der Tab `noten` hält den aktuellen, noch nicht nach Schulhalbjahren getrennten
Datenstand in Notenpunkten von 0 bis 15 fest.
Die Fächer und jeweils drei Leistungsfächer stammen aus den Stundenplänen von
Erijon und Koray; ein Tipp auf eine der 16 Punktzahlen trägt ohne
Speichern-Knopf ein. Fachschnitte, direkter Vergleich und die ausdrücklich als
Hochrechnung bezeichnete Abiprognose funktionieren auch im Prototyp-Modus. Sie
ist keine Zeugnis- oder Zulassungsberechnung: Mangels Halbjahresdaten setzt sie
den aktuellen Fachschnitt für die späteren Einbringungen und Prüfungen ein.
Die verwendeten MSS-Konstanten folgen der offiziellen RLP-Fassung für Abitur
2027: 36 Kurse, zwei der drei Leistungsfächer doppelt, Block I mit `40/44`,
Block II aus genau drei schriftlichen LK und einem mündlichen GK, jedes
Ergebnis fünffach, sowie die amtliche Punktetabelle. Quellen,
Hochrechnungsgrenzen und aktuelle Datenverträge stehen in
[NOTEN-PLAN.md](NOTEN-PLAN.md#aktueller-vertrag).

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
npm ci
npm run dev
```

Läuft auf `http://localhost:5199`.

```bash
npm run typecheck   # TypeScript ohne Build
npm test            # Vitest; aktuelle Zahl steht im jeweiligen Lauf
npm run check:edge  # Deno-Check der produktiven Edge Functions
npm run check:web   # Tests + Web/PWA + Artefaktprüfung
npm run check       # check:web + check:edge, ohne Deployment
npm run build:web   # TypeScript + Web/PWA
npm run build:pages # strenge Pages-Konfiguration + Web/PWA + Artefaktprüfung
npm run build:sites # Root-Prototyp + separater Sites-Worker
npm run benchmark:core # Sites-Prototyp bauen + 430x932-Core-Flow in Chrome messen
```

`npm run build` ist nur der Alias für `build:web`; es erzeugt keinen
Sites-Worker und validiert keine Pages-Umgebungswerte.
`benchmark:core` schreibt ausschließlich in den frisch gebauten lokalen
Prototyp und prüft zehn Kerninteraktionen; es ist kein physischer Geräte- oder
Produktionsbeleg.

Die lokale und die CI-Laufzeit ist über [`.node-version`](.node-version) auf
Node `22.23.2` festgelegt. `npm run check:edge` benötigt zusätzlich Deno; die
CI-Version steht in den Workflows. Der Edge-Check verwendet
[`supabase/functions/deno.lock`](supabase/functions/deno.lock) im Frozen-Modus:
Importänderungen müssen den Lockfile bewusst und reviewbar aktualisieren.
`npm run check` umfasst noch keinen echten PostgreSQL-/RLS-Lauf, keinen
Browser-E2E-Test und keine physische Geräteprüfung. Die genaue Beweisgrenze der
Umgebungen steht im
[Release- und Migrationsrunbook](docs/release-und-migrationen.md).

## Supabase

Projekt `vierfelder` (der technische Name blieb bei der Umbenennung stehen, siehe unten), Region eu-central-1, Ref `ogxwazageufvalkocywh`.

**Wichtig:** `supabase/schema.sql` ist derzeit ein historischer Grundstands-Snapshot,
nicht die alleinige Schemaautorität. Die produktive Migrationshistorie und die lokalen
Dateinamen weichen nachweislich voneinander ab. Bis zur dokumentierten Reconciliation darf
deshalb weder ein normaler `db push` noch eine produktive Migration aus diesem Checkout
ausgeführt werden. Der einzige operative Ablauf ist das
[Release- und Migrationsrunbook](docs/release-und-migrationen.md).

Der Schlaf liegt seit dem 01.09.2026 in zwei Schichten: `schlafnaechte` hält die Rohsegmente und ist für niemanden außer der Importfunktion lesbar, `schlaf_updates` hält die Kennzahlen samt fertig gerechnetem Nachtwert. Die App liest ausschließlich `schlafnaechte_ansicht` darüber — Kennzahlen und Phasen, keine Rohdaten. Der Nachtwert entsteht in einem Trigger, damit Edge Function und Kurzbefehl nicht zwei verschiedene Zahlen für dieselbe Nacht speichern können; Grenzen und Rechnung stehen in [SCHLAF-KURZBEFEHL.md](SCHLAF-KURZBEFEHL.md).

Die Tabelle `einheiten` hält eine Zeile je Durchführung (`supabase/migrations/20260830190000_einheiten.sql`).
Sie ist die Quelle des Hakens — mindestens eine Einheit heißt erledigt —, liegt offen für beide
Konten und wird über Realtime verteilt. Die `id` erzeugt der Client, damit ein wiederholter
Schreibversuch keine zweite Einheit anlegt. `eintraege` und `werte` bleiben als Altbestand
stehen: die Migration übernimmt sie verlustfrei und erfindet dabei keine Minuten. Fehlt die
Tabelle in einer Umgebung noch, läuft die App im Altbestandsmodus weiter (eine Einheit pro
Tag, kein `+ einheit`), statt leer auszusehen. Die sichere Reihenfolge von Datenbank,
Functions und Webbuild steht ausschließlich im Release-Runbook.

Ein Undo eines gelöschten Tags stellt alle zugehörigen Einheiten als einen
atomaren, idempotenten Batch wieder her. Lokal geschieht das unter einem Web
Lock mit höchstens einem Speicherschreibzug; im Supabase-Modus über die RPC
`stelle_einheiten_wieder_her`. Ein fehlender RPC-Vertrag fällt nicht auf
Einzelinserts zurück. Migration und echte Parallelitäts-/RLS-Prüfung in
Staging bleiben davon getrennte Freigabeschritte.

Die Tabelle `gewicht` liegt wie `eintraege` offen für beide Konten — der Vergleich ist der
Zweck. Änderungen werden über Realtime verteilt. Es gibt keine zweite Zeile in `eintraege`: der Wochentick
fürs Wiegen wird aus dem Gewichtseintrag abgeleitet, damit es keinen Tick ohne Messung gibt.

Der gemeinsame Wetteinsatz wird mit Expected-Version-CAS geändert. Ein
Entfernen bleibt als Tombstone mit servergenerierter Version, Autor und
Zeitpunkt auditierbar; nach einem Wochenabschluss ist die Wette unveränderlich.
Direkte Tabellenwrites werden in der vorbereiteten Forward-Migration entzogen.

`faecher` und `noten` beginnen in
`supabase/migrations/20260901181045_noten.sql`; spätere Forward-Migrationen
stellen auf die echten Begriffe `lk`, `gk`, `klausur`, `epo` und `hue` um,
entfernen das erfundene Erdkunde-Fach und begrenzen die Auswahl auf drei LK
plus einen mündlichen GK. Beide Konten dürfen beide Stände lesen. Noten darf
jedes Profil nur für sich anlegen oder löschen; der Wechsel des vierten
Prüfungsfachs ist als atomare RPC vorbereitet. Migration und Staging-Beleg sind
davon getrennte Freigabeschritte.

Die Schlafintegration nutzt eine Edge Function mit einem eigenen, pro Person
gehashten Import-Token. Migration, Function und die vollständige iPhone-Anleitung
stehen in [SCHLAF-KURZBEFEHL.md](SCHLAF-KURZBEFEHL.md).

Die Edge Function `fokus` ist der schmale Aufrufweg der Fokus-Automationen.
Der aktuelle Aufbau sendet das Import-Token im Header und lässt in der URL nur
Bereich und Ereignis, etwa `/fokus?b=lernen&e=an`. Die Function schreibt
nichts selbst, sondern ruft
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

Der folgende Block ist ein kontrollierter Provisionierungsweg für einen
Neuaufbau oder eine Wiederherstellung, kein in Produktion regelmäßig zu
wiederholender Setup-Schritt. Remote-Auth-Einstellungen, Nutzeranlage,
Profiländerungen und Passwortvergabe benötigen ein verifiziertes Ziel und eine
ausdrückliche Freigabe.

1. Vorher im Dashboard prüfen, dass öffentliche Registrierung und anonyme
   Anmeldung deaktiviert sind. `supabase/config.toml` beschreibt diesen
   Sollzustand, verändert aber keine laufende Remote-Konfiguration. Der letzte
   dokumentierte Read-only-Audit fand Remote-E-Mail-Signup noch aktiviert;
   bis zum freigegebenen Abschalten und erneuten Negativtest bleibt das ein
   Produktions-Releaseblocker.
2. Dashboard → Authentication → Add user → Create new user. Genau die zwei
   vereinbarten Konten anlegen, bei beiden **Auto Confirm User** anhaken — sonst
   lehnt die Anmeldung mit „email not confirmed" ab.
3. Danach die beiden Zuordnungen im SQL Editor ausdrücklich einzeln anlegen.
   Es gibt bewusst keinen `else`-Zweig: eine unbekannte E-Mail darf niemals zu
   Koray werden.

```sql
begin;

insert into public.profile (id, person)
select id, 'erijon'
from auth.users
where lower(email) = lower('ERIJONS_ECHTE_EMAIL')
on conflict (id) do update set person = excluded.person;

insert into public.profile (id, person)
select id, 'koray'
from auth.users
where lower(email) = lower('KORAYS_ECHTE_EMAIL')
on conflict (id) do update set person = excluded.person;

do $$
begin
  if (select count(*) from auth.users) <> 2
     or (select count(*) from public.profile where person in ('erijon', 'koray')) <> 2
     or not exists (
       select 1
       from auth.users u join public.profile p on p.id = u.id
       where lower(u.email) = lower('ERIJONS_ECHTE_EMAIL') and p.person = 'erijon'
     )
     or not exists (
       select 1
       from auth.users u join public.profile p on p.id = u.id
       where lower(u.email) = lower('KORAYS_ECHTE_EMAIL') and p.person = 'koray'
     )
     or exists (
       select 1 from auth.users u
       left join public.profile p on p.id = u.id
       where p.id is null
     )
  then
    raise exception 'erwartet werden genau zwei zugeordnete auth-nutzer';
  end if;
end
$$;

commit;
```

4. Die Zuordnung lesend prüfen, erst dann App neu laden und anmelden:

```sql
select u.id, u.email, p.person
from auth.users u
left join public.profile p on p.id = u.id
order by u.email;
```

Ohne Zeile in `profile` meldet die App: „kein profil für dieses konto".

## Hosting (GitHub Pages)

Live: <https://misinierijon4-debug.github.io/vierfelder/>

Jeder Push auf `main` baut und veröffentlicht neu (`.github/workflows/pages.yml`). Pull Requests
und Arbeitsbranches laufen vorher unabhängig durch `.github/workflows/ci.yml`. Der Pages-Workflow
setzt den unveränderlichen PWA-Unterpfad `VITE_BASE=/vierfelder/` selbst und verlangt die
Repository-Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY`. Fehlende Werte,
eine andere Key-Klasse oder ein `sb_secret_` in einer `VITE_*`-Variable brechen den Build ab,
statt still den Prototypmodus auszuliefern.

Auf dem kostenlosen Plan muss das Repository öffentlich sein. Die Seite ist damit für jeden
erreichbar, der die URL kennt. Die Anwendungsdaten sollen hinter Anmeldung,
Zwei-Personen-Mitgliedschaft und RLS liegen. Weil der letzte Read-only-Audit
offene E-Mail-Registrierung und noch nicht migrierte Policies fand, ist dieser
Zielvertrag produktiv noch nicht vollständig belegt; Details stehen in der
[Rollenmatrix](docs/architektur-und-datenschutz.md#rollen--und-datenschutzmatrix).
URL und Publishable Key stehen im gebauten JavaScript; das ist so vorgesehen,
beide sind öffentliche Werte und ersetzen keine Autorisierung.

Der Sites-Build ist eine getrennte, ausdrücklich lokale/prototypische Vorschau
am Root-Pfad. Ein erfolgreicher Sites-Worker ist weder ein Pages-Deploy noch ein
Supabase-Nachweis.

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

Die vollständige Browser→Store→Backend→Datenbank→Realtime-Karte, der
Offline-/PWA-Vertrag und die Rollen-/Datenschutzmatrix stehen in
[docs/architektur-und-datenschutz.md](docs/architektur-und-datenschutz.md).

Das Supabase-Backend läuft nur, wenn `VITE_SUPABASE_URL` und
`VITE_SUPABASE_PUBLISHABLE_KEY` gesetzt sind. Ohne beide Werte startet die lokale App im
ausdrücklich gekennzeichneten Prototypmodus; ein Pages-Produktionsbuild lässt diesen Fallback
nicht zu.

Im Supabase-Modus bedeutet eine installierte, offline startende PWA nicht, dass
neue Einträge offline sicher vorgemerkt werden. Die Oberfläche ist gecacht;
bekannte Mutationen werden ohne sichere Warteschlange gesperrt. Eine neue
App-Version wartet auf ausdrückliche Aktivierung und darf offene Eingaben nicht
unangekündigt neu laden.
