# IDEEN: Zukünftige Erweiterungen (für später)

Diese Ideen wurden bewusst nicht in Version 1 eingebaut, um den Kern scharf zu halten (Eintragen unter 3 Sekunden, abends, mühelos).

1. **Export & Backup:** Manueller JSON-Export und Import fuer Datenumzug ohne Cloud-Konto.
2. **Wochenrückblick im Raster:** Swipe nach links/rechts im Wochenraster, um vergangene Wochen anzusehen.
3. **Monats-Heatmap:** Kompakte Stempel-Jahresuebersicht im gleichen Stempellook.
4. **Haptisches Feedback:** Web Vibration API (`navigator.vibrate(15)`) beim Abhaken auf Android.
5. **Siri / Shortcuts Webhook / URL-Scheme:** `zweikampf://done/lernen` fuer Home-Screen Widget Schnellaktionen.
6. **Realtime fuers Gewicht:** `gewicht` steht bewusst nicht in `supabase_realtime`. Wiegen
   passiert einmal morgens, niemand sitzt daneben und wartet. Falls der veraltete Wochenstand
   doch stoert: Tabelle in die Publication aufnehmen und `abonniere` erweitern.
7. **Zielgewicht:** eine waagerechte Marke im Diagramm und der Abstand dorthin. Bewusst weg
   gelassen, damit das Diagramm den Verlauf zeigt und kein Urteil.

## Benachrichtigungen: die Sammlung

Der Weg dorthin steht (siehe [BENACHRICHTIGUNGEN.md](BENACHRICHTIGUNGEN.md)),
die Nachrichten selbst noch nicht. Alle folgen demselben Muster: der Server
schaut zu einer festen Uhrzeit nach, was fehlt, und schickt einen Satz.

**Erinnerungen — abends, wenn etwas offen ist**

* ✓ 20:00 — „heute noch nicht gewogen.“ — als erste echte Erinnerung gebaut;
  die Uhrzeit ist pro Person einstellbar.
* 20:00 — „heute noch nicht gelesen?“
* 20:30 — „2 von 5 heute. was geht noch?“
* 08:00 — „waage. zehn sekunden.“ (wiegen gehoert in den morgen, nicht in den abend)
* sonntag 18:00 — „letzter tag. dir fehlen noch 3 haken.“

**Duell — der staerkste Hebel bei zwei Leuten**

* „koray hat gym abgehakt. du liegst 2 zurueck.“
* „erijon hat dich ueberholt. 12 zu 11.“
* sonntag 21:00 — „woche vorbei: du 28, koray 25.“
* „die wette laeuft in 24 stunden ab.“

**Lob statt Druck.** Ohne das schaltet man Push nach einer Woche ab.

* „5 tage am stueck gelesen.“
* „neue bestwoche: 31 haken.“
* „erste woche, in der du jeden tag auf der waage standest.“

**Was sich selbst meldet**

* „training erkannt: 47 minuten. haken gesetzt.“ (aus der Standort-Automation)
* „fokus lernen lief 18 minuten. zwei fehlen zum haken.“
* „der schlafimport von heute nacht fehlt.“

**Schlaf und Noten**

* „nur 5h 20min. heute frueher ins bett.“
* „bettzeit in 30 minuten, wenn du auf 8 stunden willst.“
* „neue note: mathe 12 punkte. schnitt jetzt 11,4.“

Drei Regeln, die beim Bauen gelten sollten:

1. **Nie zweimal dasselbe.** Gleicher `tag` im Paket ersetzt die aeltere
   Mitteilung, statt sich danebenzulegen.
2. **Nichts nach 22 Uhr**, ausser die Nachricht handelt vom Schlafengehen.
3. **Keine Erinnerung an etwas, das schon erledigt ist.** Der Server rechnet
   vor dem Senden, nicht beim Planen.
