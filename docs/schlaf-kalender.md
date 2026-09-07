# Schlafkalender

## Ziel

Der bestehende Schlaf-Tab behaelt seine kompakte Wochenansicht. Ein einzelner
Kalenderknopf darueber oeffnet eine Vollbild-Historie nach dem Bedienmuster von
Sleep Cycle. Ein gewaehlter Tag fuehrt zur passenden Woche und zum vorhandenen
Nachtdetail.

## Annahmen und Grenzen

- Der Kalender zeigt immer die aktuell im Nachtdetail gewaehlte Person.
- Eine Nacht wird nach dem Abend benannt, an dem sie begonnen hat.
- Farbige Ringe verwenden einen geladenen Nachtwert. Fehlt bei einer vorhandenen
  Nacht noch der serverseitige Wert, leitet die Oberfläche vorsichtig einen
  Ersatz nur aus der Schlafdauer ab, markiert ihn sichtbar mit `~` und nennt
  ihn im zugänglichen Namen „geschätzt“. Das betrifft insbesondere
  Prototyp-/Legacy-Daten und darf nicht wie ein Server- oder Health-Nachtwert
  erscheinen. Ein leerer Ring bedeutet, dass im erfolgreich geladenen Bestand
  keine Nacht für diesen Tag vorliegt. Ein Ladefehler darf nicht als leerer Tag
  erscheinen; er bleibt ein eigener Fehlerzustand mit Retry.
- Zukuenftige Tage sind nicht auswaehlbar.
- Import, Bearbeitung, Benachrichtigungen und ein roter Statuspunkt gehoeren
  nicht zu dieser Funktion.
- Angezeigt wird die vom Backend geladene Kernhistorie, mindestens der aktuelle
  und der vorherige Monat. Der Supabase-Adapter liest diese Historie in
  1.000er-Seiten, prüft den exakten Count, den stabilen Sortierschlüssel und
  Duplikate und endet oberhalb von 100.000 Zeilen bewusst mit einem Fehler.
  Dieser Vertrag ist lokal mit einem Adapter-Doppel geprüft; ein echter
  PostgREST-Lauf mit mehr als 1.000 Nächten und konkurrierenden Live-Schreibungen
  bleibt ein eigener Staging-Nachweis. Phasen werden unabhängig davon nur für
  ein 56-Tage-Fenster vorgeladen und für ältere Nächte bei Auswahl nachgeladen.

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
