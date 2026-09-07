begin;

set local lock_timeout = '10s';

drop function if exists public.stelle_einheiten_wieder_her(jsonb);

create function public.stelle_einheiten_wieder_her(p_einheiten jsonb)
returns uuid[]
language plpgsql
volatile
security invoker
set search_path = ''
as $funktion$
declare
  v_user_id uuid := (select auth.uid());
  v_anzahl integer;
  v_bestaetigt integer;
  v_ids uuid[];
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'anmeldung erforderlich';
  end if;
  if not coalesce((select private.ist_duellprofil()), false) then
    raise exception using
      errcode = '42501',
      message = 'konto gehoert nicht zum zweikampf';
  end if;

  if p_einheiten is null or jsonb_typeof(p_einheiten) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_einheiten muss ein JSON-array sein';
  end if;
  v_anzahl := jsonb_array_length(p_einheiten);
  if v_anzahl > 64 then
    raise exception using
      errcode = '22023',
      message = 'hoechstens 64 einheiten koennen wiederhergestellt werden';
  end if;
  if v_anzahl = 0 then
    return array[]::uuid[];
  end if;

  -- Skalare Werte werden getrennt abgelehnt, bevor jsonb_object_keys laeuft.
  if exists (
    select 1
    from jsonb_array_elements(p_einheiten) as input(element)
    where jsonb_typeof(input.element) <> 'object'
  ) then
    raise exception using
      errcode = '22023',
      message = 'jede einheit muss ein JSON-object sein';
  end if;

  -- Genau diese sechs Clientfelder sind Teil des versionierten RPC-Vertrags.
  -- user_id kommt absichtlich ausschliesslich aus auth.uid().
  if exists (
    select 1
    from jsonb_array_elements(p_einheiten) as input(element)
    where not (input.element ?& array['id', 'bereich', 'tag', 'wert', 'erfasst', 'von'])
       or exists (
         select 1
         from jsonb_object_keys(input.element) as schluessel(name)
         where schluessel.name <> all (
           array['id', 'bereich', 'tag', 'wert', 'erfasst', 'von']
         )
       )
  ) then
    raise exception using
      errcode = '22023',
      message = 'einheit hat fehlende oder unbekannte felder';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_einheiten) as input(element)
    where jsonb_typeof(input.element -> 'id') <> 'string'
       or jsonb_typeof(input.element -> 'bereich') <> 'string'
       or jsonb_typeof(input.element -> 'tag') <> 'string'
       or jsonb_typeof(input.element -> 'wert') not in ('number', 'null')
       or jsonb_typeof(input.element -> 'erfasst') not in ('string', 'null')
       or jsonb_typeof(input.element -> 'von') not in ('string', 'null')
  ) then
    raise exception using
      errcode = '22023',
      message = 'einheit hat ungueltige JSON-typen';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_einheiten) as input(element)
    where (input.element ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (input.element ->> 'bereich') not in ('lernen', 'gym', 'boxen', 'lesen')
       or (input.element ->> 'tag') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or (
         jsonb_typeof(input.element -> 'wert') = 'number'
         and (
           (input.element ->> 'wert') !~ '^(0|[1-9][0-9]*)$'
           or length(input.element ->> 'wert') > 10
           or (input.element ->> 'wert')::numeric > 2147483647
         )
       )
       or (
         jsonb_typeof(input.element -> 'erfasst') = 'string'
         and (input.element ->> 'erfasst') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$'
       )
       or (
         jsonb_typeof(input.element -> 'von') = 'string'
         and (input.element ->> 'von') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$'
       )
  ) then
    raise exception using
      errcode = '22023',
      message = 'einheit liegt ausserhalb des erlaubten formats';
  end if;

  -- Alle Casts und Kalenderwerte werden vor dem INSERT ausgewertet. Auch ein
  -- ungueltiges spaetes Element kann so niemals eine fruehe Teilmenge retten.
  begin
    perform
      (input.element ->> 'id')::uuid,
      (input.element ->> 'tag')::date,
      case
        when jsonb_typeof(input.element -> 'wert') = 'null' then null
        else (input.element ->> 'wert')::integer
      end,
      case
        when jsonb_typeof(input.element -> 'erfasst') = 'null' then null
        else (input.element ->> 'erfasst')::timestamptz
      end,
      case
        when jsonb_typeof(input.element -> 'von') = 'null' then null
        else (input.element ->> 'von')::timestamptz
      end
    from jsonb_array_elements(p_einheiten) as input(element);
  exception
    when invalid_text_representation
      or invalid_time_zone_displacement_value
      or datetime_field_overflow
      or numeric_value_out_of_range then
      raise exception using
        errcode = '22023',
        message = 'einheit enthaelt keinen gueltigen typisierten wert';
  end;

  if exists (
    select 1
    from jsonb_array_elements(p_einheiten) as input(element)
    where ((input.element ->> 'tag')::date)::text <> input.element ->> 'tag'
       or (
         jsonb_typeof(input.element -> 'erfasst') = 'string'
         and not isfinite((input.element ->> 'erfasst')::timestamptz)
       )
       or (
         jsonb_typeof(input.element -> 'von') = 'string'
         and not isfinite((input.element ->> 'von')::timestamptz)
       )
  ) then
    raise exception using
      errcode = '22023',
      message = 'einheit enthaelt ein ungueltiges datum';
  end if;

  if (
    select count(distinct (input.element ->> 'id')::uuid) <> v_anzahl
        or count(distinct input.element ->> 'bereich') <> 1
        or count(distinct input.element ->> 'tag') <> 1
    from jsonb_array_elements(p_einheiten) as input(element)
  ) then
    raise exception using
      errcode = '22023',
      message = 'einheiten brauchen eindeutige IDs aus genau einem tag';
  end if;

  select array_agg((input.element ->> 'id')::uuid order by input.position)
  into v_ids
  from jsonb_array_elements(p_einheiten) with ordinality as input(element, position);

  -- UUID-Sortierung gibt konkurrierenden, ueberlappenden Batches dieselbe
  -- Sperrreihenfolge. Bestehende IDs werden niemals ueberschrieben.
  insert into public.einheiten (id, user_id, bereich, tag, wert, erfasst, von)
  select
    (input.element ->> 'id')::uuid,
    v_user_id,
    input.element ->> 'bereich',
    (input.element ->> 'tag')::date,
    case
      when jsonb_typeof(input.element -> 'wert') = 'null' then null
      else (input.element ->> 'wert')::integer
    end,
    case
      when jsonb_typeof(input.element -> 'erfasst') = 'null' then null
      else (input.element ->> 'erfasst')::timestamptz
    end,
    case
      when jsonb_typeof(input.element -> 'von') = 'null' then null
      else (input.element ->> 'von')::timestamptz
    end
  from jsonb_array_elements(p_einheiten) as input(element)
  order by (input.element ->> 'id')::uuid
  on conflict (id) do nothing;

  -- Der Postcheck laeuft in derselben RPC-Transaktion und unter den normalen
  -- Tabellenrechten/RLS des Aufrufers. Jede Abweichung wirft eine Exception;
  -- damit werden auch die in diesem Lauf bereits eingefuegten Zeilen gerollbackt.
  select count(*)
  into v_bestaetigt
  from jsonb_array_elements(p_einheiten) as input(element)
  join public.einheiten as gespeichert
    on gespeichert.id = (input.element ->> 'id')::uuid
  where gespeichert.user_id = v_user_id
    and gespeichert.bereich = input.element ->> 'bereich'
    and gespeichert.tag = (input.element ->> 'tag')::date
    and gespeichert.wert is not distinct from case
      when jsonb_typeof(input.element -> 'wert') = 'null' then null
      else (input.element ->> 'wert')::integer
    end
    and gespeichert.erfasst is not distinct from case
      when jsonb_typeof(input.element -> 'erfasst') = 'null' then null
      else (input.element ->> 'erfasst')::timestamptz
    end
    and gespeichert.von is not distinct from case
      when jsonb_typeof(input.element -> 'von') = 'null' then null
      else (input.element ->> 'von')::timestamptz
    end;

  if v_bestaetigt <> v_anzahl then
    raise exception using
      errcode = '40001',
      message = 'einheiten-wiederherstellung kollidiert mit anderem inhalt';
  end if;

  return v_ids;
end;
$funktion$;

revoke all on function public.stelle_einheiten_wieder_her(jsonb)
from public, anon, authenticated;
grant execute on function public.stelle_einheiten_wieder_her(jsonb)
to authenticated;

comment on function public.stelle_einheiten_wieder_her(jsonb) is
  'Stellt 0..64 eigene Einheiten eines Tags atomar, idempotent und kollisionsgeprueft wieder her.';

commit;
