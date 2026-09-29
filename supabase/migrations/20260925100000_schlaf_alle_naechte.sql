-- Ein Schlafimport speichert jede Nacht im Fenster, nicht nur die letzte.
--
-- Bisher waehlte record_sleep_night_internal aus der Nutzlast die zuletzt
-- endende Episode; alles davor fiel weg. Eine ausgefallene Automation war
-- damit verloren, und zwei verkuerzte Naechte (erijon, 23. und 24.09.2026,
-- siehe *_schlaf_nacht_nicht_kuerzen.sql) liessen sich mit einem breiteren
-- Fenster nicht reparieren — der Lauf rechnete nur die heutige Nacht.
--
-- Neu im Wrapper record_sleep_night:
--   * Ohne p_night_date teilt er die Segmente nach Naechten (dieselbe
--     Episodenbildung wie _slfn_nacht_kennzahlen: Luecke ueber drei Stunden,
--     Nacht = lokales Datum am Episodenende) und ruft _internal je Nacht, die
--     aelteste zuerst.
--   * Die letzte Nacht wird wie bisher immer geschrieben.
--   * Eine aeltere Nacht nur, wenn sie dadurch laenger wird (frueher
--     eingeschlafen oder spaeter aufgewacht als gespeichert) oder noch gar
--     nicht existiert. Die erste Nacht im Fenster ist meist am Fensterbeginn
--     abgeschnitten; fehlt sie, wird sie deshalb nicht neu angelegt. Die
--     taegliche Automation schickt die Vornacht also ohne Wirkung mit.
--   * Mit p_night_date bleibt es bei einem Aufruf wie bisher.
--
-- Die Segmentgrenze steht jetzt in _slfn_max_segmente() und ist fuer den
-- einmaligen Reparaturlauf ueber drei Tage auf 1500 gesetzt. Eine spaetere
-- Migration setzt sie wieder auf 300. Die 512-KiB-Grenze bleibt.
--
-- record_sleep_night_internal und _slfn_frueheren_teil_behalten bleiben
-- unveraendert; Token, Segmentannahme und Rate-Limit stehen wie zuvor.

create or replace function public._slfn_max_segmente()
returns int
language sql
immutable
as $$ select 1500 $$;

revoke all on function public._slfn_max_segmente() from public, anon, authenticated;

------------------------------------------------------------------
-- Naechte einer Nutzlast mit ihren Grenzen. Ein Segment gehoert zur Nacht,
-- wenn es nach dem Ende der vorigen und vor dem Beginn der naechsten Nacht
-- beginnt. So landet jedes Segment genau einmal.
------------------------------------------------------------------
create or replace function public._slfn_naechte(p_segs jsonb)
returns table(nacht date, von timestamptz, bis timestamptz, vorher_bis timestamptz,
              nachher_von timestamptz, nr int, anzahl int)
language sql
stable
set search_path = public, extensions
as $$
  with seg as (
    select _slfn_parse_ts(s->'start') as st, _slfn_parse_ts(s->'end') as en
    from jsonb_array_elements(p_segs) as q(s)
    where _slfn_sleep_stage(s->'value') in ('tief', 'rem', 'kern', 'unspez')
  ),
  luecke as (
    select st, en,
           max(en) over (order by st, en rows between unbounded preceding and 1 preceding) as vorher
    from seg where st is not null and en is not null and en > st
  ),
  gruppen as (
    select st, en,
           sum(case when vorher is null or st - vorher > interval '3 hours' then 1 else 0 end)
             over (order by st, en rows unbounded preceding) as gruppe
    from luecke
  ),
  episoden as (
    select min(st) as von, max(en) as bis from gruppen group by gruppe
  ),
  proNacht as (
    select (bis at time zone 'Europe/Berlin')::date as nacht, min(von) as von, max(bis) as bis
    from episoden group by 1
  )
  select nacht, von, bis,
         lag(bis) over (order by bis),
         lead(von) over (order by bis),
         (row_number() over (order by bis))::int,
         (count(*) over ())::int
  from proNacht
$$;

revoke all on function public._slfn_naechte(jsonb) from public, anon, authenticated;

