# Release- und Migrationsrunbook

Dieses Dokument ist der einzige operative Release-Pfad für `zweikampf`. Die
Kurzbefehls- und Push-Anleitungen beschreiben ihre jeweilige Funktion, aber
führen keine Datenbankmigration oder produktive Veröffentlichung eigenständig
aus.

## Nachgezogene Migrationen (14.09.2026)

Vier Migrationen standen lokal, waren produktiv aber nie gelaufen. Der sichtbare
Schaden war das persoenliche Gedaechtnis: `eni_erinnerungen` existierte nicht,
und der Dialog meldete stattdessen "gerade nicht erreichbar". Sie wurden nach
ausdruecklicher Freigabe einzeln ueber `apply_migration` angewandt, nicht ueber
`db push`:

| Datei | produktive Version |
|---|---|
| `20260911181438_eni_gedaechtnis.sql` | `20260914133248_eni_gedaechtnis` |
| `20260911190000_eni_anhaenge_dienstschreiber.sql` | `20260914133254_eni_anhaenge_dienstschreiber` |
| `20260911200000_eni_stimme_ueberschreiben.sql` | `20260914133258_eni_stimme_ueberschreiben` |
| `20260913173714_wochen_partner_erinnerungen.sql` | `20260914133338_wochen_partner_erinnerungen` |

**Die Versionsnummern stimmen deshalb nicht ueberein, die Namen schon.** Ein
kuenftiges `supabase db push` haelt die lokalen Dateien fuer nicht angewandt und
wuerde sie ein zweites Mal ausfuehren — `create table` bricht dann ab. Vor dem
naechsten Push gehoert dieser Versatz in eine dokumentierte Reconciliation; bis
dahin gilt die Sperre unveraendert weiter.

Vor der Anwendung geprueft und nach der Anwendung bestaetigt: `private`-Schema,
alle referenzierten Tabellen und der Bucket `eni-stimme` waren vorhanden; beide
Konten haben eine `profile`-Zeile, weshalb die verschaerften Chat-Policies
niemanden aussperren; 20 Chats und 74 Nachrichten sind unveraendert. Der neue
Parameter `p_jetzt` von `reserviere_aktivitaetsversand` hat einen Default, alte
Aufrufe brechen also nicht.

Der Sicherheitsbericht meldet danach zwei neue `SECURITY DEFINER`-Funktionen fuer
angemeldete Konten, `oeffne_eni_wochenchat` und `schliesse_eni_wochen_einladung`.
Beide sind so gewollt — sie sind der schmale Schreibpfad fuer die Wochenbindung
und pruefen `auth.uid()` sowie die `profile`-Zeile selbst. Die uebrigen Meldungen
sind Altbestand.

## Neue Migration `eni_quellen` (14.09.2026)

ENIs Websuche speichert ihre Seitenauszüge seit diesem Paket an der Antwort,
damit er eine Nachricht später noch weiß, woher er etwas hat. Dafür kam eine
Tabelle dazu. Sie wurde nach ausdrücklicher Freigabe einzeln über
`apply_migration` angewandt, nicht über `db push`:

| Datei | produktive Version |
|---|---|
| `20260914180000_eni_quellen.sql` | `20260914163743_eni_quellen` |

**Auch hier stimmen die Versionsnummern nicht überein, die Namen schon.** Der
Versatz oben wächst damit um eine Zeile; die Sperre gegen `db push` gilt
unverändert weiter.

Vor der Anwendung gelesen und bestätigt: `public.eni_quellen` existierte noch
nicht, `eni_nachrichten`, `eni_chats` und `auth.users` standen, `service_role`
existierte. Nach der Anwendung: RLS aktiv, beide Policies auf
`auth.uid() = user_id`, `authenticated` hat `select` und `delete`, aber
ausdrücklich kein `insert` und kein `update`, `anon` hat gar nichts, `insert`
liegt bei `service_role` — dieselbe Rollenverteilung wie bei `eni_anhaenge`.
Bestand unverändert: 6 Chats, 28 Nachrichten vorher wie nachher.

## Neue Migration `eni_nachricht_bearbeiten` (15.09.2026)

