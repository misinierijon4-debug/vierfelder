-- Die Bettzeit einer Nacht liegt in den Rohsegmenten der Nacht davor.
--
-- Der Kurzbefehl schickt ein Fenster von rund 24 Stunden, gemessen am Morgen.
-- Darin steckt das InBed-Segment der Nacht, die gerade zu Ende ging — aber die
-- Zeile, unter der es landet, ist die Nacht davor, weil sie nach ihrer eigenen
-- Einschlafzeit benannt wird. Gemessen:
--
--   zeile 2026-08-26 (einschlaf 26.08. 00:14)  enthaelt InBed 26.08. 23:37 – 27.08. 07:15
--   zeile 2026-08-27 (einschlaf 27.08. 00:32)  enthaelt InBed 27.08. 23:54 – 28.08. 08:38
--
-- Die 16-Stunden-Regel in schlaf_auswertung wirft das jeweils fremde InBed
-- korrekt aus der eigenen Auswertung — nur reichte es bisher niemand an die
-- Nacht weiter, zu der es gehoert. Ergebnis: bett_minuten blieb immer null, das
-- Frontend fiel auf die Schlafspanne zurueck und die Effizienz war zu hoch
-- (gemessen 98 statt 85 Prozent, weil die 55 Minuten Wachliegen vor dem
-- Einschlafen fehlten).
--
-- Die Ansicht buendelt darum die Rohsegmente der Nacht mit denen der beiden
-- Nachbarnaechte, bevor sie auswertet. schlaf_auswertung bleibt unveraendert:
-- ihr Zeitfenster (nach dem Einschlafen, hoechstens 16 Stunden danach) schneidet
-- alles Fremde ohnehin weg, und die Vereinigung ueber Multiranges macht doppelt
-- gelieferte Segmente zu einem einzigen.
create or replace view schlafnaechte_ansicht
with (security_invoker = on) as
select
  n.user_id,
  n.nacht,
  n.schlaf_minuten,
  n.einschlafzeit,
  n.schlafziel_minuten,
  a.aufwachzeit,
  a.bett_start,
  a.bett_ende,
  a.bett_minuten,
  a.tief_minuten,
  a.rem_minuten,
  a.kern_minuten,
  a.unspez_minuten,
  a.wach_minuten,
  a.phasen
from schlafnaechte n
cross join lateral (
  select coalesce(jsonb_agg(s), '[]'::jsonb) as roh
  from schlafnaechte nb, jsonb_array_elements(nb.rohsegmente) q(s)
  where nb.user_id = n.user_id
    and nb.nacht between n.nacht - 1 and n.nacht + 1
    and jsonb_typeof(nb.rohsegmente) = 'array'
) gebuendelt
cross join lateral schlaf_auswertung(gebuendelt.roh, n.einschlafzeit) a;

grant select on schlafnaechte_ansicht to authenticated;
