-- Gym und Boxen bilden fuer neue Ansagen ein gemeinsames Feld. UNION zaehlt
-- beide Bereiche am selben Kalendertag nur einmal. Alte Ansagen bleiben
-- mit ihrem gespeicherten Feld und dessen bisheriger Wertung erhalten.
alter table public.duell_ansagen drop constraint duell_ansagen_feld_check;
alter table public.duell_ansagen add constraint duell_ansagen_feld_check check (
  feld in ('gym', 'boxen', 'lesen', 'gewicht')
  or (version = 2 and feld in ('lernen', 'training'))
);

create or replace function private.ansage_form_tage(
  p_user uuid,
  p_feld text,
  p_von date,
  p_bis date
)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  select e.tag
  from public.einheiten e
  where p_feld in ('training', 'lernen', 'gym', 'boxen', 'lesen')
    and e.user_id = p_user
    and (e.bereich = p_feld or (p_feld = 'training' and e.bereich in ('gym', 'boxen')))
    and e.tag between p_von and p_bis
  union
  select (a.ankunft at time zone 'Europe/Berlin')::date
  from public.aufenthalte a
  where p_feld in ('training', 'lernen', 'gym', 'boxen', 'lesen')
    and a.user_id = p_user
    and (a.bereich = p_feld or (p_feld = 'training' and a.bereich in ('gym', 'boxen')))
    and a.abgang is not null
    and a.abgang >= a.ankunft + case
      when a.bereich = 'lesen' then interval '10 minutes'
      else interval '20 minutes'
    end
    and (a.abgang at time zone 'Europe/Berlin')
      < pg_catalog.date_trunc('week', a.ankunft at time zone 'Europe/Berlin') + interval '7 days'
    and a.ankunft >= (p_von::timestamp at time zone 'Europe/Berlin')
    and a.ankunft < ((p_bis + 1)::timestamp at time zone 'Europe/Berlin')
  union
  select g.tag
  from public.gewicht g
  where p_feld = 'gewicht'
    and g.user_id = p_user
    and g.tag between p_von and p_bis
$$;

revoke all on function private.ansage_form_tage(uuid, text, date, date)
  from public, anon, authenticated;

-- Was fuer eine laufende Ansage zaehlt: begonnen nach `p_ab`, fertig bis zur
-- Frist, am selben Tag eingetragen. Getippte Einheiten nach ihrem
-- Eintragezeitpunkt `erfasst` (wie im Browser); damit er sich nicht
-- zurueckdatieren laesst, muss die Zeile binnen eines Tages angekommen sein
-- (`erstellt` setzt nur die Datenbank). Ein Offline-Eintrag, der abends
-- getippt und morgens gesendet wird, zaehlt so noch.
create or replace function private.ansage_ehrliche_tage(
  p_user uuid,
  p_feld text,
  p_ab timestamptz,
  p_frist timestamptz
)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  select e.tag
  from public.einheiten e
  where p_feld in ('training', 'lernen', 'gym', 'boxen', 'lesen')
    and e.user_id = p_user
    and (e.bereich = p_feld or (p_feld = 'training' and e.bereich in ('gym', 'boxen')))
    and e.erfasst is not null
    and e.erfasst >= p_ab
    and e.erfasst <= p_frist
    and (e.erfasst at time zone 'Europe/Berlin')::date = e.tag
    and e.erstellt < e.erfasst + interval '1 day'
  union
  select (a.ankunft at time zone 'Europe/Berlin')::date
  from public.aufenthalte a
  where p_feld in ('training', 'lernen', 'gym', 'boxen', 'lesen')
    and a.user_id = p_user
    and (a.bereich = p_feld or (p_feld = 'training' and a.bereich in ('gym', 'boxen')))
    and a.abgang is not null
    and a.abgang >= a.ankunft + case
      when a.bereich = 'lesen' then interval '10 minutes'
      else interval '20 minutes'
    end
    and a.ankunft >= p_ab
    and a.abgang <= p_frist
  union
  select g.tag
  from public.gewicht g
  where p_feld = 'gewicht'
    and g.user_id = p_user
    and g.erstellt >= p_ab
    and g.erstellt <= p_frist
    and (g.erstellt at time zone 'Europe/Berlin')::date = g.tag
$$;