Eigene Vorlagen lassen sich seit diesem Paket bearbeiten. Die ausgewählte
Menschenzeile bleibt erhalten; alle späteren Nachrichten werden in derselben
Transaktion entfernt, damit der Chat ab dort neu weiterläuft. Die Migration
wurde einzeln über `apply_migration` angewandt, nicht über `db push`:

| Datei | produktive Version |
|---|---|
| `20260915172144_eni_nachricht_bearbeiten.sql` | `20260915172403_eni_nachricht_bearbeiten` |

Die Funktion läuft als `SECURITY INVOKER`. `anon` hat kein Execute-Recht;
`authenticated` darf ausschließlich die Textspalte eigener `mensch`-Zeilen
ändern, weiterhin unter RLS und vorhandener Profilprüfung. Ein transaktionaler
Vertragstest als angemeldete Rolle bestätigte Update und Schnitt; seine
Testzeilen wurden per Subtransaktion zurückgerollt. Der Advisor meldete für
diese Änderung keinen neuen Befund. Die lokale und produktive Versionsnummer
weichen erneut ab; die Sperre gegen `db push` gilt deshalb unverändert.

**Nicht erfüllt sind Abschnitt 4 und 5.** Auf dem Rechner, auf dem dieses Paket
entstand, lief kein Docker, und ein getrenntes Staging-Projekt gibt es nicht.
Es gab also keine frische lokale Datenbank, keine gespielte Rollenmatrix, keine
Backup-Restore-Probe und keinen Staging-Lauf. Geprüft sind der SQL-Quelltext,
die Vorbedingungen und der Zustand danach — mehr nicht. Die Freigabe erfolgte in
Kenntnis dieser Lücke.

Die Edge Function `eni` kommt ohne die Tabelle aus: Lesen und Schreiben der
Quellen werden dann protokolliert und übersprungen, die Antwort steht trotzdem.
Deshalb war die Reihenfolge von Migration und Deployment hier unkritisch.

## Neue Migration `schlaf_segmente_verzeihend` (19.09.2026)

Ein iOS-Update hatte den Schlaf-Kurzbefehl auf einem der beiden iPhones
stillgelegt: erst fehlte der Header `apikey`, danach stand der Feldtyp von
`p_raw_segments` auf `Text` statt auf `Array`, sodass die Segmentliste als
Zeichenkette ankam. Die Migration nimmt die Liste seitdem auch in dieser Form
an und nennt in der Ablehnung den tatsächlich angekommenen Typ. Sie wurde nach
ausdrücklicher Freigabe einzeln über `apply_migration` angewandt, nicht über
`db push`:

| Datei | produktive Version |
|---|---|
| `20260919083937_schlaf_segmente_verzeihend.sql` | `20260919085500_schlaf_segmente_verzeihend` |

**Auch hier stimmen die Versionsnummern nicht überein, die Namen schon.** Der
Versatz oben wächst damit um eine Zeile; die Sperre gegen `db push` gilt
unverändert weiter.

Vor der Anwendung gelesen und bestätigt: die produktive Definition von
`record_sleep_night` stimmte Zeile für Zeile mit
`20260901132738_schlaf_import_rate_limit.sql` überein — es gab also keinen
unbekannten produktiven Sonderstand, den ein `create or replace` überschrieben
hätte. `_slfn_segmente` existierte noch nicht. Ausführungsrechte vorher
notiert: `record_sleep_night` für `anon` und `service_role`, nicht für
`authenticated`; `record_sleep_night_internal` für niemanden außer dem Owner.

Nach der Anwendung bestätigt: dieselbe Rollenverteilung wie vorher;
`record_sleep_night_internal` ist an der Prüfsumme ihrer Definition
nachweislich unberührt; Bestand unverändert mit 19 Nächten und zwei aktiven
Import-Token. Die Annahme wurde produktiv durchgespielt — echtes Array,
`{"segments": [...]}`, Text mit JSON-Array und einzelnes Wörterbuch kommen als
Array an, Zahl, Boolean, kaputtes JSON und `null` werden abgelehnt, und ein
echtes Array kommt wortgleich wieder heraus.

