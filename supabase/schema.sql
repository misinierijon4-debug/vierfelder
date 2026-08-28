-- vierfelder: schema für genau zwei konten.
-- ausführen im supabase sql editor, sobald das projekt steht.

-- ordnet ein konto einer der beiden personen zu. die farbe hängt an der person,
-- nicht am konto, deshalb steht hier der schlüssel und kein freitext.
create table if not exists profile (
  id uuid primary key references auth.users on delete cascade,
  person text not null unique check (person in ('erijon','koray'))
);

-- der tick. beide sehen beide. das ist die vergleichsgrundlage.
create table if not exists eintraege (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  bereich text not null check (bereich in ('lernen','gym','boxen','lesen')),
  tag date not null,
  erstellt timestamptz not null default now(),
  primary key (user_id, bereich, tag)
);

-- minuten und seiten. gehören nur dem eigenen nutzer, deshalb eine eigene tabelle:
-- eine spalte lässt sich per rls nicht verstecken, eine tabelle schon.
create table if not exists werte (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  bereich text not null check (bereich in ('lernen','gym','boxen','lesen')),
  tag date not null,
  wert int not null check (wert >= 0),
  primary key (user_id, bereich, tag)
);

-- eine zeile pro person und nacht. `nacht` ist der lokale kalendertag, an dem
-- der schlaf endet. die rohen kurzbefehlsfelder bleiben für spätere
-- neuberechnungen erhalten; in-bed wird bei der dauer nicht mitgezählt.
create table if not exists schlafnaechte (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  nacht date not null,
  schlaf_minuten numeric(7,2) not null check (schlaf_minuten >= 0),
  einschlafzeit timestamptz not null,
  wachphasen int check (wachphasen is null or wachphasen >= 0),
  wach_minuten numeric(7,2) check (wach_minuten is null or wach_minuten >= 0),
  nachtwert smallint not null check (nachtwert between 0 and 100),
  bewertungsbasis smallint not null check (bewertungsbasis in (80, 100)),
  dauer_punkte numeric(5,2) not null check (dauer_punkte between 0 and 50),
  konsistenz_punkte numeric(5,2) check (konsistenz_punkte is null or konsistenz_punkte between 0 and 30),
  unterbrechung_punkte numeric(5,2) check (unterbrechung_punkte is null or unterbrechung_punkte between 0 and 20),
  median_abweichung_minuten numeric(7,2) check (median_abweichung_minuten is null or median_abweichung_minuten >= 0),
  historie_naechte smallint not null check (historie_naechte between 0 and 13),
  schlafziel_minuten smallint not null check (schlafziel_minuten between 240 and 720),
  wachsegmente_vorhanden boolean not null,
  quellen text[] not null default '{}',
  rohsegmente jsonb not null check (jsonb_typeof(rohsegmente) = 'array'),
  aktualisiert timestamptz not null default now(),
  primary key (user_id, nacht)
);

-- tägliches gewicht. beide sehen beide, wie bei den ticks: der vergleich ist der
-- zweck. der wochentick fürs wiegen wird hieraus abgeleitet, nicht nach eintraege
-- kopiert — sonst gäbe es zwei quellen und einen tick ohne messung.
-- der check fängt vertipper ab (8 statt 80, 810 statt 81), nicht mehr.
create table if not exists gewicht (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  tag date not null,
  kg numeric(5,2) not null check (kg > 20 and kg < 400),
  erstellt timestamptz not null default now(),
  primary key (user_id, tag)
);

-- dauerhafte Kurzbefehls-Tokens liegen nur gehasht vor. Für diese Tabelle gibt
-- es absichtlich keine RLS-Policy; nur die Edge Function mit service_role liest.
create extension if not exists pgcrypto with schema extensions;
create table if not exists schlaf_import_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  token_hash text not null unique,
  aktiv boolean not null default true,
  erstellt timestamptz not null default now()
);

alter table profile enable row level security;
alter table eintraege enable row level security;
alter table werte enable row level security;
alter table schlafnaechte enable row level security;
alter table gewicht enable row level security;
alter table schlaf_import_tokens enable row level security;

revoke all on table gewicht from anon;
revoke all on table gewicht from authenticated;
grant select, insert, update, delete on table gewicht to authenticated;

