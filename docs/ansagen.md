# Ansagen — Herausforderungen im Duell

Status: **zweite Fassung (Stufen, Kontern, „du auch“) im Code, Migration
`20260924120000_ansagen_stufen.sql` noch einzuspielen.** Die erste Fassung
(ausgerollt am 23.09.2026) steht unten unter „Erste Fassung“.

## Idee

Eine Ansage ist eine Herausforderung an die andere Person: „4× boxen bis
Sonntag“. Schafft sie es, bekommt **sie** den Einsatz. Schafft sie es nicht,
bekommt ihn, **wer angesagt hat**. Damit ist jede Ansage ein echtes Risiko für
den, der ansagt — und ein echter Grund zu liefern für den, der angesagt wird.
Genau das ist der Punkt: sich gegenseitig zu mehr Training pushen.

Warum die erste Fassung nicht trug: das Ziel war Median + 1 der **gemessenen**
Tage. Wer ein Feld nie macht (Koray hat kein Gym-Abo), bekam „1× gym“ — für
den Herausforderer praktisch ein geschenkter Punkt, für den anderen nichts.

## Regeln

| Regel | Warum |
| --- | --- |
| Felder: **gym, boxen, lesen, lernen, wiegen** | lernen ist dazugekommen, wiegen bleibt — mit höherem Mindestwert |
| Ein Feld geht nur, wenn die herausgeforderte Person es in den letzten 4 Wochen an **mindestens 2 Tagen** hatte | kein Punkt für ein Feld, das der andere gar nicht macht |
| Stufen: **sicher ±1, mutig ±2, all-in ±3** | man setzt etwas, und je mehr, desto höher das Ziel |
| Ziel = max(Mindestwert, ⌈Schnitt × 1,3 / 1,6 / 2⌉), jede Stufe mindestens 1 über der vorigen | über der eigenen Form der herausgeforderten Person, nie darunter |
| Mindestwerte sicher/mutig/all-in: gym, boxen, lesen **2/3/4**, lernen **1/2/3**, wiegen **4/5/6** | 4× wiegen ist so viel wie 2× lesen; lernen machen beide selten |
| Das Ziel muss in die Woche passen: sicher und mutig mit **einem Tag Spielraum**, all-in ohne | ohne Spielraum ist eine Ansage nach dem ersten Fehltag tot |
| Frist **Sonntag 18 Uhr** — zusammen mit dem Finale | das Wochenende zählt mit, und um 18 Uhr ist alles entschieden |
| Ansagen bis **Freitag 18 Uhr** (48 Stunden Mindestlaufzeit) | kein „Freitagabend ansagen, was schon erledigt ist“ |
| Es zählt nur, was **nach der Ansage** beginnt und **am selben Tag eingetragen** wird — getippt oder gemessen, ein Tag je Feld | Punkte wie im Duell, aber ohne Nachtragen |
| **2 Ansagen** je Person und Woche, davon **höchstens eine all-in**; dasselbe Feld nicht zweimal | mit Kontern kann eine all-in-Ansage ±6 wert sein — zwei davon würden die Woche entscheiden statt würzen |

Gezählt wird wie im Duell: ein Tag je Feld, egal ob getippt (Box angeklickt)
oder gemessen (Standort, Fokus). Minuten und Seiten spielen keine Rolle.
Eine getippte Einheit zählt nur, wenn sie am Tag selbst eingetragen wurde
(`einheiten.erfasst`, und sie muss binnen eines Tages beim Server angekommen
sein — ein Offline-Eintrag vom Vorabend zählt noch). Eine Messung zählt, wenn
sie nach der Ansage begonnen hat und vor der Frist fertig war. Beim Gewicht
prüft die Datenbank `gewicht.erstellt`.

## Reagieren

Die herausgeforderte Person darf **einmal** reagieren, **innerhalb von 24
Stunden**:

| Reaktion | Wirkung |
| --- | --- |
| **kontern** | der Einsatz verdoppelt sich (all-in: ±6). Nur solange bei ihr noch nichts gezählt hat — sonst verdoppelt man, wenn man schon sieht, dass es klappt |
| **du auch** | die ansagende Person muss dasselbe Ziel bis zur selben Frist schaffen, gezählt ab derselben Ansage. Schafft sie es nicht, bekommt die andere den Einsatz. Das bremst absurde all-in-Ansagen |
| nichts | die Ansage läuft normal |

„du auch“ ist in der Datenbank eine eigene Zeile mit `bezug` auf die Ansage,
mit derselben Wertung in die Gegenrichtung. Sie kostet kein Kontingent.

## Wertung

| Ausgang | Punkte |
| --- | --- |
| geschafft | +Einsatz für die herausgeforderte Person |
| verfehlt | +Einsatz für die ansagende Person |
| läuft | nichts — die Restrechnung (`offeneAnsageWende`) weiß aber, dass beide den Einsatz noch bekommen können |

Einsatz = Stufe, gekontert doppelt. Die Ansage-Punkte zählen im Wochenstand
oben (der Score rollt mit), in der Restrechnung, in der ewigen Bilanz und in
der Sonntagsabrechnung (**Version 3**; `ansage_*` stehen fürs Audit daneben).