Weil `_slfn_segmente` anders als die übrigen `_slfn_*`-Helfer weder für `anon`
noch für `authenticated` ausführbar ist, wurde die Definer-Kette eigens
belegt: eine Wegwerf-Funktion mit demselben Aufbau wie `record_sleep_night`
(Owner `postgres`, `security definer`) erreichte `_slfn_segmente` als Rolle
`anon` — die Rolle des Kurzbefehls — und wurde danach wieder entfernt; die
Nachkontrolle zählte null Reste. Der Zugang des Kurzbefehls hängt also nicht
am Recht der Helferfunktion.

Vor dem Ausrollen wurden lokal beide Fassungen gegen Postgres 16
nebeneinander gestellt und für dieselben Eingaben verglichen. Kein Fall, der
vorher durchging, wird jetzt abgelehnt; abgelehnte Eingaben behalten SQLSTATE
`22023`, aus dem `schlaf-import` seinen HTTP-Status ableitet. Der zweite
Kurzbefehl, der unverändert ein echtes Array sendet, war damit nie betroffen.

Der Sicherheitsbericht meldet danach nichts Neues. Dass
`record_sleep_night` als `SECURITY DEFINER` von `anon` aufrufbar ist, ist
Altbestand und der gewollte Zugang des Kurzbefehls — die Identität kommt aus
`p_token` gegen `schlaf_import_tokens`. Die übrigen Meldungen sind ebenfalls
Altbestand.

## Neue Migration `wochenbericht_archiv` (19.09.2026)

Der Wochenbericht sichert montags um 00:00 Uhr Europe/Berlin einen unveränderlichen
Datenstand für beide Personen in `public.wochenberichte`. Die Migration wurde nach
ausdrücklicher Freigabe einzeln über `apply_migration` angewandt, nicht über `db push`:

| Datei | produktive Version |
|---|---|
| `20260919154400_wochenbericht_archiv.sql` | `20260919160732_wochenbericht_archiv` |

**Auch hier weicht die Versionsnummer ab, der Name stimmt überein.** Die Sperre
gegen ungeprüftes `db push` gilt unverändert weiter.

Vor der Anwendung geprüft: `public.wochenberichte` existierte noch nicht, `profile`,
`einheiten`, `aufenthalte`, `gewicht` und der View `public.schlafnaechte_ansicht`
standen, `pg_cron` war aktiv. Nach der Anwendung bestätigt: RLS aktiv auf
`wochenberichte`, Policy `mitglieder lesen wochenberichte` für `authenticated` aktiv,
Schreibrechte (`select, insert, update`) liegen ausschließlich bei `service_role`.
`private.sichere_wochenbericht` und `private.wochenbericht_montag` sind vor unbefugtem
Aufruf geschützt. Der Cronjob `wochenbericht-montag` ist mit Zeitplan `0 22,23 * * 0`
eingerichtet.

Der Sicherheitsbericht meldet für diese Änderung keine neuen Befunde. Die Edge
Function `wochenbericht` wurde mit aktiver JWT-Prüfung (`verify_jwt: true`, Version 1)
bereitgestellt; Aufrufe ohne Autorisierung werden mit HTTP 401 abgewiesen.

## Neue Migration `wochenschluss_mitternacht` (23.09.2026)

Eine Messung zaehlt nur noch fuer die Woche, wenn sie vor Montag 0 Uhr
Europe/Berlin endet. Anlass war KW 38: Korays Boxen (So 23:45 bis Mo 00:20)
fehlte im eingefrorenen Bericht (11:11), zaehlte aber in der Duell-Abrechnung
(11:12). Auf Wunsch von erijon sofort einzeln ueber `apply_migration`
angewandt, nicht ueber `db push`:

| Datei | produktive Version |
|---|---|
| `20260923090000_wochenschluss_mitternacht.sql` | `wochenschluss_mitternacht` (Zeitstempel der Anwendung) |

Die Migration ersetzt `private.finalisiere_wochenabrechnung` und berichtigt
die Archivzeile `2026-09-14`. Danach bestaetigt: 11:11, Belege 8:7, Sieger
erijon per Beleg. Die Sperre gegen `db push` gilt unveraendert weiter.

## Neue Migration `ansagen_stufen` (23.09.2026)

