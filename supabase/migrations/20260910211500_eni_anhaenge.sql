-- Was man ENI mitgibt, ausser Worten: Bilder und Dateien.
--
-- Zwei Arten, zwei Wege, und die Trennung ist keine Formsache:
--
--   'bild'  liegt im Bucket eni-anhaenge. Bilder gehoeren nicht in eine
--           Textspalte; base64 in Postgres blaeht jede Zeile auf und macht
--           jedes select teuer, das die Bilder gar nicht braucht.
--   'text'  liegt hier in der Zeile. Aus einer .md oder .csv wird beim
--           Anhaengen der reine Text gelesen, und der ist klein. Ihn in den
--           Bucket zu legen hiesse, ihn fuer jede Modellvorlage wieder
--           herunterzuladen.
--
-- Die Zeilen schreibt ausschliesslich die Edge Function, zusammen mit der
-- Nachricht, zu der sie gehoeren. Der Client laedt nur die Bilddatei hoch und
-- nennt ihren Pfad. Deshalb gibt es hier keine insert-Policy fuer
-- authenticated: was ENI gesehen hat, behauptet kein Client.

-- Ein Bild allein ist eine Vorlage. Wer ein Foto hinhaelt, hat damit genug
-- gesagt, und ENI kann nachfragen, was er wissen will. Bisher verlangte die
-- Spalte mindestens ein Zeichen; die Untergrenze faellt, die Obergrenze
-- bleibt. Fuer ENIs eigene Zeilen aendert das nichts: eine leere Antwort faengt
-- die Function schon vorher ab und meldet sie als Fehler.
alter table public.eni_nachrichten drop constraint eni_nachrichten_text_check;
alter table public.eni_nachrichten
  add constraint eni_nachrichten_text_check check (char_length(text) <= 8000);

create table public.eni_anhaenge (
  id uuid primary key default gen_random_uuid(),
  nachricht_id uuid not null references public.eni_nachrichten(id) on delete cascade,
  chat_id uuid not null references public.eni_chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  art text not null check (art in ('bild','text')),
  -- der dateiname, wie er auf dem geraet hiess. nur zum anzeigen.
  name text not null check (char_length(name) between 1 and 200),
  -- bild: der pfad im bucket, immer <user_id>/<chat_id>/<zufall>.<endung>
  pfad text check (pfad is null or char_length(pfad) <= 400),
  -- text: der ausgelesene inhalt, gekuerzt schon beim anhaengen
  inhalt text check (inhalt is null or char_length(inhalt) <= 20000),
  -- byte der originaldatei, fuer die zeile unter dem namen
  groesse integer not null default 0 check (groesse >= 0),
  erstellt timestamptz not null default now(),
  -- genau eines von beiden, nie beides und nie keines
  constraint eni_anhang_bild_hat_pfad check ((art = 'bild') = (pfad is not null)),
  constraint eni_anhang_text_hat_inhalt check ((art = 'text') = (inhalt is not null))
);

alter table public.eni_anhaenge enable row level security;

revoke all on table public.eni_anhaenge from public, anon, authenticated;
-- kein insert und kein update: siehe oben. Loeschen darf man, was einem
-- gehoert, damit ein Chat restlos verschwinden kann.
grant select, delete on table public.eni_anhaenge to authenticated;

create policy "eni anhaenge lesen" on public.eni_anhaenge
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "eni anhaenge loeschen" on public.eni_anhaenge
  for delete to authenticated using ((select auth.uid()) = user_id);

create index eni_anhaenge_nachricht_idx on public.eni_anhaenge (nachricht_id);
create index eni_anhaenge_chat_idx on public.eni_anhaenge (chat_id);

-- Der Bucket. Nicht oeffentlich: ein Bild aus einem ENI-Chat ist so privat wie
-- der Satz daneben, und der Zwei-Personen-Vergleich endet an der Tuer zu ENI.
-- Das Modell bekommt es trotzdem zu sehen, aber ueber eine signierte Adresse
-- mit kurzer Frist, die die Edge Function ausstellt.
--
-- Die Groessengrenze steht hier und nicht nur im Client: ein Client kann
-- luegen, der Bucket nicht. Acht MiB sind reichlich fuer ein Foto, das vorher
-- ohnehin auf 1280 Pixel heruntergerechnet wurde.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'eni-anhaenge',
  'eni-anhaenge',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Der erste Ordner im Pfad ist die user_id. Damit gilt fuer Dateien dieselbe
-- Regel wie fuer Zeilen: jeder sieht nur seine eigenen.
create policy "eni anhaenge datei lesen" on storage.objects
  for select to authenticated using (
    bucket_id = 'eni-anhaenge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "eni anhaenge datei schreiben" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'eni-anhaenge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "eni anhaenge datei loeschen" on storage.objects
  for delete to authenticated using (
    bucket_id = 'eni-anhaenge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Kein update: eine hochgeladene Vorlage wird nicht nachtraeglich ausgetauscht.
-- Sonst koennte im Verlauf ein anderes Bild stehen als das, ueber das ENI
-- geurteilt hat.
