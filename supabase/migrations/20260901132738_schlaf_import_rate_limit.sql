-- Gemeinsame Schutzschicht fuer Edge Function und den befristet erhaltenen
-- direkten RPC-Kurzbefehl: 512 KiB, 300 Segmente und 30 Aufrufe je 15 Minuten.

create table private.schlaf_import_rate (
  user_id uuid not null references public.profile(id) on delete cascade,
  fenster timestamptz not null,
  anfragen smallint not null check (anfragen > 0),
  primary key (user_id, fenster)
);
revoke all on table private.schlaf_import_rate from public, anon, authenticated;

alter function public.record_sleep_night(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  rename to record_sleep_night_internal;
revoke all on function public.record_sleep_night_internal(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;

create function public.record_sleep_night(
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

  if jsonb_typeof(p_raw_segments) = 'array' then
    v_segs := p_raw_segments;
  elsif jsonb_typeof(p_raw_segments->'segments') = 'array' then
    v_segs := p_raw_segments->'segments';
  else
    raise exception 'p_raw_segments muss ein array sein'
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
