-- Ein Kurzbefehl, der nichts schickt, hinterlaesst nichts. Das ist das
-- eigentliche Problem.
--
-- Am 01. und 02.09.2026 hat die Schlafautomation um 11:00 nicht ein einziges
-- Mal gesendet: in `edge_logs` steht an beiden Tagen kein Aufruf mit der
-- Kennung `BackgroundShortcutRunner`. Am 02.09. waren es 426 Anfragen an das
-- Projekt, alle aus Browsern und vom Cron, keine aus Kurzbefehlen. Der letzte
-- automatische Lauf war am 31.08. um 11:00:18 Ortszeit.
--
-- Damit ist die Frage nicht mehr „warum kommen keine Daten an", sondern
-- „wie weit kommt der Kurzbefehl". Das kann diese Seite nicht sehen, solange
-- der Kurzbefehl erst ganz am Ende spricht. Also lassen wir ihn frueher
-- sprechen: eine Meldung als allererste Aktion, eine zweite direkt nach der
-- Health-Abfrage mit der Anzahl der gefundenen Segmente.
--
-- Danach ist die Antwort eindeutig ablesbar:
--
--   keine Zeile             -> die Automation hat den Kurzbefehl nie gestartet
--   nur "start"             -> die Health-Abfrage bricht ab oder haengt
--   "gefunden" mit anzahl 0 -> Health liefert nichts (Geraet gesperrt o.ae.)
--   "gefunden" mit anzahl>0 -> der Aufbau des Aufrufs oder das Netz scheitert
--
-- Die Identitaet kommt aus demselben Token wie beim Schlafimport. Ohne
-- gueltiges Token wird nichts geschrieben.
create table kurzbefehl_laeufe (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kurzbefehl text not null check (char_length(kurzbefehl) between 1 and 40),
  schritt text not null check (char_length(schritt) between 1 and 40),
  anzahl integer check (anzahl is null or anzahl between 0 and 100000),
  hinweis text check (hinweis is null or char_length(hinweis) <= 200),
  gemeldet timestamptz not null default now()
);

create index kurzbefehl_laeufe_zeit_idx on kurzbefehl_laeufe (user_id, gemeldet desc);

alter table kurzbefehl_laeufe enable row level security;

revoke all on table kurzbefehl_laeufe from anon, authenticated;
grant select on table kurzbefehl_laeufe to authenticated;

-- Beide sehen beide Laeufe. Wer zusammen trainiert, sucht auch zusammen den
-- Fehler; und ein Zeitstempel ohne Inhalt verraet nichts Privates.
create policy "laeufe lesen" on kurzbefehl_laeufe
  for select to authenticated using (true);

create or replace function record_kurzbefehl_lauf(
  p_token jsonb default null,
  p_kurzbefehl jsonb default null,
  p_schritt jsonb default null,
  p_anzahl jsonb default null,
  p_hinweis jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token text;
  v_user uuid;
  v_kurzbefehl text;
  v_schritt text;
  v_anzahl integer;
  v_hinweis text;
  v_roh text;
  v_letzte smallint;
begin
  v_token := btrim(coalesce(public._slfn_scalar_text(p_token), ''));
  if length(v_token) < 32 then
    raise exception 'import-token fehlt oder ist zu kurz'
      using errcode = 'invalid_authorization_specification';
  end if;

  select t.user_id into v_user
  from public.schlaf_import_tokens t
  where t.token_hash = encode(digest(v_token, 'sha256'), 'hex')
    and t.aktiv
  limit 1;
  if v_user is null then
    raise exception 'import-token ist ungueltig'
      using errcode = 'invalid_authorization_specification';
  end if;

  v_kurzbefehl := left(btrim(coalesce(public._slfn_scalar_text(p_kurzbefehl), 'unbenannt')), 40);
  v_schritt := left(btrim(coalesce(public._slfn_scalar_text(p_schritt), 'lauf')), 40);
  v_hinweis := nullif(left(btrim(coalesce(public._slfn_scalar_text(p_hinweis), '')), 200), '');

  -- iOS schickt Zahlen gern als Text. Was keine Zahl ist, wird nicht zum
  -- Fehler: eine Meldung ohne Anzahl ist besser als keine Meldung.
  v_roh := btrim(coalesce(public._slfn_scalar_text(p_anzahl), ''));
  v_roh := replace(v_roh, ',', '.');
  if v_roh ~ '^[0-9]+(\.[0-9]+)?$' then
    v_anzahl := least(floor(v_roh::numeric)::integer, 100000);
  else
    v_anzahl := null;
  end if;

  -- Eine haengende Schleife soll die Tabelle nicht fluten. Sechzig Meldungen
  -- je Stunde und Person reichen fuer jede ehrliche Fehlersuche.
  select count(*)::smallint into v_letzte
  from kurzbefehl_laeufe l
  where l.user_id = v_user
    and l.gemeldet > now() - interval '1 hour';
  if v_letzte >= 60 then
    raise exception 'zu viele meldungen in der letzten stunde'
      using errcode = 'program_limit_exceeded';
  end if;

  insert into kurzbefehl_laeufe (user_id, kurzbefehl, schritt, anzahl, hinweis)
  values (v_user, v_kurzbefehl, v_schritt, v_anzahl, v_hinweis);

  -- Alte Meldungen sind Protokoll, kein Archiv.
  delete from kurzbefehl_laeufe l
  where l.user_id = v_user and l.gemeldet < now() - interval '30 days';

  return jsonb_build_object(
    'ok', true,
    'kurzbefehl', v_kurzbefehl,
    'schritt', v_schritt,
    'anzahl', v_anzahl,
    'gemeldet', now()
  );
end;
$$;

revoke all on function record_kurzbefehl_lauf(jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, authenticated;
grant execute on function record_kurzbefehl_lauf(jsonb, jsonb, jsonb, jsonb, jsonb)
  to anon, service_role;
