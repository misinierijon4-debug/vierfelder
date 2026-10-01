-- Sicherung vor dem Zurücksetzen: eine vollständige Kopie der Nutzdaten in ein
-- eigenes Schema derselben Datenbank. Ändert kein App-Objekt — keine Tabelle,
-- Funktion, kein Trigger, keine Policy, kein Grant der App.
--
-- Warum in der Datenbank und nicht als JSON-Datei: die Ausgabe aller Tabellen
-- lag am 07.09.2026 bei rund 348 kB, weit überwiegend `schlafnaechte` und
-- `schlaf_updates`. Eine Kopie über `create table as select` ist exakt,
-- typgetreu und schnell; ein Export durch ein Chatfenster ist es nicht.
--
-- Das Schema trägt das Datum im Namen. Vor jedem Lauf das Datum anpassen.

create schema if not exists sicherung_20260909;

create table sicherung_20260909.wochenabrechnung as select * from public.wochenabrechnung;
create table sicherung_20260909.duell_wetten     as select * from public.duell_wetten;
create table sicherung_20260909.einheiten        as select * from public.einheiten;
create table sicherung_20260909.eintraege        as select * from public.eintraege;
create table sicherung_20260909.werte            as select * from public.werte;
create table sicherung_20260909.gewicht          as select * from public.gewicht;
create table sicherung_20260909.schlafnaechte    as select * from public.schlafnaechte;
create table sicherung_20260909.schlaf_updates   as select * from public.schlaf_updates;
create table sicherung_20260909.aufenthalte      as select * from public.aufenthalte;

-- Die App darf die Sicherung nicht sehen. `anon` und `authenticated` bekommen
-- hier nichts; nur die Dienstrolle kommt heran.
revoke all on schema sicherung_20260909 from anon, authenticated;
revoke all on all tables in schema sicherung_20260909 from anon, authenticated;

comment on schema sicherung_20260909 is
  'Sicherung der Nutzdaten unmittelbar vor dem Reset am 09.09.2026. Enthaelt keine App-Objekte und wird von der App nicht gelesen.';

-- Belegen, dass die Kopie vollständig ist. Erst wenn jede Zeile `ok` zeigt,
-- darf `reset-stand.sql` laufen.
select t.tabelle, t.original, t.sicherung,
       case when t.original = t.sicherung then 'ok' else 'ABWEICHUNG' end as pruefung
from (
  select 'wochenabrechnung' as tabelle,
         (select count(*) from public.wochenabrechnung) as original,
         (select count(*) from sicherung_20260909.wochenabrechnung) as sicherung
  union all select 'duell_wetten',   (select count(*) from public.duell_wetten),   (select count(*) from sicherung_20260909.duell_wetten)
  union all select 'einheiten',      (select count(*) from public.einheiten),      (select count(*) from sicherung_20260909.einheiten)
  union all select 'eintraege',      (select count(*) from public.eintraege),      (select count(*) from sicherung_20260909.eintraege)
  union all select 'werte',          (select count(*) from public.werte),          (select count(*) from sicherung_20260909.werte)
  union all select 'gewicht',        (select count(*) from public.gewicht),        (select count(*) from sicherung_20260909.gewicht)
  union all select 'schlafnaechte',  (select count(*) from public.schlafnaechte),  (select count(*) from sicherung_20260909.schlafnaechte)
  union all select 'schlaf_updates', (select count(*) from public.schlaf_updates), (select count(*) from sicherung_20260909.schlaf_updates)
  union all select 'aufenthalte',    (select count(*) from public.aufenthalte),    (select count(*) from sicherung_20260909.aufenthalte)
) t
order by pruefung, tabelle;
