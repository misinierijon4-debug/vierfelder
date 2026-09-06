-- Ein einfacher INSERT schuetzte bisher zwar gegen zwei parallele Pushs, liess
-- eine Zeile nach einem Function-Abbruch aber fuer immer als ungesendet liegen.
-- Eine Lease allein waere ebenfalls nicht ausreichend: Nach einem unklaren
-- Netzwerkfehler koennte der Push-Dienst die Nachricht bereits angenommen
-- haben. Ein automatischer neuer Versuch koennte dann doppelt benachrichtigen.
--
-- Deshalb trennt das Versandbuch zwei Phasen:
--   bereit  -> der externe Versand hat sicher noch nicht begonnen; Lease darf
--              nach Ablauf von einem neuen Worker uebernommen werden
--   sendet  -> der externe Versand kann begonnen haben; nach Lease-Ablauf nur
--              noch "unbestaetigt", niemals automatisch wiederholen
--
-- Die Funktionen liegen im exponierten public-Schema, weil PostgREST nur dort
-- die RPCs der Edge Function anbietet. Sie laufen bewusst als SECURITY INVOKER:
-- ausschliesslich service_role erhaelt EXECUTE und bringt BYPASSRLS selbst mit.
-- So gibt es keinen zusaetzlichen SECURITY-DEFINER-Pfad.

alter table public.erinnerungs_versand
  add column zustand text,
  add column lease_token uuid,
  add column lease_bis timestamptz,
  add column versuche smallint not null default 1,
  add column naechster_versuch timestamptz,
  add column aktualisiert timestamptz not null default now(),
  add column fehlerart text;

-- Bereits bestaetigte Nachrichten bleiben bestaetigt. Eine alte Zeile ohne
-- `gesendet` ist dagegen fachlich mehrdeutig: Der Worker kann vor oder nach der
-- Providerannahme ausgefallen sein. Sie wird daher nicht erneut versandt.
update public.erinnerungs_versand
set
  zustand = case when gesendet is not null then 'gesendet' else 'unbestaetigt' end,
  fehlerart = case when gesendet is null then 'legacy_unbestaetigt' else null end,
  aktualisiert = case when gesendet is not null then gesendet else reserviert end;

alter table public.erinnerungs_versand
  alter column zustand set not null,
  add constraint erinnerungs_versand_zustand_check
    check (zustand in (
      'bereit',
      'sendet',
      'wiederholen',
      'gesendet',
      'fehlgeschlagen',
      'unbestaetigt'
    )),
  add constraint erinnerungs_versand_versuche_check
    check (versuche between 1 and 4),
  add constraint erinnerungs_versand_fehlerart_check
    check (fehlerart is null or fehlerart in (
      'voruebergehend',
      'dauerhaft',
      'netzwerk_unbestaetigt',
      'prozess_unbestaetigt',
      'legacy_unbestaetigt',
      'versuchslimit'
    )),
  add constraint erinnerungs_versand_lease_check
    check (
      (zustand in ('bereit', 'sendet') and lease_token is not null and lease_bis is not null)
      or
      (zustand not in ('bereit', 'sendet') and lease_token is null and lease_bis is null)
    ),
  add constraint erinnerungs_versand_gesendet_check
    check ((zustand = 'gesendet') = (gesendet is not null)),
  add constraint erinnerungs_versand_wiederholung_check
    check ((zustand = 'wiederholen') = (naechster_versuch is not null)),
  add constraint erinnerungs_versand_fehlerstatus_check
    check (
      (zustand in ('bereit', 'sendet', 'gesendet') and fehlerart is null)
      or
      (zustand in ('wiederholen', 'fehlgeschlagen', 'unbestaetigt') and fehlerart is not null)
    );

grant select, insert, update on table public.erinnerungs_versand to service_role;

