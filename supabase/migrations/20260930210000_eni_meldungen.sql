-- ENI meldet sich: zwei Push-Meldungen werden persoenlicher.
--
-- 1. Die Sonntagsmeldung (Art `wochenblick`) nennt nicht mehr nur den Stand,
--    sondern was heute noch geht: Rueckstand, Gleichstand oder Fuehrung und
--    die Felder, die heute noch offen sind. Entschiedene Ansagen dieser Woche
--    zaehlen mit (Regel wie `ansagePunkte` im Client); sind noch welche offen,
--    sagt die Meldung das. Das Fenster beginnt um 18:10 statt 18:00, damit die
--    Ansagen mit Frist 18:00 schon entschieden sind (Cron alle fuenf Minuten).
--
-- 2. Neue Art `aufgabe`: Aufgaben aus ENIs Gedaechtnis mit Frist heute
--    (`eni_erinnerungen.art = 'aufgabe'`, nicht erledigt, `bis` = heute),
--    einmal morgens zwischen 08:30 und 10:00. Schalter `aufgabe_aktiv`, wie
--    alle anderen standardmaessig an. Der Worker kennt die Art (Fenster in
--    `istNochImFenster`), sonst wuerde sie still uebersprungen.
--
-- Keine Datenaenderung. Die Funktion ist die produktive Fassung aus
-- `20260924120000_ansagen_stufen.sql` (Rumpf per MD5 gegen Produktion geprueft)
-- mit genau diesen zwei Aenderungen.

alter table public.erinnerungs_einstellungen
  add column if not exists aufgabe_aktiv boolean not null default true;

alter table public.aktivitaets_versand
  drop constraint if exists aktivitaets_versand_art_check;
