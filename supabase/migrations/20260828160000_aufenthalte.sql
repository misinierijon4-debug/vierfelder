-- Gemessene Aufenthalte an einem Trainingsort. Eine Zeile pro Besuch: die
-- Ankunft legt sie an, der Abgang schliesst sie. Beides schickt eine
-- Standort-Automation vom iPhone, niemand tippt hier etwas ein.
--
-- Der Wochentick fuer gym und boxen wird hieraus abgeleitet, genau wie beim
-- Gewicht aus der Messung. Nach `eintraege` kopiert wird nichts: das waeren
-- zwei Quellen fuer dieselbe Wahrheit.
--
-- Welcher Ort zu welchem Bereich gehoert, entscheidet das iPhone beim Senden.
-- Ein zweites Gym kostet damit eine weitere Automation und keine Migration.
create table aufenthalte (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  bereich text not null check (bereich in ('gym','boxen')),
  ort text not null check (length(btrim(ort)) between 1 and 40),
  ankunft timestamptz not null,
  abgang timestamptz check (abgang is null or abgang > ankunft),
  aktualisiert timestamptz not null default now()
);

alter table aufenthalte enable row level security;

-- Beide sehen beide, wie bei den Ticks: der Vergleich ist der Zweck.
-- Geschrieben wird ausschliesslich ueber `record_aufenthalt` (security definer).
-- Ohne insert/update/delete kann die App keine Messung erfinden — das ist der
-- einzige Grund, warum eine Messung mehr wert ist als ein Tick.
revoke all on table aufenthalte from anon;
revoke all on table aufenthalte from authenticated;
grant select on table aufenthalte to authenticated;

create policy "aufenthalte lesen" on aufenthalte
  for select to authenticated using (
    (select auth.uid()) in (select id from public.profile)
  );

-- ein offener Aufenthalt je Person und Ort. Eine doppelt ausgeloeste Ankunft
-- laeuft dadurch ins Leere, statt einen zweiten Besuch zu erfinden.
create unique index aufenthalte_offen_idx
  on aufenthalte (user_id, ort) where abgang is null;

create index aufenthalte_nutzer_ankunft_idx
  on aufenthalte (user_id, ankunft desc);

create extension if not exists pgcrypto with schema extensions;

-- iOS schickt alles als JSON, aber die Typen sind unzuverlaessig: eine
-- nachtraeglich eingesetzte Variable aendert den Feldtyp im Kurzbefehl nicht.
-- Deshalb ist jeder Parameter jsonb und wird hier selbst geparst — dieselbe
-- Vorsichtsmassnahme wie bei `record_sleep_night`.
create or replace function _afh_text(raw jsonb)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when raw is null or jsonb_typeof(raw) in ('null', 'object', 'array') then null
    else raw #>> '{}'
  end
$$;

create or replace function _afh_ts(raw jsonb)
returns timestamptz
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  s text;
begin
  s := btrim(coalesce(_afh_text(raw), ''));
  if s = '' then return null; end if;
  if upper(s) ~ 'Z$' or s ~ '[+-][0-9]{2}:?[0-9]{2}$' then
    return s::timestamptz;
  end if;
  return regexp_replace(s, '\s+', 'T')::timestamp at time zone 'Europe/Berlin';
exception
  when others then return null;
end;
$$;

