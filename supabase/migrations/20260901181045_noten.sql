-- Noten im laufenden Halbjahr, getrennt von Tracker und Duell (01.09.2026).
-- Beide Konten sehen beide Staende; schreiben darf jedes nur den eigenen.
create table if not exists faecher (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null check (length(btrim(name)) between 1 and 24),
  kursart text not null default 'gf' check (kursart in ('lf','gf')),
  klausur_anteil int not null default 50 check (klausur_anteil between 0 and 100),
  pruefungsfach int check (pruefungsfach is null or pruefungsfach between 1 and 5),
  sortierung int not null default 0,
  erstellt timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists noten (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  fach_id uuid not null references faecher on delete cascade,
  art text not null check (art in ('klausur','muendlich')),
  punkte int not null check (punkte between 0 and 15),
  gewicht int not null default 10 check (gewicht between 1 and 50),
  datum date not null,
  titel text not null default '' check (length(titel) <= 40),
  erstellt timestamptz not null default now()
);

alter table faecher enable row level security;
alter table noten enable row level security;

revoke all on table faecher from anon;
revoke all on table faecher from authenticated;
grant select, insert, update, delete on table faecher to authenticated;
revoke all on table noten from anon;
revoke all on table noten from authenticated;
grant select, insert, update, delete on table noten to authenticated;

drop policy if exists "faecher lesen" on faecher;
create policy "faecher lesen" on faecher for select to authenticated using (
  (select auth.uid()) in (select id from public.profile)
);
drop policy if exists "faecher schreiben" on faecher;
create policy "faecher schreiben" on faecher for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "faecher aendern" on faecher;
create policy "faecher aendern" on faecher for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "faecher loeschen" on faecher;
create policy "faecher loeschen" on faecher for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "noten lesen" on noten;
create policy "noten lesen" on noten for select to authenticated using (
  (select auth.uid()) in (select id from public.profile)
);
drop policy if exists "noten schreiben" on noten;
create policy "noten schreiben" on noten for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from faecher f where f.id = fach_id and f.user_id = (select auth.uid()))
);
drop policy if exists "noten aendern" on noten;
create policy "noten aendern" on noten for update to authenticated
  using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from faecher f where f.id = fach_id and f.user_id = (select auth.uid()))
  );
drop policy if exists "noten loeschen" on noten;
create policy "noten loeschen" on noten for delete to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists faecher_nutzer_idx on faecher (user_id, sortierung, name);
create index if not exists noten_fach_datum_idx on noten (fach_id, datum desc);
create index if not exists noten_nutzer_datum_idx on noten (user_id, datum desc);
alter table faecher replica identity full;
alter table noten replica identity full;

do $$
begin
  alter publication supabase_realtime add table faecher;
exception when duplicate_object then null;
end
$$;
do $$
begin
  alter publication supabase_realtime add table noten;
exception when duplicate_object then null;
end
$$;

-- Stundenplan Misini, Erijon (13): genau drei LF ueber vier bis fuenf Wochenstunden.
insert into faecher (id, user_id, name, kursart, sortierung)
select gen_random_uuid(), p.id, f.name, f.kursart, f.sortierung
from profile p
join (values
  ('bio', 'lf', 0), ('englisch', 'lf', 1), ('geschichte', 'lf', 2),
  ('mathe', 'gf', 3), ('deutsch', 'gf', 4), ('sozialkunde/erdkunde', 'gf', 5),
  ('ethik', 'gf', 6), ('chor', 'gf', 7), ('sport', 'gf', 8),
  ('informatik', 'gf', 9), ('bildende kunst', 'gf', 10)
) as f(name, kursart, sortierung) on true
where p.person = 'erijon'
on conflict (user_id, name) do nothing;

-- Stundenplan Koese, Koray (13): genau drei LF ueber vier bis fuenf Wochenstunden.
insert into faecher (id, user_id, name, kursart, sortierung)
select gen_random_uuid(), p.id, f.name, f.kursart, f.sortierung
from profile p
join (values
  ('deutsch', 'lf', 0), ('physik', 'lf', 1), ('geschichte', 'lf', 2),
  ('mathe', 'gf', 3), ('englisch', 'gf', 4), ('sozialkunde/erdkunde', 'gf', 5),
  ('katholische religion', 'gf', 6), ('französisch', 'gf', 7), ('chor', 'gf', 8),
  ('sport', 'gf', 9), ('bildende kunst', 'gf', 10)
) as f(name, kursart, sortierung) on true
where p.person = 'koray'
on conflict (user_id, name) do nothing;
