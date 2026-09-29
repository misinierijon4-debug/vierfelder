-- Segmentgrenze fuer den Schlafimport wieder auf 300.
--
-- 20260925100000_schlaf_alle_naechte.sql hatte sie fuer den einmaligen
-- Nachtrag ueber drei Tage auf 1500 gesetzt. Der Nachtrag ist am 25.09.2026
-- durch (erijon, Naechte 2026-09-23 und 2026-09-24). Der taegliche Lauf
-- schickt eine bis zwei Naechte und bleibt weit darunter.

create or replace function public._slfn_max_segmente()
returns int
language sql
immutable
as $$ select 300 $$;

revoke all on function public._slfn_max_segmente() from public, anon, authenticated;
