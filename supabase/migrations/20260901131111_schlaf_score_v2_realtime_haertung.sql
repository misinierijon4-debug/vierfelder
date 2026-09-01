-- Nachtwert v2, datensparsame Leseschicht und Realtime-Signal.
--
-- Kompatibilitaet: record_sleep_night und der bestehende iPhone-Kurzbefehl
-- bleiben bestehen. Der BEFORE-Trigger setzt jedoch unabhaengig vom Schreibweg
-- immer denselben v2-Score. So koennen Edge Function und RPC nicht mehr mit
-- unterschiedlichen gespeicherten Ergebnissen enden.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.ist_duellprofil()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profile where id = (select auth.uid()))
$$;
revoke all on function private.ist_duellprofil() from public, anon, authenticated;
grant execute on function private.ist_duellprofil() to authenticated;

alter table public.schlafnaechte
  add column if not exists score_version smallint not null default 2,
  add column if not exists score_konfidenz smallint,
  add column if not exists effizienz_punkte numeric(5,2),
  add column if not exists phasen_punkte numeric(5,2),
  add column if not exists score_komponenten jsonb;

alter table public.schlafnaechte
  drop constraint if exists schlafnaechte_bewertungsbasis_check;
alter table public.schlafnaechte
  add constraint schlafnaechte_bewertungsbasis_check
    check (bewertungsbasis between 1 and 100),
  add constraint schlafnaechte_score_version_check check (score_version = 2),
  add constraint schlafnaechte_score_konfidenz_check
    check (score_konfidenz between 1 and 100),
  add constraint schlafnaechte_effizienz_punkte_check
    check (effizienz_punkte is null or effizienz_punkte between 0 and 20),
  add constraint schlafnaechte_phasen_punkte_check
    check (phasen_punkte is null or phasen_punkte between 0 and 10),
  add constraint schlafnaechte_score_komponenten_check
    check (score_komponenten is null or jsonb_typeof(score_komponenten) = 'object');

create or replace function public.setze_schlaf_score_v2()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  a record;
  v_dauer numeric;
  v_effizienz numeric;
  v_phasen numeric;
  v_regel numeric;
  v_unterbrechung numeric;
  w_dauer numeric := 45;
  w_effizienz numeric := 0;
  w_phasen numeric := 0;
  w_regel numeric := 0;
  w_unterbrechung numeric := 0;
  p_dauer numeric;
  p_effizienz numeric;
  p_phasen numeric;
  p_regel numeric;
  p_unterbrechung numeric;
  v_spezifiziert numeric;
  v_klassifiziert numeric;
  v_basis numeric;
  v_summe numeric;
