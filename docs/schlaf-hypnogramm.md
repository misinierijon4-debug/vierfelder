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
- Wo Health nichts gemeldet hat, bleibt die Kurve unterbrochen.
- Nächte ohne Stadien behalten den bisherigen Leerzustand.

## Aufbau

```
verlauf der nacht

  ‾‾\    __/‾‾\__      /‾‾\        <- wach oben, tiefschlaf unten
     \__/        \____/
21:53   23   00   01 ...   07:04

wach   2h 19m  6x   |  rem        1h 29m  22%
kern   4h 24m  64%  |  tiefschlaf 59m     14%
```

## Entscheidungen

| Entscheidung | Alternativen | Begruendung |
| --- | --- | --- |
| Kurve statt Balken | Gestapelter Streifen wie bisher | Ein Balken legt nur Farben nebeneinander. Die Nacht hat aber eine Richtung — hinunter in den Tiefschlaf und wieder herauf. Die Hoehe zeigt genau das. |
| Reihenfolge wach, rem, kern, tief | Alphabetisch oder nach Dauer | Kurve und Legende lesen sich dann in derselben Reihenfolge von oben nach unten. |
| Farbskala mit der Tiefe | Vier freie Signalfarben (vorher u. a. Orange fuer wach) | Wach ist die helle Linie oben, der Traum leuchtet, und je tiefer der Schlaf, desto dunkler das Petrol. Die Farbe wiederholt die Hoehe, statt ihr zu widersprechen. |
| Weicher Uebergang, in der Mitte geteilt | Harte Stufen | Jede Haelfte behaelt die Farbe ihrer Phase, dadurch bleibt es eine einzige Linie mit wechselnder Farbe — ohne Naht und ohne erfundene Zwischenwerte. Kurze Phasen kuerzen den Uebergang, damit er sie nicht ueberrennt. |
| Leuchten nur um die Linie | Flach wie der Rest der App | Die einzige weiche Kante im ganzen Interface. Ohne sie wirkt die Nacht wie ein technischer Plot; sie traegt keine Information und darum auch keine zweite Bedeutung. |
| Luecke bleibt Luecke | Linie durchziehen | Eine durchgezogene Linie ueber eine Messluecke waere geraten. |
