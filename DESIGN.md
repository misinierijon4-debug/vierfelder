# vierfelder — Designplan (zur Freigabe)

Stand: 26.08.2026. Kein Code, bis das hier freigegeben ist.

## 0. Ausgangslage im Repo

Der vorhandene Stand ist nicht nur generisch, er ist kaputt und einnutzerfähig:

- `src/index.css` definiert `papier / moos / tanne / gruen / glut`, `App.tsx` und `WeekGrid.tsx` benutzen `bg-page`, `text-ink`, `border-line`, `bg-canvas`, `bg-accent` — diese Klassen existieren nicht.
- `App.tsx` übergibt an `AreaTile` nicht die Props, die `AreaTile` verlangt (`weekKeys`, `todayKey`, `isDoneKey`). Der Build bricht.
- `papier #f2f2ea` + `glut #dd4826` ist creme + terrakotta — genau eine der verbotenen Kombinationen.
- Datenmodell (`types.ts`, `store.ts`, `tracker.ts`) kennt nur einen Nutzer und localStorage. Kein Supabase.

Bleibt: `src/lib/dates.ts`, das Vitest-Setup, `vite.config.ts` (PWA-Grundgerüst), Ordnerstruktur.
Wird ersetzt: Tokens, alle Komponenten, das komplette Datenmodell.

## 1. Die eine Designentscheidung

Die App hat zwei Nutzer. Also hat sie **zwei Identitätsfarben statt einem Akzent**: eine warme und eine kühle. Jede gefüllte Zelle im Raster trägt die Farbe dessen, der sie gefüllt hat. Man erkennt an der Farbe, wer wo steht, ohne einen Namen zu lesen.

Das ist bewusst gegen die übliche Regel "genau ein Akzent". Bei einer App für genau zwei Personen ist die Zweifarbigkeit kein Schmuck, sondern der Inhalt.

Die Bildsprache ist **Anzeigetafel**, nicht Notizbuch: dunkler Grund, Haarlinien, tabellarische Ziffern, keine Karten, keine Schatten.

## 2. Token-System

Fünf benannte Hex-Werte, alles andere abgeleitet über `color-mix`.

| Token | Hex | Rolle |
|---|---|---|
| `--grund` | `#14171C` | Untergrund, kühles Anthrazit (nicht `#000`) |
| `--flaeche` | `#1B2027` | leicht abgesetzte Fläche: Rasterkopf, Wertzeile |
| `--kreide` | `#E6E9E4` | Text hell (nicht `#fff`) |
| `--erijon` | `#F2C14E` | Erijon, warm |
| `--koray` | `#57B8A5` | Koray, kühl |

Abgeleitet:

```css
--kreide-60:  color-mix(in srgb, var(--kreide) 60%, var(--grund));
--kreide-38:  color-mix(in srgb, var(--kreide) 38%, var(--grund));
--linie:      color-mix(in srgb, var(--kreide) 14%, var(--grund));
--linie-hell: color-mix(in srgb, var(--kreide) 26%, var(--grund));
--erijon-leer:    color-mix(in srgb, var(--erijon)  22%, var(--grund));
--koray-leer:    color-mix(in srgb, var(--koray)  22%, var(--grund));
```

Radien: genau eine Stufe, `2px`. Keine weichen Ecken, keine Schatten, eine Ebene — alles liegt auf `--grund`.

Nur dunkel. Die App wird abends benutzt; ein Light-Mode wäre ein zweites Design ohne Nutzen. Falls du Light willst, sag es jetzt, dann werden die Tokens von Anfang an doppelt angelegt.

## 3. Schriften

- **Zahlen und Überschriften:** `Archivo Variable` (`@fontsource-variable/archivo`), Breitenachse auf `wdth 112`, Gewicht 600–700. Leicht gestreckte Grotesk, die Ziffern wirken wie eine Stadionuhr. Charakter kommt aus der Breite, nicht aus einem Display-Gimmick.
- **Interface:** `Hanken Grotesk Variable` (schon installiert), 400/500, ruhig, kleine Größen.
- `Bricolage Grotesque` fliegt raus — zu erkennbar als aktuelle KI-Standardwahl.

Ziffern-Staffel, überall `font-variant-numeric: tabular-nums lining-nums`:

| Verwendung | Größe | Gewicht |
|---|---|---|
| Wochenstand im Kopf | 40px / `leading-none` | 700 |
| Wochenzahl je Bereich (Kachel) | 30px | 700 |
| Zeilensumme im Raster | 13px | 600 |
| Streak, Minuten, Seiten | 13px | 500 |

