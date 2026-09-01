# Plan: der Tab `noten`

Stand 01.09.2026. Dieser Plan ist die Bauanleitung für einen fünften Bereich
neben `tracker`, `duell` und `schlaf`. Er ist **noch nicht umgesetzt** — im
Repository steht bisher keine Zeile davon.

## 1. Wozu

Erijon und Koray sind beide in der 13. Klasse, das begonnene Halbjahr ist das
letzte vor dem Abitur. Der Tracker misst, was sie tun; der Notentab misst, was
dabei herauskommt.

Was der Tab können muss:

- Fächer anlegen.
- Noten eintragen — laufend, unter drei Sekunden, wie ein Tick.
- Fachschnitt und Gesamtschnitt zeigen.
- Beide Personen vergleichen.

**Abgrenzung zum Duell.** Der Vergleich steht im Notentab und sonst nirgends.
Keine Note geht in die Wochenwertung, in `berechneDuell`, in den Ticker oder in
die Sonntagsbilanz. Eine Note ist kein Tick: sie entsteht nicht durch eine
Handlung am selben Tag, sie ist nicht täglich, und ein schlechter Kurs würde
eine Woche mit vollem Raster kaputt machen. Der Notentab importiert deshalb
nichts aus `src/lib/duell.ts`, und `duell.ts` weiß nichts von Noten.

## 2. Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Skala | Notenpunkte 0–15. Die Note 1+ bis 6 ist Anzeige, nicht Speicherwert. |
| Umfang | Nur das laufende Halbjahr. Kein Halbjahres-Umschalter, keine Q1–Q3-Historie. |
| Zwei Töpfe | Klausur und mündlich getrennt, Anteil pro Fach einstellbar, Standard 50/50. |
| Abiformel | KMK-Standard, bis das Bundesland feststeht (siehe offene Frage). |
| Sichtbarkeit | Beide sehen beide, schreiben darf jeder nur sich selbst — wie `einheiten`. |

**Offene Frage:** Das Bundesland. Die Einbringungsregeln von Block I (wie viele
Kurse zählen, wie viele Defizite erlaubt sind) unterscheiden sich. Bis die
Antwort da ist, wird nach KMK-Standard gerechnet und in der Oberfläche als
solcher benannt. Die Formel steht an genau einer Stelle in `src/lib/noten.ts`
und ist austauschbar, ohne die Oberfläche anzufassen.

**Folge aus „nur dieses Halbjahr":** Block I lässt sich nicht aus echten
Zeugnisnoten bilden. Die Abiprognose rechnet die Kursschnitte dieses Halbjahres
auf alle Einbringungen hoch. Das ist eine Hochrechnung und muss in der
Oberfläche auch so heißen — nicht „dein Abischnitt", sondern „prognose, aus
diesem halbjahr hochgerechnet".

## 3. Datenmodell

Neue Migration `supabase/migrations/20260901180000_noten.sql`, danach denselben
Stand ans Ende von `supabase/schema.sql` anhängen (so wie es `einheiten` und
`duell_wetten` vormachen).

Zwei Tabellen. Beide mit client-erzeugter UUID als Primärschlüssel — derselbe
Schutz gegen doppelte Einträge nach einem Timeout wie bei `einheiten`.

```sql
create table if not exists faecher (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null check (length(btrim(name)) between 1 and 24),
  kursart text not null default 'gk' check (kursart in ('lk','gk')),
  -- anteil der klausuren am fachschnitt in prozent, der rest ist muendlich.
  -- die schule legt das fest, deshalb steht es am fach und nicht im code
  klausur_anteil int not null default 50 check (klausur_anteil between 0 and 100),
  -- 1 bis 5 fuer ein pruefungsfach, null fuer einen normalen kurs
  pruefungsfach int check (pruefungsfach is null or pruefungsfach between 1 and 5),
  sortierung int not null default 0,
  erstellt timestamptz not null default now(),
  -- zwei faecher gleichen namens waeren ein tippfehler, kein zweiter kurs
  unique (user_id, name)
);

create table if not exists noten (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  fach_id uuid not null references faecher on delete cascade,
  art text not null check (art in ('klausur','muendlich')),
  -- 0 bis 15. eine andere skala wird umgerechnet, bevor sie hier landet
  punkte int not null check (punkte between 0 and 15),
  -- gewicht innerhalb der art, in zehnteln. 10 ist eine normale arbeit,
  -- 20 eine doppelt zaehlende. int, damit nichts an gleitkomma haengt
  gewicht int not null default 10 check (gewicht between 1 and 50),
  -- lokaler kalendertag des geraets, nie now()::date
  datum date not null,
  titel text not null default '' check (length(titel) <= 40),
  erstellt timestamptz not null default now()
);
```

RLS für beide Tabellen wortgleich zu `einheiten`:

