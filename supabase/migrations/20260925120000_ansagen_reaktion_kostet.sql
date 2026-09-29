-- Kontern und „du auch" kosten je eine der zwei Ansagen der Woche.
--
-- Bisher war eine Reaktion frei. Wer beide Ansagen schon gemacht hatte,
-- konnte trotzdem noch auf jede Ansage an sich kontern oder „du auch" sagen
-- (erijon, 25.09.2026: 0 von 2 übrig, die Knöpfe standen trotzdem da).
--
-- Neu, gilt ab sofort:
--   * Verbraucht sind die eigenen Ansagen der Woche (wie bisher, ohne die
--     „du auch"-Zeilen) plus die eigenen Reaktionen, deren `reaktion_am` in
--     dieser Woche liegt.
--   * `sage_an_stufe_um` zählt die Reaktionen mit.
--   * `reagiere_auf_ansage_um` lehnt mit `ansage:keineAnsagenMehr` ab, wenn
--     beide verbraucht sind. Ein wiederholter Knopfdruck nach einem Timeout
--     bekommt weiter dieselbe Antwort, bevor das geprüft wird.
--   * Beide nehmen dieselbe Sperre je Person und Woche, damit eine Ansage und
--     eine Reaktion gleichzeitig nicht zusammen drei ergeben.
--
-- Diese Woche hat bis zum Einspielen niemand reagiert; an bestehenden Zeilen
-- ändert sich nichts. Die Funktionen stehen sonst wie in
-- 20260924210000_ansagen_training.sql.

create or replace function private.ansagen_verbraucht(p_wer uuid, p_montag date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*) from public.duell_ansagen d
    where d.von = p_wer
      and d.bezug is null
      and (d.erstellt_am at time zone 'Europe/Berlin')::date between p_montag and p_montag + 6
  )::integer + (
    select count(*) from public.duell_ansagen d
    where d.an = p_wer
      and d.bezug is null
      and d.reaktion is not null
      and (d.reaktion_am at time zone 'Europe/Berlin')::date between p_montag and p_montag + 6
  )::integer
$$;

revoke all on function private.ansagen_verbraucht(uuid, date) from public, anon, authenticated;

create or replace function private.sage_an_stufe_um(p_von uuid, p_id uuid, p_feld text, p_stufe text, p_jetzt timestamp with time zone)
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

  -- eigene ansagen und eigene reaktionen dieser woche
  if private.ansagen_verbraucht(p_von, v_montag) >= 2 then
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

create or replace function private.reagiere_auf_ansage_um(p_wer uuid, p_ansage uuid, p_id uuid, p_art text, p_jetzt timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.duell_ansagen%rowtype;
  v_gegen public.duell_ansagen%rowtype;
  v_frist timestamptz;
  v_erreicht integer;
  v_montag date;
begin
  if p_wer is null or not exists (
    select 1 from public.profile p
    where p.id = p_wer and p.person in ('erijon', 'koray')
  ) then
    raise insufficient_privilege using message = 'nur ein zweikampf-profil darf reagieren';
  end if;
  if p_ansage is null or p_art is null or p_art not in ('kontern', 'duAuch') then
    raise invalid_parameter_value using message = 'reaktion braucht ansage und art';
  end if;
  if p_art = 'duAuch' and p_id is null then
    raise invalid_parameter_value using message = 'du auch braucht eine id';
  end if;

  v_montag := pg_catalog.date_trunc('week', pg_catalog.timezone('Europe/Berlin', p_jetzt))::date;

  -- erst die ansage, dann dieselbe sperre je person und woche wie beim ansagen
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zweikampf:ansage-reaktion:' || p_ansage::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zweikampf:ansage:' || p_wer::text || ':' || v_montag::text, 0)
  );

  select d.* into v_a from public.duell_ansagen d where d.id = p_ansage for update;
  if not found or v_a.an <> p_wer then
    raise check_violation using message = 'ansage:nichtDeine';
  end if;
  if v_a.version <> 2 or v_a.bezug is not null then
    raise check_violation using message = 'ansage:veraltet';
  end if;

  if v_a.reaktion is not null then
    -- derselbe Knopf nach einem Timeout: dieselbe Antwort
    if v_a.reaktion = p_art and (
      p_art = 'kontern'
      or exists (select 1 from public.duell_ansagen g where g.id = p_id and g.bezug = v_a.id)
    ) then
      select g.* into v_gegen from public.duell_ansagen g where g.bezug = v_a.id;
      return pg_catalog.jsonb_build_object(
        'ansage', pg_catalog.to_jsonb(v_a),
        'gegen', case when v_gegen.id is null then null else pg_catalog.to_jsonb(v_gegen) end
      );
    end if;
    raise check_violation using message = 'ansage:schonReagiert';
  end if;

  v_frist := (v_a.bis + time '18:00') at time zone 'Europe/Berlin';
  if v_a.ergebnis is not null
    or p_jetzt >= least(v_a.erstellt_am + interval '24 hours', v_frist)
  then
    raise check_violation using message = 'ansage:reaktionZuSpaet';
  end if;

  -- eine reaktion kostet eine der zwei ansagen der woche
  if private.ansagen_verbraucht(p_wer, v_montag) >= 2 then
    raise check_violation using message = 'ansage:keineAnsagenMehr';
  end if;

  v_erreicht := (
    select count(*)::integer
    from private.ansage_ehrliche_tage(v_a.an, v_a.feld, v_a.erstellt_am, least(p_jetzt, v_frist))
  );
  if v_erreicht >= v_a.ziel then
    raise check_violation using message = 'ansage:reaktionZuSpaet';
  end if;
  if p_art = 'kontern' and v_erreicht > 0 then
    raise check_violation using message = 'ansage:kontraZuSpaet';
  end if;

  update public.duell_ansagen d
  set reaktion = p_art, reaktion_am = p_jetzt
  where d.id = v_a.id
  returning * into v_a;

  if p_art = 'duAuch' then
    insert into public.duell_ansagen (
      id, von, an, feld, ab, bis, ziel, erstellt_am, version, stufe, einsatz, bezug
    )
    values (
      p_id, v_a.an, v_a.von, v_a.feld, v_a.ab, v_a.bis, v_a.ziel, v_a.erstellt_am,
      2, v_a.stufe, v_a.einsatz, v_a.id
    )
    returning * into v_gegen;
  end if;

  return pg_catalog.jsonb_build_object(
    'ansage', pg_catalog.to_jsonb(v_a),
    'gegen', case when v_gegen.id is null then null else pg_catalog.to_jsonb(v_gegen) end
  );
end;
$$;

revoke all on function private.reagiere_auf_ansage_um(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
