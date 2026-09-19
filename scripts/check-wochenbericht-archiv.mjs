// Isolierte PostgreSQL-Probe mit PGlite. Keine Verbindung zu Produktion.
// node scripts/check-wochenbericht-archiv.mjs <pfad-zu-pglite/dist/index.js>
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema private; create schema cron;
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
  grant usage on schema auth to authenticated;
  create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
  create table profile(id uuid primary key, person text);
  grant select on profile to authenticated;
  create table einheiten(id uuid, user_id uuid, bereich text, tag date, wert int, erfasst timestamptz, von timestamptz);
  create table gewicht(user_id uuid, tag date, kg numeric);
  create table aufenthalte(user_id uuid, bereich text, ort text, ankunft timestamptz, abgang timestamptz);
  create table schlafnaechte_ansicht(user_id uuid, nacht date, schlaf_minuten numeric,
    einschlafzeit timestamptz, aufwachzeit timestamptz, bett_start timestamptz, bett_ende timestamptz,
    bett_minuten numeric, tief_minuten numeric, rem_minuten numeric, kern_minuten numeric,
    unspez_minuten numeric, wach_minuten numeric, schlafziel_minuten int, nachtwert int, score_konfidenz int);
  insert into profile values ('00000000-0000-0000-0000-000000000001','erijon'), ('00000000-0000-0000-0000-000000000002','koray');
  insert into einheiten values ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','lernen','2026-08-24',30,'2026-08-24T12:00Z',null);
  insert into gewicht values ('00000000-0000-0000-0000-000000000002','2026-08-25',75);
  insert into aufenthalte values ('00000000-0000-0000-0000-000000000002','gym','gym','2026-08-24T14:00Z','2026-08-24T15:00Z');
  insert into schlafnaechte_ansicht(user_id,nacht,schlaf_minuten,einschlafzeit,nachtwert)
    values ('00000000-0000-0000-0000-000000000001','2026-08-25',480,'2026-08-24T22:00Z',80);
`)
await db.exec(await readFile(new URL('../supabase/migrations/20260919154400_wochenbericht_archiv.sql', import.meta.url), 'utf8'))
await db.exec(`select private.sichere_wochenbericht('2026-08-24',true)`)
const lesen = async () => (await db.query('select * from wochenberichte')).rows
const [archiv] = await lesen()
assert.equal(archiv.quelle, 'montag')
assert.equal(archiv.daten.zustand.einheiten['erijon|lernen|2026-08-24'][0].wert,30)
assert.equal(archiv.daten.zustand.gewichte['koray|2026-08-25'],75)
assert.equal(archiv.daten.naechte[0].schlafMinuten,480)
await db.exec(`update einheiten set wert = 100; delete from gewicht; select private.sichere_wochenbericht('2026-08-24',false);`)
assert.deepEqual((await lesen())[0],archiv)
await assert.rejects(() => db.exec(`select private.sichere_wochenbericht('2099-01-05',false)`))
await assert.rejects(() => db.exec(`select private.sichere_wochenbericht('2026-08-25',false)`))
for (const id of ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002']) {
  await db.exec(`set role authenticated; set test.uid = '${id}';`)
  assert.deepEqual((await lesen())[0], archiv)
  await assert.rejects(() => db.exec(`update wochenberichte set quelle='nachgeholt'`))
  await assert.rejects(() => db.exec(`select public.hole_wochenbericht('2026-08-17')`))
  await db.exec('reset role')
}
await db.exec(`set role authenticated; set test.uid = '00000000-0000-0000-0000-000000000099';`)
assert.equal((await lesen()).length,0)
await db.exec('reset role; set role anon')
await assert.rejects(lesen)
await db.exec('reset role; set role service_role')
await db.exec(`select public.hole_wochenbericht('2026-08-17')`)
await db.exec('reset role')
assert.equal((await db.query(`select quelle from wochenberichte where woche='2026-08-17'`)).rows[0].quelle,'nachgeholt')
await db.close()
console.log('OK: SQL ausgefuehrt, Momentaufnahme unveraenderlich, beide Mitglieder gleich, Fremdkonto/anon/Schreibzugriffe gesperrt, Nachholen und Datumsgrenzen geprueft.')
