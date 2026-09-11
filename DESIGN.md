# zweikampf — Designentscheidungen und Änderungsprotokoll

Die Abschnitte 0 bis 13 waren der am 26.08.2026 freigegebene Ausgangsplan; die
Nachträge dokumentieren die anschließenden Produktentscheidungen. Aussagen wie
„noch nicht gebaut“ oder frühe Tabellen- und Komponentenlisten sind deshalb
historische Momentaufnahmen, keine Beschreibung des aktuellen Branches.

Der heute zu schützende Kern bleibt:

- dunkle, flache Anzeigetafel statt generischer Karten-App;
- Erijon in Gold, Koray in Petrol;
- kleine Radien, Haarlinien, keine dekorativen Schatten oder Verläufe;
- Archivo für markante Zahlen, Hanken Grotesk für Interface-Texte;
- eine zentrale Safe-Area-Hülle und Mobile First um 390 Pixel;
- Herkunft, Ladezustand und Fehler als Text, nicht nur als Farbe oder
  Deckkraft;
- keine erfundenen Daten, Kurse oder Gesundheitswerte.

Die aktuelle technische Struktur, Datenmodi, Offline-/PWA-Grenzen und
Rollenmatrix stehen im [README](README.md) und in
[docs/architektur-und-datenschutz.md](docs/architektur-und-datenschutz.md).
Release- oder Migrationsbefehle gehören ausschließlich in das
[Release- und Migrationsrunbook](docs/release-und-migrationen.md).

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
kopf        zweikampf                     kw 35
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

## 17. Nachtrag: das gewicht (27.08.2026)

**Die kurve zeigt veränderung, nicht kilogramm.** Erijon und koray wiegen unterschiedlich viel.
Auf einer gemeinsamen kg-achse klebte die eine linie am oberen, die andere am unteren rand, und
man sähe von beiden verläufen nichts. Also läuft die y-achse in **Δ kg**: jede person startet an
ihrem ersten punkt im fenster bei null, beide teilen sich eine nulllinie. Die absolute zahl steht
darunter als text — dort, wo man sie nachschlägt, statt sie aus einer achse abzulesen.

Der preis ist ehrlich zu benennen: die basis wandert täglich mit. Δ heisst „veränderung in diesem
fenster", nicht „seit ich angefangen habe", und beim umschalten von 30 auf 90 tage verformen sich
beide kurven, sie verlängern sich nicht.

**Geglättet, weil die rohzahl lügt.** Tagesgewicht schwankt durch wasser um ein bis zwei kilo.
Die kräftige linie ist ein nachlaufender 7-tage-schnitt, die blassen punkte dahinter sind die
tageswerte. Der schnitt geht über **kalendertage**, nicht über die letzten sieben einträge —
sonst mittelt eine dreiwöchige pause lautlos über sich hinweg und erfindet einen verlauf, den es
nie gab. Nach mehr als sieben leeren tagen bricht die linie ab, statt eine gerade durch eine
lücke zu ziehen. Gerechnet wird über die volle historie und erst danach aufs fenster geschnitten,
damit der linke rand schon sieben messungen hinter sich hat.

Die achse ist **nicht** symmetrisch um null. Symmetrie verschenkt die halbe fläche in genau dem
fall, der am häufigsten ist: beide nehmen ab. Stattdessen schnappen beide grenzen auf ein
vielfaches einer stufe — dadurch liegt eine marke immer exakt auf null, und die nulllinie gibt es
gratis.

**Der tick wird abgeleitet, nicht gespeichert.** Das gewicht zählt in den wochenstand, der damit
bis 35 geht. Naheliegend wäre eine zweite zeile in `eintraege` mit `bereich = 'gewicht'` gewesen.
Das wären zwei quellen für dieselbe wahrheit — und man könnte sich per marke einen tick ohne
messung holen. Also heisst „gesetzt" schlicht: für diesen tag existiert ein gewichtseintrag. Die
marke in der zeile ist deshalb als einzige in der app **nicht** antippbar; sie zeigt nur an.

**Die eingabe steht unten, bei ihrem diagramm.** Eine fünfte zeile in `heute eintragen` hätte
~78px über der falz gekostet und die messung aus abschnitt 15 ungültig gemacht. Ausserdem sind
die vier zeilen oben antippbare ticks, das gewicht ist ein zahlenfeld — eine andere interaktion,
und eine, die morgens passiert statt abends. Der 3-sekunden-ablauf bleibt vier zeilen lang.

**Was am zahlenfeld gefährlich war.** Die vorbelegung mit dem letzten gewicht spart tipparbeit,
hätte aber bei fokus und blur ohne tippen einen eintrag **erfunden** — eine messung, die nie
stattfand. Deshalb wird nur geschrieben, wenn wirklich getippt wurde. Der entwurf ist während der
eingabe ein eigener string und nicht der gerundete wert aus dem store, sonst verschwände das
komma mitten im tippen. `inputMode="decimal"` zeigt auf ios keine return-taste, also gibt es den
`fertig`-knopf. Und ein vertipper wie `814` wird schon im client abgelehnt: die sichtbare
rücknahme ist die rückmeldung, dafür braucht es keinen zweiten fehlertext.

Die app hiess damals weiter `vierfelder`: die vier bereiche waren die vier felder, das wiegen
die messung dazu, die mitzählt. Diese begründung hat später nicht mehr getragen, siehe
abschnitt 23.

## 18. Nachtrag: der beweis (28.08.2026)

**Das problem.** Ein tick ist eine behauptung. Man kann abends vier felder
antippen, ohne irgendetwas davon getan zu haben, und die woche sieht gut aus.
Bei einer app für genau zwei personen, deren einziger inhalt der vergleich ist,
hebelt das den vergleich aus.

**Was schon richtig war.** Zweimal steht die lösung bereits im projekt: das
gewicht (abschnitt 17) leitet den tick aus der messung ab, statt ihn antippbar
zu machen, und der schlaf kommt gar nicht erst durch menschenhände, sondern
über einen kurzbefehl aus health. Die regel dahinter gilt allgemein: **ein
tick, den man antippen kann, ist eine behauptung. ein tick, der aus fremd
erzeugten daten entsteht, ist ein beleg.**

**Der standort statt der uhr.** Keiner von beiden hat eine apple watch, also
fällt der weg über health-trainings aus. Stattdessen melden zwei
standort-automationen pro trainingsort die ankunft und den abgang; aus dem paar
ergibt sich die dauer, ab 20 minuten setzt sich der tick. Die schwelle
sortiert die vorbeifahrt aus, nicht den kurzen tag.

**Der ort entscheidet über den bereich, nicht die trainingsart.** Erijon geht
in zwei verschiedene gyms, boxen ist immer dieselbe halle. Welcher ort zu
welchem bereich gehört, steht deshalb im kurzbefehl auf dem iphone und nicht in
der datenbank. Ein drittes gym kostet zwei automationen und keine migration.

**Geschrieben wird nur mit token.** `aufenthalte` hat für angemeldete konten
kein insert-, update- oder delete-recht; die einzige schreibende stelle ist
`record_aufenthalt`, eine security-definer-funktion, die die person aus dem
persönlichen import-token bestimmt — demselben, das der schlafimport benutzt.
Ohne das entzogene schreibrecht wäre die messung nur ein tick mit anderem
namen: die app könnte sie selbst erfinden.

**Halb gefüllt heißt getippt.** Der ehrlichste teil ist die anzeige. Antippen
bleibt überall erlaubt — eine standort-automation fällt aus, und boxen findet
auch zuhause statt. Aber die zelle zeigt, wie der tick entstanden ist: voll
heißt gemessen, rand mit blasser fläche heißt getippt. Lügen ist damit nicht
verboten, sondern sichtbar, und das ist bei zwei personen, die sich kennen, die
wirksamere schranke.

**Nur dort, wo es etwas zu unterscheiden gibt.** Bei lernen und lesen kann kein
gerät wissen, ob es stattgefunden hat. Eine halbe zelle wäre dort kein urteil
über den eintrag, sondern eine dauerhafte trübung ohne aussage — also bleiben
diese beiden zeilen voll. Die unterscheidung gilt für gym, boxen und — seit dem
02.09.2026, siehe nachtrag 26 — auch für das gewicht.

**Die gemessene zeile ist nicht antippbar.** Wie die gewichtsmarke. Es gäbe
sonst einen zustand, in dem ein tap nichts tut, weil der tick schon aus dem
aufenthalt kommt. Rechts in der zeile stehen dann die gemessenen minuten statt
des schrittzählers: der wert kommt aus der messung, nicht aus dem daumen.

**Was der beweis nicht ist.** Er beweist anwesenheit, nicht anstrengung. Wer
das handy im gym liegen lässt, bekommt seinen tick. Das ist der punkt, an dem
technik aufhört: sie kann lügen teuer machen, nicht unmöglich. 20 minuten in
der halle stehen kostet ungefähr so viel wie 20 minuten trainieren.

## 19. Nachtrag: einheiten statt tageswerte (30.08.2026)

**Das problem war nicht die zahl, sondern der ort, an dem sie stand.** Die
minuten eines trainings lagen in `werte`, einer zeile je bereich und tag — und
gezeigt wurden sie nur in der bereichszeile von heute. Ab mitternacht blieb im
raster die gefüllte zelle und sonst nichts. Die zahl war da, aber nirgends mehr
abrufbar. Und ein zweites gym am selben tag ersetzte das erste, weil der
primary key keine zweite zeile zuließ.

**Eine zeile pro durchführung.** `einheiten` hält aktivität, tag, wert,
zeitpunkt und person, mit einer eigenen id je einheit. Zwei trainings sind zwei
zeilen, nicht ein überschriebener tageswert. Die tabelle ersetzt `werte` und
`eintraege` als quelle; beide bleiben als altbestand stehen, weil die migration
sie ausliest und weil eine ältere version der app sonst ins leere liefe.

