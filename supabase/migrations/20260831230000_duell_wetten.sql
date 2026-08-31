-- Ein gemeinsamer, jahrssicherer Wetteinsatz pro Duellwoche.
create table if not exists duell_wetten (
  woche date primary key,
  text text not null check (char_length(btrim(text)) between 1 and 160),
  updated_by uuid not null references profile(id),
  updated_at timestamptz not null default now()
);

alter table duell_wetten enable row level security;

revoke all on table duell_wetten from anon;
revoke all on table duell_wetten from authenticated;
grant select, insert, update on table duell_wetten to authenticated;

drop policy if exists "duell wetten lesen" on duell_wetten;
create policy "duell wetten lesen" on duell_wetten
  for select to authenticated using (
    (select auth.uid()) in (select id from public.profile)
  );

drop policy if exists "duell wetten anlegen" on duell_wetten;
create policy "duell wetten anlegen" on duell_wetten
  for insert to authenticated with check (
    (select auth.uid()) = updated_by
    and (select auth.uid()) in (select id from public.profile)
  );

drop policy if exists "duell wetten aendern" on duell_wetten;
create policy "duell wetten aendern" on duell_wetten
  for update to authenticated using (
    (select auth.uid()) in (select id from public.profile)
  ) with check (
    (select auth.uid()) = updated_by
    and (select auth.uid()) in (select id from public.profile)
  );

alter table duell_wetten replica identity full;

do $$
begin
  alter publication supabase_realtime add table duell_wetten;
exception
  when duplicate_object then null;
end
$$;
