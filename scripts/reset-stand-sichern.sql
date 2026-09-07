-- Sicherung vor dem Zurücksetzen. Gibt genau die Tabellen als JSON zurück, die
-- `reset-stand.sql` leert. Ändert nichts.
--
-- Die Ausgabe wird als Datei abgelegt, bevor gelöscht wird. Sie ist die
-- Rückfahrkarte: ein `delete` ohne diese Datei ist endgültig.
--
-- Eine Tabelle je Anweisung, nicht alles in einem Objekt. Am 07.09.2026 ergab
-- die Gesamtausgabe rund 348 kB, davon der weitaus grösste Teil `schlafnaechte`
-- und `schlaf_updates`. Getrennte Anweisungen bleiben handhabbar und lassen
-- sich einzeln in eine Datei schreiben.

select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as wochenabrechnung from public.wochenabrechnung t;
select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as duell_wetten      from public.duell_wetten t;
select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as einheiten         from public.einheiten t;
select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as eintraege         from public.eintraege t;
select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as werte             from public.werte t;
select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as gewicht           from public.gewicht t;
select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as aufenthalte       from public.aufenthalte t;
select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as schlafnaechte     from public.schlafnaechte t;
select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as schlaf_updates    from public.schlaf_updates t;
