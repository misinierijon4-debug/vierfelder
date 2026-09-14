-- Was ENI selbst im Web gefunden hat, damit er es eine Nachricht spaeter noch
-- weiss.
--
-- Bisher lagen die Auszuege nur in dem einen Modellaufruf, in dem gesucht
-- wurde. Im Verlauf blieben danach bloss die Links in der Antwort stehen, und
-- die sagen nichts darueber, was auf den Seiten stand. ENI benutzte seine
-- Quellen also genau einmal und wusste in der naechsten Nachricht nicht mehr,
-- dass er sie je hatte.
--
-- Die Zeilen schreibt ausschliesslich die Edge Function, und zwar mit
-- service_role: dieselbe Entscheidung wie bei `eni_anhaenge`. Was ENI gelesen
-- hat, soll kein Client behaupten koennen, und die Function laeuft sonst unter
-- dem Token des Aufrufers. Deshalb gibt es hier kein Insert fuer
-- authenticated.
--
-- Geloescht werden darf, was einem gehoert, damit ein Chat restlos
-- verschwinden kann; ueber die beiden Fremdschluessel faellt ohnehin alles
-- mit, sobald die Nachricht oder der Chat geht.
create table public.eni_quellen (
  id uuid primary key default gen_random_uuid(),
  -- die ENI-Antwort, zu der dieser Suchlauf gehoert
  nachricht_id uuid not null references public.eni_nachrichten(id) on delete cascade,
  chat_id uuid not null references public.eni_chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- die Reihenfolge, in der die Suche sie geliefert hat
  nr smallint not null check (nr between 1 and 5),
  url text not null check (char_length(url) between 1 and 2000),
  titel text not null check (char_length(titel) between 1 and 200),
  -- der Seitenauszug aus der url_citation, schon bei der Suche gekuerzt
  auszug text not null check (char_length(auszug) between 1 and 3000),
  erstellt timestamptz not null default now(),
  -- dieselbe Seite steht an einer Antwort nur einmal
  constraint eni_quellen_je_nachricht_einmal unique (nachricht_id, url)
);

alter table public.eni_quellen enable row level security;

revoke all on table public.eni_quellen from public, anon, authenticated;
-- kein insert und kein update: siehe oben.
grant select, delete on table public.eni_quellen to authenticated;
grant insert on table public.eni_quellen to service_role;

create policy "eni quellen lesen" on public.eni_quellen
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "eni quellen loeschen" on public.eni_quellen
  for delete to authenticated using ((select auth.uid()) = user_id);

create index eni_quellen_nachricht_idx on public.eni_quellen (nachricht_id);
-- Der Rueckblick liest je Chat und nimmt die juengsten zuerst.
create index eni_quellen_chat_idx on public.eni_quellen (chat_id, erstellt desc);
