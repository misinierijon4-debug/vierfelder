-- Eine abgeschlossene Woche ist eine unveraenderliche fachliche Wahrheit.
-- Bisher lieferte der Browser Sieger, Abstand und Belegwerte selbst und durfte
-- die erste Zeile direkt einfuegen. Ein Duo-Mitglied (oder kompromittierter
-- Client) konnte damit beliebige Werte dauerhaft als Archiv festschreiben.
--
-- Ab hier nimmt der oeffentliche Vertrag nur noch den Wochenmontag an. Die
-- Datenbank berechnet dieselbe bestehende Fuenf-Felder-Regel aus den
-- kanonischen Tabellen und setzt den Tiebreak aus gemessenen Aufenthalten.

alter table public.wochenabrechnung
  add column if not exists berechnung_version smallint not null default 0
    check (berechnung_version between 0 and 32767),
  add column if not exists archiv_quelle text not null default 'legacy_client'
    check (archiv_quelle in ('legacy_client', 'server_planmaessig', 'server_nachgeholt')),
  add column if not exists punkte_erijon smallint
    check (punkte_erijon between 0 and 35),
  add column if not exists punkte_koray smallint
    check (punkte_koray between 0 and 35),
  add column if not exists abgeschlossen_von uuid
    references public.profile(id) on delete set null;

comment on column public.wochenabrechnung.berechnung_version is
  '0 = bestehendes Clientarchiv; 1 = serverseitige Fuenf-Felder-Regel';
comment on column public.wochenabrechnung.archiv_quelle is
  'legacy_client, planmaessig am Sonntag oder nach einer verpassten Finalisierung';
comment on column public.wochenabrechnung.punkte_erijon is
  'Auditwert der serverseitigen Berechnung; bei Legacy-Archiven unbekannt';
comment on column public.wochenabrechnung.punkte_koray is
  'Auditwert der serverseitigen Berechnung; bei Legacy-Archiven unbekannt';
comment on column public.wochenabrechnung.abgeschlossen_von is
  'Duo-Mitglied, das die idempotente Finalisierung ausgeloest hat';

alter table public.wochenabrechnung
  drop constraint if exists wochenabrechnung_server_invariante;
alter table public.wochenabrechnung
  add constraint wochenabrechnung_server_invariante check (
    (
      berechnung_version = 0
      and archiv_quelle = 'legacy_client'
      and punkte_erijon is null
      and punkte_koray is null
    )
    or
    (
      berechnung_version = 1
      and archiv_quelle in ('server_planmaessig', 'server_nachgeholt')
      and punkte_erijon is not null
      and punkte_koray is not null
      and differenz = punkte_erijon - punkte_koray
      and (
        (punkte_erijon > punkte_koray and sieger = 'erijon' and grund = 'punkte')
        or (punkte_erijon < punkte_koray and sieger = 'koray' and grund = 'punkte')
        or (
          punkte_erijon = punkte_koray
          and beleg_erijon > beleg_koray
          and sieger = 'erijon'
          and grund = 'beleg'
        )
        or (
          punkte_erijon = punkte_koray
          and beleg_erijon < beleg_koray
          and sieger = 'koray'
          and grund = 'beleg'
        )
        or (
          punkte_erijon = punkte_koray
          and beleg_erijon = beleg_koray
          and sieger = 'unentschieden'
          and grund = 'unentschieden'
        )
      )
    )
  );

-- Niemand ausser der RPC darf eine neue Archivwahrheit schreiben. SELECT
-- bleibt fuer beide Profile bestehen; UPDATE und DELETE waren nie freigegeben.
revoke insert on table public.wochenabrechnung from public, anon, authenticated;
drop policy if exists "wochenabrechnung schreiben" on public.wochenabrechnung;

