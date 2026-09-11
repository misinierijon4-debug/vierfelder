-- ENIs Stimme, sofern eine echte dahintersteht.
--
-- Es gibt hier keine Tabelle, und das ist Absicht: eine gesprochene Antwort ist
-- kein eigener Inhalt, sondern eine Ableitung aus einer Zeile, die schon steht.
-- Der Pfad ergibt sich vollstaendig aus ihr:
--
--   <user_id>/<chat_id>/<nachricht_id>.wav
--
-- Damit ist die Frage „gibt es das schon" dieselbe wie „liegt die Datei da",
-- und der Cache braucht keine zweite Wahrheit, die mit der ersten aus dem Tritt
-- geraten koennte. Loescht jemand einen Chat, nimmt derselbe Aufraeumweg wie
-- bei den Bildanhaengen die Toene mit.
--
-- Der Bucket ist getrennt von eni-anhaenge, weil beides Verschiedenes ist: ein
-- Anhang ist etwas, das ein Mensch hergegeben hat, ein Ton ist etwas, das der
-- Server erzeugt hat und jederzeit wieder erzeugen koennte. Man darf Toene
-- wegwerfen, Anhaenge nicht.
--
-- WAV und nicht MP3, weil die Gegenstelle rohes PCM liefert und in einer
-- Deno-Function kein MP3-Kodierer steckt. Ein WAV-Kopf sind vierundvierzig
-- Byte, die man selbst schreiben kann; ein Kodierer waere eine Bibliothek fuer
-- eine Ersparnis, die auf dem freien Speicher dieses Projekts niemand merkt.
-- Der Preis dafuer steht in ENI-SCHLUESSEL.md: rund 48 KB je Sekunde.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'eni-stimme',
  'eni-stimme',
  false,
  26214400,
  array['audio/wav']
)
-- Nicht `do nothing`: dieser Bucket hiess in einer frueheren Fassung dieser
-- Datei einmal MP3 und war kleiner. Wurde sie schon angewandt, muss das hier
-- ihn zurechtruecken statt ihn stehen zu lassen.
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "eni stimme lesen" on storage.objects;
drop policy if exists "eni stimme schreiben" on storage.objects;
drop policy if exists "eni stimme loeschen" on storage.objects;

create policy "eni stimme lesen" on storage.objects
  for select to authenticated using (
    bucket_id = 'eni-stimme'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Schreiben darf das angemeldete Konto, weil die Edge Function unter dessen
-- Token arbeitet. Sie ist die einzige Stelle, die hier je etwas ablegt: der
-- Client kennt den Weg zur Gegenstelle nicht und bekommt nur eine fertige
-- Adresse.
create policy "eni stimme schreiben" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'eni-stimme'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "eni stimme loeschen" on storage.objects
  for delete to authenticated using (
    bucket_id = 'eni-stimme'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
