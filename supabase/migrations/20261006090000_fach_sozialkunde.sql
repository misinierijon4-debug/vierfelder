-- Korrektur zu `20261006080000_fach_erdkunde.sql` (Auskunft von erijon,
-- 06.10.2026): beide haben dieses Halbjahr Sozialkunde, nicht Erdkunde. Das
-- Fach heisst wieder `sozialkunde`; Noten und Klausur haengen an der id und
-- bleiben. Korays Klausurzeit (3.–4. Stunde, 09:45–11:20) bleibt, denn es ist
-- derselbe Kurs wie bei Erijon.
--
-- Datenaenderung: zwei Fachnamen, sonst nichts.

update public.faecher f
set name = 'sozialkunde'
from public.profile p
where p.id = f.user_id
  and p.person in ('erijon', 'koray')
  and f.name = 'erdkunde';
