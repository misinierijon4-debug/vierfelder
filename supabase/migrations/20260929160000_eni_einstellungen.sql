-- Wie ENI mit einer Person redet: Ton, Antwortlaenge, eigene Anweisungen,
-- Rollen fuer Themen. Eine Zeile je Person, nur fuer sie selbst lesbar.
-- Die Edge Function `eni` liest sie mit dem Token der Person; fehlt die Zeile,
-- gilt der Standard. Aenderung ohne Datenbestand: die Tabelle ist neu.
create table public.eni_einstellungen (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ton text not null default 'standard'
    check (ton in ('standard','streng','locker','sanft','sachlich','eigener')),
  laenge text not null default 'normal'
    check (laenge in ('kurz','normal','ausfuehrlich')),
  anweisungen text not null default ''
    check (char_length(anweisungen) <= 1500),
  rollen jsonb not null default '[]'::jsonb
    check (jsonb_typeof(rollen) = 'array' and jsonb_array_length(rollen) <= 16 and octet_length(rollen::text) <= 40000),
  geaendert timestamptz not null default now()
);

alter table public.eni_einstellungen enable row level security;
revoke all on public.eni_einstellungen from anon, authenticated;
grant select, insert, update, delete on public.eni_einstellungen to authenticated;

create policy "eni einstellungen lesen" on public.eni_einstellungen
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "eni einstellungen anlegen" on public.eni_einstellungen
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.profile where id = (select auth.uid()) and person in ('erijon','koray')
    )
  );
create policy "eni einstellungen aendern" on public.eni_einstellungen
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eni einstellungen loeschen" on public.eni_einstellungen
  for delete to authenticated using ((select auth.uid()) = user_id);

create function public.eni_einstellungen_beruehren() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  new.geaendert = now();
  return new;
end;
$$;
create trigger eni_einstellungen_geaendert before insert or update on public.eni_einstellungen
  for each row execute function public.eni_einstellungen_beruehren();