-- Der eine Einstiegspunkt fuer die Standort-Automationen:
--   POST /rest/v1/rpc/record_aufenthalt
--
-- Identitaet kommt ausschliesslich aus dem persoenlichen Import-Token, dem
-- gleichen, das der Schlaf-Kurzbefehl benutzt (Tabelle schlaf_import_tokens,
-- dort liegt nur der SHA-256-Hash). Ohne gueltiges Token wird nichts
-- geschrieben.
create or replace function record_aufenthalt(
  p_token jsonb default null,
  p_bereich jsonb default null,
  p_ort jsonb default null,
  p_ereignis jsonb default null,
  p_zeit jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_bereich text;
  v_ort text;
  v_ereignis text;
  v_roh text;
  v_zeit timestamptz;
  v_id bigint;
  v_ankunft timestamptz;
begin
  v_bereich := lower(btrim(coalesce(_afh_text(p_bereich), '')));
  if v_bereich not in ('gym', 'boxen') then
    raise exception 'p_bereich muss gym oder boxen sein, war: %', v_bereich;
  end if;

  v_ort := btrim(coalesce(_afh_text(p_ort), ''));
  if v_ort = '' or length(v_ort) > 40 then
    raise exception 'p_ort fehlt oder ist zu lang';
  end if;

  v_roh := lower(btrim(coalesce(_afh_text(p_ereignis), '')));
  v_ereignis := case
    when v_roh in ('ankunft', 'ankommen', 'arrival', 'arrive') then 'ankunft'
    when v_roh in ('abgang', 'verlassen', 'weggehen', 'departure', 'leave') then 'abgang'
    else null
  end;
  if v_ereignis is null then
    raise exception 'p_ereignis muss ankunft oder abgang sein, war: %', v_roh;
  end if;

  -- Ohne Zeitangabe gilt der Moment des Aufrufs. Eine Zeit aus der Zukunft
  -- waere eine falsch gestellte Uhr und wird nicht uebernommen.
  v_zeit := coalesce(_afh_ts(p_zeit), now());
  if v_zeit > now() + interval '5 minutes' then
    v_zeit := now();
  end if;

  select t.user_id into v_user_id
  from schlaf_import_tokens t
  where t.aktiv
    and t.token_hash = encode(digest(coalesce(_afh_text(p_token), ''), 'sha256'), 'hex');

  if v_user_id is null then
    raise exception 'kein gueltiges import-token';
  end if;

  if v_ereignis = 'ankunft' then
    -- Eine Ankunft, zu der nie ein Abgang kam, ist nach zwoelf Stunden nichts
    -- mehr wert. Sie zu loeschen ist ehrlicher, als sie spaeter mit einem
    -- fremden Abgang zu einem erfundenen Besuch zu verbinden.
    delete from aufenthalte a
    where a.user_id = v_user_id
      and a.ort = v_ort
      and a.abgang is null
      and a.ankunft < v_zeit - interval '12 hours';

    insert into aufenthalte (user_id, bereich, ort, ankunft)
    values (v_user_id, v_bereich, v_ort, v_zeit)
    on conflict (user_id, ort) where abgang is null do nothing
    returning id into v_id;

    return jsonb_build_object(
      'ok', true,
      'ereignis', 'ankunft',
      'bereich', v_bereich,
      'ort', v_ort,
      'neu', v_id is not null,
      'grund', case when v_id is null then 'ankunft lag schon offen' else null end
    );
  end if;

  update aufenthalte a
     set abgang = v_zeit,
         bereich = v_bereich,
         aktualisiert = now()
   where a.id = (
     select b.id from aufenthalte b
      where b.user_id = v_user_id and b.ort = v_ort and b.abgang is null
      order by b.ankunft desc
      limit 1
   )
     and v_zeit > a.ankunft
  returning a.id, a.ankunft into v_id, v_ankunft;

  if v_id is null then
    -- Kein Abgang ohne Ankunft: sonst waere eine Vorbeifahrt ein Training.
    return jsonb_build_object(
      'ok', false,
      'ereignis', 'abgang',
      'ort', v_ort,
      'grund', 'kein offener aufenthalt an diesem ort, oder abgang vor ankunft'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'ereignis', 'abgang',
    'bereich', v_bereich,
    'ort', v_ort,
    'tag', (v_ankunft at time zone 'Europe/Berlin')::date,
    'dauer_minuten', round(extract(epoch from (v_zeit - v_ankunft)) / 60)
  );
end;
$$;

revoke all on function record_aufenthalt(jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function record_aufenthalt(jsonb, jsonb, jsonb, jsonb, jsonb)
  to anon, authenticated;

-- absichtlich nicht in supabase_realtime: der abgang wird gesendet, waehrend
-- man die halle verlaesst. niemand sitzt daneben und wartet darauf.
