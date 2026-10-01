// Isolated embedded PostgreSQL. Never connects to production.
// Usage: node scripts/check-eni-rollen-wissen.mjs <absolute path to @electric-sql/pglite/dist/index.js>
//
// Spielt die Migration eni_rollen_wissen durch: wer starten, lesen, bearbeiten
// und loeschen darf, dass der Worker eine Recherche nur einmal bekommt, und
// dass der Cron-Job nur ruft, wenn etwas wartet.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite')
const db = new PGlite()
const erijon = '11111111-1111-4111-8111-111111111111'
const koray = '22222222-2222-4222-8222-222222222222'
const fremd = '33333333-3333-4333-8333-333333333333'
try {
  await db.exec(`create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create schema cron; create schema vault; create schema net;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
    create table public.profile(id uuid primary key, person text);
    grant select on public.profile to authenticated;
    insert into auth.users values ('${erijon}'),('${koray}'),('${fremd}');
    insert into profile values ('${erijon}','erijon'),('${koray}','koray');
    create table cron.jobs(name text, plan text, befehl text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.jobs values ($1,$2,$3); select 1::bigint $$;
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    insert into vault.decrypted_secrets values ('vierfelder_project_url','https://projekt.example'),('vierfelder_aktivitaets_scheduler','${'a'.repeat(64)}');
    create table net.gerufen(url text, headers jsonb);
    create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ insert into net.gerufen values (url, headers); select 1::bigint $$;`)
  await db.exec(
    await readFile(new URL('../supabase/migrations/20261001180000_eni_rollen_wissen.sql', import.meta.url), 'utf8'),
  )
  const als = async (id, rolle = 'authenticated') => {
    await db.exec(`reset role; set role ${rolle};`)
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ''])
  }
  const zeilen = async (sql, werte = []) => (await db.query(sql, werte)).rows

  // starten legt eine laufende recherche an, nur für die eigene person
  await als(erijon)
  await db.query("select eni_recherche_starten('eigen-aajonus', 'Aajonus Vonderplanitz', 'Rohkost, seine Bücher')")
  const [neu] = await zeilen('select user_id, name, status, schritte, akte from eni_rollen_wissen')
  assert.deepEqual(neu, { user_id: erijon, name: 'Aajonus Vonderplanitz', status: 'laeuft', schritte: [], akte: '' })

  // direkt schreiben geht nicht: kein insert, den arbeitsstand nicht ändern
  await assert.rejects(
    db.query("insert into eni_rollen_wissen(user_id, rolle_id, name) values ($1, 'x', 'X')", [erijon]),
    /permission denied/,
  )
  await assert.rejects(db.query("update eni_rollen_wissen set schritte = '[1]'::jsonb"), /permission denied/)
  await assert.rejects(db.query("update eni_rollen_wissen set status = 'fertig'"), /permission denied/)
  // die akte nur, wenn nichts läuft
  assert.equal((await zeilen("update eni_rollen_wissen set akte = 'x' returning 1")).length, 0)
  await assert.rejects(db.query('select * from eni_recherche_nehmen(null)'), /permission denied/)

  // die andere person sieht und ändert nichts
  await als(koray)
  assert.equal((await zeilen('select * from eni_rollen_wissen')).length, 0, 'koray sieht erijons recherche nicht')
  assert.equal((await zeilen('delete from eni_rollen_wissen returning 1')).length, 0)
  await db.query("select eni_recherche_abbrechen('eigen-aajonus')")

  // ohne duellprofil und ohne anmeldung gibt es keinen start
  await als(fremd)
  await assert.rejects(db.query("select eni_recherche_starten('x', 'X', '')"), /nicht erlaubt/)
  await als(null, 'anon')
  await assert.rejects(db.query("select eni_recherche_starten('x', 'X', '')"), /permission denied/)
  await assert.rejects(db.query('select * from eni_rollen_wissen'), /permission denied/)

  // der cron-job ruft nur, wenn etwas wartet
  await db.exec('reset role')
  const [job] = await zeilen("select * from cron.jobs where name = 'eni-recherche'")
  assert.equal(job.plan, '* * * * *')
  await db.exec(job.befehl)
  const [ruf] = await zeilen('select * from net.gerufen')
  assert.equal(ruf.url, 'https://projekt.example/functions/v1/eni-recherche')
  assert.equal(ruf.headers['x-erinnerungs-secret'], 'a'.repeat(64))

  // der worker bekommt sie genau einmal, bis die sperre abläuft
  await als(null, 'service_role')
  const genommen = await zeilen('select rolle_id, lauf from eni_recherche_nehmen(null)')
  assert.equal(genommen.length, 1)
  assert.equal((await zeilen('select * from eni_recherche_nehmen(null)')).length, 0, 'gesperrt')
  assert.equal((await zeilen('select * from eni_recherche_nehmen($1)', [koray])).length, 0)
  await db.exec('reset role; delete from net.gerufen')
  await db.exec(job.befehl)
  assert.equal((await zeilen('select * from net.gerufen')).length, 0, 'gesperrt heisst: kein aufruf')

  // fertig schreiben, dann darf die person die akte bearbeiten
  await als(null, 'service_role')
  await db.query(
    "update eni_rollen_wissen set status = 'fertig', akte = '# Aajonus', akte_name = name, gesperrt_bis = null where lauf = $1",
    [genommen[0].lauf],
  )
  await als(erijon)
  assert.equal((await zeilen("update eni_rollen_wissen set akte = '# Aajonus (bearbeitet)' returning 1")).length, 1)

  // neu starten: die alte akte bleibt, der arbeitsstand beginnt leer mit neuem lauf
  await db.query("select eni_recherche_starten('eigen-aajonus', 'Aajonus Vonderplanitz', '')")
  const [zweiter] = await zeilen('select status, akte, lauf from eni_rollen_wissen')
  assert.equal(zweiter.status, 'laeuft')
  assert.equal(zweiter.akte, '# Aajonus (bearbeitet)')
  assert.notEqual(zweiter.lauf, genommen[0].lauf)

  // abbrechen mit akte: die akte bleibt, ohne akte: die zeile geht
  await db.query("select eni_recherche_abbrechen('eigen-aajonus')")
  assert.deepEqual(await zeilen('select status, akte from eni_rollen_wissen'), [
    { status: 'fertig', akte: '# Aajonus (bearbeitet)' },
  ])
  await db.query("select eni_recherche_starten('eigen-ali', 'Muhammad Ali', '')")
  await db.query("select eni_recherche_abbrechen('eigen-ali')")
  assert.equal((await zeilen("select * from eni_rollen_wissen where rolle_id = 'eigen-ali'")).length, 0)

  // höchstens drei gleichzeitig
  for (const r of ['a', 'b', 'c']) await db.query('select eni_recherche_starten($1, $1, $2)', [r, ''])
  await assert.rejects(db.query("select eni_recherche_starten('d', 'd', '')"), /hoechstens drei/)
  // dieselbe rolle neu starten zählt nicht doppelt
  await db.query("select eni_recherche_starten('a', 'a', '')")

  // löschen geht, auch mitten in der recherche
  assert.equal((await zeilen("delete from eni_rollen_wissen where rolle_id = 'a' returning 1")).length, 1)

  console.log('eni_rollen_wissen: rechte, sperre, abbruch und cron passen')
} finally {
  await db.close()
}
