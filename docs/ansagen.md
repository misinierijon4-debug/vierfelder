# Ansagen — Herausforderungen im Duell

Status: **in Arbeit, nicht veröffentlicht.** Bisher gibt es nur die Logik in
`src/lib/ansagen.ts` (mit Tests). Oberfläche, Tabelle und Wertung im Duell
fehlen noch — siehe „Fahrplan".

## Idee

Jede Person bekommt pro Woche **2 Ansagen**. Mit einer Ansage wettet man,
dass die andere Person etwas *nicht* schafft:

- „Du liest die nächsten zwei Tage nicht."
- „Du gehst diese Woche keine drei Mal ins Gym."

Die herausgeforderte Person kann nicht ablehnen, sie kann nur liefern. So wird
aus der Sticheleien-Wette ein Antrieb: Wer herausgefordert wird, hat einen
Grund mehr, genau das zu tun.

## Regeln

| Regel | Warum |
| --- | --- |
| 2 Ansagen je Person und Woche, Rest verfällt | knapp genug, dass man überlegt, wo man ansetzt |
| Ziel ist messbar: Bereich + „an mindestens N von M Tagen" | entschieden wird aus den Ticks, nicht per Diskussion |
| Zeitraum beginnt frühestens **morgen** | sonst wettet man auf einen Tag, dessen Ausgang man schon sieht |
| Zeitraum endet spätestens **Sonntag derselben Woche** | Ansage, Kontingent und Wertung gehören zur selben Woche |
| Je Person und Bereich nur **eine laufende** Ansage | nicht drei Ansagen auf dasselbe schwache Feld stapeln |
| Option **Beweispflicht**: nur gemessene Tage (Standort/Fokus) zählen | wo Punkte auf dem Spiel stehen, reicht ein getippter Haken nicht |
| Option **Einsatz**: Scheitern kostet zusätzlich einen Punkt | deine Idee „die andere Person verliert einen Punkt, wenn man will" |

## Wertung

| Ausgang | herausfordernd | herausgefordert |
| --- | --- | --- |
| geschafft | 0 | **+1** |
| verfehlt | **+1** | 0, mit Einsatz **−1** |

Entschieden ist eine Ansage, sobald es feststeht: geschafft mit dem letzten
nötigen Tag, verfehlt, sobald die übrigen Tage nicht mehr reichen. Der
laufende Tag zählt dabei noch als möglich.

## Fahrplan

1. ~~Logik und Tests~~ (`src/lib/ansagen.ts`)
2. Tabelle `duell_ansagen` als neue Migration, RLS: beide lesen, jede Person
   legt nur eigene Ansagen an (`von` = eigenes Konto); Prüfskript
   `scripts/check-*-rls.mjs`
3. Backend-Interface in `backend.ts`, **beide Modi**: `supabase.ts` und
   `lokal.ts`; Realtime, damit die Ansage sofort drüben erscheint
4. Oberfläche im Duell-Tab: „Ansage machen" (Bereich, Zeitraum, Mindesttage,
   Beweispflicht, Einsatz), Liste laufender Ansagen mit Fortschritt
5. Push „koray hat dir eine Ansage gemacht" — neue Push-Art braucht Migration
   **und** Worker (`docs/wochenbericht.md`)
6. Ansage-Punkte in den Wochenstand: `_shared/duellPunkte.ts` ist die eine
   Stelle für die Punkte, ENI und Wochenbericht lesen von dort
7. Hinter Schalter testen, dann freigeben

## Offene Fragen

- **Soll die herausfordernde Person etwas riskieren?** Bisher verliert sie
  nichts, wenn die andere liefert. Vorschlag: Mit Einsatz gilt „doppelt oder
  nichts". Scheitert die andere Person, gibt es wie bisher +1/−1. Liefert sie,
  verliert die herausfordernde Person einen Punkt. Das macht den Einsatz zu
  einer echten Entscheidung.
- **Konter:** Die herausgeforderte Person darf einmal je Woche „Kontra" geben
  und verdoppelt damit die Punkte der Ansage.
- **ENI** kommentiert neue und entschiedene Ansagen im Rivalitäts-Ticker.
- **Zurückziehen** in den ersten 10 Minuten, falls man sich vertippt hat.
