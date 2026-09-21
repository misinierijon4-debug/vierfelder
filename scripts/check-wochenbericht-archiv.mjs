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

// --- Nachtrag der letzten Nacht, persoenliche Texte, Meldung ---------------
// Die zweite Migration braucht die Tabellen des Aktivitaetsversands. Sie sind
// hier nur so weit nachgebildet, wie `aktivitaets_kandidaten` sie anfasst.
await db.exec(`
  alter table einheiten add column erstellt timestamptz not null default now();
  alter table gewicht add column erstellt timestamptz not null default now();
  create table push_abos(user_id uuid, endpoint text);
  create table erinnerungs_einstellungen(user_id uuid primary key, lernen_aktiv boolean default true,
    lesen_aktiv boolean default true, wochenblick_aktiv boolean default true,
    partner_aktiv boolean default true, wochenrueckblick_aktiv boolean default true);
  create table aktivitaets_versand(user_id uuid, art text, tag date, primary key(user_id,art,tag),
    constraint aktivitaets_versand_art_check check (art in ('lernen','lesen','wochenblick','partner','wochenrueckblick')));
  create table eni_wochen_einladungen(user_id uuid, wochenbeginn date, faellig_am timestamptz, geschlossen_am timestamptz);
  insert into erinnerungs_einstellungen(user_id) values
    ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
  insert into push_abos values ('00000000-0000-0000-0000-000000000001','https://web.push.apple.com/a'),
    ('00000000-0000-0000-0000-000000000002','https://web.push.apple.com/b');
`)
await db.exec(await readFile(new URL('../supabase/migrations/20260921180000_wochenbericht_nachtrag_push_und_persoenliche_texte.sql', import.meta.url), 'utf8'))

const naechte = async (woche) => (await db.query(
  `select jsonb_array_length(daten->'naechte') as anzahl from wochenberichte where woche = $1`, [woche])).rows[0].anzahl
// Der Bestand wurde beim Anwenden nachgetragen und gilt damit als fertig.
assert.equal((await db.query(
  `select count(*)::int as offen from wochenberichte where naechte_vollstaendig is null`)).rows[0].offen, 0)

// Die Sonntagnacht kommt erst am Montagmorgen an — nach dem Einfrieren.
const vorher = await naechte('2026-08-24')
await db.exec(`
  update wochenberichte set naechte_vollstaendig = null where woche = '2026-08-24';
  insert into schlafnaechte_ansicht(user_id,nacht,schlaf_minuten,einschlafzeit,nachtwert)
    values ('00000000-0000-0000-0000-000000000001','2026-08-31',400,'2026-08-30T22:30Z',72),
           ('00000000-0000-0000-0000-000000000002','2026-08-31',430,'2026-08-31T00:10Z',68);
  select private.wochenbericht_nachtrag('2026-08-31T08:00:00+02'::timestamptz);
`)
assert.equal(await naechte('2026-08-24'), vorher + 2)
const fertig = (await db.query(`select naechte_vollstaendig from wochenberichte where woche='2026-08-24'`)).rows[0]
assert.ok(fertig.naechte_vollstaendig, 'beide Sonntagnaechte da -> fertig')

// Zweiter Lauf: nichts wird doppelt angehaengt und nichts ersetzt.
const stand = (await db.query(`select daten from wochenberichte where woche='2026-08-24'`)).rows[0].daten
await db.exec(`update schlafnaechte_ansicht set schlaf_minuten = 1 where nacht = '2026-08-31';
  select private.ergaenze_wochenbericht_naechte('2026-08-24');`)
assert.deepEqual((await db.query(`select daten from wochenberichte where woche='2026-08-24'`)).rows[0].daten, stand)

// Fehlt eine Nacht dauerhaft, endet das Warten um 20:00 Uhr Berliner Zeit.
await db.exec(`
  update wochenberichte set naechte_vollstaendig = null where woche = '2026-08-24';
  delete from schlafnaechte_ansicht where nacht = '2026-08-31'
    and user_id = '00000000-0000-0000-0000-000000000002';
  update wochenberichte set daten = jsonb_set(daten,'{naechte}',
    (select coalesce(jsonb_agg(n),'[]'::jsonb) from jsonb_array_elements(daten->'naechte') n
     where not (n->>'user' = 'koray' and n->>'nacht' = '2026-08-31')))
  where woche = '2026-08-24';
  select private.wochenbericht_nachtrag('2026-08-31T19:00:00+02'::timestamptz);
`)
assert.equal((await db.query(`select naechte_vollstaendig from wochenberichte where woche='2026-08-24'`)).rows[0].naechte_vollstaendig, null)
await db.exec(`select private.wochenbericht_nachtrag('2026-08-31T20:30:00+02'::timestamptz)`)
assert.ok((await db.query(`select naechte_vollstaendig from wochenberichte where woche='2026-08-24'`)).rows[0].naechte_vollstaendig,
  'spaetestens um 20:00 ist Schluss')
