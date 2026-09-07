# Architektur, Datenfluss und Datenschutz

`zweikampf` ist eine private Anwendung für genau Erijon und Koray. Der
öffentliche Produktname lautet `zweikampf`; Repository, Pages-Unterpfad,
Supabase-Projekt und bestehende `vierfelder.*`-Schlüssel behalten aus Gründen
der Daten- und Installationskontinuität den technischen Namen `vierfelder`.

## Zwei klar getrennte Datenmodi

| Modus | Auswahl | Speicherung | Geeignet für |
|---|---|---|---|
| Supabase | `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` sind gesetzt | Supabase; die Auth-Sitzung liegt im Browserspeicher | private echte Nutzung |
| lokaler Prototyp | beide Variablen fehlen | `localStorage` und `BroadcastChannel` | Entwicklung und ausdrücklich gekennzeichnete Beispieldaten |

Ein normaler lokaler Webbuild darf ohne Supabase-Werte als Prototyp starten.
Der Pages-Build bricht dagegen ab, wenn URL oder Publishable Key fehlen, die
Projekt-URL nicht exakt zu `ogxwazageufvalkocywh` gehört oder eine geheime
Key-Klasse in einer `VITE_*`-Variable steckt. Der Sites-Build wird unabhängig
von `.env.local` absichtlich als Prototyp gebaut und darf keine Produktivdaten
anbinden.

Der Prototyp ist kein privater Tresor: Er hält Tracker-, Gewichts-, Schlaf- und
Notenwerte beider Beispielpersonen im selben Browserprofil, bis der
Browserspeicher gelöscht wird. Auf gemeinsam genutzten Geräten dürfen dort
keine echten sensiblen Daten eingetragen werden.

Der Supabase-Start lädt Tabellen mit stabiler Sortierung in 1.000er-Seiten und
prüft Count sowie doppelte Schlüssel. Mehr als 100.000 Zeilen je Tabelle werden
bewusst nicht still abgeschnitten, sondern als Fehler gemeldet. Schlafphasen
werden nur für 56 Tage vorgeladen und für ältere Nächte auf Auswahl geholt.
Diese Mechanik ist lokal gegen Adapter-Doppel getestet; echte
PostgREST-Historien über 1.000 Zeilen und gleichzeitige produktive Schreibungen
sind davon getrennte Staging-Nachweise.

## Ende-zu-Ende-Datenfluss

```text
Browseraktion
  -> useStore in src/lib/store.ts
  -> Backend-Vertrag in src/lib/backend.ts
     -> lokaler Prototyp in src/lib/lokal.ts
        -> vierfelder.* in localStorage
        -> BroadcastChannel "vierfelder"
     -> Supabase-Adapter in src/lib/supabase.ts
        -> Tabelle, View oder RPC
        -> Postgres/RLS/Trigger
        -> Realtime-Ereignis
  -> Store führt Supabase-Ereignisse per stabiler ID/Version zusammen;
     lokale Broadcasts sind nur Invalidierungen und lösen einen kanonischen Reload aus
  -> zweiter Tab/Client erhält den kanonischen sichtbaren Zustand
```

Das UI führt keine zweite Wochen- oder Schlafwahrheit. Abgeleitete Anzeigen
werden aus den kanonischen Zeilen gebildet:

