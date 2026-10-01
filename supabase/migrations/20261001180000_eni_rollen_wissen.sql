-- Rollenwissen: ENI recherchiert eine Rolle (etwa eine Person wie Aajonus
-- Vonderplanitz oder Muhammad Ali), bevor er sie spielt, und legt eine Akte an.
-- Eine Zeile je Person und Rolle. Neue, leere Tabelle, keine Datenaenderung.
--
-- Wer schreibt was:
-- - die App startet und bricht ab nur ueber die beiden Funktionen unten
--   (`eni_recherche_starten`, `eni_recherche_abbrechen`); sie darf die fertige
--   Akte bearbeiten (Spalte `akte`) und die Zeile loeschen;
-- - die Edge Function `eni-recherche` (service_role) arbeitet die Schritte ab
--   und schreibt Stand, Akte und Status;
-- - `eni` liest die Akte mit dem Token der Person.
create table public.eni_rollen_wissen (
  user_id uuid not null references auth.users(id) on delete cascade,
  rolle_id text not null check (char_length(rolle_id) between 1 and 64),
  -- wer recherchiert wird, und worauf die person achtet (thema + anweisung)
  name text not null check (char_length(name) between 1 and 40),
  auftrag text not null default '' check (char_length(auftrag) <= 1400),
  status text not null default 'laeuft'
    check (status in ('laeuft', 'fertig', 'fehler', 'abgebrochen')),
  -- jeder start bekommt eine neue; der worker speichert nur mit seiner eigenen
  lauf uuid not null default gen_random_uuid(),
  -- arbeitsstand der laufenden recherche
  schritte jsonb not null default '[]'::jsonb
    check (jsonb_typeof(schritte) = 'array' and octet_length(schritte::text) <= 60000),
  notizen jsonb not null default '[]'::jsonb
    check (jsonb_typeof(notizen) = 'array' and octet_length(notizen::text) <= 600000),
  abschnitte jsonb not null default '[]'::jsonb
    check (jsonb_typeof(abschnitte) = 'array' and octet_length(abschnitte::text) <= 300000),
  -- die fertige akte. bleibt beim neu recherchieren stehen, bis die neue fertig ist
  akte text not null default '' check (char_length(akte) <= 100000),
  akte_name text not null default '' check (char_length(akte_name) <= 40),
  quellen jsonb not null default '[]'::jsonb
    check (jsonb_typeof(quellen) = 'array' and octet_length(quellen::text) <= 80000),
  fehler text check (char_length(fehler) <= 500),
  gesperrt_bis timestamptz,
  begonnen timestamptz not null default now(),
  fertig_am timestamptz,
  geaendert timestamptz not null default now(),
  primary key (user_id, rolle_id)
);

create index eni_rollen_wissen_laeuft on public.eni_rollen_wissen (geaendert)
  where status = 'laeuft';

alter table public.eni_rollen_wissen enable row level security;
revoke all on public.eni_rollen_wissen from public, anon, authenticated;
grant select, delete on public.eni_rollen_wissen to authenticated;
-- bearbeiten darf die person nur die fertige akte, nie den arbeitsstand
grant update (akte) on public.eni_rollen_wissen to authenticated;
grant select, insert, update, delete on public.eni_rollen_wissen to service_role;

create policy "eni rollenwissen lesen" on public.eni_rollen_wissen
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "eni rollenwissen aendern" on public.eni_rollen_wissen
  for update to authenticated
  using ((select auth.uid()) = user_id and status <> 'laeuft')
  with check ((select auth.uid()) = user_id);
create policy "eni rollenwissen loeschen" on public.eni_rollen_wissen
  for delete to authenticated using ((select auth.uid()) = user_id);

create function public.eni_rollen_wissen_beruehren() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  new.geaendert = now();
  return new;
end;
$$;
create trigger eni_rollen_wissen_geaendert before insert or update on public.eni_rollen_wissen
  for each row execute function public.eni_rollen_wissen_beruehren();

