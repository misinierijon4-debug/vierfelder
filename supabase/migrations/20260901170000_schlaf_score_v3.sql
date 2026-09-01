-- Nachtwert v3: zwei Fehler und eine Fehlannahme.
--
-- Anlass war eine Nacht mit 8h38 Schlaf bei 91% Effizienz, die als 69 im Ring
-- stand. Nachgerechnet lagen zwei der fuenf Komponenten auf null, und beide zu
-- Unrecht.
--
-- **Der Median der Einschlafzeit sprang ueber Mitternacht.** Er wurde ueber
-- rohe Minuten des Tages gebildet. Sechs Naechte mit 00:14, 00:32, 00:15,
-- 23:29, 23:50 und 22:03 ergeben sortiert 14, 15, 32, 1323, 1409, 1430 — und
-- damit einen Median von 677, also 11:17 vormittags. Eine Einschlafzeit, die
-- es nie gab. Die vorhandene Mitternachtskorrektur sitzt an der falschen
-- Stelle: sie korrigiert den *Abstand* und greift erst ab 720 Minuten, der
-- kaputte Wert lag bei 676,5.
--
-- Das Frontend loest das seit jeher richtig (`nachtMinute` in
-- src/lib/schlafPhasen.ts): 15 Uhr trennt zwei Naechte, damit 00:15 neben
-- 23:45 liegt und nicht 23 Stunden davor. Genau diese Regel fehlte hier.
--
-- **Die Wachphasen zaehlten das Umdrehen mit.** `wachphasen` ist die rohe
-- Anzahl aus Health, in einer ruhigen Nacht 37 Stueck von je einer Minute. Die
-- Komponente teilt durch 8 und stand damit sofort auf null. Ab fuenf Minuten
-- am Stueck — dieselbe Schwelle, die die App im Verlauf zeichnet
-- (`PHASEN_SCHWELLE`) — war es in derselben Nacht *eine*.
--
-- **Und die Regelmaessigkeit gehoert nicht in die Einzelnacht.** Wer einmal
-- anderthalb Stunden frueher ins Bett geht, hat deswegen nicht schlechter
-- geschlafen. Eine einzelne Nacht kann nicht regelmaessig sein; das ist eine
-- Eigenschaft der Woche, und dort steht sie auch schon als "konstanz" im
-- Duell. Sie wird weiter gemessen und gespeichert, sie zaehlt nur nicht mehr.
--
-- Gewichte damit: Dauer 45, Effizienz 20, Phasen 10, Unterbrechungen 10.
-- Hoechstens erreichbar sind 85; `score_konfidenz` ist der Anteil der Basis,
-- die diese Nacht wirklich hergibt, an diesen 85 — eine vollstaendig gemessene
-- Nacht steht also weiter auf 100.

-- 15 Uhr trennt zwei Naechte: 00:15 wird zu 1455 und liegt damit 30 Minuten
-- nach 23:45, nicht 23 Stunden davor. Dieselbe Regel wie `nachtMinute` im
-- Frontend, damit Server und Anzeige dieselbe Nacht meinen.
create or replace function private.nachtminute(ts timestamptz)
returns numeric
language sql
immutable
as $$
  select case when m < 900 then m + 1440 else m end
  from (
    select extract(hour from ts at time zone 'Europe/Berlin') * 60
         + extract(minute from ts at time zone 'Europe/Berlin') as m
  ) q
$$;
revoke all on function private.nachtminute(timestamptz) from public, anon, authenticated;

alter table public.schlafnaechte
  drop constraint if exists schlafnaechte_score_version_check;
alter table public.schlafnaechte
  add constraint schlafnaechte_score_version_check check (score_version in (2, 3));

