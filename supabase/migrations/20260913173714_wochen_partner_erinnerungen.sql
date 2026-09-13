-- Partner- und ENI-Wochen-Erinnerungen. Die alte Gewicht-/Schlaf-Zustands-
-- maschine bleibt unangetastet; diese Migration erweitert nur den getrennten
-- Aktivitaetsversand und den privaten ENI-Verlauf.

alter table public.erinnerungs_einstellungen
  add column if not exists partner_aktiv boolean not null default true,
  add column if not exists wochenrueckblick_aktiv boolean not null default true;

alter table public.aktivitaets_versand
  drop constraint if exists aktivitaets_versand_art_check;
alter table public.aktivitaets_versand
  add constraint aktivitaets_versand_art_check
    check (art in ('lernen', 'lesen', 'wochenblick', 'partner', 'wochenrueckblick'));

-- Eine Einladung wird unabhaengig von Push-Abos und den Versand-Schaltern
-- angelegt. Der Client darf nur die eigenen Zeilen lesen; oeffnen und schlies-
-- sen laufen ueber die unten geprueften RPCs.
create table public.eni_wochen_einladungen (
  user_id uuid not null references auth.users(id) on delete cascade,
  wochenbeginn date not null,
  faellig_am timestamptz not null,
  geschlossen_am timestamptz,
  erstellt timestamptz not null default now(),
  primary key (user_id, wochenbeginn),
  constraint eni_wochen_einladungen_montag_check
    check (extract(isodow from wochenbeginn) = 1)
);

alter table public.eni_wochen_einladungen enable row level security;
revoke all on table public.eni_wochen_einladungen from public, anon, authenticated;
grant select on table public.eni_wochen_einladungen to authenticated;
grant select, insert, update on table public.eni_wochen_einladungen to service_role;

create policy "eni wochen einladungen lesen" on public.eni_wochen_einladungen
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profile p
      where p.id = (select auth.uid())
    )
  );

-- Wochen-Chats bleiben normale ENI-Chats, tragen aber eine unveraenderliche
-- Montag-Bindung. Der partielle Index erlaubt weiterhin beliebig viele
-- ungebundene Standard-Chats.
alter table public.eni_chats
  add column if not exists wochenbeginn date;
alter table public.eni_chats
  drop constraint if exists eni_chats_wochenbeginn_montag_check;
alter table public.eni_chats
  add constraint eni_chats_wochenbeginn_montag_check
    check (wochenbeginn is null or extract(isodow from wochenbeginn) = 1);
create unique index if not exists eni_chats_nutzer_wochenbeginn_idx
  on public.eni_chats (user_id, wochenbeginn)
  where wochenbeginn is not null;

create or replace function private.schuetze_eni_chat_wochenbindung()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.wochenbeginn is not null
       and coalesce(pg_catalog.current_setting('app.eni_wochen_rpc', true), '') <> '1' then
      raise exception using
        errcode = '42501',
        message = 'wochen-chats werden ausschliesslich ueber den wochen-rpc angelegt';
    end if;
    return new;
  end if;

  -- Auch ein eigenes Konto darf die Identitaet oder die Wochenbindung nicht
  -- nachtraeglich auf eine andere Zeile umbiegen. Der RPC setzt nur den Titel.
  if new.user_id is distinct from old.user_id then
    raise exception using errcode = '42501', message = 'chat-eigentuemer ist unveraenderlich';
  end if;
  if old.wochenbeginn is not null
     and new.wochenbeginn is distinct from old.wochenbeginn then
    raise exception using errcode = '42501', message = 'wochenbindung ist unveraenderlich';
  end if;
  if old.wochenbeginn is null
     and new.wochenbeginn is not null
     and coalesce(pg_catalog.current_setting('app.eni_wochen_rpc', true), '') <> '1' then
    raise exception using errcode = '42501', message = 'wochenbindung wird nur vom wochen-rpc gesetzt';
  end if;
  return new;
end;
$$;

