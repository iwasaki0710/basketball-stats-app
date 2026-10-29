import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createDemo } from "../lib/demo";
test("SQL migration, team isolation, role enforcement, atomic revision and normalized events", async () => {
  const db = new PGlite();
  const admin = "11111111-1111-4111-8111-111111111111",
    viewer = "22222222-2222-4222-8222-222222222222",
    outsider = "33333333-3333-4333-8333-333333333333";
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${admin}','admin@test.invalid'),('${viewer}','viewer@test.invalid'),('${outsider}','outsider@test.invalid');`,
  );
  await db.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false);`,
  );
  const team = (
    await db.query<{ id: string }>(`select public.create_team('Test Team') id`)
  ).rows[0].id;
  const demo = createDemo();
  const save = async (revision: number, data = demo) =>
    (
      await db.query<{ revision: number }>(
        "select public.save_workspace($1,$2,$3::jsonb) revision",
        [team, revision, JSON.stringify(data)],
      )
    ).rows[0].revision;
  assert.equal(Number(await save(0)), 1);
  await db.exec("reset role");
  await db.exec(
    readFileSync("supabase/migrations/002_complete_recording.sql", "utf8"),
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false);`,
  );
  assert.equal(
    Number(
      (await db.query<{ revision: number }>("select revision from workspaces"))
        .rows[0].revision,
    ),
    1,
  );

  const events = demo.games.reduce((n, g) => n + g.events.length, 0);
  assert.equal(
    Number(
      (
        await db.query<{ n: number }>(
          "select count(*) n from public.play_events",
        )
      ).rows[0].n,
    ),
    events,
  );
  await assert.rejects(() => save(0), /revision_conflict/);
  assert.equal(
    Number(
      (await db.query<{ revision: number }>("select revision from workspaces"))
        .rows[0].revision,
    ),
    1,
  );
  const bad = createDemo();
  bad.games[0].events[0].elapsed = -1;
  await assert.rejects(() => save(1, bad), /invalid_event_time/);
  assert.equal(
    Number(
      (await db.query<{ n: number }>("select count(*) n from play_events"))
        .rows[0].n,
    ),
    events,
  );
  await db.query("select public.add_team_member($1,$2,$3)", [
    team,
    "viewer@test.invalid",
    "viewer",
  ]);
  await db.exec(
    `select set_config('request.jwt.claim.sub','${viewer}',false);`,
  );
  assert.equal((await db.query("select * from workspaces")).rows.length, 1);
  await assert.rejects(() => save(1), /write_access_required/);
  await assert.rejects(
    () =>
      db.query("select public.add_team_member($1,$2,$3)", [
        team,
        "outsider@test.invalid",
        "admin",
      ]),
    /admin_required/,
  );
  await assert.rejects(
    () => db.query("update workspaces set revision=99"),
    /permission denied/,
  );
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false);`);
  await db.query("select public.add_team_member($1,$2,$3)", [
    team,
    "viewer@test.invalid",
    "recorder",
  ]);
  await db.exec(
    `select set_config('request.jwt.claim.sub','${viewer}',false);`,
  );
  assert.equal(Number(await save(1)), 2);
  const renamed = createDemo();
  renamed.teamName = "Unauthorized rename";
  await assert.rejects(
    () => save(2, renamed),
    /admin_required_for_team_settings/,
  );
  await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false);`);
  const extended = createDemo();
  extended.players[0].photo =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=";
  extended.games[0].opponentStatsComplete = true;
  extended.games[0].events.push({
    id: "opponent-detail-test",
    kind: "3PM",
    side: "opponent",
    playerId: "",
    quarter: 4,
    elapsed: 2400,
  });
  assert.equal(Number(await save(2, extended)), 3);
  assert.equal(
    (
      await db.query<{ side: string }>(
        "select side from play_events where id='opponent-detail-test'",
      )
    ).rows[0].side,
    "opponent",
  );
  assert.equal(
    (
      await db.query<{ photo: string }>(
        "select photo from players where id='p1'",
      )
    ).rows[0].photo,
    extended.players[0].photo,
  );
  const invalidPhoto = JSON.parse(JSON.stringify(extended));
  invalidPhoto.players[0].photo = "https://tracker.invalid/image";
  await assert.rejects(() => save(3, invalidPhoto), /invalid_photo/);
  await db.exec(
    `select set_config('request.jwt.claim.sub','${outsider}',false);`,
  );
  assert.equal((await db.query("select * from workspaces")).rows.length, 0);
  assert.equal((await db.query("select * from players")).rows.length, 0);
  assert.equal((await db.query("select * from play_events")).rows.length, 0);
  await assert.rejects(() => save(1), /write_access_required/);
  await db.exec(`reset role;set role anon;`);
  await assert.rejects(
    () => db.query("select * from workspaces"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("select public.create_team('No')"),
    /permission denied/,
  );
  await db.close();
});
