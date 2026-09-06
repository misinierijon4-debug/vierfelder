-- Die Erinnerungs-Functions laufen mit service_role-Rechten. Ein oeffentlicher
-- anon-/publishable-Key darf deshalb nicht mehr genuegen, um sie anzustossen.
-- Vor der Freigabe muss im Dashboard ein Secret-Key namens `automations`
-- angelegt und sein Wert zusaetzlich im Vault unter
-- `vierfelder_automations_secret_key` gespeichert werden. Die Migration selbst
-- bleibt ohne externe Secrets reset-faehig. Der geplante Lauf endet dann bei
-- jeder Ausfuehrung fail-closed, bevor ein HTTP-Request entsteht.

create or replace function private.rufe_erinnerung_auf(p_function text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_url_count integer;
  v_automations_key_count integer;
  v_project_url text;
  v_automations_key text;
begin
  if p_function not in ('gewicht-erinnerung', 'schlaf-erinnerung') then
    raise exception 'unbekannte erinnerungs-function';
  end if;

  select count(*), min(decrypted_secret)
    into v_project_url_count, v_project_url
    from vault.decrypted_secrets
   where name = 'vierfelder_project_url';

  select count(*), min(decrypted_secret)
    into v_automations_key_count, v_automations_key
    from vault.decrypted_secrets
   where name = 'vierfelder_automations_secret_key';

  if v_project_url_count <> 1
     or v_project_url <> 'https://ogxwazageufvalkocywh.supabase.co' then
    raise exception 'scheduler nicht konfiguriert: projekt-url fehlt oder ist ungueltig';
  end if;

  if v_automations_key_count <> 1
     or v_automations_key !~ '^sb_secret_[A-Za-z0-9_-]{20,}$' then
    raise exception 'scheduler nicht konfiguriert: automations-secret-key fehlt oder ist ungueltig';
  end if;

  return net.http_post(
    url := v_project_url || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_automations_key
    ),
    body := '{}'::jsonb
  );
end
$function$;

revoke all on function private.rufe_erinnerung_auf(text)
  from public, anon, authenticated;

-- Nur ueber die pg_cron-API aendern. Direkte Schreibzugriffe auf cron.job sind
-- auf der gehosteten Plattform gesperrt.
do $migration$
declare
  v_job record;
begin
  for v_job in
    select jobid
      from cron.job
     where jobname in ('gewicht-erinnerung', 'schlaf-erinnerung')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end
$migration$;

select cron.schedule(
  'gewicht-erinnerung',
  '*/5 * * * *',
  $cron$select private.rufe_erinnerung_auf('gewicht-erinnerung');$cron$
);

select cron.schedule(
  'schlaf-erinnerung',
  '*/5 * * * *',
  $cron$select private.rufe_erinnerung_auf('schlaf-erinnerung');$cron$
);
