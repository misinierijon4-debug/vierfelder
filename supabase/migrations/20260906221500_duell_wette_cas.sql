-- Gemeinsame Wetten sind konkurrierender Zwei-Personen-Zustand. Direkte
-- Tabellenwrites waeren Last-Write-Wins und koennten einen bereits gesehenen
-- Partnerwert mit einem alten Set/Delete/Undo ueberschreiben. Diese noch nicht
-- ausgerollte Forward-Migration ersetzt deshalb den alten DELETE-Vertrag durch
-- eine einzige atomare CAS-RPC.
begin;

set local lock_timeout = '10s';

create sequence if not exists private.duell_wetten_version_seq
  as bigint
  increment by 1
  minvalue 1
  start with 1
  no cycle;

revoke all on sequence private.duell_wetten_version_seq
  from public, anon, authenticated;

alter table public.duell_wetten
  add column if not exists version bigint;

-- Die alte Tabellenregel akzeptierte Randspaces, solange btrim(text) nicht leer
-- war. Solche Altzeilen werden weder still umgeschrieben noch mit einer
-- veraenderten Bedeutung versioniert: Der Rollout stoppt und verlangt eine
-- bewusste Datenentscheidung.
do $$
begin
  if exists (
    select 1
    from public.duell_wetten w
    where w.text is not null
      and (
        w.text <> pg_catalog.btrim(w.text)
        or pg_catalog.char_length(w.text) not between 1 and 160
      )
  ) then
    raise check_violation using
      message = 'duell_wetten enthaelt nicht-kanonischen Alttext; vor CAS bewusst bereinigen';
  end if;
end;
$$;

-- Bestehende Werte bekommen genau einmal serverseitig eine eindeutige Version.
-- Die Reihenfolge alter Zeilen ist fachlich irrelevant; ab dieser Migration ist
-- jede weitere Version global steigend und ausschliesslich servergeneriert.
update public.duell_wetten
set version = pg_catalog.nextval('private.duell_wetten_version_seq'::regclass)
where version is null;

alter table public.duell_wetten
  alter column version set default
    pg_catalog.nextval('private.duell_wetten_version_seq'::regclass),
  alter column version set not null,
  alter column text drop not null;

alter sequence private.duell_wetten_version_seq
  owned by public.duell_wetten.version;

alter table public.duell_wetten
  drop constraint if exists duell_wetten_text_check,
  drop constraint if exists duell_wetten_version_positiv;

alter table public.duell_wetten
  add constraint duell_wetten_text_check check (
    text is null
    or (
      text = pg_catalog.btrim(text)
      and pg_catalog.char_length(text) between 1 and 160
    )
  ) not valid,
  add constraint duell_wetten_version_positiv check (version > 0) not valid;

alter table public.duell_wetten
  validate constraint duell_wetten_text_check;
alter table public.duell_wetten
  validate constraint duell_wetten_version_positiv;

-- PostgREST/JSON darf bigint nicht zuerst in eine ungenaue JS-Number parsen.
-- Der erzeugte Text reist bei SELECT und Realtime deshalb verlustfrei mit.
alter table public.duell_wetten
  add column if not exists version_text text
    generated always as (version::text) stored;

comment on column public.duell_wetten.version is
  'Global monotone bigint-CAS-Version; ausschliesslich serverseitig vergeben';
comment on column public.duell_wetten.version_text is
  'Verlustfreie Textprojektion der bigint-Version fuer Browser und Realtime';
comment on column public.duell_wetten.text is
  'NULL ist ein auditierbarer Tombstone und verhindert ABA nach Entfernen/Undo';

-- SELECT bleibt fuer die zwei Mitglieder erhalten. Jede Mutation muss durch
-- die RPC und damit durch Mitgliedschaft, Validierung, Wochenlock und CAS.
revoke insert, update, delete on table public.duell_wetten
  from public, anon, authenticated;
grant select on table public.duell_wetten to authenticated;

