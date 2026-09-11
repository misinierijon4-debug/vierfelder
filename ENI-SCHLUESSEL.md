# ENI: die Modellverbindung einrichten

Alles ist gebaut. Es fehlt genau eine Sache, und die machst du selbst: den
API-Schlüssel setzen. **Einer reicht.** Setzt du beide, kannst du in der App
oben im Kopf umschalten, mit wem du gerade redest.

**Schick den Schlüssel niemandem.** Nicht in einen Chat, nicht in eine Datei im
Repository, nicht in eine `.env`, die committet wird. Er gehört an genau eine
Stelle: in die Secrets deines Supabase-Projekts. Von dort liest ihn nur die Edge
Function, und die läuft auf dem Server. Im Browser-Bundle taucht er nie auf.

## 1. Schlüssel holen

Zwei Modelle stehen zur Wahl. Du brauchst nicht beide.

**DeepSeek Flash.** Auf platform.deepseek.com anmelden, unter **API keys** einen
neuen Schlüssel erzeugen. Er beginnt mit `sk-`. Du siehst ihn genau einmal.
Kostet Geld, aber wenig: siehe *Was das kostet* weiter unten.

**Ling 3.0 Flash über OpenRouter.** Auf openrouter.ai anmelden, im Dashboard
unter **API keys** einen Schlüssel erzeugen. Er beginnt mit `sk-or-v1-`. Das
Modell `inclusionai/ling-3.0-flash-vl:free` kostet nichts, hat 262K Kontext und
liest Bilder (das VL im Namen heißt vision-language). Dafür gelten OpenRouters
Grenzen für kostenlose Modelle, und was dort passiert, entscheidet OpenRouter,
nicht du.

Dieser eine Schlüssel bringt **zwei** Einträge ins Menü: `ling 3.0 flash` und
`ling 3.0 flash (denkt)`. Dasselbe Modell, derselbe Schlüssel, ein Unterschied —
siehe *Vordenken* weiter unten.

## 2. Schlüssel setzen

In der Projektwurzel. Das `npx` davor gehört dazu: der Supabase-CLI ist hier
nicht global installiert, sondern wird vom Projekt geholt.

```bash
npx supabase secrets set DEEPSEEK_API_KEY=sk-DEIN-SCHLUESSEL
```

```bash
npx supabase secrets set OPENROUTER_API_KEY=sk-or-v1-DEIN-SCHLUESSEL
```

Alternativ im Supabase-Dashboard unter **Edge Functions → Secrets**.

Jeder Schlüssel steht für sich. Setzt du nur einen, bietet ENI auch nur das eine
Modell an und der Umschalter im Kopf verschwindet — ein Menü mit einem Eintrag
ist keine Wahl. Setzt du beide, steht der Umschalter da, und die Wahl bleibt auf
diesem Gerät gemerkt.

Ein drittes Modell dazuzunehmen ist eine Zeile in
`supabase/functions/_shared/eniAnbieter.ts` plus ein Secret. Beide Gegenstellen
sprechen dasselbe OpenAI-Chatformat; sie streiten sich nur darüber, wie man das
Vordenken abschaltet, und genau das steht als Feld in der Zeile.

Optional, wenn dir die Standardgrenze von 60 Vorlagen pro Person und Tag zu hoch
oder zu niedrig ist:

```bash
npx supabase secrets set ENI_TAGESLIMIT=40
```

## 3. Fertig

Mehr ist nicht zu tun. Die Tabellen `eni_chats` und `eni_nachrichten` sind am
10.09.2026 angelegt (Migration `20260910165310_eni_verlauf`), und die Edge
Function `eni` ist ausgerollt und antwortet. Sie meldet nur so lange
`bereit: false`, wie kein Schlüssel gesetzt ist.

Wenn du die Function später änderst:

```bash
npx supabase functions deploy eni
```

## 3a. Bilder und Dateien

Dafür kommen zwei Dinge dazu, und beide gehen in einem Rutsch:

```bash
npx supabase db push && npx supabase functions deploy eni
```

Die Migration `20260910211500_eni_anhaenge` legt die Tabelle `eni_anhaenge` an
und den privaten Bucket `eni-anhaenge` dazu. Der Bucket ist nicht öffentlich:
jedes Bild liegt unter `<konto>/<chat>/`, und die Policy lässt nur das eigene
Konto an diesen Ordner. Angezeigt wird es über eine signierte Adresse, und das
Modell bekommt eine, die nach zehn Minuten abläuft.