create or replace function public.setze_schlaf_score_v3()
returns trigger
language plpgsql
set search_path = public, private, extensions
as $$
declare
  a record;
  v_dauer numeric;
  v_effizienz numeric;
  v_phasen numeric;
  v_regel numeric;
  v_unterbrechung numeric;
  w_dauer numeric := 45;
  w_effizienz numeric := 0;
  w_phasen numeric := 0;
  w_unterbrechung numeric := 0;
  -- was eine vollstaendig gemessene nacht hoechstens erreichen kann
  w_hoechstens numeric := 85;
  p_dauer numeric;
  p_effizienz numeric;
  p_phasen numeric;
  p_unterbrechung numeric;
  v_spezifiziert numeric;
  v_klassifiziert numeric;
  v_basis numeric;
  v_summe numeric;
  v_median numeric;
  v_hist smallint;
  v_abw numeric;
  v_wachphasen_lang int;
begin
  select * into a
  from public.schlaf_auswertung(new.rohsegmente, new.einschlafzeit)
  limit 1;

  -- ---------------------------------------------------------- regelmaessigkeit
  -- gemessen und gespeichert, aber ohne gewicht: siehe kopf. der median laeuft
  -- jetzt ueber die nachtminute, sonst landet er zwischen 00:32 und 23:29.
  select percentile_cont(0.5) within group (order by m), count(*)::smallint
  into v_median, v_hist
  from (
    select private.nachtminute(einschlafzeit) as m
    from public.schlafnaechte
    where user_id = new.user_id and nacht < new.nacht
    order by nacht desc
    limit 13
  ) h;

  if v_hist > 0 and v_median is not null then
    v_abw := abs(private.nachtminute(new.einschlafzeit) - v_median);
    -- ueber die 24-stunden-grenze hinweg ist der kuerzere weg der richtige
    if v_abw > 720 then v_abw := 1440 - v_abw; end if;
    new.median_abweichung_minuten := round(v_abw, 2);
    new.historie_naechte := v_hist;
    v_regel := 100 * (1 - least(1, greatest(0, v_abw / 180)));
  else
    new.median_abweichung_minuten := null;
    new.historie_naechte := 0;
  end if;

  -- ------------------------------------------------------------------- dauer
  v_dauer := 100 * least(1, greatest(0, new.schlaf_minuten / new.schlafziel_minuten));
  p_dauer := round(v_dauer * w_dauer / 100, 2);

  -- --------------------------------------------------------------- effizienz
  if a.bett_minuten is not null
     and a.bett_minuten >= new.schlaf_minuten
     and a.bett_minuten > 0 then
    w_effizienz := 20;
    v_effizienz := 100 * least(1, greatest(0,
      ((new.schlaf_minuten / a.bett_minuten * 100) - 75) / 20
    ));
    p_effizienz := round(v_effizienz * w_effizienz / 100, 2);
  end if;

  -- ------------------------------------------------------------------ phasen
  v_spezifiziert := coalesce(a.tief_minuten, 0)
    + coalesce(a.rem_minuten, 0) + coalesce(a.kern_minuten, 0);
  v_klassifiziert := v_spezifiziert + coalesce(a.unspez_minuten, 0);
  if v_spezifiziert > 0 and new.schlaf_minuten > 0 then
    w_phasen := 10 * least(1, greatest(0, v_klassifiziert / new.schlaf_minuten));
    v_phasen := 100 * least(1, greatest(0,
      ((coalesce(a.tief_minuten, 0) + coalesce(a.rem_minuten, 0)) / v_spezifiziert) / 0.25
    ));
    p_phasen := round(v_phasen * w_phasen / 100, 2);
  end if;

  -- --------------------------------------------------------- unterbrechungen
  -- nur wachstuecke ab fuenf minuten. health zerlegt eine ruhige nacht in bis
  -- zu vierzig einminutenstuecke; das ist rauschen, keine unterbrechung, und
  -- die kurve in der app zeichnet es aus demselben grund nicht als phase.
  if new.wachsegmente_vorhanden
     and new.wach_minuten is not null
     and jsonb_typeof(a.phasen) = 'array' then
    select count(*) into v_wachphasen_lang
    from jsonb_array_elements(a.phasen) e
    where e->>'art' = 'wach' and (e->>'dauer')::numeric >= 5;

    w_unterbrechung := 10;
    v_unterbrechung := 100 * (
      0.6 * (1 - least(1, greatest(0, new.wach_minuten / 30)))
      + 0.4 * (1 - least(1, greatest(0, v_wachphasen_lang::numeric / 8)))
    );
    p_unterbrechung := round(v_unterbrechung * w_unterbrechung / 100, 2);
  end if;

  -- ------------------------------------------------------------------ summe
  v_basis := round(w_dauer + w_effizienz + w_phasen + w_unterbrechung, 2);
  v_summe := p_dauer + coalesce(p_effizienz, 0) + coalesce(p_phasen, 0)
    + coalesce(p_unterbrechung, 0);

  new.nachtwert := greatest(0, least(100, round(v_summe / v_basis * 100)));
  new.bewertungsbasis := greatest(1, least(100, round(v_basis)));
  new.score_version := 3;
  -- anteil der belegten basis an der hoechstens erreichbaren: eine
  -- vollstaendig gemessene nacht steht auf 100, auch wenn 85 die volle
  -- punktzahl ist
  new.score_konfidenz := greatest(1, least(100, round(v_basis / w_hoechstens * 100)));
  new.dauer_punkte := p_dauer;
  new.effizienz_punkte := p_effizienz;
  new.phasen_punkte := p_phasen;
  -- die regelmaessigkeit bringt keine punkte mehr
  new.konsistenz_punkte := null;
  new.unterbrechung_punkte := p_unterbrechung;
  new.score_komponenten := jsonb_build_object(
    'dauer', jsonb_build_object('wert', round(v_dauer, 2), 'gewicht', w_dauer, 'punkte', p_dauer),
    'effizienz', jsonb_build_object('wert', round(v_effizienz, 2), 'gewicht', w_effizienz, 'punkte', p_effizienz),
    'phasen', jsonb_build_object('wert', round(v_phasen, 2), 'gewicht', round(w_phasen, 2), 'punkte', p_phasen),
    -- gewicht 0: gemessen und ablesbar, aber ohne einfluss auf den nachtwert
    'regelmaessigkeit', jsonb_build_object('wert', round(v_regel, 2), 'gewicht', 0, 'punkte', null),
    'unterbrechungen', jsonb_build_object('wert', round(v_unterbrechung, 2), 'gewicht', w_unterbrechung, 'punkte', p_unterbrechung)
  );
  return new;
