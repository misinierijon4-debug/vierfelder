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

alter table profile enable row level security;
alter table eintraege enable row level security;
alter table werte enable row level security;

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

-- realtime nur auf den ticks. werte gehen nie über den kanal.
alter publication supabase_realtime add table eintraege;

-- eingespielt am 26.08.2026 in projekt ogxwazageufvalkocywh (eu-central-1).
--
-- nach dem anlegen der beiden konten (dashboard > authentication > add user,
-- bei beiden "auto confirm user" anhaken) einmal ausführen:
--
--   insert into profile (id, person)
--   select id,
--          case when email = 'DEINE@mail' then 'erijon' else 'koray' end
--   from auth.users;