| Bereich | Schreibweg | Kanonische Quelle | Sichtbarer Rückweg |
|---|---|---|---|
| manuelle Tracker-Einheit | Store → bestätigter Einzelwrite; Mehrfach-Undo über atomaren Batch/RPC | `einheiten` | Realtime → Store → Raster/Tagesdetail |
| Standort/Fokus | iPhone → `record_aufenthalt` beziehungsweise Function `fokus` | `aufenthalte` | Realtime → Store; erst eine abgeschlossene Sitzung über der Schwelle zählt |
| Gewicht | App oder `record_gewicht` | `gewicht` samt Herkunft | Realtime → Store → Raster, Verlauf und Duell |
| Schlaf | iPhone → `schlaf-import` oder `record_sleep_night` | Rohquelle `schlafnaechte`, daraus `schlaf_updates` | App liest nur `schlafnaechte_ansicht`; Phasen werden pro Nacht nachgeladen |
| Noten | Store → bestätigter Insert/Delete; Prüfungsfach über RPC | `noten`, `faecher` | Realtime → Store → Notentab |
| Duell | Ableitung aus Tracker/Aufenthalt/Gewicht | laufend aus kanonischen Quellen; abgeschlossen in `wochenabrechnung` | Realtime und idempotenter Abschluss-RPC |
| Wette | Store → Expected-Version-RPC | `duell_wetten` mit Tombstone, globaler Version, Autor und Serverzeit | versioniertes Realtime → beide Clients; Alt-/Delete-Event erzwingt Reload |
| Push | Browserabo und Scheduler-Function | `push_abos`, Einstellungen und serverseitige Versand-Outbox | Push-Dienst → `push-sw.js` |

Mehrere manuelle und gemessene Einheiten eines Tages bleiben einzeln
auditierbar. Die Tagesanzeige darf daraus `gemischt` ableiten; Originalquelle
und Zeilen werden nicht aufgrund einer Überlappungsvermutung gelöscht.

## Offline und PWA

Der Service Worker speichert die App-Oberfläche und bereits geladene lokale
Schriften. Supabase-Antworten mit Gesundheits-, Standort- oder Notendaten sind
nicht Teil des Runtime-Caches.

„Offline verfügbar“ bedeutet deshalb nur: Die bereits installierte Oberfläche
kann starten. Im Supabase-Modus gibt es in diesem Branch keine freigegebene
persistente Mutations-Warteschlange. Bekannte Schreibaktionen werden bei
erkanntem Offlinezustand vor dem Start gesperrt und als nicht ausgeführt oder
nicht gespeichert gemeldet, statt einen erfolgreichen Serverstand
vorzutäuschen. Ein Verbindungsabbruch während eines Requests bleibt ein
Fehler-/Abgleichsfall; er ist kein belegter Offline-Erfolg.

Eine neue Worker-Version lädt die Seite nicht automatisch neu. Die App zeigt
das Update an und aktiviert es erst auf Nutzerwunsch; offene Dialoge, Entwürfe
und laufende Mutationen blockieren den Wechsel. Ein echter Test mit zwei Builds,
zwei Tabs und einer installierten PWA bleibt von Unit-Tests getrennt.

Bei einem vermuteten alten PWA-Stand wird in dieser Reihenfolge geprüft:

1. aus `HEAD` abgeleiteter Commit-Zeitstempel in der Fußzeile — keine SHA — und
   sichtbarer Update-/Syncstatus;
2. HTML, Manifest, `sw.js`, `push-sw.js` und gehashte CSS-/JS-Assets unter dem
   tatsächlichen Scope `/vierfelder/` mit Status und MIME-Typ;
3. wartender beziehungsweise aktiver Worker in den Browserwerkzeugen;
4. Reload nach bewusst aktiviertem Update, ohne offenen Entwurf;
5. erst zuletzt Worker abmelden oder die Home-Bildschirm-App löschen — nach
   Sicherung aller nur lokal vorhandenen Prototypdaten.

Eine erfolgreiche Neuinstallation beweist nicht, dass der vorherige
Updatepfad sicher war; sie ist nur eine Wiederherstellungsmaßnahme.

## Rollen- und Datenschutzmatrix

Die folgende Matrix beschreibt den Zielvertrag der lokalen Migrationen,
insbesondere
`20260905125647_mitgliedschaft_rls_absichern.sql`. Sie ist **keine Aussage,
dass dieser Vertrag bereits produktiv angewandt wurde**. Der laufende Audit
dokumentiert als punktuellen Live-Befund genau zwei Auth-Nutzer, zwei Profile
und keinen unprofilierten Nutzer, zugleich aber weiterhin aktivierte
E-Mail-Registrierung und alte Policies. Die Mitgliedschaftsmigration ist noch
nicht produktiv belegt. Offene Registrierung und der alte RLS-Stand sind
Releaseblocker; vor jeder Freigabe wird der Live-Zustand erneut gelesen.

