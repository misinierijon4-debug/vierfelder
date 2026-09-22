-- Ansagen: die Herausforderungen im Duell (docs/ansagen.md).
--
-- Wer ansagt, wettet einen Punkt darauf, dass die andere Person ein Ziel bis
-- Samstag nicht schafft. Scheitert sie: +1 fuer den Herausforderer. Schafft sie
-- es: -1. Die herausgeforderte Person bekommt nichts extra.
--
-- Der Browser schickt nur Feld und ID. Ziel, Zeitraum, Kontingent und das
-- Ergebnis rechnet ausschliesslich diese Datenbank, mit denselben Regeln wie
-- `src/lib/ansagen.ts`:
--
-- 1. Tabelle `duell_ansagen`: beide lesen, niemand schreibt direkt.
-- 2. `sage_an`: legt eine Ansage an und rechnet das Ziel aus den vier Wochen
--    davor (Median + 1, auf den Zeitraum heruntergerechnet, ein Tag Spielraum).
-- 3. `entscheide_duell_ansagen`: friert Ergebnisse ein, alle fuenf Minuten per
--    Cron und vor jeder Wochenabrechnung.
-- 4. Wochenabrechnung Version 2: die Ansage-Punkte zaehlen mit.
-- 5. Push „Ansage erhalten" als neue Art `ansage` (Worker zieht mit).
-- 6. `gewicht.erstellt` setzt nur noch die Datenbank. Ein Gewicht zaehlt fuer
--    eine Ansage nur, wenn es am selben Tag eingetragen wurde.

-- ------------------------------------------------------- 6. gewicht.erstellt

-- Die Spalte war frei beschreibbar. Fuer die Ansage entscheidet sie, ob ein
-- Gewicht am selben Tag kam — also setzt sie ab hier nur noch die Datenbank.
-- Ein Upsert, der nur `kg` aendert, behaelt den ersten Zeitpunkt.
create or replace function private.gewicht_erstellt_fest()
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

revoke all on function private.gewicht_erstellt_fest() from public, anon, authenticated;

drop trigger if exists gewicht_erstellt_fest on public.gewicht;
create trigger gewicht_erstellt_fest
  before insert or update on public.gewicht
  for each row execute function private.gewicht_erstellt_fest();

-- ------------------------------------------------------------- 1. Tabelle

create table if not exists public.duell_ansagen (
  id uuid primary key,
  -- wer ansagt und den Einsatz bringt
  von uuid not null references public.profile(id) on delete cascade,
  -- wer liefern muss
  an uuid not null references public.profile(id) on delete cascade,
  feld text not null check (feld in ('gym', 'boxen', 'lesen', 'gewicht')),
  -- erster Tag ist immer der Tag nach der Ansage, letzter immer der Samstag
  ab date not null,
  bis date not null,
  ziel smallint not null,
  erstellt_am timestamptz not null default now(),
  -- das festgeschriebene Ergebnis. Einmal gesetzt, wird nie wieder gerechnet.
  ergebnis text check (ergebnis in ('geschafft', 'verfehlt')),
  entschieden_am timestamptz,
  constraint duell_ansagen_nicht_selbst check (von <> an),
  constraint duell_ansagen_zeitraum check (
    extract(isodow from bis) = 6 and ab between bis - 4 and bis - 1
  ),
  -- mindestens ein Tag, immer ein Tag Spielraum
  constraint duell_ansagen_ziel check (ziel >= 1 and ziel <= bis - ab),
  constraint duell_ansagen_entschieden check ((ergebnis is null) = (entschieden_am is null)),
  -- dasselbe Feld nur einmal je Woche und Herausforderer
  constraint duell_ansagen_feld_je_woche unique (von, feld, bis)
);

create index if not exists duell_ansagen_offen_idx
  on public.duell_ansagen (bis) where ergebnis is null;
create index if not exists duell_ansagen_an_idx
  on public.duell_ansagen (an, erstellt_am desc);

alter table public.duell_ansagen enable row level security;
revoke all on table public.duell_ansagen from public, anon, authenticated;
grant select on table public.duell_ansagen to authenticated, service_role;

drop policy if exists "duell ansagen lesen" on public.duell_ansagen;
create policy "duell ansagen lesen" on public.duell_ansagen
  for select to authenticated
  using ((select private.ist_duellprofil()));

alter table public.duell_ansagen replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.duell_ansagen;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

-- ---------------------------------------------------------- Zaehlregel

