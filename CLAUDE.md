# Wegweiser für Agenten

Diese Datei ersetzt das Absuchen des Repos. **Erst hier nachschlagen, dann
gezielt eine Datei öffnen.** Nur wenn die Antwort hier fehlt, breit suchen —
und danach diese Datei ergänzen.

Es gibt sie dreimal, damit jedes werkzeug sie findet: `CLAUDE.md` (Claude Code),
`AGENTS.md` (Codex) und `GEMINI.md` (Gemini CLI). Die drei dateien sind
zeichengleiche kopien — **keine symlinks**, weil git die unter Windows zu einer
9-byte-textdatei macht und das werkzeug dann still nichts liest.

**Immer `CLAUDE.md` bearbeiten**, danach `npm run sync:agentendoku`. Die CI
prüft mit `npm run check:agentendoku`, dass die drei gleich sind.

## Was das ist

`zweikampf` (Supabase-Projekt heißt `vierfelder`): eine private PWA für zwei
Personen (`erijon`, `koray`). Vier antippbare Bereiche — `lernen`, `gym`,
`boxen`, `lesen` — plus Gewicht, Schlaf, Noten, Duell und den KI-Assistenten
ENI. React 19 + TypeScript + Vite + Tailwind 4, Backend Supabase
(PostgREST, Realtime, Edge Functions auf Deno).

Sprache im Code: **deutsch**. Bezeichner, Dateinamen und Kommentare sind
deutsch, Kommentare meist kleingeschrieben. Neuer Code macht das genauso.

## Befehle

```bash
npm ci                 # einmalig
npm run dev            # localhost:5199
npm run typecheck      # tsc -b, kein Build
npm test               # vitest run (TZ=Europe/Berlin ist fix gesetzt)
npm run check:edge     # deno check der produktiven Edge Functions
npm run sync:agentendoku  # CLAUDE.md nach AGENTS.md + GEMINI.md uebernehmen
npm run check          # alles, was die CI prüft
```

Vor jedem Push mindestens `npm run typecheck && npm test`.
Bei Änderungen unter `supabase/functions/` zusätzlich `npm run check:edge`.
Die CI (`.github/workflows/ci.yml`) fährt genau diese Reihenfolge:
`check:agentendoku → typecheck → test → check:edge → build:web → check:dist`.
Es gibt **keinen Linter** und **kein Formatierwerkzeug** — Stil der Nachbardatei
übernehmen.

## Wo was liegt

```
src/lib/          104 Dateien: gesamte Logik + Tests (*.test.ts neben der Datei)
src/components/    75 Dateien: Oberfläche, Unterordner eni/ noten/ schlaf/ duell/
supabase/migrations/   46 SQL-Dateien, Name: YYYYMMDDHHMMSS_thema.sql
supabase/functions/    Edge Functions (Deno), gemeinsamer Code in _shared/
supabase/schema.sql    Gesamtstand der Tabellen — schneller als Migrationen lesen
scripts/               Bau- und Prüfskripte (.mjs), von package.json aufgerufen
docs/                  Architektur, Datenschutz, Release-Runbook
```

Tabellen: `profile`, `eintraege`, `werte`, `einheiten`, `aufenthalte`,
`schlafnaechte`, `gewicht`, `duell_wetten`, `faecher`, `noten`,
`schlaf_import_tokens` (+ `eni_*` aus späteren Migrationen).

## Sprungtabelle: Aufgabe → Datei