create or replace function public.record_sleep_night(
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
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_token text;
  v_user uuid;
  v_segs jsonb;
  v_fenster timestamptz;
  v_anfragen smallint;
  v_nacht date;
  n record;
  v_teil jsonb;
  v_alt_von timestamptz;
  v_alt_bis timestamptz;
  v_neu_von timestamptz;
  v_neu_bis timestamptz;
  v_ergebnis jsonb;
  v_geschrieben text[] := '{}';
begin
  v_token := btrim(coalesce(public._slfn_scalar_text(p_token), ''));
  if length(v_token) < 32 then
    raise exception 'import-token fehlt oder ist zu kurz'
      using errcode = 'invalid_authorization_specification';
  end if;

  select t.user_id into v_user
  from public.schlaf_import_tokens t
  where t.token_hash = encode(digest(v_token, 'sha256'), 'hex')
    and t.aktiv
  limit 1;
  if v_user is null then
    raise exception 'import-token ist ungueltig'
      using errcode = 'invalid_authorization_specification';
  end if;

  v_segs := public._slfn_segmente(p_raw_segments);
  if v_segs is null then
    raise exception
      'p_raw_segments muss ein array sein; angekommen ist %. im kurzbefehl den feldtyp auf array stellen',
      coalesce(jsonb_typeof(p_raw_segments), 'nichts')
      using errcode = 'invalid_parameter_value';
  end if;

  if jsonb_array_length(v_segs) not between 1 and public._slfn_max_segmente() then
    raise exception 'zwischen 1 und % segmente sind erlaubt', public._slfn_max_segmente()
      using errcode = 'invalid_parameter_value';
  end if;
  if octet_length(v_segs::text) > 524288 then
    raise exception 'payload ist groesser als 512 kibibyte'
      using errcode = 'program_limit_exceeded';
  end if;

  v_fenster := date_bin(
    interval '15 minutes', now(), timestamptz '2000-01-01 00:00:00+00'
  );
  delete from private.schlaf_import_rate
  where user_id = v_user and fenster < v_fenster - interval '2 days';
  insert into private.schlaf_import_rate(user_id, fenster, anfragen)
  values (v_user, v_fenster, 1)
  on conflict (user_id, fenster) do update
    set anfragen = private.schlaf_import_rate.anfragen + 1
  returning anfragen into v_anfragen;
  if v_anfragen > 30 then
    raise exception 'zu viele schlafimporte; bitte spaeter erneut versuchen'
      using errcode = 'too_many_connections';
  end if;

  -- ausdrueckliche nacht: ein aufruf wie bisher
  v_nacht := public._slfn_parse_date(p_night_date);
  if v_nacht is not null then
    v_segs := public._slfn_frueheren_teil_behalten(v_user, v_nacht, v_segs);
    return public.record_sleep_night_internal(
      p_night_date, v_segs, p_source_name, p_target_hours, p_user_id, p_token
    );
  end if;

  for n in select * from public._slfn_naechte(v_segs) order by nr loop
    select coalesce(jsonb_agg(s), '[]'::jsonb) into v_teil
    from jsonb_array_elements(v_segs) as q(s)
    where public._slfn_parse_ts(s->'start') is not null
      and (n.vorher_bis is null or public._slfn_parse_ts(s->'start') >= n.vorher_bis)
      and (n.nachher_von is null or public._slfn_parse_ts(s->'start') < n.nachher_von);

    v_teil := public._slfn_frueheren_teil_behalten(v_user, n.nacht, v_teil);

    if n.nr < n.anzahl then
      -- aeltere nacht: nur schreiben, wenn sie dadurch laenger wird
      select k.einschlafzeit, k.aufwachzeit into v_alt_von, v_alt_bis
      from public.schlafnaechte s, public._slfn_nacht_kennzahlen(s.rohsegmente) k
      where s.user_id = v_user and s.nacht = n.nacht;

      if not found then
        -- die erste nacht im fenster ist meist am fensterbeginn abgeschnitten
        continue when n.nr = 1;
      else
        select k.einschlafzeit, k.aufwachzeit into v_neu_von, v_neu_bis
        from public._slfn_nacht_kennzahlen(v_teil) k;
        continue when not (
          v_neu_von < v_alt_von - interval '1 minute'
          or v_neu_bis > v_alt_bis + interval '1 minute'
        );
      end if;
    end if;

    v_ergebnis := public.record_sleep_night_internal(
      null, v_teil, p_source_name, p_target_hours, p_user_id, p_token
    );
    v_geschrieben := v_geschrieben || (v_ergebnis->>'nacht');
  end loop;

  if v_ergebnis is null then
    -- keine schlafsegmente: _internal meldet den fehler wie bisher
    return public.record_sleep_night_internal(
      null, v_segs, p_source_name, p_target_hours, p_user_id, p_token
    );
  end if;

  return v_ergebnis || jsonb_build_object('naechte', to_jsonb(v_geschrieben));
end
$$;

revoke all on function public.record_sleep_night(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, authenticated;
grant execute on function public.record_sleep_night(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to anon, service_role;
