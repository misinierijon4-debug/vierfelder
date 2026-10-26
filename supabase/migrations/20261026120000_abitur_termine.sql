-- Abiturtermine MSS 13, Schuljahr 2026/27 (Terminplan der Schule).
--
-- Die Tabelle `klausuren` hat die Art `abitur` von Anfang an; hier kommen die
-- Zeilen dazu. Je Person die drei Leistungskurse schriftlich und das vierte
-- Pruefungsfach muendlich (Faecher und Pruefungsfach wie produktiv am
-- 26.10.2026):
--
--    Erijon: Englisch 15.01., Geschichte (GW) 18.01., Biologie 22.01.;
--            muendlich Mathe.
--    Koray:  Deutsch 13.01., Geschichte (GW) 18.01., Physik 27.01.;
--            muendlich Englisch.
--
-- Uhrzeiten stehen im Plan nicht, sie bleiben leer. Die muendliche Pruefung
-- liegt am 15. oder 16.03.2027; welcher Tag, steht erst im Pruefungsplan etwa
-- eine Woche vorher. Bis dahin steht der fruehere Tag, die Bemerkung sagt es.
-- Die sportpraktischen Pruefungen betreffen keinen der beiden (Sport ist kein
-- Pruefungsfach).
--
-- Die Push-Art `klausur` kennt `abitur` schon ("abiprüfung: …"), der Worker
-- braucht nichts Neues. Bestehende Daten werden nicht geaendert.

insert into public.klausuren (user_id, fach_id, art, kurs, datum, beginn, ende, bemerkung)
select p.id, f.id, 'abitur', k.kurs, k.datum::date, k.beginn::time, k.ende::time, k.bemerkung
from (values
  ('erijon', 'englisch',   'E2',   '2027-01-15', null, null, 'schriftlich, Zentraltermin'),
  ('erijon', 'geschichte', 'G',    '2027-01-18', null, null, 'schriftlich'),
  ('erijon', 'bio',        'BIO1', '2027-01-22', null, null, 'schriftlich, Zentraltermin'),
  ('erijon', 'mathe',      null,   '2027-03-15', null, null, 'mündlich, 15. oder 16.03.'),
  ('koray',  'deutsch',    'D',    '2027-01-13', null, null, 'schriftlich, Zentraltermin'),
  ('koray',  'geschichte', 'G',    '2027-01-18', null, null, 'schriftlich'),
  ('koray',  'physik',     'PH',   '2027-01-27', null, null, 'schriftlich, Zentraltermin'),
  ('koray',  'englisch',   null,   '2027-03-15', null, null, 'mündlich, 15. oder 16.03.')
) as k(person, fach, kurs, datum, beginn, ende, bemerkung)
join public.profile p on p.person = k.person
join public.faecher f on f.user_id = p.id and f.name = k.fach
on conflict (fach_id, art, datum) do nothing;