**Der haken wird abgeleitet, nicht gespeichert.** „Gesetzt" heißt jetzt:
mindestens eine einheit. Das ist dieselbe entscheidung wie beim gewicht
(abschnitt 17) und bei den aufenthalten — eine zweite tabelle mit demselben
inhalt wären zwei wahrheiten und eine gelegenheit, sie auseinanderlaufen zu
lassen. **Am zählen ändert das nichts:** der wochenstand zählt weiter tage. Zwei
einheiten an einem tag sind ein punkt, das maximum bleibt 35. Sonst wäre der
vergleich zwischen zwei personen davon abhängig, wer seinen tag in mehr stücke
schneidet.

**Die minuten liegen jetzt offen.** Abschnitt 10 hatte `werte` bewusst privat
gestellt: „minuten und seiten gehören nur dem eigenen nutzer". Diese regel ist
hier umgedreht. Der grund ist die tagesansicht: ein fenster, das beim anderen
nur „erledigt" zeigen darf, ist eine halbe ansicht, und der vergleich ist der
zweck dieser app — beim gewicht, der intimeren zahl, steht das längst so. Der
preis ist ehrlich zu benennen: mit der migration werden auch die historischen
minuten für beide sichtbar, rückwirkend.

**Die tagesansicht zeigt nur an.** Auch für heute. Ein fenster, in dem man
tippen kann, wäre eine zweite, halb andere eingabemaske neben der bereichszeile;
zwei wege zum selben eintrag sind einer zu viel. Vergangene tage sind damit
gar nicht änderbar — was gestern war, war gestern. Geschlossen wird über den
hintergrund, das kreuz oder escape, und der treffbereich der rasterzelle wächst
über ein pseudoelement nach oben und unten: 22px hoch bleibt sie trotzdem,
sonst wäre die geometrie aus abschnitt 15 hinüber.

**Was der backfill nicht übernimmt.** In `werte` stehen zeilen ohne haken: das
alte abhaken löschte nur den eintrag, der wert blieb liegen und war danach
nirgends mehr sichtbar. Aus so einer zeile jetzt eine einheit zu machen hiesse,
einen gelöschten tick wiederzubeleben, mitsamt punkt in einer abgeschlossenen
woche. Übernommen wird deshalb nur, was einen eintrag hatte. Gelöscht wird
nichts — die reste bleiben in `werte` stehen.

**„Rückgängig" nimmt genau eine handlung zurück.** Nach der zweiten einheit
verschwindet nur diese zweite, der haken und die erste bleiben — sonst wäre der
knopf ein abhaken mit anderem namen. Und wer den tag versehentlich abhakt,
bekommt beim rückgängig alle einheiten mit ihren minuten zurück, dieselben ids,
nicht einen leeren neuen eintrag.

**Zwei dinge, die man sonst erst im betrieb merkt.** Der tag einer einheit wird
immer lokal gebildet, nie aus einer utc-zeit — sonst landet das training um
23:40 auf dem folgetag. Und die id kommt vom client statt aus der datenbank:
ein wiederholter schreibversuch nach einem timeout läuft damit in den primary
key, statt eine zweite einheit zu erfinden. Dasselbe gilt für ein doppelt
gemeldetes realtime-ereignis, das über die id zusammengeführt wird.

## 20. Nachtrag: der weg in die vergangenheit (31.08.2026)

**Montagmorgen sah aus wie datenverlust.** Das raster zeigt die laufende woche,
und um mitternacht des ersten wochentags stand alles auf null — die einträge der
vorwoche waren gespeichert, aber nirgends mehr erreichbar. Mit den einheiten
wurde das teurer als vorher: jetzt hängen an jedem tag minuten und uhrzeiten,
die man nachschlagen können will.

**Derselbe knopf wie beim schlaf.** Der schlaf-tab hat die historie längst
(abschnitt 18 der doku, `docs/schlaf-kalender.md`): ein runder kalenderknopf
über der woche, ein vollbild-monatsraster, ein gewählter tag führt zu seiner
woche. Genau das bekommt der tracker — nicht als zweite, eigene erfindung,
sondern mit denselben bausteinen. `schlafKalender.ts` heißt deshalb jetzt
`kalender.ts`: `kalenderMonate`, `istSelbeWoche` und `wochenZeitraum` gehören
beiden.

**Der ring zählt felder, nicht prozente.** Beim schlaf steht im ring die
qualität einer nacht. Hier sind es fünf felder — lernen, gym, boxen, lesen,
gewicht —, also steht die zahl in der mitte und der bogen zeigt ihren anteil.
Fünf ist abzählbar; ein prozentwert wäre eine genauigkeit, die es nicht gibt.

**Eingetragen wird weiter nur heute.** Die vergangene woche ist im raster
vollständig sichtbar und über die tagesansicht lesbar, aber die zeilen oben
gehören unverändert dem heutigen tag. Damit bleibt die regel aus abschnitt 19
unangetastet: was gestern war, war gestern.

## 21. Nachtrag: der schritt, den man nicht sah (31.08.2026)

**Zwei knöpfe, die nichts taten — und doch alles richtig machten.** Wer auf
plus, minus oder „+ einheit" tippte, sah nichts passieren. Gespeichert wurde
jedesmal korrekt: die minuten standen in der datenbank, die rasterzelle bekam
ihre ziffer. Nur die zeile, in der man gerade den finger hatte, schwieg. Das
ist der schlimmste fehler von allen, weil er wie datenverlust aussieht und
zum nochmal-tippen einlädt.

**Der grund war ein platz, den sich zwei dinge teilten.** Rechts in der zweiten
zeile stand der tageswert — und dort stand auch „rückgängig", fünf sekunden
lang, mit vorrang. Fünf sekunden sind genau das fenster, in dem man tippt: erst
den haken, dann die minuten. Also verdeckte die rücknahme immer die zahl, die
sie hätte zeigen müssen. Kein zustand war falsch, nur unsichtbar.

**Die zahl steht jetzt zwischen den knöpfen, die sie ändern.** Minus, wert,
plus — ein schritt hat sein ergebnis unmittelbar daneben, statt am anderen ende
der zeile. Die breite des feldes ist fest, damit aus 45 die 120 werden kann,
ohne dass das plus unter dem daumen wegwandert; dieselbe regel wie beim
abstand im kopf der zeile. Rechts bleibt allein „rückgängig", und es reicht
jetzt bis unter die marke.

**„+ einheit" hatte gar keine antwort.** Eine zweite einheit ändert den
wochenstand nicht (der zählt tage, abschnitt 19) und den tageswert auch nicht,
solange sie leer ist — es gab schlicht nichts, was sich hätte rühren können.
Ab der zweiten einheit steht deshalb ein zähler neben dem wert: `2×`. Er sagt,
woraus die summe besteht, und er sagt, dass der knopf etwas getan hat. Sein
platz bleibt auch leer stehen, sonst rutschte „+ einheit" beim ersten druck
unter dem finger weg.

**0 minuten und „ohne wert" bleiben zwei verschiedene dinge.** Beide ergeben
die tagessumme null. „Ohne wert" heißt: nie erfasst. Die 0 heißt: bis auf null
heruntergezählt. `hatTageswert` unterscheidet sie, damit das feld zwischen den
knöpfen nicht eine erfassung behauptet, die es nicht gab.

**Und zwei rennen, die niemand sieht, bis sie einmal verloren gehen.** Der
schritt rechnete auf der zahl, die der render gerade zeigte — zwei schnelle
taps gingen damit beide von derselben zahl aus, der zweite überschrieb den
ersten mit demselben ergebnis. Gerechnet wird jetzt auf dem ref, wie überall
sonst in diesem store. Und schreibvorgänge derselben einheit laufen
nacheinander: das netz garantiert keine reihenfolge, und käme das anlegen nach
dem ersten wertupdate an, ginge dieses update auf eine zeile, die es noch nicht
gibt — ohne fehlermeldung. Die minuten wären still weg gewesen, sichtbar erst
beim nächsten laden.

## 22. Nachtrag: der fokus als beleg (31.08.2026)

**Abschnitt 18 endete mit einer lücke, und die lücke war die hälfte.** Gym und
boxen hatten einen beleg, lernen und lesen nicht — „kein gerät weiß, ob du
gelesen hast". Das stimmte, solange man nur nach einem gerät suchte, das das
lesen erkennt. Es stimmt nicht mehr, sobald man nach etwas sucht, das man
selbst einschaltet, bevor man anfängt.

**Ein fokus ist eine handlung von vorher.** „Nicht stören" ist nur einer von
beliebig vielen fokus-modi; drei weitere heißen lernen, lesen und training. Wer
einen davon einschaltet, tut das vor der sitzung und schaltet ihn danach aus.
Aus dem paar ergibt sich eine dauer, ab 20 minuten setzt sich der tick — genau
die kette aus abschnitt 18, nur ohne ort.

**Der beleg ist nicht schwächer als der standort.** Der standort belegt
anwesenheit, nicht anstrengung; der fokus belegt eine stumme stunde, nicht
einen gelernten satz. Beide belegen die sitzung und nicht ihren inhalt. Der
unterschied zum tick ist in beiden fällen derselbe und der einzige, auf den es
ankommt: **vorher gegen nachher.** Ein erfundener lerntag kostet abends einen
tap; mit dem fokus kostet er 20 minuten aussitzen, in denen man auch hätte
lernen können.

**Und der fokus ist nicht für uns da.** Er schaltet die mitteilungen stumm, das
ist sein zweck, und den hätte man auch ohne tracker. Eine automation, die auf
etwas aufsitzt, das man ohnehin täte, fällt nicht aus vergesslichkeit aus.
Genau daran ist die standort-automation schwach: sie verlangt, dass man mit dem
telefon durch einen radius läuft.

**Keine zweite tabelle.** `aufenthalte` hält weiter eine zeile je sitzung; nur
der bereich darf jetzt jeder der vier sein, und `ort` heißt nicht mehr zwingend
adresse, sondern name der quelle — `gym nord` oder `fokus lernen`. Eine zweite
tabelle hätte zwei wahrheiten über dasselbe angelegt, und die frage „was zählt
als einheit" hätte man danach zweimal beantworten müssen.

**Blass heißt jetzt überall getippt.** Damit fällt die einschränkung aus
abschnitt 18: die halbe marke bei lernen und lesen war dort „eine trübung ohne
aussage", weil es nichts zu unterscheiden gab. Jetzt gibt es etwas: der eine
hat den fokus laufen lassen, der andere hat abends getippt. Alte einträge sehen
dadurch rückwirkend getippt aus — das sind sie auch.

