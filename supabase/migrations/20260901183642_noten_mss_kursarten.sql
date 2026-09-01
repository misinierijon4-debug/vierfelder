-- MSS-Kursarten und die drei Notentypen (01.09.2026).
--
-- lf/gf heissen ueberall lk/gk. Der Klausuranteil ist keine Einstellung mehr,
-- sondern faellt aus der Kursart: lk 50/50, gk 33/67. Im muendlichen Teil
-- zaehlt eine epo doppelt so viel wie eine hue. Die Faecherliste ist fest —
-- chor ist eine ag und kein kurs, angelegt oder geloescht wird nichts mehr.

alter table faecher drop constraint if exists faecher_kursart_check;
alter table faecher alter column kursart drop default;
update faecher set kursart = case kursart when 'lf' then 'lk' when 'gf' then 'gk' else kursart end;
alter table faecher alter column kursart set default 'gk';
alter table faecher add constraint faecher_kursart_check check (kursart in ('lk','gk'));

-- der anteil steht in der kursart, nicht in einer spalte
alter table faecher drop column if exists klausur_anteil;

delete from faecher where name = 'chor';

-- die luecke in der sortierung schliessen, die reihenfolge bleibt
with neu as (
  select id, row_number() over (partition by user_id order by sortierung, name) - 1 as rang
  from faecher
)
update faecher f set sortierung = neu.rang
from neu where neu.id = f.id and f.sortierung <> neu.rang;

-- waehlbar ist nur noch das muendliche pruefungsfach 4 oder 5. die drei lk sind
-- die schriftlichen pruefungen und brauchen dafuer keine nummer.
alter table faecher drop constraint if exists faecher_pruefungsfach_check;
update faecher set pruefungsfach = null where kursart = 'lk' or pruefungsfach not in (4,5);
alter table faecher add constraint faecher_pruefungsfach_check
  check (pruefungsfach is null or (kursart = 'gk' and pruefungsfach in (4,5)));

-- klausur, epo, hue. das gewicht haengt an der art und wird nicht getippt.
alter table noten drop constraint if exists noten_art_check;
update noten set art = 'epo' where art = 'muendlich';
alter table noten add constraint noten_art_check check (art in ('klausur','epo','hue'));
update noten set gewicht = case when art = 'epo' then 20 else 10 end;
alter table noten drop constraint if exists noten_gewicht_check;
alter table noten add constraint noten_gewicht_check
  check (gewicht = case when art = 'epo' then 20 else 10 end);

-- die faecherliste ist fest, deshalb bleibt vom schreibrecht auf faecher genau
-- eine spalte uebrig: das pruefungsfach.
drop policy if exists "faecher schreiben" on faecher;
drop policy if exists "faecher loeschen" on faecher;
revoke insert, update, delete on table faecher from authenticated;
grant update (pruefungsfach) on table faecher to authenticated;

-- eine note wird eingetragen oder geloescht, nicht nachtraeglich verbogen.
drop policy if exists "noten aendern" on noten;
revoke update on table noten from authenticated;