- `select` für jeden, der in `public.profile` steht — der Vergleich ist der Zweck.
- `insert` / `update` / `delete` nur auf `auth.uid() = user_id`.
- `revoke all from anon`, `grant select, insert, update, delete to authenticated`.

Dazu:

```sql
create index if not exists faecher_nutzer_idx on faecher (user_id, sortierung, name);
create index if not exists noten_fach_datum_idx on noten (fach_id, datum desc);
create index if not exists noten_nutzer_datum_idx on noten (user_id, datum desc);

alter table faecher replica identity full;
alter table noten replica identity full;
```

Beide Tabellen in `supabase_realtime`, jeweils im `do $$ ... exception when
duplicate_object then null; end $$;`-Block wie bei `duell_wetten`. `replica
identity full` ist Pflicht: ohne sie liefert ein DELETE über Realtime nur die
UUID, und die Zeile ließe sich auf dem zweiten Gerät nicht zuordnen.

**Kein Halbjahr-Feld.** Es gibt nur dieses Halbjahr. Kommen später Q1–Q3 dazu,
ist das eine eigene Migration mit `halbjahr text not null default 'q4'` — eine
Spalte auf Vorrat, die niemand liest, ist kein Vorteil.

## 4. Typen (`src/lib/types.ts`)

```ts
export type AppTab = 'tracker' | 'duell' | 'schlaf' | 'noten'

export type Kursart = 'lk' | 'gk'
export type Notenart = 'klausur' | 'muendlich'

export type Fach = {
  id: string
  user: UserId
  name: string
  kursart: Kursart
  /** anteil der klausuren am fachschnitt in prozent, der rest ist muendlich */
  klausurAnteil: number
  /** 1 bis 5 fuer ein pruefungsfach, null fuer einen normalen kurs */
  pruefungsfach: number | null
  sortierung: number
}

export type Note = {
  id: string
  user: UserId
  fachId: string
  art: Notenart
  /** 0 bis 15 */
  punkte: number
  /** gewicht innerhalb der eigenen art, in zehnteln. 10 ist normal */
  gewicht: number
  /** lokaler kalendertag, gebildet mit `toKey` */
  datum: string
  titel: string
}

export type Notenstand = { faecher: Fach[]; noten: Note[] }

export const KLAUSUR_ANTEIL_STANDARD = 50
export const GEWICHT_STANDARD = 10
/** dieselbe quelle wie bei einheiten, damit es nur einen uuid-weg gibt */
export const neueNotenId = neueEinheitId
```

## 5. Rechnen (`src/lib/noten.ts`)

Reine Funktionen, keine React-Abhängigkeit, testbar wie `duell.ts` und
`gewicht.ts`. Gerundet wird erst in der Anzeige, nie im Zwischenschritt.

### Punkte und Noten

```ts
/** 15 → 1,0 · 11 → 2,0 · 8 → 3,0 · 5 → 4,0 · 2 → 5,0 · 0 → 6,0 */
punkteZuNote(p: number): number      // 17/3 − p/3, geklemmt auf [1, 6]
punkteKurz(p: number): string        // '1+', '1', '1−', '2+', … '6'
```

`punkteKurz` ist die Tabelle 15 = 1+, 14 = 1, 13 = 1−, 12 = 2+ … 1 = 5−, 0 = 6.

### Fach und Gesamt

```ts
type Fachschnitt = {
  klausur: number | null      // gewichteter schnitt der klausuren
  muendlich: number | null    // gewichteter schnitt der muendlichen noten
  gesamt: number | null       // beide toepfe nach klausurAnteil zusammen
  anzahl: number
}

fachSchnitt(noten: Note[], fach: Fach): Fachschnitt
```

Regel für `gesamt`: sind beide Töpfe gefüllt, gilt
`klausur × anteil + muendlich × (100 − anteil)`, geteilt durch 100. Ist nur ein
Topf gefüllt, gilt dieser allein — ein leerer Topf darf nicht als Null zählen,
sonst hätte ein Fach mit einer 13er Klausur und noch keiner mündlichen Note
plötzlich 6,5 Punkte.

```ts
gesamtSchnitt(faecher, noten, user): number | null   // schlichter mittelwert der fachschnitte
defizite(faecher, noten, user): Fach[]               // kurse unter 5 punkten
trend(noten, fachId, n = 6): number[]                // die letzten n punkte, aelteste zuerst
```

### Abitur

```ts
type Abiprognose = {
  blockI: number        // 0…600
  blockII: number       // 0…300
  gesamt: number        // 0…900
  note: number          // 1,0 … 4,0
  belegt: number        // wie viele faecher wirklich noten haben
  hochgerechnet: boolean
}

abiPrognose(faecher, noten, user): Abiprognose | null
```

KMK-Standard, bis das Bundesland feststeht:

