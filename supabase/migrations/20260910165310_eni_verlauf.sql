-- ENIs verlauf. Anders als alles andere in dieser Datenbank gehoert er genau
-- einer Person: erijon sieht korays chats nie und umgekehrt. Der
-- Zwei-Personen-Vergleich endet an der Tuer zu ENI, deshalb pruefen alle
-- Policies hier auth.uid() = user_id auch beim Lesen, nicht nur beim Schreiben.

create table public.eni_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- der titel ist die erste Vorlage, auf eine Zeile gekuerzt
  titel text not null default '' check (char_length(titel) <= 120),
  erstellt timestamptz not null default now(),
  zuletzt timestamptz not null default now()
);

create table public.eni_nachrichten (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.eni_chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rolle text not null check (rolle in ('eni','mensch')),
  text text not null check (char_length(text) between 1 and 8000),
  erstellt timestamptz not null default now()
);

alter table public.eni_chats enable row level security;
alter table public.eni_nachrichten enable row level security;

revoke all on table public.eni_chats from public, anon, authenticated;
revoke all on table public.eni_nachrichten from public, anon, authenticated;
grant select, insert, update, delete on table public.eni_chats to authenticated;
grant select, insert, delete on table public.eni_nachrichten to authenticated;

create policy "eni chats lesen" on public.eni_chats
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "eni chats anlegen" on public.eni_chats
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "eni chats aendern" on public.eni_chats
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eni chats loeschen" on public.eni_chats
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "eni nachrichten lesen" on public.eni_nachrichten
  for select to authenticated using ((select auth.uid()) = user_id);
-- Der Chat muss der schreibenden Person gehoeren. Sonst koennte man eine
-- Nachricht mit eigener user_id in einen fremden Chat haengen und ihn so
-- veraendern, ohne ihn je lesen zu koennen.
create policy "eni nachrichten schreiben" on public.eni_nachrichten
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.eni_chats c
      where c.id = chat_id and c.user_id = (select auth.uid())
    )
  );
create policy "eni nachrichten loeschen" on public.eni_nachrichten
  for delete to authenticated using ((select auth.uid()) = user_id);

create index eni_chats_nutzer_zuletzt_idx on public.eni_chats (user_id, zuletzt desc);
create index eni_nachrichten_chat_zeit_idx on public.eni_nachrichten (chat_id, erstellt);

-- Der Verlauf sortiert nach der letzten Nachricht. Das im Client zu setzen
-- waere ein zweiter Rundlauf je Vorlage und koennte zwischen Schreiben und
-- Nachziehen abbrechen; der Trigger kann das nicht.
create function public.eni_chat_beruehren()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.eni_chats set zuletzt = new.erstellt where id = new.chat_id;
  return new;
end;
$$;

create trigger eni_nachricht_beruehrt_chat
  after insert on public.eni_nachrichten
  for each row execute function public.eni_chat_beruehren();

-- Absichtlich nicht in supabase_realtime: ein chat wird auf einem geraet
-- gefuehrt, und ein zweiter Kanal je Person kostet Verbindung ohne Gewinn.