create policy "profile lesen" on profile
  for select to authenticated using (true);

create policy "eintraege lesen" on eintraege
  for select to authenticated using (true);

create policy "eintraege schreiben" on eintraege
  for insert to authenticated with check (auth.uid() = user_id);

create policy "eintraege loeschen" on eintraege
  for delete to authenticated using (auth.uid() = user_id);

-- kein update auf eintraege: ein eintrag existiert oder nicht.

create policy "werte lesen" on werte
  for select to authenticated using (auth.uid() = user_id);

create policy "werte schreiben" on werte
  for insert to authenticated with check (auth.uid() = user_id);

create policy "werte aendern" on werte
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "werte loeschen" on werte
  for delete to authenticated using (auth.uid() = user_id);

create policy "schlaf lesen" on schlafnaechte
  for select to authenticated using (true);

create policy "schlaf schreiben" on schlafnaechte
  for insert to authenticated with check (auth.uid() = user_id);

create policy "schlaf aendern" on schlafnaechte
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "schlaf loeschen" on schlafnaechte
  for delete to authenticated using (auth.uid() = user_id);

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

-- Im SQL Editor einmal pro Person mit einem zufälligen Token aufrufen. Die
-- Funktion ist für anon/authenticated nicht ausführbar und speichert nur SHA-256.
create or replace function set_schlaf_import_token(p_person text, p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  if length(p_token) < 32 then
    raise exception 'token muss mindestens 32 zeichen lang sein';
  end if;

  select id into v_user_id from profile where person = p_person;
  if v_user_id is null then
    raise exception 'profil nicht gefunden';
  end if;

  insert into schlaf_import_tokens (user_id, token_hash, aktiv)
  values (v_user_id, encode(digest(p_token, 'sha256'), 'hex'), true)
  on conflict (user_id) do update
    set token_hash = excluded.token_hash,
        aktiv = true,
        erstellt = now();
end;
$$;

revoke all on function set_schlaf_import_token(text, text) from public, anon, authenticated;

create index if not exists schlafnaechte_nutzer_nacht_idx
  on schlafnaechte (user_id, nacht desc);

create index if not exists gewicht_nutzer_tag_idx
  on gewicht (user_id, tag desc);

-- realtime nur auf den ticks. werte, schlaf und gewicht gehen nie über den kanal.
alter publication supabase_realtime add table eintraege;

-- gemessene aufenthalte an einem trainingsort (nachtrag 28.08.2026). eine zeile
-- pro besuch: die ankunft legt sie an, der abgang schliesst sie. beides schickt
-- eine standort-automation vom iphone. der wochentick für gym und boxen wird
-- hieraus abgeleitet wie beim gewicht aus der messung — nach eintraege kopiert
-- wird nichts. schreiben darf nur record_aufenthalt; ohne insert-recht kann die
-- app keine messung erfinden, und genau das macht eine messung mehr wert als
-- einen tick. der vollständige aufbau steht in
-- supabase/migrations/20260828160000_aufenthalte.sql.
create table if not exists aufenthalte (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  bereich text not null check (bereich in ('gym','boxen')),
  ort text not null check (length(btrim(ort)) between 1 and 40),
  ankunft timestamptz not null,
  abgang timestamptz check (abgang is null or abgang > ankunft),
  aktualisiert timestamptz not null default now()
);

alter table aufenthalte enable row level security;

revoke all on table aufenthalte from anon;
revoke all on table aufenthalte from authenticated;
grant select on table aufenthalte to authenticated;

create policy "aufenthalte lesen" on aufenthalte
  for select to authenticated using (
    (select auth.uid()) in (select id from public.profile)
  );

create unique index if not exists aufenthalte_offen_idx
  on aufenthalte (user_id, ort) where abgang is null;

create index if not exists aufenthalte_nutzer_ankunft_idx
  on aufenthalte (user_id, ankunft desc);

-- eingespielt am 26.08.2026 in projekt ogxwazageufvalkocywh (eu-central-1).
--
-- nach dem anlegen der beiden konten (dashboard > authentication > add user,
-- bei beiden "auto confirm user" anhaken) einmal ausführen:
--
--   insert into profile (id, person)
--   select id,
--          case when email = 'DEINE@mail' then 'erijon' else 'koray' end
--   from auth.users;