## ENI schlägt vor

Die App rechnet je ansagbarem Feld die Ziele aller Stufen und eine
**empfohlene Stufe**: die höchste, deren Ziel die ansagende Person selbst
üblicherweise schafft — dann tut ein „du auch“ nicht weh. Ein Ziel von einem
Tag schlägt ENI nie vor. ENI wählt die bis zu drei spannendsten aus und
schreibt einen frechen Spruch dazu, rechnet aber nie: ein Spruch mit Ziffer,
in Umschrift oder mit direkter Anrede an die andere Person wird verworfen,
dann stehen Vorlagesprüche da (`vorlageSpruch`).

## Einfrieren

Entschiedene Ansagen werden festgeschrieben (`ergebnis`, `entschieden_am`) und
nie wieder gerechnet.

- **geschafft**: sobald das Ziel erreicht ist (Cron alle fünf Minuten).
- **verfehlt**: erst mit der Frist Sonntag 18 Uhr. Was dann noch läuft, ist
  nicht fertig und zählt nicht.
- Die Wochenabrechnung entscheidet vorher noch einmal.

Bis zum Einfrieren zeigt die App ihren eigenen Stand. Beim Gewicht kann das
abweichen (der Browser kennt `gewicht.erstellt` nicht). Es gilt, was
eingefroren wird. Im Prototyp friert das Laden ein.

## Oberfläche

- `AnsagenBereich`: Kopf mit Kontingent, je Ansage eine große Karte
  (`AnsageKarte`: Ziel, Zellen wie im Raster, Countdown, Einsatz, Reaktion,
  Ergebnis mit Reveal), leerer Zustand, „koray herausfordern“, ENIs Vorschläge.
- `AnsageSheet`: Blatt von unten — Feld → Stufe (Ziel und Einsatz wechseln
  mit) → bestätigen, danach fällt ein Siegel „angesagt“.
- `AnsageHinweis`: im Tracker, eine laufende Ansage an dich, „reagieren“,
  solange das Fenster offen ist.
- Bewegung: `ANSAGE` in `src/lib/motion.ts`, alles unter 400 ms, Federn;
  `prefers-reduced-motion` schaltet ab.

## Wo was liegt

| Teil | Datei |
| --- | --- |
| Regeln, Ziele, Stand, Punkte, Reaktionen (Client) | `src/lib/ansagen.ts` |
| Texte, Countdown, Gruppierung mit „du auch“ | `src/lib/ansageAnzeige.ts` |
| Spalten, `sage_an_stufe`, `reagiere_auf_ansage`, Einfrieren, Abrechnung v3, Push-Texte | `supabase/migrations/20260924120000_ansagen_stufen.sql` |
| Prüfung der Migration in eingebettetem Postgres | `node scripts/check-ansagen-stufen.mjs <pglite/dist/index.js>` |
| Backend in beiden Modi | `src/lib/backend.ts` (`sageAn`, `reagiere`), `supabase.ts`, `lokal.ts` |
| Zustand | `src/lib/store.ts` (`ansagen`, `sageAn`, `reagiere`) |
| Wertung | `src/lib/duell.ts` (`AnsageWertung`), `src/App.tsx` |
| Oberfläche | `src/components/duell/AnsagenBereich.tsx`, `AnsageKarte.tsx`, `AnsageSheet.tsx`, `AnsageHinweis.tsx` |
| ENI-Sprüche | `supabase/functions/ansage-sprueche/`, `_shared/ansageSprueche.ts`, `src/lib/ansageSprueche.ts` |
| ENI kennt die Ansagen | `supabase/functions/_shared/eniLage.ts` |
| Push (08–22 Uhr, einmal am Tag: neue Ansage, kontert, du auch) | `aktivitaets_kandidaten` in der Migration, Art `ansage` |

## Ausrollen

1. Migration `20260924120000_ansagen_stufen.sql` einspielen. Sie ist
   idempotent; das Prüfskript spielt sie zweimal. Bestehende Ansagen bleiben
   `version = 1` und werden nach ihren alten Regeln entschieden.
2. `ansage-sprueche` und `eni` neu deployen (neue Felder, neue Regeln).
   `aktivitaets-erinnerung` muss nicht mit: die Art `ansage` kennt der Worker.
3. Frontend ausliefern. Ein Frontend **vor** der Migration findet die neuen
   Spalten nicht und zeigt keine Ansagen (`ansagenVerfuegbar = false`). Eine
   **alte** App nach der Migration bekommt beim Ansagen `ansage:veraltet`.

## Erste Fassung (bis 23.09.2026)

Wer ansagte, wettete einen Punkt darauf, dass die andere Person ein Ziel bis
Samstag *nicht* schafft: −1 sofort, +1 wenn sie verfehlte. Ziel = Median der
gemessenen Tage + 1, heruntergerechnet auf den Zeitraum. Felder gym, boxen,
lesen, gewicht; nur gemessen. Solche Zeilen tragen `version = 1`.
