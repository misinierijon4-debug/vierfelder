-- Additiver Release: Das produktive Gewicht-/Schlaf-Versandbuch und seine
-- alten Functions bleiben unveraendert. Kein Replay der driftenden Historie.
alter table public.erinnerungs_einstellungen
  add column lernen_aktiv boolean not null default true,
  add column lesen_aktiv boolean not null default true,
  add column wochenblick_aktiv boolean not null default true;

create table public.aktivitaets_versand (
  user_id uuid not null references auth.users(id) on delete cascade,
  art text not null check (art in ('lernen','lesen','wochenblick')),
  tag date not null,
  token uuid not null,
  zustand text not null default 'reserviert'
    check (zustand in ('reserviert','gesendet','unbestaetigt','uebersprungen')),
  erstellt timestamptz not null default now(),
  aktualisiert timestamptz not null default now(),
  primary key (user_id,art,tag)
);
alter table public.aktivitaets_versand enable row level security;
revoke all on public.aktivitaets_versand from public, anon, authenticated;
grant select,insert,update on public.aktivitaets_versand to service_role;

-- Reine Auswertung; der Testzeitpunkt ist ausschliesslich fuer service_role
-- erreichbar. Client, Cron-Body und Push-Empfaenger koennen ihn nicht setzen.
create function public.aktivitaets_kandidaten(p_jetzt timestamptz default now())
returns table(user_id uuid, art text, tag date, nachricht text)
language sql stable security invoker set search_path = '' as $$
  with lokal as (
    select (p_jetzt at time zone 'Europe/Berlin')::date as tag,
           (p_jetzt at time zone 'Europe/Berlin')::time as zeit,
           extract(isodow from p_jetzt at time zone 'Europe/Berlin')::int as wochentag,
           date_trunc('week', p_jetzt at time zone 'Europe/Berlin')::date as montag
  ), ticks as (
    select e.user_id,e.bereich,e.tag from public.einheiten e, lokal l
    where e.tag between l.montag and l.tag
    union
    select a.user_id,a.bereich,(a.ankunft at time zone 'Europe/Berlin')::date
    from public.aufenthalte a, lokal l
    where (a.ankunft at time zone 'Europe/Berlin')::date between l.montag and l.tag
      and a.abgang is not null
      and a.abgang >= a.ankunft + case when a.bereich='lesen' then interval '10 minutes' else interval '20 minutes' end
    union
    select g.user_id,'gewicht',g.tag from public.gewicht g, lokal l
    where g.tag between l.montag and l.tag
  ), punkte as (
    select p.id,p.person,count(t.tag)::int as anzahl
    from public.profile p left join ticks t on t.user_id=p.id
    where p.person in ('erijon','koray') group by p.id,p.person
  ), kandidaten as (
    select e.user_id,k.art,l.tag,
      case k.art
        when 'lernen' then 'heute noch kein lerneintrag. zeit für eine kleine einheit?'
        when 'lesen' then 'heute noch kein leseeintrag. ein paar seiten gehen noch?'
        else 'sonntagsstand: du ' || p.anzahl || ', ' || gegner.person || ' ' || gegner.anzahl ||
          '. die woche läuft noch.'
      end as nachricht
    from public.erinnerungs_einstellungen e
    join punkte p on p.id=e.user_id
    cross join lokal l
    cross join lateral (values
      ('lernen',e.lernen_aktiv,time '18:30',time '20:00'),
      ('lesen',e.lesen_aktiv,time '20:45',time '22:00'),
      ('wochenblick',e.wochenblick_aktiv,time '18:00',time '19:00')
    ) k(art,aktiv,von,bis)
    left join punkte gegner on gegner.id<>e.user_id
    where k.aktiv and l.zeit>=k.von and l.zeit<k.bis
      and (k.art<>'lernen' or l.wochentag between 1 and 5)
      and (k.art<>'wochenblick' or (l.wochentag=7 and gegner.id is not null and p.anzahl+gegner.anzahl>0))
      and (k.art='wochenblick' or not exists (
        select 1 from ticks t where t.user_id=e.user_id and t.tag=l.tag and t.bereich=k.art
      ))
      -- Noch laufende Sitzung nicht mit "kein Eintrag" unterbrechen. Nur
      -- derselbe Bereich; eine alte verwaiste Sitzung sperrt nicht fuer immer.
      and (k.art='wochenblick' or not exists (
        select 1 from public.aufenthalte a
        where a.user_id=e.user_id and a.bereich=k.art and a.abgang is null
          and a.ankunft<=p_jetzt and a.ankunft>p_jetzt-interval '12 hours'
      ))
      and exists(select 1 from public.push_abos a where a.user_id=e.user_id)
  ) select * from kandidaten;
$$;
revoke all on function public.aktivitaets_kandidaten(timestamptz) from public,anon,authenticated;
grant execute on function public.aktivitaets_kandidaten(timestamptz) to service_role;

-- Pruefung und Reservierung in einem Statement, UNIQUE verhindert parallelen
-- Doppelversand. Eine unklare Reservierung wird niemals automatisch freigegeben.
create function public.reserviere_aktivitaetsversand(p_user_id uuid,p_art text,p_tag date,p_token uuid)
returns boolean language sql volatile security invoker set search_path='' as $$
  with eingefuegt as (
    insert into public.aktivitaets_versand(user_id,art,tag,token)
    select k.user_id,k.art,k.tag,p_token from public.aktivitaets_kandidaten() k
    where k.user_id=p_user_id and k.art=p_art and k.tag=p_tag
    on conflict do nothing returning 1
  ) select exists(select 1 from eingefuegt);
$$;
revoke all on function public.reserviere_aktivitaetsversand(uuid,text,date,uuid) from public,anon,authenticated;
grant execute on function public.reserviere_aktivitaetsversand(uuid,text,date,uuid) to service_role;

-- Getrennter geheimer Scheduler-Schluessel. Kein oeffentlicher anon-Key als
-- Autorisierung; das Geheimnis bleibt in Vault und gelangt nie ins Frontend.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'vierfelder_aktivitaets_scheduler');
create table public.aktivitaets_scheduler_auth (
  id boolean primary key default true check (id),
  token_hash bytea not null
);
alter table public.aktivitaets_scheduler_auth enable row level security;
revoke all on public.aktivitaets_scheduler_auth from public,anon,authenticated;
grant select on public.aktivitaets_scheduler_auth to service_role;
insert into public.aktivitaets_scheduler_auth(token_hash)
select extensions.digest(decrypted_secret,'sha256') from vault.decrypted_secrets
where name='vierfelder_aktivitaets_scheduler';
create function public.pruefe_aktivitaets_scheduler(p_token text)
returns boolean language sql stable security invoker set search_path='' as $$
  select length(p_token)=64 and exists (
    select 1 from public.aktivitaets_scheduler_auth s
    where s.token_hash=extensions.digest(p_token,'sha256')
  );
$$;
revoke all on function public.pruefe_aktivitaets_scheduler(text) from public,anon,authenticated;
grant execute on function public.pruefe_aktivitaets_scheduler(text) to service_role;
select cron.schedule('aktivitaets-erinnerung','*/5 * * * *',$cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='vierfelder_project_url') || '/functions/v1/aktivitaets-erinnerung',
    headers := jsonb_build_object('Content-Type','application/json','x-erinnerungs-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='vierfelder_aktivitaets_scheduler')),
    body := '{}'::jsonb
  );
$cron$);
-- Erst nach Function-Deployment und Smoke aktivieren.
select cron.alter_job((select jobid from cron.job where jobname='aktivitaets-erinnerung'),active:=false);
