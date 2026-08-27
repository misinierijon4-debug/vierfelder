-- Verzeihende RPC-Funktion fuer den direkten iOS-Kurzbefehl-Aufruf.
--
-- Der Kurzbefehl sendet alle Parameter als JSON an
--   POST /rest/v1/rpc/record_sleep_night
-- PostgREST waehlt die Signatur nur nach Parameternamen; die JSON-Typen
-- sind aber unsicher (Zahlen als Text "9", Daten mit oder ohne Zeitzone).
-- Deshalb ist jeder Parameter jsonb und wird hier selbst geparst.
--
-- Schreibrechte hat nur, wer ein gueltiges Import-Token mitschickt
-- (Tabelle schlaf_import_tokens; dort liegt nur der SHA-256-Hash).
-- p_user_id wird aus Sicherheitsgruenden ignoriert.

create extension if not exists pgcrypto with schema extensions;

create or replace function _slfn_scalar_text(raw jsonb)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select case
    when raw is null or jsonb_typeof(raw) in ('null', 'object', 'array') then null
    else raw #>> '{}'
  end
$$;

create or replace function _slfn_parse_ts(raw jsonb)
returns timestamptz
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  s text;
begin
  s := btrim(coalesce(_slfn_scalar_text(raw), ''));
  if s = '' then return null; end if;
  if upper(s) ~ 'Z$' or s ~ '[+-][0-9]{2}:?[0-9]{2}$' then
    return s::timestamptz;
  end if;
  return regexp_replace(s, '\s+', 'T')::timestamp at time zone 'Europe/Berlin';
exception
  when others then return null;
end;
$$;

create or replace function _slfn_parse_date(raw jsonb)
returns date
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  s text;
begin
  s := btrim(coalesce(_slfn_scalar_text(raw), ''));
  if s ~ '^\d{4}-\d{2}-\d{2}' then
    return left(s, 10)::date;
  end if;
  return null;
exception
  when others then return null;
end;
$$;

create or replace function _slfn_parse_number(raw jsonb)
returns numeric
language plpgsql
immutable
set search_path = public, extensions
as $$
begin
  if raw is null or jsonb_typeof(raw) in ('null', 'object', 'array') then
    return null;
  end if;
  return translate(btrim(_slfn_scalar_text(raw)), ',', '.')::numeric;
exception
  when others then return null;
end;
$$;

create or replace function _slfn_sleep_class(raw jsonb)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  key text;
begin
  key := regexp_replace(lower(coalesce(_slfn_scalar_text(raw), '')), '[^a-z0-9]', '', 'g');
  if key in ('', 'hkcategoryvaluesleepanalysisinbed', 'inbed', 'imbett') or key = '0' then
    return 'in_bed';
  end if;
  if position('awake' in key) > 0 or key = 'wach' or key = '2' then
    return 'awake';
  end if;
  if position('asleep' in key) > 0 or position('schlaf' in key) > 0
      or key in ('core', 'kern', 'deep', 'tief', 'rem', '1', '3', '4', '5') then
    return 'asleep';
  end if;
  return null;
end;
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
  v_cls text;
  v_st timestamptz;
  v_en timestamptz;
  v_src text;
  v_segment_keys text;
  v_quellen text[] := '{}';

  v_asleep_start timestamptz;
  v_asleep_end timestamptz;
  v_schlaf_minuten numeric;
  v_wachphasen int := 0;
  v_wach_minuten numeric := 0;

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

  create temp table sl_seg (cls text, st timestamptz, en timestamptz) on commit drop;

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

    v_cls := _slfn_sleep_class(v_el->'value');
    if v_cls is null then
      raise exception 'unbekannter schlafwert: %',
        coalesce(_slfn_scalar_text(v_el->'value'), '')
        using errcode = 'invalid_parameter_value';
    end if;

    insert into sl_seg values (v_cls, v_st, v_en);

    v_src := btrim(coalesce(_slfn_scalar_text(v_el->'source'), ''));
    if v_src <> '' and not (v_src = any (v_quellen)) then
      v_quellen := v_quellen || v_src;
    end if;
  end loop;

  v_src := btrim(coalesce(_slfn_scalar_text(p_source_name), ''));
  if v_src <> '' and not (v_src = any (v_quellen)) then
    v_quellen := v_quellen || v_src;
  end if;

  if not exists (select 1 from sl_seg where cls = 'asleep') then
    raise exception 'keine auswertbaren schlafsegmente gefunden'
      using errcode = 'invalid_parameter_value';
  end if;

  select min(st), max(en) into v_asleep_start, v_asleep_end
  from sl_seg where cls = 'asleep';

  if v_asleep_end - v_asleep_start > interval '36 hours' then
    raise exception 'segmente umfassen mehr als 36 stunden'
      using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(sum(extract(epoch from (en - st))) / 60, 0)
  into v_schlaf_minuten
  from sl_seg where cls = 'asleep';

  select count(*),
         coalesce(sum(extract(epoch from (
           least(en, v_asleep_end) - greatest(st, v_asleep_start)
         ))) / 60, 0)
  into v_wachphasen, v_wach_minuten
  from sl_seg
  where cls = 'awake'
    and st < v_asleep_end
    and en > v_asleep_start;

  -- Ziel: egal ob number, string "9" oder "9,5". Default und Fallback 9.
  v_th := coalesce(_slfn_parse_number(p_target_hours), 9);
  if v_th <= 0 then
    v_th := 9;
  end if;
  v_ziel_min := greatest(240, least(720, round(v_th * 60)))::smallint;

  -- Nacht: Parameter gewinnt, sonst lokales Ende der Schlafspanne.
  v_nacht := _slfn_parse_date(p_night_date);
  if v_nacht is null then
    v_nacht := (v_asleep_end at time zone 'Europe/Berlin')::date;
  end if;

  v_dauer := round(50 * least(greatest(v_schlaf_minuten / v_ziel_min, 0), 1), 2);

  if v_wachphasen > 0 then
    v_basis := 100;
    v_unterbrechung := round(
      12 * (1 - least(v_wach_minuten / 30, 1))
      + 8 * (1 - least(v_wachphasen::numeric / 8, 1)),
      2
    );
  else
    v_wachphasen := null;
    v_wach_minuten := null;
  end if;

  select floor(extract(hour from st at time zone 'Europe/Berlin')) * 60
       + floor(extract(minute from st at time zone 'Europe/Berlin'))
  into v_lokal_min
  from sl_seg where cls = 'asleep'
  order by st asc limit 1;

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
    (v_basis = 100), v_quellen, v_segs
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