Ansagen mit Stufen, Kontern und „du auch“ (`docs/ansagen.md`). Auf Wunsch von
erijon einzeln ueber `apply_migration` angewandt, nicht ueber `db push`:

| Datei | produktive Version |
|---|---|
| `20260924120000_ansagen_stufen.sql` | `ansagen_stufen` (Zeitstempel der Anwendung) |

Vorher geprueft: 0 Zeilen in `duell_ansagen`, zwei Archive der Version 1.
Danach bestaetigt: neue Spalten und Funktionen vorhanden, Trigger
`einheiten_erstellt_fest` aktiv, `ansage_ziel_stufe` rechnet wie der Client,
beide Archive unveraendert, `aktivitaets_kandidaten` laeuft. Vorab in
eingebettetem Postgres mit `scripts/check-ansagen-stufen.mjs` durchgespielt.

Edge Functions: `ansage-sprueche` Version 3 (drei Dateien, `verify_jwt: true`),
`eni` Version 37 als ein mit rolldown gebautes Bundle (`verify_jwt: true`). Das
Bundle enthaelt ausser `eniLage` auch den Wochenschluss-Fix aus #56, der mit
Version 36 noch nicht deployt war. Der deployte Inhalt ist per SHA-256 gegen
das lokal gebaute Bundle geprueft; lokal in Deno gestartet, antwortet es auf
`{pruefen: true}` mit 200. Die Sperre gegen `db push` gilt unveraendert weiter.

## Neue Migration `schlaf_nacht_nicht_kuerzen` (25.09.2026)

Ein Schlafimport hat eine gespeicherte Nacht durch eine abgeschnittene Fassung
ersetzt, wenn die Automation vor dem Health-Eintrag der neuen Nacht lief: das
Fenster beginnt gestern 0 Uhr, die Vornacht kam nur ab Mitternacht an. Betroffen
waren erijons Nächte `2026-09-23` (22:58 → 00:08) und `2026-09-24` (21:54 →
00:03). Der Wrapper `record_sleep_night` behält jetzt die gespeicherten
Segmente vor dem neuen Fensterbeginn (`_slfn_frueheren_teil_behalten`);
`record_sleep_night_internal` bleibt unverändert. Auf Wunsch von erijon einzeln
über `apply_migration` angewandt, nicht über `db push`:

| Datei | produktive Version |
|---|---|
| `20260925090000_schlaf_nacht_nicht_kuerzen.sql` | `schlaf_nacht_nicht_kuerzen` (Zeitstempel der Anwendung) |

Die Migration ändert keine Daten. Die zwei verkürzten Nächte lassen sich aus der
Datenbank nicht wiederherstellen (keine Historie); sie kommen mit einem Lauf
zurück, dessen Fenster vor 21:54 am 23.09. beginnt. Die Sperre gegen `db push`
gilt unverändert weiter.

## Aktuelle Sperre

`supabase/schema.sql` ist ein historischer Grundstands-Snapshot. Die Dateien
unter `supabase/migrations/` beschreiben den angestrebten Verlauf, ihre lokale
Historie stimmt derzeit aber nicht lückenlos mit der produktiven
Migrationshistorie überein. Deshalb gilt bis zu einer dokumentierten
Reconciliation:

- kein ungeprüftes `supabase db push`, auch nicht mit `--include-all`;
- kein `migration repair` nach Vermutung;
- kein `db reset --linked`;
- keine produktive Function-Veröffentlichung, wenn ihr Datenbankvertrag noch
  nicht in genau dieser Umgebung geprüft ist;
- keine Änderung an bereits angewandten Migrationen;
- keine Tokenrotation, Löschung oder Änderung produktiver Daten ohne
  ausdrückliche Freigabe.

Der lokale Quelltest einer SQL-Datei beweist weder, dass PostgreSQL sie
ausführen kann, noch dass RLS in einer echten Rollenmatrix greift. Den
laufenden, nach Evidenz getrennten Stand führt der
[Verbesserungsbericht](verbesserungsbericht.md).

## Umgebungen und Beweisgrenzen

