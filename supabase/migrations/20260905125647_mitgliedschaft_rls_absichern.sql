-- Das Produkt hat genau zwei Mitglieder. Ein gueltiges Auth-Konto allein ist
-- deshalb noch keine Berechtigung: Die Zeile in `public.profile` ist die
-- serverseitige Mitgliedschaft. Diese Forward-Migration haertet bestehende
-- Own-Row-Policies und die referenzielle Integritaet, ohne Auth-IDs oder
-- bestehende Daten umzubenennen.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.ist_duellprofil()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile p
    where p.id = (select auth.uid())
  )
$$;

revoke all on function private.ist_duellprofil() from public, anon, authenticated;
grant execute on function private.ist_duellprofil() to authenticated;

-- Nichts wird automatisch bereinigt. Falls Altzeilen keinem der beiden
-- Profile gehoeren, stoppt die Migration mit den betroffenen Tabellennamen.
-- Ob solche Daten zugeordnet, exportiert oder geloescht werden, ist eine
-- bewusste Betriebsentscheidung vor dem naechsten Lauf.
do $$
declare
  v_tabellen text;
begin
  select string_agg(f.tabelle, ', ' order by f.tabelle)
  into v_tabellen
  from (
    select 'eintraege' as tabelle where exists (
      select 1 from public.eintraege x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'werte' where exists (
      select 1 from public.werte x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'schlafnaechte' where exists (
      select 1 from public.schlafnaechte x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'schlaf_import_tokens' where exists (
      select 1 from public.schlaf_import_tokens x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'gewicht' where exists (
      select 1 from public.gewicht x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'einheiten' where exists (
      select 1 from public.einheiten x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'aufenthalte' where exists (
      select 1 from public.aufenthalte x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'faecher' where exists (
      select 1 from public.faecher x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'noten' where exists (
      select 1 from public.noten x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'push_abos' where exists (
      select 1 from public.push_abos x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'erinnerungs_einstellungen' where exists (
      select 1 from public.erinnerungs_einstellungen x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'erinnerungs_versand' where exists (
      select 1 from public.erinnerungs_versand x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
    union all select 'kurzbefehl_laeufe' where exists (
      select 1 from public.kurzbefehl_laeufe x
      where not exists (select 1 from public.profile p where p.id = x.user_id)
    )
  ) f;

  if v_tabellen is not null then
    raise exception 'mitgliedschaft nicht migrierbar; fremde user_id in: %', v_tabellen
      using errcode = 'check_violation',
            hint = 'Daten vor der Migration bewusst zuordnen, exportieren oder loeschen.';
  end if;
end;
$$;

-- Die bisherigen FKs auf auth.users bleiben vorerst bestehen. Die zusaetzliche
-- Referenz auf profile macht die Zwei-Personen-Grenze unabhaengig von einer
-- einzelnen RLS-Policy. Sie kaskadiert bewusst nicht: Eine versehentlich
-- entfernte Profilzeile darf keine Gesundheits-, Noten- oder Trackerhistorie
-- mitloeschen. Die bestehenden auth.users-FKs bilden weiterhin den bewusst
-- auszufuehrenden Kontoloeschpfad. NOT VALID prueft neue Schreibungen sofort;
-- VALIDATE bestaetigt danach den vorhandenen Bestand ohne Tabellenneuschreibung.
alter table public.eintraege
  add constraint eintraege_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.werte
  add constraint werte_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.schlafnaechte
  add constraint schlafnaechte_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.schlaf_import_tokens
  add constraint schlaf_import_tokens_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.gewicht
  add constraint gewicht_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.einheiten
  add constraint einheiten_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.aufenthalte
  add constraint aufenthalte_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.faecher
  add constraint faecher_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.noten
  add constraint noten_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.push_abos
  add constraint push_abos_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.erinnerungs_einstellungen
  add constraint erinnerungs_einstellungen_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.erinnerungs_versand
  add constraint erinnerungs_versand_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;
alter table public.kurzbefehl_laeufe
  add constraint kurzbefehl_laeufe_duellprofil_fk
  foreign key (user_id) references public.profile(id) not valid;

alter table public.eintraege validate constraint eintraege_duellprofil_fk;
alter table public.werte validate constraint werte_duellprofil_fk;
alter table public.schlafnaechte validate constraint schlafnaechte_duellprofil_fk;
alter table public.schlaf_import_tokens validate constraint schlaf_import_tokens_duellprofil_fk;
alter table public.gewicht validate constraint gewicht_duellprofil_fk;
alter table public.einheiten validate constraint einheiten_duellprofil_fk;
alter table public.aufenthalte validate constraint aufenthalte_duellprofil_fk;
alter table public.faecher validate constraint faecher_duellprofil_fk;
alter table public.noten validate constraint noten_duellprofil_fk;
alter table public.push_abos validate constraint push_abos_duellprofil_fk;
alter table public.erinnerungs_einstellungen
  validate constraint erinnerungs_einstellungen_duellprofil_fk;
alter table public.erinnerungs_versand validate constraint erinnerungs_versand_duellprofil_fk;
alter table public.kurzbefehl_laeufe validate constraint kurzbefehl_laeufe_duellprofil_fk;

-- Gemeinsame Lesesichten bleiben fuer beide Mitglieder sichtbar. Eigene
-- Schreibungen verlangen immer zugleich Mitgliedschaft und Eigentum.
drop policy if exists "profile lesen" on public.profile;
create policy "profile lesen" on public.profile
  for select to authenticated using ((select private.ist_duellprofil()));

drop policy if exists "eintraege lesen" on public.eintraege;
create policy "eintraege lesen" on public.eintraege
  for select to authenticated using ((select private.ist_duellprofil()));
drop policy if exists "eintraege schreiben" on public.eintraege;
create policy "eintraege schreiben" on public.eintraege
  for insert to authenticated with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "eintraege loeschen" on public.eintraege;
create policy "eintraege loeschen" on public.eintraege
  for delete to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );

drop policy if exists "werte lesen" on public.werte;
create policy "werte lesen" on public.werte
  for select to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "werte schreiben" on public.werte;
create policy "werte schreiben" on public.werte
  for insert to authenticated with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "werte aendern" on public.werte;
create policy "werte aendern" on public.werte
  for update to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  ) with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "werte loeschen" on public.werte;
create policy "werte loeschen" on public.werte
  for delete to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );

drop policy if exists "gewicht lesen" on public.gewicht;
create policy "gewicht lesen" on public.gewicht
  for select to authenticated using ((select private.ist_duellprofil()));
drop policy if exists "gewicht schreiben" on public.gewicht;
create policy "gewicht schreiben" on public.gewicht
  for insert to authenticated with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "gewicht aendern" on public.gewicht;
create policy "gewicht aendern" on public.gewicht
  for update to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  ) with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "gewicht loeschen" on public.gewicht;
create policy "gewicht loeschen" on public.gewicht
  for delete to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );

drop policy if exists "einheiten lesen" on public.einheiten;
create policy "einheiten lesen" on public.einheiten
  for select to authenticated using ((select private.ist_duellprofil()));
drop policy if exists "einheiten schreiben" on public.einheiten;
create policy "einheiten schreiben" on public.einheiten
  for insert to authenticated with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "einheiten aendern" on public.einheiten;
create policy "einheiten aendern" on public.einheiten
  for update to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  ) with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "einheiten loeschen" on public.einheiten;
create policy "einheiten loeschen" on public.einheiten
  for delete to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );

drop policy if exists "aufenthalte lesen" on public.aufenthalte;
create policy "aufenthalte lesen" on public.aufenthalte
  for select to authenticated using ((select private.ist_duellprofil()));

drop policy if exists "faecher lesen" on public.faecher;
create policy "faecher lesen" on public.faecher
  for select to authenticated using ((select private.ist_duellprofil()));
drop policy if exists "faecher aendern" on public.faecher;
create policy "faecher aendern" on public.faecher
  for update to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  ) with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );

drop policy if exists "noten lesen" on public.noten;
create policy "noten lesen" on public.noten
  for select to authenticated using ((select private.ist_duellprofil()));
drop policy if exists "noten schreiben" on public.noten;
create policy "noten schreiben" on public.noten
  for insert to authenticated with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
    and exists (
      select 1
      from public.faecher f
      where f.id = fach_id
        and f.user_id = (select auth.uid())
    )
  );
drop policy if exists "noten loeschen" on public.noten;
create policy "noten loeschen" on public.noten
  for delete to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );

drop policy if exists "push abos lesen" on public.push_abos;
create policy "push abos lesen" on public.push_abos
  for select to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "push abos anlegen" on public.push_abos;
create policy "push abos anlegen" on public.push_abos
  for insert to authenticated with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "push abos aendern" on public.push_abos;
create policy "push abos aendern" on public.push_abos
  for update to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  ) with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "push abos loeschen" on public.push_abos;
