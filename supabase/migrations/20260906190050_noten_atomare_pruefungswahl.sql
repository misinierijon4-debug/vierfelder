-- Das vierte Prüfungsfach ist eine fachliche Invariante, keine Folge zweier
-- voneinander unabhängiger Browser-Updates. Diese Migration stoppt bei einem
-- widersprüchlichen Bestand; sie rät oder repariert keine Schulfachdaten.
begin;

set local lock_timeout = '10s';

-- Der Vorabcheck und das Anlegen der Constraints bilden eine Einheit. Alte
-- Writer dürfen den geprüften Bestand bis COMMIT nicht mehr verändern.
lock table public.profile, public.faecher, public.noten
  in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.profile p
    left join public.faecher f on f.user_id = p.id
    group by p.id
    having count(*) filter (where f.kursart = 'lk') <> 3
       or count(*) filter (where f.pruefungsfach = 4) <> 1
       or count(*) filter (
         where f.pruefungsfach = 4
           and f.kursart = 'gk'
       ) <> 1
       or count(*) filter (
         where f.pruefungsfach = 4
           and lower(btrim(f.name)) = 'sport'
       ) <> 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'pruefungsfach-invariante ist im bestand nicht erfuellt';
  end if;

  if exists (
    select 1
    from public.noten n
    left join public.faecher f
      on f.user_id = n.user_id
     and f.id = n.fach_id
    where f.id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'noten enthalten fachzuordnungen eines anderen nutzers';
  end if;
end
$$;

alter table public.faecher
  add constraint faecher_user_id_id_key unique (user_id, id);

alter table public.noten
  add constraint noten_fach_eigentuemer_fk
  foreign key (user_id, fach_id)
  references public.faecher (user_id, id)
  on delete cascade
  not valid;

alter table public.noten
  validate constraint noten_fach_eigentuemer_fk;

create or replace function private.pruefe_pruefungsfach_invariante()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lk bigint;
  v_auswahl bigint;
  v_auswahl_gk bigint;
  v_sport bigint;
begin
  select
    count(*) filter (where f.kursart = 'lk'),
    count(*) filter (where f.pruefungsfach = 4),
    count(*) filter (
      where f.pruefungsfach = 4
        and f.kursart = 'gk'
    ),
    count(*) filter (
      where f.pruefungsfach = 4
        and lower(btrim(f.name)) = 'sport'
    )
  into v_lk, v_auswahl, v_auswahl_gk, v_sport
  from public.faecher f
  where f.user_id = new.user_id;

  if v_lk <> 3 or v_auswahl <> 1 or v_auswahl_gk <> 1 or v_sport <> 0 then
    raise exception using
      errcode = '23514',
      message = 'genau drei lk und ein muendlicher gk ausser sport sind erforderlich';
  end if;

  return null;
end
$$;

revoke all on function private.pruefe_pruefungsfach_invariante()
  from public, anon, authenticated;

create constraint trigger faecher_pruefungsfach_genau_eins
after update of pruefungsfach on public.faecher
deferrable initially deferred
for each row
execute function private.pruefe_pruefungsfach_invariante();

create or replace function public.setze_pruefungsfach(
  p_fach_id uuid,
  p_erwartetes_fach_id uuid
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_aktuell uuid;
  v_lk bigint;
  v_auswahl bigint;
  v_auswahl_gk bigint;
begin
  if v_user_id is null
     or not coalesce(private.ist_duellprofil(), false) then
    raise exception using errcode = '42501', message = 'nicht berechtigt';
  end if;

  if p_fach_id is null then
    raise exception using errcode = '22023', message = 'ungueltiges fach';
  end if;

  -- Eine stabile Sperrreihenfolge verhindert Deadlocks zwischen zwei Geräten.
  perform f.id
  from public.faecher f
  where f.user_id = v_user_id
  order by f.id
  for update;

  select
    count(*) filter (where f.kursart = 'lk'),
    count(*) filter (where f.pruefungsfach = 4),
    count(*) filter (
      where f.pruefungsfach = 4
        and f.kursart = 'gk'
    )
  into v_lk, v_auswahl, v_auswahl_gk
  from public.faecher f
  where f.user_id = v_user_id;

  if v_lk <> 3 or v_auswahl <> 1 or v_auswahl_gk <> 1 then
    raise exception using errcode = '23514', message = 'fachmodell ist widerspruechlich';
  end if;

  if not exists (
    select 1
    from public.faecher f
    where f.id = p_fach_id
      and f.user_id = v_user_id
      and f.kursart = 'gk'
      and lower(btrim(f.name)) <> 'sport'
  ) then
    raise exception using errcode = '22023', message = 'ungueltiges fach';
  end if;

  select f.id
  into v_aktuell
  from public.faecher f
  where f.user_id = v_user_id
    and f.pruefungsfach = 4;

  -- Eine Wiederholung nach verlorener Erfolgsantwort bleibt idempotent.
  if v_aktuell = p_fach_id then
    return p_fach_id;
  end if;

  if v_aktuell is distinct from p_erwartetes_fach_id then
    raise exception using
      errcode = '40001',
      message = 'pruefungsfach wurde parallel geaendert';
  end if;

  update public.faecher
  set pruefungsfach = null
  where id = v_aktuell
    and user_id = v_user_id;

  if not found then
    raise exception using errcode = '40001', message = 'alter stand wurde nicht gefunden';
  end if;

  update public.faecher
  set pruefungsfach = 4
  where id = p_fach_id
    and user_id = v_user_id
    and kursart = 'gk'
    and lower(btrim(name)) <> 'sport';

  if not found then
    raise exception using errcode = '40001', message = 'ziel wurde nicht geschrieben';
  end if;

  return p_fach_id;
end
$$;

revoke all on function public.setze_pruefungsfach(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.setze_pruefungsfach(uuid, uuid)
  to authenticated;

comment on function public.setze_pruefungsfach(uuid, uuid) is
  'Wechselt das vierte Pruefungsfach atomar, idempotent und mit Expected-State-Konflikterkennung.';

commit;
