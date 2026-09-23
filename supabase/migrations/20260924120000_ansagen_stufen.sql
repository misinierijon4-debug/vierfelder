-- Ansagen mit Stufen, Kontern und „du auch" (docs/ansagen.md, Version 2).
--
-- Die erste Fassung (`20260922120000_duell_ansagen.sql`) war zu leicht: das
-- Ziel kam aus dem Median der gemessenen Tage plus eins, und wer ein Feld nie
-- macht, bekam „1× gym" — fuer den Herausforderer praktisch geschenkt.
--
-- Ab hier:
--
-- 1. Wer ansagt, waehlt Feld und Stufe (sicher ±1, mutig ±2, all-in ±3). Das
--    Ziel kommt aus dem Wochenschnitt der herausgeforderten Person (x1,3,
--    x1,6, x2, aufgerundet), nie unter einem Mindestwert je Feld, jede Stufe
--    mindestens eins ueber der vorigen. Ein Feld, das sie in vier Wochen an
--    weniger als zwei Tagen hatte, ist gesperrt.
-- 2. Schafft sie es bis Sonntag 18 Uhr, bekommt SIE den Einsatz. Verfehlt
--    sie, bekommt ihn, wer angesagt hat. Offen zaehlt nichts.
-- 3. Gezaehlt wird wie im Duell ein Tag je Feld, getippt oder gemessen — aber
--    nur, was nach der Ansage passiert und am selben Tag eingetragen wurde.
-- 4. Ansagen bis 48 Stunden vor der Frist (Freitag 18 Uhr), 2 je Woche,
--    davon hoechstens eine all-in. Lernen ist dazugekommen.
-- 5. Die herausgeforderte Person reagiert hoechstens einmal, binnen 24
--    Stunden: kontern (Einsatz doppelt, nur solange bei ihr nichts gezaehlt
--    hat) oder „du auch" (dieselbe Ansage in die Gegenrichtung, eine eigene
--    Zeile mit `bezug`, gezaehlt ab derselben Ansage).
-- 6. Wochenabrechnung Version 3. Version 1 und 2 bleiben, wie archiviert.
--
-- Zeilen der ersten Fassung (`version = 1`) bleiben gueltig und werden nach
-- ihren alten Regeln entschieden und gewertet. Der alte RPC `sage_an(id,
-- feld)` legt nichts mehr an und meldet `ansage:veraltet` — eine alte App im
-- Cache zeigt dann einen Hinweis statt still eine Ansage nach alten Regeln.
--
-- Der Client rechnet dasselbe in `src/lib/ansagen.ts`. Pruefung:
-- `node scripts/check-ansagen-stufen.mjs <pglite/dist/index.js>`.

-- ------------------------------------------------------ einheiten.erstellt

-- Wie beim Gewicht: den Zeitpunkt der Eintragung setzt nur die Datenbank.
-- Eine Ansage zaehlt eine getippte Einheit nur, wenn sie am selben Tag kam.
create or replace function private.einheiten_erstellt_fest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.erstellt := pg_catalog.now();
  else
    new.erstellt := old.erstellt;
  end if;
  return new;
end;
$$;

revoke all on function private.einheiten_erstellt_fest() from public, anon, authenticated;

drop trigger if exists einheiten_erstellt_fest on public.einheiten;
create trigger einheiten_erstellt_fest
  before insert or update on public.einheiten
  for each row execute function private.einheiten_erstellt_fest();

-- ------------------------------------------------------------- Spalten

alter table public.duell_ansagen
  add column if not exists version smallint not null default 1,
  add column if not exists stufe text,
  add column if not exists einsatz smallint not null default 1,
  add column if not exists reaktion text,
  add column if not exists reaktion_am timestamptz,
  add column if not exists bezug uuid references public.duell_ansagen(id) on delete cascade;

comment on column public.duell_ansagen.version is
  '1 = erste Fassung (Wette aufs Scheitern, -1 sofort, Frist Samstag); 2 = Stufen, Frist Sonntag 18 Uhr';
comment on column public.duell_ansagen.an is
  'wer liefern muss. Version 2: schafft sie es, bekommt sie den Einsatz, sonst `von`';
