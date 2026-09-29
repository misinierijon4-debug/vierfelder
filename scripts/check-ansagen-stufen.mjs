// Isolated embedded PostgreSQL. Never connects to Supabase production.
// Usage: node scripts/check-ansagen-stufen.mjs <absolute path to @electric-sql/pglite/dist/index.js>
//
// Spielt `*_ansagen_stufen.sql` auf den Stand nach der ersten Fassung:
// Altbestand bleibt gueltig, Rechte, Ziele je Stufe, Sperren (inaktives Feld,
// all-in, Kontingent, 48 Stunden), ehrliche Zaehlung (nach der Ansage, am
// selben Tag), Kontern und „du auch", Einfrieren mit der Frist Sonntag 18 Uhr,
// Wochenabrechnung Version 3 und die Push-Texte. Alle Zeitpunkte sind fest.
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
  await lies('20260922120000_duell_ansagen.sql'),
  await lies('20260923090000_wochenschluss_mitternacht.sql'),
]
const migration = await lies('20260924120000_ansagen_stufen.sql')

const query = (sql, params = []) => db.query(sql, params)
const alsSuperuser = () => db.exec('reset role;')
const alsRolle = async (id, role = 'authenticated') => {
  await db.exec(`reset role; set role ${role};`)
  await query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ''])
}
let n = 0
const id = () => `bbbbbbbb-0000-4000-8000-${String(++n).padStart(12, '0')}`
const berlin = (zeit) => `${zeit} Europe/Berlin`

/** eine abgeschlossene sitzung, lokal in Berlin */
const sitzung = (user, bereich, tag, beginn = '18:00', minuten = 30) => query(
  `insert into public.aufenthalte(user_id, bereich, ort, ankunft, abgang)
   values ($1, $2, 'test', ($3 || ' ' || $4 || ' Europe/Berlin')::timestamptz,
     ($3 || ' ' || $4 || ' Europe/Berlin')::timestamptz + make_interval(mins => $5))`,
  [user, bereich, tag, beginn, minuten],
)
/** eine getippte einheit mit festen zeitpunkten — nur am trigger vorbei moeglich */
const getippt = async (user, bereich, tag, erfasst, erstellt = erfasst) => {
  await query('alter table public.einheiten disable trigger einheiten_erstellt_fest')
  await query(
    `insert into public.einheiten(id, user_id, bereich, tag, erfasst, erstellt)
     values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)`,
    [id(), user, bereich, tag, berlin(erfasst), berlin(erstellt)],
  )
  await query('alter table public.einheiten enable trigger einheiten_erstellt_fest')
}
const gewogen = async (user, tag, erstellt) => {
  await query('alter table public.gewicht disable trigger gewicht_erstellt_fest')
  await query(
    'insert into public.gewicht(user_id, tag, kg, erstellt) values ($1, $2, 80, $3::timestamptz)',
    [user, tag, berlin(erstellt)],
  )
  await query('alter table public.gewicht enable trigger gewicht_erstellt_fest')
}
const sageAn = async (von, feld, stufe, jetzt, ansageId = id()) =>
  (await query('select private.sage_an_stufe_um($1, $2, $3, $4, $5::timestamptz) as z',
    [von, ansageId, feld, stufe, berlin(jetzt)])).rows[0].z
const reagiere = async (wer, ansage, art, jetzt, gegenId = id()) =>
  (await query('select private.reagiere_auf_ansage_um($1, $2, $3, $4, $5::timestamptz) as z',
    [wer, ansage, gegenId, art, berlin(jetzt)])).rows[0].z
const fehlerVon = async (versprechen) => {
  try {
    await versprechen
  } catch (fehler) {
    return fehler.message
  }
  return null
}
const entscheide = async (jetzt) =>
  (await query('select private.entscheide_duell_ansagen($1::timestamptz) as n', [berlin(jetzt)])).rows[0].n
