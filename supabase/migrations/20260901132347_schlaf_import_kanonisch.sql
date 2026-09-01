-- Die Edge Function ist nur noch ein authentifizierender, begrenzender Adapter
-- vor record_sleep_night. Damit durchlaufen Edge- und bestehender RPC-Kurzbefehl
-- exakt dieselbe Nachtauswahl und Segmentrechnung.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schlafnaechte'::regclass
      and conname = 'schlafnaechte_rohsegmente_anzahl_check'
  ) then
    alter table public.schlafnaechte
      add constraint schlafnaechte_rohsegmente_anzahl_check
      check (
        jsonb_typeof(rohsegmente) = 'array'
        and jsonb_array_length(rohsegmente) between 1 and 300
      );
  end if;
end
$$;

grant execute on function public.record_sleep_night(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;
