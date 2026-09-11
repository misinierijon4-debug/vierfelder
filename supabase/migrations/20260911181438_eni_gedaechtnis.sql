-- Bewusst gespeichertes Wissen und bestaetigte Aufgaben. Keine Chatkopien.
create table public.eni_erinnerungen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 1000),
  art text not null default 'profil' check (art in ('profil','aktuell','erfahrung','stil','aufgabe')),
  gemeinsam boolean not null default false,
  bis date,
  erledigt boolean not null default false,
  erstellt timestamptz not null default now(),
  geaendert timestamptz not null default now(),
  check (art <> 'stil' or gemeinsam = false)
);
alter table public.eni_erinnerungen enable row level security;
revoke all on public.eni_erinnerungen from anon, authenticated;
grant select, insert, update, delete on public.eni_erinnerungen to authenticated;
create policy "eni wissen lesen" on public.eni_erinnerungen for select to authenticated using (
  (select auth.uid()) = user_id or (gemeinsam and exists (
    select 1 from public.profile where id = (select auth.uid()) and person in ('erijon','koray')
  ))
);
create policy "eni wissen anlegen" on public.eni_erinnerungen for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.profile where id = (select auth.uid()) and person in ('erijon','koray')
  )
);
create policy "eni wissen bearbeiten" on public.eni_erinnerungen for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eni wissen loeschen" on public.eni_erinnerungen for delete to authenticated
  using ((select auth.uid()) = user_id);
create index eni_erinnerungen_person on public.eni_erinnerungen(user_id, geaendert desc);
create index eni_erinnerungen_geteilt on public.eni_erinnerungen(geaendert desc) where gemeinsam;
create function public.eni_wissen_beruehren() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.geaendert = now();
  new.erstellt = old.erstellt;
  return new;
end;
$$;
create trigger eni_wissen_geaendert before update on public.eni_erinnerungen
  for each row execute function public.eni_wissen_beruehren();