// An einem Dienstag passiert gar nichts.
await db.exec(`update wochenberichte set naechte_vollstaendig = null where woche='2026-08-24';
  select private.wochenbericht_nachtrag('2026-09-01T10:00:00+02'::timestamptz);`)
assert.equal((await db.query(`select naechte_vollstaendig from wochenberichte where woche='2026-08-24'`)).rows[0].naechte_vollstaendig, null)

// Die Meldung haengt am Archivzustand, nicht nur an der Uhr.
const meldungen = async (jetzt) => (await db.query(
  `select user_id, tag, url from public.aktivitaets_kandidaten($1) where art = 'wochenbericht' order by user_id`, [jetzt])).rows
assert.equal((await meldungen('2026-08-31T09:00:00+02')).length, 0, 'offener Bericht meldet nichts')
await db.exec(`update wochenberichte set naechte_vollstaendig = now() where woche='2026-08-24'`)
assert.equal((await meldungen('2026-08-31T05:00:00+02')).length, 0, 'nachts nicht')
assert.equal((await meldungen('2026-09-01T09:00:00+02')).length, 0, 'nur am Montag')
const faellig = await meldungen('2026-08-31T09:00:00+02')
assert.equal(faellig.length, 2)
assert.equal(faellig[0].tag.toISOString().slice(0,10), '2026-08-24')
assert.equal(faellig[0].url, './#/bericht?woche=2026-08-24')
await db.exec(`update erinnerungs_einstellungen set wochenbericht_aktiv = false`)
assert.equal((await meldungen('2026-08-31T09:00:00+02')).length, 0, 'abgeschaltet bleibt still')

// Der ENI-Text gehoert je einer Person; der Browser kommt nicht heran.
await db.exec('set role service_role')
assert.equal((await db.query(`select public.reserviere_wochenbericht_text('2026-08-24','erijon') as ok`)).rows[0].ok, true)
assert.equal((await db.query(`select public.reserviere_wochenbericht_text('2026-08-24','erijon') as ok`)).rows[0].ok, false)
assert.equal((await db.query(`select public.reserviere_wochenbericht_text('2026-08-24','koray') as ok`)).rows[0].ok, true)
assert.equal((await db.query(`select public.reserviere_wochenbericht_text('2026-08-24','fremd') as ok`)).rows[0].ok, false)
// Die Probe stellt den Zustand als Eigentuemer her: `service_role` traegt hier
// kein BYPASSRLS wie in Supabase, seine Schreibzugriffe laufen sonst ins Leere.
await db.exec(`reset role; update wochenbericht_texte set texte = '{"ueberschrift":"deins"}'::jsonb where person = 'erijon'; set role service_role;`)
assert.equal((await db.query(`select public.reserviere_wochenbericht_text('2026-08-24','erijon') as ok`)).rows[0].ok, false)
// Auch "neu formulieren" wartet die Abkuehlzeit ab: ein zweiter Klick waehrend
// eines laufenden Versuchs darf keinen zweiten Modellaufruf starten.
assert.equal((await db.query(`select public.reserviere_wochenbericht_text('2026-08-24','erijon',true) as ok`)).rows[0].ok, false)
await db.exec(`reset role; update wochenbericht_texte set versuch = now() - interval '3 minutes' where person = 'erijon'; set role service_role;`)
assert.equal((await db.query(`select public.reserviere_wochenbericht_text('2026-08-24','erijon') as ok`)).rows[0].ok, false)
assert.equal((await db.query(`select public.reserviere_wochenbericht_text('2026-08-24','erijon',true) as ok`)).rows[0].ok, true)
assert.equal((await db.query(`select count(*)::int as n from public.wochenbericht_texte where person = 'koray' and texte is not null`)).rows[0].n, 0,
  'der Text der anderen Person bleibt unberuehrt')
await db.exec('reset role')
for (const rolle of ['authenticated', 'anon']) {
  await db.exec(`set role ${rolle}; set test.uid = '00000000-0000-0000-0000-000000000001';`)
  await assert.rejects(() => db.query('select * from wochenbericht_texte'), `${rolle} liest keine fremden Texte`)
  await assert.rejects(() => db.query(`select public.reserviere_wochenbericht_text('2026-08-24','koray')`))
  await db.exec('reset role')
}

await db.close()
console.log('OK: SQL ausgefuehrt, Momentaufnahme unveraenderlich, beide Mitglieder gleich, Fremdkonto/anon/Schreibzugriffe gesperrt, Nachholen und Datumsgrenzen geprueft.')
console.log('OK: Nacht nur nachgetragen statt ersetzt, 20-Uhr-Schranke, Montagsmeldung am Archivzustand, Texte je Person und fuer Clients gesperrt.')
