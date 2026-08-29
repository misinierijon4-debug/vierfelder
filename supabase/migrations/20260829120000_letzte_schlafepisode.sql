-- Eine Zeile ist eine Nacht — nicht alles, was im 24-Stunden-Fenster lag.
--
-- Der Kurzbefehl schickt die Health-Segmente der letzten 24 Stunden. Laeuft er
-- spaeter als sonst, stecken darin zwei Naechte. record_sleep_night hat bisher
-- ueber alle asleep-Segmente summiert:
--
--   select sum(en - st) from sl_seg where cls = 'asleep'
--
-- Damit zaehlte die Zeile beide Naechte zusammen und ueberlappende Segmente
-- (Uhr und iPhone melden denselben Zeitraum) doppelt. Gemessen am 29.08.:
--
--   zeile 2026-08-29  schlaf_minuten 779  (12h59m)  einschlafzeit 28.08. 00:15
--     tatsaechlich    nacht 1: 28.08. 00:15 - 08:36  ->  461 minuten
--                     nacht 2: 28.08. 23:29 - 29.08. 05:16  ->  318 minuten
--   zeile 2026-08-28  schlaf_minuten 851  (14h11m)  einschlafzeit 27.08. 00:32
--
-- Sichtbar war das als "echte schlafzeit 12h 59m" ueber "zeit im bett 8h 45m",
-- als Wochenbalken von 13 und 14 Stunden bei 9 Stunden Ziel, und als Effizienz
-- und Qualitaet von 100 Prozent. Ausserdem trugen zwei Zeilen dieselbe
-- Einschlafzeit; im Wochenraster fielen sie auf denselben Abend und eine der
-- beiden Naechte war gar nicht mehr zu sehen.
--
-- Drei Aenderungen:
--
--  1. _slfn_nacht_kennzahlen waehlt die zuletzt endende Schlafepisode (getrennt
--     an einer Luecke von drei Stunden) und rechnet darin ueber Multiranges:
--     Ueberlappungen zaehlen einmal, Wachzeit wird abgezogen. Das ist dieselbe
--     Rechnung wie in supabase/functions/_shared/schlaf.ts, jetzt an einer
--     Stelle statt in zweien.
--
--     Nicht der Anker ist InBed, sondern der Schlaf selbst: das InBed-Segment
--     im Fenster gehoert oft schon zur kommenden Nacht, in der noch kein
--     Stadium liegt (gemessen: zeile 26.08. enthaelt InBed 26.08. 23:37 -
--     27.08. 07:15). Ein InBed-Anker haette diese Zeile auf null Minuten
--     gesetzt.
--
--  2. schlafnaechte_ansicht liefert die Schlafminuten aus derselben
--     Phasenrechnung, aus der auch die Kacheln kommen. Vorher stand in der
--     Ansicht die gespeicherte Spalte, waehrend die Phasen daneben neu
--     gerechnet wurden — die beiden konnten auseinanderlaufen, ohne dass es
--     jemandem auffiel (gemessen: 12h 59m gegen 7h 42m in denselben Kacheln).
--
--  3. Die vorhandenen Zeilen werden aus ihren Rohsegmenten neu gerechnet. Die
--     Rohsegmente bleiben unangetastet; der Schritt ist wiederholbar.

-- Stadien auch als deutsche Langform erkennen. "Tiefschlaf" und "Kernschlaf"
-- fielen vorher durch die exakten Vergleiche und landeten ueber 'schlaf' bei
-- 'unspez' — die Nacht behielt ihre Dauer, verlor aber die Stadien.
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
  if position('deep' in key) > 0 or position('tief' in key) > 0 or key = '4' then return 'tief'; end if;
  if position('rem' in key) > 0 or key = '5' then return 'rem'; end if;
  if position('core' in key) > 0 or position('kern' in key) > 0 or key = '3' then return 'kern'; end if;
  if position('awake' in key) > 0 or position('wach' in key) > 0 or key = '2' then return 'wach'; end if;
  if position('inbed' in key) > 0 or position('imbett' in key) > 0 or key in ('', '0') then return 'bett'; end if;
  if position('asleep' in key) > 0 or position('schlaf' in key) > 0 or key = '1' then
    return 'unspez';
  end if;
  return null;
end;
$$;

