-- Ein Push-Abo ist die Adresse eines Geraets, kein Inhalt.
--
-- Deshalb ist diese Tabelle die einzige im Projekt, in die der andere nicht
-- hineinsieht: Ticks, Gewicht und Schlaf teilen die beiden absichtlich, aber
-- der Endpunkt eines iPhones ist ein Zustellweg. Wer ihn hat und den privaten
-- VAPID-Schluessel kennt, kann diesem Geraet Nachrichten schicken.
--
-- Ein Mensch hat mehrere Geraete, jedes Geraet genau ein Abo. Der Endpunkt ist
-- der Schluessel, weil ihn der Browser vergibt und weil derselbe Endpunkt nie
-- zwei Geraeten gehoert. Legt der Browser das Abo neu an (App geloescht,
-- Erlaubnis zurueckgenommen), entsteht eine neue Zeile; die alte raeumt der
-- Sender weg, sobald der Push-Dienst sie mit 404 oder 410 abweist.
create table push_abos (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) <= 800),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  -- oeffentlicher schluessel des geraets (65 byte) und abo-geheimnis (16 byte),
  -- beide base64url. die laengen sind vom format vorgegeben, nicht geraten.
  p256dh text not null check (char_length(p256dh) between 86 and 88),
  auth text not null check (char_length(auth) between 22 and 24),
  -- freitext aus dem browser, damit man in der liste erkennt, welches geraet
  -- gemeint ist. rein informativ.
  geraet text check (geraet is null or char_length(geraet) <= 120),
  erstellt timestamptz not null default now(),
  gesehen timestamptz not null default now()
);

alter table push_abos enable row level security;

revoke all on table push_abos from anon;
revoke all on table push_abos from authenticated;
grant select, insert, update, delete on table push_abos to authenticated;

-- vier mal dieselbe bedingung: nur die eigenen zeilen. anders als bei gewicht
-- gibt es hier bewusst kein gemeinsames lesen.
create policy "push abos lesen" on push_abos
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "push abos anlegen" on push_abos
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "push abos aendern" on push_abos
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "push abos loeschen" on push_abos
  for delete to authenticated using ((select auth.uid()) = user_id);

create index push_abos_nutzer_idx on push_abos (user_id);

-- absichtlich nicht in supabase_realtime: niemand schaut einer abo-liste zu.
