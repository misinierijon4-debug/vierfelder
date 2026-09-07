# Benachrichtigungen aufs Handy

Web Push für zweikampf: die App darf aufs Handy melden, auch wenn sie zu ist.

Ein Schalter unten in der App meldet das Gerät an, ein Knopf daneben schickt
eine Probe durch die ganze Kette. Zusätzlich sind im Repository zwei konkrete
Erinnerungen gebaut: fehlendes Tagesgewicht und fehlender Schlafimport. Ob sie
in einer Umgebung tatsächlich laufen, ist erst belegt, wenn Migration,
Scheduler-Authentifizierung, Function-Version und eine echte Zustellung dort
gemeinsam geprüft wurden. Weitere Nachrichten bleiben Kandidaten in
[IDEEN.md](IDEEN.md).

Der Grund für diese Reihenfolge: Push hat fünf Stellen, an denen es klemmen
kann — Erlaubnis, Abo, VAPID-Schlüssel, Verschlüsselung, Service Worker. Ein
Fehler in einer davon sieht von außen aus wie ein Fehler in jeder anderen: es
kommt nichts an. Erst wenn die Probe ankommt, ist eine Erinnerung nur noch Text
und Uhrzeit.

## Was auf dem iPhone gilt

* **Die App muss auf dem Home-Bildschirm liegen.** In Safari als Tab gibt es
  `PushManager` nicht, und damit auch keine Erlaubnisfrage. Teilen-Knopf →
  „Zum Home-Bildschirm“ → die App von dort öffnen.
* **iOS 16.4 oder neuer.**
* **Jeder erlaubt einmal, auf jedem Gerät.** Erijon und Koray haben getrennte
  Abos; ein iPhone und ein iPad desselben Menschen sind zwei Zeilen.
* **Löscht jemand die App vom Home-Bildschirm, ist sein Abo weg.** Danach neu
  einschalten. Die tote Zeile räumt der Server beim nächsten Senden selbst weg.
* **Das Handy hat keine Uhr dafür.** Die App kann sich nicht selbst um 20 Uhr
  melden. Jede Erinnerung kommt vom Server.

## Einmalig einrichten

### 1. VAPID-Schlüsselpaar erzeugen

```bash
node scripts/vapid.mjs
```

Das Paar wird nach der Einrichtung stabil gehalten: der öffentliche Schlüssel
steckt in jedem Abo, das ein Handy angelegt hat. Eine notwendige Rotation ist
ein eigener Release mit erneuter Anmeldung aller Geräte; ein stiller Austausch
würde die bestehenden Abos ungültig machen.

### 2. Den öffentlichen Schlüssel in den Code

Er steht als `VAPID_STANDARD` in `src/lib/push.ts` und wird dort ausgetauscht.
Im Klartext, und das ist Absicht: der öffentliche Schlüssel liegt ohnehin in
jedem ausgelieferten Bündel und in jedem Abo, das ein Handy anlegt. Geheim ist
allein sein privater Gegenpart.

Der Gewinn ist, dass ein Build ohne gesetzte Variable keine App ausliefert, in
der die Benachrichtigungen wortlos fehlen. Wer trotzdem eine Variable will —
etwa für ein zweites Projekt —, setzt `VITE_VAPID_PUBLIC_KEY`; die geht vor.

### 3. Datenbank, Secrets und Functions freigeben

Migrationen und Function-Deployments werden nicht aus dieser Einzelanleitung
gestartet. Die lokale und produktive Migrationshistorie ist noch nicht sicher
abgeglichen. Es gilt ausschließlich das
[Release- und Migrationsrunbook](docs/release-und-migrationen.md): History
reconciliieren, lokale Datenbank neu aufbauen, Backup samt Restore proben,
Invarianten und Rollen in Staging testen, Advisors prüfen und erst nach
Freigabe produktiv ausführen.

Die drei benötigten Function-Secrets heißen `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` und `VAPID_KONTAKT`. Ohne sie antwortet `push-test`
fail-closed mit „vapid-schlüssel fehlen“. Sie lassen sich im Dashboard unter
*Edge Functions → Secrets* kontrolliert setzen. Der private Schlüssel geht
**nur** in die Secrets der Function, nie in einen `VITE_*`-Wert, den Build oder
das Repository.

Die beiden Reminder haben zusätzlich den dedizierten Supabase-API-Secret-Key
`automations`. Sein `sb_secret_...`-Wert wird im Dashboard als eigener API-Key
angelegt und liegt — unter `vierfelder_automations_secret_key` — zusätzlich im
Vault für `pg_cron`. Er gehört
weder in `VITE_*` noch in diese Anleitung, einen anon-/Publishable Key oder ein
Nutzer-JWT. Fehlt oder passt er nicht, müssen Scheduler und Function
fail-closed bleiben. Anlage, Vault-Eintrag und Rotation sind produktive
Freigabeschritte im Release-Runbook.