begin
  select * into a
  from public.schlaf_auswertung(new.rohsegmente, new.einschlafzeit)
  limit 1;

  v_dauer := 100 * least(1, greatest(0, new.schlaf_minuten / new.schlafziel_minuten));
  p_dauer := round(v_dauer * w_dauer / 100, 2);

  if a.bett_minuten is not null
     and a.bett_minuten >= new.schlaf_minuten
     and a.bett_minuten > 0 then
    w_effizienz := 20;
    v_effizienz := 100 * least(1, greatest(0,
      ((new.schlaf_minuten / a.bett_minuten * 100) - 75) / 20
    ));
    p_effizienz := round(v_effizienz * w_effizienz / 100, 2);
  end if;

  v_spezifiziert := coalesce(a.tief_minuten, 0)
    + coalesce(a.rem_minuten, 0) + coalesce(a.kern_minuten, 0);
  v_klassifiziert := v_spezifiziert + coalesce(a.unspez_minuten, 0);
  if v_spezifiziert > 0 and new.schlaf_minuten > 0 then
    w_phasen := 10 * least(1, greatest(0, v_klassifiziert / new.schlaf_minuten));
    v_phasen := 100 * least(1, greatest(0,
      ((coalesce(a.tief_minuten, 0) + coalesce(a.rem_minuten, 0)) / v_spezifiziert) / 0.25
    ));
    p_phasen := round(v_phasen * w_phasen / 100, 2);
  end if;

  if new.historie_naechte > 0 and new.median_abweichung_minuten is not null then
    w_regel := 15;
    v_regel := 100 * (1 - least(1, greatest(0, new.median_abweichung_minuten / 180)));
    p_regel := round(v_regel * w_regel / 100, 2);
  end if;

  if new.wachsegmente_vorhanden
     and new.wach_minuten is not null and new.wachphasen is not null then
    w_unterbrechung := 10;
    v_unterbrechung := 100 * (
      0.6 * (1 - least(1, greatest(0, new.wach_minuten / 30)))
      + 0.4 * (1 - least(1, greatest(0, new.wachphasen::numeric / 8)))
    );
    p_unterbrechung := round(v_unterbrechung * w_unterbrechung / 100, 2);
  end if;

  v_basis := round(w_dauer + w_effizienz + w_phasen + w_regel + w_unterbrechung, 2);
  v_summe := p_dauer + coalesce(p_effizienz, 0) + coalesce(p_phasen, 0)
    + coalesce(p_regel, 0) + coalesce(p_unterbrechung, 0);

  new.nachtwert := greatest(0, least(100, round(v_summe / v_basis * 100)));
  new.bewertungsbasis := greatest(1, least(100, round(v_basis)));
  new.score_version := 2;
  new.score_konfidenz := greatest(1, least(100, round(v_basis)));
  new.dauer_punkte := p_dauer;
  new.effizienz_punkte := p_effizienz;
  new.phasen_punkte := p_phasen;
  new.konsistenz_punkte := p_regel;
  new.unterbrechung_punkte := p_unterbrechung;
  new.score_komponenten := jsonb_build_object(
    'dauer', jsonb_build_object('wert', round(v_dauer, 2), 'gewicht', w_dauer, 'punkte', p_dauer),
    'effizienz', jsonb_build_object('wert', round(v_effizienz, 2), 'gewicht', w_effizienz, 'punkte', p_effizienz),
    'phasen', jsonb_build_object('wert', round(v_phasen, 2), 'gewicht', round(w_phasen, 2), 'punkte', p_phasen),
    'regelmaessigkeit', jsonb_build_object('wert', round(v_regel, 2), 'gewicht', w_regel, 'punkte', p_regel),
    'unterbrechungen', jsonb_build_object('wert', round(v_unterbrechung, 2), 'gewicht', w_unterbrechung, 'punkte', p_unterbrechung)
  );
  return new;
end;
$$;
revoke all on function public.setze_schlaf_score_v2() from public, anon, authenticated;

drop trigger if exists schlaf_score_v2 on public.schlafnaechte;
create trigger schlaf_score_v2
before insert or update of rohsegmente, einschlafzeit, schlaf_minuten,
  schlafziel_minuten, wach_minuten, wachphasen, median_abweichung_minuten,
  historie_naechte, wachsegmente_vorhanden
on public.schlafnaechte
for each row execute function public.setze_schlaf_score_v2();

-- Vorhandene Naechte ohne erneuten Health-Import nach v2 bewerten.
update public.schlafnaechte set schlaf_minuten = schlaf_minuten;

alter table public.schlafnaechte
  alter column score_konfidenz set not null,
  alter column score_komponenten set not null;

-- Nur ein redaktionelles Aenderungssignal geht ueber Realtime. Rohsegmente
-- bleiben in der geschuetzten Quelltabelle und werden nie zum Client gestreamt.
create table if not exists public.schlaf_updates (
  user_id uuid not null references public.profile(id) on delete cascade,
  nacht date not null,
  aktualisiert timestamptz not null default now(),
  primary key (user_id, nacht)
);

alter table public.schlaf_updates enable row level security;
revoke all on table public.schlaf_updates from public, anon, authenticated;
grant select on table public.schlaf_updates to authenticated;
create policy "schlaf updates lesen" on public.schlaf_updates
  for select to authenticated using (private.ist_duellprofil());

