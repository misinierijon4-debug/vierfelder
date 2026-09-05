-- `schlaf_updates` ist die einzige fuer App und Realtime sichtbare
-- Schlafprojektion. Der bisherige Signaltrigger lief nur bei INSERT/UPDATE:
-- Eine geloeschte Quellnacht blieb deshalb samt Gesundheitswerten in der
-- Projektion und wirkte auch nach einem Reload weiter wie eine echte Nacht.

create or replace function private.projiziere_schlaf_loeschung()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.schlaf_updates u
  using alte_schlafnaechte d
  where u.user_id = d.user_id
    and u.nacht = d.nacht;

  -- Der v3-Score verwendet die bis zu 13 vorherigen Einschlafzeiten. Wird
  -- eine Nacht entfernt, koennen deshalb genau die folgenden 13 Naechte eine
  -- andere Historienbasis erhalten. Das bestehende no-op-Update laesst den
  -- kanonischen Score- und Projektionstrigger diese Werte neu ableiten.
  with betroffene_naechte as (
    select distinct n.user_id, n.nacht
    from alte_schlafnaechte d
    cross join lateral (
      select s.user_id, s.nacht
      from public.schlafnaechte s
      where s.user_id = d.user_id
        and s.nacht > d.nacht
      order by s.nacht
      limit 13
    ) n
  )
  update public.schlafnaechte n
  set schlaf_minuten = n.schlaf_minuten
  from betroffene_naechte b
  where n.user_id = b.user_id
    and n.nacht = b.nacht;

  return null;
end;
$$;

revoke all on function private.projiziere_schlaf_loeschung()
  from public, anon, authenticated;

drop trigger if exists schlaf_quellloeschung_projektion
  on public.schlafnaechte;
create trigger schlaf_quellloeschung_projektion
after delete on public.schlafnaechte
referencing old table as alte_schlafnaechte
for each statement execute function private.projiziere_schlaf_loeschung();

comment on function private.projiziere_schlaf_loeschung() is
  'Loescht die sichtbare Projektion einer Quellnacht und bewertet die 13 abhaengigen Folgenaechte neu';
