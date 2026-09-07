-- Immer in BEGIN/ROLLBACK ausfuehren. Zukunfts-Fixtures werden nie committed.
do $$
declare
  u uuid := (select id from public.profile where person='erijon');
  gegner uuid := (select id from public.profile where person='koray');
  n integer;
  textstand text;
begin
  if u is null or gegner is null then raise exception 'zwei testprofile erforderlich'; end if;
  -- Bestehende Abos werden weder gelesen noch veraendert. Der Dummy kann
  -- durch den Rollback nie an einen Scheduler gelangen.
  insert into public.push_abos(user_id,endpoint,p256dh,auth)
    values(u,'https://web.push.apple.com/rollback-only-test',repeat('A',87),repeat('A',22));
  insert into public.erinnerungs_einstellungen(user_id) values(u)
    on conflict(user_id) do nothing;
  update public.erinnerungs_einstellungen set lernen_aktiv=true,lesen_aktiv=true,wochenblick_aktiv=true where user_id=u;

  select count(*) into n from public.aktivitaets_kandidaten('2099-06-01 18:30 Europe/Berlin') where user_id=u and art='lernen';
  if n<>1 then raise exception 'werktags faellig: %',n; end if;
  select count(*) into n from public.aktivitaets_kandidaten('2099-06-06 18:30 Europe/Berlin') where art='lernen';
  if n<>0 then raise exception 'samstag muss ruhig sein'; end if;
  select count(*) into n from public.aktivitaets_kandidaten('2099-06-01 22:00 Europe/Berlin');
  if n<>0 then raise exception 'nachtruhe'; end if;
  select count(*) into n from public.aktivitaets_kandidaten('2099-06-01 20:00 Europe/Berlin') where art='lernen';
  if n<>0 then raise exception 'kein spaetes nachholen'; end if;

  insert into public.einheiten(id,user_id,bereich,tag) values(gen_random_uuid(),u,'lernen','2099-06-01');
  select count(*) into n from public.aktivitaets_kandidaten('2099-06-01 18:30 Europe/Berlin') where user_id=u and art='lernen';
  if n<>0 then raise exception 'bereits erledigt'; end if;

  insert into public.aufenthalte(user_id,bereich,ort,ankunft)
    values(u,'lesen','test','2099-06-01 20:30 Europe/Berlin');
  select count(*) into n from public.aktivitaets_kandidaten('2099-06-01 20:45 Europe/Berlin') where user_id=u and art='lesen';
  if n<>0 then raise exception 'laufende sitzung'; end if;
  update public.aufenthalte set abgang='2099-06-01 20:35 Europe/Berlin' where user_id=u and ankunft='2099-06-01 20:30 Europe/Berlin';
  select count(*) into n from public.aktivitaets_kandidaten('2099-06-01 20:45 Europe/Berlin') where user_id=u and art='lesen';
  if n<>1 then raise exception 'unter mindestdauer noch offen'; end if;
  update public.aufenthalte set abgang='2099-06-01 20:40 Europe/Berlin' where user_id=u and ankunft='2099-06-01 20:30 Europe/Berlin';
  select count(*) into n from public.aktivitaets_kandidaten('2099-06-01 20:45 Europe/Berlin') where user_id=u and art='lesen';
  if n<>0 then raise exception 'gemessener lesetick'; end if;

  update public.erinnerungs_einstellungen set lesen_aktiv=false where user_id=u;
  select count(*) into n from public.aktivitaets_kandidaten('2099-06-02 20:45 Europe/Berlin') where user_id=u and art='lesen';
  if n<>0 then raise exception 'ausgeschaltet'; end if;

  insert into public.einheiten(id,user_id,bereich,tag) values(gen_random_uuid(),u,'lernen','2099-06-01');
  insert into public.gewicht(user_id,tag,kg) values(u,'2099-06-01',80);
  select nachricht into textstand from public.aktivitaets_kandidaten('2099-06-07 18:00 Europe/Berlin') where user_id=u and art='wochenblick';
  if textstand <> 'sonntagsstand: du 3, koray 0. die woche läuft noch.' then raise exception 'deduplizierte wochenwertung: %',textstand; end if;

  insert into public.aktivitaets_versand(user_id,art,tag,token) values(u,'lesen','2099-06-01',gen_random_uuid());
  begin
    insert into public.aktivitaets_versand(user_id,art,tag,token) values(u,'lesen','2099-06-01',gen_random_uuid());
    raise exception 'doppelreservierung erlaubt';
  exception when unique_violation then null;
  end;
end;
$$;
select '10 fachliche SQL-Pruefungen bestanden' as ergebnis;
