-- Schlafphasen als Leseschicht statt als zweiter Schreibweg.
--
-- schlafnaechte.rohsegmente enthaelt die Health-Segmente einer Nacht bereits
-- vollstaendig. Die Phasen dort ein zweites Mal hineinzuschreiben haette
-- bedeutet, dieselbe Rechnung in der Edge Function UND in record_sleep_night zu
-- pflegen. Stattdessen faltet diese Ansicht die Phasen beim Lesen auf:
-- eine Implementierung, alle alten Naechte sofort mit Phasen versehen, und das
-- Frontend laedt nie die Rohsegmente selbst.
--
-- Fenster der Nacht ist die gespeicherte einschlafzeit. Damit uebernimmt die
-- Ansicht die Nachtauswahl des Schreibwegs und trifft keine eigene.

create or replace function _slfn_sleep_stage(raw jsonb)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  key text;
begin
  key := regexp_replace(lower(coalesce(_slfn_scalar_text(raw), '')), '[^a-z0-9]', '', 'g');
  -- reihenfolge zaehlt: 'asleepdeep' enthaelt auch 'asleep'
  if position('deep' in key) > 0 or key in ('tief', '4') then return 'tief'; end if;
  if position('rem' in key) > 0 or key = '5' then return 'rem'; end if;
  if position('core' in key) > 0 or key in ('kern', '3') then return 'kern'; end if;
  if position('awake' in key) > 0 or key in ('wach', '2') then return 'wach'; end if;
  if position('inbed' in key) > 0 or key in ('', 'imbett', '0') then return 'bett'; end if;
  if position('asleep' in key) > 0 or position('schlaf' in key) > 0 or key = '1' then
    return 'unspez';
  end if;
  return null;
end;
$$;

create or replace function _slfn_minuten(mr tstzmultirange)
returns numeric
language sql
immutable
set search_path = public, extensions
as $$
  select coalesce(
    round(sum(extract(epoch from (upper(r) - lower(r))))::numeric / 60, 2),
    0
  )
  from unnest(mr) as r
$$;

-- Eine Zeile pro Nacht. Ueberlappungen werden nach Tiefe aufgeloest:
-- wach schlaegt alles, danach tief vor rem vor kern vor unspezifisch. Damit
-- summieren sich die vier Phasenminuten auf die reine Schlafzeit.
create or replace function schlaf_auswertung(p_roh jsonb, p_einschlaf timestamptz)
returns table (
  aufwachzeit timestamptz,
  bett_start timestamptz,
  bett_ende timestamptz,
  bett_minuten numeric,
  tief_minuten numeric,
  rem_minuten numeric,
  kern_minuten numeric,
  unspez_minuten numeric,
  wach_minuten numeric,
  phasen jsonb
)
language sql
stable
set search_path = public, extensions
as $$
  with roh as (
    select _slfn_sleep_stage(s->'value') as stufe,
           _slfn_parse_ts(s->'start') as st,
           _slfn_parse_ts(s->'end') as en
    from jsonb_array_elements(
      case when jsonb_typeof(p_roh) = 'array' then p_roh else '[]'::jsonb end
    ) as q(s)
  ),
  fenster as (
    select stufe, st, en
    from roh
    where p_einschlaf is not null
      and stufe is not null and st is not null and en is not null and en > st
      and en > p_einschlaf
      and st < p_einschlaf + interval '24 hours'
  ),
  mr as (
    select
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'tief'), '{}'::tstzmultirange) as tief,
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'rem'), '{}'::tstzmultirange) as rem,
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'kern'), '{}'::tstzmultirange) as kern,
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'unspez'), '{}'::tstzmultirange) as unspez,
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'wach'), '{}'::tstzmultirange) as wach,
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'bett'), '{}'::tstzmultirange) as bett
    from fenster
  ),
  s0 as (
    select m.*, (m.tief + m.rem + m.kern + m.unspez) as schlaf
    from mr m
  ),
  s1 as (
    select
      s0.*,
      case when isempty(s0.schlaf) then null else upper(s0.schlaf) end as ende,
      case
        when isempty(s0.schlaf) then '{}'::tstzmultirange
        else tstzmultirange(tstzrange(p_einschlaf, upper(s0.schlaf)))
      end as f
    from s0
  ),
  s2 as (select s1.*, (wach * f) as wach_r, ((tief * f) - (wach * f)) as tief_r from s1),
  s3 as (select s2.*, ((rem * f) - wach_r - tief_r) as rem_r from s2),
  s4 as (select s3.*, ((kern * f) - wach_r - tief_r - rem_r) as kern_r from s3),
  s5 as (select s4.*, ((unspez * f) - wach_r - tief_r - rem_r - kern_r) as unspez_r from s4),
  teile as (
    select 'tief' as art, r from s5, unnest(s5.tief_r) as r
    union all select 'rem', r from s5, unnest(s5.rem_r) as r
    union all select 'kern', r from s5, unnest(s5.kern_r) as r
    union all select 'unspez', r from s5, unnest(s5.unspez_r) as r
    union all select 'wach', r from s5, unnest(s5.wach_r) as r
  ),
  phasen_json as (
    -- stuecke unter einer halben minute waeren im balken nicht darstellbar
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'art', art,
          'start', round(extract(epoch from (lower(r) - p_einschlaf)) / 60)::int,
          'dauer', round(extract(epoch from (upper(r) - lower(r))) / 60)::int
        )
        order by lower(r)
      ),
      '[]'::jsonb
    ) as j
    from teile
    where extract(epoch from (upper(r) - lower(r))) >= 30
  )
  select
    s5.ende,
    case when isempty(s5.bett) then null else lower(s5.bett) end,
    case when isempty(s5.bett) then null else upper(s5.bett) end,
    case when isempty(s5.bett) then null else _slfn_minuten(s5.bett) end,
    _slfn_minuten(s5.tief_r),
    _slfn_minuten(s5.rem_r),
    _slfn_minuten(s5.kern_r),
    _slfn_minuten(s5.unspez_r),
    _slfn_minuten(s5.wach_r),
    phasen_json.j
  from s5, phasen_json
$$;

create or replace view schlafnaechte_ansicht
with (security_invoker = on) as
select
  n.user_id,
  n.nacht,
  n.schlaf_minuten,
  n.einschlafzeit,
  n.schlafziel_minuten,
  a.aufwachzeit,
  a.bett_start,
  a.bett_ende,
  a.bett_minuten,
  a.tief_minuten,
  a.rem_minuten,
  a.kern_minuten,
  a.unspez_minuten,
  a.wach_minuten,
  a.phasen
from schlafnaechte n
cross join lateral schlaf_auswertung(n.rohsegmente, n.einschlafzeit) a;

grant select on schlafnaechte_ansicht to authenticated;
