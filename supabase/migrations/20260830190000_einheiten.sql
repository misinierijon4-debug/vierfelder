-- Eine Zeile pro Durchfuehrung statt einer pro Tag (30.08.2026).
--
-- Bisher hielt `eintraege` genau einen Haken je Person, Bereich und Tag und
-- `werte` genau eine Zahl dazu. Zwei Trainings an einem Tag passten damit nicht
-- ins Modell: der zweite Eintrag ersetzte den ersten, und die Minuten des
-- Vortags standen nirgends mehr in der Oberflaeche.
--
-- `einheiten` haelt jede Durchfuehrung einzeln: Aktivitaet, Tag, Wert,
-- Zeitpunkt der Eintragung und Person. Der Haken wird ab jetzt daraus
-- abgeleitet — „mindestens eine Einheit" —, genau wie beim Gewicht aus der
-- Messung. Nach `eintraege` kopiert wird nichts: das waeren zwei Quellen fuer
-- dieselbe Wahrheit.
--
-- Anders als `werte` liegt diese Tabelle offen fuer beide Konten. Der Vergleich
-- ist der Zweck der App, und eine Tagesansicht, die beim anderen nur „erledigt"
-- zeigen darf, waere eine halbe Ansicht. Damit dreht sich die Regel aus
-- DESIGN.md Abschnitt 10 bewusst um; die Begruendung steht im Nachtrag dort.
create table if not exists einheiten (
  -- die uuid erzeugt der client. sie ist der schutz gegen doppelte eintraege:
  -- ein wiederholtes senden nach einem timeout laeuft in den primary key
  -- statt eine zweite einheit anzulegen.
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  bereich text not null check (bereich in ('lernen','gym','boxen','lesen')),
  -- der lokale kalendertag des geraets. hier steht nie now()::date: das waere
  -- UTC und wuerde einen eintrag um 23:30 auf den folgetag schieben.
  tag date not null,
  -- minuten oder seiten. null heisst: nie erfasst. eine null wird nie durch
  -- eine geschaetzte zahl ersetzt.
  wert int check (wert is null or wert >= 0),
  -- wann die einheit eingetragen wurde, mit zeitzone. null nur dort, wo es
  -- keinen zeitpunkt gab.
  erfasst timestamptz,
  erstellt timestamptz not null default now()
);

alter table einheiten enable row level security;

-- ausdruecklich statt ueber die default-grants, wie bei `gewicht`: anon hat
-- hier nichts zu suchen, auch nicht theoretisch.
revoke all on table einheiten from anon;
revoke all on table einheiten from authenticated;
grant select, insert, update, delete on table einheiten to authenticated;

-- `drop policy if exists` davor, damit ein zweiter lauf des skripts nicht auf
-- halber strecke abbricht. alles uebrige ist `if not exists`.
-- lesen beide, schreiben nur die eigene person — vorbild ist `eintraege`.
drop policy if exists "einheiten lesen" on einheiten;
create policy "einheiten lesen" on einheiten
  for select to authenticated using (
    (select auth.uid()) in (select id from public.profile)
  );

drop policy if exists "einheiten schreiben" on einheiten;
create policy "einheiten schreiben" on einheiten
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- anders als bei `eintraege` gibt es ein update: die minuten einer laufenden
-- einheit wachsen ueber den tag, die zeile bleibt dieselbe.
drop policy if exists "einheiten aendern" on einheiten;
create policy "einheiten aendern" on einheiten
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "einheiten loeschen" on einheiten;
create policy "einheiten loeschen" on einheiten
  for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists einheiten_nutzer_tag_idx on einheiten (user_id, tag desc);
create index if not exists einheiten_bereich_tag_idx on einheiten (bereich, tag desc);

-- Altbestand verlustfrei uebernehmen. `erstellt` aus `eintraege` ist ein
-- echter zeitpunkt aus der datenbank, keine erfindung — und wo kein wert
-- gespeichert war, bleibt `wert` null statt einer ausgedachten minute.
insert into einheiten (id, user_id, bereich, tag, wert, erfasst, erstellt)
select gen_random_uuid(), e.user_id, e.bereich, e.tag, w.wert, e.erstellt, e.erstellt
from eintraege e
left join werte w
  on w.user_id = e.user_id and w.bereich = e.bereich and w.tag = e.tag
where not exists (
  select 1 from einheiten x
  where x.user_id = e.user_id and x.bereich = e.bereich and x.tag = e.tag
);

-- Ein wert ohne zeile in `eintraege` wird bewusst NICHT uebernommen. So eine
-- zeile ist kein verlorener eintrag, sondern der rest eines abgehakten tages:
-- das alte abhaken loeschte nur den eintrag, der wert blieb stehen und war
-- danach nirgends mehr sichtbar. Ihn jetzt zur einheit zu machen hiesse, einen
-- geloeschten tick wiederzubeleben — samt punkt in einer laengst
-- abgeschlossenen woche. Die zeilen bleiben in `werte` stehen, geloescht wird
-- nichts.

-- `eintraege` und `werte` bleiben als altbestand stehen und werden von der app
-- nicht mehr geschrieben. sie sind die quelle dieses backfills und der
-- rueckfallweg, solange eine aeltere version der app noch laeuft.

-- ohne `replica identity full` liefert ein DELETE ueber realtime nur die uuid,
-- und das andere geraet wuesste nicht, welche zelle sich geaendert hat.
alter table einheiten replica identity full;

do $$
begin
  alter publication supabase_realtime add table einheiten;
exception
  when duplicate_object then null;
end
$$;