**Zwei quellen für dieselbe stunde sind eine einheit.** Wer im gym den fokus
training einschaltet, während die standort-automation ohnehin läuft, hat einmal
trainiert. Überschneiden sich zwei sitzungen desselben bereichs, bleibt die
längere. Ohne diese regel würde ausgerechnet der am besten belegte tag doppelt
gezählt.

**Beim lesen misst der fokus die falsche größe, und das bleibt sichtbar.**
Lesen zählt seiten, ein fokus misst minuten. Beides steht nebeneinander (`24
seiten · 35 min · gemessen`) und wird nicht addiert; die schritte für die seiten
bleiben antippbar, obwohl die zeile gemessen ist. Eine summe aus minuten und
seiten wäre eine zahl, die nichts bedeutet — und eine gemessene lesestunde, in
der man die seiten nicht mehr eintragen kann, wäre ein rückschritt.

**Zehn minuten fürs lesen, zwanzig für alles andere.** Die schwelle soll die
vorbeifahrt aussortieren, nicht den kurzen abend — und was eine vorbeifahrt
ist, hängt vom bereich ab. Am gym fährt man versehentlich vorbei; den fokus
lesen schaltet niemand versehentlich ein, und ein kapitel ist kürzer als eine
trainingseinheit. Eine einheitliche zahl wäre nicht strenger, sondern nur an
einer stelle falsch.

**Was der fokus nicht kann.** Er läuft auf einem zeitplan genauso wie von hand.
Die datenbank sieht nicht, wer den schalter umgelegt hat, also steht die einzige
regel dagegen in der anleitung und nicht im code: auf diesen drei modi kein
zeitplan. Wer sich selbst betrügen will, findet ohnehin einen weg; der punkt ist
nicht, es unmöglich zu machen, sondern es nicht versehentlich einzubauen.