drop policy if exists "duell wetten lesen" on public.duell_wetten;
create policy "duell wetten lesen" on public.duell_wetten
  for select to authenticated
  using ((select private.ist_duellprofil()));

drop policy if exists "duell wetten anlegen" on public.duell_wetten;
drop policy if exists "duell wetten aendern" on public.duell_wetten;
drop policy if exists "duell wetten loeschen" on public.duell_wetten;

create or replace function private.setze_duell_wette(
  p_woche date,
  p_text text,
  p_erwartete_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aufrufer uuid := auth.uid();
  v_aktuell public.duell_wetten%rowtype;
  v_neu public.duell_wetten%rowtype;
begin
  if v_aufrufer is null or not (select private.ist_duellprofil()) then
    raise insufficient_privilege
      using message = 'nur ein zweikampf-profil darf die wette aendern';
  end if;

  if p_woche is null or extract(isodow from p_woche) <> 1 then
    raise invalid_parameter_value using message = 'p_woche muss ein montag sein';
  end if;

  if p_erwartete_version is null or p_erwartete_version < 0 then
    raise invalid_parameter_value
      using message = 'p_erwartete_version muss eine nichtnegative bigint-version sein';
  end if;

  if p_text is not null and (
    p_text <> pg_catalog.btrim(p_text)
    or pg_catalog.char_length(p_text) not between 1 and 160
  ) then
    raise check_violation
      using message = 'p_text muss getrimmt sein und 1 bis 160 zeichen enthalten';
  end if;

  -- Exakt derselbe Transaktionslock wie im serverautoritativen Wochenabschluss:
  -- Wette zuerst => Abschluss archiviert sie; Abschluss zuerst => Wette scheitert.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zweikampf:wochenabrechnung:' || p_woche::text, 0)
  );

  if exists (
    select 1 from public.wochenabrechnung a where a.woche = p_woche
  ) then
    raise check_violation
      using message = 'eine archivierte woche darf nicht mehr geaendert werden';
  end if;

  select w.* into v_aktuell
  from public.duell_wetten w
  where w.woche = p_woche
  for update;

  if (found and v_aktuell.version <> p_erwartete_version)
    or (not found and p_erwartete_version <> 0)
  then
    raise exception using
      errcode = '40001',
      message = 'duell_wette wurde parallel geaendert';
  end if;

  insert into public.duell_wetten as w (
    woche,
    text,
    updated_by,
    updated_at,
    version
  ) values (
    p_woche,
    p_text,
    v_aufrufer,
    pg_catalog.clock_timestamp(),
    pg_catalog.nextval('private.duell_wetten_version_seq'::regclass)
  )
  on conflict (woche) do update set
    text = excluded.text,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at,
    version = excluded.version
  returning w.* into v_neu;

  return pg_catalog.jsonb_build_object(
    'woche', v_neu.woche::text,
    'text', v_neu.text,
    'updated_by', v_neu.updated_by::text,
    'updated_at', v_neu.updated_at,
    'version', v_neu.version::text
  );
end;
$$;

revoke all on function private.setze_duell_wette(date, text, bigint)
  from public, anon, authenticated;
grant execute on function private.setze_duell_wette(date, text, bigint)
  to authenticated;

-- Nur der schmale SECURITY-INVOKER-Wrapper ist ueber die Data API sichtbar.
create or replace function public.setze_duell_wette(
  p_woche date,
  p_text text,
  p_erwartete_version bigint
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.setze_duell_wette(p_woche, p_text, p_erwartete_version)
$$;

revoke all on function public.setze_duell_wette(date, text, bigint)
  from public, anon, authenticated;
grant execute on function public.setze_duell_wette(date, text, bigint)
  to authenticated;

comment on function public.setze_duell_wette(date, text, bigint) is
  'Atomare gemeinsame Wette mit Mitgliedschaft, Wochenarchivschutz und Expected-Version-CAS';

commit;
