-- Ein Schlafimport darf eine gespeicherte Nacht nicht mehr abschneiden.
--
-- Anlass (erijon, 23. und 24.09.2026): Der Kurzbefehl schickt die Segmente ab
-- gestern 0 Uhr. Laeuft er morgens, bevor die Schlaf-App die gerade beendete
-- Nacht in Health geschrieben hat, ist die letzte Episode im Fenster die
-- Vornacht — aber nur ab Mitternacht. Der Import hat damit die richtige Zeile
-- (Di 22:58 bis Mi 08:31) durch 00:08 bis 08:31 ersetzt; die Zeit vor
-- Mitternacht war verloren, eine Historie gibt es nicht.
--
-- Neu: Gibt es fuer die Zielnacht schon eine Zeile, behaelt der Wrapper deren
-- Rohsegmente, die VOR dem Beginn des neuen Fensters liegen (ein Segment ueber
-- die Grenze wird dort abgeschnitten), und rechnet mit beidem. Ab dem
-- Fensterbeginn gilt allein die neue Nutzlast — wer in Health etwas
-- korrigiert und mit breiterem Fenster neu sendet, ersetzt den Stand weiterhin.
--
-- record_sleep_night_internal bleibt unveraendert. Token, Segmentannahme,
-- Grenzen und Rate-Limit stehen Wort fuer Wort wie in
-- 20260919083937_schlaf_segmente_verzeihend.sql; die 300-Segment-Grenze gilt
-- fuer das, was der Kurzbefehl schickt, nicht fuer die zusammengefuehrte Liste.

------------------------------------------------------------------
-- Frueheren Teil einer gespeicherten Nacht vor die neue Nutzlast setzen.
-- Ohne gespeicherte Zeile oder ohne lesbaren Fensterbeginn kommt p_segs
-- unveraendert zurueck.
------------------------------------------------------------------
create or replace function public._slfn_frueheren_teil_behalten(
  p_user uuid,
  p_nacht date,
  p_segs jsonb
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with neu as (
    -- der rohe start-wert des fruehesten neuen segments: ein abgeschnittenes
    -- altes segment endet genau dort, im format, das der kurzbefehl schickt
    select s->'start' as roh, public._slfn_parse_ts(s->'start') as beginn
    from jsonb_array_elements(p_segs) as q(s)
    where public._slfn_parse_ts(s->'start') is not null
    order by 2
    limit 1
  ),
  alt as (
    select s, public._slfn_parse_ts(s->'start') as st, public._slfn_parse_ts(s->'end') as en
    from public.schlafnaechte n,
         jsonb_array_elements(n.rohsegmente) as q(s)
    where n.user_id = p_user and n.nacht = p_nacht
  ),
  frueher as (
    select jsonb_agg(
             case when a.en > neu.beginn then a.s || jsonb_build_object('end', neu.roh) else a.s end
             order by a.st, a.en
           ) as segs
    from alt a, neu
    where a.st is not null and a.en is not null and a.en > a.st
      and a.st < neu.beginn
      -- was mehr als 36 stunden vor dem fenster liegt, gehoert zu keiner
      -- episode, die der import noch waehlen koennte
      and a.en > neu.beginn - interval '36 hours'
  )
  select coalesce((select segs from frueher), '[]'::jsonb) || p_segs
$$;

revoke all on function public._slfn_frueheren_teil_behalten(uuid, date, jsonb)
  from public, anon, authenticated;

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

  if jsonb_array_length(v_segs) not between 1 and 300 then
    raise exception 'zwischen 1 und 300 segmente sind erlaubt'
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

  -- dieselbe nacht, die _internal waehlen wird: ausdruecklich angegeben oder
  -- das lokale datum am ende der zuletzt endenden episode
  v_nacht := public._slfn_parse_date(p_night_date);
  if v_nacht is null then
    select (k.aufwachzeit at time zone 'Europe/Berlin')::date into v_nacht
    from public._slfn_nacht_kennzahlen(v_segs) k;
  end if;
  if v_nacht is not null then
    v_segs := public._slfn_frueheren_teil_behalten(v_user, v_nacht, v_segs);
  end if;

  return public.record_sleep_night_internal(
    p_night_date, v_segs, p_source_name, p_target_hours, p_user_id, p_token
  );
end
$$;

revoke all on function public.record_sleep_night(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, authenticated;
grant execute on function public.record_sleep_night(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to anon, service_role;
