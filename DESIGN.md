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

Die app heisst weiter `vierfelder`. Die vier bereiche sind die vier felder; das wiegen ist die
messung dazu, die mitzählt.

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
diese beiden zeilen voll. Die unterscheidung gilt für gym, boxen und das
gewicht, das per definition gemessen ist.

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

## 21. Nachtrag: der fokus als beleg (31.08.2026)

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
