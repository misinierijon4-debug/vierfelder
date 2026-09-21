-- Die Montagsmeldung sagt nur noch, dass der Bericht fertig ist.
--
-- Der Zusatz "— mit der letzten nacht" war beim ersten Lauf eine Nachricht an
-- zwei Menschen, die gerade eine fehlende Nacht gemeldet hatten. Als Dauertext
-- erklaert er jeden Montag eine Mechanik, die dann laengst selbstverstaendlich
-- ist. Nachgetragen wird die Nacht weiterhin; nur die Meldung schweigt darueber.
--
-- Geaendert ist ausschliesslich diese eine Zeichenkette. Die feste
-- Rueckgabeform zwingt trotzdem zum vollstaendigen Ersetzen der Funktion.

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
  ),
  -- Neu: die Meldung zum fertigen Wochenbericht. Sie haengt nicht an der Uhr
  -- allein, sondern am Zustand des Archivs — erst wenn keine Nacht mehr
  -- nachlaeuft, ist der Bericht das, was die Meldung behauptet. Der Tag ist
  -- der Berichtsmontag, nicht der Sendetag: so gibt es je Woche genau eine.
  fertige_wochenberichte as (
    select
      s.user_id,
      'wochenbericht'::text as art,
      (l.montag - 7)::date as tag,
      l.tag as sendetag,
      'dein wochenbericht für letzte woche ist fertig.'::text as nachricht,
      './#/bericht?woche=' || (l.montag - 7)::text as url
    from public.erinnerungs_einstellungen s
    join public.profile p on p.id = s.user_id and p.person in ('erijon', 'koray')
    cross join lokal l
    join public.wochenberichte w on w.woche = (l.montag - 7)::date
    where s.wochenbericht_aktiv
      and l.wochentag = 1
      and l.zeit >= time '07:00' and l.zeit < time '21:00'
      and w.naechte_vollstaendig is not null
      and exists (select 1 from public.push_abos a where a.user_id = s.user_id)
  )
  select * from grundtaetigkeiten
  union all select * from alter_wochenblick
  union all select * from partner
  union all select * from neue_wochenrueckblicke
  union all select * from fertige_wochenberichte;
$$;

revoke all on function public.aktivitaets_kandidaten(timestamptz)
  from public, anon, authenticated;
grant execute on function public.aktivitaets_kandidaten(timestamptz) to service_role;
