// Isolated embedded PostgreSQL. Never connects to Supabase production.
// Usage: node scripts/check-klausuren.mjs <absolute path to @electric-sql/pglite/dist/index.js>
//
// Spielt `*_klausuren.sql` auf die produktive Fassung von
// `aktivitaets_kandidaten` (aus `*_eni_meldungen.sql`): der Klausurplan landet
// je Person beim richtigen Fach, beide Konten lesen ihn, niemand schreibt ihn,
// und die neue Push-Art `klausur` meldet sich 14, 7, 3 und 1 Tag vorher
// abends. Die uebrigen Arten und die Reservierung laufen weiter.
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

const alt = await lies('20260930210000_eni_meldungen.sql')
const altStart = alt.indexOf('create or replace function public.aktivitaets_kandidaten(')
const altEndeMarke = 'grant execute on function public.aktivitaets_kandidaten(timestamptz) to service_role;'
const altFunktion = alt.slice(altStart, alt.indexOf(altEndeMarke, altStart) + altEndeMarke.length)
const migration = await lies('20261005190000_klausuren.sql')
const konkret = await lies('20261005220000_klausur_meldung_konkret.sql')
const erdkunde = await lies('20261006080000_fach_erdkunde.sql')

const query = (sql, params = []) => db.query(sql, params)
const berlin = (zeit) => `${zeit} Europe/Berlin`
let n = 0
const id = () => `cccccccc-0000-4000-8000-${String(++n).padStart(12, '0')}`
const kandidaten = async (zeit, art) => (await query(
  'select user_id, art, tag::text, nachricht, url from public.aktivitaets_kandidaten($1::timestamptz) where art = $2 order by user_id',
  [berlin(zeit), art],
)).rows
const meldung = async (zeit, user) => (await kandidaten(zeit, 'klausur')).find((k) => k.user_id === user)?.nachricht ?? null

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.profile(id uuid primary key, person text unique);
    grant select on public.profile to authenticated;
    create table public.faecher(
      id uuid primary key, user_id uuid not null, name text not null,
      kursart text not null default 'gk', sortierung int not null default 0,
      unique (user_id, name)
    );
    create table public.einheiten(
      id uuid primary key, user_id uuid not null, bereich text not null, tag date not null,
      erstellt timestamptz not null default now()
    );
    create table public.aufenthalte(
      id bigint generated always as identity primary key, user_id uuid not null, bereich text not null,
      ankunft timestamptz not null, abgang timestamptz
    );
    create table public.gewicht(
      user_id uuid not null, tag date not null, kg numeric(5,2) not null,
      erstellt timestamptz not null default now(), primary key (user_id, tag)
    );
    create table public.erinnerungs_einstellungen(
      user_id uuid primary key,
      lernen_aktiv boolean not null default true,
      lesen_aktiv boolean not null default true,
      wochenblick_aktiv boolean not null default true,
      partner_aktiv boolean not null default true,
      wochenrueckblick_aktiv boolean not null default true,
      wochenbericht_aktiv boolean not null default true,
      ansage_aktiv boolean not null default true,
      aufgabe_aktiv boolean not null default true
    );
    create table public.push_abos(user_id uuid not null, endpoint text primary key);
    create table public.aktivitaets_versand(
      user_id uuid not null, art text not null, tag date not null, token uuid not null,
      zustand text not null default 'reserviert',
      primary key (user_id, art, tag),
      constraint aktivitaets_versand_art_check check (art = any (array['lernen','lesen','wochenblick',
        'partner','wochenrueckblick','wochenbericht','ansage','aufgabe']))
    );
    create table public.eni_wochen_einladungen(
      user_id uuid not null, wochenbeginn date not null, faellig_am timestamptz not null,
      geschlossen_am timestamptz
    );
    create table public.wochenberichte(woche date primary key, naechte_vollstaendig timestamptz);
    create table public.duell_ansagen(
      id uuid primary key, von uuid not null, an uuid not null, feld text not null,
      ab date, bis date, ziel smallint, erstellt_am timestamptz not null, ergebnis text,
      entschieden_am timestamptz, version smallint not null, stufe text, einsatz smallint,
      reaktion text, reaktion_am timestamptz, bezug uuid
    );
    create table public.eni_erinnerungen(
      id uuid primary key, user_id uuid not null, text text not null,
      art text not null default 'profil', gemeinsam boolean not null default false, bis date,
      erledigt boolean not null default false, erstellt timestamptz not null default now(),
      geaendert timestamptz not null default now()
    );
  `)
  await db.exec(altFunktion)
  // die reservierung, wie sie produktiv steht
  await db.exec(`
    create function public.reserviere_aktivitaetsversand(
      p_user_id uuid, p_art text, p_tag date, p_token uuid, p_jetzt timestamptz default now()
    ) returns boolean language sql set search_path = '' as $$
      with eingefuegt as (
        insert into public.aktivitaets_versand (user_id, art, tag, token)
        select k.user_id, k.art, k.tag, p_token
        from public.aktivitaets_kandidaten(coalesce(p_jetzt, pg_catalog.now())) k
        where k.user_id = p_user_id and k.art = p_art and k.tag = p_tag
          and p_user_id is not null and p_art is not null and p_tag is not null and p_token is not null
        on conflict (user_id, art, tag) do nothing
        returning 1
      )
      select exists (select 1 from eingefuegt);
    $$;
  `)
  await query('insert into auth.users values ($1), ($2), ($3)', [erijon, koray, fremd])
  await query(`insert into public.profile values ($1, 'erijon'), ($2, 'koray')`, [erijon, koray])
  // die faecher, wie sie produktiv stehen
  const faecher = {
    [erijon]: [['bio', 'lk'], ['englisch', 'lk'], ['geschichte', 'lk'], ['mathe', 'gk'], ['deutsch', 'gk'],
      ['sozialkunde', 'gk'], ['ethik', 'gk'], ['sport', 'gk'], ['informatik', 'gk'], ['bildende kunst', 'gk']],
    [koray]: [['deutsch', 'lk'], ['physik', 'lk'], ['geschichte', 'lk'], ['mathe', 'gk'], ['englisch', 'gk'],
      ['sozialkunde', 'gk'], ['katholische religion', 'gk'], ['französisch', 'gk'], ['sport', 'gk'], ['bildende kunst', 'gk']],
  }
  for (const [user, liste] of Object.entries(faecher)) {
    for (const [i, [name, kursart]] of liste.entries()) {
      await query('insert into public.faecher values ($1, $2, $3, $4, $5)', [id(), user, name, kursart, i])
    }
  }
  await query('insert into public.erinnerungs_einstellungen(user_id) values ($1), ($2)', [erijon, koray])
  await query(`insert into public.push_abos values ($1, 'https://push/e'), ($2, 'https://push/k')`, [erijon, koray])

  await db.exec(migration)
  // zweimal einspielen schadet nicht: kein doppelter termin
  await db.exec(migration.slice(migration.indexOf('insert into public.klausuren'), migration.indexOf('alter table public.erinnerungs_einstellungen')))

  // ------------------------------------------------------ der plan
  const plan = (await query(`
    select p.person, f.name, k.kurs, k.datum::text, left(k.beginn::text, 5) as beginn, left(k.ende::text, 5) as ende
    from public.klausuren k join public.faecher f on f.id = k.fach_id join public.profile p on p.id = k.user_id
    where f.user_id = k.user_id
    order by p.person, k.datum`)).rows
  assert.equal(plan.length, 18, 'neun klausuren je person, sport schreibt keine')
  assert.deepEqual(plan.filter((z) => z.person === 'erijon').map((z) => `${z.datum} ${z.name} ${z.beginn}`), [
    '2026-09-30 deutsch 08:45', '2026-10-27 sozialkunde 09:45', '2026-10-29 ethik 11:35',
    '2026-11-06 englisch 09:00', '2026-11-12 bildende kunst 15:30', '2026-11-18 geschichte 08:00',
    '2026-11-23 mathe 07:55', '2026-12-03 bio 08:00', '2026-12-07 informatik 15:30',
  ])
  assert.deepEqual(plan.filter((z) => z.person === 'koray').map((z) => `${z.datum} ${z.name} ${z.beginn}`), [
    '2026-09-30 deutsch 08:45', '2026-10-27 sozialkunde null', '2026-10-29 katholische religion 11:35',
    '2026-11-12 bildende kunst 15:30', '2026-11-18 geschichte 08:00', '2026-11-23 mathe 07:55',
    '2026-11-27 französisch 11:35', '2026-12-03 physik 08:00', '2026-12-09 englisch 09:45',
  ])

  // ------------------------------------------------------ rechte
  const alsPerson = async (user, sql) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`)
    try { return await query(sql) } finally { await db.exec('reset role;') }
  }
  assert.equal((await alsPerson(erijon, 'select count(*)::int as n from public.klausuren')).rows[0].n, 18, 'beide plaene lesbar')
  assert.equal((await alsPerson(fremd, 'select count(*)::int as n from public.klausuren')).rows[0].n, 0, 'fremde sehen nichts')
  await assert.rejects(
    alsPerson(erijon, `insert into public.klausuren(user_id, fach_id, datum) select '${erijon}', id, '2026-12-01' from public.faecher limit 1`),
    /permission denied/, 'aus der app schreibt niemand',
  )
  await assert.rejects(alsPerson(erijon, 'delete from public.klausuren'), /permission denied/)
  await assert.rejects(
    query(`insert into public.klausuren(user_id, fach_id, datum, beginn) select user_id, id, '2026-12-01', '08:00' from public.faecher limit 1`),
    /klausuren_zeit_check/, 'beginn ohne ende gibt es nicht',
  )

  // ------------------------------------------------------ push-meldungen
  // dienstag 17.11.2026: morgen geschichte lk, beide schreiben sie
  assert.equal(await meldung('2026-11-17 16:59', erijon), null, 'vor 17 uhr nicht')
  assert.equal(await meldung('2026-11-17 19:00', erijon), null, 'ab 19 uhr nicht mehr')
  assert.deepEqual(await kandidaten('2026-11-17 17:30', 'klausur'), [
    { user_id: erijon, art: 'klausur', tag: '2026-11-17', nachricht: 'morgen klausur: geschichte lk, 08:00–12:00. koray schreibt sie auch.', url: './#/abi' },
    { user_id: koray, art: 'klausur', tag: '2026-11-17', nachricht: 'morgen klausur: geschichte lk, 08:00–12:00. erijon schreibt sie auch.', url: './#/abi' },
  ])
  // mittwoch 11.11.: morgen bildende kunst, und geschichte ist in 7 tagen
  assert.equal(
    await meldung('2026-11-11 18:00', erijon),
    'morgen klausur: bildende kunst, 15:30–17:00. koray schreibt sie auch. dazu 1 weitere bald.',
  )
  // samstag 24.10.: sozialkunde in 3 tagen; bei koray steht die uhrzeit noch nicht fest
  assert.equal(await meldung('2026-10-24 17:10', erijon), 'in 3 tagen klausur: sozialkunde am 27.10., 09:45–11:20. koray schreibt sie auch.')
  assert.equal(await meldung('2026-10-24 17:10', koray), 'in 3 tagen klausur: sozialkunde am 27.10. erijon schreibt sie auch.')
  // freitag 30.10.: englisch lk in 7 tagen, nur erijon
  assert.equal(await meldung('2026-10-30 17:10', erijon), 'in 7 tagen klausur: englisch lk am 06.11., 09:00–13:30.')
  assert.equal(await meldung('2026-10-30 17:10', koray), null, 'koray schreibt dann nichts')
  // dienstag 08.12.: koray englisch morgen, erijon hat nichts mehr
  assert.equal(await meldung('2026-12-08 17:10', koray), 'morgen klausur: englisch, 09:45–11:20.')
  assert.equal(await meldung('2026-12-08 17:10', erijon), null)
  // ein tag ohne erinnerungsabstand: nichts (bio in 2 tagen)
  assert.equal(await meldung('2026-12-01 17:10', erijon), null)

  // ausgeschaltet und ohne push-abo: nichts
  await query('update public.erinnerungs_einstellungen set klausur_aktiv = false where user_id = $1', [erijon])
  assert.equal(await meldung('2026-11-17 17:30', erijon), null)
  await query('update public.erinnerungs_einstellungen set klausur_aktiv = true where user_id = $1', [erijon])
  await query('delete from public.push_abos where user_id = $1', [koray])
  assert.equal(await meldung('2026-11-17 17:30', koray), null)

  // die reservierung nimmt die neue art an, genau einmal
  const reserviere = async () => (await query(
    "select public.reserviere_aktivitaetsversand($1, 'klausur', '2026-11-17', $2, '2026-11-17 17:30 Europe/Berlin'::timestamptz) as ok",
    [erijon, id()],
  )).rows[0].ok
  assert.equal(await reserviere(), true)
  assert.equal(await reserviere(), false, 'am selben tag kein zweites mal')

  // ------------------------------------------------------ meldung konkret
  // der nachtrag nennt die naechste klausur danach beim namen
  await db.exec(konkret)
  await query("insert into public.push_abos values ($1, 'https://push/k3')", [koray])
  assert.deepEqual(await kandidaten('2026-11-17 17:30', 'klausur'), [
    { user_id: erijon, art: 'klausur', tag: '2026-11-17', nachricht: 'morgen klausur: geschichte lk, 08:00–12:00. koray schreibt sie auch. danach: mathe in 6 tagen.', url: './#/abi' },
    { user_id: koray, art: 'klausur', tag: '2026-11-17', nachricht: 'morgen klausur: geschichte lk, 08:00–12:00. erijon schreibt sie auch. danach: mathe in 6 tagen.', url: './#/abi' },
  ])
  assert.equal(
    await meldung('2026-11-11 18:00', erijon),
    'morgen klausur: bildende kunst, 15:30–17:00. koray schreibt sie auch. danach: geschichte lk in 7 tagen.',
  )
  assert.equal(await meldung('2026-10-13 17:10', erijon), 'in zwei wochen klausur: sozialkunde am 27.10., 09:45–11:20. koray schreibt sie auch. danach: ethik in 16 tagen.')
  assert.equal(await meldung('2026-10-24 17:10', koray), 'in 3 tagen klausur: sozialkunde am 27.10. erijon schreibt sie auch. danach: katholische religion in 5 tagen.')
  assert.equal(await meldung('2026-10-30 17:10', erijon), 'in einer woche klausur: englisch lk am 06.11., 09:00–13:30. danach: bildende kunst in 13 tagen.')
  // die letzte klausur hat kein danach
  assert.equal(await meldung('2026-12-08 17:10', koray), 'morgen klausur: englisch, 09:45–11:20.')
  assert.equal(await meldung('2026-12-01 17:10', erijon), null)
  await query('update public.erinnerungs_einstellungen set klausur_aktiv = false where user_id = $1', [erijon])
  assert.equal(await meldung('2026-11-17 17:30', erijon), null)
  await query('update public.erinnerungs_einstellungen set klausur_aktiv = true where user_id = $1', [erijon])

  // ------------------------------------------------------ fach erdkunde
  // dieses halbjahr heisst das fach erdkunde; korays klausur liegt in der 3.–4. stunde
  const notenVorher = (await query("select id, name from public.faecher where name = 'sozialkunde' order by id")).rows
  assert.equal(notenVorher.length, 2)
  await db.exec(erdkunde)
  await db.exec(erdkunde) // zweimal einspielen aendert nichts mehr
  assert.deepEqual(
    (await query("select id, name from public.faecher where id = any($1::uuid[]) order by id", [notenVorher.map((z) => z.id)])).rows,
    notenVorher.map((z) => ({ id: z.id, name: 'erdkunde' })),
    'dieselben faecher, nur der name ist neu',
  )
  assert.equal((await query("select count(*)::int as n from public.faecher where name = 'sozialkunde'")).rows[0].n, 0)
  assert.equal(
    await meldung('2026-10-24 17:10', koray),
    'in 3 tagen klausur: erdkunde am 27.10., 09:45–11:20. erijon schreibt sie auch. danach: katholische religion in 5 tagen.',
  )
  assert.equal(
    await meldung('2026-10-13 17:10', erijon),
    'in zwei wochen klausur: erdkunde am 27.10., 09:45–11:20. koray schreibt sie auch. danach: ethik in 16 tagen.',
  )
  // nur korays zeile hat sich geaendert, erijons kurs bleibt
  assert.deepEqual(
    (await query(`select p.person, k.kurs, left(k.beginn::text, 5) as beginn, left(k.ende::text, 5) as ende, k.bemerkung
      from public.klausuren k join public.faecher f on f.id = k.fach_id join public.profile p on p.id = k.user_id
      where f.name = 'erdkunde' order by p.person`)).rows,
    [
      { person: 'erijon', kurs: 'skek1', beginn: '09:45', ende: '11:20', bemerkung: '' },
      { person: 'koray', kurs: null, beginn: '09:45', ende: '11:20', bemerkung: '' },
    ],
  )
  assert.equal((await query('select count(*)::int as n from public.klausuren')).rows[0].n, 18)

  // ------------------------------------------------------ die uebrigen arten
  // dienstag 17.11. 18:40, erijon hat nichts gelernt
  assert.equal(
    (await kandidaten('2026-11-17 18:40', 'lernen')).find((k) => k.user_id === erijon)?.nachricht,
    'heute noch kein lerneintrag. zeit für eine kleine einheit?',
  )
  await query(
    `insert into public.eni_erinnerungen(id, user_id, text, art, bis) values ($1, $2, 'Karteikarten', 'aufgabe', '2026-11-17')`,
    [id(), erijon],
  )
  assert.equal((await kandidaten('2026-11-17 08:40', 'aufgabe'))[0]?.nachricht, 'heute fällig: Karteikarten')

  const rechte = (await query(
    "select has_function_privilege('authenticated', 'public.aktivitaets_kandidaten(timestamptz)', 'execute') as a, has_function_privilege('service_role', 'public.aktivitaets_kandidaten(timestamptz)', 'execute') as s",
  )).rows[0]
  assert.deepEqual(rechte, { a: false, s: true })

  console.log('klausuren: plan, rechte, push-art klausur und uebrige arten geprueft')
} finally {
  await db.close()
}