create or replace function public.melde_schlaf_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.schlaf_updates(user_id, nacht, aktualisiert)
  values (new.user_id, new.nacht, now())
  on conflict (user_id, nacht) do update set aktualisiert = excluded.aktualisiert;
  return new;
end;
$$;
revoke all on function public.melde_schlaf_update() from public, anon, authenticated;

drop trigger if exists schlaf_update_signal on public.schlafnaechte;
create trigger schlaf_update_signal
after insert or update on public.schlafnaechte
for each row execute function public.melde_schlaf_update();

insert into public.schlaf_updates(user_id, nacht, aktualisiert)
select user_id, nacht, aktualisiert from public.schlafnaechte
on conflict (user_id, nacht) do update set aktualisiert = excluded.aktualisiert;

do $$
begin
  alter publication supabase_realtime add table public.schlaf_updates;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.gewicht;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.aufenthalte;
exception when duplicate_object then null;
end $$;

-- Die Ansicht ist die einzige Health-Leseschicht fuer Clients. Sie enthaelt
-- Kennzahlen und Phasen, aber keine Rohsegmente. Die Mitgliedschaftspruefung
-- im View-Text begrenzt sie auf die zwei Profile dieses Projekts.
create or replace view public.schlafnaechte_ansicht
with (security_invoker = off) as
select
  n.user_id,
  n.nacht,
  n.schlaf_minuten,
  n.einschlafzeit,
  n.schlafziel_minuten,
  a.aufwachzeit,
  a.bett_start,
  a.bett_ende,
  a.bett_minuten,
  a.tief_minuten,
  a.rem_minuten,
  a.kern_minuten,
  a.unspez_minuten,
  a.wach_minuten,
  a.phasen,
  n.nachtwert,
  n.score_version,
  n.score_konfidenz,
  n.score_komponenten
from public.schlafnaechte n
cross join lateral public.schlaf_auswertung(n.rohsegmente, n.einschlafzeit) a
where private.ist_duellprofil();

revoke all on table public.schlafnaechte from public, anon, authenticated;
revoke all on table public.schlaf_import_tokens from public, anon, authenticated;
revoke all on table public.schlafnaechte_ansicht from public, anon, authenticated;
grant select on table public.schlafnaechte_ansicht to authenticated;

drop policy if exists "schlaf lesen" on public.schlafnaechte;
drop policy if exists "schlaf schreiben" on public.schlafnaechte;
drop policy if exists "schlaf aendern" on public.schlafnaechte;
drop policy if exists "schlaf loeschen" on public.schlafnaechte;

-- Der direkte Kurzbefehlsweg bleibt vorerst fuer anon erhalten. Angemeldete
-- Web-Clients brauchen die privilegierte Importfunktion nicht.
revoke execute on function public.record_sleep_night(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  from authenticated;

-- Alte Policies mit zeilenweiser auth.uid()-Auswertung auf die performante
-- InitPlan-Form bringen. Ihr Verhalten aendert sich nicht.
drop policy if exists "eintraege schreiben" on public.eintraege;
create policy "eintraege schreiben" on public.eintraege
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "eintraege loeschen" on public.eintraege;
create policy "eintraege loeschen" on public.eintraege
  for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "eintraege lesen" on public.eintraege;
create policy "eintraege lesen" on public.eintraege
  for select to authenticated using (private.ist_duellprofil());

drop policy if exists "profile lesen" on public.profile;
create policy "profile lesen" on public.profile
  for select to authenticated using (private.ist_duellprofil());

drop policy if exists "werte lesen" on public.werte;
create policy "werte lesen" on public.werte
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "werte schreiben" on public.werte;
create policy "werte schreiben" on public.werte
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "werte aendern" on public.werte;
create policy "werte aendern" on public.werte
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "werte loeschen" on public.werte;
create policy "werte loeschen" on public.werte
  for delete to authenticated using ((select auth.uid()) = user_id);
