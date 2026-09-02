-- Woher die Gewichtszahl kommt.
--
-- Bisher galt jedes Gewicht als Messung — "eine Zahl auf der Waage ist keine
-- Behauptung". Getippt wird sie trotzdem: in der App, mit dem Daumen. Damit war
-- der Haken „verifiziert" beim Gewicht eine Auszeichnung ohne Beleg.
--
-- Ab hier gilt dieselbe Regel wie bei gym und boxen: gemessen ist, was die
-- Automation schreibt. Die Waage synchronisiert nach Apple Health, eine
-- Health-Automation ruft `record_gewicht` mit dem persoenlichen Import-Token
-- auf. Alles, was die App selbst schreibt, ist getippt — und der Trigger unten
-- laesst ihr keine Wahl.
alter table gewicht
  add column if not exists quelle text not null default 'getippt'
    check (quelle in ('getippt', 'gemessen'));

-- Der Bestand faellt durch den Default auf 'getippt' — er ist mit dem Daumen
-- entstanden. Ein nachtraegliches UPDATE steht hier bewusst nicht: bei einem
-- zweiten Lauf der Migration wuerde es echte Messungen ueberschreiben.
comment on column gewicht.quelle is
  'getippt = in der app eingetragen, gemessen = ueber record_gewicht aus apple health';

-- Die App hat auf `gewicht` volle Schreibrechte (sie muss ihre eigene Zeile
-- aendern koennen). Ein Spaltenrecht allein reicht deshalb nicht: der Trigger
-- entscheidet die Quelle, nicht der Aufrufer. `record_gewicht` setzt vorher ein
-- transaktionslokales Flag — nur so entsteht 'gemessen'.
--
-- Wer eine gemessene Zahl spaeter in der App ueberschreibt, macht daraus wieder
-- eine getippte. Das ist der Sinn: die Anzeige folgt der letzten Schreibung.
create or replace function gewicht_quelle_setzen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.quelle := case
    when coalesce(current_setting('app.gewicht_quelle', true), '') = 'gemessen'
      then 'gemessen'
    else 'getippt'
  end;
  return new;
end;
$$;

drop trigger if exists gewicht_quelle_wahren on gewicht;
create trigger gewicht_quelle_wahren
  before insert or update on gewicht
  for each row execute function gewicht_quelle_setzen();

-- Der Einstiegspunkt fuer die Health-Automation:
--   POST /rest/v1/rpc/record_gewicht
--
-- Identitaet kommt ausschliesslich aus dem persoenlichen Import-Token, dem
-- gleichen, das der Schlaf-Kurzbefehl und die Standort-Automation benutzen.
-- Die Parameter sind jsonb, weil iOS Feldtypen unzuverlaessig setzt; geparst
-- wird hier, mit denselben Helfern wie bei `record_aufenthalt`.
create or replace function record_gewicht(
  p_token jsonb default null,
  p_kg jsonb default null,
  p_tag jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_roh text;
  v_kg numeric;
  v_tag date;
begin
  -- Komma statt Punkt, ein angehaengtes "kg", ein schmales Leerzeichen aus der
  -- Health-Formatierung: alles, was iOS mitschickt und niemand tippen wollte.
  v_roh := btrim(coalesce(_afh_text(p_kg), ''));
  v_roh := replace(replace(v_roh, ',', '.'), 'kg', '');
  v_roh := regexp_replace(v_roh, '[^0-9.]', '', 'g');
  if v_roh = '' then
    raise exception 'p_kg fehlt oder ist keine zahl';
  end if;
  v_kg := round(v_roh::numeric, 1);
  if v_kg <= 20 or v_kg >= 400 then
    raise exception 'p_kg liegt ausserhalb des erlaubten bereichs: %', v_kg;
  end if;

  -- Ohne Datum gilt der heutige Tag in Berlin. Eine Waage am fruehen Morgen
  -- gehoert zu diesem Morgen, nicht zum Vortag in UTC.
  v_tag := coalesce(
    (_afh_ts(p_tag) at time zone 'Europe/Berlin')::date,
    (now() at time zone 'Europe/Berlin')::date
  );
  if v_tag > (now() at time zone 'Europe/Berlin')::date then
    v_tag := (now() at time zone 'Europe/Berlin')::date;
  end if;

  select t.user_id into v_user_id
  from schlaf_import_tokens t
  where t.aktiv
    and t.token_hash = encode(digest(coalesce(_afh_text(p_token), ''), 'sha256'), 'hex');

  if v_user_id is null then
    raise exception 'kein gueltiges import-token';
  end if;

  -- transaktionslokal: nur diese eine Schreibung wird als Messung markiert
  perform set_config('app.gewicht_quelle', 'gemessen', true);

  insert into gewicht (user_id, tag, kg)
  values (v_user_id, v_tag, v_kg)
  on conflict (user_id, tag) do update set kg = excluded.kg;

  return jsonb_build_object('ok', true, 'tag', v_tag, 'kg', v_kg, 'quelle', 'gemessen');
end;
$$;

revoke all on function record_gewicht(jsonb, jsonb, jsonb) from public;
grant execute on function record_gewicht(jsonb, jsonb, jsonb) to anon, authenticated;

-- gewicht liegt seit score v2 in supabase_realtime: die neue Spalte kommt damit
-- ohne weiteres Zutun im zweiten Geraet an.