revoke all on function private.schuetze_eni_chat_wochenbindung() from public, anon, authenticated;
drop trigger if exists eni_chat_wochenbindung_schuetzen on public.eni_chats;
create trigger eni_chat_wochenbindung_schuetzen
before insert or update on public.eni_chats
for each row execute function private.schuetze_eni_chat_wochenbindung();

-- Die bisherige Tabellenberechtigung bleibt fuer Standard-Chats bestehen. Die
-- Policies verlangen jetzt zugleich eine echte profile-Zeile; ein beliebiges
-- authenticated-Konto bekommt keinen ENI-Verlauf.
drop policy if exists "eni chats lesen" on public.eni_chats;
create policy "eni chats lesen" on public.eni_chats
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
  );
drop policy if exists "eni chats anlegen" on public.eni_chats;
create policy "eni chats anlegen" on public.eni_chats
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and wochenbeginn is null
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
  );
drop policy if exists "eni chats aendern" on public.eni_chats;
create policy "eni chats aendern" on public.eni_chats
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
  )
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
  );
drop policy if exists "eni chats loeschen" on public.eni_chats;
create policy "eni chats loeschen" on public.eni_chats
  for delete to authenticated using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
  );

drop policy if exists "eni nachrichten lesen" on public.eni_nachrichten;
create policy "eni nachrichten lesen" on public.eni_nachrichten
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
  );
drop policy if exists "eni nachrichten schreiben" on public.eni_nachrichten;
create policy "eni nachrichten schreiben" on public.eni_nachrichten
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
    and exists (
      select 1 from public.eni_chats c
      where c.id = chat_id and c.user_id = (select auth.uid())
    )
  );
drop policy if exists "eni nachrichten loeschen" on public.eni_nachrichten;
create policy "eni nachrichten loeschen" on public.eni_nachrichten
  for delete to authenticated using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
  );

-- Der Server legt die aktuelle Wochenzeile nur im Sonntagsfenster an. Ein
-- verpasster Lauf am Montag erzeugt keinen beliebigen historischen Rueckstau;
-- der Client liest die bereits angelegte Zeile spaeter per Catch-up.
create or replace function public.sichere_faellige_eni_wochen_einladungen(
  p_jetzt timestamptz default now()
)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  with lokal as (
    select
      coalesce(p_jetzt, pg_catalog.now()) as jetzt,
      (coalesce(p_jetzt, pg_catalog.now()) at time zone 'Europe/Berlin')::date as tag,
      (coalesce(p_jetzt, pg_catalog.now()) at time zone 'Europe/Berlin')::time as zeit,
      extract(isodow from coalesce(p_jetzt, pg_catalog.now()) at time zone 'Europe/Berlin')::integer as wochentag
  ), eingefuegt as (
    insert into public.eni_wochen_einladungen (user_id, wochenbeginn, faellig_am, erstellt)
    select
      p.id,
      (l.tag - 6)::date,
      ((l.tag + time '20:00') at time zone 'Europe/Berlin'),
      l.jetzt
    from public.profile p
    cross join lokal l
    where l.wochentag = 7
      and l.zeit >= time '20:00'
      and l.zeit < time '22:00'
    on conflict (user_id, wochenbeginn) do nothing
    returning 1
  )
  select count(*)::integer from eingefuegt;
$$;

revoke all on function public.sichere_faellige_eni_wochen_einladungen(timestamptz)
  from public, anon, authenticated;
grant execute on function public.sichere_faellige_eni_wochen_einladungen(timestamptz)
  to service_role;