create policy "push abos loeschen" on public.push_abos
  for delete to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );

drop policy if exists "erinnerungszeit lesen" on public.erinnerungs_einstellungen;
create policy "erinnerungszeit lesen" on public.erinnerungs_einstellungen
  for select to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "erinnerungszeit anlegen" on public.erinnerungs_einstellungen;
create policy "erinnerungszeit anlegen" on public.erinnerungs_einstellungen
  for insert to authenticated with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );
drop policy if exists "erinnerungszeit aendern" on public.erinnerungs_einstellungen;
create policy "erinnerungszeit aendern" on public.erinnerungs_einstellungen
  for update to authenticated using (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  ) with check (
    (select private.ist_duellprofil())
    and (select auth.uid()) = user_id
  );

drop policy if exists "laeufe lesen" on public.kurzbefehl_laeufe;
create policy "laeufe lesen" on public.kurzbefehl_laeufe
  for select to authenticated using ((select private.ist_duellprofil()));

drop policy if exists "schlaf updates lesen" on public.schlaf_updates;
create policy "schlaf updates lesen" on public.schlaf_updates
  for select to authenticated using ((select private.ist_duellprofil()));

-- Ein Browserkonto braucht nicht beliebig viele Zustelladressen. Die aktuelle
-- Produktion hat lesend geprueft hoechstens zwei je Person. Fuenf lassen
-- Geraetewechsel und Browserprofile zu, begrenzen aber den Fan-out einer
-- kompromittierten Sitzung. Bestand oberhalb der Grenze wird nicht geloescht.
do $$
begin
  if exists (
    select a.user_id
    from public.push_abos a
    group by a.user_id
    having count(*) > 5
  ) then
    raise exception 'push-abo-limit nicht migrierbar; mehr als fuenf geraete fuer ein profil'
      using errcode = 'check_violation',
            hint = 'Abos vor der Migration gemeinsam mit dem betroffenen Mitglied pruefen.';
  end if;
