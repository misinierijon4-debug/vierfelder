-- Stand auf Null setzen — Variante A: nur Nutzdaten, keine Einrichtung.
--
-- Anlass: der offizielle Start am Mittwoch, 09.09.2026. Alles, was bis dahin
-- an Ticks, Einheiten, Messungen und Wochenwertungen aufgelaufen ist, war
-- Erprobung und soll den ersten echten Vergleich nicht verfälschen.
--
-- Diese Datei ist KEINE Migration. Sie ändert kein Schema, keine Funktion,
-- keinen Trigger, keine Policy und keinen Grant. Sie gehört deshalb nicht
-- nach `supabase/migrations/`, sondern wird einmalig und von Hand gegen die
-- Produktionsdatenbank ausgeführt — nach der Freigabe, die
-- docs/release-und-migrationen.md für Änderungen an produktiven Daten
-- verlangt. Das Vorgehen steht in docs/stand-zuruecksetzen.md.
--
-- Was bleibt, und warum:
--   profile                    die beiden Konten; ohne sie kein Login
--   faecher, noten             echte Schulnoten, kein Erprobungsstand
--   push_abos                  angemeldete Geräte; sonst Push neu einrichten
--   schlaf_import_tokens       Kurzbefehlstoken; sonst Kurzbefehle neu einrichten
--   erinnerungs_einstellungen  Uhrzeiten der Erinnerungen
--   erinnerungs_versand        Zustandsmaschine des Versands. Ein Löschen
--                              könnte eine bereits gesendete Erinnerung
--                              erneut auslösen, deshalb bleibt sie unberührt.
--   kurzbefehl_laeufe          Idempotenzschlüssel der Kurzbefehle. Ein
--                              Löschen ließe eine Wiederholung doppelt zählen.
--   offene aufenthalte         ein Training, das gerade läuft. Ohne Ankunft
--                              liefe der spätere Abgang ins Leere.

begin;

-- 1. Wochenwertung und Duell zuerst: sie lesen die Zeilen darunter.
delete from public.wochenabrechnung;
delete from public.duell_wetten;

-- 2. Die vier Bereiche: Haken, Tageswerte und die einzelnen Durchführungen.
delete from public.einheiten;
delete from public.eintraege;
delete from public.werte;

-- 3. Gewicht.
delete from public.gewicht;

-- 4. Schlaf. Der Trigger `schlaf_quellloeschung_projektion` räumt die
--    sichtbare Projektion `schlaf_updates` selbst mit ab; die Zeile danach
--    ist nur die Absicherung für Projektionsreste ohne Quellnacht.
delete from public.schlafnaechte;
delete from public.schlaf_updates;

-- 5. Abgeschlossene Aufenthalte. Ein offener Aufenthalt bleibt stehen, damit
--    ein gerade laufendes Training seinen Abgang noch zuordnen kann.
delete from public.aufenthalte where abgang is not null;

commit;