| Umgebung | Zweck | Was ein Erfolg beweist |
|---|---|---|
| lokaler Prototyp | Oberfläche ohne Supabase, Daten in `localStorage` | UI- und Fachlogik mit Beispieldaten |
| lokaler Webbuild | Produktionsbündel und PWA-Artefakte | TypeScript, Bundling und statische Artefaktverträge |
| lokale Supabase-Instanz | Migrationen von null, SQL- und Rollenprüfungen | reproduzierbarer lokaler Datenbankstand |
| separates Staging-Projekt | echte Auth-, PostgREST-, Realtime-, Cron- und Function-Kette | Integration in einer Supabase-Umgebung ohne Produktivdaten |
| Produktion | die private Zwei-Personen-App | nur die dort tatsächlich ausgeführten Smokes und Beobachtungen |
| physisches iPhone / installierte PWA | Safe Areas, iOS-Push, Kurzbefehle und Updatewechsel | ausschließlich das getestete Gerät und die getestete iOS-Version |

Ein grüner Unit-Test, ein erfolgreicher Pages-Job oder eine Desktop-Emulation
ersetzt keine der anderen Zeilen.

## 1. Quellstand sichern

Vor jedem Paket werden Branch, Arbeitsbaum und drei verschiedene Diffs getrennt
geprüft. Nutzeränderungen werden weder verworfen noch überschrieben.

```powershell
git status --short
git branch --show-current
git fetch --all --prune
git rev-list --left-right --count main...origin/main
git diff
git diff --cached
git log --graph --oneline --decorate --all
```

Die Veröffentlichung wird aus einem reviewbaren `codex/*`-Branch vorbereitet.
Merge nach `main`, Push und Produktion bleiben eigene Freigabeschritte.

## 2. Werkzeuge und Prüfpfade feststellen

