-- Zählt vor und nach dem Zurücksetzen dieselben Tabellen. Vorher ist das die
-- Sicherungsnotiz, nachher der Beleg. Ändert nichts.

select 'geleert' as gruppe, 'wochenabrechnung' as tabelle, count(*) as zeilen from public.wochenabrechnung
union all select 'geleert', 'duell_wetten',      count(*) from public.duell_wetten
union all select 'geleert', 'einheiten',         count(*) from public.einheiten
union all select 'geleert', 'eintraege',         count(*) from public.eintraege
union all select 'geleert', 'werte',             count(*) from public.werte
union all select 'geleert', 'gewicht',           count(*) from public.gewicht
union all select 'geleert', 'schlafnaechte',     count(*) from public.schlafnaechte
union all select 'geleert', 'schlaf_updates',    count(*) from public.schlaf_updates
union all select 'geleert', 'aufenthalte (abgeschlossen)',
  count(*) from public.aufenthalte where abgang is not null
union all select 'bleibt', 'aufenthalte (offen)',
  count(*) from public.aufenthalte where abgang is null
union all select 'bleibt', 'profile',                   count(*) from public.profile
union all select 'bleibt', 'faecher',                   count(*) from public.faecher
union all select 'bleibt', 'noten',                     count(*) from public.noten
union all select 'bleibt', 'push_abos',                 count(*) from public.push_abos
union all select 'bleibt', 'schlaf_import_tokens',      count(*) from public.schlaf_import_tokens
union all select 'bleibt', 'erinnerungs_einstellungen', count(*) from public.erinnerungs_einstellungen
union all select 'bleibt', 'erinnerungs_versand',       count(*) from public.erinnerungs_versand
union all select 'bleibt', 'kurzbefehl_laeufe',         count(*) from public.kurzbefehl_laeufe
order by gruppe desc, tabelle;