Bereichsnamen laufen in Archivo 22px/600 in Kleinschreibung. Sekundärtext 12px Hanken in `--kreide-38`.

## 4. Aufbau (390px)

Eine Seite, kein Tab, kein Menü.

```
kopf        vierfelder                    kw 35
            du 12 · koray 9

eintragen   lernen        4  (+1)   [marke]
            gym           3  (-1)   [marke]
            boxen         2         [marke]
            lesen         5  (+2)   [marke]

raster      woche              mo di mi do fr sa so   S
            lernen   du        #  #  .  #  .  .  .    3
                     koray      #  #  #  .  .  .  .    3
            gym      du        ...
                     koray      ...
```

- **Eintragen** steht oben, weil das der Weg unter drei Sekunden ist. Vier Zeilen, getrennt durch Haarlinien, keine Karten.
- Rechts in jeder Zeile die **Marke**: 44×44px Trefferfläche, darin ein 26×26px Quadrat mit 1px Haarlinie. Leer: Umriss in `--erijon-leer`. Gesetzt: voll `--erijon`. Kein Häkchen, kein natives Input. Die Marke hat exakt die Form einer Rasterzelle — was du antippst, ist eine große Version der Zelle, die sich unten füllt.
- Die große Zahl auf der Kachel ist **deine Wochenzahl in diesem Bereich**, daneben klein der **Abstand zum anderen** (`+1` in `--erijon`, `-1` in `--koray`, nichts bei Gleichstand).
- Streak steht klein unter dem Bereichsnamen: `7 tage am stück`. Nur die eigene, Begründung in Abschnitt 9.
- **Raster** darunter, ohne Rahmen, nur Haarlinien. Pro Bereich zwei Zeilen direkt untereinander, der Bereichsname überspannt beide. Zeilenhöhe 24px, Zellen 20px, die Spalte "heute" liegt auf einer senkrechten Haarlinie in `--linie-hell`. Rechts die Zeilensumme in der jeweiligen Personenfarbe.
- Eine Haarlinie nur zwischen zwei Bereichen, keine zwischen `du` und `koray`. Dadurch lesen sich die beiden Zeilen eines Bereichs als ein Block — das ist der Vergleich.
- Werte (min/seiten) erscheinen erst **nach** dem Setzen als eingeschobene Zeile unter der Kachel: Schrittzähler `-`/`+` und die Zahl. Nie ein Zwischenschritt, Ignorieren kostet nichts. Nur in der eigenen Zeile, nie im Raster.
- Undo: die zuletzt geänderte Zeile zeigt für 5 Sekunden neben der Marke `rückgängig`. Kein Toast über dem Daumen, kein Overlay.

## 5. Der Abhak-Ablauf

Ein Ablauf, drei Stationen, feste Reihenfolge:

| t | was | Werte |
|---|---|---|
| 0 ms | Marke drückt sich | `scale 0.94`, 90 ms, `cubic-bezier(0.16, 1, 0.3, 1)` |
| 0 ms | Marke füllt sich | Umriss → voll `--erijon`, 180 ms, gleiche Kurve |
| 120 ms | Wochenzahl zählt hoch | Ziffernrolle 220 ms, kein Überschwingen |
| 180 ms | Rasterzelle heute füllt sich | Spring `stiffness 420, damping 30, mass 0.8`, ab `scale 0.4` |
| 260 ms | Zeilensumme zählt hoch | Ziffernrolle 220 ms |

Kein Flug der Marke ins Raster per `layoutId`. Über einen Scrollcontainer ist das auf dem Handy unzuverlässig; die zeitliche Staffelung stellt denselben Zusammenhang her, ohne zu ruckeln.

Rückgängig ist derselbe Ablauf rückwärts, halbe Dauern, kein Zahlenrollen — Undo darf sich nicht wie ein Ereignis anfühlen.

## 6. Der Eintrag des anderen (Realtime)

Kommt per Supabase-Realtime herein, während die App offen ist:

1. Seine Zelle füllt sich, gleicher Spring wie oben, aber mit 320 ms Verzögerung statt 180 ms — langsamer, weil es nicht deine Handlung ist.
2. Gleichzeitig läuft eine Haarlinie einmal über seine Zeile: `--linie-hell`, 420 ms, linear, danach weg.
3. Seine Zeilensumme zählt hoch. Dreht sich dadurch der Abstand in der Kachel, wechselt dort die Zahl mit.

Kein Toast, kein Ton, keine Push. Nur live eintreffende Ereignisse werden animiert — kommt die App aus dem Hintergrund zurück, werden Zellen still gesetzt, damit alte Einträge nicht nachgespielt werden.

