# Internet in Eni

In Eni den Schalter „Internet“ oberhalb der Eingabe aktivieren und eine konkrete Suchfrage senden. Standard ist aus. Die Einstellung gilt für neue normale Nachrichten und Wiederholungen, unabhängig vom gewählten Modell. Automatische Wochenberichte bleiben ohne Suche.

## Den Suchschlüssel setzen

Die Suche läuft über Tavily. Der freie Tarif gibt 1.000 Suchen im Monat, verlangt keine Karte und beginnt jeden Monat neu; eine einfache Suche kostet dort einen Credit, und Eni macht höchstens eine Suche pro Nachricht. Damit kostet Internet nichts — das Modell dahinter war schon vorher kostenlos, bezahlt wurde immer nur die Suche.

1. Auf tavily.com anmelden und unter **API keys** einen Schlüssel erzeugen. Er beginnt mit `tvly-`.
2. Ihn als Secret setzen, nicht in eine Datei im Repository:

```bash
npx supabase secrets set TAVILY_API_KEY=tvly-DEIN-SCHLUESSEL
```

Alternativ im Supabase-Dashboard unter **Edge Functions → Secrets**. Der Code muss einmal draußen sein (`npx supabase functions deploy eni`); steht er, ist das Setzen oder Wechseln des Secrets kein weiterer Deploy — die Function liest es beim nächsten Aufruf.

Ohne diesen Schlüssel bleibt der alte Weg über das OpenRouter-Web-Plugin (Exa) stehen; er verwendet den vorhandenen `OPENROUTER_API_KEY`. Der kostet Guthaben: Exa Auto 0,007 USD je Suchanfrage laut Dokumentation vom 14.09.2026, und OpenRouter-Guthaben ist dafür auch bei einem kostenlosen Modell nötig. Sind beide Schlüssel gesetzt, sucht Tavily — der freie Weg geht vor, ohne dass jemand dafür einen Schalter finden muss. Der Schalter im Chat steht, sobald einer der beiden Schlüssel gesetzt ist.

## Was eine Suche mitbringt

Pro Nachricht gibt es höchstens einen Suchaufruf mit fünf Ergebnissen und 30 Sekunden Frist, ohne automatische Suchwiederholung. Anmeldung, Chatberechtigung und das vorhandene Tageslimit greifen davor.

An die Suche geht nur die aktuelle Frage, gekürzt auf 400 Zeichen, nicht der Trainingsstand, das Gedächtnis oder Dateianhänge. Für Anschlussfragen das Suchthema erneut benennen. Die Suche liefert relevante Seitenauszüge, keinen vollständigen Browser und keine garantierte Vollansicht einer verlinkten Seite. Eni verwendet nur Quellen, die wirklich einen Auszug mitbringen. Fremde Webseitenanweisungen werden als unvertrauenswürdige Daten behandelt. Echte Quellenlinks stehen dauerhaft an der gespeicherten Antwort; JavaScript-Links und HTML werden nicht ausgeführt.

**Die Auszüge sind bei Tavily kürzer als beim Web-Plugin.** Abgerufen wird die einfache Suche für einen Credit, ausdrücklich ohne `include_raw_content`: das holt jede gefundene Seite noch einmal ganz und wird zusätzlich berechnet — und umsonst zu suchen ist hier der ganze Punkt. Ein Auszug sagt also, worum es auf der Seite geht, nicht alles, was darauf steht. Für die Frage, was gerade passiert ist, reicht das; für die feine Stelle in einem langen Dokument nicht.

Die Auszüge stehen im Systemtext, bei Lage und Gedächtnis, und sind ausdrücklich als eigener Suchlauf gekennzeichnet. Eni weiß dadurch, dass er für diese Frage nachgesehen hat, und hält die Treffer nicht für hineinkopierten Text. Jede gefundene Quelle steht an der Antwort genau einmal als Link: was Eni schon selbst belegt hat, wird unten nicht noch einmal aufgezählt.

Die Auszüge selbst werden in `eni_quellen` an der Antwort gespeichert und in den folgenden Nachrichten desselben Chats wieder vorgelegt, als „früher in diesem Chat gesucht“. Eni kann danach also auch ohne neue Suche sagen, woher er etwas hat. Es gehen höchstens die vier jüngsten Suchläufe zurück und insgesamt 8.000 Zeichen Auszugstext, neueste zuerst; Titel und Adresse bleiben auch darüber hinaus stehen, der Volltext bricht ab. Geschrieben wird die Tabelle nur von der Edge Function mit Dienstrechten, gelesen und gelöscht nur vom eigenen Konto. Ein gelöschter Chat nimmt seine Quellen mit.

Anklickbar ist ausschließlich eine Adresse, die in diesem Chat wirklich gefunden wurde. Das gilt auch für Antworten ohne Internet und für den Wochenbericht: alles andere verliert beim Speichern sein Ziel und bleibt als Text stehen.

## Wenn es nicht klappt

Bei aufgebrauchten freien Suchen, abgelehntem Schlüssel, Timeout oder fehlenden Quellen wird keine vermeintlich recherchierte Antwort erzeugt. Eni sagt, was los ist, und die Vorlage bleibt für „wiederholen“ erhalten. Internet kann zum normalen Antworten ausgeschaltet werden.

Die Meldungen unterscheiden die Fälle: *Die freien Suchen sind gerade aufgebraucht* steht für die Monatsmenge und die Grenzen pro Minute (HTTP 429, 432, 433), *Der Suchschlüssel wird nicht angenommen* für einen falschen oder zurückgezogenen `TAVILY_API_KEY` (401, 403). Auf dem alten Weg heißt es weiterhin *Für die Websuche fehlt OpenRouter-Guthaben* (402).

## Betrieb

Backend: eni mit allen relativen Imports deployen, verify_jwt weiterhin true. Alte Clients senden kein internet-Feld und behalten ihr Verhalten. Alte Server melden die Fähigkeit nicht, dann ist der neue Schalter deaktiviert.

Datenbank: `20260914180000_eni_quellen.sql` legt die Tabelle an. Die Function kommt auch ohne sie zurecht — fehlt sie, wird das Lesen und Schreiben der Quellen protokolliert und übersprungen, die Antwort steht trotzdem. Die Reihenfolge von Migration und Deployment ist deshalb frei, aber bis die Tabelle steht, erinnert sich Eni nicht an frühere Suchläufe.

Dokumentation: https://docs.tavily.com/documentation/api-reference/endpoint/search, https://docs.tavily.com/documentation/api-credits und https://openrouter.ai/docs/guides/features/plugins/web-search
