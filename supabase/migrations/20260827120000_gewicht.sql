-- tägliches gewicht für beide profile. beide sehen beide, wie bei den ticks:
-- der vergleich ist der zweck. geschrieben wird nur die eigene zeile.
-- der wochentick fürs wiegen wird hieraus abgeleitet, nicht nach eintraege kopiert.
-- der check fängt vertipper ab (8 statt 80, 810 statt 81), nicht mehr.
create table gewicht (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  tag date not null,
  kg numeric(5,2) not null check (kg > 20 and kg < 400),
  erstellt timestamptz not null default now(),
  primary key (user_id, tag)
);

alter table gewicht enable row level security;

-- Die projektweiten Standardrechte sind breiter als diese Tabelle braucht.
-- Anonyme Nutzer bekommen gar keinen Zugriff; angemeldete Nutzer nur die vier
-- Operationen der App. Welche Zeilen erlaubt sind, begrenzen die Policies.
revoke all on table gewicht from anon;
revoke all on table gewicht from authenticated;
grant select, insert, update, delete on table gewicht to authenticated;

create policy "gewicht lesen" on gewicht
  for select to authenticated using (
    (select auth.uid()) in (select id from public.profile)
  );

create policy "gewicht schreiben" on gewicht
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- anders als eintraege braucht gewicht ein update: ein upsert mit nutzlast
-- schreibt sonst nicht. vorbild ist werte, nicht eintraege.
create policy "gewicht aendern" on gewicht
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "gewicht loeschen" on gewicht
  for delete to authenticated using ((select auth.uid()) = user_id);

create index gewicht_nutzer_tag_idx on gewicht (user_id, tag desc);

-- absichtlich nicht in supabase_realtime: gewicht trägt man einmal morgens ein.