„Beide“ heißt ausschließlich: ein authentifiziertes Konto mit einer Zeile in
`public.profile`, dessen `person` Erijon oder Koray ist. Ein drittes oder nur
authentifiziertes Konto ist kein Mitglied.

Die gegenseitige Sichtbarkeit von Gewicht, Schlafkennzahlen, Aufenthalten und
Noten ist eine bewusste Produktannahme, aber kein automatisch dokumentierter
Einwilligungsnachweis. Vor produktiver Nutzung bestätigen beide Personen den
Umfang; eine spätere Einschränkung einzelner Datenklassen ist eine
Produktentscheidung mit RLS-, UI-, Export- und Migrationsfolge.

„Eigen“ bedeutet immer zugleich: Mitgliedschaft ist bestätigt und
`auth.uid() = user_id`. „Beide“ meint nur die zwei profilierten Mitglieder,
nicht jedes beliebige authentifizierte Konto.

| Datenobjekt | Lesen | Anlegen | Ändern | Löschen | Sensibilität / Zweck |
|---|---|---|---|---|---|
| `profile` | beide | — | — | — | technische Mitgliedschaft und Personenzuordnung |
| `einheiten` | beide | eigen | eigen | eigen | Aktivität, Datum, Minuten/Seiten und Zeitpunkt |
| `eintraege` | beide, nur Altbestand | eigen | — | eigen | alter Tages-Tick; nicht mehr kanonisch für neue Clients |
| `werte` | eigen | eigen | eigen | eigen | private alte Minuten/Seiten |
| `gewicht` | beide | eigen | eigen | eigen | sensible Körperdaten; Herkunft wird serverseitig geschützt |
| `aufenthalte` | beide | nur Import-RPC | nur Import-RPC | — | sensible Aufenthalts- und Fokuszeiten; kein direkter Tabellen-Write |
| `schlafnaechte` | — | nur Importkern | nur Importkern | nur Importkern | Rohsegmente; niemals normale App-Abfrage oder Realtime |
| `schlaf_import_tokens` | — | nur Administration | nur Administration | nur Administration | nur Token-Hashes; Klartext bleibt auf dem jeweiligen Gerät |
| `schlaf_updates` / `schlafnaechte_ansicht` | beide | nur Trigger/Server | nur Trigger/Server | nur Trigger/Server | abgeleitete Kennzahlen und verfügbare Phasen, keine Token-Hashes |
| `faecher` | beide | — | eigen, nur atomare RPC | — | echte Fächer und Kursarten; Liste ist kein freies Formular |
| `noten` | beide | eigen | — | eigen | sensible Schulleistung; Fach muss derselben Person gehören |
| `duell_wetten` | beide | nur CAS-RPC | nur CAS-RPC | nur logischer Tombstone per CAS-RPC | gemeinsamer Einsatz mit globaler Version, Autor und Serverzeit; archivierte Wochen sind gesperrt |
| `wochenabrechnung` | beide | nur Abschluss-RPC | — | — | unveränderliches Wochenarchiv mit Berechnungsversion und Herkunft |
| `push_abos` | eigen | eigen | eigen | eigen | vertraulicher Provider-Endpunkt und Schlüsselmaterial |
| `erinnerungs_einstellungen` | eigen | eigen | eigen | — | persönliche Erinnerungspräferenz |
| `erinnerungs_versand` | — | nur Server | nur Server | — | serverseitige Zustandsmaschine gegen Doppelversand |
| `kurzbefehl_laeufe` | beide | nur Import-RPC | — | — | sparsame Diagnose ohne Rohsegmente oder Token |
| `private.*` | — | — | — | — | interne Rate-Limits und privilegierte Funktionskerne |

RLS und SQL-Grants sind zwei getrennte Schranken. Eine Tabelle ist nicht sicher,
nur weil eine Policy existiert; umgekehrt ersetzt ein `GRANT` keine
Zeilenautorisierung. Views müssen den RLS-Kontext des Aufrufers respektieren.
Privilegierte Kerne gehören in das nicht exponierte `private`-Schema, mit engem
Wrapper, leerem `search_path`, expliziten Grants und Negativtests.