end;
$$;
revoke all on function public.setze_schlaf_score_v3() from public, anon, authenticated;

drop trigger if exists schlaf_score_v2 on public.schlafnaechte;
drop trigger if exists schlaf_score_v3 on public.schlafnaechte;
create trigger schlaf_score_v3
before insert or update of rohsegmente, einschlafzeit, schlaf_minuten,
  schlafziel_minuten, wach_minuten, wachphasen, median_abweichung_minuten,
  historie_naechte, wachsegmente_vorhanden
on public.schlafnaechte
for each row execute function public.setze_schlaf_score_v3();

-- Vorhandene Naechte neu bewerten. Der Median haengt nur an den
-- Einschlafzeiten der frueheren Naechte, und die aendern sich dabei nicht —
-- die Reihenfolge der Zeilen ist deshalb gleichgueltig.
update public.schlafnaechte set schlaf_minuten = schlaf_minuten;

-- v2 wird nicht mehr geschrieben; die Funktion bleibt als Beleg, wie der
-- Stand vom 01.09. gerechnet hat, bis niemand mehr danach fragt.
comment on function public.setze_schlaf_score_v2() is
  'abgeloest durch setze_schlaf_score_v3 am 01.09.2026 (median ueber mitternacht, wachphasen ab 5 minuten, regelmaessigkeit ohne gewicht)';