create or replace function public.hole_eni_wochen_einladungen()
returns table (
  wochenbeginn date,
  faellig_am timestamptz,
  geschlossen_am timestamptz,
  erstellt timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.wochenbeginn, i.faellig_am, i.geschlossen_am, i.erstellt
  from public.eni_wochen_einladungen i
  where i.user_id = (select auth.uid())
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
    and i.faellig_am <= pg_catalog.now()
  order by i.wochenbeginn desc;
$$;

revoke all on function public.hole_eni_wochen_einladungen()
  from public, anon, authenticated;
grant execute on function public.hole_eni_wochen_einladungen() to authenticated;

create or replace function public.schliesse_eni_wochen_einladung(p_wochenbeginn date)
returns table (
  wochenbeginn date,
  faellig_am timestamptz,
  geschlossen_am timestamptz,
  erstellt timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_jetzt timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user_id is null
     or not exists (select 1 from public.profile p where p.id = v_user_id)
     or p_wochenbeginn is null
     or extract(isodow from p_wochenbeginn) <> 1 then
    return;
  end if;

  update public.eni_wochen_einladungen i
  set geschlossen_am = coalesce(i.geschlossen_am, v_jetzt)
  where i.user_id = v_user_id
    and i.wochenbeginn = p_wochenbeginn
    and i.faellig_am <= v_jetzt;

  return query
    select i.wochenbeginn, i.faellig_am, i.geschlossen_am, i.erstellt
    from public.eni_wochen_einladungen i
    where i.user_id = v_user_id
      and i.wochenbeginn = p_wochenbeginn
      and i.faellig_am <= v_jetzt;
end;
$$;

revoke all on function public.schliesse_eni_wochen_einladung(date)
  from public, anon, authenticated;
grant execute on function public.schliesse_eni_wochen_einladung(date) to authenticated;

create or replace function public.oeffne_eni_wochenchat(p_wochenbeginn date)
returns table (
  id uuid,
  titel text,
  zuletzt timestamptz,
  wochenbeginn date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_jetzt timestamptz := pg_catalog.clock_timestamp();
  v_titel text;
  v_chat_id uuid;
begin
  if v_user_id is null
     or not exists (select 1 from public.profile p where p.id = v_user_id)
     or p_wochenbeginn is null
     or extract(isodow from p_wochenbeginn) <> 1
     or not exists (
       select 1 from public.eni_wochen_einladungen i
       where i.user_id = v_user_id
         and i.wochenbeginn = p_wochenbeginn
         and i.faellig_am <= v_jetzt
     ) then
    return;
  end if;

  v_titel := pg_catalog.left(
    'ENI-Wochenrueckblick ' || pg_catalog.to_char(p_wochenbeginn, 'DD.MM.YYYY'),
    120
  );

  -- Das GUC-Flag existiert nur innerhalb dieses RPC-Aufrufs. Es ist der
  -- schmale Schreibpfad, den der Trigger fuer eine neue Wochenbindung kennt.
  perform pg_catalog.set_config('app.eni_wochen_rpc', '1', true);
  -- Der Advisory-Lock haelt zwei gleichzeitige erste Aufrufe derselben Woche
  -- zusammen. So braucht der partielle Unique-Index kein mehrdeutiges
  -- ON-CONFLICT-Ziel neben dem OUT-Parameter `wochenbeginn`.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('eni:wochenchat:' || v_user_id::text || ':' || p_wochenbeginn::text, 0)
  );
  select c.id into v_chat_id
  from public.eni_chats c
  where c.user_id = v_user_id and c.wochenbeginn = p_wochenbeginn;
  if v_chat_id is null then
    insert into public.eni_chats (user_id, titel, wochenbeginn)
    values (v_user_id, v_titel, p_wochenbeginn)
    returning public.eni_chats.id into v_chat_id;
  end if;

  return query
    select c.id, c.titel, c.zuletzt, c.wochenbeginn
    from public.eni_chats c
    where c.user_id = v_user_id
      and c.wochenbeginn = p_wochenbeginn;
end;
$$;

revoke all on function public.oeffne_eni_wochenchat(date)
  from public, anon, authenticated;
grant execute on function public.oeffne_eni_wochenchat(date) to authenticated;

-- Die alte Funktion hat nur drei Arten geliefert. Wegen der festen RPC-
-- Rueckgabeform wird sie samt alter Reservierungssignatur ersetzt.
drop function if exists public.reserviere_aktivitaetsversand(uuid, text, date, uuid);
drop function if exists public.aktivitaets_kandidaten(timestamptz);

create or replace function public.aktivitaets_kandidaten(
  p_jetzt timestamptz default now()
)
returns table (
  user_id uuid,
  art text,
  tag date,
  sendetag date,
  nachricht text,
  url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with lokal as (
    select
      coalesce(p_jetzt, pg_catalog.now()) as jetzt,
      (coalesce(p_jetzt, pg_catalog.now()) at time zone 'Europe/Berlin')::date as tag,
      (coalesce(p_jetzt, pg_catalog.now()) at time zone 'Europe/Berlin')::time as zeit,
      extract(isodow from coalesce(p_jetzt, pg_catalog.now()) at time zone 'Europe/Berlin')::integer as wochentag,
      date_trunc('week', coalesce(p_jetzt, pg_catalog.now()) at time zone 'Europe/Berlin')::date as montag
  ),
  -- Rohdaten fuer den bestehenden Sonntagsstand. Ein Tick ist je Bereich und
  -- Berliner Tag eindeutig; zukuenftige Tags und ueberlange Aufenthalte fallen
  -- heraus.
  stand_einheiten as (
    select e.user_id, e.bereich, e.tag
    from public.einheiten e cross join lokal l
    where e.tag between l.montag and l.tag
      and e.erstellt <= l.jetzt
  ),
  stand_aufenthalte as (
    select distinct
      a.user_id,
      a.bereich,
      (a.ankunft at time zone 'Europe/Berlin')::date as tag
    from public.aufenthalte a cross join lokal l
    where a.abgang is not null
      and a.ankunft <= l.jetzt
      and a.abgang <= l.jetzt
      and a.abgang >= a.ankunft + case
        when a.bereich = 'lesen' then interval '10 minutes'
        else interval '20 minutes'
      end
      and a.abgang <= a.ankunft + interval '12 hours'
      and (a.ankunft at time zone 'Europe/Berlin')::date between l.montag and l.tag
  ),
  stand_ticks as (
    select distinct user_id, bereich, tag from stand_einheiten
    union
    select user_id, bereich, tag from stand_aufenthalte
    union
    select g.user_id, 'gewicht'::text, g.tag
    from public.gewicht g cross join lokal l
    where g.tag between l.montag and l.tag
  ),
  stand as (
    select p.id, p.person, count(t.tag)::integer as anzahl
    from public.profile p
    left join stand_ticks t on t.user_id = p.id
    where p.person in ('erijon', 'koray')
    group by p.id, p.person
  ),
  -- Fuer Partner-Pushs zaehlt nur eine tatsaechlich abgeschlossene, am selben
  -- Berliner Tag erfasste Aktivitaet. So werden nachtraegliche Backfills,
  -- Zukunftszeilen und verwaiste/ueberlange Sitzungen nicht als Abschluss
  -- verkauft.
  partner_einheiten as (
    select e.user_id, e.bereich, e.tag, e.erstellt as fertig
    from public.einheiten e cross join lokal l
    where e.erstellt <= l.jetzt
      and e.tag = (e.erstellt at time zone 'Europe/Berlin')::date
      and e.tag <= l.tag
  ),
  partner_aufenthalte as (
    select a.user_id, a.bereich,
      (a.ankunft at time zone 'Europe/Berlin')::date as tag,
      a.abgang as fertig
    from public.aufenthalte a cross join lokal l
    where a.abgang is not null
      and a.abgang <= l.jetzt
      and a.ankunft <= l.jetzt
      and a.abgang >= a.ankunft + case
        when a.bereich = 'lesen' then interval '10 minutes'
        else interval '20 minutes'
      end
      and a.abgang <= a.ankunft + interval '12 hours'
      and (a.ankunft at time zone 'Europe/Berlin')::date
        = (a.abgang at time zone 'Europe/Berlin')::date
      and (a.ankunft at time zone 'Europe/Berlin')::date <= l.tag
  ),
  partner_events as (
    select distinct on (user_id, bereich, tag)
      user_id, bereich, tag, fertig
    from (
      select * from partner_einheiten
      union all
      select * from partner_aufenthalte
    ) q
    order by user_id, bereich, tag, fertig desc
  ),
  partner_gewicht as (
    select g.user_id, 'gewicht'::text as bereich, g.tag, g.erstellt as fertig
    from public.gewicht g cross join lokal l
    where g.erstellt <= l.jetzt
      and g.tag = (g.erstellt at time zone 'Europe/Berlin')::date
      and g.tag <= l.tag
  ),
  partner_ticks as (
    select user_id, bereich, tag from partner_events
    union
    select user_id, bereich, tag from partner_gewicht
  ),
  heute as (
    select t.user_id, count(*)::integer as anzahl
    from partner_ticks t cross join lokal l
    where t.tag = l.tag
    group by t.user_id
  ),
  woche as (
    select t.user_id, count(*)::integer as anzahl
    from partner_ticks t cross join lokal l
    where t.tag between l.montag and l.tag
    group by t.user_id
  ),
  frisch as (
    select distinct on (e.user_id)
      e.user_id, e.bereich, e.fertig
    from partner_events e cross join lokal l
    where e.fertig > l.jetzt - interval '10 minutes'
      and e.fertig <= l.jetzt
    order by e.user_id, e.fertig desc, e.bereich
  ),
  grundtaetigkeiten as (
    select
      s.user_id,
      k.art,
      l.tag,
      l.tag as sendetag,
      case k.art
        when 'lernen' then 'heute noch kein lerneintrag. zeit für eine kleine einheit?'
        when 'lesen' then 'heute noch kein leseeintrag. ein paar seiten gehen noch?'
      end as nachricht,
      './'::text as url
    from public.erinnerungs_einstellungen s
    join public.profile p on p.id = s.user_id and p.person in ('erijon', 'koray')
    cross join lokal l
    cross join lateral (values
      ('lernen'::text, s.lernen_aktiv, time '18:30', time '20:00'),
      ('lesen'::text, s.lesen_aktiv, time '20:45', time '22:00')
    ) k(art, aktiv, von, bis)
    where k.aktiv
      and l.zeit >= k.von and l.zeit < k.bis
      and (k.art <> 'lernen' or l.wochentag between 1 and 5)
      and not exists (
        select 1 from stand_ticks t
        where t.user_id = s.user_id and t.bereich = k.art and t.tag = l.tag
      )
      and not exists (
        select 1 from public.aufenthalte a
        where a.user_id = s.user_id
          and a.abgang is null
          and a.ankunft <= l.jetzt
          and a.ankunft > l.jetzt - interval '12 hours'
      )
      and exists (select 1 from public.push_abos a where a.user_id = s.user_id)
  ),
  alter_wochenblick as (
    select
      s.user_id,
      'wochenblick'::text as art,
      l.tag,
      l.tag as sendetag,
      'sonntagsstand: du ' || me.anzahl || ', ' || gegner.person || ' ' || gegner.anzahl ||
        '. die woche läuft noch.' as nachricht,
      './'::text as url
    from public.erinnerungs_einstellungen s
    join stand me on me.id = s.user_id
    join stand gegner on gegner.id <> me.id
    cross join lokal l
    where s.wochenblick_aktiv
      and l.wochentag = 7
      and l.zeit >= time '18:00' and l.zeit < time '19:00'
      and me.anzahl + gegner.anzahl > 0
      and exists (select 1 from public.push_abos a where a.user_id = s.user_id)
  ),
  partner as (
    select
      me.id as user_id,
      'partner'::text as art,
      l.tag,
      l.tag as sendetag,
      case
        when coalesce(heute_partner.anzahl, 0) >= 3
             and coalesce(heute_me.anzahl, 0) = 0
             and l.zeit >= time '17:00'
          then initcap(partner_profile.person) || ' hat heute bereits ' || heute_partner.anzahl ||
            ' Bereiche abgeschlossen; bei dir steht heute noch kein Eintrag.'
        when coalesce(woche_partner.anzahl, 0) - coalesce(woche_me.anzahl, 0) >= 5
             and l.zeit >= time '17:00'
          then initcap(partner_profile.person) || ' fuehrt diese Woche mit ' ||
            (woche_partner.anzahl - coalesce(woche_me.anzahl, 0)) ||
            ' Punkten Vorsprung (' || woche_partner.anzahl || ' zu ' || coalesce(woche_me.anzahl, 0) || ').'
        else initcap(partner_profile.person) || ' hat gerade ' ||
          case frisch_partner.bereich
            when 'lernen' then 'Lernen'
            when 'lesen' then 'Lesen'
            when 'gym' then 'Gym'
            when 'boxen' then 'Boxen'
            else frisch_partner.bereich
          end || ' abgeschlossen.'
      end as nachricht,
      './'::text as url
    from public.erinnerungs_einstellungen s
    join public.profile me on me.id = s.user_id and me.person in ('erijon', 'koray')
    join public.profile partner_profile
      on partner_profile.person <> me.person
      and partner_profile.person in ('erijon', 'koray')
    cross join lokal l
    left join heute heute_me on heute_me.user_id = me.id
    left join heute heute_partner on heute_partner.user_id = partner_profile.id
    left join woche woche_me on woche_me.user_id = me.id
    left join woche woche_partner on woche_partner.user_id = partner_profile.id
    left join frisch frisch_partner on frisch_partner.user_id = partner_profile.id
    where s.partner_aktiv
      and l.zeit >= time '09:00' and l.zeit < time '21:00'
      and not exists (
        select 1 from public.aufenthalte a
        where a.user_id = me.id
          and a.abgang is null
          and a.ankunft <= l.jetzt
          and a.ankunft > l.jetzt - interval '12 hours'
      )
      and (
        (
          coalesce(heute_partner.anzahl, 0) >= 3
          and coalesce(heute_me.anzahl, 0) = 0
          and l.zeit >= time '17:00'
        )
        or (
          coalesce(woche_partner.anzahl, 0) - coalesce(woche_me.anzahl, 0) >= 5
          and l.zeit >= time '17:00'
        )
        or frisch_partner.user_id is not null
      )
      and exists (select 1 from public.push_abos a where a.user_id = me.id)
  ),
  neue_wochenrueckblicke as (
    select
      s.user_id,
      'wochenrueckblick'::text as art,
      l.montag as tag,
      l.tag as sendetag,
      'Willst du, dass Eni deine Woche zusammenfasst?'::text as nachricht,
      './#/eni?woche=' || l.montag::text as url
    from public.erinnerungs_einstellungen s
    join public.profile p on p.id = s.user_id and p.person in ('erijon', 'koray')
    cross join lokal l
    join public.eni_wochen_einladungen i
      on i.user_id = s.user_id and i.wochenbeginn = l.montag
    where s.wochenrueckblick_aktiv
      and l.wochentag = 7
      and l.zeit >= time '20:00' and l.zeit < time '22:00'
      and i.faellig_am <= l.jetzt
      and i.geschlossen_am is null
      and exists (select 1 from public.push_abos a where a.user_id = s.user_id)
  )
  select * from grundtaetigkeiten
  union all select * from alter_wochenblick
  union all select * from partner
  union all select * from neue_wochenrueckblicke;
$$;

revoke all on function public.aktivitaets_kandidaten(timestamptz)
  from public, anon, authenticated;
grant execute on function public.aktivitaets_kandidaten(timestamptz) to service_role;

create or replace function public.reserviere_aktivitaetsversand(
  p_user_id uuid,
  p_art text,
  p_tag date,
  p_token uuid,
  p_jetzt timestamptz default now()
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with eingefuegt as (
    insert into public.aktivitaets_versand (user_id, art, tag, token)
    select k.user_id, k.art, k.tag, p_token
    from public.aktivitaets_kandidaten(coalesce(p_jetzt, pg_catalog.now())) k
    where k.user_id = p_user_id
      and k.art = p_art
      and k.tag = p_tag
      and p_user_id is not null
      and p_art is not null
      and p_tag is not null
      and p_token is not null
    on conflict (user_id, art, tag) do nothing
    returning 1
  )
  select exists (select 1 from eingefuegt);
$$;

revoke all on function public.reserviere_aktivitaetsversand(uuid, text, date, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserviere_aktivitaetsversand(uuid, text, date, uuid, timestamptz)
  to service_role;