revoke all on function private.ansage_ehrliche_tage(uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;


-- Serverseitige Pruefung akzeptiert das neue Ansagefeld.
create or replace function private.sage_an_stufe_um(
  p_von uuid,
  p_id uuid,
  p_feld text,
  p_stufe text,
  p_jetzt timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_an uuid;
  v_lokal timestamp without time zone := pg_catalog.timezone('Europe/Berlin', p_jetzt);
  v_heute date;
  v_montag date;
  v_bis date;
  v_frist timestamptz;
  v_verlauf integer[];
  v_ziel integer;
  v_zeile public.duell_ansagen%rowtype;
begin
  if p_von is null or not exists (
    select 1 from public.profile p
    where p.id = p_von and p.person in ('erijon', 'koray')
  ) then
    raise insufficient_privilege using message = 'nur ein zweikampf-profil darf ansagen';
  end if;

  if p_id is null then
    raise invalid_parameter_value using message = 'ansage braucht eine id';
  end if;
  if p_feld is null or p_feld not in ('training', 'gym', 'boxen', 'lesen', 'lernen', 'gewicht') then
    raise invalid_parameter_value using message = 'ansage braucht ein ansagefeld';
  end if;
  if p_stufe is null or p_stufe not in ('sicher', 'mutig', 'allin') then
    raise invalid_parameter_value using message = 'ansage braucht eine stufe';
  end if;

  select p.id into v_an
  from public.profile p
  where p.person in ('erijon', 'koray') and p.id <> p_von;
  if v_an is null then
    raise data_exception using message = 'die beiden zweikampf-profile sind nicht vollstaendig';
  end if;

  v_heute := v_lokal::date;
  v_montag := pg_catalog.date_trunc('week', v_lokal)::date;
  v_bis := v_montag + 6;
  v_frist := (v_bis + time '18:00') at time zone 'Europe/Berlin';

  -- dieselbe Sperre wie die erste Fassung: ein Herausforderer, eine Woche
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zweikampf:ansage:' || p_von::text || ':' || v_montag::text, 0)
  );

  -- Wiederholt der Browser nach einem Timeout, bestaetigt er dieselbe Zeile.
  select d.* into v_zeile from public.duell_ansagen d where d.id = p_id;
  if found then
    if v_zeile.von <> p_von or v_zeile.feld <> p_feld or v_zeile.stufe is distinct from p_stufe then
      raise unique_violation using message = 'ansage-id ist schon vergeben';
    end if;
    return pg_catalog.to_jsonb(v_zeile);
  end if;

  if v_frist - p_jetzt < interval '48 hours' then
    raise check_violation using message = 'ansage:zuSpaet';
  end if;

  if (
    select count(*) from public.duell_ansagen d
    where d.von = p_von
      and d.bezug is null
      and (d.erstellt_am at time zone 'Europe/Berlin')::date between v_montag and v_bis
  ) >= 2 then
    raise check_violation using message = 'ansage:keineAnsagenMehr';
  end if;

  if p_stufe = 'allin' and exists (
    select 1 from public.duell_ansagen d
    where d.von = p_von
      and d.bezug is null
      and d.stufe = 'allin'
      and (d.erstellt_am at time zone 'Europe/Berlin')::date between v_montag and v_bis
  ) then
    raise check_violation using message = 'ansage:allinVerbraucht';
  end if;

  if exists (
    select 1 from public.duell_ansagen d
    where d.von = p_von and d.feld = p_feld and d.bezug is null
      and d.bis between v_montag and v_bis
  ) then
    raise check_violation using message = 'ansage:schonAngesagt';
  end if;

  v_verlauf := private.ansage_verlauf(v_an, p_feld, v_montag);
  if (select sum(x) from pg_catalog.unnest(v_verlauf) x) < 2 then
    raise check_violation using message = 'ansage:feldInaktiv';
  end if;

  v_ziel := private.ansage_ziel_stufe(p_feld, v_verlauf, p_stufe, v_bis - v_heute + 1);
  if v_ziel is null then
    raise check_violation using message = 'ansage:keinZiel';
  end if;

  insert into public.duell_ansagen (
    id, von, an, feld, ab, bis, ziel, erstellt_am, version, stufe, einsatz
  )
  values (
    p_id, p_von, v_an, p_feld, v_heute, v_bis, v_ziel, p_jetzt, 2, p_stufe,
    case p_stufe when 'sicher' then 1 when 'mutig' then 2 else 3 end
  )
  returning * into v_zeile;

  return pg_catalog.to_jsonb(v_zeile);
end;
$$;

revoke all on function private.sage_an_stufe_um(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;