## 7. Leerer Zustand

Keine Nullen, nirgends.

- Kachel ohne Eintrag diese Woche: statt `0` ein Halbgeviertstrich `–` in `--kreide-38`. Kein Abstand, keine Streak-Zeile.
- Kopf am Montagmorgen: statt `du 0 · koray 0` steht dort `woche offen`.
- Raster in einer leeren Woche: nur Haarlinien und Wochentage. Die Zellumrisse in `--erijon-leer` / `--koray-leer` zeigen von selbst, welche Zeile wem gehört.
- Ein Satz unter den Kacheln, nur solange die eigene Woche komplett leer ist: `noch nichts diese woche. tippe rechts auf einen bereich.`

## 8. Wochenbilanz (Sonntag)

Sonntag ab 18:00 bis Montag 00:00 ersetzt ein Block den Kopfbereich:

```
woche zu ende            kw 35
du 17 · koray 15
lernen +1 · gym -2 · boxen 0 · lesen +3
```

Sachlich, keine Wertung, kein Trash Talk. Montag 00:00 ist er weg. Kein Push — wer sonntagabends aufmacht, sieht es.

## 9. Selbstkritik am eigenen Plan

Drei Stellen, die ich für jede beliebige Habit-App genauso aufgeschrieben hätte. Was ich geändert habe:

1. **"Vier Kacheln, rechts die Streak-Zahl."** Das ist der Standard-Tracker. Geändert: die große Zahl auf der Kachel ist die Wochenzahl **plus der Abstand zum anderen**. Der Abstand ist die einzige Zahl, die eine Solo-App nicht haben kann — also gehört sie an die größte Stelle. Die Streak rutscht auf 13px unter den Namen.
2. **"Streak pro Bereich, pro Nutzer", beide sichtbar.** Das hätte ich unkritisch aus der Übergabe übernommen. Es widerspricht aber dem wöchentlichen Reset: eine 40-Tage-Streak neben deiner 2-Tage-Streak ist genau der uneinholbare Vorsprung, den der Wochenreset verhindern soll. Geändert: **jeder sieht nur die eigene Streak.** Verglichen wird ausschließlich über die Woche. Willst du es anders, ist es eine Zeile Code — die Begründung spricht dagegen.
3. **"Zahlen animiert hochzählen, Kacheln gestaffelt einblenden."** Stand so unspezifisch da, dass es auf jede App passt. Geändert: eine einzige Staffelung beim Laden (Kacheln 0/45/90/135 ms, 200 ms, 6px Anstieg), das Raster kommt als **ein** Block. 56 einzeln animierte Zellen wären genau das Überall-Bewegung-Muster, das die App billig aussehen lässt.

## 10. Technik

**Datenmodell.** Zwei Tabellen, weil Minuten und Seiten nur dem eigenen Nutzer gehören — das ist eine Regel für die Datenbank, nicht für die UI.

```sql
create table eintraege (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  bereich text not null check (bereich in ('lernen','gym','boxen','lesen')),
  tag date not null,
  erstellt timestamptz not null default now(),
  primary key (user_id, bereich, tag)
);

create table werte (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  bereich text not null check (bereich in ('lernen','gym','boxen','lesen')),
  tag date not null,
  wert int not null check (wert >= 0),
  primary key (user_id, bereich, tag)
);
```

RLS:

- `eintraege`: `select` für alle angemeldeten Nutzer (beide sehen beide). `insert` und `delete` nur mit `auth.uid() = user_id`. Kein `update` nötig — ein Eintrag existiert oder nicht.
- `werte`: alle vier Operationen nur mit `auth.uid() = user_id`. Der andere kann die Zeile nicht einmal lesen.
- Realtime-Publication nur auf `eintraege`.

Namen und Farbzuordnung kommen aus einer `profile`-Tabelle (`id`, `name`). Zwei Konstanten im Code täten es auch, aber dann braucht ein Namenswechsel ein Deploy.

**Frontend.** React 19 + Vite + TS wie gehabt, Tailwind v4 mit `@theme inline` auf die Tokens aus Abschnitt 2, Motion für alles Bewegte, Phosphor nur für die zwei Icons, die es wirklich gibt (`minus`, `plus`). Marke und Zellen sind Divs, keine Icons. shadcn/ui bleibt als Basis nur für `button`; der Rest ist eigen, weil es dafür keine Standardkomponente gibt.