- **Block I:** 40 Einbringungen, davon 8 Leistungskurse doppelt gewichtet
  → Teiler 48. `E1 = (Summe der Punkte × Gewicht) / 48 × 40`, gedeckelt auf 600.
  Ohne echte Halbjahresnoten wird der Kursschnitt dieses Halbjahres für jede
  Einbringung desselben Kurses eingesetzt (`hochgerechnet: true`).
- **Block II:** fünf Prüfungsfächer, jedes Ergebnis × 4 → max. 300. Ohne
  Prüfungsergebnisse wird der Kursschnitt des Prüfungsfachs eingesetzt.
- **Note:** `17/3 − gesamt/180`, geklemmt auf [1,0 · 4,0], auf eine
  Nachkommastelle. Die Formel trifft beide Enden exakt: 900 → 1,0, 300 → 4,0.

`null`, solange kein Fach eine Note hat — eine Prognose aus nichts ist keine
Prognose.

### Zielrechner

```ts
/** welchen schnitt die kurse brauchen, damit die prognose `ziel` erreicht */
brauchtFuerZiel(faecher, noten, user, ziel: number): number | null

/** wie viele punkte die naechste klausur braucht, damit das fach `ziel` erreicht */
brauchtInKlausur(noten, fach, ziel: number): number | null
```

Beide geben `null` zurück, wenn das Ziel rechnerisch nicht mehr erreichbar ist
oder schon übertroffen wurde. Die Oberfläche sagt dann „nicht mehr erreichbar"
beziehungsweise „schon geschafft" — keine Zahl über 15 und keine unter 0.

## 6. Anbindung

### `src/lib/backend.ts`

- `Anfangszustand` bekommt `noten: Notenstand`.
- Interface bekommt:
  `schreibeFach(f: Fach)`, `aendereFach(f: Fach)`, `loescheFach(id: string)`,
  `schreibeNote(n: Note)`, `aendereNote(n: Note)`, `loescheNote(id: string)`.
- Neue Ereignisse:
  `{ typ: 'fach'; art: 'neu' | 'weg' | 'wert'; fach: Fach }` und
  `{ typ: 'note'; art: 'neu' | 'weg' | 'wert'; note: Note }`.
  Dieselbe Form wie `EinheitEreignis` — über die ID zusammengeführt, ein doppelt
  gemeldetes Ereignis ändert nichts.

### `src/lib/supabase.ts`

- Zwei weitere Abfragen in das `Promise.all` in `laden()`.
- **Wichtig:** die beiden neuen Tabellen müssen durch `fehltNoch()` laufen
  (`42P01` / `PGRST205`). Werden Schema und Frontend getrennt veröffentlicht,
  darf eine fehlende Tabelle den Tracker nicht lahmlegen. Ein Merker
  `notenVerfuegbar` steuert, ob der Tab schreibt — wie `wettenVerfuegbar`.
- `user_id` → Person über die vorhandene `personen`-Map.
- Realtime: beide Tabellen an denselben Kanal hängen, DELETE aus `p.old` lesen.

### `src/lib/lokal.ts`

- Zwei Schlüssel `vierfelder.faecher.v1` und `vierfelder.noten.v1` (Präfix
  bleibt `vierfelder`, siehe Kommentar oben in der Datei — ein umbenannter
  Schlüssel ist ein leerer Schlüssel).
- Beispieldaten für den Prototyp erzeugen, wie `erzeugeBeispielSchlaf()`: ein
  paar Fächer je Person mit gestreuten Noten, damit Vergleich und Prognose auch
  ohne Supabase etwas zeigen.
- Änderungen über denselben `BroadcastChannel`.

### `src/lib/store.ts`

- `faecher`, `noten` als State plus `faecherRef`, `notenRef` — die Refs sind die
  Schreibgrundlage, aus demselben Grund wie bei den Einheiten.
- Optimistisch schreiben, bei Fehler zurücknehmen und
  `'nicht gespeichert. tippe nochmal.'` setzen.
- Schreibvorgänge derselben ID über die vorhandene `nacheinander()`-Kette
  schicken: Anlegen und sofortiges Ändern dürfen sich im Netz nicht überholen.
- Ein `notenstand`-`useMemo` mit stabiler Identität zurückgeben.

## 7. Oberfläche

`src/components/TabLeiste.tsx` bekommt einen vierten Eintrag `noten`. Vier Tabs
in 420 px sind eng — Schriftgröße bleibt bei 12 px, das Padding von `p-1` und
`py-2` deckt die 44-px-Trefferfläche weiter ab. Vor dem Ausliefern auf einem
iPhone SE gegenprüfen.

Neue Dateien unter `src/components/noten/`:

