# Schlafkalender

## Ziel

Der bestehende Schlaf-Tab behaelt seine kompakte Wochenansicht. Ein einzelner
Kalenderknopf darueber oeffnet eine Vollbild-Historie nach dem Bedienmuster von
Sleep Cycle. Ein gewaehlter Tag fuehrt zur passenden Woche und zum vorhandenen
Nachtdetail.

## Annahmen und Grenzen

- Der Kalender zeigt immer die aktuell im Nachtdetail gewaehlte Person.
- Eine Nacht wird nach dem Abend benannt, an dem sie begonnen hat.
- Farbige Ringe verwenden den bereits vorhandenen Qualitaetswert; leere Ringe
  bedeuten, dass fuer diesen Tag keine Schlafdaten vorliegen.
- Zukuenftige Tage sind nicht auswaehlbar.
- Import, Bearbeitung, Benachrichtigungen und ein roter Statuspunkt gehoeren
  nicht zu dieser Funktion.
- Die gesamte vorhandene Historie wird angezeigt, mindestens der aktuelle und
  der vorherige Monat.

## Ablauf

1. Kalenderknopf oberhalb der Wochenansicht antippen.
2. Der Vollbild-Kalender oeffnet sich beim ausgewaehlten Monat.
3. Einen Tag mit oder ohne Daten auswaehlen.
4. Der Kalender schliesst; Wochenleiste und Nachtdetail wechseln zu diesem Tag.

## Entscheidungen

| Entscheidung | Alternativen | Begruendung |
| --- | --- | --- |
| Eine Person pro Kalender | Beide Personen als Doppelring | Auf kleinen Displays eindeutig lesbar und konsistent mit dem Nachtdetail. |
| Vollbild-Dialog | Kalender unter der Woche oder eigene App-Registerkarte | Entspricht der gewuenschten Sleep-Cycle-Navigation, ohne den Schlaf-Tab dauerhaft zu vergroessern. |
| Bestehende Woche bleibt | Monatskalender ersetzt die Woche | Die Woche bleibt die schnelle Navigation; der Kalender ist nur die Historie. |
| Leere Tage sind auswaehlbar | Leere Tage deaktivieren | Der anschliessende Leerzustand erklaert eindeutig, dass keine Health-Daten importiert wurden. |
| Kein roter Punkt | Dekorativer Statuspunkt | Ohne echte ungelesene oder neue Daten haette der Punkt keine ehrliche Bedeutung. |