`VAPID_KONTAKT` ist die Adresse, an die sich ein Push-Dienst wendet, wenn etwas
mit den Nachrichten nicht stimmt. `mailto:` oder `https:`, sonst weisen manche
Dienste die Nachricht ab.

Anders als `fokus` und `schlaf-import` läuft `push-test` **mit** JWT-Prüfung
(also ohne `--no-verify-jwt`). Der Handler validiert die Sitzung zusätzlich
über den Auth-Dienst, verlangt eine Zeile in `profile`, liest über RLS nur die
Abos dieses Kontos und reserviert höchstens eine Probe pro Minute. Keine dieser
Schranken ersetzt die anderen.

### 4. Auf jedem Handy einschalten

1. App vom Home-Bildschirm öffnen (nicht aus Safari).
2. Ganz nach unten scrollen, **einschalten** tippen.
3. Die Frage von iOS erlauben.
4. **probe senden** tippen. Die Mitteilung kommt auch, wenn die App zu ist.

## Wenn nichts ankommt

| Was der Schalter sagt | Was los ist |
|---|---|
| nichts (der Bereich fehlt ganz) | Prototyp-Modus ohne Konto |
| „auf dem server noch nicht eingerichtet“ | kein öffentlicher Schlüssel im Build |
| „muss auf dem home-bildschirm liegen“ | Safari-Tab statt installierter App |
| „dieser browser kann keine benachrichtigungen“ | zu alt, oder Push abgeschaltet |
| „abgelehnt“ | Erlaubnis verweigert — nur in den Geräte-Einstellungen zurückzunehmen |
| „für dieses konto ist kein gerät angemeldet“ | in der Datenbank wurde für dieses Konto kein Abo gefunden: am Gerät einschalten |
| „ohne anmeldung aufgerufen“ | die App hat kein Token mitgeschickt: einmal ab- und wieder anmelden |
| „vapid-schlüssel fehlen“ | die drei Secrets der Function sind nicht gesetzt |
| „server antwortet N, aber kein json: …“ | etwas zwischen App und Function hat mit einer Fehlerseite geantwortet — der Anfang steht dahinter |
| „server antwortet 502“ | kein Versand wurde sicher als erfolgreich bestätigt; die gerätespezifische Ursache steht nur in den Function-Logs |

**Läuft auf dem Telefon überhaupt die neue Fassung?** Unten rechts in der
Fußzeile steht der aus `HEAD` abgeleitete Commit-Zeitstempel, nicht die
Commit-SHA. Er ist ein nützlicher Hinweis; den exakten Stand belegen Workflow
und ausgeliefertes Artefakt. Die App prüft auf eine neue Worker-Version und
bietet ihre Aktivierung an; offene Eingaben und laufende Mutationen blockieren
den Wechsel. Löschen und neu installieren ist erst die letzte
Diagnosemaßnahme, weil dabei gerätespezifischer App-Zustand verloren gehen
kann.

**Wie weit kam die Probe?** Die Function schreibt in die Projektlogs, wie viele
Geräte für das angemeldete Konto gefunden wurden, welcher Status je
nummeriertem Gerät kam und was am Ende gesendet oder entfernt wurde. Endpunkte,
Schlüssel und Provider-Antworttexte dürfen dabei nicht erscheinen.

Ein dort protokollierter 15-Sekunden-Timeout bedeutet nur, dass rechtzeitig
keine Providerantwort ankam. Ob der Provider den Push nicht annahm oder seine
Antwort verloren ging, bleibt unbestätigt und darf keinen automatischen
zweiten Versand auslösen.

Die Sitzung wird trotz Gateway-Prüfung serverseitig über `getUser()` validiert.
Ein vorübergehender Auth-Ausfall ist deshalb ein eigener 502-Fehler und darf
nicht als abgelaufene Anmeldung oder erfolgreicher Versand erscheinen.

Kommt die Probe trotz Providerannahme nicht sichtbar an, bleiben Service
Worker, iOS-Mitteilungseinstellungen, Gerätezustand und spätere Zustellung als
getrennte Kandidaten. Zuerst App schließen, neu öffnen, Einstellungen prüfen
und den angebotenen Updatewechsel abschließen. Am Rechner zeigen die
Entwicklerwerkzeuge unter *Application → Service Workers*, ob `push-sw.js`
mitgeladen wurde. Löschen und neu installieren kommt erst danach und nur mit
dem Bewusstsein infrage, dass lokaler Prototyp- und Gerätezustand verloren
gehen kann.

## Wie es innen läuft

```
handy                          server
─────                          ──────
einschalten
  → erlaubnis von iOS
  → pushManager.subscribe()     ┐
  → endpoint + 2 schlüssel  ────┤→ tabelle push_abos (nur eigene zeilen sichtbar)
                                ┘
                                edge function push-test
                                  → verschlüsselt den text (RFC 8291)
                                  → weist sich aus (VAPID, RFC 8292)
                                  → POST an den endpoint
apple push service ←────────────┘
  → service worker: push-ereignis
  → showNotification()
```