create or replace function public.reserviere_erinnerungsversand(
  p_user_id uuid,
  p_art text,
  p_tag date,
  p_lease_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_jetzt timestamptz := pg_catalog.clock_timestamp();
  v_geaendert integer := 0;
begin
  if p_user_id is null or p_art is null or p_tag is null or p_lease_token is null then
    raise exception using
      errcode = '22023',
      message = 'ungueltige erinnerungsreservierung';
  end if;

  -- Nach Beginn eines externen Requests ist ein abgelaufener Vorgang
  -- mehrdeutig. Er wird sichtbar archiviert, aber nie wieder beansprucht.
  update public.erinnerungs_versand as v
  set
    zustand = 'unbestaetigt',
    lease_token = null,
    lease_bis = null,
    naechster_versuch = null,
    aktualisiert = v_jetzt,
    fehlerart = 'prozess_unbestaetigt'
  where v.zustand = 'sendet'
    and v.lease_bis <= v_jetzt;

  -- Auch eine vor dem Netzaufruf viermal abgebrochene Verarbeitung endet
  -- kontrolliert statt bei jedem Cron-Lauf erneut beansprucht zu werden.
  update public.erinnerungs_versand as v
  set
    zustand = 'fehlgeschlagen',
    lease_token = null,
    lease_bis = null,
    naechster_versuch = null,
    aktualisiert = v_jetzt,
    fehlerart = 'versuchslimit'
  where v.zustand = 'bereit'
    and v.lease_bis <= v_jetzt
    and v.versuche >= 4;

  insert into public.erinnerungs_versand as v (
    user_id,
    art,
    tag,
    reserviert,
    gesendet,
    zustand,
    lease_token,
    lease_bis,
    versuche,
    naechster_versuch,
    aktualisiert,
    fehlerart
  )
  values (
    p_user_id,
    p_art,
    p_tag,
    v_jetzt,
    null,
    'bereit',
    p_lease_token,
    v_jetzt + interval '2 minutes',
    1,
    null,
    v_jetzt,
    null
  )
  on conflict (user_id, art, tag) do update
  set
    zustand = 'bereit',
    lease_token = p_lease_token,
    lease_bis = case
      when v.zustand = 'bereit'
        and v.lease_token = p_lease_token
        and v.lease_bis > v_jetzt
      then v.lease_bis
      else v_jetzt + interval '2 minutes'
    end,
    versuche = case
      when v.zustand = 'bereit'
        and v.lease_token = p_lease_token
        and v.lease_bis > v_jetzt
      then v.versuche
      else v.versuche + 1
    end,
    naechster_versuch = null,
    aktualisiert = v_jetzt,
    fehlerart = null
  where (
      v.zustand = 'bereit'
      and v.lease_token = p_lease_token
      and v.lease_bis > v_jetzt
    )
    or (
      v.versuche < 4
      and (
        (v.zustand = 'bereit' and v.lease_bis <= v_jetzt)
        or
        (v.zustand = 'wiederholen' and v.naechster_versuch <= v_jetzt)
      )
    );

  get diagnostics v_geaendert = row_count;
  return v_geaendert = 1;
end;
$$;

create or replace function public.starte_erinnerungsversand(
  p_user_id uuid,
  p_art text,
  p_tag date,
  p_lease_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_geaendert integer := 0;
begin
  update public.erinnerungs_versand as v
  set
    zustand = 'sendet',
    aktualisiert = pg_catalog.clock_timestamp()
  where v.user_id = p_user_id
    and v.art = p_art
    and v.tag = p_tag
    and v.zustand = 'bereit'
    and v.lease_token = p_lease_token
    and v.lease_bis > pg_catalog.clock_timestamp();

  get diagnostics v_geaendert = row_count;
  return v_geaendert = 1;
end;
$$;

create or replace function public.bestaetige_erinnerungsversand(
  p_user_id uuid,
  p_art text,
  p_tag date,
  p_lease_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_geaendert integer := 0;
  v_jetzt timestamptz := pg_catalog.clock_timestamp();
begin
  update public.erinnerungs_versand as v
  set
    zustand = 'gesendet',
    gesendet = v_jetzt,
    lease_token = null,
    lease_bis = null,
    naechster_versuch = null,
    aktualisiert = v_jetzt,
    fehlerart = null
  where v.user_id = p_user_id
    and v.art = p_art
    and v.tag = p_tag
    and v.zustand = 'sendet'
    and v.lease_token = p_lease_token;

  get diagnostics v_geaendert = row_count;
  return v_geaendert = 1;
end;
$$;

create or replace function public.melde_erinnerungsversand_fehler(
  p_user_id uuid,
  p_art text,
  p_tag date,
  p_lease_token uuid,
  p_ausgang text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_geaendert integer := 0;
  v_jetzt timestamptz := pg_catalog.clock_timestamp();
begin
  if p_ausgang is null
    or p_ausgang not in ('wiederholen', 'fehlgeschlagen', 'unbestaetigt')
  then
    raise exception using
      errcode = '22023',
      message = 'ungueltiger erinnerungsfehler';
  end if;

  update public.erinnerungs_versand as v
  set
    zustand = case
      when p_ausgang = 'wiederholen' and v.versuche < 4 then 'wiederholen'
      when p_ausgang = 'unbestaetigt' then 'unbestaetigt'
      else 'fehlgeschlagen'
    end,
    lease_token = null,
    lease_bis = null,
    naechster_versuch = case
      when p_ausgang = 'wiederholen' and v.versuche < 4
      then v_jetzt + interval '5 minutes'
      else null
    end,
    aktualisiert = v_jetzt,
    fehlerart = case
      when p_ausgang = 'wiederholen' and v.versuche < 4 then 'voruebergehend'
      when p_ausgang = 'wiederholen' then 'versuchslimit'
      when p_ausgang = 'unbestaetigt' then 'netzwerk_unbestaetigt'
      else 'dauerhaft'
    end
  where v.user_id = p_user_id
    and v.art = p_art
    and v.tag = p_tag
    and v.zustand = 'sendet'
    and v.lease_token = p_lease_token;

  get diagnostics v_geaendert = row_count;
  return v_geaendert = 1;
end;
$$;

revoke all on function public.reserviere_erinnerungsversand(uuid, text, date, uuid)
  from public, anon, authenticated;
revoke all on function public.starte_erinnerungsversand(uuid, text, date, uuid)
  from public, anon, authenticated;
revoke all on function public.bestaetige_erinnerungsversand(uuid, text, date, uuid)
  from public, anon, authenticated;
revoke all on function public.melde_erinnerungsversand_fehler(uuid, text, date, uuid, text)
  from public, anon, authenticated;

grant execute on function public.reserviere_erinnerungsversand(uuid, text, date, uuid)
  to service_role;
grant execute on function public.starte_erinnerungsversand(uuid, text, date, uuid)
  to service_role;
grant execute on function public.bestaetige_erinnerungsversand(uuid, text, date, uuid)
  to service_role;
grant execute on function public.melde_erinnerungsversand_fehler(uuid, text, date, uuid, text)
  to service_role;
