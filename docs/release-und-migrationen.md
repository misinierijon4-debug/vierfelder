# Release- und Migrationsrunbook

Dieses Dokument ist der einzige operative Release-Pfad für `zweikampf`. Die
Kurzbefehls- und Push-Anleitungen beschreiben ihre jeweilige Funktion, aber
führen keine Datenbankmigration oder produktive Veröffentlichung eigenständig
aus.

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
