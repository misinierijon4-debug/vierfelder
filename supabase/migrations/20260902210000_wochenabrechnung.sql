-- der sonntagsabschluss wird archiviert statt nur berechnet: sieger,
-- differenz, beleg und der wetteinsatz der woche bleiben stehen, auch wenn
-- die tracker-daten sich spaeter aendern. eine woche hat genau eine zeile.
create table if not exists wochenabrechnung (
  woche date primary key,
  sieger text not null check (sieger in ('erijon','koray','unentschieden')),
  grund text not null check (grund in ('punkte','beleg','unentschieden')),
  differenz int not null,
  beleg_ich smallint not null,
  beleg_er smallint not null,
  wette text check (wette is null or char_length(wette) <= 160),
  abgeschlossen timestamptz not null default now()
);

alter table wochenabrechnung enable row level security;
revoke all on table wochenabrechnung from anon;
revoke all on table wochenabrechnung from authenticated;
grant select, insert, update on table wochenabrechnung to authenticated;

create policy "wochenabrechnung lesen" on wochenabrechnung
  for select to authenticated using (
    (select auth.uid()) in (select id from public.profile)
  );

create policy "wochenabrechnung schreiben" on wochenabrechnung
  for insert to authenticated with check (
    (select auth.uid()) in (select id from public.profile)
  );

create policy "wochenabrechnung aendern" on wochenabrechnung
  for update to authenticated using (
    (select auth.uid()) in (select id from public.profile)
  );

alter table wochenabrechnung replica identity full;

create index if not exists wochenabrechnung_woche_idx
  on wochenabrechnung (woche desc);

do $$
begin
  alter publication supabase_realtime add table wochenabrechnung;
exception
  when duplicate_object then null;
end
$$;