**Optimistisch schreiben.** Tap setzt sofort den lokalen Zustand, danach läuft der Insert. Schlägt er fehl, springt die Marke zurück und in der Zeile steht `nicht gespeichert. tippe nochmal.` Kein Spinner, kein Blockieren.

**PWA.** `theme_color` und `background_color` auf `#14171C`, `index.html` `theme-color` gleich mit, `bg-page` aus dem `<body>` raus.

## 11. Texte (Auszug)

```
kopf leer            woche offen
kachel leer          –
streak               7 tage am stück
nach dem setzen      rückgängig
wertzeile leer       ohne wert
leere woche          noch nichts diese woche. tippe rechts auf einen bereich.
sonntag              woche zu ende
fehler speichern     nicht gespeichert. tippe nochmal.
fehler verbindung    keine verbindung. der eintrag geht raus, sobald du wieder online bist.
anmeldung fehlt      anmeldung abgelaufen. melde dich neu an.
```

Kleinschreibung nach Satzanfang, keine Ausrufezeichen, keine Lobmeldungen, keine Gedankenstriche im Interface.

## 12. Offene Punkte

1. ~~Name des Freundes~~ — beantwortet: **koray**.
2. ~~Farbzuordnung~~ — beantwortet: erijon gold, koray petrol.
3. ~~Supabase-Projekt~~ — angelegt: `vierfelder`, eu-central-1, ref `ogxwazageufvalkocywh`, 0 € monatlich. Schema eingespielt.
4. ~~Light-Mode~~ — bleibt dunkel.

## 13. Reihenfolge beim Bauen

1. Tokens, Schriften, `index.css`, kaputte Klassen raus.
2. Supabase-Schema, RLS, Typen.
3. Auth für zwei Konten (Passwort, nicht Magic Link — bei zwei Nutzern weniger nervig).
4. Kachelzeile inkl. Marke und Abhak-Ablauf.
5. Geteiltes Raster.
6. Realtime.
7. Wochenbilanz, leere Zustände, Fehlertexte.
8. PWA, `prefers-reduced-motion`, Test auf 390px.

## 14. Was gebaut ist (26.08.2026)

Umgesetzt nach Plan, mit drei bewussten Abweichungen und einer Streichung.

**Dateien**

```
src/index.css              tokens, schriften, basis
src/lib/types.ts           bereiche, nutzer, schlüssel
src/lib/dates.ts           woche, kalenderwoche, bilanzzeit
src/lib/tracker.ts         reine logik, 11 tests
src/lib/motion.ts          alle dauern an einer stelle
src/lib/store.ts           prototyp-backend + realtime
src/components/Kopf.tsx    wochenstand, sonntagsbilanz
src/components/Bereichszeile.tsx
src/components/Marke.tsx
src/components/Raster.tsx  das geteilte raster
src/components/Zahl.tsx    ziffernrolle
supabase/schema.sql        tabellen, rls, realtime-publication
```

**Abweichung 1: die zeile ist das ziel, nicht nur die marke.**
Geplant war ein tap auf die marke. Gebaut ist die ganze zeile als trefferfläche, die marke ist nur noch anzeige. Grund: abends, müde, einhändig trifft man eine 340px breite zeile sicherer als ein 44px quadrat am rand.

**Abweichung 2: rückgängig sitzt in der streak-zeile.**
Geplant war "neben der marke". Dort ist kein platz, ohne die zahl zu verdrängen. Gebaut: die zeile unter dem bereichsnamen zeigt fünf sekunden lang `rückgängig` statt der streak. Kein toast, kein overlay, keine sprungbewegung im layout.

**Abweichung 3: der sweep besteht aus den zellen selbst.**
Geplant war eine haarlinie, die über korays zeile läuft. Gebaut: seine sieben zellen hellen nacheinander auf, 35 ms versatz, 280 ms pro zelle. Gleicher effekt, aber ohne overlay über dem raster — das licht läuft durch das material, aus dem das raster besteht.

**Gestrichen (schritt 5 der übergabe): der balken unter dem kopf.**
Ein 3px-balken zeigte das kräfteverhältnis der woche als anteil. Er war die dritte darstellung derselben zahl — kopf, balken, raster. Zwei reichen, und das raster ist das signature-element. Weg damit.

**Prototyp-backend statt supabase.**
Solange kein projekt existiert, liegen die daten in localStorage, getrennt nach den beiden tabellen aus `supabase/schema.sql`. Realtime läuft über `BroadcastChannel`: zwei tabs offen, in einem auf koray wechseln, eintragen — im anderen füllt sich seine zelle live, inklusive sweep. Der austausch gegen supabase betrifft nur `src/lib/store.ts`.

