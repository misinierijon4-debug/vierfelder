-- Dieses Halbjahr (13/1) haben beide Erdkunde, nicht Sozialkunde (Auskunft von
-- erijon, 06.10.2026). Das Fach heisst deshalb wieder nach dem, was im
-- Stundenplan steht; Noten und Klausur haengen an der id und bleiben.
-- Die Klausur am 27.10. ist fuer beide der Kurs in der 3.–4. Stunde: Korays
-- Uhrzeit war offen, weil der Kurs nicht feststand.
--
-- Datenaenderung: zwei Fachnamen und eine Klausurzeile, sonst nichts.

update public.faecher f
set name = 'erdkunde'
from public.profile p
where p.id = f.user_id
  and p.person in ('erijon', 'koray')
  and f.name = 'sozialkunde';

update public.klausuren k
set beginn = '09:45', ende = '11:20', bemerkung = ''
from public.faecher f, public.profile p
where f.id = k.fach_id
  and p.id = k.user_id
  and p.person = 'koray'
  and f.name = 'erdkunde'
  and k.art = 'klausur'
  and k.datum = '2026-10-27'
  and k.beginn is null;
