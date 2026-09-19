-- Verzeihende Segmentannahme im Wrapper record_sleep_night.
--
-- Die Kurzbefehle-App legt jedes Feld im JSON-Haupttext mit einem festen Typ
-- an. Fuer p_raw_segments muss dort "Array" stehen. Steht es auf "Text" —
-- etwa weil ein iOS-Update den Feldtyp zurueckgesetzt hat —, kommt dieselbe
-- Liste als Zeichenkette an: "[{\"start\":…}]". Der Wrapper hat das bisher mit
-- 'p_raw_segments muss ein array sein' abgelehnt, ohne zu sagen, was wirklich
-- ankam. Der taegliche Schlafimport faellt damit still aus, und am Geraet ist
-- nicht zu sehen, welches der drei Felder den falschen Typ hat.
--
-- Diese Migration aendert ausschliesslich die Annahme der Segmente und den
-- Wortlaut der Ablehnung. Identitaetspruefung, Rate-Limit, die Grenzen von 300
-- Segmenten und 512 KiB sowie record_sleep_night_internal bleiben Wort fuer
-- Wort wie in 20260901132738_schlaf_import_rate_limit.sql; _internal bekommt
-- weiterhin ein echtes jsonb-Array uebergeben.
--
-- Die Reihenfolge bleibt wichtig: erst Token, dann Segmente. Wer kein
-- gueltiges Token hat, erfaehrt weiterhin nichts ueber den Rest der Nutzlast.

------------------------------------------------------------------
-- Segmentliste aus dem herausholen, was der Kurzbefehl geschickt hat.
-- Gibt null zurueck, wenn sich keine Liste finden laesst; der Aufrufer
-- entscheidet ueber die Fehlermeldung.
------------------------------------------------------------------
create or replace function public._slfn_segmente(raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  v_text text;
  v_geparst jsonb;
begin
  if raw is null then
    return null;
  end if;

  case jsonb_typeof(raw)
    when 'array' then
      return raw;

    when 'object' then
      -- {"segments": [...]} wie bisher.
      if jsonb_typeof(raw->'segments') = 'array' then
        return raw->'segments';
      end if;
      -- Eine Nacht mit genau einem Health-Ergebnis: iOS schickt dann kein
      -- Array, sondern das Woerterbuch selbst.
      if raw ? 'start' and raw ? 'end' then
        return jsonb_build_array(raw);
      end if;
      return null;

    when 'string' then
      -- Feldtyp "Text" statt "Array": die Liste steckt als JSON in der
      -- Zeichenkette.
      v_text := btrim(raw #>> '{}');
      if v_text = '' then
        return null;
      end if;
      begin
        v_geparst := v_text::jsonb;
      exception when others then
        return null;
      end;
      -- Nur eine Ebene auspacken. Eine doppelt verpackte Zeichenkette ist
      -- kein Versehen mehr, das hier zu erraten waere.
      if jsonb_typeof(v_geparst) = 'string' then
        return null;
      end if;
      return public._slfn_segmente(v_geparst);

    else
      return null;
  end case;
end;
$$;

revoke all on function public._slfn_segmente(jsonb) from public, anon, authenticated;

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
