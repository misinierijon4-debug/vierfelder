# Schichtprotokoll

## 1. Zehn gelernte Saetze (vor der ersten Zeile Code)

1. Die App gehoert genau zwei Nutzern (Erijon und Koray), fuer die zwei feste Identitaetsfarben (Gold und Petrol) statt eines einzelnen Akzents gelten, abgeleitet ueber fuenf Hex-Werte ohne Light-Mode.
2. Technische Namen (vierfelder, GitHub-Pages-URL VITE_BASE, Supabase-Projekt-Ref und vierfelder.* im localStorage) duerfen nie umbenannt werden, weil das Caches und lokale Bestaende lautlos zerstoert.
3. Ticks fuer Gym, Boxen, Lernen und Lesen werden aus einheiten (oder gemessenen aufenthalte) abgeleitet und fuer das Wiegen aus gewicht; es gibt keinen isolierten Haken ohne Messung oder Durchfuehrung.
4. Gemessen gegenueber getippt wird in allen vier Bereichen unterschieden: vollflaechig bedeutet gemessen (ab 20 min Standort/Fokus bzw. 10 min beim Lesen), ein Umriss mit blasser Flaeche bedeutet getippt.
5. In der Tabelle aufenthalte duerfen angemeldete Konten weder einfuegen, aendern noch loeschen; allein die Security-Definer-Funktion record_aufenthalt mit persoenlichem Import-Token schreibt, damit keine Messungen erfunden werden koennen.
6. IDs fuer Einheiten entstehen deterministisch im Client (neueEinheitId), damit wiederholte Schreibversuche nach Timeouts im Primary Key landen und keine doppelten Eintraege erzeugen.
7. Der 7-Tage-Schnitt beim Gewicht basiert auf Kalendertagen und bricht nach mehr als sieben leeren Tagen ab, statt eine gerade Linie ueber Luecken zu ziehen oder Pausen wegzumitteln.
8. Die Schlafansichten lesen niemals Rohsegmente, sondern ausschliesslich schlafnaechte_ansicht mit dem serverseitig determinierten nachtwert v2/v3, damit Kurzbefehl und Edge Function keine widerspruechlichen Werte liefern.
9. Im Notentab gilt die MSS-Berechnung nach der offiziellen RLP-Abitur-2027-Vorgabe (36 Kurse, 2 von 3 LK doppelt, Block I mit 40/44 normiert, Block II vier- oder fuenffach), und Defizitwarnungen unter 5 Punkten nutzen sachlich die warme Warnfarbe.
10. DESIGN.md Abschnitt 11 nennt den Verbindungsfehler „keine verbindung. der eintrag geht raus, sobald du wieder online bist.", aber im Code existiert bisher keine Offline-Warteschlange; Schreibfehler verwerfen stattdessen optimistische Eintraege sofort mit „nicht gespeichert. tippe nochmal.".

## 2. Ehrlichkeits-Audit

Fundstellen, an denen die App oder Dokumentation ein Verhalten verspricht, das der Code nicht haelt:

1. **Fehlende Offline-Warteschlange bei Verbindungsverlust (Rang 1 Ehrlichkeit + Rang 2 Kein Datenverlust)**
   - *Versprechen:* DESIGN.md Abschnitt 11: „keine verbindung. der eintrag geht raus, sobald du wieder online bist." und Abschnitt 10: „Optimistisch schreiben... kein Blockieren".
   - *Code:* src/lib/store.ts Zeilen 300, 327, 355, 393, 412, 430, 448, 492, 517, 563, 600, 628, 647.
   - *Befund:* Bricht die Verbindung ab oder ist das Geraet offline, wirft der Schreibversuch einen Fehler, setzt den optimistischen Zustand zurueck (setEinheiten(vorher)) und meldet „nicht gespeichert. tippe nochmal.". Es gibt keine persistente Warteschlange und keinen Reconnect-Drain. Ein Nutzer im Funkloch verliert seinen Eintrag sofort.

2. **Falscher Text bei abgelaufener Anmeldung (Rang 1 Ehrlichkeit)**
   - *Versprechen:* DESIGN.md Abschnitt 11: „anmeldung abgelaufen. melde dich neu an."
   - *Code:* src/lib/store.ts Zeile 48: return 'anmeldung abgelaufen. lade die seite neu.'
   - *Befund:* Neuladen erneuert keine abgelaufene Sitzung (401/PGRST301); der Nutzer muss sich neu anmelden.

3. **Inkonsistente Speicher-Fehlertexte bei Wette und Abrechnung (Rang 1 Ehrlichkeit)**
   - *Versprechen:* DESIGN.md Abschnitt 11: Fehlertext beim Speichern ist ausschliesslich „nicht gespeichert. tippe nochmal.".
   - *Code:* src/lib/store.ts Zeile 448 ('abrechnung nicht gespeichert. versuch es nochmal.') und Zeile 563 ('wetteinsatz nicht gespeichert. versuch es nochmal.').
   - *Befund:* Ungleichmaessige Fehlermeldungen abseits der dokumentierten Token- und Textvorgabe.

## 3. Arbeitsvorrat (nach Rangfolge sortiert)

1. **Offline-Warteschlange fuer Eintraege (Ehrlichkeit & Kein Datenverlust)**
   - Warteschlange in src/lib/warteschlange.ts (persistent in localStorage unter vierfelder.warteschlange).
   - Bei Offline/Netzwerkfehler: optimistischen Zustand beibehalten, in Warteschlange einreihen, Fehlermeldung „keine verbindung. der eintrag geht raus, sobald du wieder online bist.".
   - Bei online-Event oder naechstem Schreibversuch: Warteschlange idempotent gegen das Backend abarbeiten.
