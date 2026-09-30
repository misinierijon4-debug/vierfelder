// Isolated embedded PostgreSQL. Never connects to Supabase production.
// Usage: node scripts/check-eni-meldungen.mjs <absolute path to @electric-sql/pglite/dist/index.js>
//
// Spielt `*_eni_meldungen.sql` auf die produktive Fassung von
// `aktivitaets_kandidaten` (aus `*_ansagen_stufen.sql`): die Sonntagsmeldung
// mit Rueckstand, Gleichstand, Fuehrung, offenen Feldern und Ansagepunkten,
// die neue Art `aufgabe` mit ihren Grenzen, und dass die uebrigen Arten und
// die Reservierung weiter laufen. Alle Zeitpunkte sind fest.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(
  process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite',
)
const db = new PGlite()
const erijon = '11111111-1111-4111-8111-111111111111'
const koray = '22222222-2222-4222-8222-222222222222'
const lies = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')

/** die produktive fassung der funktion, genau wie sie in der alten migration steht */
const alt = await lies('20260924120000_ansagen_stufen.sql')
const altStart = alt.indexOf('create or replace function public.aktivitaets_kandidaten(')
const altEndeMarke = 'grant execute on function public.aktivitaets_kandidaten(timestamptz) to service_role;'
const altFunktion = alt.slice(altStart, alt.indexOf(altEndeMarke, altStart) + altEndeMarke.length)
const migration = await lies('20260930210000_eni_meldungen.sql')