| Datei | Aufgabe |
| --- | --- |
| `NotenTab.tsx` | Rahmen: Kopfzahlen, Fächerliste, Vergleich |
| `NotenKopf.tsx` | Schnitt und Abiprognose groß, Defizitwarnung |
| `Fachzeile.tsx` | eine Zeile je Fach: Name, Kursart, Schnitt, Trend |
| `Fachdetail.tsx` | Blatt von unten: alle Noten des Fachs, neue Note eintragen |
| `NotenVergleich.tsx` | Fach für Fach, ich gegen ihn |
| `Trendlinie.tsx` | Miniaturkurve aus `trend()`, ein `<path>`, keine Achsen |

### Aufbau (420 px)

```
[ tracker  duell  schlaf  noten ]

  11,4 punkte                  prognose
  2,1                              1,9
  ────────────────────────────────────
  mathe          lk    12,5  ▁▂▄▅  ↑
  deutsch        lk     9,0  ▄▃▂▂  ↓
  englisch       gk    13,0  ▃▄▅▅
  + fach
  ────────────────────────────────────
  vergleich
  gesamt        ich 11,4    koray 10,8
  mathe         ich 12,5    koray  9,0
```

Regeln, die aus DESIGN.md folgen und hier gelten:

- Farben nur aus den Tokens. Personenfarben `--erijon` und `--koray` im
  Vergleich, sonst `--kreide`, `--kreide-60`, `--kreide-52`.
- **Keine Ampelfarben für Noten.** Rot für eine schlechte Note wäre ein Urteil;
  die App zeigt den Verlauf, nicht das Urteil (dieselbe Begründung wie beim
  weggelassenen Zielgewicht in `IDEEN.md`). Die einzige Ausnahme ist die
  Defizitwarnung — die ist eine Tatsache, keine Meinung.
- Zahlen mit `tnum` und über `<Zahl>`, damit nichts springt.
- Feste Höhen für Zeilen, die ihren Inhalt wechseln — wie in `Gewichtszeile`.
- Plus und Minus über die vorhandene `<Schritt>`-Komponente.
- Blatt von unten mit `role="dialog"`, Escape schließt, Hintergrund schließt —
  `Tagesdetail.tsx` ist die Vorlage, bis hin zu `pb-[calc(env(safe-area-inset-bottom)+20px)]`.
- Motion aus `src/lib/motion.ts`, `useReducedMotion` überall beachten.

### Note eintragen

Ziel: unter drei Sekunden. Im Fachdetail eine Reihe mit 16 Feldern 0–15 —
tippen, fertig. Art (Klausur / mündlich) ist ein Umschalter mit zwei Stellungen,
Datum steht auf heute, Titel ist optional. Kein Formular mit Speichern-Knopf.

## 8. Reihenfolge beim Bauen

1. Migration schreiben, in `supabase/schema.sql` spiegeln.
2. Typen in `types.ts`.
3. `noten.ts` mit `noten.test.ts` — erst die Rechnung, dann die Anzeige.
4. `backend.ts`, `lokal.ts` (mit Beispieldaten), `supabase.ts`.
5. `store.ts`.
6. `Trendlinie`, `Fachzeile`, `Fachdetail`.
7. `NotenKopf`, `NotenVergleich`, `NotenTab`.
8. `TabLeiste` und `App.tsx` verdrahten.
9. `npm test` und `npm run build`.
10. Nachtrag in `DESIGN.md`, Absatz in `README.md`.

## 9. Tests (`src/lib/noten.test.ts`)

Mindestens:

- `punkteZuNote` an den Ankern 15, 14, 11, 8, 5, 2, 0.
- `punkteKurz` über die volle Tabelle.
- `fachSchnitt`: nur Klausuren, nur mündlich, beides, mit Gewicht 20.
- `fachSchnitt` mit leerem Topf — der leere Topf zählt nicht als Null.
- `defizite`: genau die Kurse unter 5 Punkten.
- `abiPrognose`: Grenzen 900 → 1,0 und 300 → 4,0, LK zählt doppelt.
- `abiPrognose` ohne Noten → `null`.
- `brauchtInKlausur`: erreichbar, schon geschafft, nicht mehr erreichbar.
- `trend`: Reihenfolge älteste zuerst, kürzer als `n` bleibt kürzer.

## 10. Was bewusst nicht gebaut wird

- Halbjahre Q1–Q3. Entschieden: nur dieses Halbjahr.
- Klausurtermine und Countdown. Naheliegend, aber ein eigener Datentyp und ein
  eigener Bildschirm — erst, wenn der Kern steht.
- Verknüpfung von Lernminuten aus dem Tracker mit den Fächern. Reizvoll, aber
  es bräuchte ein Fach am `lernen`-Tick. Gehört in `IDEEN.md`, nicht in v1.
- Noten in Duell, Ticker oder Wochenbilanz. Ausdrücklich ausgeschlossen.
