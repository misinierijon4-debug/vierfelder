# Ansagen — Herausforderungen im Duell

Status: **ausgerollt am 23.09.2026.** Migration eingespielt, `ansage-sprueche`
(neu) und `aktivitaets-erinnerung` (Version 10) deployt. Die Function `eni`
ist noch die alte Fassung: ENI im Chat kennt die Ansagen erst nach ihrem
naechsten Deploy (`_shared/eniLage.ts`).

## Idee

Jede Person bekommt pro Woche **2 Ansagen**. Mit einer Ansage wettet man,
dass die andere Person ein Ziel bis Samstag *nicht* schafft, und setzt dafür
einen Punkt. Die herausgeforderte Person kann nicht ablehnen, sie kann nur
liefern. Die Ansage legt Druck genau auf ihr schwächstes Feld — dort bringt
mehr Training am meisten.

**ENI macht die Vorschläge.** Frei wählen kann man nur das Feld, das Ziel
rechnet die App. ENI sucht aus den Kandidaten die bis zu drei spannendsten aus
und schreibt den Spruch dazu, rechnet aber nie selbst: ein Spruch mit Ziffer
wird verworfen, Ziel und Verlauf stehen daneben (wie beim Wochenbericht).
Antwortet ENI nicht — im Prototyp immer —, stehen Vorlagesprüche da.

## Regeln

| Regel | Warum |
| --- | --- |
| Felder: **Gym, Boxen, Lesen, Gewicht** — kein Lernen | Lernen ist zu selten für ein faires Ziel |
| 2 Ansagen je Person und Woche, Rest verfällt | knapp genug, dass man überlegt |
| Ansagen von **Montag bis Donnerstag**, Zeitraum immer **morgen bis Samstag** | der Sonntag gehört der Abrechnung (ab 18 Uhr): bis dahin muss jede Ansage entschieden sein. Ab Freitag bliebe nur ein Tag |
| Ziel = üblicher Wochenstand (Median der letzten 4 Wochen) **+ 1**, auf den Zeitraum heruntergerechnet und aufgerundet | jede Ansage ist ungefähr 50:50, egal ob seltenes oder häufiges Feld |
| Immer **ein Tag Spielraum**; passt das Ziel nicht, gibt es für das Feld keine Ansage | ohne Spielraum ist die Ansage nach dem ersten Fehltag tot und bringt kein Training mehr. Wer sich jeden Tag wiegt, kann darin nicht herausgefordert werden |
| Nicht zweimal dasselbe Feld pro Woche | nicht beide Ansagen auf dieselbe Schwäche |
| Bereiche zählen **nur gemessen** (Standort/Fokus, ab 20 Minuten, Lesen ab 10) | ein getippter Haken ist eine Behauptung, und er lässt sich nachtragen |
| Gewicht zählt jeder Eintrag, **aber nur am selben Tag eingetragen** | nicht jeder hat eine Waage, die misst. `gewicht.erstellt` setzt ab jetzt nur die Datenbank |

## Wertung

Nur die Person, die ansagt, bekommt oder verliert etwas:

| Moment | Herausforderer |
| --- | --- |
| Ansage gemacht | **−1** (Einsatz) |
| andere Person scheitert | Einsatz zurück + 1 → **+1** |
| andere Person schafft es | Einsatz weg → **−1** |

Die herausgeforderte Person bekommt nichts extra — wer liefert, holt dafür die
normalen Duellpunkte. Die Ansage-Punkte zählen im Wochenstand, im Rechner (eine
offene Ansage kann noch zwei Punkte drehen), in der ewigen Bilanz und in der
Sonntagsabrechnung (Version 2, `punkte_*` enthalten die Ansagen, `ansage_*`
stehen fürs Audit daneben).

## Einfrieren

Entschiedene Ansagen werden festgeschrieben (`ergebnis`, `entschieden_am`) und
nie wieder gerechnet — ein nachgetragener Haken kippt nichts mehr.

- **geschafft**: sobald das Ziel erreicht ist (Cron alle fünf Minuten).
- **verfehlt**: erst ab Mitternacht nach dem Samstag, auch wenn es rechnerisch
  früher feststeht. Eine Sitzung, die am Samstag begonnen hat und noch läuft
  (Fokus um 23:45), bekommt bis 3 Uhr Zeit.
- Vor jeder Wochenabrechnung wird noch einmal entschieden.

Bis zum Einfrieren zeigt die App den Stand, den sie selbst rechnet. Beim
Gewicht kann das einen Tag abweichen: der Browser kennt `gewicht.erstellt`
nicht und zählt einen nachgetragenen Wert mit, die Datenbank nicht. Es gilt,
was eingefroren wird. Im Prototyp friert das Laden ein.

## Wo was liegt

| Teil | Datei |
| --- | --- |
| Regeln, Ziel, Stand, Punkte (Client) | `src/lib/ansagen.ts` |
| Tabelle, `sage_an`, Einfrieren, Abrechnung v2, Push-Art | `supabase/migrations/20260922120000_duell_ansagen.sql` |
| Prüfung der Migration in eingebettetem Postgres | `node scripts/check-duell-ansagen.mjs <pglite/dist/index.js>` |
| Backend in beiden Modi | `src/lib/backend.ts` (`sageAn`), `supabase.ts`, `lokal.ts` |
| Zustand | `src/lib/store.ts` (`ansagen`, `sageAn`) |
| Wertung | `src/lib/duell.ts` (`AnsageWertung`), `src/App.tsx` |
| Oberfläche | `src/components/duell/AnsagenBereich.tsx` (Duell-Tab), `AnsageHinweis.tsx` (Tracker) |
| ENI-Sprüche | `supabase/functions/ansage-sprueche/`, `_shared/ansageSprueche.ts`, `src/lib/ansageSprueche.ts` |
| ENI kennt die Ansagen | `supabase/functions/_shared/eniLage.ts` |
| Push „Ansage erhalten“ (08–22 Uhr, einmal am Tag) | `aktivitaets_kandidaten` (Migration), `_shared/aktivitaetsVersand.ts`, Schalter in `src/lib/aktivitaetsErinnerung.ts` |

## Ausrollen

1. Migration einspielen. Sie ist idempotent; das Prüfskript spielt sie zweimal.
   Danach prüfen: Cron-Job `duell-ansagen-entscheiden` existiert,
   `duell_ansagen` steht in der Publikation `supabase_realtime`.
2. `ansage-sprueche` deployen (Autorisierung über das Nutzer-Token wie
   `wochenbericht`) und `aktivitaets-erinnerung` **neu deployen** — ohne die
   neue Fassung wird jede Ansage-Meldung still übersprungen
   (siehe `docs/wochenbericht.md`, „Der Worker musste mit“).
3. Frontend ausliefern. Ein Frontend vor der Migration zeigt keine Ansagen und
   bietet keine an (`duell_ansagen` fehlt → `ansagenVerfuegbar = false`).

## Später

- Push „letzte Chance“ um 19 Uhr, wenn jeder übrige Tag nötig ist
- Kontra: die herausgeforderte Person verdoppelt einmal pro Woche
- Versprechen: eine Ansage an sich selbst
- Rückblick im Wochenbericht (Lieferquote)