comment on column public.duell_ansagen.bezug is
  'gesetzt bei „du auch": die Ansage, auf die geantwortet wurde. Kostet kein Kontingent';

alter table public.duell_ansagen
  drop constraint if exists duell_ansagen_feld_check,
  drop constraint if exists duell_ansagen_zeitraum,
  drop constraint if exists duell_ansagen_ziel,
  drop constraint if exists duell_ansagen_feld_je_woche,
  drop constraint if exists duell_ansagen_version,
  drop constraint if exists duell_ansagen_stufe,
  drop constraint if exists duell_ansagen_reaktion;

alter table public.duell_ansagen
  add constraint duell_ansagen_version check (version in (1, 2)),
  add constraint duell_ansagen_feld_check check (
    feld in ('gym', 'boxen', 'lesen', 'gewicht') or (version = 2 and feld = 'lernen')
  ),
  -- Version 1: morgen bis Samstag. Version 2: ab dem Tag der Ansage bis Sonntag.
  add constraint duell_ansagen_zeitraum check (
    (version = 1 and extract(isodow from bis) = 6 and ab between bis - 4 and bis - 1)
    or (version = 2 and extract(isodow from bis) = 7 and ab between bis - 6 and bis)
  ),
  add constraint duell_ansagen_ziel check (
    (version = 1 and ziel >= 1 and ziel <= bis - ab)
    or (version = 2 and ziel between 1 and 7 and ziel <= bis - ab + 1)
  ),
  add constraint duell_ansagen_stufe check (
    (version = 1 and stufe is null and einsatz = 1 and reaktion is null and bezug is null)
    or (
      version = 2
      and (
        (stufe = 'sicher' and einsatz = 1)
        or (stufe = 'mutig' and einsatz = 2)
        or (stufe = 'allin' and einsatz = 3)
      )
    )
  ),
  -- auf eine „du auch"-Zeile gibt es keine Reaktion
  add constraint duell_ansagen_reaktion check (
    (reaktion is null) = (reaktion_am is null)
    and (reaktion is null or (reaktion in ('kontern', 'duAuch') and bezug is null))
  );

-- dasselbe Feld nur einmal je Woche und Herausforderer; „du auch" zaehlt nicht mit
create unique index if not exists duell_ansagen_feld_je_woche_idx
  on public.duell_ansagen (von, feld, bis) where bezug is null;
-- hoechstens eine Gegenrichtung je Ansage
create unique index if not exists duell_ansagen_ein_bezug_idx
  on public.duell_ansagen (bezug) where bezug is not null;

-- ---------------------------------------------------------- Zaehlregeln

-- Die Form: Tage mit Punkt wie im Duell — getippt, gemessen oder gewogen.
-- Eine Messung, die erst nach Sonntag 24 Uhr endet, gehoert nicht in ihre
-- Woche (wie `vorWochenschluss`).
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
  where p_feld in ('lernen', 'gym', 'boxen', 'lesen')
    and e.user_id = p_user
    and e.bereich = p_feld
    and e.tag between p_von and p_bis
  union
  select (a.ankunft at time zone 'Europe/Berlin')::date
  from public.aufenthalte a
  where p_feld in ('lernen', 'gym', 'boxen', 'lesen')
    and a.user_id = p_user
    and a.bereich = p_feld
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
  where p_feld in ('lernen', 'gym', 'boxen', 'lesen')
    and e.user_id = p_user
    and e.bereich = p_feld
    and e.erfasst is not null
    and e.erfasst >= p_ab
    and e.erfasst <= p_frist
    and (e.erfasst at time zone 'Europe/Berlin')::date = e.tag
    and e.erstellt < e.erfasst + interval '1 day'
  union
  select (a.ankunft at time zone 'Europe/Berlin')::date
  from public.aufenthalte a
  where p_feld in ('lernen', 'gym', 'boxen', 'lesen')
    and a.user_id = p_user
    and a.bereich = p_feld
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

