-- Der Linter hat recht: eine Funktion ohne festen search_path laesst sich
-- ueber den Suchpfad des Aufrufers beeinflussen. Sie benutzt nur eingebaute
-- Ausdruecke, also reicht pg_catalog.
--
-- Angewendet am 01.09.2026 um 17:09:37 UTC.
create or replace function private.nachtminute(ts timestamptz)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
  select case when m < 900 then m + 1440 else m end
  from (
    select extract(hour from ts at time zone 'Europe/Berlin') * 60
         + extract(minute from ts at time zone 'Europe/Berlin') as m
  ) q
$$;
revoke all on function private.nachtminute(timestamptz) from public, anon, authenticated;