-- Die zuletzt endende Schlafepisode und ihre Kennzahlen. Leeres Ergebnis, wenn
-- in den Rohsegmenten kein Schlafstadium steckt.
create or replace function _slfn_nacht_kennzahlen(p_roh jsonb)
returns table (
  einschlafzeit timestamptz,
  aufwachzeit timestamptz,
  schlaf_minuten numeric,
  wach_minuten numeric,
  wachphasen int,
  wach_vorhanden boolean
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
  seg as (
    select stufe, st, en from roh
    where stufe is not null and st is not null and en is not null and en > st
  ),
  -- eine luecke von drei stunden trennt zwei schlafepisoden; ein mittagsschlaf
  -- am selben tag verschiebt damit weder dauer noch einschlafzeit
  luecke as (
    select st, en,
           max(en) over (order by st, en rows between unbounded preceding and 1 preceding) as vorher
    from seg where stufe in ('tief', 'rem', 'kern', 'unspez')
  ),
  gruppen as (
    select st, en,
           sum(case when vorher is null or st - vorher > interval '3 hours' then 1 else 0 end)
             over (order by st, en rows unbounded preceding) as gruppe
    from luecke
  ),
  episode as (
    select min(st) as von, max(en) as bis
    from gruppen group by gruppe order by max(en) desc limit 1
  ),
  teile as (
    select
      e.von,
      e.bis,
      coalesce(
        range_agg(tstzrange(s.st, s.en)) filter (where s.stufe in ('tief', 'rem', 'kern', 'unspez')),
        '{}'::tstzmultirange
      ) * tstzmultirange(tstzrange(e.von, e.bis)) as schlaf,
      coalesce(
        range_agg(tstzrange(s.st, s.en)) filter (where s.stufe = 'wach'),
        '{}'::tstzmultirange
      ) * tstzmultirange(tstzrange(e.von, e.bis)) as wach,
      -- je eine minute breiter aggregieren und danach wieder schmaler machen:
      -- so verschmelzen stuecke mit hoechstens zwei minuten abstand zu einer
      -- unterbrechung (health zerlegt sie in 30-sekunden-stuecke)
      coalesce(
        range_agg(tstzrange(s.st - interval '1 minute', s.en + interval '1 minute'))
          filter (where s.stufe = 'wach'),
        '{}'::tstzmultirange
      ) as wach_weit
    from episode e
    left join seg s on s.st < e.bis and s.en > e.von
    group by e.von, e.bis
  ),
  gefasst as (
    select t.*,
      coalesce(
        (select range_agg(tstzrange(lower(r) + interval '1 minute', upper(r) - interval '1 minute'))
         from unnest(t.wach_weit) as r),
        '{}'::tstzmultirange
      ) * tstzmultirange(tstzrange(t.von, t.bis)) as wach_gefasst
    from teile t
  )
  select
    von,
    bis,
    -- bei widersprüchlichen quellen zaehlt derselbe zeitraum nie zugleich als
    -- wach und schlafend. awake gewinnt, weil fehlende daten nicht positiv
    -- wirken duerfen
    _slfn_minuten(schlaf - wach),
    _slfn_minuten(wach),
    (select count(*)::int from unnest(wach_gefasst) as r),
    not isempty(wach)
  from gefasst
$$;

create or replace function record_sleep_night(
  p_night_date jsonb default null,
  p_raw_segments jsonb default null,
  p_source_name jsonb default null,
  p_target_hours jsonb default null,
  p_user_id jsonb default null,
  p_token jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_user uuid;
  v_segs jsonb;
  v_el jsonb;
  v_stufe text;
  v_st timestamptz;
  v_en timestamptz;
  v_src text;
  v_segment_keys text;
  v_quellen text[] := '{}';

  v_asleep_start timestamptz;
  v_asleep_end timestamptz;
  v_schlaf_minuten numeric;
  v_wachphasen int;
  v_wach_minuten numeric;
  v_wach_vorhanden boolean;

  v_th numeric;
  v_ziel_min smallint;
  v_nacht date;

  v_dauer numeric;
  v_konsistenz numeric;
  v_median_abw numeric;
  v_unterbrechung numeric;
  v_basis smallint := 80;
  v_hist smallint := 0;
  v_median_morgen numeric;
  v_lokal_min int;
begin
  ------------------------------------------------------------------
  -- Identitaet ueber das Import-Token. p_user_id wird ignoriert.
  ------------------------------------------------------------------
  v_token := btrim(coalesce(_slfn_scalar_text(p_token), ''));
  if length(v_token) < 32 then
    raise exception 'import-token fehlt oder ist zu kurz'
      using errcode = 'invalid_authorization_specification';
  end if;

  select t.user_id into v_user
  from schlaf_import_tokens t
  where t.token_hash = encode(digest(v_token, 'sha256'), 'hex')
    and t.aktiv
  limit 1;

  if v_user is null then
    raise exception 'import-token ist ungueltig'
      using errcode = 'invalid_authorization_specification';
  end if;

  if not exists (select 1 from profile where id = v_user) then
    raise exception 'profil zum token fehlt';
  end if;

  ------------------------------------------------------------------
  -- Rohsegmente: Array direkt oder Objekt {segments:[...]}.
  ------------------------------------------------------------------
  if p_raw_segments is null or jsonb_typeof(p_raw_segments) = 'null' then
    raise exception 'p_raw_segments fehlt'
      using errcode = 'invalid_parameter_value';
  elsif jsonb_typeof(p_raw_segments) = 'array' then
    v_segs := p_raw_segments;
  elsif jsonb_typeof(p_raw_segments->'segments') = 'array' then
    v_segs := p_raw_segments->'segments';
  else
    raise exception 'p_raw_segments muss ein array sein'
      using errcode = 'invalid_parameter_value';
  end if;

  ------------------------------------------------------------------
  -- Jedes Segment einmal pruefen, damit der Fehler die Stelle benennt.
  -- Gerechnet wird danach in _slfn_nacht_kennzahlen, gemeinsam mit dem
  -- Nachrechnen der Altbestaende.
  ------------------------------------------------------------------
  for v_el in select seg from jsonb_array_elements(v_segs) as q(seg) loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'segment ist kein objekt'
        using errcode = 'invalid_parameter_value';
    end if;

    v_st := _slfn_parse_ts(v_el->'start');
    v_en := _slfn_parse_ts(v_el->'end');
    if v_st is null or v_en is null then
      select string_agg(k, ', ' order by k)
      into v_segment_keys
      from jsonb_object_keys(v_el) as keys(k);

      raise exception 'segment braucht lesbares start und end (felder: %; start-typ: %; end-typ: %)',
        coalesce(v_segment_keys, 'keine'),
        coalesce(jsonb_typeof(v_el->'start'), 'fehlt'),
        coalesce(jsonb_typeof(v_el->'end'), 'fehlt')
        using errcode = 'invalid_parameter_value';
    end if;
    if v_en <= v_st then
      raise exception 'segmentende muss nach dem start liegen'
        using errcode = 'invalid_parameter_value';
    end if;
    if v_en - v_st > interval '24 hours' then
      raise exception 'ein segment ist laenger als 24 stunden'
        using errcode = 'invalid_parameter_value';
    end if;

    v_stufe := _slfn_sleep_stage(v_el->'value');
    if v_stufe is null then
      raise exception 'unbekannter schlafwert: %',
        coalesce(_slfn_scalar_text(v_el->'value'), '')
        using errcode = 'invalid_parameter_value';
    end if;

    v_src := btrim(coalesce(_slfn_scalar_text(v_el->'source'), ''));
    if v_src <> '' and not (v_src = any (v_quellen)) then
      v_quellen := v_quellen || v_src;
    end if;
  end loop;

  v_src := btrim(coalesce(_slfn_scalar_text(p_source_name), ''));
  if v_src <> '' and not (v_src = any (v_quellen)) then
    v_quellen := v_quellen || v_src;
  end if;

  ------------------------------------------------------------------
  -- Die zuletzt endende Schlafepisode, nicht das ganze Fenster.
  ------------------------------------------------------------------
  select k.einschlafzeit, k.aufwachzeit, k.schlaf_minuten, k.wach_minuten,
         k.wachphasen, k.wach_vorhanden
  into v_asleep_start, v_asleep_end, v_schlaf_minuten, v_wach_minuten,
       v_wachphasen, v_wach_vorhanden
  from _slfn_nacht_kennzahlen(v_segs) k;

  if v_asleep_start is null then
    raise exception 'keine auswertbaren schlafsegmente gefunden'
      using errcode = 'invalid_parameter_value';
  end if;

  if v_asleep_end - v_asleep_start > interval '36 hours' then
    raise exception 'segmente umfassen mehr als 36 stunden'
      using errcode = 'invalid_parameter_value';
  end if;

  if not v_wach_vorhanden then
    v_wachphasen := null;
    v_wach_minuten := null;
  end if;

  -- Ziel: egal ob number, string "9" oder "9,5". Default und Fallback 9.
  v_th := coalesce(_slfn_parse_number(p_target_hours), 9);
  if v_th <= 0 then
    v_th := 9;
  end if;
  v_ziel_min := greatest(240, least(720, round(v_th * 60)))::smallint;

  -- Nacht: Parameter gewinnt, sonst lokales Ende der Schlafepisode.
  v_nacht := _slfn_parse_date(p_night_date);
  if v_nacht is null then
    v_nacht := (v_asleep_end at time zone 'Europe/Berlin')::date;
  end if;

  v_dauer := round(50 * least(greatest(v_schlaf_minuten / v_ziel_min, 0), 1), 2);

  if v_wach_vorhanden then
    v_basis := 100;
    v_unterbrechung := round(
      12 * (1 - least(v_wach_minuten / 30, 1))
      + 8 * (1 - least(v_wachphasen::numeric / 8, 1)),
      2
    );
  end if;

  v_lokal_min := floor(extract(hour from v_asleep_start at time zone 'Europe/Berlin')) * 60
               + floor(extract(minute from v_asleep_start at time zone 'Europe/Berlin'));

  select percentile_cont(0.5) within group (order by m),
         count(*)::smallint
  into v_median_morgen, v_hist
  from (
    select (extract(hour from einschlafzeit at time zone 'Europe/Berlin') * 60
          + extract(minute from einschlafzeit at time zone 'Europe/Berlin'))::numeric as m
    from schlafnaechte
    where user_id = v_user and nacht < v_nacht
    order by nacht desc
    limit 13
  ) hist;

  if v_hist > 0 and v_lokal_min is not null then
    v_median_abw := abs(v_lokal_min - v_median_morgen);
    -- Um Mitternacht herum ist 23:45 naeher an 00:15 als der Rohabstand.
    if v_median_abw > 720 then
      v_median_abw := 1440 - v_median_abw;
    end if;
    v_konsistenz := round(30 * (1 - least(v_median_abw / 180, 1)), 2);
  end if;

  insert into schlafnaechte (
    user_id, nacht, schlaf_minuten, einschlafzeit, wachphasen, wach_minuten,
    nachtwert, bewertungsbasis, dauer_punkte, konsistenz_punkte,
    unterbrechung_punkte, median_abweichung_minuten, historie_naechte,
    schlafziel_minuten, wachsegmente_vorhanden, quellen, rohsegmente
  )
  values (
    v_user, v_nacht, round(v_schlaf_minuten, 2), v_asleep_start, v_wachphasen,
    round(v_wach_minuten, 2),
    greatest(0, least(100, round((
      v_dauer + coalesce(v_konsistenz, 0) + coalesce(v_unterbrechung, 0)
    ) / v_basis * 100)))::smallint,
    v_basis, round(v_dauer, 2), v_konsistenz, v_unterbrechung,
    round(v_median_abw, 2), v_hist, v_ziel_min,
    v_wach_vorhanden, v_quellen, v_segs
  )
  on conflict (user_id, nacht) do update
    set schlaf_minuten = excluded.schlaf_minuten,
        einschlafzeit = excluded.einschlafzeit,
        wachphasen = excluded.wachphasen,
        wach_minuten = excluded.wach_minuten,
        nachtwert = excluded.nachtwert,
        bewertungsbasis = excluded.bewertungsbasis,
        dauer_punkte = excluded.dauer_punkte,
        konsistenz_punkte = excluded.konsistenz_punkte,
        unterbrechung_punkte = excluded.unterbrechung_punkte,
        median_abweichung_minuten = excluded.median_abweichung_minuten,
        historie_naechte = excluded.historie_naechte,
        schlafziel_minuten = excluded.schlafziel_minuten,
        wachsegmente_vorhanden = excluded.wachsegmente_vorhanden,
        quellen = excluded.quellen,
        rohsegmente = excluded.rohsegmente,
        aktualisiert = now();

  return jsonb_build_object(
    'ok', true,
    'nacht', v_nacht,
    'schlaf_minuten', round(v_schlaf_minuten, 2),
    'einschlafzeit', to_char(v_asleep_start at time zone 'UTC',
                             'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'aufwachzeit', to_char(v_asleep_end at time zone 'UTC',
                           'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'wachphasen', v_wachphasen,
    'wach_minuten', round(v_wach_minuten, 2),
    'nachtwert', greatest(0, least(100, round((
      v_dauer + coalesce(v_konsistenz, 0) + coalesce(v_unterbrechung, 0)
    ) / v_basis * 100))),
    'bewertungsbasis', v_basis,
    'schlafziel_minuten', v_ziel_min
  );
end;
$$;

revoke all on function record_sleep_night(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function record_sleep_night(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  to anon, authenticated;

-- Die angezeigte Schlafzeit kommt aus derselben Rechnung wie die Kacheln
-- darunter. Ohne verwertbare Rohsegmente bleibt die gespeicherte Spalte.
create or replace view schlafnaechte_ansicht
with (security_invoker = on) as
select
  n.user_id,
  n.nacht,
  case
    when (a.tief_minuten + a.rem_minuten + a.kern_minuten + a.unspez_minuten) > 0
      then a.tief_minuten + a.rem_minuten + a.kern_minuten + a.unspez_minuten
    else n.schlaf_minuten
  end::numeric(7, 2) as schlaf_minuten,
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
cross join lateral (
  select coalesce(jsonb_agg(s), '[]'::jsonb) as roh
  from schlafnaechte nb, jsonb_array_elements(nb.rohsegmente) q(s)
  where nb.user_id = n.user_id
    and nb.nacht between n.nacht - 1 and n.nacht + 1
    and jsonb_typeof(nb.rohsegmente) = 'array'
) gebuendelt
cross join lateral schlaf_auswertung(gebuendelt.roh, n.einschlafzeit) a;

grant select on schlafnaechte_ansicht to authenticated;

-- Altbestand aus den Rohsegmenten nachrechnen. Nach Nacht geordnet, damit der
-- Konsistenzanteil dieselbe Historie sieht wie beim Import.
do $$
declare
  z record;
  k record;
  v_dauer numeric;
  v_konsistenz numeric;
  v_median_abw numeric;
  v_unterbrechung numeric;
  v_basis smallint;
  v_hist smallint;
  v_median numeric;
  v_lokal_min int;
begin
  for z in select user_id, nacht, rohsegmente, schlafziel_minuten
           from schlafnaechte order by user_id, nacht loop
    select * into k from _slfn_nacht_kennzahlen(z.rohsegmente);
    continue when k.einschlafzeit is null;

    v_basis := case when k.wach_vorhanden then 100 else 80 end;
    v_dauer := round(50 * least(greatest(k.schlaf_minuten / z.schlafziel_minuten, 0), 1), 2);
    v_unterbrechung := case
      when k.wach_vorhanden then round(
        12 * (1 - least(k.wach_minuten / 30, 1))
        + 8 * (1 - least(k.wachphasen::numeric / 8, 1)), 2)
      else null end;

    v_lokal_min := floor(extract(hour from k.einschlafzeit at time zone 'Europe/Berlin')) * 60
                 + floor(extract(minute from k.einschlafzeit at time zone 'Europe/Berlin'));

    select percentile_cont(0.5) within group (order by m), count(*)::smallint
    into v_median, v_hist
    from (
      select (extract(hour from einschlafzeit at time zone 'Europe/Berlin') * 60
            + extract(minute from einschlafzeit at time zone 'Europe/Berlin'))::numeric as m
      from schlafnaechte
      where user_id = z.user_id and nacht < z.nacht
      order by nacht desc limit 13
    ) hist;

    v_konsistenz := null;
    v_median_abw := null;
    if v_hist > 0 then
      v_median_abw := abs(v_lokal_min - v_median);
      if v_median_abw > 720 then v_median_abw := 1440 - v_median_abw; end if;
      v_konsistenz := round(30 * (1 - least(v_median_abw / 180, 1)), 2);
    end if;

    update schlafnaechte set
      schlaf_minuten = round(k.schlaf_minuten, 2),
      einschlafzeit = k.einschlafzeit,
      wachphasen = case when k.wach_vorhanden then k.wachphasen else null end,
      wach_minuten = case when k.wach_vorhanden then round(k.wach_minuten, 2) else null end,
      bewertungsbasis = v_basis,
      wachsegmente_vorhanden = k.wach_vorhanden,
      dauer_punkte = v_dauer,
      konsistenz_punkte = v_konsistenz,
      unterbrechung_punkte = v_unterbrechung,
      median_abweichung_minuten = v_median_abw,
      historie_naechte = v_hist,
      nachtwert = greatest(0, least(100, round((
        v_dauer + coalesce(v_konsistenz, 0) + coalesce(v_unterbrechung, 0)
      ) / v_basis * 100)))::smallint
    where user_id = z.user_id and nacht = z.nacht;
  end loop;
end;
$$;

drop function if exists _slfn_sleep_class(jsonb);
