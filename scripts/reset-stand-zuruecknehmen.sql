-- Rückweg: spielt die Sicherung wieder ein. Nur zu benutzen, wenn der Reset
-- ein Fehler war und noch keine neuen Daten entstanden sind, die dabei
-- verloren gingen.
--
-- Reihenfolge wie beim Löschen, nur umgekehrt: erst die Grunddaten, dann das,
-- was auf ihnen aufsetzt. `schlaf_updates` wird bewusst mitgeschrieben statt
-- neu abgeleitet, damit die Projektion exakt dem gesicherten Stand entspricht.

begin;

insert into public.aufenthalte      overriding system value select * from sicherung_20260909.aufenthalte;
insert into public.schlafnaechte    select * from sicherung_20260909.schlafnaechte;
insert into public.schlaf_updates   select * from sicherung_20260909.schlaf_updates
  on conflict do nothing;
insert into public.gewicht          select * from sicherung_20260909.gewicht;
insert into public.werte            select * from sicherung_20260909.werte;
insert into public.eintraege        select * from sicherung_20260909.eintraege;
insert into public.einheiten        select * from sicherung_20260909.einheiten;
insert into public.duell_wetten     select * from sicherung_20260909.duell_wetten;
insert into public.wochenabrechnung select * from sicherung_20260909.wochenabrechnung;

commit;

-- `aufenthalte.id` ist eine Identity-Spalte. Nach dem Einspielen muss der
-- Zähler über den höchsten wiederhergestellten Wert gesetzt werden, sonst
-- kollidiert die nächste Ankunft mit einer alten Zeile.
select setval(
  pg_get_serial_sequence('public.aufenthalte', 'id'),
  coalesce((select max(id) from public.aufenthalte), 1)
);
