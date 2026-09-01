# Verlauf der Nacht

## Ziel

Der Verlauf im Nachtdetail zeigt die Schlafphasen als Kurve statt als
Streifenbalken — dieselben Daten, aber lesbar wie in Sleep Cycle: Die Breite
bleibt die Uhr, die Hoehe ist die Schlaftiefe.

## Annahmen und Grenzen

- Die Phasen kommen unveraendert aus `schlafnaechte_ansicht`. Es wird nichts
  geglaettet, zusammengefasst oder ergaenzt; nur direkt aneinander grenzende
  Stuecke gleicher Hoehe (`kern` und `unspez`) werden zu einer Linie vereint.
- Die Achse beginnt und endet an den gemessenen Zeiten dieser einen Nacht,
  nicht an einem gerundeten Raster. Die beiden Eckzeiten stehen als Uhrzeit,
  dazwischen stehen volle Stunden.
- Wo Health nichts gemeldet hat, laeuft die Kurve geradlinig zum naechsten
  gemessenen Punkt weiter. Sie reisst nicht ab.
- Nächte ohne Stadien behalten den bisherigen Leerzustand.
- Unter fuenf Minuten am Stueck ist kein Abschnitt der Nacht: Wach steht dann
  als Punkt auf der Wachhoehe statt als Ausschlag und zaehlt nicht in der
  Anzahl neben `wach`, ein Stadium geht in seinen Nachbarn auf. Die Minuten je
  Stadium bleiben davon unberuehrt — sie kommen aus den Summen der Ansicht,
  nicht aus der gezeichneten Linie.

## Aufbau

Vier feste Hoehen, als Anteil des Kurvenfeldes von oben nach unten:

| Ebene | Anteil |
| --- | --- |
| wach | 10 % |
| rem | 35 % |
| kern und unspez | 65 % |
| tief | 90 % |

```
verlauf der nacht

  ‾‾\    __/‾‾\__      /‾‾\        <- wach oben, tiefschlaf unten
  - - - - - - - - - - - - - -      <- vier haarlinien auf den vier ebenen
     \__/        \____/
21:53     00     02     04   07:04

wach   2h 19m  6x   |  rem        1h 29m  22%
kern   4h 24m  64%  |  tiefschlaf 59m     14%
```

## Entscheidungen