-- Die Tage, an denen ein Feld fuer eine Ansage zaehlt. Die Bereiche nur
-- gemessen: eine abgeschlossene Sitzung ab 20 Minuten, Lesen ab 10, am Tag
-- ihres Beginns — dieselbe Regel wie die Wochenabrechnung. Getippte Haken
-- zaehlen nicht, sie sind eine Behauptung und lassen sich nachtragen.
--
-- Beim Gewicht zaehlt jeder Eintrag. Mit `p_selber_tag` nur einer, der am
-- selben Tag eingetragen wurde: das gilt im Zeitraum einer Ansage, nicht fuer
-- die Vorgeschichte, aus der das Ziel kommt — dort rechnet der Browser mit,
-- und der kennt `erstellt` nicht.
create or replace function private.ansage_tage(
  p_user uuid,
  p_feld text,
  p_von date,
  p_bis date,
  p_selber_tag boolean
)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  select distinct (a.ankunft at time zone 'Europe/Berlin')::date
  from public.aufenthalte a
  where p_feld in ('gym', 'boxen', 'lesen')
    and a.user_id = p_user
    and a.bereich = p_feld
    and a.abgang is not null
    and a.abgang >= a.ankunft + case
      when a.bereich = 'lesen' then interval '10 minutes'
      else interval '20 minutes'
    end
    and a.ankunft >= (p_von::timestamp at time zone 'Europe/Berlin')
    and a.ankunft < ((p_bis + 1)::timestamp at time zone 'Europe/Berlin')
  union
  select g.tag
  from public.gewicht g
  where p_feld = 'gewicht'
    and g.user_id = p_user
    and g.tag between p_von and p_bis
    and (not p_selber_tag or (g.erstellt at time zone 'Europe/Berlin')::date = g.tag)
$$;

revoke all on function private.ansage_tage(uuid, text, date, date, boolean)
  from public, anon, authenticated;

