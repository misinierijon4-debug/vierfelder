-- Rohdaten bleiben in schlafnaechte. Diese kleine, per Trigger gepflegte
-- Projektion enthaelt nur die Kennzahlen, die beide Duellpartner sehen sollen.
-- Dadurch braucht die Client-View keine SECURITY DEFINER-Rechte mehr.

alter table public.schlaf_updates
  add column if not exists schlaf_minuten numeric(7,2),
  add column if not exists einschlafzeit timestamptz,
  add column if not exists schlafziel_minuten smallint,
  add column if not exists aufwachzeit timestamptz,
  add column if not exists bett_start timestamptz,
  add column if not exists bett_ende timestamptz,
  add column if not exists bett_minuten numeric,
  add column if not exists tief_minuten numeric,
  add column if not exists rem_minuten numeric,
  add column if not exists kern_minuten numeric,
  add column if not exists unspez_minuten numeric,
  add column if not exists wach_minuten numeric,
  add column if not exists phasen jsonb,
  add column if not exists nachtwert smallint,
  add column if not exists score_version smallint,
  add column if not exists score_konfidenz smallint,
  add column if not exists score_komponenten jsonb;

create or replace function public.melde_schlaf_update()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  a record;
begin
  select * into a
  from public.schlaf_auswertung(new.rohsegmente, new.einschlafzeit)
  limit 1;

  insert into public.schlaf_updates(
    user_id, nacht, aktualisiert, schlaf_minuten, einschlafzeit,
    schlafziel_minuten, aufwachzeit, bett_start, bett_ende, bett_minuten,
    tief_minuten, rem_minuten, kern_minuten, unspez_minuten, wach_minuten,
    phasen, nachtwert, score_version, score_konfidenz, score_komponenten
  ) values (
    new.user_id, new.nacht, now(), new.schlaf_minuten, new.einschlafzeit,
    new.schlafziel_minuten, a.aufwachzeit, a.bett_start, a.bett_ende, a.bett_minuten,
    a.tief_minuten, a.rem_minuten, a.kern_minuten, a.unspez_minuten, a.wach_minuten,
    a.phasen, new.nachtwert, new.score_version, new.score_konfidenz, new.score_komponenten
  )
  on conflict (user_id, nacht) do update set
    aktualisiert = excluded.aktualisiert,
    schlaf_minuten = excluded.schlaf_minuten,
    einschlafzeit = excluded.einschlafzeit,
    schlafziel_minuten = excluded.schlafziel_minuten,
    aufwachzeit = excluded.aufwachzeit,
    bett_start = excluded.bett_start,
    bett_ende = excluded.bett_ende,
    bett_minuten = excluded.bett_minuten,
    tief_minuten = excluded.tief_minuten,
    rem_minuten = excluded.rem_minuten,
    kern_minuten = excluded.kern_minuten,
    unspez_minuten = excluded.unspez_minuten,
    wach_minuten = excluded.wach_minuten,
    phasen = excluded.phasen,
    nachtwert = excluded.nachtwert,
    score_version = excluded.score_version,
    score_konfidenz = excluded.score_konfidenz,
    score_komponenten = excluded.score_komponenten;
  return new;
end;
$$;
revoke all on function public.melde_schlaf_update() from public, anon, authenticated;

insert into public.schlaf_updates(
  user_id, nacht, aktualisiert, schlaf_minuten, einschlafzeit,
  schlafziel_minuten, aufwachzeit, bett_start, bett_ende, bett_minuten,
  tief_minuten, rem_minuten, kern_minuten, unspez_minuten, wach_minuten,
  phasen, nachtwert, score_version, score_konfidenz, score_komponenten
)
select
  n.user_id, n.nacht, n.aktualisiert, n.schlaf_minuten, n.einschlafzeit,
  n.schlafziel_minuten, a.aufwachzeit, a.bett_start, a.bett_ende, a.bett_minuten,
  a.tief_minuten, a.rem_minuten, a.kern_minuten, a.unspez_minuten, a.wach_minuten,
  a.phasen, n.nachtwert, n.score_version, n.score_konfidenz, n.score_komponenten
from public.schlafnaechte n
cross join lateral public.schlaf_auswertung(n.rohsegmente, n.einschlafzeit) a
on conflict (user_id, nacht) do update set
  aktualisiert = excluded.aktualisiert,
  schlaf_minuten = excluded.schlaf_minuten,
  einschlafzeit = excluded.einschlafzeit,
  schlafziel_minuten = excluded.schlafziel_minuten,
  aufwachzeit = excluded.aufwachzeit,
  bett_start = excluded.bett_start,
  bett_ende = excluded.bett_ende,
  bett_minuten = excluded.bett_minuten,
  tief_minuten = excluded.tief_minuten,
  rem_minuten = excluded.rem_minuten,
  kern_minuten = excluded.kern_minuten,
  unspez_minuten = excluded.unspez_minuten,
  wach_minuten = excluded.wach_minuten,
  phasen = excluded.phasen,
  nachtwert = excluded.nachtwert,
  score_version = excluded.score_version,
  score_konfidenz = excluded.score_konfidenz,
  score_komponenten = excluded.score_komponenten;

alter table public.schlaf_updates
  alter column schlaf_minuten set not null,
  alter column einschlafzeit set not null,
  alter column schlafziel_minuten set not null,
  alter column tief_minuten set not null,
  alter column rem_minuten set not null,
  alter column kern_minuten set not null,
  alter column unspez_minuten set not null,
  alter column wach_minuten set not null,
  alter column phasen set not null,
  alter column nachtwert set not null,
  alter column score_version set not null,
  alter column score_konfidenz set not null,
  alter column score_komponenten set not null;

create index if not exists schlaf_updates_nacht_idx
  on public.schlaf_updates(nacht desc);

create or replace view public.schlafnaechte_ansicht
with (security_invoker = on) as
select
  user_id, nacht, schlaf_minuten, einschlafzeit, schlafziel_minuten,
  aufwachzeit, bett_start, bett_ende, bett_minuten,
  tief_minuten, rem_minuten, kern_minuten, unspez_minuten, wach_minuten,
  phasen, nachtwert, score_version, score_konfidenz, score_komponenten
from public.schlaf_updates;

revoke all on table public.schlafnaechte_ansicht from public, anon, authenticated;
grant select on table public.schlafnaechte_ansicht to authenticated;

-- Die Fokus-Edge-Function ruft diese Funktion anonym mit ihrem Import-Token
-- auf. Ein angemeldeter Web-Client braucht die privilegierte RPC nicht.
revoke execute on function public.record_aufenthalt(jsonb, jsonb, jsonb, jsonb, jsonb)
  from authenticated;
