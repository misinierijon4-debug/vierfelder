# Internet in Eni

In Eni den Schalter „Internet“ oberhalb der Eingabe aktivieren und eine konkrete Suchfrage senden. Standard ist aus. Die Einstellung gilt für neue normale Nachrichten und Wiederholungen, unabhängig vom gewählten Modell. Automatische Wochenberichte bleiben ohne Suche.

Die Edge Function verwendet den vorhandenen OPENROUTER_API_KEY. Es ist kein weiterer Key erforderlich. OpenRouter-Guthaben ist für das Web-Plugin auch bei einem kostenlosen Modell nötig. Exa Auto kostet laut Dokumentation vom 14.09.2026 0,007 USD je Suchanfrage; weitere normale Modellkosten bleiben bestehen. Pro Nachricht gibt es höchstens einen Suchaufruf mit fünf Ergebnissen und 30 Sekunden Frist, ohne automatische Suchwiederholung. Anmeldung, Chatberechtigung und das vorhandene Tageslimit greifen davor.

An OpenRouter geht für die Suche nur die aktuelle Frage, nicht der Trainingsstand, das Gedächtnis oder Dateianhänge. Für Anschlussfragen das Suchthema erneut benennen. Die Suche liefert relevante Seitenauszüge, keinen vollständigen Browser und keine garantierte Vollansicht einer verlinkten Seite. Eni verwendet nur Quellen mit Inhalt aus den URL-Annotationen. Fremde Webseitenanweisungen werden als unvertrauenswürdige Daten behandelt. Echte Quellenlinks stehen dauerhaft an der gespeicherten Antwort; JavaScript-Links und HTML werden nicht ausgeführt.

Die Auszüge stehen im Systemtext, bei Lage und Gedächtnis, und sind ausdrücklich als eigener Suchlauf gekennzeichnet. Eni weiß dadurch, dass er für diese Frage nachgesehen hat, und hält die Treffer nicht für hineinkopierten Text. Jede gefundene Quelle steht an der Antwort genau einmal als Link: was Eni schon selbst belegt hat, wird unten nicht noch einmal aufgezählt.

Die Auszüge selbst werden in `eni_quellen` an der Antwort gespeichert und in den folgenden Nachrichten desselben Chats wieder vorgelegt, als „früher in diesem Chat gesucht“. Eni kann danach also auch ohne neue Suche sagen, woher er etwas hat. Es gehen höchstens die vier jüngsten Suchläufe zurück und insgesamt 8.000 Zeichen Auszugstext, neueste zuerst; Titel und Adresse bleiben auch darüber hinaus stehen, der Volltext bricht ab. Geschrieben wird die Tabelle nur von der Edge Function mit Dienstrechten, gelesen und gelöscht nur vom eigenen Konto. Ein gelöschter Chat nimmt seine Quellen mit.

Anklickbar ist ausschließlich eine Adresse, die in diesem Chat wirklich gefunden wurde. Das gilt auch für Antworten ohne Internet und für den Wochenbericht: alles andere verliert beim Speichern sein Ziel und bleibt als Text stehen.

Bei fehlendem Guthaben, Suchlimit, Timeout oder fehlenden Quellen wird keine vermeintlich recherchierte Antwort erzeugt. Die Vorlage bleibt für „wiederholen“ erhalten. Internet kann zum normalen Antworten ausgeschaltet werden.

Backend: eni mit allen relativen Imports deployen, verify_jwt weiterhin true. Alte Clients senden kein internet-Feld und behalten ihr Verhalten. Alte Server melden die Fähigkeit nicht, dann ist der neue Schalter deaktiviert.

Datenbank: `20260914180000_eni_quellen.sql` legt die Tabelle an. Die Function kommt auch ohne sie zurecht — fehlt sie, wird das Lesen und Schreiben der Quellen protokolliert und übersprungen, die Antwort steht trotzdem. Die Reihenfolge von Migration und Deployment ist deshalb frei, aber bis die Tabelle steht, erinnert sich Eni nicht an frühere Suchläufe.

Dokumentation: https://openrouter.ai/docs/guides/features/plugins/web-search
