-- Die erste echte Erinnerung: je Person eine Uhrzeit und hoechstens eine
-- Gewichtsnachricht pro lokalem Kalendertag.
--
-- `pg_cron` ruft die Function alle fuenf Minuten. Die Function entscheidet
-- erst in diesem Moment, ob die persoenliche Uhrzeit erreicht und fuer heute
-- noch kein Gewicht eingetragen ist. So kann eine morgens geplante Nachricht
-- nicht abends trotz erledigter Messung herausfallen.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table erinnerungs_einstellungen (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  gewicht_aktiv boolean not null default true,
  gewicht_zeit time without time zone not null default time '20:00',
  aktualisiert timestamptz not null default now(),
  constraint erinnerungszeit_vor_nachtruhe
    check (gewicht_zeit >= time '06:00' and gewicht_zeit < time '22:00')
);

alter table erinnerungs_einstellungen enable row level security;

revoke all on table erinnerungs_einstellungen from anon;
revoke all on table erinnerungs_einstellungen from authenticated;
grant select, insert, update on table erinnerungs_einstellungen to authenticated;

create policy "erinnerungszeit lesen" on erinnerungs_einstellungen
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "erinnerungszeit anlegen" on erinnerungs_einstellungen
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "erinnerungszeit aendern" on erinnerungs_einstellungen
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Beide bestehenden Personen beginnen bei 20:00. Der Trigger gibt spaeteren
-- Profilen denselben Standard, ohne dass die App zwei Tabellen pflegen muss.
insert into erinnerungs_einstellungen (user_id)
select id from profile
on conflict (user_id) do nothing;

create or replace function erinnerung_fuer_neues_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into erinnerungs_einstellungen (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function erinnerung_fuer_neues_profil() from public, anon, authenticated;

create trigger erinnerung_nach_profil
after insert on profile
for each row execute function erinnerung_fuer_neues_profil();

-- Internes Versandbuch. Es hat absichtlich keine RLS-Policy: nur die Edge
-- Function mit service_role darf reservieren und als gesendet markieren. Der
-- Primaerschluessel ist der harte Schutz gegen zwei gleiche Nachrichten.
create table erinnerungs_versand (
  user_id uuid not null references auth.users on delete cascade,
  art text not null check (art = 'gewicht'),
  tag date not null,
  reserviert timestamptz not null default now(),
  gesendet timestamptz,
  primary key (user_id, art, tag)
);

alter table erinnerungs_versand enable row level security;
revoke all on table erinnerungs_versand from anon, authenticated;

-- Die beiden Werte werden beim Einrichten als Supabase-Vault-Secrets angelegt:
-- `vierfelder_project_url` und `vierfelder_legacy_anon_key`. Der Schluessel ist
-- nur der oeffentliche anon-JWT fuer das Function-Gateway; die Function nimmt
-- keine Eingaben an, benutzt ausschliesslich die Serverzeit und ist durch das
-- Versandbuch wiederholbar.
select cron.schedule(
  'gewicht-erinnerung',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'vierfelder_project_url'
      ) || '/functions/v1/gewicht-erinnerung',
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
