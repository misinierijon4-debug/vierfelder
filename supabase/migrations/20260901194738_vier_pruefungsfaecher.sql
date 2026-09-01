-- es sind vier pruefungsfaecher: die drei lk schriftlich, dazu genau ein
-- muendlicher gk. ein fuenftes gibt es nicht.
alter table faecher drop constraint if exists faecher_pruefungsfach_check;
update faecher set pruefungsfach = null where pruefungsfach = 5;
alter table faecher add constraint faecher_pruefungsfach_check
  check (pruefungsfach is null or (kursart = 'gk' and pruefungsfach = 4));

-- genau ein muendliches pruefungsfach je person
create unique index if not exists faecher_ein_pruefungsfach_idx
  on faecher (user_id) where pruefungsfach is not null;

-- der muendliche gk steht fest: erijon mathe, koray englisch
update faecher f set pruefungsfach = 4
from profile p
where p.id = f.user_id
  and ((p.person = 'erijon' and f.name = 'mathe') or (p.person = 'koray' and f.name = 'englisch'));