| Entscheidung | Alternativen | Begruendung |
| --- | --- | --- |
| Kurve statt Balken | Gestapelter Streifen wie bisher | Ein Balken legt nur Farben nebeneinander. Die Nacht hat aber eine Richtung — hinunter in den Tiefschlaf und wieder herauf. Die Hoehe zeigt genau das. |
| Reihenfolge wach, rem, kern, tief | Alphabetisch oder nach Dauer | Kurve und Legende lesen sich dann in derselben Reihenfolge von oben nach unten. |
| Farbskala mit der Tiefe | Vier freie Signalfarben (vorher u. a. Orange fuer wach) | Wach ist die helle Linie oben, der Traum leuchtet, und je tiefer der Schlaf, desto dunkler das Petrol. Die Farbe wiederholt die Hoehe, statt ihr zu widersprechen. |
| Ein Pfad ueber eine Zeitreihe | Ein Pfad je Phase, die aneinander stossen | Siehe unten: die Teilstuecke waren die Fehlerquelle. Ein Pfad mit einem einzigen `M` kann nicht reissen. |
| Weicher Uebergang aus einer Flanke | Harte Stufen | Die Farbe wechselt in der Mitte der Flanke, dadurch bleibt es eine einzige Linie mit wechselnder Farbe. Kurze Phasen kuerzen die Flanke, damit sie sie nicht ueberrennt. |
| Monotone kubische Kurve (Fritsch–Carlson) | Catmull-Rom oder eine gewoehnliche Spline | Eine gewoehnliche Spline schwingt an jedem Phasenwechsel ueber ihre Stuetzpunkte hinaus: eine Delle unter den Tiefschlaf, eine Spitze ueber das Wachsein. Beides waere eine Tiefe, die niemand geschlafen hat. Die monotone Variante kann das nicht. |
| Leuchten nur um die Linie | Flach wie der Rest der App | Die einzige weiche Kante im ganzen Interface. Ohne sie wirkt die Nacht wie ein technischer Plot; sie traegt keine Information und darum auch keine zweite Bedeutung. |
| Luecke wird geradlinig ueberbrueckt | Linie an der Luecke abreissen lassen | Vorher blieb die Luecke offen. Das war ehrlich, aber es sah aus wie der Fehler, der daneben tatsaechlich einer war — und wer eine unterbrochene Linie sieht, liest "kaputt", nicht "nicht gemessen". Die Bruecke ist eine Gerade und damit sichtbar geraten: sie hat keine Flanke und kein Plateau, sondern laeuft stur zum naechsten bekannten Punkt. |
| Eine Schwelle fuer alle Phasen | Nur Wach filtern, Stadien roh zeichnen | Health zerlegt eine Nacht in bis zu achtzig Stuecke; die kurzen sind nicht nur beim Wachsein kurz. Ein Tiefschlaf von drei Minuten zwischen zwei Kernphasen ist im Bild ein Haarstrich ueber die volle Hoehe — genauso laut wie ein Zyklus von einer halben Stunde. Dieselbe Schwelle fuer alles ist eine Regel statt zweier und ergibt die ruhige, fliessende Kurve, die man aus Sleep Cycle kennt. |
| Unruhe unter fuenf Minuten als Punkt | Als waagerechter Strich; jedes Wachstueck als voller Ausschlag; oder ganz weglassen | Health zerlegt eine Nacht in bis zu dreissig Wachstuecke von ein bis zwei Minuten — umdrehen, Decke richten. Als voller Ausschlag ist eine solche Minute im Bild genauso laut wie eine halbe Stunde Wachliegen, und aus einer ruhigen Nacht wird ein Lattenzaun. Als Punkt bleibt sie sichtbar, an der richtigen Stelle, ohne die Kurve zu uebertoenen. Ein waagerechter Strich waere naeher an der Wahrheit gewesen, weil er auch die Laenge zeigt — aber genau so sah die kaputte Kurve aus, und zwei Dinge duerfen nicht gleich aussehen, wenn eines davon ein Fehler ist. Die Zeit der Unruhe geht je zur Haelfte an die beiden Nachbarn, damit die Uhr weiterhin stimmt. |
| Flanke in Minuten (13 vor und 13 nach der Grenze) | In Pixeln, wie vorher | Mit der Schwelle ist Platz dafuer: die Kurve fliesst zwischen den Phasen, statt zu springen, und liest sich als Nacht statt als Treppe. In Minuten statt in Pixeln, damit eine Nacht von drei Stunden keine steileren Flanken bekommt als eine von zwoelf. An kurzen Phasen bleibt die Flanke automatisch steil, weil sie nie laenger wird als die halbe Nachbarphase; und nie laenger als 2,5 % der Nacht, damit eine kurze Nacht nicht zu einer einzigen Welle verlaeuft. |
| Duenne Linie (1,5 Einheiten von 320) | Kraeftige Linie wie im ersten Entwurf | Der Strich ist die Aufloesungsgrenze: bei 320 Einheiten fuer eine Nacht ist eine Minute rund 0,6 Einheiten breit, ein Strich von 2,4 also gut vier Minuten. Alles Kuerzere hatte keinen Platz mehr fuer eine Form und wurde zur Doppellinie mit ineinanderlaufendem Schein — das sah nach Darstellungsfehler aus, nicht nach kurzer Phase. Mit 1,5 traegt der Strich alles ab etwa zweieinhalb Minuten, und der Schein ist entsprechend enger gefasst. |
| Vier Hilfslinien auf den Ebenen | Kein Raster; oder ein Raster mit Beschriftung | Die Hoehe der Kurve war nur relativ zu sich selbst lesbar: man sah, dass es tiefer wird, nicht, dass es vier Stufen sind. Die Linien liegen auf denselben Anteilen wie die Kurve (10/35/65/90 %) und in `--linie` wie jede andere Haarlinie der App — eine eigene, blassere Stufe (etwa 3 % Weiss) laege bei 1,08:1 gegen die Flaeche und waere auf dem Telefon nicht mehr da. Beschriftet sind sie nicht: die Legende darunter steht in derselben Reihenfolge, und vier zusaetzliche Woerter im Kurvenfeld waeren mehr Text als Bild. |
| Hoechstens sechs Uhrzeiten | Stuendlich, wie vorher | Stuendlich sind es bei acht Stunden neun Zahlen unter einer Kurve, die von acht Stunden erzaehlt. Sie ueberlappen nicht — der Randschutz hat das verhindert —, aber sie sind Rauschen. Ab sechs Stunden Nacht stehen deshalb Zwei-, ab zwoelf Drei-Stunden-Schritte; die beiden Eckzeiten bleiben immer, weil sie die einzigen gemessenen Zeiten der Achse sind. |
| Uhrzeiten auf 10 Einheiten | 9 wie vorher; oder 12 | 9 war an der Grenze des Lesbaren, 12 nimmt in einem 320 Einheiten breiten Feld ein Drittel mehr Platz und draengt die Eckzeit in die erste Stundenmarke. Mit 10 waechst der Randschutz von 34 auf 42 Einheiten mit. |
| Fuenf Minuten als Schwelle | Zwei oder zehn | Die Ansicht fasst bereits zusammen, was hoechstens zwei Minuten auseinanderliegt; was danach noch unter fuenf Minuten liegt, ist im Zweifel Unruhe. Alles darueber hat man am Morgen als Aufwachen in Erinnerung. |

