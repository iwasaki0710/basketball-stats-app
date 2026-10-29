import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../lib/demo";
import { aggregate, clockAt, Play, workspaceSchema } from "../lib/model";
import { fingerprint, mergeWorkspaces, MergeConflict } from "../lib/merge";
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
function base() {
  const w = createDemo();
  w.games = [{ ...w.games.at(-1)!, status: "live", remaining: 500 }];
  return w;
}
const play = (
  id: string,
  kind: Play["kind"],
  elapsed = 10,
  playerId = "p1",
): Play => ({ id, kind, elapsed, playerId, quarter: 1 });
test("different offline events merge once, including idempotent resubmission", () => {
  const b = base(),
    a = clone(b),
    r = clone(b);
  a.games[0].events = [play("a", "2PM")];
  r.games[0].events = [play("b", "3PM", 20)];
  const m = mergeWorkspaces(b, a, r);
  assert.equal(aggregate(m.games[0]).score, 5);
  assert.deepEqual(mergeWorkspaces(b, m, m), m);
  assert.equal(mergeWorkspaces(b, a, a).games[0].events.length, 1);
});
test("same event edited differently stops with both originals intact", () => {
  const b = base();
  b.games[0].events = [play("id", "2PM")];
  const a = clone(b),
    r = clone(b);
  a.games[0].events[0].kind = "2PX";
  r.games[0].events[0].kind = "3PM";
  assert.throws(() => mergeWorkspaces(b, a, r), MergeConflict);
  assert.equal(a.games[0].events[0].kind, "2PX");
  assert.equal(r.games[0].events[0].kind, "3PM");
});
test("cross-device same-clock substitution is not silently ordered", () => {
  const b = base(),
    a = clone(b),
    r = clone(b);
  a.games[0].events = [{ ...play("sub", "SUB", 10), inId: "p6" }];
  r.games[0].events = [play("score", "3PM", 10)];
  assert.throws(() => mergeWorkspaces(b, a, r), /順序/);
});
test("existing same-clock substitution order survives append from another branch", () => {
  const b = base();
  b.games[0].events = [
    play("score", "2PM", 10),
    { ...play("sub", "SUB", 10), inId: "p6" },
  ];
  const a = clone(b),
    r = clone(b);
  a.games[0].events.push(play("new", "3PM", 10, "p6"));
  const m = mergeWorkspaces(b, a, r);
  assert.deepEqual(
    m.games[0].events.map((e) => e.id),
    ["score", "sub", "new"],
  );
  assert.equal(aggregate(m.games[0]).players.p1.pm, 2);
  assert.equal(aggregate(m.games[0]).players.p6.pm, 3);
});
test("deleting a substitution cannot silently strand dependent plays", () => {
  const b = base();
  b.games[0].events = [{ ...play("sub", "SUB"), inId: "p6" }];
  const a = clone(b),
    r = clone(b);
  a.games[0].events = [];
  r.games[0].events.push(play("later", "2PM", 20, "p6"));
  assert.throws(() => mergeWorkspaces(b, a, r), /整合性/);
});
test("independent player fields merge and conflicting settings do not", () => {
  const b = base(),
    a = clone(b),
    r = clone(b);
  a.players[0].height = 182;
  r.players[0].name = "更新した名前";
  const m = mergeWorkspaces(b, a, r);
  assert.equal(m.players[0].height, 182);
  assert.equal(m.players[0].name, "更新した名前");
  a.teamName = "A";
  r.teamName = "B";
  assert.throws(() => mergeWorkspaces(b, a, r), MergeConflict);
});
test("countdown survives reload and ticks do not dirty cloud identity", () => {
  const w = base(),
    now = Date.now();
  w.games[0].clockTarget = now + 500000;
  const later = clone(w);
  later.games[0] = clockAt(later.games[0], now + 12000);
  assert.equal(later.games[0].remaining, 488);
  assert.equal(fingerprint(w), fingerprint(later));
  assert.equal(clockAt(w.games[0], now + 600000).remaining, 0);
  assert.equal(
    clockAt({ ...w.games[0], clockTarget: undefined }, now + 12000).remaining,
    500,
  );
});
test("opponent detailed plays affect opponent attempts, not own player stats", () => {
  const w = base();
  w.games[0].events = [
    { ...play("o1", "3PM"), side: "opponent", playerId: "" },
    { ...play("o2", "3PX", 20), side: "opponent", playerId: "" },
    { ...play("o3", "DREB", 30), side: "opponent", playerId: "" },
    play("own", "2PM", 40),
  ];
  assert.equal(workspaceSchema.safeParse(w).success, true);
  const a = aggregate(w.games[0]);
  assert.equal(a.score, 2);
  assert.equal(a.opponent, 3);
  assert.equal(a.opponentTeam.threea, 2);
  assert.equal(a.opponentTeam.threem, 1);
  assert.equal(a.opponentTeam.dreb, 1);
  assert.equal(a.team.fga, 1);
  assert.equal(a.players.p1.pts, 2);
  assert.equal(a.players.p1.pm, -1);
});
test("photo restore rejects SVG and external tracking URLs", () => {
  const w = base();
  w.players[0].photo = "https://tracker.invalid/photo";
  assert.equal(workspaceSchema.safeParse(w).success, false);
  w.players[0].photo = "data:image/svg+xml;base64,PHN2Zz4=";
  assert.equal(workspaceSchema.safeParse(w).success, false);
});
test("scoring runs preserve total points and ignore non-scoring plays", async () => {
  const { scoringRuns } = await import("../lib/model");
  const w = base(),
    g = w.games[0];
  g.events = [
    play("a", "2PM"),
    play("b", "TOV", 12),
    play("c", "3PM", 20),
    play("d", "OPP2", 30, ""),
    { ...play("e", "FTM", 40, ""), side: "opponent" },
    play("f", "FTM", 50),
  ];
  const runs = scoringRuns(g);
  assert.deepEqual(
    runs.map((r) => r.points),
    [5, 3, 1],
  );
  assert.equal(
    runs.filter((r) => r.side === "own").reduce((n, r) => n + r.points, 0),
    aggregate(g).score,
  );
  assert.equal(
    runs.filter((r) => r.side === "opponent").reduce((n, r) => n + r.points, 0),
    aggregate(g).opponent,
  );
});