-- Starten oder neu starten. Der Arbeitsstand beginnt leer, eine fertige Akte
-- bleibt stehen, bis die neue fertig ist. Hoechstens drei gleichzeitig je
-- Person: jede Recherche kostet freie Suchen.
create function public.eni_recherche_starten(p_rolle_id text, p_name text, p_auftrag text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_name text := left(btrim(coalesce(p_name, '')), 40);
  v_rolle text := btrim(coalesce(p_rolle_id, ''));
begin
  if v_user is null or not exists (
    select 1 from public.profile where id = v_user and person in ('erijon', 'koray')
  ) then
    raise exception 'nicht erlaubt' using errcode = '42501';
  end if;
  if v_name = '' or v_rolle = '' or char_length(v_rolle) > 64 then
    raise exception 'rolle und name fehlen' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('eni_recherche_starten'), hashtext(v_user::text));
  if (select count(*) from public.eni_rollen_wissen
      where user_id = v_user and status = 'laeuft' and rolle_id <> v_rolle) >= 3 then
    raise exception 'hoechstens drei recherchen gleichzeitig' using errcode = '54000';
  end if;
  if (select count(*) from public.eni_rollen_wissen where user_id = v_user and rolle_id <> v_rolle) >= 24 then
    raise exception 'zu viele rollenakten' using errcode = '54000';
  end if;
  insert into public.eni_rollen_wissen as w (user_id, rolle_id, name, auftrag, status, lauf)
  values (v_user, v_rolle, v_name, left(coalesce(p_auftrag, ''), 1400), 'laeuft', gen_random_uuid())
  on conflict (user_id, rolle_id) do update set
    name = excluded.name,
    auftrag = excluded.auftrag,
    status = 'laeuft',
    lauf = excluded.lauf,
    schritte = '[]'::jsonb,
    notizen = '[]'::jsonb,
    abschnitte = '[]'::jsonb,
    fehler = null,
    gesperrt_bis = null,
    begonnen = now();
end;
$$;
revoke all on function public.eni_recherche_starten(text, text, text) from public, anon;
grant execute on function public.eni_recherche_starten(text, text, text) to authenticated;

-- Abbrechen: mit alter Akte bleibt diese stehen, ohne verschwindet die Zeile.
create function public.eni_recherche_abbrechen(p_rolle_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'nicht erlaubt' using errcode = '42501'; end if;
  delete from public.eni_rollen_wissen
    where user_id = v_user and rolle_id = p_rolle_id and status = 'laeuft' and akte = '';
  update public.eni_rollen_wissen set
    status = 'fertig', schritte = '[]'::jsonb, notizen = '[]'::jsonb, abschnitte = '[]'::jsonb,
    fehler = null, gesperrt_bis = null
    where user_id = v_user and rolle_id = p_rolle_id and status = 'laeuft';
end;
$$;
revoke all on function public.eni_recherche_abbrechen(text) from public, anon;
grant execute on function public.eni_recherche_abbrechen(text) to authenticated;

-- Fuer den Worker: eine wartende Recherche nehmen und fuer drei Minuten
-- sperren (laenger, als ein Aufruf arbeiten darf). Mit p_user nur die der
-- Person, sonst die, die am laengsten nicht weitergekommen ist.
create function public.eni_recherche_nehmen(p_user uuid default null)
returns setof public.eni_rollen_wissen language sql security definer set search_path = '' as $$
  update public.eni_rollen_wissen w
     set gesperrt_bis = now() + interval '3 minutes'
   where (w.user_id, w.rolle_id) in (
     select user_id, rolle_id from public.eni_rollen_wissen
      where status = 'laeuft'
        and (gesperrt_bis is null or gesperrt_bis < now())
        and (p_user is null or user_id = p_user)
      order by geaendert
      limit 1
      for update skip locked
   )
  returning w.*;
$$;
revoke all on function public.eni_recherche_nehmen(uuid) from public, anon, authenticated;
grant execute on function public.eni_recherche_nehmen(uuid) to service_role;

-- Jede Minute weiterarbeiten, auch wenn die App zu ist. Gerufen wird nur, wenn
-- etwas wartet; Geheimnis und Pruefung wie bei `aktivitaets-erinnerung`. Die
-- Function antwortet sofort und arbeitet im Hintergrund weiter.
select cron.schedule('eni-recherche', '* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'vierfelder_project_url') || '/functions/v1/eni-recherche',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-erinnerungs-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'vierfelder_aktivitaets_scheduler')),
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.eni_rollen_wissen
     where status = 'laeuft' and (gesperrt_bis is null or gesperrt_bis < now())
  );
$cron$);