Kein weiterer Schlüssel. Beide wählbaren Modelle lesen Bilder selbst.
`deepseek-flash` kann es, seit DeepSeek im
August 2026 die Bildeingabe in Flash gezogen hat; der alte Sondername
`deepseek-v4-flash-vision-exp` ist zurückgezogen. Ein Bild kostet höchstens 384
Token, unabhängig davon, wie groß es ankommt.

Was geht: JPEG, PNG, WebP, GIF und HEIC vom Telefon, dazu Textdateien wie `.md`,
`.csv`, `.txt`, `.json` und Quelltext. Bilder werden vor dem Hochladen auf 1280
Pixel gerechnet, was nebenbei die EXIF-Daten wegwirft, also auch den GPS-Punkt.
Aus Textdateien wird auf dem Gerät der Text gelesen und mitgeschickt, nicht die
Datei selbst.

Was nicht geht: PDF. Beide Modelle nehmen nur die Bildformate an, und eine
PDF-Bibliothek im Browser wäre rund ein Achtel des gesamten JavaScript-Budgets
dieser App für eine Sache, die ein Screenshot auch erledigt. Die Oberfläche sagt
das mit genau diesem Satz, statt die Datei stumm abzulehnen.

## 3b. Diktieren

Dafür ist nichts einzurichten und nichts zu bezahlen. Das Mikrofon in ENIs
Eingabe benutzt die Spracherkennung, die im Browser selbst steckt; keines der
Chatmodelle hat eine Transkription, und jede Gegenstelle, die eine hätte, wäre
ein weiterer Schlüssel und ein weiterer Ort, an dem eine Tonaufnahme liegt.

Umsonst heißt nicht auf dem Gerät: Chrome schickt den Ton an Google, Safari an
Apple. Deshalb steht während der Aufnahme eine Zeile unter dem Feld, die genau
das sagt, nach derselben Regel wie die Zeile im Kopf. Aufgenommen und
gespeichert wird nichts; was zurückkommt, ist Text im Eingabefeld, den man vor
dem Vorlegen noch ändern kann.

Firefox hat diese Schnittstelle nicht. Dort ist der Knopf nicht grau, sondern
weg.

## 3c. ENIs Stimme

Zwei Fassungen, wie überall in ENI: eine echte und eine, die einspringt.

### Die echte Stimme (Gemini-API über AI Studio)

Die Sprachausgabe des Browsers klingt blechern, und auf dem iPhone lässt sich
daran nichts ändern: dort sind alle ihre Stimmen lokal und alt. Wer ENI wirklich
zuhören soll, braucht eine neuronale Stimme.

Bewusst die Gemini-API und **nicht** Google Cloud Text-to-Speech, obwohl beide
von Google kommen und dieselben Stimmen haben: für Cloud TTS verlangt Google ein
Rechnungskonto mit Einzahlung, für einen Schlüssel aus AI Studio nicht. Die
Stimme ist dieselbe, der Weg dahin ist kostenlos.

**1. Schlüssel holen.** Auf aistudio.google.com anmelden, **Get API key** →
**Create API key**. Fertig. Keine Karte, keine Einzahlung, kein Projekt in der
Cloud-Konsole.

**2. Schlüssel setzen und ausrollen.**

```bash
npx supabase secrets set GEMINI_API_KEY=DEIN-SCHLUESSEL
```

```bash
npx supabase db push && npx supabase functions deploy eni-stimme
```

Die Migration `20260910224500_eni_stimme` legt den privaten Bucket `eni-stimme`
an. Mehr ist nicht zu tun; die Zeile im Kopf sagt danach, dass ENIs Stimme von
Google kommt.

**3. Eine andere Stimme, wenn dir Charon nicht gefällt.** Geschmack bei einer
Stimme kann kein Code für dich entscheiden, also steht sie in der Umgebung:

```bash
npx supabase secrets set ENI_STIMME=Fenrir
```

Männerstimmen sind unter anderem Charon (Vorgabe, ruhig und tief), Fenrir, Orus,
Puck, Umbriel, Enceladus und Iapetus. Anhören kannst du sie vorher direkt in AI
Studio, ohne irgendetwas umzustellen.

### Vordenken

