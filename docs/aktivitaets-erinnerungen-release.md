# Aktivitäts-Erinnerungen – Release 07.09.2026

Auf Nutzerauftrag direkt auf Main: Lernen (Mo–Fr 18:30), Lesen (täglich 20:45)
und ein Sonntagszwischenstand (18:00). Jeweils einzeln abschaltbar, bei
bestehender Push-Anmeldung standardmäßig aktiv. Alle Uhrzeiten Europe/Berlin.

## Produktionsvertrag und Historie

Quellbasis: `720857c109b0b9253760676e6dbfa9461f56ace4`.
Das Projekt `ogxwazageufvalkocywh` wurde vor dem Eingriff geprüft. Produktion
hat noch das alte Gewicht-/Schlaf-Versandbuch (fünf Spalten), keine vier neuen
Versand-RPCs und alte Functions mit anon-autorisiertem Cron. Deshalb kein
Replay der lokalen Migrationen und keine Veröffentlichung der bestehenden
Gewicht-/Schlaf-Functions aus Main.

Der neue Weg ist additiv: drei Boolean-Spalten in den eigenen Einstellungen,
ein unabhängiges Versandbuch, eine Tabelle mit ausschließlich einem
Scheduler-Token-Hash sowie drei nur für service_role freigegebene Invoker-RPCs.
Bestehende Fach- und Versanddaten wurden nicht verändert. Der geheime
Scheduler-Schlüssel wird in Vault erzeugt, die Function prüft ihn vor jeder
Auswertung gegen den Hash. Keine neue Vault-Leseberechtigung erforderlich.
Die bestehende RLS der Einstellungen beschränkt Lesen/Schreiben auf den Owner.

Die neue Migration wurde durch die CLI angelegt und vor Veröffentlichung
transaktional mit ROLLBACK auf dem realen Schema geprüft. Die Management API
vergab bei Anwendung die Version `20260907194310`; der lokale Dateiname wurde
exakt daran angeglichen, der SQL-Inhalt unverändert belassen. Der historische
Drift anderer Migrationen bleibt bestehen; weiterhin kein ungeprüftes db push.

## Produktentscheidungen

- Lernen/Lesen fragen nach einem fehlenden **Eintrag**, behaupten also nicht,
  dass die Tätigkeit tatsächlich unterblieben ist.
- Gemessene Sitzungen zählen ab 20 Minuten, Lesen ab 10 Minuten, entsprechend
  der bestehenden Wochenlogik. Manuell plus gemessen und mehrere Einheiten
  desselben Bereichstags ergeben durch UNION nur einen Punkt.
- Offene Sitzungen im jeweiligen Bereich pausieren den Reminder bis zwölf
  Stunden nach Beginn. Verwaiste Altsitzungen sperren nicht dauerhaft.
- Sonntag werden alle fünf Felder einschließlich Gewicht verglichen. Es wird
  kein Abschluss erzeugt und keine Wette ausgewertet. Keine erfundenen Ziele.
- Lernen wird nur bis 20 Uhr nachgeholt, Lesen bis 22 Uhr, Sonntag bis 19 Uhr.
  Maximal zwei neue Meldungen pro Tag; Samstag nur Lesen.
- Ein atomarer INSERT mit eindeutigem Schlüssel verhindert Doppelversand.
  Nach Reservierung prüft die Function Anlass und Text erneut. Unbestätigte
  Providerantworten werden nicht wiederholt. Ein Prozessabbruch kann daher
  eine Erinnerung kosten; dieser bewusste Kompromiss verhindert Doppel-Pushs.
- Push-TTL ist null: offline befindliche Geräte erhalten diese zeitgebundenen
  Meldungen nicht verspätet. Das ist keine Garantie für die genaue Anzeigezeit
  eines Betriebssystems, das eine bereits angenommene Nachricht zurückhält.

## Nachweise

- 750 Tests in 63 Dateien erfolgreich, einschließlich Versand-Rennen,
  veraltetem Anlass, Nachtruhe, Provider-Timeout und bestätigtem Speichern.
- TypeScript, Produktionsbuild und Web-Artefaktprüfung erfolgreich.
- Neue Edge Function mit Deno und lokal installierten Abhängigkeiten geprüft.
  Der vollständige Frozen-Check konnte lokal wegen blockierter Deno-Downloads
  nicht abgeschlossen werden; der unveränderte Check läuft zusätzlich in Pages-CI.
- Fachliche SQL-Fixtures aus `supabase/tests/aktivitaets_erinnerungen.sql`
  auf PostgreSQL innerhalb ROLLBACK erfolgreich, einschließlich Schwellen,
  Ausschalten und dedupliziertem Wochenstand. Keine Testdaten committed.
- Neue RPCs zusätzlich unter service_role erfolgreich gelesen; anon und
  authenticated haben weder Versandbuchzugriff noch Execute auf die RPCs.
- Supabase-Advisor: neue Tabellen absichtlich RLS ohne Client-Policy
  (nur Service-Zugriff); bestehende Warnungen an anderen Functions/Auth sind
  nicht durch diesen Release entstanden.
- Neue Function Version 1 aktiv veröffentlicht. Nicht authentifizierter
  Aufruf: HTTP 401. Authentifizierter Aufruf: HTTP 200, zwei Nachrichten
  vom Push-Dienst angenommen, keine Fehler. Eine sichtbare iPhone-Anzeige
  kann nur auf dem jeweiligen Gerät bestätigt werden.

## Betrieb und Rückweg

`aktivitaets-erinnerung` läuft nach Aktivierung alle fünf Minuten. Die Migration
legt den Job zunächst deaktiviert an; erst Function-Deployment und erfolgreicher
Smoke erlauben die Aktivierung. Aggregierte Zustände stehen in
`aktivitaets_versand`; es werden keine Push-Adressen oder Nachrichtentexte geloggt.

Bei Bedarf ausschließlich den neuen Job pausieren:

```sql
select cron.alter_job(
  (select jobid from cron.job where jobname='aktivitaets-erinnerung'),
  active := false
);
```

Keine Tabellen löschen, keine alte Migration zurückrollen. Gewicht und
Schlafimport laufen unabhängig weiter. Einzelne Erinnerungen schaltet jede
Person in der App unter „weitere erinnerungen“ aus.
