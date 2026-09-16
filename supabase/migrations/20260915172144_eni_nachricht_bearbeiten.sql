-- Eine eigene Vorlage wie in einem Chat-Client bearbeiten: Die gewaehlte
-- Menschenzeile behaelt ihre ID, Zeit und Anhaenge. Alles, was danach gesagt
-- wurde, gehoert zum alten Ast und wird in derselben Transaktion entfernt.
--
-- SECURITY INVOKER ist hier absichtlich: Select, Update und Delete muessen
-- weiterhin durch die vorhandenen RLS-Policies des angemeldeten Kontos.

grant update (text) on table public.eni_nachrichten to authenticated;

drop policy if exists "eni nachrichten bearbeiten" on public.eni_nachrichten;
create policy "eni nachrichten bearbeiten" on public.eni_nachrichten
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and rolle = 'mensch'
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
  )
  with check (
    (select auth.uid()) = user_id
    and rolle = 'mensch'
    and exists (select 1 from public.profile p where p.id = (select auth.uid()))
  );

create or replace function public.eni_nachricht_bearbeiten(
  p_chat_id uuid,
  p_nachricht_id uuid,
  p_text text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_nutzer uuid := (select auth.uid());
  v_erstellt timestamptz;
  v_entfernte_pfade text[] := array[]::text[];
begin
  if v_nutzer is null then
    raise exception 'anmeldung fehlt' using errcode = '42501';
  end if;
  if p_text is null or char_length(btrim(p_text)) = 0 or char_length(p_text) > 8000 then
    raise exception 'ungueltiger nachrichtentext' using errcode = '22023';
  end if;

  -- Die Zeilensperre verhindert, dass zwei schnelle Bearbeitungen denselben
  -- alten Ast gleichzeitig verzweigen.
  select n.erstellt
  into v_erstellt
  from public.eni_nachrichten n
  where n.id = p_nachricht_id
    and n.chat_id = p_chat_id
    and n.user_id = v_nutzer
    and n.rolle = 'mensch'
  for update;

  if not found then
    raise exception 'eigene nachricht nicht gefunden' using errcode = 'P0002';
  end if;

  -- Bilddateien der abgeschnittenen Vorlagen liegen ausserhalb von Postgres.
  -- Ihre Pfade gehen an den Client zurueck, der sie mit seiner bestehenden
  -- Storage-Policy entfernt. Die Anhaenge der bearbeiteten Zeile bleiben.
  select coalesce(array_agg(a.pfad) filter (where a.pfad is not null), array[]::text[])
  into v_entfernte_pfade
  from public.eni_anhaenge a
  join public.eni_nachrichten n on n.id = a.nachricht_id
  where n.chat_id = p_chat_id
    and n.user_id = v_nutzer
    and (
      n.erstellt > v_erstellt
      or (n.erstellt = v_erstellt and n.id <> p_nachricht_id)
    );

  update public.eni_nachrichten n
  set text = p_text
  where n.id = p_nachricht_id
    and n.chat_id = p_chat_id
    and n.user_id = v_nutzer
    and n.rolle = 'mensch';

  delete from public.eni_nachrichten n
  where n.chat_id = p_chat_id
    and n.user_id = v_nutzer
    and (
      n.erstellt > v_erstellt
      or (n.erstellt = v_erstellt and n.id <> p_nachricht_id)
    );

  -- Bis ENI neu geantwortet hat, ist die bearbeitete Vorlage die letzte
  -- Aktivitaet. Der bestehende Insert-Trigger uebernimmt danach wieder.
  update public.eni_chats c
  set zuletzt = now()
  where c.id = p_chat_id and c.user_id = v_nutzer;

  return jsonb_build_object(
    'zeile', jsonb_build_object(
      'id', p_nachricht_id,
      'rolle', 'mensch',
      'text', p_text,
      'erstellt', v_erstellt
    ),
    'entfernte_pfade', to_jsonb(v_entfernte_pfade)
  );
end;
$$;

revoke all on function public.eni_nachricht_bearbeiten(uuid, uuid, text) from public, anon;
grant execute on function public.eni_nachricht_bearbeiten(uuid, uuid, text) to authenticated;