-- Das Ziel: der uebliche Wochenstand der letzten vier Wochen (Median) plus
-- eins, auf die Laenge des Zeitraums heruntergerechnet und aufgerundet. Es
-- bleibt immer ein Tag Spielraum; passt das Ziel nicht, gibt es keins (null).
create or replace function private.ansage_ziel(
  p_an uuid,
  p_feld text,
  p_montag date,
  p_laenge integer
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with wochen as (
    select (
      select count(*)
      from private.ansage_tage(p_an, p_feld, p_montag - 7 * w, p_montag - 7 * w + 6, false)
    ) as n
    from pg_catalog.generate_series(1, 4) w
  ),
  median as (
    select pg_catalog.floor(
      percentile_cont(0.5) within group (order by n)
    )::integer + 1 as woche
    from wochen
  ),
  ziel as (
    select greatest(1, pg_catalog.ceil((m.woche * p_laenge)::numeric / 7)::integer) as ziel
    from median m
  )
  select case when z.ziel <= p_laenge - 1 then z.ziel end
  from ziel z
$$;

revoke all on function private.ansage_ziel(uuid, text, date, integer)
  from public, anon, authenticated;

-- ------------------------------------------------------------ 2. sage_an

-- Fehler tragen den Schluessel aus `AnsageFehler` im Text (`ansage:keinZiel`),
-- damit die Oberflaeche dieselbe Erklaerung zeigt wie bei der Vorpruefung.
--
-- Der Kern nimmt Person und Zeitpunkt als Parameter, damit das Pruefskript
-- jede Uhrzeit durchspielen kann. Aufrufen darf ihn nur der Eigentuemer; der
-- Browser kommt ausschliesslich ueber `sage_an` mit auth.uid() und der Uhr
-- der Datenbank hinein.
create or replace function private.sage_an_um(
  p_von uuid,
  p_id uuid,
  p_feld text,
  p_jetzt timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_von uuid := p_von;
  v_an uuid;
  v_lokal timestamp without time zone := pg_catalog.timezone('Europe/Berlin', p_jetzt);
  v_heute date;
  v_montag date;
  v_ab date;
  v_bis date;
  v_ziel integer;
  v_zeile public.duell_ansagen%rowtype;
begin
  if v_von is null or not exists (
    select 1 from public.profile p
    where p.id = v_von and p.person in ('erijon', 'koray')
  ) then
    raise insufficient_privilege using message = 'nur ein zweikampf-profil darf ansagen';
  end if;

  if p_id is null then
    raise invalid_parameter_value using message = 'ansage braucht eine id';
  end if;
  if p_feld is null or p_feld not in ('gym', 'boxen', 'lesen', 'gewicht') then
    raise invalid_parameter_value using message = 'ansage braucht ein ansagefeld';
  end if;

  select p.id into v_an
  from public.profile p
  where p.person in ('erijon', 'koray') and p.id <> v_von;
  if v_an is null then
    raise data_exception using message = 'die beiden zweikampf-profile sind nicht vollstaendig';
  end if;

  v_heute := v_lokal::date;
  v_montag := pg_catalog.date_trunc('week', v_lokal)::date;
  v_ab := v_heute + 1;
  v_bis := v_montag + 5;

  -- Ein Herausforderer, eine Woche, ein Rechenweg: zwei schnelle Taps sehen
  -- sich gegenseitig und nicht beide ein freies Kontingent.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zweikampf:ansage:' || v_von::text || ':' || v_montag::text, 0)
  );

  -- Wiederholt der Browser nach einem Timeout, bestaetigt er dieselbe Zeile.
  select d.* into v_zeile from public.duell_ansagen d where d.id = p_id;
  if found then
    if v_zeile.von <> v_von or v_zeile.feld <> p_feld then
      raise unique_violation using message = 'ansage-id ist schon vergeben';
    end if;
    return pg_catalog.to_jsonb(v_zeile);
  end if;

  if v_bis - v_ab + 1 < 2 then
    raise check_violation using message = 'ansage:zuSpaet';
  end if;

  if (
    select count(*) from public.duell_ansagen d
    where d.von = v_von
      and (d.erstellt_am at time zone 'Europe/Berlin')::date between v_montag and v_montag + 6
  ) >= 2 then
    raise check_violation using message = 'ansage:keineAnsagenMehr';
  end if;

  if exists (
    select 1 from public.duell_ansagen d
    where d.von = v_von and d.feld = p_feld and d.bis = v_bis
  ) then
    raise check_violation using message = 'ansage:schonAngesagt';
  end if;

  v_ziel := private.ansage_ziel(v_an, p_feld, v_montag, v_bis - v_ab + 1);
  if v_ziel is null then
    raise check_violation using message = 'ansage:keinZiel';
  end if;

  insert into public.duell_ansagen (id, von, an, feld, ab, bis, ziel, erstellt_am)
  values (p_id, v_von, v_an, p_feld, v_ab, v_bis, v_ziel, p_jetzt)
  returning * into v_zeile;

  return pg_catalog.to_jsonb(v_zeile);
end;
$$;

revoke all on function private.sage_an_um(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

create or replace function private.sage_an(p_id uuid, p_feld text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.sage_an_um(auth.uid(), p_id, p_feld, pg_catalog.clock_timestamp())
$$;

revoke all on function private.sage_an(uuid, text) from public, anon, authenticated;
grant execute on function private.sage_an(uuid, text) to authenticated;

create or replace function public.sage_an(p_id uuid, p_feld text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.sage_an(p_id, p_feld)
$$;

revoke all on function public.sage_an(uuid, text) from public, anon, authenticated;
grant execute on function public.sage_an(uuid, text) to authenticated;

-- ------------------------------------------------------- 3. Einfrieren

-- geschafft sofort, sobald das Ziel erreicht ist. verfehlt erst ab Mitternacht
-- nach dem Samstag, auch wenn es rechnerisch frueher feststeht. Eine Sitzung,
-- die am Samstag begonnen hat und noch laeuft (Fokus um 23:45), bekommt bis
-- 03:00 Uhr Zeit.
create or replace function private.entscheide_duell_ansagen(p_jetzt timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jetzt timestamptz := coalesce(p_jetzt, pg_catalog.now());
  v_lokal timestamp without time zone := pg_catalog.timezone('Europe/Berlin', coalesce(p_jetzt, pg_catalog.now()));
  v_anzahl integer;
begin
  with offen as (
    select d.id, d.an, d.feld, d.ab, d.bis, d.ziel,
      (
        select count(*)
        from private.ansage_tage(d.an, d.feld, d.ab, least(d.bis, v_lokal::date), true)
      )::integer as erreicht
    from public.duell_ansagen d
    where d.ergebnis is null
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

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function private.entscheide_duell_ansagen(timestamptz)
  from public, anon, authenticated;

-- Ergebnisse sollen nicht erst am Sonntag auftauchen: geschafft steht nach
-- spaetestens fuenf Minuten fest. Reines SQL, kein Netz, kein Geheimnis.
do $$
begin
  perform cron.schedule(
    'duell-ansagen-entscheiden',
    '*/5 * * * *',
    'select private.entscheide_duell_ansagen();'
  );
exception
  when invalid_schema_name or undefined_function then
    raise notice 'pg_cron fehlt: ansagen werden nur vor der wochenabrechnung entschieden';
end
$$;

-- ------------------------------------------- 4. Wochenabrechnung Version 2

-- Ab hier zaehlen die Ansagen in der Sonntagsabrechnung mit. `punkte_*` ist
-- in Version 2 die ganze Wertung: Feldpunkte plus Ansage-Punkte. Die Ansage-
-- Punkte stehen fuer das Audit zusaetzlich einzeln da. Version 1 bleibt, wie
-- sie archiviert wurde — kein Archiv wird aus neuen Regeln nachgerechnet.
--
-- Je Person und Woche hoechstens zwei Ansagen: die Ansage-Punkte liegen
-- zwischen -2 und 2, die Wertung zwischen -2 und 37, der Abstand bei hoechstens 39.

alter table public.wochenabrechnung
  add column if not exists ansage_erijon smallint check (ansage_erijon between -2 and 2),
  add column if not exists ansage_koray smallint check (ansage_koray between -2 and 2);

comment on column public.wochenabrechnung.ansage_erijon is
  'Ansage-Punkte der Woche (Version 2), in punkte_erijon schon enthalten';
comment on column public.wochenabrechnung.ansage_koray is
  'Ansage-Punkte der Woche (Version 2), in punkte_koray schon enthalten';
comment on column public.wochenabrechnung.berechnung_version is
  '0 = bestehendes Clientarchiv; 1 = serverseitige Fuenf-Felder-Regel; 2 = zusaetzlich Ansagen';

alter table public.wochenabrechnung
  drop constraint if exists wochenabrechnung_differenz_check,
  drop constraint if exists wochenabrechnung_punkte_erijon_check,
  drop constraint if exists wochenabrechnung_punkte_koray_check,
  drop constraint if exists wochenabrechnung_server_invariante;

alter table public.wochenabrechnung
  add constraint wochenabrechnung_differenz_check check (differenz between -39 and 39),
  add constraint wochenabrechnung_punkte_erijon_check check (punkte_erijon between -2 and 37),
  add constraint wochenabrechnung_punkte_koray_check check (punkte_koray between -2 and 37),
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
      berechnung_version in (1, 2)
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
          berechnung_version = 2
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

-- Unveraendert bis auf zwei Stellen: vor dem Rechnen werden die Ansagen
-- entschieden, und ihre Punkte zaehlen zur Wertung (Version 2).
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

-- ------------------------------------------------------------- 5. Push

alter table public.erinnerungs_einstellungen
  add column if not exists ansage_aktiv boolean not null default true;

alter table public.aktivitaets_versand
  drop constraint if exists aktivitaets_versand_art_check;
alter table public.aktivitaets_versand
  add constraint aktivitaets_versand_art_check
    check (art in ('lernen', 'lesen', 'wochenblick', 'partner', 'wochenrueckblick', 'wochenbericht', 'ansage'));

-- Unveraendert uebernommen bis auf den neuen Block `neue_ansagen`. Die feste
-- Rueckgabeform zwingt zum vollstaendigen Ersetzen. Ohne die Art `ansage` im
-- Worker (`istNochImFenster`) wird die Meldung still uebersprungen.

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
  -- Neu: die Meldung, dass jemand eine Ansage bekommen hat. Einmal am Tag je
  -- Person (Schluessel des Versands), mit der juengsten Ansage des Tages. Wer
  -- nachts angesagt wird, erfaehrt es ab 08:00 Uhr. Entschieden sein kann sie
  -- am Tag der Ansage nicht: ihr Zeitraum beginnt erst morgen.
  neue_ansagen as (
    select
      s.user_id,
      'ansage'::text as art,
      l.tag,
      l.tag as sendetag,
      von.person || ' sagt an: ' || a.ziel || '× ' ||
        case a.feld when 'gewicht' then 'wiegen' else a.feld end ||
        ' bis samstag. zeig, dass es geht.' as nachricht,
      './'::text as url
    from public.erinnerungs_einstellungen s
    join public.profile p on p.id = s.user_id and p.person in ('erijon', 'koray')
    cross join lokal l
    cross join lateral (
      select d.von, d.feld, d.ziel
      from public.duell_ansagen d
      where d.an = s.user_id
        and d.erstellt_am <= l.jetzt
        and (d.erstellt_am at time zone 'Europe/Berlin')::date = l.tag
      order by d.erstellt_am desc
      limit 1
    ) a
    join public.profile von on von.id = a.von
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
