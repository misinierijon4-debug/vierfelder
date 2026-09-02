-- der sonntagsabschluss wird archiviert statt nur berechnet: sieger,
-- differenz, beleg und der wetteinsatz der woche bleiben stehen, auch wenn
-- die tracker-daten sich spaeter aendern. eine woche hat genau eine zeile.
create table if not exists public.wochenabrechnung (
  woche date primary key,
  sieger text not null check (sieger in ('erijon','koray','unentschieden')),
  grund text not null check (grund in ('punkte','beleg','unentschieden')),
  -- immer erijon minus koray, nie aus sicht des angemeldeten kontos
  differenz smallint not null check (differenz between -35 and 35),
  beleg_erijon smallint not null check (beleg_erijon between 0 and 35),
  beleg_koray smallint not null check (beleg_koray between 0 and 35),
  wette text check (wette is null or char_length(wette) <= 160),
  abgeschlossen timestamptz not null default now()
);

alter table public.wochenabrechnung enable row level security;
revoke all on table public.wochenabrechnung from anon;
revoke all on table public.wochenabrechnung from authenticated;
grant select, insert on table public.wochenabrechnung to authenticated;

create policy "wochenabrechnung lesen" on public.wochenabrechnung
  for select to authenticated using (
    (select auth.uid()) in (select id from public.profile)
  );

create policy "wochenabrechnung schreiben" on public.wochenabrechnung
  for insert to authenticated with check (
    (select auth.uid()) in (select id from public.profile)
  );

alter table public.wochenabrechnung replica identity full;

create index if not exists wochenabrechnung_woche_idx
  on public.wochenabrechnung (woche desc);

do $$
begin
  alter publication supabase_realtime add table public.wochenabrechnung;
exception
  when duplicate_object then null;
end
$$;
