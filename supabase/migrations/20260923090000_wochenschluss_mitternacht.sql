-- Wochenschluss um Mitternacht.
--
-- KW 38 (14.-20.09.2026): Koray boxte Sonntag 23:45 bis Montag 00:20. Der am
-- Montag eingefrorene Wochenbericht sah die Sitzung noch offen und zeigte
-- 11:11; die Duell-Abrechnung lief um 00:20:52 und zaehlte sie mit — 11:12.
--
-- Regel ab jetzt, in Client (`vorWochenschluss` in src/lib/training.ts) und
-- Server gleich: eine Messung zaehlt nur, wenn sie vor Montag 0 Uhr
-- (Europe/Berlin) zu Ende ist. Unter der Woche bleibt es beim Tag des Beginns.
--
-- Die Funktion ist bis auf die eine Bedingung in `gemessene` unveraendert aus
-- `20260922120000_duell_ansagen.sql` uebernommen.

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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zweikampf:wochenabrechnung:' || p_woche::text, 0)
  );

  select w.* into v_archiv
  from public.wochenabrechnung w
  where w.woche = p_woche;
  if found then
    return pg_catalog.to_jsonb(v_archiv);
  end if;

  if (select count(*) from public.profile p where p.person in ('erijon', 'koray')) <> 2 then
    raise data_exception using message = 'die beiden zweikampf-profile sind nicht vollstaendig';
  end if;

  -- Neu: Jede Ansage dieser Woche endet am Samstag und ist am Sonntag um
  -- 18 Uhr entscheidbar. Der Cron hat das meist schon getan; hier wird es
  -- sicher, bevor gerechnet wird.
  perform private.entscheide_duell_ansagen();

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
      -- neu: sonntag 24 uhr ist schluss. was erst am montag endet, war beim
      -- wochenschluss noch offen und zaehlt fuer diese woche nicht.
      and a.abgang < pg_catalog.timezone('Europe/Berlin', (p_woche + 7)::timestamp)
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
      count(*) filter (where t.user_id = p.erijon)::integer as felder_erijon,
      count(*) filter (where t.user_id = p.koray)::integer as felder_koray
    from personen p
    left join ticks t on true
    group by p.erijon, p.koray
  ),
  -- Neu: +1 fuer den Herausforderer, wenn die andere Person verfehlt hat,
  -- sonst -1 — auch fuer eine Ansage, die (unerwartet) noch offen ist: der
  -- Einsatz ist dann gehalten, wie in der Anzeige.
  ansagen as (
    select
      coalesce(sum(case when d.ergebnis = 'verfehlt' then 1 else -1 end)
        filter (where d.von = p.erijon), 0)::integer as ansage_erijon,
      coalesce(sum(case when d.ergebnis = 'verfehlt' then 1 else -1 end)
        filter (where d.von = p.koray), 0)::integer as ansage_koray
    from personen p
    left join public.duell_ansagen d on d.bis between p_woche and p_woche + 6
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
    select
      p.felder_erijon + a.ansage_erijon as punkte_erijon,
      p.felder_koray + a.ansage_koray as punkte_koray,
      a.ansage_erijon,
      a.ansage_koray,
      b.beleg_erijon,
      b.beleg_koray
    from punkte p cross join ansagen a cross join belege b
  )
  insert into public.wochenabrechnung (
    woche, sieger, grund, differenz, beleg_erijon, beleg_koray, wette,
    berechnung_version, archiv_quelle, punkte_erijon, punkte_koray,
    ansage_erijon, ansage_koray, abgeschlossen_von
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
    2,
    case
      when p_woche + 6 = v_lokal_jetzt::date then 'server_planmaessig'
      else 'server_nachgeholt'
    end,
    w.punkte_erijon,
    w.punkte_koray,
    w.ansage_erijon,
    w.ansage_koray,
    v_aufrufer
  from werte w
  on conflict (woche) do nothing
  returning * into v_archiv;

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


-- ------------------------------------------------- KW 38 richtigstellen
-- Nur die eine Zeile, und nur wenn sie noch genau so dasteht wie falsch
-- archiviert: ohne die Sitzung ueber Mitternacht hat Koray 11 Punkte und
-- 7 Belege. Punktgleich entscheidet die Belegquote (8 zu 7).
update public.wochenabrechnung
set punkte_koray = 11,
    beleg_koray = 7,
    differenz = 0,
    sieger = 'erijon',
    grund = 'beleg'
where woche = date '2026-09-14'
  and berechnung_version = 1
  and punkte_erijon = 11
  and punkte_koray = 12
  and beleg_erijon = 8
  and beleg_koray = 8;