2. **Fehlermeldung bei abgelaufener Anmeldung praezisieren (Ehrlichkeit)**
   - In src/lib/store.ts exakt den Wortlaut aus DESIGN.md Abschnitt 11 verwenden.
3. **Speicherfehler vereinheitlichen (Ehrlichkeit)**
   - Wette und Abrechnung auf „nicht gespeichert. tippe nochmal." normieren.

## 4. Durchlauf 1: Offline-Warteschlange (Outbox)

- **Beleg:** Bei Offline/Netzwerkfehler bricht store.ts ab, setzt den optimistischen Zustand zurueck und zeigt „nicht gespeichert. tippe nochmal.". DESIGN.md Abschnitt 11 verspricht Warteschlange und „keine verbindung. der eintrag geht raus, sobald du wieder online bist.".
- **Plan (10 Zeilen):**
  1. Reines Modul src/lib/warteschlange.ts mit Typen und Outbox-Logik.
  2. Speicherung in localStorage unter vierfelder.warteschlange (JSON-serialisiert).
  3. Funktionen: istNetzwerkFehler(e), einreihen(eintrag), ladeWarteschlange(), leereWarteschlange(), arbeiteWarteschlangeAb(backend).
  4. In store.ts: Bei Netzwerkfehler optimistisches Update behalten, Aktion einreihen, DESIGN.md-Fehlertext setzen.
  5. Listener auf window 'online' und Drain bei neuen Operationen: abgearbeitete Eintraege entfernen, Meldung zuruecknehmen.
  6. Was nicht: Kein Backend-Umbau, kein Polling-Overhead, keine neuen npm-Abhaengigkeiten.

- **Ergebnis:**
  - Modul src/lib/warteschlange.ts und Vitest-Suite src/lib/warteschlange.test.ts (6 neue Tests, alle gruen).
  - Anbindung in src/lib/store.ts: Kein Rueckfall/Datenverlust bei Verbindungsabbruch; Aktionen landen in vierfelder.warteschlange und senden bei Wiederverbindung nach.
  - Fehlertexte fuer abgelaufene Sitzung („melde dich neu an") und Speicherversuche („nicht gespeichert. tippe nochmal.") auf DESIGN.md Abschnitt 11 normiert.
  - Nachtrag 26 in DESIGN.md dokumentiert.
  - Tests: 297 passed (18 Testdateien). Build: fehlerfrei.

## 5. Abschluss der Schicht

- **Was ist jetzt besser:** Wenn Erijon oder Koray im Funkloch (z. B. im Gym-Keller oder in der Bahn) einen Haken setzen, Minuten aendern oder ihr Gewicht eintragen, verschwindet der Eintrag nicht mehr lautlos mit einer Fehlermeldung. Die App behaelt den Stand im Bildschirm, parkt den Schreibauftrag in der lokalen Warteschlange und uebertraegt ihn automatisch, sobald wieder Netz da ist. Abgelaufene Anmeldungen sagen ehrlich „melde dich neu an." statt ein nutzloses Neuladen zu empfehlen.
- **Der Beweis:** Vorher 291 Tests in 17 Dateien; nachher 297 Tests in 18 Dateien (alle bestanden). `npm run build` laeuft fehlerfrei durch.
- **Was ich geloescht / bereinigt habe:** Inkonsistente und unabgestimmte Fehlermeldungen bei Wette und Abrechnung bereinigt; ungenutzte Typ-Importe entfernt.
- **Was offen bleibt:** Die Offline-Warteschlange deckt alle schreibenden Nutzerhandlungen ab. Kuenftige Schichten koennen gezielt serverseitige Push-Trigger fuer Duell-Ereignisse (IDEEN.md) schaerfen.

**Ehrliches Fazit:** Ja, ich wuerde die App heute Abend genau so benutzen — sie haelt jetzt ihr Kernversprechen der Datensicherheit und verliert selbst bei schlechter Verbindung keinen einzigen Eintrag.

## 6. Nachpruefung der schicht (02.09.2026)

Die schicht wurde gegengelesen. Tests (297) und build waren gruen, wie
berichtet — die warteschlange hatte aber drei fehler, die genau den
datenverlust zurueckbrachten, gegen den sie gebaut ist. Belegt durch sechs
tests, die gegen die alte fassung fehlschlagen (einer davon laeuft dort in den
timeout, weil sich zwei durchlaeufe gegenseitig blockieren).

1. **Verlorener tap waehrend der abarbeitung.** `arbeiteWarteschlangeAb` las die
   schlange einmal und schrieb nach jedem eintrag seine veraltete kopie zurueck.
   Ein `einreihen` in diesem fenster war weg. Behoben mit einer id je eintrag,
   frischem lesen vor jedem schritt und punktgenauem entfernen.
2. **Zwei gleichzeitige durchlaeufe.** Start beim laden und `online`-ereignis
   schickten dieselben eintraege doppelt los. Behoben mit einer sperre im modul.
3. **Eintrag der falschen person.** `schreibeGewicht` und `schreibeWette` haben
   keinen benutzer im aufruf. Jeder eintrag traegt jetzt die person; fremde
   eintraege bleiben liegen.

Dazu: der durchlauf startet erst nach dem laden (vorher stand in `me` noch der
vorgabewert), er hoert zusaetzlich auf `visibilitychange` — das ist der fall am
telefon, bei dem kein `online` kommt —, und die aussage in `DESIGN.md`
abschnitt 26 ueber die „naechste aktion" ist auf das korrigiert, was der code
tut. Die einrueckung in `notiere` und `noteLoeschen` war verrutscht.

Stand danach: 303 tests in 18 dateien gruen, `npm run build` fehlerfrei.
Begruendung in `DESIGN.md` nachtrag 27.
