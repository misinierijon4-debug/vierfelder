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

**JS-Budget immer mit dem Pages-Build messen**, nicht mit `build:web`: ohne
Supabase-Variablen fehlt der Supabase-Chunk (~72 KiB gzip), `check:dist` ist
dann grün, während der Pages-Deploy auf `main` am Gesamtbudget scheitert und die
App still auf der alten Fassung bleibt. Die CI auf dem Branch fängt das nicht:

```bash
VITE_BASE=/vierfelder/ VITE_SUPABASE_URL=https://ogxwazageufvalkocywh.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_x CHECK_NO_SERVER=1 npm run build:pages
```

Nach dem Push auf `main` den Lauf `pages` in GitHub Actions prüfen (Ergebnis
des Laufs selbst, keine Zusammenfassung der Webseite).
Die CI (`.github/workflows/ci.yml`) fährt genau diese Reihenfolge:
`check:agentendoku → typecheck → test → check:edge → build:web → check:dist`.
Es gibt **keinen Linter** und **kein Formatierwerkzeug** — Stil der Nachbardatei
übernehmen.

## Wo was liegt

```
src/lib/          104 Dateien: gesamte Logik + Tests (*.test.ts neben der Datei)
src/components/    75 Dateien: Oberfläche, Unterordner eni/ noten/ schlaf/ duell/
supabase/migrations/   54 SQL-Dateien, Name: YYYYMMDDHHMMSS_thema.sql
supabase/functions/    Edge Functions (Deno), gemeinsamer Code in _shared/
supabase/schema.sql    Gesamtstand der Tabellen — schneller als Migrationen lesen
scripts/               Bau- und Prüfskripte (.mjs), von package.json aufgerufen
docs/                  Architektur, Datenschutz, Release-Runbook
```

Tabellen: `profile`, `eintraege`, `werte`, `einheiten`, `aufenthalte`,
`schlafnaechte`, `gewicht`, `duell_wetten`, `duell_ansagen`, `faecher`, `noten`,
`schlaf_import_tokens`, `wochenberichte`, `wochenbericht_texte`
(+ `eni_*` aus späteren Migrationen).

## Sprungtabelle: Aufgabe → Datei

