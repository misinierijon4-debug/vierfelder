// Isolated embedded PostgreSQL. Never connects to Supabase production.
// Usage: node scripts/check-duell-ansagen.mjs <absolute path to @electric-sql/pglite/dist/index.js>
//
// Spielt die Migration `*_duell_ansagen.sql` durch: Rechte, Ziel aus der
// Vorgeschichte, Kontingent, Einfrieren mit Nachlauf, die Gewichtsregel,
// die Wochenabrechnung Version 2, den Wochenschluss um Mitternacht und die
// neue Push-Art. Alle Zeitpunkte sind fest vorgegeben; nur der Aufruf ueber
// `public.sage_an` nimmt die echte Uhr.
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

const lies = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
const vorher = [
  await lies('20260902210000_wochenabrechnung.sql'),
  await lies('20260905120728_duell_wochenabschluss_serverautoritaer.sql'),
]
const migration = await lies('20260922120000_duell_ansagen.sql')
const wochenschluss = await lies('20260923090000_wochenschluss_mitternacht.sql')

const query = (sql, params = []) => db.query(sql, params)
const alsSuperuser = () => db.exec('reset role;')
const alsRolle = async (id, role = 'authenticated') => {
  await db.exec(`reset role; set role ${role};`)
  await query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ''])
}
const tagText = (wert) => wert instanceof Date ? wert.toISOString().slice(0, 10) : String(wert)
let n = 0
const id = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, '0')}`

/** eine abgeschlossene sitzung, lokal in Berlin */
const sitzung = (user, bereich, tag, beginn = '18:00', minuten = 30) => query(
  `insert into public.aufenthalte(user_id, bereich, ort, ankunft, abgang)
   values ($1, $2, 'test', ($3 || ' ' || $4 || ' Europe/Berlin')::timestamptz,
     ($3 || ' ' || $4 || ' Europe/Berlin')::timestamptz + make_interval(mins => $5))`,
  [user, bereich, tag, beginn, minuten],
)
const offeneSitzung = (user, bereich, tag, beginn) => query(
  `insert into public.aufenthalte(user_id, bereich, ort, ankunft, abgang)
   values ($1, $2, 'test', ($3 || ' ' || $4 || ' Europe/Berlin')::timestamptz, null)`,
  [user, bereich, tag, beginn],
)
/** ein gewicht mit frei gewaehltem eintragezeitpunkt — nur am trigger vorbei moeglich */
const gewogen = async (user, tag, erstellt) => {
  await query('alter table public.gewicht disable trigger gewicht_erstellt_fest')
  await query(
    `insert into public.gewicht(user_id, tag, kg, erstellt) values ($1, $2, 80, ($3 || ' Europe/Berlin')::timestamptz)`,
    [user, tag, erstellt],
  )
  await query('alter table public.gewicht enable trigger gewicht_erstellt_fest')
}
const sageAnUm = async (von, feld, jetzt, ansageId = id()) =>
  (await query('select private.sage_an_um($1, $2, $3, ($4 || \' Europe/Berlin\')::timestamptz) as z', [von, ansageId, feld, jetzt])).rows[0].z
const fehlerVon = async (versprechen) => {
  try {
    await versprechen
  } catch (fehler) {
    return fehler.message
  }
  return null
}
const entscheide = async (jetzt) =>
  (await query("select private.entscheide_duell_ansagen(($1 || ' Europe/Berlin')::timestamptz) as n", [jetzt])).rows[0].n
const ergebnis = async (ansageId) =>
  (await query('select ergebnis from public.duell_ansagen where id = $1', [ansageId])).rows[0].ergebnis

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create schema auth;
    create schema private;
    grant usage on schema private to authenticated;
    create schema cron;
    create table cron.job(jobname text primary key, schedule text, command text);
    create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint
      language sql as $$
        insert into cron.job values (p_name, p_schedule, p_command)
        on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
        select 1::bigint
      $$;
    create publication supabase_realtime;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
    create table public.profile(id uuid primary key references auth.users(id), person text unique);
    create function private.ist_duellprofil() returns boolean language sql stable security definer
      set search_path = '' as $$
        select exists (select 1 from public.profile p where p.id = (select auth.uid()))
      $$;
    grant execute on function private.ist_duellprofil() to authenticated;
    create table public.einheiten(
      id uuid primary key,
      user_id uuid not null references auth.users(id),
      bereich text not null,
      tag date not null,
      erstellt timestamptz not null default now()
    );
    create table public.aufenthalte(
      id bigint generated always as identity primary key,
      user_id uuid not null references auth.users(id),
      bereich text not null,
      ort text not null,
      ankunft timestamptz not null,
      abgang timestamptz
    );
    create table public.gewicht(
      user_id uuid not null references auth.users(id) default auth.uid(),
      tag date not null,
      kg numeric(5,2) not null,
      erstellt timestamptz not null default now(),
      primary key (user_id, tag)
    );
    alter table public.gewicht enable row level security;
    create policy "gewicht" on public.gewicht for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
    create table public.duell_wetten(woche date primary key, text text);
    create table public.erinnerungs_einstellungen(
      user_id uuid primary key references auth.users(id),
      lernen_aktiv boolean not null default false,
      lesen_aktiv boolean not null default false,
      wochenblick_aktiv boolean not null default false,
      partner_aktiv boolean not null default false,
      wochenrueckblick_aktiv boolean not null default false,
      wochenbericht_aktiv boolean not null default false
    );
    create table public.push_abos(user_id uuid not null, endpoint text primary key);
    create table public.aktivitaets_versand(
      user_id uuid not null,
      art text not null constraint aktivitaets_versand_art_check
        check (art in ('lernen','lesen','wochenblick','partner','wochenrueckblick','wochenbericht')),
      tag date not null,
      primary key (user_id, art, tag)
    );
    create table public.eni_wochen_einladungen(
      user_id uuid not null, wochenbeginn date not null,
      faellig_am timestamptz not null, geschlossen_am timestamptz
    );
    create table public.wochenberichte(woche date primary key, naechte_vollstaendig timestamptz);
    grant usage on schema public to authenticated, anon, service_role;
    grant select, insert, update, delete on public.gewicht to authenticated;
    insert into auth.users values ('${erijon}'), ('${koray}'), ('${fremd}');
    insert into public.profile values ('${erijon}', 'erijon'), ('${koray}', 'koray');
    insert into public.erinnerungs_einstellungen(user_id) values ('${erijon}'), ('${koray}');
    insert into public.push_abos values ('${erijon}', 'https://e'), ('${koray}', 'https://k');
  `)
  for (const sql of vorher) await db.exec(sql)

  // Ein Archiv der Version 1 steht schon da und muss die neue Invariante ueberleben.
  await query(`insert into public.wochenabrechnung
    (woche, sieger, grund, differenz, beleg_erijon, beleg_koray, berechnung_version, archiv_quelle, punkte_erijon, punkte_koray)
    values ('2020-06-29', 'erijon', 'punkte', 3, 1, 0, 1, 'server_nachgeholt', 10, 7)`)

  await db.exec(migration)
  // zweimal einspielen darf nichts kaputt machen
  await db.exec(migration)
  assert.equal((await query("select count(*)::int as n from cron.job where jobname = 'duell-ansagen-entscheiden'")).rows[0].n, 1)

  // ---------------------------------------------------------- Rechte
  await alsRolle(erijon)
  assert.match(
    await fehlerVon(query(`insert into public.duell_ansagen(id, von, an, feld, ab, bis, ziel)
      values ($1, $2, $3, 'gym', '2020-07-07', '2020-07-11', 1)`, [id(), erijon, koray])),
    /permission denied/,
  )
  assert.match(await fehlerVon(query("update public.duell_ansagen set ergebnis = 'verfehlt'")), /permission denied/)
  assert.match(await fehlerVon(query('select private.sage_an_um($1, $2, \'gym\', now())', [erijon, id()])), /permission denied/)
  assert.match(await fehlerVon(query('select private.entscheide_duell_ansagen()')), /permission denied/)
  await alsRolle(null, 'anon')
  assert.match(await fehlerVon(query("select public.sage_an($1, 'gym')", [id()])), /permission denied/)
  await alsRolle(fremd)
  assert.match(await fehlerVon(query("select public.sage_an($1, 'gym')", [id()])), /nur ein zweikampf-profil/)

  // ----------------------------------------------------- gewicht.erstellt
  await alsRolle(erijon)
  await query("insert into public.gewicht(tag, kg, erstellt) values ('2020-01-01', 80, '2020-01-01 08:00+00')")
  const erst = (await query("select erstellt from public.gewicht where tag = '2020-01-01'")).rows[0].erstellt
  assert.notEqual(erst.toISOString(), '2020-01-01T08:00:00.000Z', 'der browser setzt erstellt nicht selbst')
  await query("update public.gewicht set kg = 81, erstellt = '2020-01-01 08:00+00' where tag = '2020-01-01'")
  assert.equal(
    (await query("select erstellt from public.gewicht where tag = '2020-01-01'")).rows[0].erstellt.toISOString(),
    erst.toISOString(),
    'ein update behaelt den ersten zeitpunkt',
  )
  await query("delete from public.gewicht where tag = '2020-01-01'")
  await alsSuperuser()

  // ------------------------------------------------- Ziel und Anlegen
  // Woche Mo 06.07.–So 12.07.2020, Ansagen bis Sa 11.07. Vorgeschichte ab Mo 08.06.
  // koray boxt in den vier Wochen davor 1, 0, 1 und 1 mal.
  for (const tag of ['2020-06-09', '2020-06-24', '2020-07-01']) await sitzung(koray, 'boxen', tag)
  // eine zu kurze sitzung zaehlt nicht
  await sitzung(koray, 'boxen', '2020-06-16', '18:00', 19)
  // erijon wiegt sich vier wochen lang jeden tag
  for (let i = 0; i < 28; i++) {
    const tag = (await query("select ('2020-06-08'::date + $1::int)::text as t", [i])).rows[0].t
    await gewogen(erijon, tag, `${tag} 07:00`)
  }

  const boxen = await sageAnUm(erijon, 'boxen', '2020-07-06 12:00')
  assert.equal(boxen.von, erijon)
  assert.equal(boxen.an, koray)
  assert.equal(boxen.ab, '2020-07-07')
  assert.equal(boxen.bis, '2020-07-11')
  assert.equal(boxen.ziel, 2, 'median 1 plus eins, auf fuenf tage aufgerundet')
  assert.equal(boxen.ergebnis, null)

  // wiederholt der browser, kommt dieselbe zeile zurueck
  assert.deepEqual(await sageAnUm(erijon, 'boxen', '2020-07-06 12:05', boxen.id), boxen)
  assert.match(await fehlerVon(sageAnUm(erijon, 'gym', '2020-07-06 12:05', boxen.id)), /schon vergeben/)
  assert.match(await fehlerVon(sageAnUm(erijon, 'boxen', '2020-07-07 09:00')), /ansage:schonAngesagt/)
  assert.match(await fehlerVon(sageAnUm(erijon, 'lernen', '2020-07-07 09:00')), /ansagefeld/)

  const gym = await sageAnUm(erijon, 'gym', '2020-07-07 09:00')
  assert.equal(gym.ab, '2020-07-08')
  assert.equal(gym.ziel, 1, 'ohne vorgeschichte ist das ziel ein tag')
  assert.match(await fehlerVon(sageAnUm(erijon, 'lesen', '2020-07-07 10:00')), /ansage:keineAnsagenMehr/)

  // wer sich jeden tag wiegt, kann darin nicht herausgefordert werden
  assert.match(await fehlerVon(sageAnUm(koray, 'gewicht', '2020-07-06 12:00')), /ansage:keinZiel/)
  // ab freitag gibt es keine ansage mehr, donnerstag noch zwei tage
  assert.match(await fehlerVon(sageAnUm(koray, 'lesen', '2020-07-10 00:01')), /ansage:zuSpaet/)
  const lesen = await sageAnUm(koray, 'lesen', '2020-07-09 23:59')
  assert.equal(lesen.ab, '2020-07-10')
  assert.equal(lesen.ziel, 1)
  assert.equal(lesen.an, erijon)

  // ueber die oeffentliche rpc mit der echten uhr: angelegt oder ein bekannter grund
  await alsRolle(koray)
  const echt = await fehlerVon(query("select public.sage_an($1, 'boxen')", [id()]))
  assert.ok(echt === null || /^ansage:/.test(echt), `unerwarteter fehler: ${echt}`)
  assert.equal((await query('select count(*)::int as n from public.duell_ansagen')).rows[0].n, echt === null ? 4 : 3)
  await alsRolle(fremd)
  assert.equal((await query('select count(*)::int as n from public.duell_ansagen')).rows[0].n, 0, 'fremde sehen nichts')
  await alsSuperuser()
  await query("delete from public.duell_ansagen where erstellt_am > '2021-01-01'")

  // -------------------------------------------------------- Einfrieren
  // koray boxt di und mi — geschafft, sobald es feststeht
  await sitzung(koray, 'boxen', '2020-07-07')
  assert.equal(await entscheide('2020-07-07 20:00'), 0)
  assert.equal(await ergebnis(boxen.id), null)
  await sitzung(koray, 'boxen', '2020-07-08')
  assert.equal(await entscheide('2020-07-08 20:00'), 1)
  assert.equal(await ergebnis(boxen.id), 'geschafft')
  // nachgetragene daten kippen nichts mehr
  await query("delete from public.aufenthalte where user_id = $1 and ankunft > '2020-07-08 00:00 Europe/Berlin'", [koray])
  assert.equal(await entscheide('2020-07-09 20:00'), 0)
  assert.equal(await ergebnis(boxen.id), 'geschafft')

  // koray geht nie ins gym: verfehlt erst nach samstag, eine laufende sitzung
  // vom samstagabend bekommt bis 03:00 zeit
  assert.equal(await entscheide('2020-07-11 23:00'), 0)
  await offeneSitzung(koray, 'gym', '2020-07-11', '23:45')
  // erijon liest nie — ohne laufende sitzung ist diese ansage nach mitternacht verfehlt,
  // die gym-ansage wartet auf die sitzung
  assert.equal(await entscheide('2020-07-12 00:05'), 1)
  assert.equal(await ergebnis(lesen.id), 'verfehlt')
  assert.equal(await ergebnis(gym.id), null)
  assert.equal(await entscheide('2020-07-12 03:01'), 1)
  assert.equal(await ergebnis(gym.id), 'verfehlt')

  // -------------------------------------------------- Gewichtsregel
  // eine eigene woche: koray wiegt sich selten; nur am selben tag zaehlt
  await gewogen(koray, '2020-07-14', '2020-07-14 07:00')
  await gewogen(koray, '2020-07-15', '2020-07-16 09:00')
  const tage = async (selberTag) => (await query(
    "select array_agg(t::text order by t) as t from private.ansage_tage($1, 'gewicht', '2020-07-13', '2020-07-18', $2) t",
    [koray, selberTag],
  )).rows[0].t
  assert.deepEqual(await tage(true), ['2020-07-14'])
  assert.deepEqual(await tage(false), ['2020-07-14', '2020-07-15'])

  // ------------------------------------------- Wochenabrechnung Version 2
  // woche 06.07.: erijon hat 28 gewichte davor und keins in der woche.
  // punkte: koray boxt di (mi wurde geloescht) → 1; erijon 0.
  // ansagen: erijon boxen geschafft −1, erijon gym verfehlt +1, koray lesen verfehlt +1.
  await alsRolle(erijon)
  const archiv = (await query("select public.finalisiere_wochenabrechnung('2020-07-06') as a")).rows[0].a
  assert.equal(archiv.berechnung_version, 2)
  assert.equal(archiv.ansage_erijon, 0)
  assert.equal(archiv.ansage_koray, 1)
  assert.equal(archiv.punkte_erijon, 0)
  assert.equal(archiv.punkte_koray, 2)
  assert.equal(archiv.differenz, -2)
  assert.equal(archiv.sieger, 'koray')
  assert.equal(archiv.archiv_quelle, 'server_nachgeholt')
  // zweiter aufruf: dieselbe zeile
  assert.deepEqual((await query("select public.finalisiere_wochenabrechnung('2020-07-06') as a")).rows[0].a, archiv)
  await alsSuperuser()

  // die invariante haelt version 2 dicht
  assert.match(
    await fehlerVon(query(`insert into public.wochenabrechnung
      (woche, sieger, grund, differenz, beleg_erijon, beleg_koray, berechnung_version, archiv_quelle,
       punkte_erijon, punkte_koray, ansage_erijon, ansage_koray)
      values ('2020-06-22', 'erijon', 'punkte', 1, 0, 0, 2, 'server_nachgeholt', 1, 0, null, 0)`)),
    /wochenabrechnung_server_invariante/,
  )
  // eine noch offene ansage zaehlt als gehaltener einsatz (−1)
  await query(`insert into public.duell_ansagen(id, von, an, feld, ab, bis, ziel, erstellt_am)
    values ($1, $2, $3, 'boxen', '2020-06-16', '2020-06-20', 1, '2020-06-15 12:00 Europe/Berlin')`, [id(), koray, erijon])
  await query(`insert into public.aufenthalte(user_id, bereich, ort, ankunft, abgang)
    values ($1, 'boxen', 'test', '2020-06-20 23:30 Europe/Berlin', null)`, [erijon])
  await alsRolle(koray)
  const mitOffener = (await query("select public.finalisiere_wochenabrechnung('2020-06-15') as a")).rows[0].a
  await alsSuperuser()
  // die abrechnung entscheidet vorher selbst: erijon hat nicht geboxt → verfehlt → koray +1
  assert.equal(mitOffener.ansage_koray, 1)
  assert.equal(mitOffener.ansage_erijon, 0)

  // --------------------------------------------------------------- Push
  const kandidaten = async (jetzt) => (await query(
    "select * from public.aktivitaets_kandidaten(($1 || ' Europe/Berlin')::timestamptz) where art = 'ansage'",
    [jetzt],
  )).rows
  await query('update public.erinnerungs_einstellungen set ansage_aktiv = true')
  // koray bekam montag 12:00 die boxen-ansage
  let k = await kandidaten('2020-07-06 12:10')
  assert.equal(k.length, 1)
  assert.equal(k[0].user_id, koray)
  assert.equal(tagText(k[0].tag), '2020-07-06')
  assert.equal(k[0].nachricht, 'erijon sagt an: 2× boxen bis samstag. zeig, dass es geht.')
  assert.equal(k[0].url, './')
  // nicht vor der ansage, nicht nachts, nicht wenn ausgeschaltet
  assert.equal((await kandidaten('2020-07-06 11:59')).length, 0)
  assert.equal((await kandidaten('2020-07-09 23:59')).length, 0, 'nach 22 uhr schweigt sie')
  await query('update public.erinnerungs_einstellungen set ansage_aktiv = false where user_id = $1', [koray])
  assert.equal((await kandidaten('2020-07-06 12:10')).length, 0)
  await query('update public.erinnerungs_einstellungen set ansage_aktiv = true')
  // die gym-ansage kam dienstag; mittwoch ist nichts neu
  k = await kandidaten('2020-07-07 12:10')
  assert.equal(k[0].nachricht, 'erijon sagt an: 1× gym bis samstag. zeig, dass es geht.')
  assert.equal((await kandidaten('2020-07-08 12:10')).length, 0)
  // die versandtabelle nimmt die neue art an
  await query("insert into public.aktivitaets_versand(user_id, art, tag) values ($1, 'ansage', '2020-07-06')", [koray])

  // ------------------------------------------ Wochenschluss um Mitternacht
  await db.exec(wochenschluss)
  await db.exec(wochenschluss)
  // woche 25.05.2020: beide boxen sonntag. erijon ist 23:50 fertig, koray erst
  // montag 00:20 — beim wochenschluss noch offen, also kein punkt, kein beleg.
  await sitzung(erijon, 'boxen', '2020-05-31', '23:00', 50)
  await sitzung(koray, 'boxen', '2020-05-31', '23:45', 35)
  // 23:59 fertig zaehlt noch, genau 0 uhr nicht mehr
  await sitzung(koray, 'gym', '2020-05-31', '23:29', 30)
  await sitzung(koray, 'lernen', '2020-05-31', '23:30', 30)
  // unter der woche gehoert 23:40 bis 00:30 weiter zum vortag
  await sitzung(erijon, 'lernen', '2020-05-27', '23:40', 50)
  await alsRolle(erijon)
  const schluss = (await query("select public.finalisiere_wochenabrechnung('2020-05-25') as a")).rows[0].a
  await alsSuperuser()
  assert.equal(schluss.punkte_erijon, 2)
  assert.equal(schluss.punkte_koray, 1)
  assert.equal(schluss.beleg_erijon, 2)
  assert.equal(schluss.beleg_koray, 1)

  console.log('duell_ansagen: rechte, ziel, kontingent, einfrieren, gewicht, abrechnung v2, wochenschluss und push geprueft')
} finally {
  await db.close()
}