**Und ein kurzbefehl, den man nicht verschenken kann, muss trivial sein.** Eine
`.shortcut`-datei vom iphone ist ein von apple signiertes archiv (`AEA1`, mit
der zertifikatskette „Apple Root CA G3 → System Integration CA 4" darin); seit
ios 15 nimmt die kurzbefehle-app nichts anderes an. Fertige kurzbefehle lassen
sich also nicht ins repo legen, jeder baut sie von hand nach — und was von hand
nachgebaut wird, sollte keine sechs formularfelder haben, von denen ios eines
gern als boolean anlegt. Deshalb gibt es die edge function `fokus`: sie nimmt
token, bereich und ereignis aus der url, damit ein kurzbefehl aus einer aktion
und einer zeile besteht. Sie entscheidet nichts selbst, sondern ruft
`record_aufenthalt` auf — zwei stellen mit regeln für dieselbe sitzung wären
zwei stellen, die auseinanderlaufen. Der preis steht in der anleitung: das
token liegt dann in der url und damit in den function-logs. Wer das nicht will,
baut das formular (anhang der anleitung); dasselbe ergebnis, nur teurer im
aufbau.

## 23. Nachtrag: name und zeichen (31.08.2026)

**Warum der name fiel.** `vierfelder` war eine zählung, keine benennung. Zählungen
veralten: mit dem gewicht (abschnitt 17) waren es fünf dinge, die in die woche
zählen, und der name musste in abschnitt 17 schon einmal verteidigt werden. Ein
name, der beim nächsten bereich wieder gerade gebogen werden muss, ist der
falsche. Dazu kommt: `vierfelder` beschrieb das raster — also die oberfläche —
und nicht den inhalt. Der inhalt ist der vergleich zwischen genau zwei personen;
das ist der satz, der schon in abschnitt 1 die zwei identitätsfarben begründet
hat.

**Warum `zweikampf`.** Er benennt die zwei, nicht die felder, und kann deshalb
nicht veralten, wenn ein sechster bereich dazukommt. Er ist ein wort aus dem
kampfsport, und boxen steht ohnehin in der liste. Und er sagt den ton der app
richtig: ein zweikampf ist hart, aber verabredet — konkurrenz unter zweien, die
sich dafür entschieden haben, nicht feindschaft.

**Das alte zeichen war das falsche versprechen.** Auf dem homescreen stand ein
lila icon mit vier weichen kacheln, weissen fugen, plastik-glanz und einem
gesicht. Nichts davon steht in diesem dokument: die bildsprache ist
anzeigetafel, dunkler grund, haarlinien, radius 2px, keine schatten. Ein icon,
das freundlicher aussieht als die app, verspricht beim antippen etwas, das
danach niemand einlöst.

**Das neue zeichen.** Zwei keile stossen ineinander: der warme (`--erijon`) von
links oben, der kühle (`--koray`) von rechts unten. Ihre spitzen laufen
aneinander vorbei, statt sich zu berühren, und zwischen ihnen bleibt ein
schmaler diagonaler schlitz stehen — das ist der clinch, die stelle, an der sich
die beiden halten. Die figur ist punktsymmetrisch um die mitte, weil keiner der
beiden im vorteil ist; wäre sie spiegelsymmetrisch, wären die keile
gegenübergestellt statt verkeilt. Grund ist `--flaeche` statt `--grund`, damit
das icon sich auf einem schwarzen hintergrundbild noch als fläche abhebt. Keine
sechste farbe, kein verlauf, kein glanz.

**Warum ein skript und keine datei.** `scripts/icons.py` hält die geometrie
einmal und erzeugt daraus beide svgs und alle vier pngs. Sechs von hand
gepflegte bilddateien laufen auseinander, sobald eine kante um zwei pixel
wandert. Das skript bringt seinen rasterizer (scanline-füllung, 4× überabtastung)
und den png-encoder selbst mit und hängt an nichts ausser der python-standard-
bibliothek — ein icon-build, der `npm install` oder ein grafikprogramm braucht,
läuft in einem jahr nicht mehr.

**Was am format hängt.** Die ecken des zeichens liegen innerhalb des kreises mit
radius 205 um die mitte, den android für `maskable` icons freihält; sonst
schneidet ein rundes systemtheme die spitzen ab. Die pngs für homescreen und
manifest sind volle quadrate ohne eigene rundung — ios und android runden
selbst, ein vorgerundetes png bekäme einen zweiten rand. Nur das 32-px-favicon
ist gerundet, weil es im browsertab niemand maskiert, und es hat eine eigene,
fettere fassung mit breiterem schlitz: die feine version fällt bei 32 px zu.

**Was den namen nicht bekommt.** Repository, pages-url, supabase-projekt und die
localStorage-schlüssel des prototyp-modus heissen weiter `vierfelder`. Das
repository umzubenennen ändert `VITE_BASE` und die öffentliche adresse, die
schlüssel umzubenennen wirft lokale daten weg. Ein technischer name ist kein
markenname; er muss stabil sein, nicht schön.

## 24. Nachtrag: was von einem fremden entwurf übrig bleibt (01.09.2026)

Ein Entwurf von aussen schlug siebzehn Änderungen am Schlaf-Tab vor, in der
Bildsprache von Apple Health: pillenförmige Segmented Controls, weiche Ebenen,
Badges, Fortschrittsbalken, eine gerundete Schrift und ein eigener Token-Satz
in Amber und Cyan. Übernommen sind drei Punkte. Die Begründung für das
Verhältnis ist wichtiger als die drei Punkte selbst, deshalb steht sie hier.

**Acht der siebzehn Punkte waren schon gebaut.** Der Segmented Control
existiert, die Akzentfarbe folgt der Person, die Dreierreihe hat senkrechte
Haarlinien statt Kästen, `stroke-linecap: round` steht, die Kurve ist längst
eine monotone kubische Spline, und `tabular-nums` liegt seit dem ersten Tag
global in `.tnum`. Das ist kein Vorwurf an den Entwurf — es ist der Normalfall,
wenn jemand ein Bild ansieht und nicht den Code.

**Was nicht übernommen ist, und warum.**

- *Eigener Token-Satz.* Abschnitt 2 kennt fünf Hex-Werte, alles andere ist über
  `color-mix` abgeleitet. Der Vorschlag ersetzt alle fünf, führt mit
  `--bg-card-subtle` eine dritte Fläche ein, dupliziert `--linie` und friert die
  Ableitungen als feste `rgba` ein. Dazu ist Amber/Cyan/Slate die
  Tailwind-Voreinstellung — dieselbe Begründung, aus der in Abschnitt 3
  `Bricolage Grotesque` geflogen ist.
- *„SF Pro Rounded" für Zahlen.* Abschnitt 3 will eine Stadionuhr, keine
  freundliche Rundung; Abschnitt 23 hat genau dafür schon ein Icon ersetzt.
  Ausserdem gibt es die Schrift nur auf Apple-Geräten, und die App liefert ihre
  Schriften mit.
- *`letter-spacing: -0.03em`, 36px, Grossbuchstaben-Labels.* `.tnum` steht
  bewusst auf `letter-spacing: 0`; der Charakter kommt aus der Breitenachse.
  36px steht nicht in der Ziffern-Staffel, und Kleinschreibung ist Abschnitt 11.
- *`#64748B` für Sub-Labels.* 3,77:1 auf `--grund` — unter der Grenze, die
  Abschnitt 14 für den kleinsten Text gemessen hat. `--kreide-52` liegt bei
  4,76:1 und tut dasselbe.
- *Das Kurvenfeld dunkler als die Karte.* Abschnitt 2: eine Ebene, kein
  Tiefeneffekt. Der vorgeschlagene Wert wäre zudem dunkler als `--grund`.
- *Ein 3px-Balken unter jeder Schlafphase und ein Duell-Balken.* Abschnitt 14
  hat genau so einen Balken schon einmal gestrichen, weil er die dritte
  Darstellung derselben Zahl war. Unter den Phasen wäre er die vierte — Kurve,
  Minuten, Prozent, Balken —, und über der Kachel `wach` stünde er unter einem
  `6×`, das gar kein Anteil ist.
- *Die Akzentfarbe der ganzen Seite auf die gewählte Person umschalten.* Das
  ist die eine Designentscheidung aus Abschnitt 1 rückwärts: zwei
  Identitätsfarben gleichzeitig sind der Inhalt, nicht ein Akzent, den man
  wechselt.

**Übernommen sind drei.** Zwei davon stehen mit ihrer Begründung in
`docs/schlaf-hypnogramm.md`: vier Haarlinien auf den Ebenen des Kurvenfeldes,
und höchstens sechs Uhrzeiten auf der Achse statt einer je Stunde. Beide in
vorhandenen Tokens — die vorgeschlagenen 3 % Weiss für die Hilfslinien lägen bei
1,08:1 gegen die Fläche und wären auf dem Telefon schlicht nicht da.

Der dritte betrifft nicht den Schlaf, sondern eine Unstimmigkeit, die der
fremde Blick gefunden hat: die Tab-Leiste schiebt ihren aktiven Indikator per
`layoutId` mit dem Stempel-Spring, der Personen-Umschalter im Nachtdetail
schaltete hart um. Zwei Umschalter, dieselbe Handlung, zwei Bewegungen. Jetzt
teilen sie eine.

## 25. Nachtrag: noten als ergebnis, nicht als fünfter tick (01.09.2026)

**Der Notentab bleibt Anzeigetafel.** Keine neuen Farben, keine Karten und kein
Schulheft-Look: Fächer sind feste Ledger-Zeilen zwischen Haarlinien, Zahlen
laufen tabellarisch in Archivo, und die Miniaturkurve besteht aus genau einem
Pfad ohne Achsen. Im Vergleich gehören Gold und Petrol weiter den Personen;
eine schlechte Note bekommt keine Signalfarbe. Nur die Defizitwarnung darf die
warme Personenfarbe als Warnung benutzen, weil sie eine formale Schwelle unter
fünf Punkten bezeichnet und kein Urteil über die Person.

**Die schnellste Handlung sitzt im Blatt.** Ein Fach öffnet sich von unten wie
die Tagesansicht. Klausur oder mündlich steht schon fest, das Datum ist heute,
und 16 mindestens 44 Pixel hohe Felder zeigen 15 bis 0 zugleich. Der Tipp auf
eine Zahl ist der Eintrag; ein Speichern-Knopf würde nur dieselbe Entscheidung
ein zweites Mal verlangen. Die Punktfelder stehen in vier Spalten, damit auch
auf schmalen Telefonen jede Trefferfläche mindestens 44 Pixel breit bleibt.

**Die Prognose behauptet keine Vergangenheit.** Das große Ergebnis heißt
`abiprognose`, direkt darunter steht `aus diesem halbjahr hochgerechnet`.
Solange Werte fehlen, nicht genau drei Leistungsfächer vorliegen oder das
vierte Prüfungsfach nicht gewählt ist, steht dort keine Ersatzrechnung. Die
geprüfte MSS-Regel für Abitur 2027 wird nicht dekorativ versteckt: zwei der
drei Leistungsfächer werden doppelt gewertet, Block I wird mit `40/44`
normiert, und Block II rechnet die drei schriftlichen Leistungsfächer plus das
gewählte mündliche Grundfach jeweils fünffach. Eine amtlich zugeordnete Note
erscheint nur, wenn die Hochrechnung alle hier prüfbaren Bedingungen erfüllt.
Andernfalls nennt die Oberfläche die Gründe und sagt neutral, dass keine
belastbare Abiturnote vorliegt; ohne Halbjahres- und Einbringungsmodell wäre ein
endgültiges „nicht bestanden“ eine zu starke Behauptung.


## 26. Nachtrag: das gewicht war nie gemessen (02.09.2026)

**Der haken hat gelogen.** Jede gewichtszahl galt als messung, mit der
begründung „eine zahl auf der waage ist keine behauptung". Getippt wurde sie
trotzdem: in der app, mit dem daumen, ohne dass irgendetwas sie geprüft hätte.
Im aktivitätsfeed stand daneben `verifiziert`, und in der belegquote zählte sie
wie ein standort am trainingsort. Ein beleg, den man sich selbst ausstellt, ist
kein beleg, sondern eine dekoration.

**Dieselbe regel wie überall.** Gemessen ist, was die automation schreibt. Die
waage synchronisiert nach apple health, eine health-automation ruft
`record_gewicht` mit dem persönlichen import-token auf — derselbe weg wie beim
standort und beim fokus. Was die app schreibt, ist getippt, und zwar nicht auf
treu und glauben: ein trigger setzt die spalte bei jeder schreibung aus der app
auf `getippt`, egal was der aufrufer mitschickt. Wer eine gemessene zahl später
überschreibt, macht daraus wieder eine getippte. Die anzeige folgt der letzten
schreibung.

**Der beleg zählt das gewicht nicht mehr mit.** Standort und fokus laufen auf
beiden telefonen; eine waage, die nach health schreibt, hat nur einer von
beiden. Ein tiebreaker, der daran hängt, misst den einkauf und nicht die woche.
Die belegquote zählt deshalb die vier bereiche und sonst nichts. Sichtbar bleibt
die unterscheidung trotzdem: die gewichtsmarke ist voll, wenn die waage
geschrieben hat, und blass, wenn jemand getippt hat — dieselbe bildsprache wie
im raster.

**Warum nicht einfach den haken weglassen.** Weil die frage nach dem beleg
richtig ist und nicht verschwindet, wenn man sie nicht anzeigt. Der ehrliche
weg ist der, bei dem beide dasselbe sehen: eine zahl, ihre herkunft, und keine
punkte für die herkunft.

## 27. Nachtrag: drei kanten am kalender (07.09.2026)

**Die wochenleiste klebte an der falschen kante.** `MO DI MI …` stand als
`sticky top-0` im scrollbereich. Sticky misst zum scrollport, halten kann es
sich aber nur innerhalb seines eigenen elternfeldes — und das begann erst nach
dem polster der scrollfläche. Über der leiste blieb also ein spalt offen, durch
den die ringe des nächsten monats sichtbar nach oben davonliefen. Die leiste
ist jetzt kein teil der scrollfläche mehr, sondern ein fester streifen zwischen
kopf und liste. Damit gibt es keinen spalt, an dem etwas durchlaufen könnte.

**Der helle kasten nach dem schließen.** Ein natives `<dialog>` gibt beim
`close()` den fokus an den öffner zurück, und der browser wertet das als
tastaturnavigation: er zeichnet seinen fokusring. Auf dem telefon ist das ein
heller kasten, den niemand angefordert hat und der bis zur nächsten berührung
stehen bleibt. `fokusRingLoesen` nimmt den fokus deshalb dort weg, wo es keine
tastaturnavigation gibt (`(hover: hover) and (pointer: fine)` trifft nicht).
Am schreibtisch bleibt er stehen, denn dort ist er der einzige wegweiser.

**Der kalenderknopf ist kein kreis mehr.** Abschnitt 20 hat ihn vom schlaf-tab
übernommen, rund, 44px, wie er dort seit abschnitt 18 stand. In einer
oberfläche aus haarlinien und einer einzigen radienstufe von `2px` war er das
einzige kreisrunde element weit und breit und sah entsprechend aufgeklebt aus.
Jetzt ist er ein feld wie jedes andere: `2px` radius, `--linie`, `--flaeche`,
28px sichtbar. Die trefferfläche misst weiter 44px — sie sitzt als unsichtbares
polster darum und streckt die kopfzeile nicht. `KalenderKnopf` steht als eine
komponente für beide tabs, damit sie nicht wieder auseinanderlaufen.

## 28. Nachtrag: der letzte stand ist besser als gar keiner (07.09.2026)

**Zwei verschiedene Offline-Fälle.** Wer die App geladen hat und dann das netz
abschaltet, behält alles: der stand steht im speicher des laufenden fensters.
Wer die app ohne netz *öffnet*, bekam bisher nur "daten nicht geladen" — eine
sackgasse, obwohl derselbe stand vor einer stunde noch da war. Der unterschied
ist kein technischer, sondern ein zufälliger: das fenster war zu.

**Also wird der gelesene stand gemerkt.** Nach jedem erfolgreichen laden legt
`offlineStand.ts` den `Anfangszustand` mitsamt zeitpunkt in den lokalen speicher,
getrennt nach konto (`Backend.kennung`). Der kontrollabgleich hält ihn frisch.
Das ist eine bequemlichkeit, keine quelle der wahrheit: jeder fehler daran —
kein speicher, volles kontingent, beschädigter inhalt — kostet eine ansicht und
niemals einen ladevorgang.

**„offline weiter" statt sackgasse.** Der fehlerbildschirm bietet den gemerkten
stand an, mit seinem zeitpunkt im klartext: `heute 16:23`, `gestern 22:40`,
sonst das ganze datum. Am selben tag trägt die uhrzeit die ganze aussage — "vor
einer stunde" ist etwas anderes als "vor drei tagen", und genau das entscheidet,
ob der alte stand noch etwas taugt.

**Der offlinemodus ist eine lesebrille.** Kein eintrag, keine wette, keine note.
Technisch braucht das keine neue sperre: `bereiteLadungRef` bleibt ungebunden,
und damit greift dieselbe schreibsperre wie während des ladens. Ein tap sagt
warum, statt still zu versanden. Der grund ist derselbe wie in abschnitt 19:
was man nicht gegenprüfen kann, darf man nicht als ergebnis speichern — und
eine warteschlange ohne konfliktauflösung wäre genau das.

**Er räumt sich selbst weg.** Sobald das `online`-ereignis kommt, lädt die app
neu; der knopf oben rechts tut dasselbe von hand. Niemand soll den alten stand
erst wegklicken müssen, um den aktuellen zu sehen.

## 29. Nachtrag: ENI steht daneben, nicht darin (10.09.2026)

**Der erste entwurf war ein fünfter tab, und das war falsch.** Die tabs schalten
zwischen ansichten derselben sache um: tracker, duell, schlaf und noten zeigen
alle dieselbe woche von zwei personen, nur aus verschiedenen winkeln. ENI ist
keine weitere ansicht auf diese woche. ENI ist ein gegenüber. Ein tab hätte
versprochen, dass man mit einem tippen zwischen abhaken und einem gespräch hin
und her wechselt, als wäre beides dasselbe. Also steht ENI daneben: eigene
adresse, eigener bildschirm, eigener weg zurück.

**Der weg hinein ist eine tür, keine lasche.** Oben rechts im kopf, neben dem
heute-stand, sitzt ein knopf mit zeichen und namen. Er sieht aus wie ein symbol
auf einem homescreen und nicht wie ein reiter, weil er aus der app hinausführt
statt in ihr umzuschalten. Er steht in beiden zuständen des kopfes, auch im
sonntagsfinale; ENI ist gerade dann erreichbar, wenn die woche gerade
entschieden wurde.

**Warum der hash und kein pfad.** Die app liegt auf GitHub Pages unter
`/vierfelder/`. Ein echter pfad `/eni` bräuchte dort eine umschreibung auf dem
server, die es auf einem statischen host nicht gibt; den hash versteht jeder
host, auch die installierte pwa in ihrem eigenen scope. `schliesseEni()` geht
einen schritt im verlauf zurück, wenn wir selbst hierher navigiert sind, und
ersetzt sonst nur die adresse. Sonst wäre der zurück-weg aus einem direkt
geöffneten ENI ein sprung aus der app heraus.

**ENI ist das einzige wort in versalien.** Die ganze app ist kleingeschrieben,
seit abschnitt 3. Genau deshalb funktioniert die ausnahme: in einer oberfläche
ohne großbuchstaben ist ein name in versalien kein schreien, sondern der einzige
eigenname weit und breit.

**Aber ENI redet in normaler groß- und kleinschreibung.** Das ist seit dem
10.09.2026 die zweite ausnahme, und sie trennt zwei dinge, die vorher
zusammengeworfen waren: die *schrift des hauses* und die *rede einer person*.
Beschriftungen bleiben klein, weil sie leise sein sollen. ENIs sätze nicht. Ein
mann, der urteilt, schreibt nicht durchgehend klein; das las sich nachlässig,
und nachlässig ist das gegenteil von dem, was er verlangt. Die grenze läuft also
nicht zwischen ENI und der app, sondern zwischen etikett und rede: kopfzeile,
knöpfe, tagestrenner und die drei auftakte sind etiketten und bleiben klein, der
inhalt einer nachricht ist rede und wird groß geschrieben.

Der system-prompt in `eniCharakter.ts` ist selbst in großschreibung verfasst.
Nicht aus ordnungsliebe: ein modell übernimmt die schreibweise seiner anweisung.
Ein kleingeschriebener prompt hat ENI die kleinschreibung stärker beigebracht als
der satz, der sie verlangte, und derselbe hebel wirkt in die andere richtung.

**Die antwort klappt wort für wort auf.** Kein tippanimations-cursor, kein
zeichenweises schreibmaschinen-echo: die wörter setzen der reihe nach auf, jedes
mit 280 ms überblendung und 0,16 em weg von unten, wie ein text, der geschlagen
wird. Der versatz beträgt 26 ms je wort, aber das ganze aufklappen ist bei
1100 ms gedeckelt (`AUSKLAPP_MAX_MS`): bei einer langen erklärung rücken die
wörter enger zusammen, statt dass man zwanzig sekunden auf den letzten satz
wartet. Nur die gerade eingetroffene zeile läuft so auf, gesteuert über `frisch`
in `EniApp`; ein chat aus dem verlauf steht sofort ganz da, weil man ihn liest
und nicht empfängt.

Der text steht dabei immer vollständig im dokument, jedes wort in einem eigenen
`span`. Vorleseprogramme bekommen den satz am stück, nur das auge bekommt ihn
nach und nach. Die abstände bleiben eigene knoten, sonst gingen absätze und
leerzeilen verloren. Die staffelung liegt in CSS (`.eni-wort`), nicht in
`motion`: einige hundert federn für eine lange antwort wären teurer als eine
einzige keyframe-regel. Die globale reduced-motion-regel kürzt nur die *dauer*,
nicht die *verzögerung*, deshalb schaltet `.eni-wort` dort ausdrücklich
`animation: none` — sonst tröpfelte der text auch bei abgeschalteter bewegung
über eine sekunde herein, nur unsichtbar.

**Das zeichen: ein monolith.** Ein aufgerichteter stein, oben schräg
abgeschlagen, mit einer kerbe, die nur zwei drittel hineingeht. Drei fassungen
lagen davor: ein pfeiler mit zwei keilen las sich bei 44 px als text-cursor, ein
trilith als griechisches pi, und eine kerbe quer hindurch machte aus dem stein
ein kleines i. Die kerbe, die nicht durchgeht, ist der punkt: sie ist eine
wunde, kein schnitt. Das app-zeichen aus abschnitt 23 erzählt von zweien, die
sich verkeilen; ENI steht für sich allein, deshalb hat sein zeichen kein
gegenstück. Alles in kreide, keine sechste farbe.

**Zwei schriftbilder, ein dialog.** ENIs sätze laufen in Archivo 17px/600 über
die volle breite, ohne rahmen, ohne blase, wie eine inschrift auf dem grund. Was
du vorlegst, steht eingerückt hinter einer 2px-kante in deiner farbe, in Hanken
13px, mit uhrzeit. An der schrift allein erkennt man, wer spricht. Der strom
klebt am unteren rand (`mt-auto`), wie in jedem chat; der leere chat steht
dagegen mittig und zeigt ENIs ersten satz und drei sätze, die man ihm hinwerfen
kann.

**Der takt statt des ladekreises.** Zwölf striche in festem versatz. Bei
`prefers-reduced-motion` stehen sie still, der satz für screenreader steht
unabhängig davon da.

**Der verlauf gehört einer person.** Alles andere in dieser datenbank lesen
beide und schreibt jeder nur für sich. Bei ENI lesen die policies
`auth.uid() = user_id` auch beim select: erijon sieht korays chats nie und
umgekehrt. Der zwei-personen-vergleich endet an der tür zu ENI, und die
oberfläche sagt das im leeren chat ausdrücklich hin. Ein trigger zieht
`eni_chats.zuletzt` nach, statt den client zu einem zweiten rundlauf je vorlage
zu zwingen, der zwischendrin abbrechen könnte. Der prototyp ohne anmeldung
bekommt dieselbe schnittstelle gegen `localStorage`.

**Die fassung ist eine stimmenprobe, und sie sagt es selbst.** Jeder satz von
ENI steht in `src/lib/eni.ts`, es gibt keine modellverbindung, und der kopf
schreibt das hin. Eine oberfläche, die eine verbindung andeutet, die es nicht
gibt, wäre genau die art unehrlichkeit, gegen die ENI sonst redet. Der eine
anschlusspunkt für später ist `eniAntwort`.

**Was den startpfad kostet.** Vom ganzen bereich bleiben im ersten laden nur die
tür im kopf und die hash-route übrig, zusammen 598 byte gzip. Die ansicht, ihr
verlauf und der dialog liegen mit 7,5 KiB gzip hinter `React.lazy`.

## 30. Nachtrag: ENIs stimme und der schlüssel (10.09.2026)

**Der charakter steht auf dem server, nicht im bundle.** `eniCharakter.ts` liegt
unter `supabase/functions/_shared/`. Wer die seite öffnet, sieht ENIs
oberfläche, nicht sein wesen. Der eine anschlusspunkt aus abschnitt 29 ist damit
eingelöst: `eniAntwort` bleibt die lokale stimmenprobe, das modell hängt
daneben, und die oberfläche kennt beide nur als `Antwortgeber`.

**Das modell ist DeepSeek, und zwar per blankem fetch.** `deepseek-flash` über
`https://api.deepseek.com/chat/completions`, ein POST mit JSON hin und JSON
zurück. Kein SDK: ein npm-paket dafür wäre ein halber node-unterbau in einer
deno-function, für nichts. Dieselbe entscheidung wie bei `webpush.ts` in
abschnitt 10. Ein test in `edgeImports.test.ts` hält beides fest, dass kein
LLM-SDK hereinkommt und dass genau eine adresse angesprochen wird. (Seit
abschnitt 34 stehen zwei modelle zur wahl; der blanke fetch und der test sind
geblieben.)

**Das denken ist aus.** DeepSeek denkt sonst mit `reasoning_effort: high` vor.
ENI ist eine haltung, keine rechenaufgabe; die denk-token zählen gegen dasselbe
`max_tokens` und könnten eine lange erklärung mittendrin abschneiden.

**Die zeile im kopf ist jetzt eine messung, keine behauptung.** Beim öffnen
fragt ENI die function, ob überhaupt ein schlüssel gesetzt ist. Das kostet
nichts, weil dafür kein modell läuft. Bis die antwort da ist, steht dort
`verbindung wird geprüft` und die eingabe bleibt gesperrt; danach entweder die
stimmenprobe oder der satz, der zählt: `was du hier schreibst, verlässt dein
gerät`. Eine app, die daten aus dem haus gibt, muss das an der stelle sagen, an
der man tippt, nicht in einer datenschutzerklärung.

**Die zahlen kommen aus der datenbank, nie aus der anfrage.** `eniLage.ts` baut
serverseitig einen knappen block aus der laufenden woche, den letzten
gewichtswerten, den letzten nächten und den letzten noten. Genauso der
gesprächsverlauf: die function liest ihn selbst unter derselben row level
security. Beides aus demselben grund. Ein client, der ENI eine woche vorlügen
kann, wäre genau der selbstbetrug, gegen den ENI antritt.

**Beide zeilen schreibt der server.** Vorlage und urteil landen in derselben
function im verlauf. Sonst stünde im chat, was ein client behauptet, und nicht,
was das modell gesagt hat. Der client zeigt die eigene vorlage sofort an und
tauscht sie gegen die echte zeile, sobald sie zurückkommt; scheitert das
speichern ganz, verschwindet sie wieder und der satz steht zurück im feld.

**Ein takt als mindestdauer, nicht als attrappe.** Der strichcode aus abschnitt
29 läuft jetzt, bis die echte antwort da ist, mindestens aber 700 millisekunden.
Ein urteil, das schneller kommt als ein gedanke, liest sich wie ein echo.

**Zwei bremsen, die nicht verhandelbar sind.** Eine tagesgrenze je person,
geprüft bevor das modell etwas kostet, und eine längengrenze für die vorlage.
Ein verlorenes telefon oder eine schleife im client darf keine rechnung
erzeugen, die niemand bemerkt.

**Kurz ist der normalfall, lang ist erlaubt.** ENI urteilt in zwei bis vier
sätzen. Fragt ihn jemand, warum etwas wirkt, darf er in absätzen ausholen; die
länge muss aus dem inhalt kommen, nie aus höflichkeit. Deshalb rendert seine
zeile `whitespace-pre-wrap` und der token-deckel liegt bei 2500 statt bei 1000.

**Was aus der charakterbeschreibung nicht übernommen wurde.** Erijon nannte
Andrew Tate als überzeugung. Übernommen ist der harte kern, den er meint:
disziplin, eigenverantwortung, körperliche stärke, keine ausreden, kein
selbstmitleid. Nicht übernommen ist dessen frauenbild, und der name steht
nirgends als vorbild im prompt. Das ist keine weichzeichnung von ENI: er bleibt
so hart wie beschrieben, er bezieht seine härte nur nicht von einem mann, der
wegen menschenhandels und vergewaltigung angeklagt ist.

**Die zwei stellen, an denen ENIs härte aufhört.** Akute krankheitszeichen und
selbstverletzung. Bei allem anderen redet er wie beschrieben, ohne
haftungsausschluss und ohne warnung. Die zwei ausnahmen stehen im prompt, weil
rohe leber und rohe milch echte infektionsrisiken tragen und weil ein
schiedsrichter, der an dieser stelle weiter stichelt, seinem menschen schadet
statt ihm zu helfen.

## 31. Nachtrag: was man ENI hinhalten kann (10.09.2026)

**Bilder brauchten kein neues modell.** Beim bauen war die annahme, DeepSeek sei
textblind und bilder hiessen: zweiter anbieter, zweiter schlüssel, zweite
rechnung. Das war seit august 2026 falsch. `deepseek-flash` nimmt bildblöcke im
chat-format an, der frühere sondername `deepseek-v4-flash-vision-exp` ist
zurückgezogen und wird auf flash umgeleitet. Es bleibt also bei einem modell,
einem schlüssel und einem endpunkt aus abschnitt 30. Ein bild kostet höchstens
384 token, egal wie gross es ankommt.

**Zwei arten von anhang, und die trennung fällt auf dem gerät.** Ein bild wird
auf 1280 pixel gerechnet und als JPEG in den bucket gelegt. Eine textdatei wird
gelesen, und nur ihr text geht mit. Beides hat denselben grund: das modell sieht
ein bild ohnehin nur mit einem festen tokenbetrag an, und eine `.csv` durch eine
bilderkennung zu schicken wäre unsinn, weil der text schon dasteht. Das
herunterrechnen läuft über canvas statt über eine bibliothek, und es wirft
nebenbei EXIF weg — der GPS-punkt eines fotos geht gar nicht erst auf die reise.

**PDF geht nicht, und das steht als satz da.** DeepSeek nimmt vier bildformate
an, PDF ist keins davon. Eine PDF-bibliothek im browser wäre rund ein achtel des
gesamten JavaScript-budgets für etwas, das ein screenshot auch erledigt. Die
oberfläche sagt deshalb „ein pdf kann ENI nicht lesen, mach einen screenshot
davon" statt die datei stumm abzulehnen.

**Der bucket ist privat, und der pfad trägt die regel.** Jedes bild liegt unter
`<konto>/<chat>/`, und die storage-policy prüft genau den ersten ordner. Das ist
dieselbe linie wie in abschnitt 29: der zwei-personen-vergleich endet an der tür
zu ENI. Das modell bekommt eine signierte adresse mit zehn minuten frist, die
ansicht eine mit einer stunde. Nichts davon ist öffentlich abrufbar.

**Der client lädt hoch, die function schreibt.** Der browser legt die datei in
den bucket und nennt der function nur ihren pfad; die zeile in `eni_anhaenge`
schreibt die function, und `eni_anhaenge` hat für angemeldete konten gar keine
insert-policy. Damit gilt für anhänge dieselbe regel wie für die nachricht
selbst aus abschnitt 30: was ENI gesehen hat, behauptet kein client. Die
function prüft den pfad dreifach — richtiger präfix, kein `..`, begrenzte länge
—, obwohl schon RLS und der bucket dagegen stehen. Drei schlösser sind hier
billig.

**Eine angehängte datei ist material, nie auftrag.** Ihr text steht gerahmt
unter der vorlage, mit einer zeile davor, die genau das sagt. Ohne diesen rahmen
liesse sich ENI mit einer `.md` jede anweisung unterschieben, und der prompt
könnte den unterschied zwischen dem, was der mensch gerade gesagt hat, und dem,
was in einer datei steht, nicht mehr sehen.

**Zwei deckel, weil eine rechnung sonst niemand vorher sieht.** Vierundzwanzig
nachrichten mit je einer angehängten tabelle wären eine halbe million zeichen.
Dateitext geht deshalb mit einem budget von 24000 zeichen mit, bilder mit
höchstens acht stück, beides neueste zuerst. Wer gerade eine tabelle anhängt,
schickt sie vollständig mit; bricht dafür eine datei von vor zwanzig nachrichten
hinten ab, ist das der richtige verlust.

**Ein bild allein ist eine vorlage.** Die untergrenze von einem zeichen auf
`eni_nachrichten.text` fällt. Wer ein foto hinhält, hat genug gesagt, und ENI
kann nachfragen, was er wissen will.

**Die büroklammer ist weg, wenn sie nichts täte.** Ohne konto gibt es keinen
bucket, und die stimmenprobe ist ein paar regeln in einer datei und hat keine
augen. In beiden fällen wird der knopf nicht grau, sondern verschwindet. Ein
bild hochzuladen, das nie jemand ansieht, wäre genau der schein, gegen den die
zeile im kopf steht.

**Das mikrofon sagt, wohin der ton geht.** DeepSeek hat keine transkription, und
jede gegenstelle, die eine hätte, wäre ein zweiter schlüssel und ein zweiter
ort, an dem eine tonaufnahme liegt. Umsonst kann es nur der browser selbst, über
die Web Speech API. Umsonst heisst dort aber nicht auf dem gerät: chrome schickt
den ton an google, safari an apple. Deshalb steht während der aufnahme eine
zeile unter dem feld, die das hinschreibt — dieselbe regel wie die zeile im kopf
aus abschnitt 29, die sagt, ob die vorlage das gerät verlässt. Aufgenommen und
gespeichert wird nichts; was zurückkommt, ist text im feld, den man vor dem
vorlegen noch ändern kann. Firefox hat die schnittstelle nicht, dort ist der
knopf weg statt grau.

**Die eingabe ist ein rahmen, nicht drei sachen.** Zuerst stand ein kasten für
den text da und darunter drei lose knöpfe, und der untere rand der ansicht las
sich wie eine aufzählung statt wie ein feld. Jetzt liegt alles, was zur vorlage
gehört, in einem rahmen: der streifen mit den anhängen oben, der text in der
mitte, die knopfleiste unten. Das feld hat keinen eigenen rand mehr, der rahmen
ist seiner.

**Der fokusring wandert mit.** Die regel `:focus-visible` in `index.css` steht
ohne layer und schlägt damit jede tailwind-klasse; ein `outline-none` am feld
blieb wirkungslos. Der ring hätte drei pixel um das feld herum gezogen, also
mitten in den gemeinsamen kasten, und der sähe wieder nach zwei kästen aus. Die
ausnahme steht deshalb neben der regel, die sie nötig macht: ein feld mit
`data-ring="rahmen"` gibt den ring ab, und der rahmen zeichnet ihn selbst,
weiterhin an `:focus-visible` gebunden. Für die maus bleibt der hellere rand.
Die vierundvierzig pixel trefferfläche gelten unverändert für feld, mikrofon,
büroklammer und den knopf; der test aus abschnitt 29 hält sie fest und hat den
ersten entwurf dieser leiste prompt zurückgewiesen.

**Ein pfeil statt des wortes.** „vorlegen" stand als beschriftung neben dem
feld und sagte doch nur, was die eingabetaste ohnehin tut. Der pfeil sagt
dasselbe in der breite eines knopfes und lässt dem diktatstreifen daneben platz.
Gefüllt ist er dieselbe sorte handlung wie das speichern einer wette: er gibt
etwas aus der hand, und dafür gibt es in dieser app schon ein muster, `bg-kreide`
auf `text-grund`. Solange nichts dasteht, was man aus der hand geben könnte, ist
er nur ein umriss; als graue fläche wäre der gesperrte knopf im leeren chat das
lauteste nach der überschrift gewesen. Das wort ist nicht verschwunden, es steht
im `aria-label`: wer die oberfläche vorgelesen bekommt, hört weiterhin das verb
dieser app und nicht „senden".

**Das budget steigt nur an einer stelle.** Anhänge und diktat kosten rund 5,5
KiB gzip, und sie liegen restlos im ENI-chunk hinter `React.lazy`. Der startpfad
hat sich nicht um ein byte bewegt. Deshalb steigt in `check-web-build.mjs` nur
die gesamtsumme; die strengere grenze für den start bleibt stehen, wo sie stand.

## 32. Nachtrag: ENI bekommt eine stimme (10.09.2026)

Der plan dahinter ist grösser: mit ENI reden können wie am telefon. Das hier ist
der erste teil davon, und der erste teil ist die stimme.

**Wieder der browser, aber diesmal nicht als kompromiss.** Beim mikrofon war die
sprachausgabe des browsers die einzige kostenlose möglichkeit, und sie hat den
haken, dass Chrome und Safari den ton an ihre server schicken. Beim vorlesen ist
es umgekehrt: die sprachausgabe arbeitet auf fast jedem gerät lokal. Was ENI
sagt, wird auf dem telefon zu ton. Das ist nicht nur billiger als eine
gegenstelle, es ist auch privater — und ein zweiter schlüssel für eine stimme,
die schon im gerät steckt, wäre in beide richtungen ein verlust.

**Die stimme wird ausgewählt, nicht genommen.** `bewerteStimme` ist eine reine
funktion mit einer klaren rangfolge: deutsch ist bedingung, dann lokal vor netz,
dann mann vor frau, dann de-DE vor de-AT. Die reihenfolge ist eine entscheidung
und keine laune. Eine männerstimme aus dem netz ist den tausch gegen eine
frauenstimme, die auf dem gerät bleibt, nicht wert — ENIs geschlecht steht in
seinem charakter, aber wohin seine sätze gehen, steht über allem. Am echten
gerät geprüft: unter Hedda, Katja und Stefan gewinnt Stefan.

**Tiefer und langsamer, aber nur ein bisschen.** Tonhöhe 0.9, tempo 0.96. Die
voreinstellung klingt nach ansage im bahnhof, und ENI ist ein mann, der einem
gegenübersitzt. Unter 0.85 fängt jede stimme an zu scheppern, also bleibt es
dabei.

**Lange antworten werden geschnitten, weil Chrome sie sonst abschneidet.** Nach
etwa fünfzehn sekunden hält Chrome eine äusserung an, ohne es zu melden. ENI
darf aber weit ausholen, das steht in seinem charakter. Also zerlegt
`teileFuerStimme` den text an satzenden in stücke unter 180 zeichen und legt sie
in die warteschlange. Ein satz, der allein schon zu lang ist, bricht am letzten
leerzeichen: lieber eine atempause an der falschen stelle als ein satz, der
mitten im wort endet. Dazu kommt ein `resume` im zehn-sekunden-takt, eine krücke
um denselben fehler, die nur läuft, solange wirklich gesprochen wird.

**Safari braucht den finger auf dem knopf.** Die erste äusserung lässt das
iPhone nur aus einer echten handlung heraus zu. ENIs antwort kommt aber
sekunden nach dem tippen, und dann bliebe sie stumm. `weckeStimme` schickt
deshalb im moment des tippens ein leeres, lautloses stück los und macht die
ausgabe für den rest der sitzung auf. Auf allen anderen geräten kostet das
nichts.

**Zwei knöpfe für zwei verschiedene dinge.** Der lautsprecher neben ENIs namen
liest diese eine antwort vor; er steht oben neben dem namen und nicht unter dem
text, weil der text mal drei und mal dreissig zeilen lang ist und ein knopf, den
man suchen muss, nicht gedrückt wird. Der schalter im kopf gilt für das ganze
gespräch und wird gemerkt: wer ENI einmal hören wollte, will ihn beim nächsten
mal wieder hören.

**Auch hier wird hingeschrieben, wohin etwas geht.** Wenn die einzige verfügbare
stimme im netz rechnet, steht das unter der zeile im kopf. Dieselbe regel wie in
abschnitt 29 für die vorlage und in abschnitt 31 für das mikrofon.

## 33. Nachtrag: die eingebaute stimme war nicht gut genug (10.09.2026)

Die erste fassung aus abschnitt 32 klang nach anrufbeantworter. Zwei fehler
steckten darin, und der zweite war der grössere.

**Erster fehler: lokal stand vor güte.** Die rangfolge in `bewerteStimme` hat
zuerst gefragt, ob eine stimme auf dem gerät arbeitet, und erst danach, wie sie
klingt. Auf Windows ergibt das die alte SAPI-fassung, auf dem iPhone die
kompakte. Beide sind lokal und beide sind blechern. Die reihenfolge steht jetzt
andersherum: erweitert und Premium vor kompakt, danach lokal vor netz, zuletzt
das geschlecht. Einer blechernen stimme hört niemand zu, egal wem sie gehört und
egal wo sie rechnet.

**Zweiter fehler: die annahme, das reiche.** Tut es nicht. Auf dem iPhone sind
*alle* stimmen der Web Speech API lokal, es gibt dort gar keine bessere, die
eine andere regel hätte finden können. Eine wirklich natürliche stimme geht nur
über eine gegenstelle. Der satz „der browser kann es umsonst" war für das
mikrofon richtig und für die stimme falsch, und beides in einem atemzug gesagt
zu haben war voreilig.

**Die Gemini-API, nicht Cloud Text-to-Speech.** Der erste entwurf hing an Google
Cloud TTS, und der ist an der anmeldung gescheitert: Google verlangt dafür ein
rechnungskonto mit fünfundzwanzig euro einzahlung. Ein satz wie „das
freikontingent bucht nichts ab" hilft nicht, wenn man vorher trotzdem geld
hinlegen muss — das war ein aufwand, den ich in den optionen nicht genannt
hatte, weil ich ihn nicht kannte.

Die Gemini-API hat dieselben stimmen, dieselbe qualität und braucht nur einen
schlüssel aus AI Studio: keine karte, keine einzahlung, kein projekt in der
cloud-konsole. Eine zweite Edge Function, `eni-stimme`, mit eigenem schlüssel in
`GEMINI_API_KEY`. Die stimme selbst steht in `ENI_STIMME` und nicht im code,
weil geschmack bei einer stimme nichts ist, was man in einer datei gerecht
entscheiden kann. Vorgabe ist Charon, die ruhige tiefe männerstimme.

**WAV, weil die gegenstelle rohes PCM liefert.** Vierundzwanzig kilohertz, ein
kanal, sechzehn bit, und kein fertiges audioformat. Der WAV-kopf sind
vierundvierzig byte, die man selbst schreibt; ein MP3-kodierer wäre eine
bibliothek in einer deno-function. Der preis ist die grösse: rund 48 KB je
sekunde, also etwa ein halbes megabyte für eine normale antwort. Der freie
speicher reicht für rund tausend töne, und wird es eng, kann man den bucket
gefahrlos leeren — die töne entstehen beim nächsten anhören neu. Die zwei
grössenangaben im WAV-kopf zählen verschieden, und genau das prüft ein test
einzeln: die erste alles nach den ersten acht byte, die zweite nur die
abtastwerte.

**Lange antworten werden stückweise gesprochen.** Die gegenstelle nimmt gut
viertausend zeichen, ENI darf aber weit ausholen. Also wird an satzenden
geschnitten, jedes stück einzeln gesprochen und das rohe PCM hinterher
aneinandergehängt — bei unkomprimierten abtastwerten ist das nichts weiter als
zwei byte-folgen hintereinander. Die naht liegt dort, wo ohnehin eine pause ist.

**Die adresse steht ganz da.** Nicht aus modellnamen und pfad zusammengesetzt,
sondern als eine zeichenkette, die man lesen kann. `edgeImports.test` zählt jede
adresse auf, die eine Function nach draussen anspricht; das ergibt nur eine
prüfung, solange sie im quelltext auch als eine adresse zu lesen ist. Ein
modellwechsel fällt dort dann auf, statt still zu passieren.

**Der client schickt eine ID, nie einen text.** Was gesprochen wird, liest die
Function selbst aus der datenbank, unter Row Level Security und nur, wenn die
zeile von ENI stammt. Das ist dieselbe entscheidung wie beim verlauf in
abschnitt 30: was der server tut, richtet sich nach dem, was steht, und nicht
nach dem, was ein client behauptet. Hier kommt ein zweiter grund dazu — ein
client, der beliebigen text vorlesen lassen könnte, wäre eine offene rechnung.

**Jeder ton entsteht genau einmal.** Der pfad im bucket ergibt sich vollständig
aus der nachricht, also ist „gibt es das schon" dieselbe frage wie „liegt die
datei da". Es braucht keine tabelle und keine zweite wahrheit, die mit der
ersten aus dem tritt geraten könnte. Eine antwort zehnmal anzuhören kostet
danach nichts. Genau deshalb braucht die stimme auch keine eigene tagesgrenze:
der verbrauch ist durch die zahl der antworten gedeckelt, und die deckelt
`ENI_TAGESLIMIT` schon.

**Der schlüssel geht als kopfzeile, nie als `?key=`.** Beides funktioniert bei
Google, nur eins davon ist richtig: eine adresse landet in protokollen, in
fehlermeldungen und in weiterleitungen, eine kopfzeile nicht. Derselbe test
prüft, dass in keiner adresse ein `key=` steht.

**Die eingebaute stimme bleibt, und zwar nicht als notnagel.** Ohne schlüssel,
ohne netz, in der stimmenprobe und bei der eigenen, noch nicht gespeicherten
zeile gibt es serverseitig gar keinen ton, den man holen könnte. Der rückfall
ist der normalfall dieser fälle, kein fehlerpfad. Und wenn das netz mitten im
gespräch wegbricht, ist eine blecherne stimme immer noch besser als schweigen.

**Ein einziges audio-element für die ganze sitzung.** Safari gibt die erlaubnis
zum abspielen nicht der seite, sondern dem element, auf dem einmal aus einer
echten handlung heraus `play()` lief. Ein element je antwort müsste jedes mal
neu fragen und bekäme nie eine antwort, weil ENIs ton erst sekunden nach dem
tippen da ist. `weckeStimme` spielt deshalb im moment des tippens zwei sample
stille ab — als WAV im code gebaut, nicht als abgeschriebener base64-klumpen,
damit man nachlesen kann, was da abgespielt wird.

**Und die zeile im kopf unterscheidet jetzt zwei wege.** Bei ENIs eigener stimme
rechnet google an dem, was der server ohnehin schon geschrieben hat; bei der
eingebauten wäre es der browser-anbieter. Zwei verschiedene sachverhalte dürfen
nicht denselben satz bekommen.


## 34. Nachtrag: zwei modelle zur wahl (11.09.2026)

**ENI ist eine haltung, kein modell.** Der charakter, die lage, der verlauf und
die regeln gehören zu ihm; welche gegenstelle daraus sätze formt, ist eine
auswechselbare schicht darunter. Solange das nur eine war, stand sie fest im
code. Jetzt stehen zwei zur wahl: `deepseek-flash` wie bisher, und
`inclusionai/ling-3.0-flash-vl:free` über OpenRouter.

**Die liste ist eine tabelle, kein `if`.** `_shared/eniAnbieter.ts` hält je
anbieter eine zeile: id, name, modellname, adresse, name der umgebungsvariablen
und der eine schalter, über den sich die beiden streiten — wie man das vordenken
abschaltet. DeepSeek will `thinking: {type:'disabled'}`, OpenRouter
`reasoning: {enabled:false}`. Beide sprechen sonst dasselbe OpenAI-chatformat,
und genau deshalb ist der zweite anbieter eine zeile und keine zweite funktion.
Ein dritter wäre wieder eine zeile plus ein secret.

**Der client schickt eine id, nie eine adresse.** Was hereinkommt, wird in der
tabelle nachgeschlagen; findet sich nichts, ist die anfrage ein 400. Der
umgekehrte weg — der client nennt modell und endpunkt, der server nimmt es hin —
wäre eine function, die den schlüssel auf zuruf an eine fremde adresse trägt.
Ein test hält das fest, und `edgeImports.test.ts` zählt jetzt drei adressen statt
zwei: die liste ist weiter die stelle, an der auffällt, wenn eine function
anfängt, irgendwo anders hinzutelefonieren.

**Zwei schlüssel, und keiner weiß vom anderen.** Jeder anbieter nennt seine
eigene umgebungsvariable. Wer nur einen setzt, bekommt nur den einen angeboten,
und der umschalter im kopf verschwindet: ein menü mit einem eintrag ist keine
wahl, sondern eine fläche, die platz kostet. Die pruefung, die bisher ja oder
nein sagte, sagt jetzt zusätzlich, welche das sind — und nur das: namen und
modellnamen, nie eine adresse und nie einen schlüssel.

**Eine anfrage ohne wahl fällt auf den ersten verfügbaren, nicht auf den
ersten der liste.** Sonst liefe ein client, der von der wahl nichts weiß, in ein
503, bloß weil der obere der beiden schlüssel fehlt. Dasselbe gilt für eine
gemerkte wahl, deren schlüssel später zurückgezogen wird: sie fällt
stillschweigend zurück, statt in einen fehler zu laufen, den niemand erklären
kann.

**Die zeile im kopf nennt jetzt das modell beim namen.** Sie ist die einzige
stelle, an der die oberfläche sagt, ob die sätze das gerät verlassen; seit es
zwei ziele gibt, muss sie auch sagen, welches. Der info-dialog hinter dem **i**
sagt dasselbe, aus demselben grund. Eine datenschutzaussage, die auf ein festes
`(DeepSeek)` in der überschrift baut, wäre ab dem ersten umschalten falsch.

**Gewechselt wird mitten im gespräch, nicht in den einstellungen.** Das modell
ist keine konfiguration, die man einmal setzt, sondern eine entscheidung pro
gespräch: wer merkt, dass die antworten flach werden, soll umschalten können,
ohne die ansicht zu verlassen. Der verlauf bleibt dabei stehen — es wechselt nur,
wer die nächste antwort formt. Während ENI gerade antwortet, ist der knopf
gesperrt.

**Bilder waren die bedingung, nicht die zugabe.** `ling-3.0-flash-vl` trägt das
VL im namen: vision-language. Ein zweites modell ohne bildeingabe hätte die
anhänge beim umschalten stillschweigend blind gemacht, und stillschweigend ist
hier das problem, nicht blind.

## 35. Nachtrag: denken ist eine zeile, keine stufe (11.09.2026)

**Ein modell kann zweimal im menü stehen.** `ling-3.0-flash-vl` ist ein hybrid:
es antwortet sofort oder es denkt erst. Statt dafür einen zweiten schalter neben
die modellwahl zu bauen, steht es zweimal in der anbietertabelle — dieselbe
adresse, derselbe schlüssel, derselbe modellname, ein unterschied. Für den
menschen sind das zwei gesprächspartner mit verschiedenem tempo, und das menü
sagt genau das. Ein zweites bedienelement hätte dieselbe wahl in zwei
handgriffe zerlegt.

**Das feld heißt jetzt `denken` und nicht mehr `ohneVordenken`.** Der alte name
war eine annahme, die genau so lange hielt, wie alle zeilen dasselbe wollten.
Ein feld, das in einer zeile das gegenteil seines namens tut, ist ein
kommentarfehler mit typprüfung.

**Was nicht gebaut wurde, und warum nicht.** OpenRouters modellauskunft nennt
für dieses modell weder `supported_efforts` noch `supports_max_tokens`, und das
heißt laut deren doku, dass es keine abstufung anbietet. Ein menü mit
`hoch`/`mittel`/`niedrig` hätte ausgesehen wie eine einstellung und wäre eine
behauptung gewesen. Dieselbe regel wie bei der zeile im kopf: die oberfläche
deutet nichts an, was es nicht gibt.

**Und die auskunft hat einen fehler aufgedeckt.** `default_enabled` steht bei
diesem modell auf `true` — es denkt von sich aus vor. Eine zeile ohne eigene
angabe wäre also nicht „wie das modell es macht" gewesen, sondern unabsichtlich
langsam. Ein test hält jetzt fest, dass jede zeile das vordenken ausdrücklich
stellt, statt es der gegenstelle zu überlassen.

**Der ausgabedeckel wurde je zeile.** Denk-token sind ausgabe-token und gehen
von demselben `max_tokens` ab. Mit den 2500 aus abschnitt 30 könnte das denken
die erklärung auffressen und den satz mittendrin abschneiden — genau der
schaden, gegen den der deckel dort aufgestellt wurde. Die denkende zeile bekommt
8000, und weil sie nichts kostet, bremst der deckel dort nur eine schleife.

## 36. Nachtrag: ENIs stimme ließ zu lange auf sich warten (11.09.2026)

Die stimme aus abschnitt 33 funktionierte, aber sie kam oft erst nach einer
halben minute — und manchmal gar nicht, bis man es zum dritten mal versuchte.
Beides waren keine launen der gegenstelle, sondern zwei fehler im eigenen code.

**Ein langer aufruf ist eine lange wartezeit.** Der text ging in stücken von
dreitausendfünfhundert zeichen hinaus, eins nach dem anderen. Die dauer eines
TTS-aufrufs hängt aber fast nur an der länge des erzeugten tons: ein stück
dieser größe ist vier minuten sprache, und vier minuten sprache zu erzeugen
dauert eben. Die stücke sind jetzt neunhundert zeichen — etwa eine minute — und
drei davon laufen nebeneinander. Die reihenfolge der abtastwerte bleibt die
reihenfolge der sätze, dafür sorgt eine feste ablage je stücknummer statt eines
anhängens in der reihenfolge des eintreffens; ein test hält genau das fest.
Drei und nicht mehr, weil die gegenstelle anfragen je minute zählt: wer hier
hochdreht, tauscht wartezeit gegen drosselungen ein, und eine drosselung kostet
mit wiederholung mehr, als die nebenläufigkeit einbringt.

**Ein aussetzer wurde bis zum menschen durchgereicht.** Jeder fehlschlag der
gegenstelle — eine drosselung, ein 500er, eine zeitüberschreitung — endete
sofort in „ENIs stimme kam nicht durch", und der mensch hat dann selbst noch
einmal getippt. Genau das erledigt jetzt eine wiederholung in einer sekunde.
Sie unterscheidet dabei: `StimmFehler` trägt, ob es sich lohnt. 429, 408 und
5xx sind gleich wieder vorbei; eine abgelehnte anfrage fällt beim zweiten mal
genauso aus und wird nicht wiederholt. Wartet die gegenstelle selbst mit einem
`Retry-After` auf, gilt ihre zahl statt der eigenen. Und die frist je aufruf
ging von einer minute auf dreißig sekunden: eine minute ist keine frist, sondern
ein aufgeben.

**Ein leeres stück zählt jetzt als fehlschlag.** Bisher wurde es stillschweigend
übersprungen. Aus einer langen antwort, deren mittleres stück die gegenstelle
verschluckt hat, wurde so eine aufnahme mit einem loch — und die lag danach im
regal und wurde nie wieder erzeugt.

**Eine adresse hinter nichts ist die schlechteste aller antworten.** Schlug der
upload fehl, wurde trotzdem eine adresse unterschrieben. Der browser lud sie,
bekam 404 und fiel erst *dann* auf seine eigene stimme zurück — nach der ganzen
wartezeit. Jetzt sagt die function an dieser stelle nein, und der browser
spricht sofort selbst. Der upload läuft außerdem mit `upsert: true`: wer zweimal
tippt, weil es beim ersten mal lange dauert, hat sonst zwei aufrufe, von denen
der zweite daran scheitert, dass der erste die datei schon hingelegt hat.

**Und der browser wartet nicht mehr unbegrenzt.** Kommt ENIs eigene stimme nicht
innerhalb von acht sekunden, fängt die eingebaute an. Die anfrage läuft dabei
weiter, ihr ton landet im regal, und beim nächsten tippen auf dieselbe antwort
ist er sofort da. Die adresse dorthin merkt sich der hook, statt sie jedes mal
neu zu holen. Acht sekunden stille sind warten; eine halbe minute stille ist
ein defekt, und man tippt dann noch einmal, und noch einmal.

**Was gesprochen wird, ist nicht mehr, was geschrieben steht.** Sterne, rauten,
backticks und link-adressen liest eine neuronale stimme entweder mit oder sie
stolpert darüber, und jedes zeichen davon ist ton, der erzeugt und übertragen
werden will. `fuerDieStimme` nimmt die auszeichnung heraus und lässt die worte
stehen — ein unterstrich mitten im wort bleibt dabei in ruhe, sonst hieße
`chat_id` plötzlich anders.

**Und das bündel der stimme wurde ein viertel so groß.** `eniStimmeModell.ts`
brauchte aus `eniModell.ts` genau eine kurze funktion: `subAusToken`. Der import
zog dafür die ganze anbietertabelle, ENIs charakter und den lagebericht mit —
siebenundsiebzigtausend zeichen, von denen die stimme keins benutzt, jedes mal
mitgeladen beim kaltstart. Die funktion steht jetzt in `token.ts`, beide
functions holen sie dort, und `eniModell.ts` reicht sie weiter, damit die
aufrufer nichts davon merken. Das bündel der stimme ist damit bei knapp
dreißigtausend zeichen.