-- Tage je Woche in den vier Wochen vor `p_montag`, aelteste zuerst
create or replace function private.ansage_verlauf(p_user uuid, p_feld text, p_montag date)
returns integer[]
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.array_agg(x.n order by x.w desc)
  from (
    select w, (
      select count(*)::integer
      from private.ansage_form_tage(p_user, p_feld, p_montag - 7 * w, p_montag - 7 * w + 6)
    ) as n
    from pg_catalog.generate_series(1, 4) w
  ) x
$$;

revoke all on function private.ansage_verlauf(uuid, text, date)
  from public, anon, authenticated;

-- Das Ziel einer Stufe, oder null, wenn es nicht mehr in die Woche passt
-- (sicher und mutig mit einem Tag Spielraum, all-in ohne). Gleich wie
-- `ansageZiele` im Browser.
create or replace function private.ansage_ziel_stufe(
  p_feld text,
  p_verlauf integer[],
  p_stufe text,
  p_verfuegbar integer
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_schnitt numeric := coalesce((select avg(x) from pg_catalog.unnest(p_verlauf) x), 0);
  v_vorher integer := 0;
  v_ziel integer;
  v_stufe text;
begin
  foreach v_stufe in array array['sicher', 'mutig', 'allin'] loop
    v_ziel := greatest(
      case p_feld
        when 'gewicht' then case v_stufe when 'sicher' then 4 when 'mutig' then 5 else 6 end
        when 'lernen' then case v_stufe when 'sicher' then 1 when 'mutig' then 2 else 3 end
        else case v_stufe when 'sicher' then 2 when 'mutig' then 3 else 4 end
      end,
      pg_catalog.ceil(pg_catalog.round(
        v_schnitt * case v_stufe when 'sicher' then 1.3 when 'mutig' then 1.6 else 2 end, 3
      ))::integer,
      v_vorher + 1
    );
    v_vorher := v_ziel;
    if v_stufe = p_stufe then
      return case
        when v_ziel <= least(7, case when v_stufe = 'allin' then p_verfuegbar else p_verfuegbar - 1 end)
          then v_ziel
      end;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function private.ansage_ziel_stufe(text, integer[], text, integer)
  from public, anon, authenticated;

-- ------------------------------------------------------------- Anlegen

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
  if p_feld is null or p_feld not in ('gym', 'boxen', 'lesen', 'lernen', 'gewicht') then
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

create or replace function private.sage_an_stufe(p_id uuid, p_feld text, p_stufe text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.sage_an_stufe_um(auth.uid(), p_id, p_feld, p_stufe, pg_catalog.clock_timestamp())
$$;

revoke all on function private.sage_an_stufe(uuid, text, text) from public, anon, authenticated;
grant execute on function private.sage_an_stufe(uuid, text, text) to authenticated;

create or replace function public.sage_an_stufe(p_id uuid, p_feld text, p_stufe text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.sage_an_stufe(p_id, p_feld, p_stufe)
$$;

revoke all on function public.sage_an_stufe(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sage_an_stufe(uuid, text, text) to authenticated;

-- Die erste Fassung legt nichts mehr an. Die Signatur bleibt, damit eine
-- alte App einen verstaendlichen Grund bekommt statt „Funktion fehlt".
create or replace function private.sage_an(p_id uuid, p_feld text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise check_violation using message = 'ansage:veraltet';
end;
$$;

-- ----------------------------------------------------------- Reagieren

create or replace function private.reagiere_auf_ansage_um(
  p_wer uuid,
  p_ansage uuid,
  p_id uuid,
  p_art text,
  p_jetzt timestamptz
)
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zweikampf:ansage-reaktion:' || p_ansage::text, 0)
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

create or replace function private.reagiere_auf_ansage(p_ansage uuid, p_id uuid, p_art text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.reagiere_auf_ansage_um(auth.uid(), p_ansage, p_id, p_art, pg_catalog.clock_timestamp())
$$;

revoke all on function private.reagiere_auf_ansage(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.reagiere_auf_ansage(uuid, uuid, text) to authenticated;

create or replace function public.reagiere_auf_ansage(p_ansage uuid, p_id uuid, p_art text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.reagiere_auf_ansage(p_ansage, p_id, p_art)
$$;

revoke all on function public.reagiere_auf_ansage(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reagiere_auf_ansage(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------- Einfrieren

-- Version 2: geschafft sofort, verfehlt mit der Frist Sonntag 18 Uhr — was
-- dann noch laeuft, ist nicht fertig und zaehlt nicht. Version 1 unveraendert:
-- verfehlt ab Mitternacht nach dem Samstag, mit Nachlauf bis 3 Uhr fuer eine
-- Sitzung vom Samstagabend.
create or replace function private.entscheide_duell_ansagen(p_jetzt timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jetzt timestamptz := coalesce(p_jetzt, pg_catalog.now());
  v_lokal timestamp without time zone := pg_catalog.timezone('Europe/Berlin', coalesce(p_jetzt, pg_catalog.now()));
  v_zwei integer;
  v_eins integer;
begin
  with offen as (
    select d.id, d.ziel,
      (d.bis + time '18:00') at time zone 'Europe/Berlin' as frist,
      (
        select count(*)
        from private.ansage_ehrliche_tage(
          d.an, d.feld, d.erstellt_am,
          least(v_jetzt, (d.bis + time '18:00') at time zone 'Europe/Berlin')
        )
      )::integer as erreicht
    from public.duell_ansagen d
    where d.ergebnis is null
      and d.version = 2
      and d.erstellt_am <= v_jetzt
  ),
  faellig as (
    select o.id,
      case when o.erreicht >= o.ziel then 'geschafft' else 'verfehlt' end as ergebnis
    from offen o
    where o.erreicht >= o.ziel or v_jetzt >= o.frist
  )
  update public.duell_ansagen d
  set ergebnis = f.ergebnis, entschieden_am = v_jetzt
  from faellig f
  where d.id = f.id and d.ergebnis is null;
  get diagnostics v_zwei = row_count;

  with offen as (
    select d.id, d.an, d.feld, d.ab, d.bis, d.ziel,
      (
        select count(*)
        from private.ansage_tage(d.an, d.feld, d.ab, least(d.bis, v_lokal::date), true)
      )::integer as erreicht
    from public.duell_ansagen d
    where d.ergebnis is null
      and d.version = 1
      and d.ab <= v_lokal::date
  ),
  faellig as (
    select o.id,
      case when o.erreicht >= o.ziel then 'geschafft' else 'verfehlt' end as ergebnis
    from offen o
    where o.erreicht >= o.ziel
      or (
        v_lokal >= (o.bis + 1)::timestamp
        and (
          v_lokal >= (o.bis + 1)::timestamp + interval '3 hours'
          or not exists (
            select 1 from public.aufenthalte a
            where a.user_id = o.an
              and a.bereich = o.feld
              and a.abgang is null
              and (a.ankunft at time zone 'Europe/Berlin')::date = o.bis
          )
        )
      )
  )
  update public.duell_ansagen d
  set ergebnis = f.ergebnis, entschieden_am = v_jetzt
  from faellig f
  where d.id = f.id and d.ergebnis is null;
  get diagnostics v_eins = row_count;

  return v_zwei + v_eins;
end;
$$;

revoke all on function private.entscheide_duell_ansagen(timestamptz)
  from public, anon, authenticated;

-- ------------------------------------------ Wochenabrechnung Version 3

-- Version 3 wertet Ansagen der zweiten Fassung: der Einsatz (gekontert
-- doppelt) geht an `an`, wenn geschafft, sonst an `von`. Zeilen der ersten
-- Fassung zaehlen wie in Version 2. Die Ansage-Punkte einer Person liegen
-- damit zwischen -2 und 36 (zwei Ansagen je Seite, all-in gekontert 6, dazu
-- die Gegenrichtungen) — die Grenzen unten lassen Luft.

alter table public.wochenabrechnung
  drop constraint if exists wochenabrechnung_ansage_erijon_check,
  drop constraint if exists wochenabrechnung_ansage_koray_check,
  drop constraint if exists wochenabrechnung_differenz_check,
  drop constraint if exists wochenabrechnung_punkte_erijon_check,
  drop constraint if exists wochenabrechnung_punkte_koray_check,
  drop constraint if exists wochenabrechnung_server_invariante;

alter table public.wochenabrechnung
  add constraint wochenabrechnung_ansage_erijon_check check (ansage_erijon between -2 and 40),
  add constraint wochenabrechnung_ansage_koray_check check (ansage_koray between -2 and 40),
  add constraint wochenabrechnung_differenz_check check (differenz between -77 and 77),
  add constraint wochenabrechnung_punkte_erijon_check check (punkte_erijon between -2 and 75),
  add constraint wochenabrechnung_punkte_koray_check check (punkte_koray between -2 and 75),
  add constraint wochenabrechnung_server_invariante check (
    (
      berechnung_version = 0
      and archiv_quelle = 'legacy_client'
      and punkte_erijon is null
      and punkte_koray is null
      and ansage_erijon is null
      and ansage_koray is null
    )
    or
    (
      berechnung_version in (1, 2, 3)
      and archiv_quelle in ('server_planmaessig', 'server_nachgeholt')
      and punkte_erijon is not null
      and punkte_koray is not null
      and (
        (
          berechnung_version = 1
          and ansage_erijon is null
          and ansage_koray is null
          and punkte_erijon between 0 and 35
          and punkte_koray between 0 and 35
        )
        or (
          berechnung_version in (2, 3)
          and ansage_erijon is not null
          and ansage_koray is not null
          and punkte_erijon - ansage_erijon between 0 and 35
          and punkte_koray - ansage_koray between 0 and 35
        )
      )
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

comment on column public.wochenabrechnung.berechnung_version is
  '0 = bestehendes Clientarchiv; 1 = serverseitige Fuenf-Felder-Regel; 2 = zusaetzlich Ansagen; 3 = Ansagen mit Stufen';

-- Unveraendert aus `20260923090000_wochenschluss_mitternacht.sql` bis auf
-- den Block `ansagen` und die Versionsnummer 3.
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

  -- Jede Ansage dieser Woche ist am Sonntag um 18 Uhr entscheidbar (Version 2
  -- hat genau dann Frist). Der Cron hat das meist schon getan.
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
  -- Version 3: Ansagen der zweiten Fassung geben den Einsatz (gekontert
  -- doppelt) an `an`, wenn geschafft, sonst an `von`. Eine unerwartet noch
  -- offene zaehlt nichts. Zeilen der ersten Fassung wie in Version 2.
  ansagen as (
    select
      coalesce(sum(
        case
          when d.version = 1 and d.von = p.erijon
            then case when d.ergebnis = 'verfehlt' then 1 else -1 end
          when d.version = 2 and (
            (d.ergebnis = 'geschafft' and d.an = p.erijon)
            or (d.ergebnis = 'verfehlt' and d.von = p.erijon)
          )
            then d.einsatz * case when d.reaktion = 'kontern' then 2 else 1 end
          else 0
        end
      ), 0)::integer as ansage_erijon,
      coalesce(sum(
        case
          when d.version = 1 and d.von = p.koray
            then case when d.ergebnis = 'verfehlt' then 1 else -1 end
          when d.version = 2 and (
            (d.ergebnis = 'geschafft' and d.an = p.koray)
            or (d.ergebnis = 'verfehlt' and d.von = p.koray)
          )
            then d.einsatz * case when d.reaktion = 'kontern' then 2 else 1 end
          else 0
        end
      ), 0)::integer as ansage_koray
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
    3,
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

-- ---------------------------------------------------------------- Push

-- Unveraendert aus `20260922120000_duell_ansagen.sql` bis auf den Block
-- `neue_ansagen`. Die Art `ansage` kennt der Worker schon.

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
  )
  select * from grundtaetigkeiten
  union all select * from alter_wochenblick
  union all select * from partner
  union all select * from neue_wochenrueckblicke
  union all select * from fertige_wochenberichte
  union all select * from neue_ansagen;
$$;

revoke all on function public.aktivitaets_kandidaten(timestamptz)
  from public, anon, authenticated;
grant execute on function public.aktivitaets_kandidaten(timestamptz) to service_role;
