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
--
-- Drei Regeln stammen aus echten Health-Daten und nicht aus der Theorie:
--
--  1. Das Fenster endet 16 Stunden nach dem Einschlafen. Der Kurzbefehl schickt
--     die Segmente der letzten 24 Stunden, darin steckt schon der Anfang der
--     naechsten Nacht (gemessen: InBed 26. 23:37 bis 27. 07:15, waehrend die
--     ausgewertete Nacht am 26. um 08:25 endete).
--  2. Die Bettzeit ist die Vereinigung aus InBed und Schlafspanne. Apples
--     InBed kommt vom iPhone, die Stadien von der Uhr; endet das iPhone-Fenster
--     frueher, waere die Effizienz sonst groesser als 100 Prozent. Beruehrt gar
--     kein InBed diese Episode, bleibt bett_minuten null und das Frontend
--     rechnet ehrlich gegen die Schlafspanne.
--  3. Wachstuecke mit hoechstens zwei Minuten Abstand sind eine Unterbrechung
--     (Health zerlegt sie in 30-Sekunden-Stuecke: gemessen 26 Stueck fuer 18
--     Minuten). Das gilt nur fuer die Anzahl, nicht fuer die Dauer — gleiche
--     Regel wie in supabase/functions/_shared/schlaf.ts.

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
-- summieren sich die vier Phasenminuten genau auf die reine Schlafzeit.
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
      -- eine schlafepisode ist nie laenger als 16 stunden; alles danach
      -- gehoert schon zur naechsten nacht
      and en > p_einschlaf
      and st < p_einschlaf + interval '16 hours'
  ),
  mr as (
    select
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'tief'), '{}'::tstzmultirange) as tief,
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'rem'), '{}'::tstzmultirange) as rem,
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'kern'), '{}'::tstzmultirange) as kern,
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'unspez'), '{}'::tstzmultirange) as unspez,
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'bett'), '{}'::tstzmultirange) as bett,
      coalesce(range_agg(tstzrange(st, en)) filter (where stufe = 'wach'), '{}'::tstzmultirange) as wach,
      -- je eine minute breiter aggregieren und danach wieder schmaler machen:
      -- so verschmelzen stuecke mit hoechstens zwei minuten abstand
      coalesce(
        range_agg(tstzrange(st - interval '1 minute', en + interval '1 minute'))
          filter (where stufe = 'wach'),
        '{}'::tstzmultirange
      ) as wach_weit
    from fenster
  ),
  m2 as (
    select mr.*,
      coalesce(
        (select range_agg(tstzrange(lower(r) + interval '1 minute', upper(r) - interval '1 minute'))
         from unnest(mr.wach_weit) as r),
        '{}'::tstzmultirange
      ) as wach_gefasst
    from mr
  ),
  s0 as (
    select m2.*, (m2.tief + m2.rem + m2.kern + m2.unspez) as schlaf
    from m2
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
  s2 as (
    select s1.*,
      -- die ungefasste wachzeit zieht ab und liefert die dauer,
      -- die verschmolzene liefert die bloecke im verlauf
      (wach * f) as wach_r,
      (wach_gefasst * f) as wach_anzeige,
      ((tief * f) - (wach * f)) as tief_r
    from s1
  ),
  s3 as (select s2.*, ((rem * f) - wach_r - tief_r) as rem_r from s2),
  s4 as (select s3.*, ((kern * f) - wach_r - tief_r - rem_r) as kern_r from s3),
  s5 as (select s4.*, ((unspez * f) - wach_r - tief_r - rem_r - kern_r) as unspez_r from s4),
  s6 as (
    select s5.*,
      -- nur InBed, das diese episode beruehrt; danach mit der schlafspanne
      -- vereinigt, damit die bettzeit nie kuerzer als der schlaf ist
      case
        when isempty(
          s5.bett * tstzmultirange(tstzrange(p_einschlaf - interval '3 hours', s5.ende + interval '3 hours'))
        ) then '{}'::tstzmultirange
        else (
          s5.bett * tstzmultirange(tstzrange(p_einschlaf - interval '3 hours', s5.ende + interval '3 hours'))
        ) + s5.f
      end as bett_voll
    from s5
  ),
  teile as (
    select 'tief' as art, r from s6, unnest(s6.tief_r) as r
    union all select 'rem', r from s6, unnest(s6.rem_r) as r
    union all select 'kern', r from s6, unnest(s6.kern_r) as r
    union all select 'unspez', r from s6, unnest(s6.unspez_r) as r
    union all select 'wach', r from s6, unnest(s6.wach_anzeige) as r
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
    s6.ende,
    case when isempty(s6.bett_voll) then null else lower(s6.bett_voll) end,
    case when isempty(s6.bett_voll) then null else upper(s6.bett_voll) end,
    case when isempty(s6.bett_voll) then null else _slfn_minuten(s6.bett_voll) end,
    _slfn_minuten(s6.tief_r),
    _slfn_minuten(s6.rem_r),
    _slfn_minuten(s6.kern_r),
    _slfn_minuten(s6.unspez_r),
    _slfn_minuten(s6.wach_r),
    phasen_json.j
  from s6, phasen_json
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