Lokale Entwicklung und Workflows verwenden die in
[`.node-version`](../.node-version) festgelegte Node-LTS-Patchversion `22.23.2`.
Die CI installiert Deno in der in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) festgelegten Version.
Der Edge-Check bindet
[`supabase/functions/deno.lock`](../supabase/functions/deno.lock) im
Frozen-Modus ein; eine neue Abhängigkeit erfordert deshalb eine bewusste,
reviewbare Lockfile-Aktualisierung. Vor Supabase-Befehlen wird die aktuelle
CLI-Hilfe gelesen; die Optionen werden nicht aus alten Anleitungen übernommen.
Zusätzlich wird der seit dem letzten Release veröffentlichte
[Supabase-Changelog](https://supabase.com/changelog) auf CLI-, Auth-, API-Key-,
Data-API-, Function- und Postgres-Änderungen geprüft. Ein alter erfolgreicher
Lauf ist kein Beleg für unverändertes Plattformverhalten.

```powershell
npm ci
npx supabase --version
npx supabase --help
npx supabase migration list --help
npx supabase db reset --help
npx supabase db push --help
npx supabase functions deploy --help
```

Die lokalen Prüfungen sind getrennt:

```powershell
npm run typecheck    # nur TypeScript
npm test             # Vitest; die Testzahl gehört in den konkreten Laufbericht
npm run check:edge   # Deno-Check aller produktiven Edge Functions
npm run check:web    # Tests, Webbuild und Prüfung des Web-Artefakts
npm run check        # check:web plus check:edge
npm run build:pages  # zusätzlich strenge Pages-Umgebungsprüfung
npm run build:sites  # getrennte Root-Vorschau mit eigenem Sites-Worker
npm run benchmark:core # lokaler 430x932-Core-Flow im Sites-Prototyp
git diff --check
```

`npm run build` ist nur ein Alias für `build:web`. `npm run check` baut keinen
Sites-Worker und führt noch keine echte
Datenbank-, Browser-E2E-, Accessibility- oder Geräteprüfung aus.
Der Core-Flow-Benchmark startet Chrome mit einem frischen Profil und schreibt
nur in den vorab erzwungenen Sites-Prototyp; seine Zeiten sind Maschinenwerte,
keine Garantie für ein echtes iPhone oder ein langsames Mobilfunknetz.

## 3. Migrationshistorie abgleichen

Zuerst wird die verknüpfte Historie nur gelesen und als Release-Artefakt
gespeichert:

```powershell
npx supabase migration list --linked
```

`migration list --local` benötigt eine laufende lokale Supabase-Instanz und
folgt deshalb nach `supabase start` in Abschnitt 4. Läuft sie bereits, darf die
Liste hier zusätzlich gelesen werden.

Danach wird für jede nur lokal oder nur remote vorhandene Version geklärt:

1. Ist der fachliche Effekt produktiv bereits vorhanden?
2. Ist nur die Versionsnummer verschieden oder auch der SQL-Inhalt?
3. Welche späteren Migrationen setzen diesen Effekt voraus?
4. Muss die Historie korrigiert, ein Forward-Fix geschrieben oder eine lokale
   Datei als historischer Altweg dokumentiert werden?
5. Welche Abfrage beweist den Bestand vor und nach der Entscheidung?

Erst daraus entsteht ein schriftlicher Reconciliation-Plan mit Zuordnung jeder
Version. `migration repair` darf nur nach Prüfung seiner aktuellen
`--help`-Ausgabe, gegen das exakt benannte Ziel und nach Review dieses Plans
verwendet werden. Es ist kein Mittel, eine rote Liste schnell grün zu färben.

## 4. Frische lokale Datenbank

Wenn Docker oder Podman verfügbar ist, wird eine lokale Supabase-Instanz aus
null aufgebaut. Ausschließlich die lokale Datenbank darf ohne weitere
Freigabe zurückgesetzt werden:

```powershell
npx supabase start
npx supabase db reset --local
npx supabase migration list --local
npx supabase db lint --local --fail-on error
```

Der Reset gilt erst als bestanden, wenn reproduzierbare Fixtures vorhanden
sind und mindestens diese Rollen getestet wurden:

- `anon`;
- authentifiziert ohne Profil;
- Erijon als Eigentümer;
- Koray als erlaubter Gegenpart;
- fremder authentifizierter Nutzer;
- privilegierter Serverkontext.

Für jede relevante Tabelle, View und RPC gehören `SELECT`, `INSERT`, `UPDATE`,
`DELETE`, Spaltenrechte und Null-Zeilen-Erfolge in die Matrix. Historien werden
zusätzlich mit mindestens 1.001 Zeilen geprüft. Die derzeit überwiegend
quelltextbasierten Migrationstests sind dafür nur ein Schutznetz, kein Ersatz.

## 5. Staging-Gate

Vor Produktion braucht der Kandidat ein getrenntes Staging-Projekt. Vor jedem
destruktiven Staging-Schritt werden Projekt-Ref und Zielname laut im
Releaseprotokoll festgehalten; `db reset --linked` bleibt auch dort ein eigener,
ausdrücklich freigegebener Schritt.

Pflichtnachweise:

1. aktueller Backup-Stand der späteren Produktion und dokumentierter Umfang;
2. Restore-Probe dieses Backups in eine getrennte, entbehrliche Umgebung;
3. frischer Reset beziehungsweise Neuaufbau des ausdrücklich entbehrlichen
   Staging-Projekts aus der reconcilierten Migrationskette; Ziel, Datenumfang
   und Reset-Freigabe werden davor nochmals bestätigt;
4. Preflight-Abfragen für alle Dateninvarianten und erwartete Zeilenzahlen;
5. Review jeder neuen Migration einschließlich `SECURITY DEFINER`,
   `search_path`, Grants, RLS, Views und Realtime-Publication;
6. Dashboard Security- und Performance-Advisors sowie
   `npx supabase db lint --linked --fail-on error` gegen das ausdrücklich
   verifizierte Staging-Ziel;
7. `db push --dry-run` und Review der exakt angekündigten Versionen;
8. echter Lauf der Migrationen in Staging;
9. Auth-/RLS-/RPC-/Realtime-/Cron-/Function-Negativtests und parallele
   Wiederholungen;
10. Forward-Fix- und Rollback-Plan mit Auslösern; ein Restore ist nur der
    letzte, vorher geprobte Rückweg;
11. dokumentierte Freigabe für den Produktionslauf.

Die beiden Reminder-Cronjobs werden vor der zugehörigen
Versand-Zustandsmigration pausiert. Danach folgen Migration, Deployment von
`gewicht-erinnerung` und `schlaf-erinnerung`, negative Auth- und
Zustands-Smokes und erst dann die erneute Aktivierung. Eine neue Function darf
nicht auf einen alten Tabellenvertrag treffen.

Für die Reminder wird im Dashboard ein dedizierter Supabase-API-Secret-Key
namens `automations` angelegt; derselbe `sb_secret_...`-Wert liegt für
`pg_cron` unter `vierfelder_automations_secret_key` im Vault.
Anon-/Publishable Keys und Nutzer-JWTs dürfen diesen privilegierten
Server-zu-Server-Aufruf nicht autorisieren. Der Wert wird weder im Protokoll
noch im Repository ausgegeben; Staging muss fehlenden, falschen und nicht zum
Zweck passenden Aufruf jeweils vor jedem Datenzugriff abweisen.

## 6. Produktive Ausführung

Der Produktionslauf verwendet denselben, in Staging bewiesenen Commit und
dieselbe geprüfte Reihenfolge. Direkt davor werden Branch, Commit, Projekt-Ref,
Backup, Invarianten und Migrationsliste erneut gelesen. Abweichungen stoppen den
Lauf.

Der eigentliche `db push` und jedes Function-Deployment sind
Freigabeschritte. Vorher wird immer der Dry Run protokolliert:

```powershell
# Nur gegen das zuvor verifizierte Ziel; verändert weder Schema noch Vault.
npx supabase db push --linked --dry-run --skip-vault
```

`--skip-vault` ist auch beim Dry Run ausdrücklich gesetzt: Die aktuelle CLI
aktualisiert Vault-Werte aus `config.toml` grundsätzlich vor Migrationen. Eine
Vorschau darf keine Secrets verändern.

Der nicht trockene Lauf wird nicht aus einer Einzelanleitung kopiert. Er wird
erst nach Staging-Beleg, Backup/Restore-Probe und ausdrücklicher Freigabe aus
der aktuellen CLI-Hilfe übernommen. Dasselbe gilt für `functions deploy`,
Secrets, Scheduler, Auth-Einstellungen und Tokenrotation.

## 7. Reihenfolge von App, Datenbank und PWA

1. Datenbankänderung mit abwärtskompatiblem Vertrag bereitstellen.
2. Edge Functions bereitstellen und ihre negativen Pfade prüfen.
3. Webbuild mit exakt `/vierfelder/`, der festen Supabase-Projekt-URL und einem
   `sb_publishable_`-Key bauen.
4. Pages-Artefakt prüfen: Root-/Unterpfad, HTML, CSS/JS mit Status 200 und
   richtigem MIME-Typ, Manifest, Worker, Scope und Start-URL.
5. Preview im klar gekennzeichneten Datenmodus prüfen.
6. Erst nach Freigabe nach `main` mergen; der Pages-Workflow veröffentlicht.
7. Normalen Browser-Tab und installierte PWA getrennt prüfen. Eine wartende
   Worker-Version darf offene Eingaben nicht verwerfen.

## 8. Abschlussprotokoll

Für jeden Release werden getrennt festgehalten:

- Branch und Commit;
- lokaler Test-, TypeScript-, Edge- und Buildbefehl mit Exit-Code;
- lokale Datenbank, Staging und Produktion samt Projekt-Ref;
- angewandte Migrationen und deployte Function-Versionen;
- Backup und erfolgreiches Restore-Ziel;
- Rollen-/RLS-/RPC-/Realtime-/Cron-Nachweise;
- Browser, Viewports, Zoom und echte Geräte;
- Pages-, Sites-, Preview-, Push-, PR- und Produktionsstatus;
- offene Prüfungen und zuständige Person;
- Forward-Fix- oder Rollback-Auslöser.

„Lokal bestanden“ darf dabei nie als Synonym für „produktiv geprüft“ stehen.

## Offizielle Referenzen

- [Supabase CLI](https://supabase.com/docs/reference/cli/introduction)
- [Supabase-Changelog](https://supabase.com/changelog)
- [Publishable und Secret API Keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Lokale Entwicklung mit der CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Datenbankmigrationen](https://supabase.com/docs/guides/deployment/database-migrations)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Datenbank-Backups](https://supabase.com/docs/guides/platform/backups)
- [Edge Functions bereitstellen](https://supabase.com/docs/guides/functions/deploy)