alter table public.aktivitaets_versand
  add constraint aktivitaets_versand_art_check
    check (art in ('lernen', 'lesen', 'wochenblick', 'partner', 'wochenrueckblick',
      'wochenbericht', 'ansage', 'aufgabe'));

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
  -- Ansagen dieser Woche, die schon entschieden sind: geschafft bringt dem
  -- Herausgeforderten den Einsatz, verfehlt dem Ansager, gekontert zaehlt
  -- doppelt. Dieselbe Regel wie `ansagePunkte` im Client.
  ansage_punkte as (
    select x.user_id, sum(x.punkte)::integer as punkte
    from (
      select
        case when d.ergebnis = 'geschafft' then d.an else d.von end as user_id,
        coalesce(d.einsatz, case d.stufe when 'mutig' then 2 when 'allin' then 3 else 1 end)
          * case when d.reaktion = 'kontern' then 2 else 1 end as punkte
      from public.duell_ansagen d cross join lokal l
      where d.version = 2
        and d.ergebnis in ('geschafft', 'verfehlt')
        and d.bis between l.montag and l.montag + 6
    ) x
    group by x.user_id
  ),
  ansagen_offen as (
    select count(*)::integer as anzahl
    from public.duell_ansagen d cross join lokal l
    where d.version = 2
      and d.ergebnis is null
      and d.bis between l.montag and l.montag + 6
  ),
  -- Welche Felder heute noch keinen Punkt haben, in der Reihenfolge der App.
  offene_felder as (
    select p.id as user_id, string_agg(f.feld, ', ' order by f.nr) as felder
    from public.profile p
    cross join lokal l
    cross join (values
      (1, 'lernen'), (2, 'gym'), (3, 'boxen'), (4, 'lesen'), (5, 'gewicht')
    ) f(nr, feld)
    where p.person in ('erijon', 'koray')
      and not exists (
        select 1 from stand_ticks t
        where t.user_id = p.id and t.bereich = f.feld and t.tag = l.tag
      )
    group by p.id
  ),
  -- Der Sonntagsstand mit dem, was heute noch geht. Ab 18:10, damit die
  -- Ansagen (Frist 18:00, entschieden alle fuenf Minuten) schon mitzaehlen.
  alter_wochenblick as (
    select
      s.user_id,
      'wochenblick'::text as art,
      l.tag,
      l.tag as sendetag,
      'sonntagsstand: du ' || w.ich || ', ' || w.gegner || ' ' || w.er || '. ' ||
        case
          when w.offen is null then 'heute ist bei dir alles eingetragen.'
          when w.ich < w.er then
            case when w.er - w.ich = 1 then 'dir fehlt 1 punkt'
              else 'dir fehlen ' || (w.er - w.ich) || ' punkte' end ||
            '. heute noch offen: ' || w.offen || '.'
          when w.ich = w.er then 'gleichstand, ein punkt heute entscheidet. offen: ' || w.offen || '.'
          else 'du führst mit ' ||
            case when w.ich - w.er = 1 then '1 punkt' else (w.ich - w.er) || ' punkten' end ||
            '. heute noch offen: ' || w.offen || '.'
        end ||
        case when w.ansagen_offen > 0 then ' ansagen werden noch abgerechnet.' else '' end
        as nachricht,
      './'::text as url
    from public.erinnerungs_einstellungen s
    cross join lokal l
    join lateral (
      select
        me.anzahl + coalesce(ap_me.punkte, 0) as ich,
        gegner.anzahl + coalesce(ap_gegner.punkte, 0) as er,
        gegner.person as gegner,
        me.anzahl + gegner.anzahl as felder_summe,
        o.felder as offen,
        ao.anzahl as ansagen_offen
      from stand me
      join stand gegner on gegner.id <> me.id
      cross join ansagen_offen ao
      left join ansage_punkte ap_me on ap_me.user_id = me.id
      left join ansage_punkte ap_gegner on ap_gegner.user_id = gegner.id
      left join offene_felder o on o.user_id = me.id
      where me.id = s.user_id
    ) w on true
    where s.wochenblick_aktiv
      and l.wochentag = 7
      and l.zeit >= time '18:10' and l.zeit < time '19:00'
      and w.felder_summe > 0
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
  ),
  -- Die Ansage-Meldung, einmal am Tag je Person (Schluessel des Versands),
  -- mit dem juengsten Ereignis des Tages: eine Ansage an dich, oder die
  -- Reaktion auf deine (kontern, du auch). Nachts erst ab 08:00 Uhr.
  neue_ansagen as (
    select
      s.user_id,
      'ansage'::text as art,
      l.tag,
      l.tag as sendetag,
      a.nachricht,
      './'::text as url
    from public.erinnerungs_einstellungen s
    join public.profile p on p.id = s.user_id and p.person in ('erijon', 'koray')
    cross join lokal l
    cross join lateral (
      select x.nachricht
      from (
        select d.erstellt_am as zeit,
          case when d.version = 2 then
            von.person || ' sagt an: ' || d.ziel || '× ' ||
              case d.feld when 'gewicht' then 'wiegen' else d.feld end ||
              ' bis sonntag 18 uhr. ' ||
              case d.stufe when 'allin' then 'all-in' else d.stufe end || ', ' ||
              d.einsatz || case when d.einsatz = 1 then ' punkt' else ' punkte' end ||
              '. kontern oder du auch?'
          else
            von.person || ' sagt an: ' || d.ziel || '× ' ||
              case d.feld when 'gewicht' then 'wiegen' else d.feld end ||
              ' bis samstag. zeig, dass es geht.'
          end as nachricht
        from public.duell_ansagen d
        join public.profile von on von.id = d.von
        where d.an = s.user_id
          and d.bezug is null
          and d.erstellt_am <= l.jetzt
          and (d.erstellt_am at time zone 'Europe/Berlin')::date = l.tag
        union all
        select d.reaktion_am as zeit,
          case d.reaktion
            when 'kontern' then
              gegner.person || ' kontert: ' || d.ziel || '× ' ||
                case d.feld when 'gewicht' then 'wiegen' else d.feld end ||
                ' geht jetzt um ' || (d.einsatz * 2) || ' punkte.'
            else
              gegner.person || ' sagt: du auch. ' || d.ziel || '× ' ||
                case d.feld when 'gewicht' then 'wiegen' else d.feld end ||
                ' bis sonntag 18 uhr, sonst ' || d.einsatz ||
                case when d.einsatz = 1 then ' punkt' else ' punkte' end ||
                ' für ' || gegner.person || '.'
          end as nachricht
        from public.duell_ansagen d
        join public.profile gegner on gegner.id = d.an
        where d.von = s.user_id
          and d.reaktion is not null
          and d.reaktion_am <= l.jetzt
          and (d.reaktion_am at time zone 'Europe/Berlin')::date = l.tag
      ) x
      order by x.zeit desc
      limit 1
    ) a
    where s.ansage_aktiv
      and l.zeit >= time '08:00' and l.zeit < time '22:00'
      and exists (select 1 from public.push_abos x where x.user_id = s.user_id)
  ),
  -- Aufgaben aus ENIs Gedaechtnis mit Frist heute, morgens einmal. Der Text
  -- gehoert der Person selbst und geht nur an sie; mehrere werden gezaehlt.
  faellige_aufgaben as (
    select
      s.user_id,
      'aufgabe'::text as art,
      l.tag,
      l.tag as sendetag,
      'heute fällig: ' ||
        case when char_length(a.erste) > 120 then left(a.erste, 119) || '…' else a.erste end ||
        case
          when a.anzahl = 2 then ' und 1 weitere aufgabe.'
          when a.anzahl > 2 then ' und ' || (a.anzahl - 1) || ' weitere aufgaben.'
          else ''
        end as nachricht,
      './#/eni'::text as url
    from public.erinnerungs_einstellungen s
    join public.profile p on p.id = s.user_id and p.person in ('erijon', 'koray')
    cross join lokal l
    join lateral (
      select
        count(*)::integer as anzahl,
        (array_agg(regexp_replace(btrim(e.text), '\s+', ' ', 'g') order by e.erstellt, e.id))[1] as erste
      from public.eni_erinnerungen e
      where e.user_id = s.user_id
        and e.art = 'aufgabe'
        and not e.erledigt
        and e.bis = l.tag
    ) a on a.anzahl > 0
    where s.aufgabe_aktiv
      and l.zeit >= time '08:30' and l.zeit < time '10:00'
      and exists (select 1 from public.push_abos x where x.user_id = s.user_id)
  )
  select * from grundtaetigkeiten
  union all select * from alter_wochenblick
  union all select * from partner
  union all select * from neue_wochenrueckblicke
  union all select * from fertige_wochenberichte
  union all select * from neue_ansagen
  union all select * from faellige_aufgaben;
$$;

revoke all on function public.aktivitaets_kandidaten(timestamptz)
  from public, anon, authenticated;
grant execute on function public.aktivitaets_kandidaten(timestamptz) to service_role;