## Warum die Kurve zerfallen war

Vorher bekam jede Phase ihren eigenen `<path>`, und ob zwei davon aneinander
stiessen, entschied ein Vergleich zweier Pixelwerte mit einer Toleranz von
0,01 Einheiten.

Health setzt seine Grenzen aber sekundengenau. Eine Sekunde Naht zwischen zwei
Segmenten ist bei 320 Einheiten fuer eine Nacht von rund acht Stunden gut
0,011 Einheiten breit — knapp ueber der Toleranz. Ab der ersten solchen Naht
galt jede Phase als alleinstehend, verlor ihre beiden Flanken und blieb als
waagerechter Strich auf ihrer Hoehe stehen. Aus der Kurve wurde ein
Lattenzaun. Dieselbe Toleranz in `verlauf` (0,001 Minuten) liess kurze
Stuecke zusaetzlich samt ihrer Zeit verschwinden, statt sie in den Nachbarn
aufgehen zu lassen — dort blieb dann ein Loch.

Der Neubau kennt keine Nahtstellen mehr. Aus den rohen Intervallen wird
zuerst eine Zeitreihe mit fester Schrittweite gebaut — fuer jede Minute der
Nacht genau ein Wert, ohne Luecke und ohne `null`. Aus dieser Reihe wird dann
ein einziger Pfad. Ob er durchgehend ist, haengt damit an keiner
Fliesskommazahl mehr, sondern daran, dass er nur ein `M` hat.

Beide Toleranzen sind trotzdem korrigiert: sie liegen jetzt bei einer Minute,
weil die Ansicht ohnehin alles zusammenfasst, was hoechstens zwei Minuten
auseinanderliegt. Was danach uebrig bleibt, sind die Sekunden aus Health.

Der Code steht in `src/lib/nachtkurve.ts`; `src/lib/schlafPhasen.ts` bereitet
die Phasen nur noch auf.