Die zeile `prototyp · angemeldet als erijon · zu koray wechseln` ganz unten ist der platzhalter für auth. Sie fliegt raus, sobald die anmeldung steht.

**Was noch fehlt**

- supabase: projekt, auth, adapter in `store.ts`
- PWA-icons als png für ios (svg reicht android)
- die sonntagsbilanz ist gebaut, aber erst am 30.08. ab 18 uhr zu sehen

**Kontrast, gemessen im laufenden build (auf `--grund`)**

| token | verhältnis | verwendung |
|---|---|---|
| `--kreide` | 14,7:1 | bereichsnamen, große zahlen |
| `--kreide-60` | 5,9:1 | zweitrangiger text |
| `--kreide-52` | 4,8:1 | kleinster text, 11–12px |
| `--marke-rand` | 3,9:1 | umriss der marke im leeren zustand |
| `--erijon` / `--koray` | 10,7:1 / 7,5:1 | füllungen, summen |
| `--erijon-leer` / `--koray-leer` | 2,7:1 / 2,7:1 | umrisse leerer rasterzellen |

Text und die marke liegen über AA. Die leeren rasterzellen liegen bewusst darunter: sie sind eine datendarstellung, kein bedienelement, und der abstand zwischen leer und gefüllt ist das, was man im raster lesen muss. Ginge der umriss höher, verschwände genau dieser unterschied.

## 15. Nachtrag: keine sprünge, und supabase

**Das layout steht jetzt fest.** Vier stellen haben sich beim eintragen verschoben:

1. Der kopf wuchs von einer zeile (`woche offen`) auf zwei zahlenblöcke. Jetzt stehen beide blöcke immer da, mit `–` statt einer null, und die zahl sitzt in einem 38px hohen kasten.
2. Die wertzeile klappte auf und schob alles darunter weg. Jetzt hat jede bereichszeile eine zweite zeile fester höhe (24px), die nur ihren inhalt wechselt: links schrittzähler oder streak, rechts `rückgängig` oder der wert.
3. Der hinweis auf die leere woche verschwand beim ersten eintrag. Er steht jetzt in der kopfzeile des rasters, wo sonst `woche` steht — dieselbe zeile, dieselbe höhe.
4. Der `–`-platzhalter war ohne `leading-none` gesetzt und dadurch 13px höher als eine echte zahl. Das war der rest-sprung, den man noch sah, nachdem die ersten drei behoben waren.

Gemessen bei 375×812, vier zustände (leer, einer gesetzt, mit wert, alle gesetzt): kopf 87px, jede zeile 78px, oberkante raster 460px — in allen zuständen identisch. Die seite passt ohne scrollen aufs telefon.

**Supabase.** Die app kennt jetzt nur noch ein interface (`src/lib/backend.ts`):

```
laden()                          -> me, ticks, werte
schreibeTick(bereich, tag, an)
schreibeWert(bereich, tag, wert)
abonniere(cb)                    -> realtime, gibt die abmeldung zurück
```

Zwei implementierungen erfüllen es: `src/lib/lokal.ts` (localStorage + BroadcastChannel, der prototyp) und `src/lib/supabase.ts` (postgrest + realtime). Welche läuft, entscheidet allein, ob `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` gesetzt sind. `App.tsx` merkt den unterschied nur an der fußzeile.

Anmeldung: e-mail und passwort (`src/components/Anmeldung.tsx`), keine registrierung im interface. Die zuordnung konto → person läuft über die tabelle `profile` mit einer spalte `person` (`erijon` oder `koray`) — die farbe hängt an der person, nicht am konto.

Was ich nicht tun kann und du machen musst: die beiden konten anlegen und die passwörter setzen. Konten anlegen und passwörter eingeben gehört zu dem, was ich nicht mache. Im dashboard unter authentication → add user, danach die zwei zeilen in `profile` (das insert steht unten in `supabase/schema.sql`).

## 16. Nachtrag: erzwungener passwortwechsel wieder raus

Kurz gebaut, kurz benutzt, wieder entfernt (`src/components/PasswortSetzen.tsx`,
`brauchtEigenesPasswort`, `passwortSetzen`). Der bildschirm hatte genau eine aufgabe:
koray sollte beim ersten login das startpasswort ersetzen, das erijon beim anlegen
gesetzt hatte. Das ist passiert, damit ist die aufgabe erledigt.

Die app kennt jetzt keinen passwortwechsel mehr. Wer ein neues braucht, bekommt es im
supabase-dashboard. Bei zwei konten ist das der kürzere weg als eine maske, die nach
einem tag niemand mehr aufruft.
