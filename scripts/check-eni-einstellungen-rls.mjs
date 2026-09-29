// Isolated embedded PostgreSQL. Never connects to production.
// Usage: node scripts/check-eni-einstellungen-rls.mjs <absolute path to @electric-sql/pglite/dist/index.js>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite')
const db = new PGlite()
const erijon = '11111111-1111-4111-8111-111111111111'
const koray = '22222222-2222-4222-8222-222222222222'
const fremd = '33333333-3333-4333-8333-333333333333'
try {
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table public.profile(id uuid primary key, person text);
    grant select on public.profile to authenticated;
    insert into auth.users values ('${erijon}'),('${koray}'),('${fremd}');
    insert into profile values ('${erijon}','erijon'),('${koray}','koray');`)
  await db.exec(
    await readFile(new URL('../supabase/migrations/20260929160000_eni_einstellungen.sql', import.meta.url), 'utf8'),
  )
  const als = async (id, rolle = 'authenticated') => {
    await db.exec(`reset role; set role ${rolle};`)
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  }
  const rollen = JSON.stringify([
    { id: 'ernaehrung', name: 'Ernährungsberater', thema: 'Essen', anweisung: 'Mengen nennen', aktiv: true },
  ])

  // eigene zeile anlegen und per upsert ändern, wie der client es tut
  await als(erijon)
  await db.query(
    "insert into eni_einstellungen(user_id,ton,laenge,anweisungen,rollen) values ($1,'streng','kurz','Nenn mich Chef',$2::jsonb)",
    [erijon, rollen],
  )
  await db.query(
    "insert into eni_einstellungen(user_id,ton,laenge,anweisungen,rollen) values ($1,'locker','kurz','',$2::jsonb) on conflict (user_id) do update set ton=excluded.ton, anweisungen=excluded.anweisungen",
    [erijon, rollen],
  )
  assert.deepEqual((await db.query('select ton, anweisungen from eni_einstellungen')).rows, [
    { ton: 'locker', anweisungen: '' },
  ])

  // fremd schreiben geht nicht, fremd lesen sieht nichts
  await assert.rejects(db.query("insert into eni_einstellungen(user_id) values ($1)", [koray]))
  await als(koray)
  assert.equal((await db.query('select * from eni_einstellungen')).rows.length, 0, 'koray sieht erijons einstellungen nicht')
  assert.equal(
    (await db.query("update eni_einstellungen set ton='streng' where user_id=$1 returning user_id", [erijon])).rows.length,
    0,
  )
  assert.equal(
    (await db.query('delete from eni_einstellungen where user_id=$1 returning user_id', [erijon])).rows.length,
    0,
  )
  await db.query("insert into eni_einstellungen(user_id,ton) values ($1,'sachlich')", [koray])
  assert.equal((await db.query('select * from eni_einstellungen')).rows.length, 1)

  // wer nicht zum duell gehört, legt nichts an; anon kommt gar nicht an die tabelle
  await als(fremd)
  await assert.rejects(db.query("insert into eni_einstellungen(user_id) values ($1)", [fremd]))
  await als(erijon, 'anon')
  await assert.rejects(db.query('select * from eni_einstellungen'))

  // die prüfungen der tabelle halten unsinn draussen
  await als(erijon)
  await assert.rejects(db.query("update eni_einstellungen set ton='laut' where user_id=$1", [erijon]))
  await assert.rejects(db.query("update eni_einstellungen set laenge='riesig' where user_id=$1", [erijon]))
  await assert.rejects(db.query("update eni_einstellungen set rollen='{}'::jsonb where user_id=$1", [erijon]))
  await assert.rejects(
    db.query('update eni_einstellungen set anweisungen=$2 where user_id=$1', [erijon, 'x'.repeat(1501)]),
  )
  await assert.rejects(db.query('update eni_einstellungen set user_id=$2 where user_id=$1', [erijon, koray]))

  // geaendert läuft mit
  await db.exec('reset role')
  await db.query("update eni_einstellungen set geaendert='2000-01-01' where user_id=$1", [erijon])
  await als(erijon)
  await db.query("update eni_einstellungen set ton='sanft' where user_id=$1", [erijon])
  const [{ neu }] = (
    await db.query("select geaendert > '2020-01-01' as neu from eni_einstellungen where user_id=$1", [erijon])
  ).rows
  assert.equal(neu, true)

  console.log('PASS: eni_einstellungen — nur eigene zeile, nur duellkonten, anon ohne zugriff, prüfungen greifen')
} finally {
  await db.close()
}