`ling-3.0-flash-vl` ist ein Hybrid: es kann sofort antworten oder erst denken.
OpenRouters Modellauskunft sagt dazu:

```json
"reasoning": { "default_enabled": true, "mandatory": false }
```

**Von sich aus denkt es also vor.** Deshalb steht in beiden Ling-Zeilen der
Schalter ausdrücklich drin — eine Zeile ohne Angabe wäre nicht „wie das Modell
es macht", sondern unabsichtlich langsam.

**Stufen gibt es nicht.** Die Auskunft nennt für dieses Modell weder
`supported_efforts` noch `supports_max_tokens`, und das heißt laut OpenRouters
Doku, dass es keine Abstufung anbietet. `high`/`medium`/`low` sind OpenAI- und
Grok-Sache. Ein Menü mit drei Stufen wäre hier eine Behauptung, keine
Einstellung, also gibt es an und aus:

| Eintrag | `reasoning` | Ausgabedeckel |
| --- | --- | --- |
| `ling 3.0 flash` | `{ enabled: false }` | 2500 |
| `ling 3.0 flash (denkt)` | `{ enabled: true, exclude: true }` | 8000 |

Der höhere Deckel ist kein Luxus: Denk-Token sind Ausgabe-Token und gehen von
demselben Limit ab. Mit 2500 könnte das Denken die Erklärung auffressen und den
Satz mittendrin abschneiden. Das Modell lässt bis 32768 zu und kostet nichts;
der Deckel bremst hier nur eine Schleife, nicht die Rechnung.

`exclude: true` heißt, dass die Gedanken nicht zurückkommen. Sie stünden ohnehin
in `message.reasoning` und nicht in `content`, ENI würde sie also nie zeigen —
aber sie müssen deshalb auch nicht durch die Leitung.

Bei DeepSeek ist das Vordenken aus und bleibt es: `thinking: {type:'disabled'}`.
Dort kostet es Geld, hier nur Zeit.

## Was das kostet

Nichts. Die Sprachausgabe der Gemini-API läuft im kostenlosen Kontingent, ohne
hinterlegte Zahlungsweise; es gilt eine Anfragegrenze pro Minute und pro Tag,
keine Rechnung. Dazu kommt: **jeder Ton wird genau einmal erzeugt**. Er liegt
danach im Bucket, und dieselbe Antwort noch einmal zu hören fragt die
Gegenstelle gar nicht erst.

Der Client schickt nie Text, sondern nur die ID einer Nachricht. Was gesprochen
wird, liest die Function selbst aus der Datenbank, und nur, wenn die Zeile von
ENI stammt. So kann kein Client in einer Schleife Romane vorlesen lassen.

**Was wirklich knapp werden kann, ist der Speicher, nicht das Kontingent.** Die
Gegenstelle liefert rohes PCM, und daraus wird ein WAV: rund 48 KB je Sekunde,
also etwa ein halbes Megabyte für eine normale Antwort und ein paar Megabyte für
eine lange Erklärung. Der freie Supabase-Speicher sind 1 GB, das reicht für rund
tausend gesprochene Antworten. Wird es je eng, kannst du den Bucket `eni-stimme`
im Dashboard gefahrlos leeren: die Töne entstehen beim nächsten Anhören neu, und
kaputt geht dabei nichts.

MP3 wäre zwanzigmal kleiner, bräuchte aber einen Kodierer in der Edge Function.
Ein WAV-Kopf sind vierundvierzig Byte, die man selbst schreiben kann — das war
der Tausch.

### Der Rückfall (Browser)

Ohne Schlüssel, ohne Netz, in der Stimmenprobe und bei deiner eigenen, gerade
erst getippten Zeile spricht die Sprachausgabe des Browsers. Die arbeitet dafür
auf fast jedem Gerät lokal — der Ton entsteht auf dem Telefon und geht
nirgendwohin.

Von allen deutschen Stimmen des Geräts gewinnt die beste: erweiterte und
Premium-Fassungen vor kompakten, dann lokal vor Netz, dann die Männerstimme.
Auf dem iPhone lohnt es sich, unter **Einstellungen → Bedienungshilfen →
Gesprochene Inhalte → Stimmen → Deutsch** eine Premium-Stimme zu laden; die App
nimmt sie danach von selbst.

### Wie du sie hörst

- Der Lautsprecher neben ENIs Namen liest genau diese eine Antwort vor. Noch
  einmal drücken hält an.
