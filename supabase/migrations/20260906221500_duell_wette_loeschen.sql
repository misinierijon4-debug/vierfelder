-- Ein gemeinsamer Einsatz ist editierbar und muss deshalb auch vor dem
-- Wochenabschluss entfernbar sein. Archivierte wochenabrechnung.wette bleibt
-- unveraendert: diese Policy betrifft nur den laufenden Einsatz.
begin;

set local lock_timeout = '10s';

revoke delete on table public.duell_wetten from public, anon;
grant delete on table public.duell_wetten to authenticated;

drop policy if exists "duell wetten loeschen" on public.duell_wetten;
create policy "duell wetten loeschen" on public.duell_wetten
  for delete to authenticated
  using ((select private.ist_duellprofil()));

commit;