end;
$$;

create or replace function private.begrenze_push_abos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 982451653::bigint)
  );

  if exists (
    select 1 from public.push_abos a
    where a.endpoint = new.endpoint and a.user_id = new.user_id
  ) then
    return new;
  end if;

  if (select count(*) from public.push_abos a where a.user_id = new.user_id) >= 5 then
    raise exception 'hoechstens fuenf push-geraete pro profil'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.begrenze_push_abos() from public, anon, authenticated;
drop trigger if exists push_abos_profil_limit on public.push_abos;
create trigger push_abos_profil_limit
  before insert on public.push_abos
  for each row execute function private.begrenze_push_abos();

-- Auch eine berechtigte Probe soll nicht beliebig viele Web-Pushs ausloesen.
-- Der atomare UPSERT laesst pro Mitglied hoechstens einen Lauf je Minute zu.
create table private.push_probe_limits (
  user_id uuid primary key references public.profile(id) on delete cascade,
  letzter_aufruf timestamptz not null
);
revoke all on table private.push_probe_limits from public, anon, authenticated;

create or replace function private.reserviere_push_probe()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not exists (
    select 1 from public.profile p where p.id = v_user
  ) then
    raise insufficient_privilege using message = 'kein duellmitglied';
  end if;

  insert into private.push_probe_limits as l (user_id, letzter_aufruf)
  values (v_user, clock_timestamp())
  on conflict (user_id) do update
    set letzter_aufruf = excluded.letzter_aufruf
    where l.letzter_aufruf <= excluded.letzter_aufruf - interval '1 minute';

  return found;
end;
$$;

revoke all on function private.reserviere_push_probe() from public, anon, authenticated;
grant execute on function private.reserviere_push_probe() to authenticated;

-- Der exponierte Name besitzt selbst keinerlei Sonderrechte. Nur sein enger,
-- nicht ueber die Data API erreichbarer Kern arbeitet als Definer.
create or replace function public.reserviere_push_probe()
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.reserviere_push_probe()
$$;

revoke all on function public.reserviere_push_probe() from public, anon, authenticated;
grant execute on function public.reserviere_push_probe() to authenticated;
