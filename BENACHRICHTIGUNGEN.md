# Benachrichtigungen aufs Handy

Web Push für zweikampf: die App darf aufs Handy melden, auch wenn sie zu ist.

Gebaut ist bisher **der Weg**, nicht die Erinnerungen. Ein Schalter unten in der
App meldet das Gerät an, ein Knopf daneben schickt eine Probe durch die ganze
Kette. Was danach kommt — „heute noch nicht gewogen“ und die Ideen aus
[IDEEN.md](IDEEN.md) — braucht nur noch einen Zeitplan auf dem Server, keine
Zeile mehr auf dem Handy.

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

Das Paar wird **einmal** erzeugt und danach nie wieder angefasst: der
öffentliche Schlüssel steckt in jedem Abo, das ein Handy angelegt hat. Ein neues
Paar macht alle bestehenden Abos ungültig, und jeder müsste die
Benachrichtigungen von Hand neu einschalten.

### 2. Den öffentlichen Schlüssel in den Code

Er steht als `VAPID_STANDARD` in `src/lib/push.ts` und wird dort ausgetauscht.
Im Klartext, und das ist Absicht: der öffentliche Schlüssel liegt ohnehin in
jedem ausgelieferten Bündel und in jedem Abo, das ein Handy anlegt. Geheim ist
allein sein privater Gegenpart.

Der Gewinn ist, dass ein Build ohne gesetzte Variable keine App ausliefert, in
der die Benachrichtigungen wortlos fehlen. Wer trotzdem eine Variable will —
etwa für ein zweites Projekt —, setzt `VITE_VAPID_PUBLIC_KEY`; die geht vor.

### 3. Tabelle und Function nach Supabase

```powershell
npx supabase link --project-ref ogxwazageufvalkocywh
npx supabase db push
npx supabase secrets set `
  VAPID_PUBLIC_KEY=<der öffentliche schlüssel> `
  VAPID_PRIVATE_KEY=<der private schlüssel> `
  VAPID_KONTAKT=mailto:<eure adresse>
npx supabase functions deploy push-test
```

Tabelle und Function stehen im Projekt `ogxwazageufvalkocywh` bereits. Offen
sind nur die drei Secrets — ohne sie antwortet die Function mit
„vapid-schlüssel fehlen". Sie lassen sich auch im Dashboard setzen, unter
*Edge Functions → Secrets*.

`VAPID_KONTAKT` ist die Adresse, an die sich ein Push-Dienst wendet, wenn etwas
mit den Nachrichten nicht stimmt. `mailto:` oder `https:`, sonst weisen manche
Dienste die Nachricht ab.

Der private Schlüssel geht **nur** in die Secrets der Function. Nicht in den
Build, nicht ins Repository.

Anders als `fokus` und `schlaf-import` läuft `push-test` **mit** JWT-Prüfung
(also ohne `--no-verify-jwt`). Das Gateway prüft das Login-Token, und die
Zeilenrechte von `push_abos` sorgen danach dafür, dass die Function nur die
Geräte des aufrufenden Kontos sieht. Eine zweite Anfrage an den Auth-Dienst ist
absichtlich nicht nötig: sie wäre nur ein weiterer Ausfallpunkt, ohne die
Autorisierung zu verstärken.

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
| „kein gerät erreicht“ | Abo steht in der Datenbank, der Push-Dienst kennt es nicht mehr: aus und wieder ein |
| „ohne anmeldung aufgerufen“ | die App hat kein Token mitgeschickt: einmal ab- und wieder anmelden |
| „vapid-schlüssel fehlen“ | die drei Secrets der Function sind nicht gesetzt |
| „server antwortet N, aber kein json: …“ | etwas zwischen App und Function hat mit einer Fehlerseite geantwortet — der Anfang steht dahinter |
| „push-dienst antwortet nicht in 15 s“ | Apple oder Google hat den Push nicht angenommen; die Function bricht ab, statt bis zur Laufzeitgrenze zu hängen |

**Läuft auf dem Telefon überhaupt die neue Fassung?** Unten rechts in der
Fusszeile steht die Bauzeit. Steht dort eine alte Uhrzeit, hält der Service
Worker die alte App fest: App vom Home-Bildschirm löschen, in Safari neu laden,
wieder hinzufügen.

**Wie weit kam die Probe?** Seit Version 4 schreibt die Function jeden Schritt
in die Logs des Projekts (*Edge Functions → push-test → Logs*): wie viele Geräte
gefunden wurden, welcher Status je Gerät kam, und was am Ende gesendet wurde.

Bis Version 4 prüfte die Function das bereits vom Gateway geprüfte Token noch
einmal über `getUser()`. Antwortete dieser zusätzliche Auth-Aufruf mit einer
HTML-Fehlerseite, erschien unten in der App nur „Unexpected token '<'“. Seit
Version 5 entfällt dieser doppelte Aufruf; JWT-Prüfung und Zeilenrechte bleiben
unverändert aktiv.

Kommt die Probe trotz grüner Rückmeldung nicht an, liegt es am Service Worker.
Auf dem iPhone hilft: App vom Home-Bildschirm löschen, Safari neu laden, wieder
hinzufügen. Am Rechner zeigen die Entwicklerwerkzeuge unter *Application →
Service Workers*, ob `push-sw.js` mitgeladen wurde.

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
| `supabase/functions/_shared/webpush.ts` | Verschlüsselung und VAPID, ohne Bibliothek |
| `supabase/functions/push-test/index.ts` | die Probenachricht |
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

## Was als nächstes kommt

Der Weg steht, die Erinnerungen fehlen. Dafür braucht es:

1. eine Function, die für einen Tag ausrechnet, was fehlt (Ticks, Gewicht,
   Schlafimport) — dieselben Regeln wie im Raster, also aus `src/lib/tracker.ts`
   nach SQL oder in `_shared`;
2. `pg_cron`, das sie abends ruft;
3. je Person eine Uhrzeit, damit nicht beide um dieselbe Minute gestört werden.

Die Sammlung möglicher Nachrichten steht in [IDEEN.md](IDEEN.md).
