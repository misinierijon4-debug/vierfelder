-- Der Schlafimport kann still ausfallen.
--
-- Am 02.09.2026 meldete der Kurzbefehl auf dem iPhone „ausgefuehrt“, im
-- Gateway-Protokoll von Supabase steht fuer diesen Morgen aber kein einziger
-- Aufruf von `record_sleep_night`. Ein Kurzbefehl, der vor dem Netzaufruf
-- abbricht, ist serverseitig nicht zu reparieren — aber er darf nicht
-- unbemerkt bleiben. Diese Erinnerung macht aus dem stillen Ausfall eine
-- Nachricht auf dem Handy.
--
-- Sie ist der Gewichtserinnerung nachgebaut: eine persoenliche Uhrzeit, eine
-- Pruefung erst im Moment des Laufs, hoechstens eine Nachricht je lokalem Tag.
alter table erinnerungs_einstellungen
  add column schlaf_aktiv boolean not null default true,
  add column schlaf_zeit time without time zone not null default time '11:30',
  add constraint schlafzeit_vor_nachtruhe
    check (schlaf_zeit >= time '06:00' and schlaf_zeit < time '22:00');

-- 11:30 ist eine halbe Stunde nach der taeglichen Automation um 11:00. Wer den
-- Kurzbefehl von Hand nachholt, hat bis dahin Zeit und bekommt nichts.
comment on column erinnerungs_einstellungen.schlaf_zeit is
  'Uhrzeit, ab der eine fehlende Nacht gemeldet wird. Standard 11:30, eine halbe Stunde nach der Automation.';

-- Das Versandbuch kannte bisher nur eine Art. Der Primaerschluessel
-- (user_id, art, tag) trennt die beiden Erinnerungen schon; die Pruefung muss
-- die neue Art nur zulassen.
alter table erinnerungs_versand
  drop constraint erinnerungs_versand_art_check;

alter table erinnerungs_versand
  add constraint erinnerungs_versand_art_check
    check (art in ('gewicht', 'schlaf'));

select cron.schedule(
  'schlaf-erinnerung',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'vierfelder_project_url'
      ) || '/functions/v1/schlaf-erinnerung',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vierfelder_legacy_anon_key'
        ),
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vierfelder_legacy_anon_key'
        )
      ),
      body := '{}'::jsonb
    );
  $cron$
);
