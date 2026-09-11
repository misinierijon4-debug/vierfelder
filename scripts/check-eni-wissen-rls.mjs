// Isolated embedded PostgreSQL. Never connects to production.
// Usage: node scripts/check-eni-wissen-rls.mjs <absolute path to @electric-sql/pglite/dist/index.js>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(
  process.argv[2] ? pathToFileURL(process.argv[2]).href : "@electric-sql/pglite"
);
const db = new PGlite();
const erijon = "11111111-1111-4111-8111-111111111111";
const koray = "22222222-2222-4222-8222-222222222222";
const fremd = "33333333-3333-4333-8333-333333333333";
try {
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table public.profile(id uuid primary key, person text);
    grant select on public.profile to authenticated;
    insert into auth.users values ('${erijon}'),('${koray}'),('${fremd}');
    insert into profile values ('${erijon}','erijon'),('${koray}','koray');`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260911181438_eni_gedaechtnis.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const als = async (id, rolle = "authenticated") => {
    await db.exec(`reset role; set role ${rolle};`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      id,
    ]);
  };
  await als(erijon);
  const privat = (
    await db.query(
      "insert into eni_erinnerungen(user_id,text) values ($1,$2) returning id",
      [erijon, "Privates Ziel"],
    )
  ).rows[0].id;
  const geteilt = (
    await db.query(
      "insert into eni_erinnerungen(user_id,text,gemeinsam) values ($1,$2,true) returning id",
      [erijon, "Gemeinsames Ziel"],
    )
  ).rows[0].id;
  await assert.rejects(
    db.query("insert into eni_erinnerungen(user_id,text) values ($1,$2)", [
      koray,
      "Fremdschreiben",
    ]),
  );
  await assert.rejects(
    db.query(
      "insert into eni_erinnerungen(user_id,text,art,gemeinsam) values ($1,'Stil','stil',true)",
      [erijon],
    ),
  );
  await als(koray);
  assert.deepEqual((await db.query("select text from eni_erinnerungen")).rows, [
    { text: "Gemeinsames Ziel" },
  ]);
  assert.equal(
    (
      await db.query(
        "update eni_erinnerungen set text='Manipuliert' where id=$1 returning id",
        [geteilt],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query("delete from eni_erinnerungen where id=$1 returning id", [
        geteilt,
      ])
    ).rows.length,
    0,
  );
  await als(fremd);
  assert.equal(
    (await db.query("select * from eni_erinnerungen")).rows.length,
    0,
  );
  await assert.rejects(
    db.query(
      "insert into eni_erinnerungen(user_id,text) values ($1,'Unbefugt')",
      [fremd],
    ),
  );
  await als("", "anon");
  await assert.rejects(db.query("select * from eni_erinnerungen"));
  await als(erijon);
  await assert.rejects(
    db.query("update eni_erinnerungen set user_id=$1 where id=$2", [
      koray,
      privat,
    ]),
  );
  await db.query("update eni_erinnerungen set gemeinsam=false where id=$1", [
    geteilt,
  ]);
  await als(koray);
  assert.equal(
    (await db.query("select * from eni_erinnerungen")).rows.length,
    0,
  );
  await als(erijon);
  await db.query("delete from eni_erinnerungen where id=$1", [privat]);
  assert.equal(
    (await db.query("select * from eni_erinnerungen where id=$1", [privat]))
      .rows.length,
    0,
  );
  console.log(
    "PASS: PostgreSQL RLS: private data, explicit sharing/revocation, owner-only writes, anonymous/nonmember denial, deletion.",
  );
} finally {
  await db.close();
}