const query = (sql, params = []) => db.query(sql, params)
const berlin = (zeit) => `${zeit} Europe/Berlin`
let n = 0
const id = () => `cccccccc-0000-4000-8000-${String(++n).padStart(12, '0')}`
const kandidaten = async (zeit, art) => (await query(
  'select user_id, art, tag::text, nachricht, url from public.aktivitaets_kandidaten($1::timestamptz) where art = $2 order by user_id',
  [berlin(zeit), art],
)).rows
const meldung = async (zeit, art, user) => (await kandidaten(zeit, art)).find((k) => k.user_id === user)?.nachricht ?? null
const eintrag = (user, bereich, tag) => query(
  "insert into public.einheiten(id, user_id, bereich, tag, erstellt) values ($1, $2, $3, $4::date, ($4::text || ' 09:00 Europe/Berlin')::timestamptz)",
  [id(), user, bereich, tag],
)
const aufgabe = (user, text, bis, erstellt, art = 'aufgabe', erledigt = false) => query(
  `insert into public.eni_erinnerungen(id, user_id, text, art, bis, erledigt, erstellt)
   values ($1, $2, $3, $4, $5, $6, $7::timestamptz)`,
  [id(), user, text, art, bis, erledigt, berlin(erstellt)],
)
const ansage = (von, an, ergebnis, einsatz, reaktion = null) => query(
  `insert into public.duell_ansagen(id, von, an, feld, ab, bis, ziel, erstellt_am, ergebnis, version, stufe, einsatz, reaktion)
   values ($1, $2, $3, 'lernen', '2026-09-28', '2026-10-04', 3, '2026-09-28 10:00 Europe/Berlin', $4, 2, 'mutig', $5, $6)`,
  [id(), von, an, ergebnis, einsatz, reaktion],
)

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role bypassrls;
    create table public.profile(id uuid primary key, person text unique);
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
      ansage_aktiv boolean not null default true
    );
    create table public.push_abos(user_id uuid not null, endpoint text primary key);
    create table public.aktivitaets_versand(
      user_id uuid not null, art text not null, tag date not null, token uuid not null,
      zustand text not null default 'reserviert',
      primary key (user_id, art, tag),
      constraint aktivitaets_versand_art_check check (art = any (array['lernen','lesen','wochenblick',
        'partner','wochenrueckblick','wochenbericht','ansage']))
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
  // die reservierung, wie sie produktiv steht (prosrc aus der datenbank gelesen)
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
  await query(`insert into public.profile values ($1, 'erijon'), ($2, 'koray')`, [erijon, koray])
  await query('insert into public.erinnerungs_einstellungen(user_id) values ($1), ($2)', [erijon, koray])
  await query(`insert into public.push_abos values ($1, 'https://push/e'), ($2, 'https://push/k')`, [erijon, koray])

  // vor der migration: der alte text, als beleg, dass die basis stimmt
  await eintrag(erijon, 'lernen', '2026-09-28')
  await eintrag(koray, 'lernen', '2026-09-28')
  assert.equal(await meldung('2026-10-04 18:05', 'wochenblick', erijon), 'sonntagsstand: du 1, koray 1. die woche läuft noch.')

  await db.exec(migration)

  // ------------------------------------------------------ Sonntagsmeldung
  // woche mo 28.09. bis so 04.10.2026. erijon: lernen mo, gym di, lernen so.
  // koray: lernen mo, lesen mo, boxen di, lesen mi.
  await eintrag(erijon, 'gym', '2026-09-29')
  await eintrag(erijon, 'lernen', '2026-10-04')
  await eintrag(koray, 'lesen', '2026-09-28')
  await eintrag(koray, 'boxen', '2026-09-29')
  await eintrag(koray, 'lesen', '2026-09-30')

  assert.equal(await meldung('2026-10-04 18:05', 'wochenblick', erijon), null, 'vor 18:10 noch nicht')
  assert.equal(await meldung('2026-10-04 19:00', 'wochenblick', erijon), null, 'ab 19 uhr nicht mehr')
  assert.equal(
    await meldung('2026-10-04 18:20', 'wochenblick', erijon),
    'sonntagsstand: du 3, koray 4. dir fehlt 1 punkt. heute noch offen: gym, boxen, lesen, gewicht.',
  )
  assert.equal(
    await meldung('2026-10-04 18:20', 'wochenblick', koray),
    'sonntagsstand: du 4, erijon 3. du führst mit 1 punkt. heute noch offen: lernen, gym, boxen, lesen, gewicht.',
  )
  // gleichstand
  await query("insert into public.gewicht(user_id, tag, kg, erstellt) values ($1, '2026-10-04', 80, '2026-10-04 08:00 Europe/Berlin')", [erijon])
  assert.equal(
    await meldung('2026-10-04 18:20', 'wochenblick', erijon),
    'sonntagsstand: du 4, koray 4. gleichstand, ein punkt heute entscheidet. offen: gym, boxen, lesen.',
  )
  // entschiedene ansagen zaehlen mit: koray sagt erijon an, erijon schafft es (2),
  // erijon sagt koray an und koray verfehlt, gekontert (2 × 2 = 4 fuer erijon)
  await ansage(koray, erijon, 'geschafft', 2)
  await ansage(erijon, koray, 'verfehlt', 2, 'kontern')
  assert.equal(
    await meldung('2026-10-04 18:20', 'wochenblick', erijon),
    'sonntagsstand: du 10, koray 4. du führst mit 6 punkten. heute noch offen: gym, boxen, lesen.',
  )
  // eine noch offene ansage wird genannt, nicht mitgerechnet
  await ansage(koray, erijon, null, 3)
  assert.equal(
    await meldung('2026-10-04 18:20', 'wochenblick', koray),
    'sonntagsstand: du 4, erijon 10. dir fehlen 6 punkte. heute noch offen: lernen, gym, boxen, lesen, gewicht. ansagen werden noch abgerechnet.',
  )
  // alles eingetragen
  for (const bereich of ['gym', 'boxen', 'lesen']) await eintrag(erijon, bereich, '2026-10-04')
  assert.match(await meldung('2026-10-04 18:20', 'wochenblick', erijon), /\. heute ist bei dir alles eingetragen\. ansagen werden/)
  // ausgeschaltet
  await query('update public.erinnerungs_einstellungen set wochenblick_aktiv = false where user_id = $1', [erijon])
  assert.equal(await meldung('2026-10-04 18:20', 'wochenblick', erijon), null)

  // ------------------------------------------------------ faellige Aufgaben
  // donnerstag 01.10.2026
  await aufgabe(erijon, 'Boxhandschuhe   waschen', '2026-10-01', '2026-09-29 20:00')
  await aufgabe(erijon, 'Profil zählt nicht', '2026-10-01', '2026-09-29 20:01', 'profil')
  await aufgabe(erijon, 'schon erledigt', '2026-10-01', '2026-09-29 20:02', 'aufgabe', true)
  await aufgabe(erijon, 'erst morgen', '2026-10-02', '2026-09-29 20:03')
  assert.equal(await meldung('2026-10-01 08:25', 'aufgabe', erijon), null, 'vor 08:30 nicht')
  assert.equal(await meldung('2026-10-01 10:00', 'aufgabe', erijon), null, 'ab 10 uhr nicht mehr')
  const morgens = await kandidaten('2026-10-01 08:40', 'aufgabe')
  assert.deepEqual(morgens, [{
    user_id: erijon, art: 'aufgabe', tag: '2026-10-01',
    nachricht: 'heute fällig: Boxhandschuhe waschen', url: './#/eni',
  }], 'nur die eigene, faellige, offene aufgabe; koray hat keine')
  await aufgabe(erijon, 'Mathe Blatt 3 abgeben', '2026-10-01', '2026-09-30 07:00')
  assert.equal(await meldung('2026-10-01 08:40', 'aufgabe', erijon), 'heute fällig: Boxhandschuhe waschen und 1 weitere aufgabe.')
  await aufgabe(erijon, 'Zimmer aufräumen', '2026-10-01', '2026-09-30 07:01')
  assert.equal(await meldung('2026-10-01 08:40', 'aufgabe', erijon), 'heute fällig: Boxhandschuhe waschen und 2 weitere aufgaben.')
  // lange texte werden gekuerzt
  await aufgabe(koray, 'x'.repeat(300), '2026-10-01', '2026-09-30 07:00')
  const lang = await meldung('2026-10-01 08:40', 'aufgabe', koray)
  assert.equal(lang, `heute fällig: ${'x'.repeat(119)}…`)
  // ohne push-abo und ausgeschaltet: nichts
  await query("delete from public.push_abos where user_id = $1", [koray])
  assert.equal(await meldung('2026-10-01 08:40', 'aufgabe', koray), null)
  await query('update public.erinnerungs_einstellungen set aufgabe_aktiv = false where user_id = $1', [erijon])
  assert.equal(await meldung('2026-10-01 08:40', 'aufgabe', erijon), null)
  await query('update public.erinnerungs_einstellungen set aufgabe_aktiv = true where user_id = $1', [erijon])

  // die reservierung nimmt die neue art an, genau einmal
  const reserviere = async () => (await query(
    "select public.reserviere_aktivitaetsversand($1, 'aufgabe', '2026-10-01', $2, '2026-10-01 08:40 Europe/Berlin'::timestamptz) as ok",
    [erijon, id()],
  )).rows[0].ok
  assert.equal(await reserviere(), true)
  assert.equal(await reserviere(), false, 'am selben tag kein zweites mal')

  // ------------------------------------------------------ die uebrigen arten
  // donnerstag 18:40, koray hat heute nichts gelernt: die lern-erinnerung steht
  await query("insert into public.push_abos values ($1, 'https://push/k2')", [koray])
  assert.equal(await meldung('2026-10-01 18:40', 'lernen', koray), 'heute noch kein lerneintrag. zeit für eine kleine einheit?')
  // ansage-meldung unveraendert
  await query(
    `insert into public.duell_ansagen(id, von, an, feld, ab, bis, ziel, erstellt_am, version, stufe, einsatz)
     values ($1, $2, $3, 'lesen', '2026-10-01', '2026-10-04', 4, '2026-10-01 11:00 Europe/Berlin', 2, 'allin', 3)`,
    [id(), koray, erijon],
  )
  assert.equal(
    await meldung('2026-10-01 11:10', 'ansage', erijon),
    'koray sagt an: 4× lesen bis sonntag 18 uhr. all-in, 3 punkte. kontern oder du auch?',
  )

  // rechte wie vorher: nur der dienst darf die kandidaten lesen
  const rechte = (await query(
    "select has_function_privilege('authenticated', 'public.aktivitaets_kandidaten(timestamptz)', 'execute') as a, has_function_privilege('service_role', 'public.aktivitaets_kandidaten(timestamptz)', 'execute') as s",
  )).rows[0]
  assert.deepEqual(rechte, { a: false, s: true })

  console.log('eni-meldungen: sonntagsmeldung, faellige aufgaben, uebrige arten und rechte geprueft')
} finally {
  await db.close()
}