| Thema | Zuerst öffnen |
| --- | --- |
| Zustand, optimistisches Schreiben, Rücknahme | `src/lib/store.ts` (1735 Z.) |
| Supabase-Zugriff, Realtime, Anmeldung | `src/lib/supabase.ts` (2086 Z.) |
| Prototypmodus ohne Supabase | `src/lib/lokal.ts` |
| Backend-Interface (beide Modi erfüllen es) | `src/lib/backend.ts` |
| Ticks, Einheiten, Wochenwertung | `src/lib/tracker.ts` |
| **Punktezählung des Duells, eine Stelle für alle** | `supabase/functions/_shared/duellPunkte.ts` |
| Wochenschluss: Messung über Sonntag 24 Uhr zählt nicht | `vorWochenschluss` in `src/lib/training.ts`, `endetInDerWoche` in `duellPunkte.ts`, Migration `*_wochenschluss_mitternacht.sql` |
| **Fokus an/aus, Einheitenzählung** | `supabase/functions/_shared/fokus.ts`, `supabase/functions/fokus/index.ts`, `src/lib/fokusFunction.test.ts`, `FOKUS-KURZBEFEHL.md` |
| Anzeige von Einheiten und Quelle | `src/components/Raster.tsx`, `src/components/Tagesdetail.tsx` |
| Tastaturfokus in Dialogen (**nicht** das Fokus-Feature) | `src/lib/dialogFokus.ts` |
| Standort/Aufenthalt → Ticks | `src/lib/training.ts` |
| Gewicht (Schnitt, Achse, Parsen) | `src/lib/gewicht.ts`, `src/components/Gewichtsdiagramm.tsx` |
| Schlafphasen, Hypnogramm | `src/lib/schlafPhasen.ts`, `src/lib/nachtkurve.ts` |
| Schlafimport (Health) | `supabase/functions/schlaf-import/index.ts`, Nachtwahl und Upsert in der Datenbank (`record_sleep_night` → `_internal`); gespeicherte Nacht nie kürzen: Migration `*_schlaf_nacht_nicht_kuerzen.sql`; jede Nacht im Fenster, Segmentgrenze `_slfn_max_segmente()`: `*_schlaf_alle_naechte.sql` |
| Noten, MSS-Regeln Abi 2027 | `src/lib/noten.ts`, `src/components/noten/` |
| Duell, Wetten, Druckstatus | `src/lib/duell.ts`, `src/components/duell/` |
| **Ansagen** (Herausforderung mit Stufe, Kontern, „du auch“): Regeln und Client-Rechnung | `src/lib/ansagen.ts`, `docs/ansagen.md` |
| Ansagen: Server (Ziel je Stufe, Reaktion, Einfrieren So 18 Uhr, Abrechnung v3, Push) | Migration `*_ansagen_stufen.sql` (erste Fassung: `*_duell_ansagen.sql`; Reaktion kostet eine Ansage: `*_ansagen_reaktion_kostet.sql`), Prüfskript `scripts/check-ansagen-stufen.mjs` |
| Ansagen: Oberfläche und ENI-Sprüche | `src/components/duell/AnsagenBereich.tsx`, `AnsageKarte.tsx`, `AnsageSheet.tsx`, `AnsageHinweis.tsx`, Texte `src/lib/ansageAnzeige.ts`, `src/lib/ansageSprueche.ts`, `supabase/functions/_shared/ansageSprueche.ts` |
| Rivalitäts-Badge, Freitext-Zuordnung, Tonfall (classifier.dev) | `src/lib/duellBadge.ts` (Startpfad), `src/lib/duellKlassifizierung.ts` (nachgeladen), `src/components/duell/RivalitaetsTicker.tsx` |
| **ENI Leseposition und Stream-Abschluss** | `src/components/eni/useEniScroll.ts` hält die Leseposition beim Hochscrollen; Knopf zur neuesten Antwort in `EniApp.tsx`. Bereits gestreamte Antworten werden dort beim Speichern nicht nochmals als frische Wortanimation markiert. Tests neben dem Hook und in `EniApp.test.tsx`. |
| **ENI Menüs und kurze Rollennamen** | `EniMenue.tsx` sperrt ausblendende Menüs, `menueBewegung.ts` teilt den Takt; `eni-menue` / `eni-menue-zeile` in `src/index.css` teilen die Form. `EniRollenwahl.tsx` kürzt nur unveränderte Vorlagennamen sichtbar; gespeicherte und zugängliche Namen bleiben vollständig. |
| **ENI Eingabeleiste auf schmalen Geräten** | `EniEingabe.tsx`: Stopp ersetzt beim Antworten Senden, Rollen nutzen den freien Platz, Diktatvorschau steht unter den Werkzeugen. `EniRollenwahl.tsx` kürzt lange Namen im verfügbaren Platz. Browserprüfung mit synthetischen Daten: `scripts/check-eni-eingabe-browser.mjs` (320–1280px, auch geringe Höhe). |
| ENI (KI-Assistent) Oberfläche | `src/components/eni/EniApp.tsx` (1136 Z.) |
| **ENI anpassen** (Ton, Antwortlänge, eigene Anweisungen, Rollen wie „Ernährungsberater“) | Seite `src/components/eni/EniEinstellungen.tsx`, Laden/Speichern + Vorschau `src/lib/eniEinstellungen.ts`, Vorlagen + Prompt-Block `supabase/functions/_shared/eniEinstellungen.ts` (gelesen in `eniModell.ts`), Tabelle `eni_einstellungen` (Migration `*_eni_einstellungen.sql`, RLS-Prüfung `scripts/check-eni-einstellungen-rls.mjs`) |
| **Rolle als Person, „Wer bist du?“** (ENI ist dann z. B. Muhammad Ali, nicht „ENI, dein Begleiter“; Person ohne Thema gilt immer) | Blöcke `ROLLEN`, `PERSONEN`, `WER BIST DU` in `einstellungenText` (`supabase/functions/_shared/eniEinstellungen.ts`), Verweis darauf in `WESEN` (`eniCharakter.ts`); Tests `src/lib/eniEinstellungen.test.ts`. Wirkt erst nach Deploy der Function `eni`. |
| **Rollen recherchieren** (ENI liest sich in eine Person wie Aajonus oder Muhammad Ali ein und legt eine Akte an; nur Webrecherche, kein Buch-Upload) | Schritte, Prompts, Akte: `supabase/functions/_shared/eniRecherche.ts`; Worker, Tavily mit ganzem Seitentext, Wikipedia, kostenloses Modell `qwen-flash`: `_shared/eniRechercheHandler.ts` + Function `eni-recherche` (`verify_jwt: false`, Cron jede Minute mit dem Scheduler-Geheimnis von `aktivitaets-erinnerung`); Tabelle, Start/Abbruch, Sperre: Migration `*_eni_rollen_wissen.sql`, Prüfung `node scripts/check-eni-rollen-wissen.mjs <pglite>`; Akte im Chat (Abschnitte passend zur Nachricht, Regel gegen erfundene Zitate): `_shared/eniRollenWissen.ts`, gelesen in `eniModell.ts`; Zitate prüft der Code (`pruefeZitate` in `eniRecherche.ts`, gegen die gelesene Seite und gegen die Notizen; Buchtitel und Kurzes bleiben), beim Kürzen der Akte bleiben Kurzprofil, „Was belegt ist“ und „Grenzen“ (`GESCHUETZT`); Wortvergleich über Stammwörter (`_shared/eniWorte.ts`, erste fünf Buchstaben, auch für `waehleWissen`); Oberfläche `src/components/eni/EniRollenWissen.tsx`, App-Seite `src/lib/eniRollenWissen.ts` |
| **Rollenknopf am Chat** (kleines Popup, eigene Rollen, dieselbe Auswahl wie in „ENI anpassen“) | `src/components/eni/EniRollenwahl.tsx`, Slot in `EniEingabe.tsx`; Speicherereignis `EINSTELLUNGEN_GESPEICHERT` in `src/lib/eniEinstellungen.ts` hält beide Ansichten synchron. |
| **ENI-Gedächtnis** (Menüpunkt „das weiß ENI über mich“, Zeile in „ENI anpassen“, „merken“ im Chat): Seite, Formular, was „ruht“ | `src/components/eni/EniWissenDialog.tsx`, `EniWissenEditor.tsx`, Ordnen/Fristen `src/lib/eniWissenAnsicht.ts`, Speichern `src/lib/eniWissen.ts`, Regel `wirktNoch` + Auswahl für den Prompt `supabase/functions/_shared/eniWissen.ts`, Browser-Smoke `scripts/check-eni-wissen-browser.mjs` |
| **ENI-Lage** (die Zahlen im Prompt: Wochenstand, Ansagen, Serie je Feld, Zeit der Woche, abgeschlossene Wochen und Bilanz, Gewichtstrend, Schlafschnitt, Noten je Person) | `supabase/functions/_shared/eniLage.ts`, Tests `src/lib/eniLage.test.ts`. Gemessene und erfasste Minuten werden nie addiert (beides kann denselben Termin meinen); abgeschlossene Wochen werden aus `wochenabrechnung` gelesen, nicht neu gerechnet; die Serie nutzt dieselbe `tafelAusZeilen` wie der Wochenstand, nur fünf Wochen breit. Wirkt erst nach Deploy der Function `eni`. |
| ENI Modell, Stream, Websuche | `supabase/functions/_shared/eni*.ts`, `supabase/functions/eni/index.ts` |
| **ENI Chatgedächtnis und Antwortlänge** (wie viel Verlauf mitgeht, wie lang eine Antwort sein darf) | `KONTEXT_NACHRICHTEN`, `VERLAUF_ZEICHEN_BUDGET`, `imVerlaufsbudget`, `MAX_TOKENS` in `supabase/functions/_shared/eniModell.ts`; Spaltengrenze `eni_nachrichten.text` in Migration `*_eni_antworten_laenger.sql` (muss vor der Function stehen) |
| **Function `eni` ausrollen** | `docs/release-und-migrationen.md`, Abschnitt „Version 44: Deploy aus dem Commit“ — eine Zeile, die den gemergten Commit von raw.githubusercontent.com lädt; kein Bundle abschreiben |
| **Im Chat automatisch merken und korrigieren** (natuerliche Bitte auch am Satzende; „das“ bezieht sich nur auf die letzte Nutzerangabe; kurze Korrekturen bearbeiten die im Chat bestaetigte eigene Erinnerung, Bestätigung erst nach Schreibvorgang) | `supabase/functions/_shared/eniMerken.ts`, Speicherweg in `eniModell.ts`, Tests `src/lib/eniMerken.test.ts` und `eniModellFunction.test.ts`. Persönliches Wissen wird unabhängig vom Routing geladen, damit Vorlieben auch bei Sachfragen wirken. |
| **ENI automatische Websuche** (kein Schalter; Aktualität, Rückfragen, privater Suchtext, 6-Sekunden-Entscheidung) | `supabase/functions/_shared/eniSuchplan.ts`, Handler `eniModell.ts`, Tests `src/lib/eniSuchplan.test.ts` und `eniModellFunction.test.ts`. Die Entscheidung läuft parallel zur schon begonnenen Antwort (siehe ENI-Tempo). Ein bloßes „such im Internet“ (`ohneGegenstand`) geht nie wörtlich raus, das Thema kommt aus dem Verlauf; der Entscheider kennt die aktiven Rollen (`suchplanRollen`, „dein Buch“ = Werk der Person) und darf eine zweite Formulierung `ersatz` liefern, die nur bei leerem Treffer (`EniWebLeer`) läuft. Wie entschieden wurde, steht als `planweg` in `eni: zeiten`. |
| **ENI Antwortstil / Lesbarkeit** (Telegrammstil, „unmenschlich“, zu viel Fett) | Prompt: Block `LESBARKEIT` und Längenregel in `STIMME` in `supabase/functions/_shared/eniCharakter.ts` (Test `src/lib/eniCharakter.test.ts`, wirkt erst nach Deploy der Function `eni`). Darstellung: `StrukturierterText` in `src/components/eni/EniStrom.tsx` — nur ein kurzer erster Satz (`KERNSATZ_MAX`) steht als halbfette Schlagzeile. |
| **ENI-Tempo** (was vor dem ersten Wort passiert: parallele Abfragen, Kontext nebenher, Vorab-Start mit Puffer) | `behandleEni` in `supabase/functions/_shared/eniModell.ts` (`kontextBereit`, `beginneVorab`), Tests „ENI beginnt, waehrend die suchentscheidung noch laeuft“ in `src/lib/eniModellFunction.test.ts`. Messung: Zeile `eni: zeiten {…}` im Function-Log (nur Dauern). Ein vorgeschaltetes Intent-Routing gibt es nicht mehr — es kostete 2–3 s und lieferte nie ein Urteil. |
| ENI Sprachausgabe/Diktat | `src/lib/eniStimme.ts`, `src/lib/eniDiktat.ts` |
| **ENI beim Lernen: Formeln, Tabellen, Abfragen** | Formeln: LaTeX→MathML in `src/lib/eniFormel.ts` (kein KaTeX, Budget; unbekannter Befehl → ganze Formel als Quelltext, also dort ergänzen), Zellabstand und Ausrichtung von Matrizen/`cases`/`aligned` per CSS in `src/index.css`, Darstellung, Fettdruck um Formeln und Markdown-Tabellen in `src/components/eni/EniStrom.tsx`; Prompt-Block `LERNEN` in `supabase/functions/_shared/eniCharakter.ts` (wirkt erst nach Deploy der Function `eni`); Einstieg „frag mich ab“ im leeren Chat |
| ENI Wochenvorlage (Wortlaut wird wiedererkannt) | `supabase/functions/_shared/eniVorlagen.ts` |
| **ENI schlägt Einträge vor** (Einheit, Gewicht, Ansage; Karte mit Knopf, erst der Tipp schreibt) | Format und Prüfung `src/lib/eniAktion.ts` (feste id je Vorschlag → kein Doppeleintrag), Karte `src/components/eni/EniAktionKarte.tsx`, Block ```` ```aktion ```` in `EniStrom.tsx`, Backend kommt über `EniTor` aus `App.tsx` und wird vor der ersten Aktion einmal `laden()`; Prompt-Block `AKTIONEN` in `eniCharakter.ts`. Der Server schreibt nie selbst. Vierte Art `erinnerung` (Aufgabe mit Frist → Push am Morgen, oder Merken von Kontext, Vorliebe, Methode): Prüfung `liesFrist`/`pruefeAktion`, Schreiben `fuehreErinnerungAus` + `legeErinnerungAn` (`src/lib/eniWissen.ts`, feste id, Doppeltipp ist kein Fehler); Stil-Erinnerungen schlägt ENI nicht vor. Ein ausdrücklicher Merkauftrag geht weiter über `eniMerken.ts`, nicht über die Karte. |
| **Wochenbericht: Zahlen** (rechnet der Client, nie ENI) | `src/lib/wochenbericht.ts` |
| Wochenbericht: Blatt, Diagramme, Zeile im Kalender | `src/components/wochenbericht/` (Zeile: `BerichtZeile.tsx`, dort auch `KALENDER_SPALTEN`) |
| Wochenbericht: Archiv, Montag-Abschluss und ENI-Texte | `src/lib/wochenberichtArchiv.ts`, `supabase/functions/wochenbericht/index.ts`, `supabase/functions/_shared/wochenberichtHandler.ts`, `docs/wochenbericht.md` |
| **Wochenbericht: letzte Nacht nachtragen, Montagsmeldung** | Migration `*_wochenbericht_nachtrag_push_und_persoenliche_texte.sql`, `src/lib/wochenberichtNachtragMigration.test.ts`, `scripts/check-wochenbericht-archiv.mjs` |
| Wochenbericht: gemeinsames Textschema | `supabase/functions/_shared/wochenberichtTexte.ts` (Client-Reexport: `src/lib/wochenberichtTexte.ts`) |
| Adressen der App (`#/eni`, `#/bericht`) | `src/lib/eniRoute.ts` |
| **ENI als eigenes Homescreen-Symbol** (`/vierfelder/eni.html`, eigenes Manifest und Zeichen) | Plugin `eniEinstieg` in `vite.config.ts` (leitet `eni.html` aus der gebauten `index.html` ab), `public/eni.webmanifest`, Zeichen `eni-*.png` aus `scripts/icons.py`, Prüfung in `scripts/check-web-build.mjs` |
| Push, Erinnerungen, VAPID | `src/lib/push.ts`, `src/lib/erinnerung.ts`, `supabase/functions/_shared/versand.ts` |
| Push-Arten, Sendefenster, Schalter | `supabase/functions/_shared/aktivitaetsVersand.ts`, `src/lib/aktivitaetsErinnerung.ts` |
| **Neue Push-Art bauen** — Migration **und** Worker, sonst still übersprungen | `docs/wochenbericht.md` („Der Worker musste mit") |
| **ENI meldet sich** (Sonntagsstand mit offenen Feldern und Ansagepunkten ab 18:10; fällige Aufgaben aus ENIs Gedächtnis 08:30–10:00) | Migration `*_eni_meldungen.sql` (CTEs `ansage_punkte`, `offene_felder`, `alter_wochenblick`, `faellige_aufgaben`), Fenster in `istNochImFenster` (`aktivitaetsVersand.ts`), Schalter `aufgabe_aktiv` in `src/lib/aktivitaetsErinnerung.ts`; Prüfung `src/lib/eniMeldungenMigration.test.ts` und `node scripts/check-eni-meldungen.mjs <pglite>` |
| Kalenderraster (Tracker + Schlaf) | `src/lib/kalender.ts` |
| Animationsdauern (alle an einer Stelle) | `src/lib/motion.ts` |
| Tabs, oberste Verdrahtung | `src/App.tsx`, `src/components/TabLeiste.tsx` |
| Typen (`AreaId`, `UserId`, `AppTab`, …) | `src/lib/types.ts` — **klein, immer zuerst lesen** |
| **Tempo:** Sitzungsindex, Tabs im Baum (`<Activity>`), `memo` | `src/lib/training.ts` (`sitzungsindex`), `src/App.tsx`, `scripts/benchmark-core-flow.mjs` |

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
8. **Tempo wächst nicht mit der Historie.** Was je Render oft gefragt wird
   (`istGesetzt`, `streak`, Raster, Kalender, Bericht), läuft nie je Aufruf
   durch alle `aufenthalte` oder `einheiten`: Tagesfragen zu Messungen
   beantwortet der Index in `training.ts`. Alle Tabs bleiben als eigene
   `<Activity>` im Baum — Tests und Skripte prüfen deshalb auf Sichtbarkeit,
   nicht nur auf Vorhandensein. Kinder mit `memo` brauchen stabile Handler
   (`useCallback`/`useMemo`), sonst rendern sie trotzdem bei jedem Tap.

## Commits und Branch

Commit-Stil: `typ(bereich): kleingeschriebene aussage` — z. B.
`fix(eni): zeige webquellen nur einmal`, `feat(noten): …`, `docs(release): …`.
Arbeit läuft auf einem Branch mit Pull Request. **Wunsch von erijon:** Wenn
die Änderung klar ist und `npm run check` (plus nötige Prüfskripte) grün ist,
kommt sie **direkt auf `main`** — PR mergen bzw. ohne Rückfrage einspielen.
Nur bei Zweifeln, offenen Fragen oder riskanten Eingriffen (Produktivdaten,
Migrationen mit Datenänderung) erst nachfragen.

## Weiterführend (nur bei Bedarf öffnen — die Dateien sind groß)

- `README.md` — Aufbau, Supabase-Einrichtung, Hosting
- `docs/architektur-und-datenschutz.md` — Datenfluss, Offline-Vertrag, Rollenmatrix
- `docs/release-und-migrationen.md` — Release- und Migrationsrunbook
- `DESIGN.md` (113 KB) — Gestaltungsentscheidungen, **nur gezielt greppen**
- `BENACHRICHTIGUNGEN.md` — Push und VAPID
- `FOKUS-KURZBEFEHL.md`, `SCHLAF-KURZBEFEHL.md`, `GEWICHT-KURZBEFEHL.md` — iOS-Kurzbefehle
