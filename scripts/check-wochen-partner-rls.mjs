// Isolated embedded PostgreSQL. Never connects to Supabase production.
// Usage: node scripts/check-wochen-partner-rls.mjs <absolute path to @electric-sql/pglite/dist/index.js>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(
  process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite',
)
const db = new PGlite()
const erijon = '11111111-1111-4111-8111-111111111111'
const koray = '22222222-2222-4222-8222-222222222222'
const fremd = '33333333-3333-4333-8333-333333333333'

const migration = await readFile(
  new URL('../supabase/migrations/20260913173714_wochen_partner_erinnerungen.sql', import.meta.url),
  'utf8',
)

const query = (sql, params = []) => db.query(sql, params)
const asRole = async (id, role = 'authenticated') => {
  await db.exec(`reset role; set role ${role};`)
  await query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const count = async (sql, params = []) => Number((await query(sql, params)).rows[0].count)
const kandid = async (at) => (await query('select * from public.aktivitaets_kandidaten($1) order by user_id, art', [at])).rows
const dateText = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value)

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create schema auth;
    create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
    create table public.profile(id uuid primary key, person text unique);
    create table public.erinnerungs_einstellungen(
      user_id uuid primary key references auth.users(id),
      gewicht_aktiv boolean not null default true,
      gewicht_zeit time not null default time '20:00',
      lernen_aktiv boolean not null default true,
      lesen_aktiv boolean not null default true,
      wochenblick_aktiv boolean not null default true
    );
    create table public.push_abos(
      user_id uuid not null references auth.users(id),
      endpoint text primary key,
      p256dh text not null,
      auth text not null
    );
    create table public.aktivitaets_versand(
      user_id uuid not null references auth.users(id),
      art text not null check (art in ('lernen','lesen','wochenblick')),
      tag date not null,
      token uuid not null,
      zustand text not null default 'reserviert',
      erstellt timestamptz not null default now(),
      aktualisiert timestamptz not null default now(),
      primary key (user_id, art, tag)
    );
    create table public.einheiten(
      id uuid primary key,
      user_id uuid not null references auth.users(id),
      bereich text not null check (bereich in ('lernen','gym','boxen','lesen')),
      tag date not null,
      wert int,
      erfasst timestamptz,
      erstellt timestamptz not null default now()
    );
    create table public.aufenthalte(
      id bigint generated always as identity primary key,
      user_id uuid not null references auth.users(id),
      bereich text not null check (bereich in ('lernen','gym','boxen','lesen')),
      ort text not null,
      ankunft timestamptz not null,
      abgang timestamptz,
      aktualisiert timestamptz not null default now()
    );
    create table public.gewicht(
      user_id uuid not null references auth.users(id),
      tag date not null,
      kg numeric(5,2) not null,
      erstellt timestamptz not null default now(),
      primary key (user_id, tag)
    );
    create table public.eni_chats(
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id),
      titel text not null default '',
      erstellt timestamptz not null default now(),
      zuletzt timestamptz not null default now()
    );
    create table public.eni_nachrichten(
      id uuid primary key default gen_random_uuid(),
      chat_id uuid not null references public.eni_chats(id),
      user_id uuid not null references auth.users(id),
      rolle text not null,
      text text not null,
      erstellt timestamptz not null default now()
    );
    alter table public.eni_chats enable row level security;
    alter table public.eni_nachrichten enable row level security;
    grant usage on schema public to authenticated, anon, service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant execute on all functions in schema public to service_role;
    insert into auth.users values
      ('${erijon}'), ('${koray}'), ('${fremd}');
    insert into profile values ('${erijon}', 'erijon'), ('${koray}', 'koray');
    insert into erinnerungs_einstellungen(user_id) values ('${erijon}'), ('${koray}');
    grant select on public.profile to authenticated;
    grant select on public.erinnerungs_einstellungen to authenticated;
    grant update on public.erinnerungs_einstellungen to authenticated;
    grant select on public.push_abos to authenticated;
    grant select, insert, update, delete on public.eni_chats to authenticated;
    grant select, insert, delete on public.eni_nachrichten to authenticated;
  `)

  await db.exec(migration)

  await db.exec('reset role;')
  await query(
    `insert into public.push_abos(user_id, endpoint, p256dh, auth) values
      ($1, 'https://web.push.apple.com/e', 'p', 'a'),
      ($2, 'https://web.push.apple.com/k', 'p', 'a')`,
    [erijon, koray],
  )

  // DST: Sonntag 20:00 ist in Sommer und Winter faellig, 19:59 noch nicht.
  assert.equal((await query("select sichere_faellige_eni_wochen_einladungen('2099-07-05 19:59 Europe/Berlin')")).rows[0].sichere_faellige_eni_wochen_einladungen, 0)
  assert.equal((await query("select sichere_faellige_eni_wochen_einladungen('2099-07-05 20:00 Europe/Berlin')")).rows[0].sichere_faellige_eni_wochen_einladungen, 2)
  assert.equal((await query("select sichere_faellige_eni_wochen_einladungen('2099-07-05 21:59 Europe/Berlin')")).rows[0].sichere_faellige_eni_wochen_einladungen, 0)
  assert.equal((await query("select sichere_faellige_eni_wochen_einladungen('2099-12-05 19:59 Europe/Berlin')")).rows[0].sichere_faellige_eni_wochen_einladungen, 0)
  assert.equal((await query("select sichere_faellige_eni_wochen_einladungen('2099-12-06 20:00 Europe/Berlin')")).rows[0].sichere_faellige_eni_wochen_einladungen, 2)

  // Candidate shape, weekly URL, and the old Sunday-18 notification coexist.
  let rows = await kandid('2099-07-05 20:00 Europe/Berlin')
  const weekly = rows.filter((row) => row.art === 'wochenrueckblick')
  assert.equal(weekly.length, 2)
  assert.equal(dateText(weekly[0].tag), '2099-06-29')
  assert.equal(dateText(weekly[0].sendetag), '2099-07-05')
  assert.equal(weekly[0].url, './#/eni?woche=2099-06-29')
  assert.equal(weekly[0].nachricht, 'Willst du, dass Eni deine Woche zusammenfasst?')

  // Fuer die RPC-/RLS-Pruefung wird die Fixture danach als bereits faellig
  // markiert; PGlite laeuft mit echter Systemzeit statt mit der Fixture-Uhr.
  await query("update public.eni_wochen_einladungen set faellig_am='2020-01-01 20:00 Europe/Berlin'")

  // Direct weekly metadata writes are rejected. Standard chats remain usable.
  await asRole(erijon)
  const standard = (await query("insert into public.eni_chats(user_id, titel) values ($1, 'normal') returning id", [erijon])).rows[0].id
  await assert.rejects(query("update public.eni_chats set wochenbeginn='2099-06-29' where id=$1", [standard]))
  await assert.rejects(query("insert into public.eni_chats(user_id, titel, wochenbeginn) values ($1, 'falsch', '2099-06-29')", [erijon]))
  const opened = (await query("select * from public.oeffne_eni_wochenchat('2099-06-29')")).rows
  assert.equal(opened.length, 1)
  assert.equal(dateText(opened[0].wochenbeginn), '2099-06-29')
  const openedAgain = (await query("select * from public.oeffne_eni_wochenchat('2099-06-29')")).rows
  assert.equal(openedAgain[0].id, opened[0].id)
  await assert.rejects(query("update public.eni_chats set wochenbeginn='2099-06-22' where id=$1", [opened[0].id]))

  // Owner catch-up is real server-time/RLS scoped; closing is idempotent and
  // never accepts another user's row or client supplied metadata.
  const invitations = (await query('select * from public.hole_eni_wochen_einladungen()')).rows
  assert.equal(invitations.length, 2)
  assert.equal((await query("select * from public.schliesse_eni_wochen_einladung('2099-06-29')")).rows.length, 1)
  const closedAgain = (await query("select * from public.schliesse_eni_wochen_einladung('2099-06-29')")).rows
  assert.equal(closedAgain.length, 1)
  assert.equal(
    closedAgain[0].geschlossen_am.toISOString(),
    (await query("select geschlossen_am from public.eni_wochen_einladungen where user_id=$1 and wochenbeginn='2099-06-29'", [erijon])).rows[0].geschlossen_am.toISOString(),
  )
  assert.equal((await query("select * from public.schliesse_eni_wochen_einladung('2099-06-22')")).rows.length, 0)

  await asRole(fremd)
  assert.equal((await query('select * from public.hole_eni_wochen_einladungen()')).rows.length, 0)
  assert.equal((await query("select * from public.oeffne_eni_wochenchat('2099-06-29')")).rows.length, 0)
  await assert.rejects(query("insert into public.eni_chats(user_id, titel) values ($1, 'fremd')", [fremd]))

  // Partner tests on a clean Monday morning: one receiver, deduplicated
  // category/day, strict completion timestamps and duration thresholds.
  await db.exec('reset role;')
  await query('delete from public.eni_wochen_einladungen')
  await query('delete from public.eni_chats')
  await query('delete from public.einheiten')
  await query('delete from public.aufenthalte')
  await query('delete from public.gewicht')
  const day = '2099-07-06'
  const at = '2099-07-06 18:00 Europe/Berlin'
  const addUnit = async (user, area, tag = day, created = at) => {
    await query('insert into public.einheiten(id,user_id,bereich,tag,erstellt) values(gen_random_uuid(),$1,$2,$3,$4)', [user, area, tag, created])
  }
  await addUnit(koray, 'gym')
  await addUnit(koray, 'boxen')
  await addUnit(koray, 'lesen')
  await addUnit(koray, 'lesen') // same category/day must not become four
  rows = await kandid(at)
  const partner = rows.filter((row) => row.art === 'partner')
  assert.equal(partner.length, 1)
  assert.equal(partner[0].user_id, erijon)
  assert.match(partner[0].nachricht, /3 Bereiche/)

  // A fresh completion is only the third priority and never weight itself.
  await query('delete from public.einheiten')
  await query('insert into public.gewicht(user_id,tag,kg,erstellt) values($1,$2,80,$3)', [koray, day, '2099-07-06 17:55 Europe/Berlin'])
  await addUnit(koray, 'lernen', day, '2099-07-06 17:55 Europe/Berlin')
  rows = await kandid('2099-07-06 18:00 Europe/Berlin')
  assert.equal(rows.filter((row) => row.art === 'partner').length, 1)
  assert.match(rows.find((row) => row.art === 'partner').nachricht, /Lernen/)

  // Nine minutes does not qualify as reading; ten does. A >12h session and
  // future/backfilled rows are ignored.
  await query('delete from public.einheiten')
  await query('insert into public.aufenthalte(user_id,bereich,ort,ankunft,abgang) values($1,\'lesen\',\'r9\',$2,$3)', [koray, '2099-07-06 18:00 Europe/Berlin', '2099-07-06 18:09 Europe/Berlin'])
  rows = await kandid('2099-07-06 18:10 Europe/Berlin')
  assert.equal(rows.filter((row) => row.art === 'partner').length, 0)
  await query('update public.aufenthalte set abgang=$1', ['2099-07-06 18:10 Europe/Berlin'])
  rows = await kandid('2099-07-06 18:11 Europe/Berlin')
  assert.equal(rows.filter((row) => row.art === 'partner').length, 1)
  await query('delete from public.aufenthalte')
  await query('insert into public.aufenthalte(user_id,bereich,ort,ankunft,abgang) values($1,\'gym\',\'long\',$2,$3)', [koray, '2099-07-05 05:00 Europe/Berlin', '2099-07-06 18:00 Europe/Berlin'])
  rows = await kandid('2099-07-06 18:01 Europe/Berlin')
  assert.equal(rows.filter((row) => row.art === 'partner').length, 0)
  await addUnit(koray, 'lernen', day, '2099-07-07 18:05 Europe/Berlin')
  rows = await kandid('2099-07-06 18:06 Europe/Berlin')
  assert.equal(rows.filter((row) => row.art === 'partner').length, 0)

  // Own live sessions and the setting/quiet-hour gates suppress partner work.
  await query('delete from public.aufenthalte')
  await query('delete from public.einheiten')
  await addUnit(koray, 'gym', day, '2099-07-06 17:55 Europe/Berlin')
  await addUnit(koray, 'boxen', day, '2099-07-06 17:55 Europe/Berlin')
  await addUnit(koray, 'lesen', day, '2099-07-06 17:55 Europe/Berlin')
  await query('insert into public.aufenthalte(user_id,bereich,ort,ankunft) values($1,\'gym\',\'live\',$2)', [erijon, '2099-07-06 17:00 Europe/Berlin'])
  assert.equal((await kandid(at)).filter((row) => row.art === 'partner').length, 0)
  await query('delete from public.aufenthalte')
  assert.equal((await kandid('2099-07-06 08:59 Europe/Berlin')).filter((row) => row.art === 'partner').length, 0)
  assert.equal((await kandid('2099-07-06 21:00 Europe/Berlin')).filter((row) => row.art === 'partner').length, 0)
  await query('update public.erinnerungs_einstellungen set partner_aktiv=false where user_id=$1', [erijon])
  assert.equal((await kandid(at)).filter((row) => row.art === 'partner').length, 0)

  console.log('PASS: Wochen-Einladungen, geschuetzte Wochen-Chats, DST, RLS, Partner-Prioritaeten, Dedup, Fristen, Live- und Quiet-Hour-Gates.')
} finally {
  await db.close()
}