- Der Schalter oben im Kopf lässt ihn von selbst vorlesen, sobald eine Antwort
  kommt. Das merkt sich die App.

### Wenn du die Stimme zurückziehen willst

```bash
npx supabase secrets unset GEMINI_API_KEY
```

ENI fällt dann von selbst auf die Sprachausgabe des Browsers zurück. Kaputt geht
nichts; die schon erzeugten Töne bleiben im Bucket liegen und werden weiter
abgespielt.

## 4. Prüfen

```bash
npm run check:eni
```

Das fragt die ausgerollte Function, ob ihr Schlüssel angekommen ist, und sagt
dir im Klartext, was noch fehlt. Der Schlüssel selbst taucht dabei nirgends
auf: die Function antwortet nur mit ja oder nein.

Oder direkt in der App: ENI öffnen. Oben im Kopf steht die Zeile, die sagt, was gerade läuft:

- `lokale stimmenprobe. noch keine modellverbindung.` → der Schlüssel ist nicht
  angekommen, oder die Function ist nicht ausgerollt.
- `deepseek flash über supabase. was du hier schreibst, verlässt dein gerät.` →
  es läuft. Statt `deepseek flash` steht dort der Name des Modells, das gerade
  gewählt ist.

Diese Zeile ist nicht Deko. Sie ist die einzige Stelle, an der die Oberfläche
sagt, ob deine Sätze das Gerät verlassen und wohin, und sie wird aus einer
echten Prüfung gespeist, nicht aus einer Vermutung. Dasselbe steht im
Info-Dialog hinter dem **i**.

## 4a. Das Modell wechseln

Stehen beide Schlüssel, sitzt oben im Kopf ein Chip-Symbol. Ein Druck öffnet die
Liste, ein Druck wählt. Der Verlauf bleibt stehen — es wechselt nur, wer die
nächste Antwort formt. Während ENI gerade antwortet, ist der Knopf gesperrt:
mitten im Satz wechselt niemand.

Die Wahl merkt sich dieses Gerät. Ziehst du später einen Schlüssel zurück, fällt
sie stillschweigend auf das verbliebene Modell zurück, statt in einen Fehler zu
laufen, den niemand erklären kann.

Der Browser kennt dabei nur eine Kurz-id und einen Namen. Adresse, Modellname
und Schlüssel kennt ausschließlich die Edge Function, und eine id, die es nicht
gibt, beantwortet sie mit 400, statt irgendwohin zu telefonieren.

## Was das kostet

Pro Vorlage gehen ENIs Charakter, der Wochenstand aus dem Tracker und die
letzten 24 Nachrichten des Chats mit. Das sind grob 1500 bis 2500 Eingabetoken
und selten mehr als 500 Ausgabetoken. Bei DeepSeek und beim schnellen Ling ist
das Vordenken ausgeschaltet: ENI ist eine Haltung, keine Rechenaufgabe, und die
Denk-Token zählen gegen dasselbe Ausgabelimit.

`inclusionai/ling-3.0-flash-vl:free` kostet nichts, mit und ohne Vordenken.
Dafür gelten OpenRouters Grenzen für kostenlose Modelle, und wenn dort
gedrosselt wird, antwortet ENI nicht — der Umschalter ist dann der Ausweg.

`deepseek-flash` kostet. Die aktuellen Preise stehen auf platform.deepseek.com;
DeepSeek rechnet Treffer im Kontext-Cache günstiger ab, und ENIs Charakter steht
bei jeder Vorlage unverändert vorn, ist also genau so ein Treffer.

Die Tagesgrenze aus Schritt 2 ist die harte Bremse, falls ein Handy verloren
geht oder ein Client in eine Schleife läuft. Sie zählt Vorlagen, nicht Modelle:
umschalten umgeht sie nicht.

## Wenn du einen Schlüssel zurückziehen willst

```bash
npx supabase secrets unset DEEPSEEK_API_KEY
```

```bash
npx supabase secrets unset OPENROUTER_API_KEY
```

Nimmst du einen weg, verschwindet nur dieses Modell aus der Liste. Nimmst du
beide weg, fällt ENI von selbst auf die lokale Stimmenprobe zurück, und die
Zeile im Kopf sagt es wieder. Kaputt geht dabei nichts, der Verlauf bleibt
stehen.
