-- Ein gemeinsamer, unveraenderlicher Datenstand fuer beide Personen.
create table public.wochenberichte (
  woche date primary key check (extract(isodow from woche) = 1),
  daten jsonb not null,
  eingefroren timestamptz not null default now(),
  quelle text not null check (quelle in ('montag', 'nachgeholt')),
  texte jsonb,
  modell text,
  text_erstellt timestamptz,
  text_versuch timestamptz
);
alter table public.wochenberichte enable row level security;
revoke all on public.wochenberichte from public, anon, authenticated;
grant select on public.wochenberichte to authenticated;
grant select, insert, update on public.wochenberichte to service_role;
create policy "mitglieder lesen wochenberichte" on public.wochenberichte
  for select to authenticated using (
    exists (select 1 from public.profile where id = (select auth.uid()) and person in ('erijon','koray'))
  );

create or replace function private.sichere_wochenbericht(p_woche date, p_planmaessig boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
  v_daten jsonb;
begin
  if extract(isodow from p_woche) <> 1 or p_woche + 7 > v_heute then
    raise exception 'nur abgeschlossene wochen';
  end if;
  perform pg_advisory_xact_lock(194519, p_woche - date '2000-01-01');
  if exists (select 1 from public.wochenberichte where woche = p_woche) then return; end if;
  select jsonb_build_object(
    'woche', p_woche,
    'zustand', jsonb_build_object(
      'einheiten', coalesce((select jsonb_object_agg(k, v) from (
        select p.person || '|' || e.bereich || '|' || e.tag as k,
          jsonb_agg(jsonb_build_object('id', e.id, 'user', p.person, 'area', e.bereich,
            'tag', e.tag, 'wert', e.wert, 'erfasst', e.erfasst, 'von', e.von) order by e.erfasst, e.id) as v
        from public.einheiten e join public.profile p on p.id = e.user_id
        where e.tag >= p_woche - 7 and e.tag < p_woche + 7
        group by p.person, e.bereich, e.tag
      ) t), '{}'::jsonb),
      'gewichte', coalesce((select jsonb_object_agg(p.person || '|' || g.tag, g.kg)
        from public.gewicht g join public.profile p on p.id = g.user_id
        where g.tag >= p_woche - 7 and g.tag < p_woche + 7), '{}'::jsonb),
      'aufenthalte', coalesce((select jsonb_agg(jsonb_build_object(
        'user', p.person, 'bereich', a.bereich, 'ort', a.ort,
        'ankunft', a.ankunft, 'abgang', a.abgang) order by a.ankunft)
        from public.aufenthalte a join public.profile p on p.id = a.user_id
        where (a.ankunft at time zone 'Europe/Berlin')::date >= p_woche - 7
          and (a.ankunft at time zone 'Europe/Berlin')::date < p_woche + 7), '[]'::jsonb)
    ),
    'naechte', coalesce((select jsonb_agg(jsonb_build_object(
      'user', p.person, 'nacht', n.nacht, 'schlafMinuten', n.schlaf_minuten,
      'einschlafzeit', n.einschlafzeit, 'aufwachzeit', n.aufwachzeit,
      'bettStart', n.bett_start, 'bettEnde', n.bett_ende, 'bettMinuten', n.bett_minuten,
      'tiefMinuten', n.tief_minuten, 'remMinuten', n.rem_minuten, 'kernMinuten', n.kern_minuten,
      'unspezMinuten', n.unspez_minuten, 'wachMinuten', n.wach_minuten,
      'zielMinuten', n.schlafziel_minuten, 'phasen', null,
      'nachtwert', n.nachtwert, 'scoreKonfidenz', n.score_konfidenz) order by n.nacht, p.person)
      from public.schlafnaechte_ansicht n join public.profile p on p.id = n.user_id
      where ((n.einschlafzeit at time zone 'Europe/Berlin') - interval '15 hours')::date >= p_woche - 7
        and ((n.einschlafzeit at time zone 'Europe/Berlin') - interval '15 hours')::date < p_woche + 7), '[]'::jsonb)
  ) into v_daten;
  insert into public.wochenberichte(woche, daten, quelle)
    values(p_woche, v_daten, case when p_planmaessig then 'montag' else 'nachgeholt' end)
    on conflict (woche) do nothing;
end $$;
revoke all on function private.sichere_wochenbericht(date, boolean) from public, anon, authenticated;

-- Nur der bereits authentifizierte Edge-Handler kann alte Wochen nachholen.
create function public.hole_wochenbericht(p_woche date)
returns void language sql security definer set search_path = '' as $$
  select private.sichere_wochenbericht(p_woche, false);
$$;
revoke all on function public.hole_wochenbericht(date) from public, anon, authenticated;
grant execute on function public.hole_wochenbericht(date) to service_role;

create function private.wochenbericht_montag()
returns void language plpgsql security definer set search_path = '' as $$
declare v_lokal timestamp := now() at time zone 'Europe/Berlin';
begin
  -- zwei UTC-Termine decken Sommer- und Winterzeit ab; nur Mitternacht gilt.
  if extract(isodow from v_lokal) = 1 and extract(hour from v_lokal) = 0 then
    perform private.sichere_wochenbericht(v_lokal::date - 7, true);
  end if;
end $$;
revoke all on function private.wochenbericht_montag() from public, anon, authenticated;
select cron.schedule('wochenbericht-montag', '0 22,23 * * 0',
  'select private.wochenbericht_montag();');