Die Teile im Repository:

| Datei | Rolle |
|---|---|
| `supabase/migrations/20260902090000_push_abos.sql` | die Adressen der Geräte |
| `supabase/functions/_shared/pushEndpoint.ts` | enge Provider-Allowlist gegen fremde Netzwerkziele |
| `supabase/functions/_shared/webpush.ts` | Verschlüsselung und VAPID, ohne Bibliothek |
| `supabase/functions/_shared/versand.ts` | gemeinsamer, zustands- und Fencing-geschützter Versandweg für Erinnerungen |
| `supabase/functions/push-test/index.ts` | die Probenachricht |
| `supabase/functions/gewicht-erinnerung/index.ts` | meldet ein fehlendes Tagesgewicht |
| `supabase/functions/schlaf-erinnerung/index.ts` | meldet einen fehlenden Nachtimport |
| `public/push-sw.js` | zeigt an, was ankommt |
| `src/lib/push.ts` | an-, abmelden, Zustand |
| `src/components/Benachrichtigungen.tsx` | der Schalter |
| `scripts/vapid.mjs` | das Schlüsselpaar |

Warum kein `web-push`: die Bibliothek bringt den halben Node-Unterbau in eine
Deno-Function, und alles, was sie tut, sind zwei Schlüsselableitungen und eine
Signatur — beides kann die Web Crypto API, die in Deno, im Browser und in Node
dieselbe ist. So läuft derselbe Code in der Function und in den Tests unter
Node. `src/lib/webpush.test.ts` friert dabei jedes Byte der Ableitung mit einem
festen Vektor ein, der gegen `http_ece` gegengeprüft wurde — dieselbe
Bibliothek, die `web-push` innen benutzt.

Ein gespeicherter Push-Endpunkt ist trotzdem fremde Eingabe. Browser und jede
Function akzeptieren deshalb nur HTTPS-Endpunkte der bekannten Dienste Apple,
Google, Mozilla und Microsoft, ohne Benutzerinfo, Fragment oder abweichenden
Port. Redirects sind beim Versand verboten. Die Hostregeln folgen den
Providerangaben für [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers),
[Google](https://firebase.google.com/docs/reference/fcm/rest),
[Mozilla](https://mozilla-services.github.io/autopush-rs/) und
[Microsoft](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/wns-overview).
Provider-Antworttexte, Endpunkte und Gerätebezeichnungen erscheinen weder in
Function-Antworten noch in Logs.

Die bestehende produktive Tabellenprüfung erlaubt historisch noch jedes
HTTPS-Ziel. Der Versandguard verhindert daraus einen Request, direkte fremde
Inserts aber erst eine spätere Forward-Fix-Migration. Wegen der divergenten
produktiven Migrationshistorie darf dieser Datenbankteil nicht ungeprüft live
angewandt werden.

## Die zwei gebauten Erinnerungen

„heute noch nicht gewogen.“ ist der schmale erste Schnitt durch die ganze
Kette:

1. `gewicht-erinnerung` rechnet in deutscher Ortszeit nach, ob die persönliche
   Uhrzeit erreicht und für den heutigen Tag noch keine Messung vorhanden ist;
2. `pg_cron` ruft sie alle fünf Minuten. Eine ausgefallene Minute wird damit
   nachgeholt, nach 22 Uhr bleibt es trotzdem still;
3. `erinnerungs_einstellungen` hält je Person die Uhrzeit, anfangs 20:00;
4. `erinnerungs_versand` erlaubt je Person, Art und Tag genau eine Nachricht.

Der gemeinsame Versandweg führt jede Tagesnachricht durch die Zustände
reserviert, gestartet und bestätigt. Ein Fencing-Token schützt die Übergänge.
Nur ausdrücklich vorübergehende HTTP-Ablehnungen werden begrenzt erneut
versucht; bei verlorenem Antwortweg oder 5xx bleibt der Ausgang
`unbestätigt`, weil ein zweiter nicht-idempotenter Push eine Doppelmeldung
erzeugen könnte. Hat die Person heute schon gewogen, wird gar nicht erst
reserviert. Die Uhrzeit lässt sich in der Fußzeile neben dem Push-Schalter
ändern.

`schlaf-erinnerung` benutzt denselben Versandvertrag, prüft aber, ob die
Quellnacht zur persönlichen Morgenzeit fehlt. Keine der beiden Functions darf
einen fehlenden Datensatz mit einem erfolgreichen Import verwechseln.

Weitere Nachrichten bleiben bewusst in [IDEEN.md](IDEEN.md), bis beide
bestehenden Erinnerungen mindestens eine Woche lang zuverlässig und ohne zu
nerven gelaufen sind.

Dieser Wochenlauf ist eine echte Betriebsprüfung und im Repository nicht
automatisch belegt. Scheduler und beide Reminder werden nur in der im
Release-Runbook beschriebenen Reihenfolge aktiviert.