## Auth und die Zwei-Personen-Grenze

Die App besitzt keine Registrierungsmaske. Zusätzlich setzt
[`supabase/config.toml`](../supabase/config.toml) für lokale/neu konfigurierte
Umgebungen `enable_signup = false` und deaktiviert anonyme Anmeldung. Diese
Datei ändert eine bereits laufende Supabase-Produktion nicht automatisch. Der
zuletzt im [Verbesserungsbericht](verbesserungsbericht.md) festgehaltene
Read-only-Audit fand Remote-E-Mail-Signup noch aktiviert. Das Abschalten ist
eine eigene, freigabepflichtige Produktionsänderung. Vor jedem Release werden
die Remote-Auth-Einstellung, exakt zwei erwartete Auth-Nutzer, exakt zwei
Profile und null unprofilierte Nutzer erneut geprüft.

Eine E-Mail-Adresse darf niemals über einen `else`-Zweig zu Koray werden. Der
kontrollierte Provisionierungsweg steht im [README](../README.md#die-zwei-konten).

## Lokaler Datenbestand

Die bestehenden Schlüssel sind Teil des Datenvertrags und werden nicht still
umbenannt:

- `vierfelder.einheiten.v1`, `vierfelder.gewicht.v1`,
  `vierfelder.wetten.v1`, `vierfelder.wetten.meta.v1`,
  `vierfelder.abrechnung.v1`;
- `vierfelder.faecher.v2`, `vierfelder.noten.v2`,
  `vierfelder.schlaf.v2`, `vierfelder.me.v2`;
- Altbestand `vierfelder.ticks.v2`, `vierfelder.werte.v2` und der zugehörige
  Migrationsmerker.

Der Prototyp besitzt keinen automatischen Export, kein verschlüsseltes Backup
und keine Aufbewahrungsfrist. Browserdaten zu löschen ist endgültig, wenn sie
nicht vorher bewusst gesichert wurden. Eine Import-/Exportfunktion bleibt eine
Produktidee und darf erst mit Schema-Version, Validierung, Vorschau,
Duplikatstrategie und Tests umgesetzt werden.

## Aufbewahrung, Export und Löschung

Der aktuelle Produktstand bietet noch keinen vollständigen Self-Service-Export,
keine selektive Löschübersicht und keine Kontolöschung in der App. Es existiert
auch keine allgemeine automatische Aufbewahrungsfrist. Tote Push-Abos können
beim Versand entfernt werden; daraus folgt keine Löschgarantie für andere
Datenklassen.

Eine administrative Löschung braucht deshalb einen vorher geprüften Plan:

1. Umfang und Einwilligung beider Betroffenen klären;
2. Export/Backup erstellen und Restore prüfen;
3. aktive Sitzungen und Import-Tokens widerrufen;
4. Push-Abos und Scheduler-Zugriff beenden;
5. Quell- und abgeleitete Daten einschließlich Schlafprojektion vollständig
   erfassen;
6. Löschung in Staging mit RLS und Kaskaden proben;
7. erst nach ausdrücklicher Freigabe produktiv ausführen und belegen.

Logausgaben dürfen keine vollständigen Gesundheitsdaten, Orte, Noten,
Push-Endpunkte, Tokens oder Hashes enthalten. Bei der Diagnose werden IDs und
URLs vor dem Teilen redigiert.

## Was derzeit noch kein belastbarer Nachweis ist

- SQL-Regex- und Unit-Tests sind kein echter PostgreSQL-/RLS-Test.
- Ein lokaler Build ist kein Staging- oder Produktionsbeleg.
- Desktop-Responsive-Emulation ist keine Abnahme auf einem physischen iPhone.
- Eine erreichbare Pages-URL beweist weder aktuelle Assets noch einen
  aktualisierten installierten Service Worker.
- Ein erfolgreicher Function-Deploy beweist weder Cron-Authentifizierung noch
  eine Push-Zustellung.

Die Freigabe- und Nachweisreihenfolge steht im
[Release- und Migrationsrunbook](release-und-migrationen.md).