create or replace function private.finalisiere_wochenabrechnung(p_woche date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aufrufer uuid := auth.uid();
  v_lokal_jetzt timestamp without time zone :=
    pg_catalog.timezone('Europe/Berlin', pg_catalog.clock_timestamp());
  v_archiv public.wochenabrechnung%rowtype;
begin
  if v_aufrufer is null or not exists (
    select 1 from public.profile p where p.id = v_aufrufer
  ) then
    raise insufficient_privilege using message = 'nur ein zweikampf-profil darf wochen abschliessen';
  end if;

  if p_woche is null or extract(isodow from p_woche) <> 1 then
    raise invalid_parameter_value using message = 'p_woche muss ein montag sein';
  end if;

  -- Vergangene, verpasste Abschluesse sind erlaubt. Die laufende Woche erst
  -- am Sonntag ab 18 Uhr Europe/Berlin; kuenftige Wochen niemals.
  if p_woche + 6 > v_lokal_jetzt::date
    or (
      p_woche + 6 = v_lokal_jetzt::date
      and v_lokal_jetzt::time < time '18:00'
    )
  then
    raise check_violation using message = 'diese woche ist noch nicht abgeschlossen';
  end if;

  -- Pro Kalenderwoche darf genau ein Transaktionspfad rechnen. Der zweite
  -- Aufruf wartet und sieht danach bereits die kanonische erste Zeile.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zweikampf:wochenabrechnung:' || p_woche::text, 0)
  );

  -- First-write-wins bleibt die unveraenderliche Grundlage. Das gilt auch fuer
  -- Altarchive: Sie werden nicht nachtraeglich aus veraenderten Rohdaten neu
  -- erfunden, sondern durch Version 0 klar als Legacy kenntlich gemacht.
  select w.* into v_archiv
  from public.wochenabrechnung w
  where w.woche = p_woche;
  if found then
    return pg_catalog.to_jsonb(v_archiv);
  end if;

  if (select count(*) from public.profile p where p.person in ('erijon', 'koray')) <> 2 then
    raise data_exception using message = 'die beiden zweikampf-profile sind nicht vollstaendig';
  end if;

  -- Ein Punkt je Bereich und Kalendertag. Mehrere Einheiten bleiben ein Tick;
  -- eine manuelle und eine gemessene Quelle desselben Bereichs werden durch
  -- UNION ebenfalls nur einmal gezaehlt. Gewicht ist das fuenfte Feld. Alle
  -- Rohdaten, die Wette und die abgeleiteten Werte werden in EINEM Statement
  -- gelesen, damit READ COMMITTED keinen gemischten Zwischenstand archiviert.
  with personen as (
    select
      (select p.id from public.profile p where p.person = 'erijon') as erijon,
      (select p.id from public.profile p where p.person = 'koray') as koray
  ),
  gemessene as (
    select distinct
      a.user_id,
      a.bereich,
      (a.ankunft at time zone 'Europe/Berlin')::date as tag
    from public.aufenthalte a
    where (a.ankunft at time zone 'Europe/Berlin')::date between p_woche and p_woche + 6
      and a.bereich in ('lernen', 'gym', 'boxen', 'lesen')
      and a.abgang is not null
      and a.abgang >= a.ankunft + case
        when a.bereich = 'lesen' then interval '10 minutes'
        else interval '20 minutes'
      end
  ),
  ticks as (
    select e.user_id, e.bereich, e.tag
    from public.einheiten e
    where e.tag between p_woche and p_woche + 6
      and e.bereich in ('lernen', 'gym', 'boxen', 'lesen')
    union
    select g.user_id, g.bereich, g.tag
    from gemessene g
    union
    select g.user_id, 'gewicht'::text, g.tag
    from public.gewicht g
    where g.tag between p_woche and p_woche + 6
  ),
  punkte as (
    select
      count(*) filter (where t.user_id = p.erijon)::integer as punkte_erijon,
      count(*) filter (where t.user_id = p.koray)::integer as punkte_koray
    from personen p
    left join ticks t on true
    group by p.erijon, p.koray
  ),
  belege as (
    select
      count(*) filter (where m.user_id = p.erijon)::integer as beleg_erijon,
      count(*) filter (where m.user_id = p.koray)::integer as beleg_koray
    from personen p
    left join gemessene m on true
    group by p.erijon, p.koray
  ),
  werte as (
    select p.punkte_erijon, p.punkte_koray, b.beleg_erijon, b.beleg_koray
    from punkte p cross join belege b
  )
  insert into public.wochenabrechnung (
    woche, sieger, grund, differenz, beleg_erijon, beleg_koray, wette,
    berechnung_version, archiv_quelle, punkte_erijon, punkte_koray,
    abgeschlossen_von
  )
  select
    p_woche,
    case
      when w.punkte_erijon <> w.punkte_koray
        then case when w.punkte_erijon > w.punkte_koray then 'erijon' else 'koray' end
      when w.beleg_erijon <> w.beleg_koray
        then case when w.beleg_erijon > w.beleg_koray then 'erijon' else 'koray' end
      else 'unentschieden'
    end,
    case
      when w.punkte_erijon <> w.punkte_koray then 'punkte'
      when w.beleg_erijon <> w.beleg_koray then 'beleg'
      else 'unentschieden'
    end,
    w.punkte_erijon - w.punkte_koray,
    w.beleg_erijon,
    w.beleg_koray,
    (select pg_catalog.btrim(d.text) from public.duell_wetten d where d.woche = p_woche),
    1,
    case
      when p_woche + 6 = v_lokal_jetzt::date then 'server_planmaessig'
      else 'server_nachgeholt'
    end,
    w.punkte_erijon,
    w.punkte_koray,
    v_aufrufer
  from werte w
  on conflict (woche) do nothing
  returning * into v_archiv;

  -- Zwei gleichzeitige Aufrufe sehen nach dem Unique-Konflikt dieselbe erste
  -- Zeile. Der zweite Client erfindet kein eigenes Ergebnis.
  if not found then
    select w.* into v_archiv
    from public.wochenabrechnung w
    where w.woche = p_woche;
  end if;

  if v_archiv.woche is null then
    raise data_exception using message = 'wochenabschluss wurde nicht bestaetigt';
  end if;
  return pg_catalog.to_jsonb(v_archiv);
end;
$$;

revoke all on function private.finalisiere_wochenabrechnung(date)
  from public, anon, authenticated;
grant execute on function private.finalisiere_wochenabrechnung(date)
  to authenticated;

-- Nur der schmale SECURITY-INVOKER-Wrapper liegt im von PostgREST exponierten
-- Schema. Der privilegierte Kern bleibt im nicht exponierten private-Schema.
create or replace function public.finalisiere_wochenabrechnung(p_woche date)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.finalisiere_wochenabrechnung(p_woche)
$$;

revoke all on function public.finalisiere_wochenabrechnung(date)
  from public, anon, authenticated;
grant execute on function public.finalisiere_wochenabrechnung(date)
  to authenticated;

comment on function public.finalisiere_wochenabrechnung(date) is
  'Idempotenter serverautoritiver Wochenabschluss aus Einheiten, Aufenthalten, Gewicht und Wette';