| Thema | Zuerst öffnen |
| --- | --- |
| Zustand, optimistisches Schreiben, Rücknahme | `src/lib/store.ts` (1735 Z.) |
| Supabase-Zugriff, Realtime, Anmeldung | `src/lib/supabase.ts` (2086 Z.) |
| Prototypmodus ohne Supabase | `src/lib/lokal.ts` |
| Backend-Interface (beide Modi erfüllen es) | `src/lib/backend.ts` |
| Ticks, Einheiten, Wochenwertung | `src/lib/tracker.ts` |
| **Punktezählung des Duells, eine Stelle für alle** | `supabase/functions/_shared/duellPunkte.ts` |
| **Fokus an/aus, Einheitenzählung** | `supabase/functions/_shared/fokus.ts`, `supabase/functions/fokus/index.ts`, `src/lib/fokusFunction.test.ts`, `FOKUS-KURZBEFEHL.md` |
| Anzeige von Einheiten und Quelle | `src/components/Raster.tsx`, `src/components/Tagesdetail.tsx` |
| Tastaturfokus in Dialogen (**nicht** das Fokus-Feature) | `src/lib/dialogFokus.ts` |
| Standort/Aufenthalt → Ticks | `src/lib/training.ts` |
| Gewicht (Schnitt, Achse, Parsen) | `src/lib/gewicht.ts`, `src/components/Gewichtsdiagramm.tsx` |
| Schlafphasen, Hypnogramm | `src/lib/schlafPhasen.ts`, `src/lib/nachtkurve.ts` |
| Schlafimport (Health) | `supabase/functions/schlaf-import/index.ts` |
| Noten, MSS-Regeln Abi 2027 | `src/lib/noten.ts`, `src/components/noten/` |
| Duell, Wetten, Druckstatus | `src/lib/duell.ts`, `src/components/duell/` |
| Rivalitäts-Badge, Freitext-Zuordnung, Tonfall (classifier.dev) | `src/lib/duellBadge.ts` (Startpfad), `src/lib/duellKlassifizierung.ts` (nachgeladen), `src/components/duell/RivalitaetsTicker.tsx` |
| ENI (KI-Assistent) Oberfläche | `src/components/eni/EniApp.tsx` (1136 Z.) |
| ENI Modell, Stream, Websuche | `supabase/functions/_shared/eni*.ts`, `supabase/functions/eni/index.ts` |
| ENI Intent-Routing (was in den Prompt kommt) | `supabase/functions/_shared/eniRouting.ts`, `src/lib/eniRouting.test.ts` |
| ENI Sprachausgabe/Diktat | `src/lib/eniStimme.ts`, `src/lib/eniDiktat.ts` |
| ENI Wochenvorlage (Wortlaut wird wiedererkannt) | `supabase/functions/_shared/eniVorlagen.ts` |
| **Wochenbericht: Zahlen** (rechnet der Client, nie ENI) | `src/lib/wochenbericht.ts` |
| Wochenbericht: Blatt, Diagramme, Kalenderzeichen | `src/components/wochenbericht/` |
| Wochenbericht: die Saetze, die ENI dazu liefert | `src/lib/wochenberichtTexte.ts` |
| Push, Erinnerungen, VAPID | `src/lib/push.ts`, `src/lib/erinnerung.ts`, `supabase/functions/_shared/versand.ts` |
| Kalenderraster (Tracker + Schlaf) | `src/lib/kalender.ts` |
| Animationsdauern (alle an einer Stelle) | `src/lib/motion.ts` |
| Tabs, oberste Verdrahtung | `src/App.tsx`, `src/components/TabLeiste.tsx` |
| Typen (`AreaId`, `UserId`, `AppTab`, …) | `src/lib/types.ts` — **klein, immer zuerst lesen** |

Suchbefehl statt Stöbern: `git grep -n "begriff" -- src supabase`.

**Namensfalle:** `dialogFokus.ts` ist die Fokusfalle für Dialoge (Tastatur,
`inert`, `aria-hidden`) und hat **nichts** mit dem Fokus-Modus zu tun. Der
Fokus-Modus kommt vom iOS-Kurzbefehl in die Edge Function `fokus`; die
Oberfläche zeigt nur das Ergebnis aus `einheiten`/`aufenthalte`.

## Regeln

1. **Tests liegen neben der Datei** (`tracker.ts` → `tracker.test.ts`). Eine
   Logikänderung ohne angepassten Test ist unvollständig. Tests nie
   überspringen oder abschalten.
2. **Migrationen sind unveränderlich.** Eine angewandte Datei in
   `supabase/migrations/` nie bearbeiten — neue Datei mit neuem Zeitstempel.
   Ablauf steht in `docs/release-und-migrationen.md`.
3. **Edge Functions laufen auf Deno**, nicht auf Node: Importe mit `.ts`-Endung,
   keine npm-Pakete ohne Eintrag in `supabase/functions/deno.lock`. Der Lockfile
   läuft im Frozen-Modus.
4. **Nie ein `service_role`- oder `sb_secret_`-Geheimnis in eine `VITE_*`-
   Variable.** Vite liefert `VITE_*` an jeden Browser aus. Servergeheimnisse
   gehören in die Function-/Vault-Konfiguration.
5. **Zwei Datenmodi.** Ohne `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`
   startet der Prototypmodus (`lokal.ts`). Ein Pages-Produktionsbau lässt diesen
   Rückfall nicht zu. Neue Backend-Funktionen müssen in **beiden** Modi laufen.
6. **Zeit ist lokale Zeit.** Tagesschlüssel kommen aus `toKey` in
   `src/lib/dates.ts`, nie aus UTC-Zerlegung. Die Tests laufen fix in
   `Europe/Berlin`.
7. **Nur zwei Nutzer.** RLS trennt `erijon` und `koray`. Bei neuen Tabellen
   RLS-Regeln mitschreiben; Prüfskripte dafür liegen in `scripts/check-*-rls.mjs`.

## Commits und Branch

Commit-Stil: `typ(bereich): kleingeschriebene aussage` — z. B.
`fix(eni): zeige webquellen nur einmal`, `feat(noten): …`, `docs(release): …`.
Arbeit läuft auf einem Branch, nie direkt auf `main`; danach ein Pull Request.

## Weiterführend (nur bei Bedarf öffnen — die Dateien sind groß)

- `README.md` — Aufbau, Supabase-Einrichtung, Hosting
- `docs/architektur-und-datenschutz.md` — Datenfluss, Offline-Vertrag, Rollenmatrix
- `docs/release-und-migrationen.md` — Release- und Migrationsrunbook
- `DESIGN.md` (113 KB) — Gestaltungsentscheidungen, **nur gezielt greppen**
- `BENACHRICHTIGUNGEN.md` — Push und VAPID
- `FOKUS-KURZBEFEHL.md`, `SCHLAF-KURZBEFEHL.md`, `GEWICHT-KURZBEFEHL.md` — iOS-Kurzbefehle