const zeile = async (ansageId) =>
  (await query('select * from public.duell_ansagen where id = $1', [ansageId])).rows[0]

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
      erfasst timestamptz,
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

  // Altbestand: eine Ansage der ersten Fassung und ein Archiv der Version 2
  const alt = id()
  await query(`insert into public.duell_ansagen(id, von, an, feld, ab, bis, ziel, erstellt_am)
    values ($1, $2, $3, 'gym', '2020-06-02', '2020-06-06', 1, '2020-06-01 12:00 Europe/Berlin')`, [alt, erijon, koray])
  await query(`insert into public.wochenabrechnung
    (woche, sieger, grund, differenz, beleg_erijon, beleg_koray, berechnung_version, archiv_quelle,
     punkte_erijon, punkte_koray, ansage_erijon, ansage_koray)
    values ('2020-06-22', 'erijon', 'punkte', 2, 0, 0, 2, 'server_nachgeholt', 3, 1, 1, -1)`)

  await db.exec(migration)
  await db.exec(migration)

  const altZeile = await zeile(alt)
  assert.equal(altZeile.version, 1, 'alte zeilen bleiben version 1')
  assert.equal(altZeile.einsatz, 1)
  assert.equal(altZeile.stufe, null)
  // version 1 bleibt nach ihren alten regeln entscheidbar: koray war nie im gym
  assert.equal(await entscheide('2020-06-07 04:00'), 1)
  assert.equal((await zeile(alt)).ergebnis, 'verfehlt')

  // die checks halten beide fassungen dicht
  assert.match(await fehlerVon(query(`insert into public.duell_ansagen(id, von, an, feld, ab, bis, ziel)
    values ($1, $2, $3, 'lernen', '2020-06-02', '2020-06-06', 1)`, [id(), erijon, koray])), /duell_ansagen_feld_check/)
  assert.match(await fehlerVon(query(`insert into public.duell_ansagen(id, von, an, feld, ab, bis, ziel, version, stufe, einsatz)
    values ($1, $2, $3, 'boxen', '2020-06-01', '2020-06-06', 2, 2, 'mutig', 2)`, [id(), erijon, koray])), /duell_ansagen_zeitraum/)
  assert.match(await fehlerVon(query(`insert into public.duell_ansagen(id, von, an, feld, ab, bis, ziel, version, stufe, einsatz)
    values ($1, $2, $3, 'boxen', '2020-06-01', '2020-06-07', 2, 2, 'mutig', 3)`, [id(), erijon, koray])), /duell_ansagen_stufe/)

  // ---------------------------------------------------------- Rechte
  await alsRolle(null, 'anon')
  assert.match(await fehlerVon(query("select public.sage_an_stufe($1, 'boxen', 'sicher')", [id()])), /permission denied/)
  assert.match(await fehlerVon(query("select public.reagiere_auf_ansage($1, $2, 'kontern')", [id(), id()])), /permission denied/)
  await alsRolle(fremd)
  assert.match(await fehlerVon(query("select public.sage_an_stufe($1, 'boxen', 'sicher')", [id()])), /nur ein zweikampf-profil/)
  assert.match(await fehlerVon(query("select public.reagiere_auf_ansage($1, $2, 'kontern')", [id(), id()])), /nur ein zweikampf-profil/)
  await alsRolle(erijon)
  assert.match(await fehlerVon(query("select public.sage_an($1, 'boxen')", [id()])), /ansage:veraltet/)
  assert.match(
    await fehlerVon(query("select private.sage_an_stufe_um($1, $2, 'boxen', 'sicher', now())", [erijon, id()])),
    /permission denied/,
  )
  assert.match(
    await fehlerVon(query("select private.reagiere_auf_ansage_um($1, $2, $3, 'kontern', now())", [erijon, id(), id()])),
    /permission denied/,
  )
  assert.match(await fehlerVon(query("update public.duell_ansagen set reaktion = 'kontern'")), /permission denied/)

  // ------------------------------------------------ einheiten.erstellt
  await alsSuperuser()
  await query(`insert into public.einheiten(id, user_id, bereich, tag, erfasst, erstellt)
    values ($1, $2, 'lesen', '2019-01-01', '2019-01-01 08:00+00', '2019-01-01 08:00+00')`, [id(), erijon])
  const eErst = (await query("select erstellt from public.einheiten where tag = '2019-01-01'")).rows[0].erstellt
  assert.notEqual(eErst.toISOString(), '2019-01-01T08:00:00.000Z', 'erstellt setzt nur die datenbank')
  await query("update public.einheiten set erstellt = '2019-01-01 08:00+00' where tag = '2019-01-01'")
  assert.equal(
    (await query("select erstellt from public.einheiten where tag = '2019-01-01'")).rows[0].erstellt.toISOString(),
    eErst.toISOString(),
  )
  await query("delete from public.einheiten where tag = '2019-01-01'")

  // -------------------------------------------------- Vorgeschichte
  // Woche Mo 06.07.–So 12.07.2020, Frist So 18 Uhr. Rueckblick ab Mo 08.06.
  // koray boxt 1, 2, 3, 2 mal (Schnitt 2 → 3 / 4 / 5), wiegt sich 1× je Woche
  // (→ 4 / 5 / 6), war nie im gym. erijon liest und boxt 1× je Woche.
  for (const tag of ['2020-06-09', '2020-06-16', '2020-06-18', '2020-06-23', '2020-06-24', '2020-06-25', '2020-06-30'])
    await sitzung(koray, 'boxen', tag)
  await getippt(koray, 'boxen', '2020-07-02', '2020-07-02 20:00')
  for (const tag of ['2020-06-10', '2020-06-17', '2020-06-24', '2020-07-01']) {
    await gewogen(koray, tag, `${tag} 07:00`)
    await sitzung(erijon, 'lesen', tag, '21:00', 15)
    await sitzung(erijon, 'boxen', tag, '17:00', 45)
  }
  assert.deepEqual(
    (await query("select private.ansage_verlauf($1, 'boxen', '2020-07-06') as v", [koray])).rows[0].v,
    [1, 2, 3, 2],
  )

  // ------------------------------------------------------- Anlegen
  const boxen = await sageAn(erijon, 'boxen', 'mutig', '2020-07-06 10:00')
  assert.equal(boxen.version, 2)
  assert.equal(boxen.von, erijon)
  assert.equal(boxen.an, koray)
  assert.equal(boxen.ab, '2020-07-06')
  assert.equal(boxen.bis, '2020-07-12')
  assert.equal(boxen.ziel, 4, 'schnitt 2 mal 1,6 aufgerundet')
  assert.equal(boxen.einsatz, 2)
  assert.deepEqual(await sageAn(erijon, 'boxen', 'mutig', '2020-07-06 10:05', boxen.id), boxen)
  assert.match(await fehlerVon(sageAn(erijon, 'boxen', 'allin', '2020-07-06 10:05', boxen.id)), /schon vergeben/)
  assert.match(await fehlerVon(sageAn(erijon, 'boxen', 'sicher', '2020-07-06 10:10')), /ansage:schonAngesagt/)
  assert.match(await fehlerVon(sageAn(erijon, 'gym', 'sicher', '2020-07-06 10:10')), /ansage:feldInaktiv/)
  assert.match(await fehlerVon(sageAn(erijon, 'boxen', 'heldenhaft', '2020-07-06 10:10')), /stufe/)

  const wiegen = await sageAn(erijon, 'gewicht', 'allin', '2020-07-06 10:30')
  assert.equal(wiegen.ziel, 6)
  assert.equal(wiegen.einsatz, 3)
  assert.match(await fehlerVon(sageAn(erijon, 'lesen', 'sicher', '2020-07-06 10:40')), /ansage:keineAnsagenMehr/)

  const lesen = await sageAn(koray, 'lesen', 'allin', '2020-07-06 11:00')
  assert.equal(lesen.ziel, 4)
  assert.match(await fehlerVon(sageAn(koray, 'gym', 'allin', '2020-07-06 11:10')), /ansage:allinVerbraucht/)
  // freitag 18:01 ist die frist keine 48 stunden mehr weg
  assert.match(await fehlerVon(sageAn(koray, 'boxen', 'sicher', '2020-07-10 18:01')), /ansage:zuSpaet/)

  // ---------------------------------------------------- Reaktionen
  assert.match(await fehlerVon(reagiere(koray, lesen.id, 'kontern', '2020-07-06 12:00')), /ansage:nichtDeine/)
  assert.match(await fehlerVon(reagiere(erijon, lesen.id, 'kontern', '2020-07-07 11:00')), /ansage:reaktionZuSpaet/)
  assert.match(await fehlerVon(reagiere(koray, alt, 'kontern', '2020-06-02 12:00')), /ansage:nichtDeine|ansage:veraltet/)

  // koray wiegt sich montag frueh (vor der ansage) — zaehlt nicht, kontern geht
  await gewogen(koray, '2020-07-06', '2020-07-06 07:00')
  const kontra = await reagiere(koray, wiegen.id, 'kontern', '2020-07-06 12:00')
  assert.equal(kontra.ansage.reaktion, 'kontern')
  assert.equal(kontra.gegen, null)
  assert.deepEqual((await reagiere(koray, wiegen.id, 'kontern', '2020-07-06 12:01')).ansage, kontra.ansage, 'wiederholung')

  // koray boxt montag frueh (zaehlt nicht) und abends (zaehlt) — kontern ist dann zu spaet
  await sitzung(koray, 'boxen', '2020-07-06', '08:00')
  await sitzung(koray, 'boxen', '2020-07-06', '19:00')
  assert.match(await fehlerVon(reagiere(koray, boxen.id, 'kontern', '2020-07-06 20:00')), /ansage:kontraZuSpaet/)
  const gegenId = id()
  const duAuch = await reagiere(koray, boxen.id, 'duAuch', '2020-07-06 20:00', gegenId)
  assert.equal(duAuch.ansage.reaktion, 'duAuch')
  assert.equal(duAuch.gegen.id, gegenId)
  assert.equal(duAuch.gegen.von, koray)
  assert.equal(duAuch.gegen.an, erijon)
  assert.equal(duAuch.gegen.ziel, 4)
  assert.equal(duAuch.gegen.bezug, boxen.id)
  assert.equal(
    new Date(duAuch.gegen.erstellt_am).toISOString(),
    new Date(boxen.erstellt_am).toISOString(),
    'gezaehlt ab derselben ansage',
  )
  assert.deepEqual(await reagiere(koray, boxen.id, 'duAuch', '2020-07-06 20:05', gegenId), duAuch)
  assert.match(await fehlerVon(reagiere(koray, boxen.id, 'kontern', '2020-07-06 20:10')), /ansage:schonReagiert/)
  assert.match(await fehlerVon(reagiere(erijon, gegenId, 'kontern', '2020-07-06 20:10')), /ansage:veraltet/)

  // die gegenrichtung kostet koray kein kontingent: freitag 18:00 geht noch eine
  const spaet = await sageAn(koray, 'boxen', 'sicher', '2020-07-10 18:00')
  assert.equal(spaet.ziel, 2)
  assert.equal(spaet.ab, '2020-07-10')

  // -------------------------------------------------- Zaehlen, Einfrieren
  // koray: di getippt am selben tag (zaehlt), mi fuer mi erst do eingetragen
  // (zaehlt nicht), do gemessen, fr abends offline getippt und sa frueh
  // gesendet (zaehlt) → 4 am samstag
  await getippt(koray, 'boxen', '2020-07-07', '2020-07-07 20:00')
  await getippt(koray, 'boxen', '2020-07-08', '2020-07-09 09:00')
  await sitzung(koray, 'boxen', '2020-07-09')
  const tage = async (ab, frist) => (await query(
    "select array_agg(t::text order by t) as t from private.ansage_ehrliche_tage($1, 'boxen', $2::timestamptz, $3::timestamptz) t",
    [koray, berlin(ab), berlin(frist)],
  )).rows[0].t
  assert.deepEqual(await tage('2020-07-06 10:00', '2020-07-12 18:00'), ['2020-07-06', '2020-07-07', '2020-07-09'])
  assert.equal(await entscheide('2020-07-10 22:00'), 0)
  await getippt(koray, 'boxen', '2020-07-10', '2020-07-10 21:00', '2020-07-11 08:00')
  // einen tag spaeter gesendet ist zurueckdatiert: zaehlt nicht
  await getippt(koray, 'boxen', '2020-07-05', '2020-07-06 23:00', '2020-07-08 08:00')
  assert.equal(await entscheide('2020-07-11 09:00'), 1)
  assert.equal((await zeile(boxen.id)).ergebnis, 'geschafft')

  // koray wiegt sich di (zaehlt) und traegt mi erst do ein (zaehlt nicht)
  await gewogen(koray, '2020-07-07', '2020-07-07 07:00')
  await gewogen(koray, '2020-07-08', '2020-07-09 07:00')
  // erijon boxt mo mittag (nach der ansage), mi und sa; liest nie
  await sitzung(erijon, 'boxen', '2020-07-06', '12:00')
  await sitzung(erijon, 'boxen', '2020-07-08')
  await sitzung(erijon, 'boxen', '2020-07-11')
  // sonntag 17:45 bis 18:15 ist zur frist nicht fertig
  await sitzung(koray, 'boxen', '2020-07-12', '17:45', 30)
  assert.equal(await entscheide('2020-07-12 17:59'), 0)
  assert.equal(await entscheide('2020-07-12 18:00'), 4)
  assert.equal((await zeile(wiegen.id)).ergebnis, 'verfehlt')
  assert.equal((await zeile(lesen.id)).ergebnis, 'verfehlt')
  assert.equal((await zeile(gegenId)).ergebnis, 'verfehlt', 'erijon hat 3 von 4')
  assert.equal((await zeile(spaet.id)).ergebnis, 'verfehlt', 'erijon hat 1 von 2')

  // ------------------------------------------ Wochenabrechnung Version 3
  // felder: koray boxt mo di mi do fr so und wiegt mo di mi → 9, erijon boxt mo mi sa → 3.
  // ansagen: wiegen all-in gekontert verfehlt → erijon +6; boxen geschafft → koray +2;
  // lesen all-in verfehlt → koray +3; du auch verfehlt → koray +2; boxen sicher verfehlt → koray +1.
  await alsRolle(erijon)
  const archiv = (await query("select public.finalisiere_wochenabrechnung('2020-07-06') as a")).rows[0].a
  await alsSuperuser()
  assert.equal(archiv.berechnung_version, 3)
  assert.equal(archiv.ansage_erijon, 6)
  assert.equal(archiv.ansage_koray, 8)
  assert.equal(archiv.punkte_erijon, 9)
  assert.equal(archiv.punkte_koray, 17)
  assert.equal(archiv.differenz, -8)
  assert.equal(archiv.sieger, 'koray')
  // das archiv der version 2 hat die neue invariante ueberlebt
  assert.equal((await query("select count(*)::int as n from public.wochenabrechnung where woche = '2020-06-22'")).rows[0].n, 1)

  // --------------------------------------------------------------- Push
  const meldung = async (user, jetzt) => (await query(
    "select nachricht from public.aktivitaets_kandidaten($1::timestamptz) where art = 'ansage' and user_id = $2",
    [berlin(jetzt), user],
  )).rows[0]?.nachricht ?? null
  await query('update public.erinnerungs_einstellungen set ansage_aktiv = true')
  assert.equal(await meldung(koray, '2020-07-06 10:10'), 'erijon sagt an: 4× boxen bis sonntag 18 uhr. mutig, 2 punkte. kontern oder du auch?')
  assert.equal(await meldung(koray, '2020-07-06 10:40'), 'erijon sagt an: 6× wiegen bis sonntag 18 uhr. all-in, 3 punkte. kontern oder du auch?')
  assert.equal(await meldung(erijon, '2020-07-06 11:10'), 'koray sagt an: 4× lesen bis sonntag 18 uhr. all-in, 3 punkte. kontern oder du auch?')
  assert.equal(await meldung(erijon, '2020-07-06 12:10'), 'koray kontert: 6× wiegen geht jetzt um 6 punkte.')
  assert.equal(await meldung(erijon, '2020-07-06 20:10'), 'koray sagt: du auch. 4× boxen bis sonntag 18 uhr, sonst 2 punkte für koray.')
  assert.equal(await meldung(erijon, '2020-07-10 18:10'), 'koray sagt an: 2× boxen bis sonntag 18 uhr. sicher, 1 punkt. kontern oder du auch?')
  assert.equal(await meldung(koray, '2020-07-07 12:00'), null)
  assert.equal(await meldung(erijon, '2020-07-06 22:10'), null, 'nach 22 uhr schweigt sie')

  // Neue Ansagen: Training vereint Gym und Boxen je Kalendertag einmal.
  await alsSuperuser()
  await db.exec(await lies('20260924210000_ansagen_training.sql'))
  const training = await sageAn(erijon, 'training', 'sicher', '2020-07-13 10:00')
  assert.equal(training.feld, 'training')
  assert.equal(training.ziel >= 2, true)
  await sitzung(koray, 'gym', '2020-07-14')
  await sitzung(koray, 'boxen', '2020-07-14', '19:00')
  assert.deepEqual((await query(
    "select array_agg(t::text order by t) as tage from private.ansage_ehrliche_tage($1, 'training', $2::timestamptz, $3::timestamptz) t",
    [koray, training.erstellt_am, berlin('2020-07-19 18:00')],
  )).rows[0].tage, ['2020-07-14'])
  assert.deepEqual((await query(
    "select array_agg(t::text order by t) as tage from private.ansage_form_tage($1, 'training', '2020-07-14', '2020-07-14') t",
    [koray],
  )).rows[0].tage, ['2020-07-14'])
  assert.equal((await zeile(boxen.id)).feld, 'boxen', 'alte Ansage bleibt eigenstaendig')

  // Reaktionen kosten je eine der zwei Ansagen der Woche (Mo 20.07.2020).
  await db.exec(await lies('20260925120000_ansagen_reaktion_kostet.sql'))
  const kTraining = await sageAn(koray, 'training', 'sicher', '2020-07-20 10:00')
  const kLesen = await sageAn(koray, 'lesen', 'sicher', '2020-07-20 10:05')
  const eTraining = await sageAn(erijon, 'training', 'sicher', '2020-07-20 11:00')
  // koray hat beide ansagen gemacht: keine reaktion mehr, weder kontern noch du auch
  assert.match(await fehlerVon(reagiere(koray, eTraining.id, 'kontern', '2020-07-20 12:00')), /ansage:keineAnsagenMehr/)
  assert.match(await fehlerVon(reagiere(koray, eTraining.id, 'duAuch', '2020-07-20 12:00')), /ansage:keineAnsagenMehr/)
  assert.equal((await zeile(eTraining.id)).reaktion, null)
  // erijon: eine eigene, eine reaktion — danach ist schluss, in beide richtungen
  const eKontra = await reagiere(erijon, kTraining.id, 'kontern', '2020-07-20 12:00')
  assert.equal(eKontra.ansage.reaktion, 'kontern')
  assert.deepEqual((await reagiere(erijon, kTraining.id, 'kontern', '2020-07-20 12:01')).ansage, eKontra.ansage, 'wiederholung trotz 0 uebrig')
  assert.match(await fehlerVon(reagiere(erijon, kLesen.id, 'duAuch', '2020-07-20 12:05')), /ansage:keineAnsagenMehr/)
  assert.match(await fehlerVon(sageAn(erijon, 'lesen', 'sicher', '2020-07-20 12:10')), /ansage:keineAnsagenMehr/)
  assert.equal(
    (await query("select private.ansagen_verbraucht($1, '2020-07-20') as n", [erijon])).rows[0].n,
    2,
  )

  console.log('ansagen_stufen: altbestand, rechte, ziele, sperren, ehrliche zaehlung, reaktionen, frist, abrechnung v3, push, training und reaktion kostet eine ansage geprueft')
} finally {
  await db.close()
}
