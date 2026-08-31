-- Fokus-Modi als zweite Messquelle (31.08.2026)
--
-- Bisher konnte nur ein Ort einen Tick belegen, und damit blieben lernen und
-- lesen fuer immer Behauptung. Ein Fokus auf dem iPhone ist aber genau
-- dieselbe Form von Messung: er wird bewusst eingeschaltet, er laeuft eine
-- messbare Zeit, und er wird wieder ausgeschaltet. Was er belegt, ist nicht
-- „gelernt", sondern „eine Stunde lang alles andere stummgeschaltet" — die
-- gleiche Art Beleg wie beim Gym, wo der Standort Anwesenheit belegt und nicht
-- Anstrengung.
--
-- Deshalb kommt keine zweite Tabelle dazu. `aufenthalte` haelt weiter eine
-- Zeile je Sitzung; nur der Bereich darf jetzt jeder der vier sein, und `ort`
-- traegt den Namen der Quelle statt zwingend den einer Adresse.
alter table aufenthalte drop constraint if exists aufenthalte_bereich_check;
alter table aufenthalte add constraint aufenthalte_bereich_check
  check (bereich in ('lernen', 'gym', 'boxen', 'lesen'));

comment on table aufenthalte is
  'gemessene sitzungen: standort-automation (ankunft/abgang) oder fokus (ein/aus). eine zeile je sitzung.';
comment on column aufenthalte.ort is
  'name der quelle, frei waehlbar: ein trainingsort oder ein fokus. ankunft und abgang muessen ihn gleich schreiben.';

-- Nur die Bereichspruefung aendert sich. Die Signatur bleibt, damit die sechs
-- bestehenden Standort-Kurzbefehle unangetastet weiterlaufen.
create or replace function record_aufenthalt(
  p_token jsonb default null,
  p_bereich jsonb default null,
  p_ort jsonb default null,
  p_ereignis jsonb default null,
  p_zeit jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_bereich text;
  v_ort text;
  v_ereignis text;
  v_roh text;
  v_zeit timestamptz;
  v_id bigint;
  v_ankunft timestamptz;
begin
  v_bereich := lower(btrim(coalesce(_afh_text(p_bereich), '')));
  if v_bereich not in ('lernen', 'gym', 'boxen', 'lesen') then
    raise exception 'p_bereich muss lernen, gym, boxen oder lesen sein, war: %', v_bereich;
  end if;

  v_ort := btrim(coalesce(_afh_text(p_ort), ''));
  if v_ort = '' or length(v_ort) > 40 then
    raise exception 'p_ort fehlt oder ist zu lang';
  end if;

  -- „an" und „aus" kommen dazu: das ist die Sprache der Fokus-Automation,
  -- waehrend die Standort-Automation von Ankunft und Verlassen spricht.
  v_roh := lower(btrim(coalesce(_afh_text(p_ereignis), '')));
  v_ereignis := case
    when v_roh in ('ankunft', 'ankommen', 'arrival', 'arrive', 'an', 'start', 'on') then 'ankunft'
    when v_roh in ('abgang', 'verlassen', 'weggehen', 'departure', 'leave', 'aus', 'ende', 'off')
      then 'abgang'
    else null
  end;
  if v_ereignis is null then
    raise exception 'p_ereignis muss ankunft oder abgang sein, war: %', v_roh;
  end if;

  v_zeit := coalesce(_afh_ts(p_zeit), now());
  if v_zeit > now() + interval '5 minutes' then
    v_zeit := now();
  end if;

  select t.user_id into v_user_id
  from schlaf_import_tokens t
  where t.aktiv
    and t.token_hash = encode(digest(coalesce(_afh_text(p_token), ''), 'sha256'), 'hex');

  if v_user_id is null then
    raise exception 'kein gueltiges import-token';
  end if;

  if v_ereignis = 'ankunft' then
    delete from aufenthalte a
    where a.user_id = v_user_id
      and a.ort = v_ort
      and a.abgang is null
      and a.ankunft < v_zeit - interval '12 hours';

    insert into aufenthalte (user_id, bereich, ort, ankunft)
    values (v_user_id, v_bereich, v_ort, v_zeit)
    on conflict (user_id, ort) where abgang is null do nothing
    returning id into v_id;

    return jsonb_build_object(
      'ok', true,
      'ereignis', 'ankunft',
      'bereich', v_bereich,
      'ort', v_ort,
      'neu', v_id is not null,
      'grund', case when v_id is null then 'ankunft lag schon offen' else null end
    );
  end if;

  update aufenthalte a
     set abgang = v_zeit,
         bereich = v_bereich,
         aktualisiert = now()
   where a.id = (
     select b.id from aufenthalte b
      where b.user_id = v_user_id and b.ort = v_ort and b.abgang is null
      order by b.ankunft desc
      limit 1
   )
     and v_zeit > a.ankunft
  returning a.id, a.ankunft into v_id, v_ankunft;

  if v_id is null then
    return jsonb_build_object(
      'ok', false,
      'ereignis', 'abgang',
      'ort', v_ort,
      'grund', 'kein offener aufenthalt an diesem ort, oder abgang vor ankunft'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'ereignis', 'abgang',
    'bereich', v_bereich,
    'ort', v_ort,
    'tag', (v_ankunft at time zone 'Europe/Berlin')::date,
    'dauer_minuten', round(extract(epoch from (v_zeit - v_ankunft)) / 60)
  );
end;
$$;

revoke all on function record_aufenthalt(jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function record_aufenthalt(jsonb, jsonb, jsonb, jsonb, jsonb)
  to anon, authenticated;
