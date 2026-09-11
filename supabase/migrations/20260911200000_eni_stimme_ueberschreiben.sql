-- Ein Ton darf ueberschrieben werden, sonst scheitert das zweite Mal.
--
-- Die Function legt den Ton mit `upsert: true` ab, und zwar mit Absicht: wer
-- zweimal auf den Knopf tippt, weil es beim ersten Mal dauert, loest zwei
-- Aufnahmen fuer dieselbe Nachricht aus. Derselbe Pfad heisst ohnehin derselbe
-- Ton; ihn zu ueberschreiben kann nichts kaputtmachen.
--
-- Nur: `upsert` ist bei Storage ein UPDATE, und dafuer gab es hier keine
-- Regel. Lag die Datei schon da, verweigerte die Zeilenpolitik das Ablegen,
-- die Function antwortete 502 und der Mensch hoerte wieder die Geraetestimme —
-- bei jedem Versuch aufs Neue, weil die Datei ja liegen blieb.
--
-- Dieselbe Bedingung wie beim Schreiben und Lesen: nur im eigenen Ordner.

drop policy if exists "eni stimme ueberschreiben" on storage.objects;

create policy "eni stimme ueberschreiben" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'eni-stimme'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'eni-stimme'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
