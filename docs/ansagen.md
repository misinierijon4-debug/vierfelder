# Ansagen — Herausforderungen im Duell

Status: **in Arbeit, nicht veröffentlicht.** Bisher gibt es nur die Logik in
`src/lib/ansagen.ts` (mit Tests). Tabelle, Server, ENI und Oberfläche fehlen
noch — siehe „Fahrplan".

## Idee

Jede Person bekommt pro Woche **2 Ansagen**. Mit einer Ansage wettet man,
dass die andere Person ein Ziel bis Sonntag *nicht* schafft, und setzt dafür
einen Punkt. Die herausgeforderte Person kann nicht ablehnen, sie kann nur
liefern. Die Ansage legt Druck genau auf ihr schwächstes Feld — dort bringt
mehr Training am meisten.

**ENI macht die Vorschläge.** Frei wählen kann man nur das Feld, das Ziel
rechnet die App. ENI sucht aus den Kandidaten die spannendsten aus und
schreibt den Spruch dazu, rechnet aber nie selbst (wie beim Wochenbericht:
Zahlen kommen vom Client).

## Regeln

| Regel | Warum |
| --- | --- |
| Felder: **Gym, Boxen, Lesen, Gewicht** — kein Lernen | Lernen ist zu selten für ein faires Ziel |
| 2 Ansagen je Person und Woche, Rest verfällt | knapp genug, dass man überlegt |
| Ansagen von Montag bis Freitag, Zeitraum immer **morgen bis Sonntag** | Ansage, Kontingent und Wertung gehören zur selben Woche; ab Samstag bliebe nur ein Tag |
| Ziel = üblicher Wochenstand (Median der letzten 4 Wochen) **+ 1**, auf den Zeitraum heruntergerechnet und aufgerundet | jede Ansage ist ungefähr 50:50, egal ob seltenes oder häufiges Feld; jede Woche ein Tag mehr |
| Immer **ein Tag Spielraum**; passt das Ziel nicht, gibt es für das Feld keine Ansage | ohne Spielraum ist die Ansage nach dem ersten Fehltag tot und bringt kein Training mehr |
| Nicht zweimal dasselbe Feld pro Woche | nicht beide Ansagen auf dieselbe Schwäche |
| Bereiche zählen **nur gemessen** (Standort/Fokus) | ein getippter Haken ist eine Behauptung, und er lässt sich nachtragen |
| Gewicht zählt jeder Eintrag, **aber nur am selben Tag eingetragen** | nicht jeder hat eine Waage, die misst; `gewicht.erstellt` prüft der Server |

## Wertung

Nur die Person, die ansagt, bekommt oder verliert etwas:

| Moment | Herausforderer |
| --- | --- |
| Ansage gemacht | **−1** (Einsatz) |
| andere Person scheitert | Einsatz zurück + 1 → **+1** |
| andere Person schafft es | Einsatz weg → **−1** |

Die herausgeforderte Person bekommt nichts extra — wer liefert, holt dafür die
normalen Duellpunkte. Gewinn und Verlust sind gleich groß, eine Ansage lohnt
sich also, wenn man glaubt, dass die andere Person eher scheitert.

## Einfrieren

Entschiedene Ansagen werden festgeschrieben (`entschieden`) und nie wieder
gerechnet — ein nachgetragener Haken kippt nichts mehr.

- **geschafft**: sofort, sobald das Ziel erreicht ist.
- **verfehlt**: erst nach Sonntag, auch wenn es rechnerisch früher feststeht.
  Eine Sitzung, die am Sonntag begonnen hat und noch läuft (Fokus um 23:45),
  bekommt bis 3 Uhr Zeit.

## Fahrplan

1. ~~Logik und Tests~~ (`src/lib/ansagen.ts`)
2. Tabelle `duell_ansagen` als neue Migration. RLS: beide lesen, jede Person
   legt nur eigene an. `erstellt_am default now()`, Ziel und Zeitraum rechnet
   der Server nach (RPC), `entschieden` schreibt nur der Server.
   Prüfskript `scripts/check-*-rls.mjs`
3. Einfrieren auf dem Server (Worker oder Cron), mit der Gewichtsregel über
   `gewicht.erstellt`
4. Backend-Interface in `backend.ts`, **beide Modi** (`supabase.ts`,
   `lokal.ts`), Realtime
5. ENI-Vorschläge: Kandidaten aus `ansageVorschlaege`, ENI wählt drei und
   schreibt den Spruch
6. Oberfläche im Duell-Tab: Vorschläge, laufende Ansagen mit Fortschritt
   („2/4, noch 3 Tage"), Eintrag im Rivalitäts-Ticker
7. Push „Ansage erhalten" (Migration **und** Worker, `docs/wochenbericht.md`)
8. Ansage-Punkte in Wochenstand, Restprogramm und Archiv — nur aus den
   festgeschriebenen Zeilen, eine Rechnung für alle
   (`_shared/duellPunkte.ts`, Archiv als Version 2)
9. Hinter Schalter testen, dann freigeben

## Später

- Push „letzte Chance" um 19 Uhr, wenn jeder übrige Tag nötig ist
- Kontra: die herausgeforderte Person verdoppelt einmal pro Woche
- Versprechen: eine Ansage an sich selbst
- Rückblick im Wochenbericht (Lieferquote)
