import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  Game,
  Play,
  metrics,
  quarterStart,
  periodSeconds,
  workspaceSchema,
  seasonStats,
} from "../lib/model";
import { createDemo } from "../lib/demo";
import { csvCell } from "../lib/storage";
const base = (): Game => ({
  id: "test",
  opponent: "相手",
  date: "2026-10-29T14:00",
  venue: "体育館",
  competition: "練習試合",
  season: "2026",
  home: true,
  status: "live",
  quarterSeconds: 600,
  quarters: 4,
  starters: ["p1", "p2", "p3", "p4", "p5"],
  roster: ["p1", "p2", "p3", "p4", "p5", "p6"],
  events: [],
  quarter: 1,
  remaining: 0,
});
const event = (
  kind: Play["kind"],
  elapsed: number,
  playerId = "p1",
  inId?: string,
): Play => ({
  id: `${kind}-${elapsed}`,
  kind,
  elapsed,
  playerId,
  quarter: 1,
  inId,
});
test("shooting outcomes derive attempts, makes and points without double counting", () => {
  const g = base();
  g.events = [
    event("2PM", 10),
    event("2PX", 20),
    event("3PM", 30),
    event("3PX", 40),
    event("FTM", 50),
    event("FTX", 60),
  ];
  const a = aggregate(g),
    s = a.players.p1;
  assert.equal(a.score, 6);
  assert.equal(s.pts, 6);
  assert.equal(s.fgm, 2);
  assert.equal(s.fga, 4);
  assert.equal(s.threem, 1);
  assert.equal(s.threea, 2);
  assert.equal(s.ftm, 1);
  assert.equal(s.fta, 2);
  assert.equal(metrics(s).fg, 50);
  assert.equal(metrics(s).efg, 62.5);
  assert.ok(Math.abs(metrics(s).ts - 61.475409836) < 0.0001);
});
test("substitution order controls minutes, player and lineup plus/minus", () => {
  const g = base();
  g.events = [
    event("2PM", 60),
    event("SUB", 120, "p1", "p6"),
    event("3PM", 120, "p6"),
    event("OPP2", 130, ""),
    event("SUB", 300, "p6", "p1"),
    event("OPP3", 310, ""),
  ];
  const a = aggregate(g);
  assert.equal(a.players.p1.seconds, 420);
  assert.equal(a.players.p6.seconds, 180);
  assert.equal(a.players.p1.pm, -1);
  assert.equal(a.players.p6.pm, 1);
  assert.equal(a.score, 5);
  assert.equal(a.opponent, 5);
  assert.equal(
    Object.values(a.players).reduce((s, p) => s + p.seconds, 0),
    600 * 5,
  );
  assert.equal(
    a.lineups.reduce((s, l) => s + l.pm, 0),
    a.score - a.opponent,
  );
  assert.equal(
    Object.values(a.players).reduce((s, p) => s + p.pm, 0),
    5 * (a.score - a.opponent),
  );
});
test("Undo and correction recalculate all dependent values", () => {
  const g = base();
  g.events = [event("2PM", 10), event("3PM", 20)];
  assert.equal(aggregate(g).score, 5);
  const undone = { ...g, events: g.events.slice(0, -1) };
  assert.equal(aggregate(undone).score, 2);
  assert.equal(aggregate(undone).team.fga, 1);
  const edited = {
    ...g,
    events: g.events.map((e) =>
      e.kind === "3PM" ? { ...e, kind: "3PX" as const } : e,
    ),
  };
  assert.equal(aggregate(edited).score, 2);
  assert.equal(aggregate(edited).team.fga, 2);
  assert.equal(aggregate(edited).players.p1.pm, 2);
});
test("quarter scores reconcile to full game; minutes clip to period", () => {
  const g = base();
  g.quarter = 2;
  g.remaining = 300;
  g.events = [event("2PM", 590), { ...event("3PM", 620), quarter: 2 }];
  const a = aggregate(g);
  assert.equal(aggregate(g, 1).score, 2);
  assert.equal(aggregate(g, 2).score, 3);
  assert.equal(a.score, aggregate(g, 1).score + aggregate(g, 2).score);
  assert.equal(aggregate(g, 1).players.p1.seconds, 600);
  assert.equal(aggregate(g, 2).players.p1.seconds, 300);
  assert.equal(a.players.p1.seconds, 900);
});
test("overtime uses five-minute periods after regulation", () => {
  const g = base();
  assert.equal(quarterStart(g, 5), 2400);
  assert.equal(periodSeconds(g, 5), 300);
  g.quarter = 5;
  g.remaining = 120;
  g.events = [{ ...event("3PM", 2410), quarter: 5 }];
  assert.equal(aggregate(g).players.p1.seconds, 2580);
  assert.equal(aggregate(g, 5).players.p1.seconds, 180);
});
test("empty stats have finite percentages and undefined AST/TO", () => {
  const a = aggregate({ ...base(), events: [], remaining: 600 });
  assert.equal(a.score, 0);
  assert.equal(metrics(a.team).fg, 0);
  assert.equal(metrics(a.team).ts, 0);
  assert.equal(metrics(a.team).astTo, null);
  assert.equal(a.players.p1.seconds, 0);
});
test("demo is valid, deterministic and survives JSON restore", () => {
  const d = createDemo();
  assert.deepEqual(d, createDemo());
  assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(d))), d);
  for (const g of d.games) {
    const a = aggregate(g);
    assert.equal(a.team.pts, a.score);
    assert.equal(
      Object.values(a.players).reduce((s, p) => s + p.pts, 0),
      a.score,
    );
  }
});
test("restore rejects duplicate event IDs, invalid substitutions and future events", () => {
  const d = createDemo();
  const g = d.games[0];
  g.events.push({ ...g.events[0] });
  assert.equal(workspaceSchema.safeParse(d).success, false);
  const d2 = createDemo();
  d2.games[0].events = [event("SUB", 10, "p9", "p8")];
  assert.equal(workspaceSchema.safeParse(d2).success, false);
  const d3 = createDemo();
  d3.games[0].remaining = 600;
  assert.equal(workspaceSchema.safeParse(d3).success, false);
});
test("season average uses games played and ignores scheduled games", () => {
  const d = createDemo();
  const rows = seasonStats(d.games, d.players);
  assert.equal(rows[0].gp, 8);
  assert.equal(rows[5].gp, 0);
  assert.equal(rows[0].stats.seconds, 8 * 2400);
});
test("CSV output prevents formula execution and quotes values", () => {
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell("藤井 悠真"), '"藤井 悠真"');
});
test("mid-game recording begins minutes at actual recording start", () => {
  const g = {
    ...base(),
    recordingStart: 300,
    remaining: 120,
    events: [event("2PM", 320)],
  };
  const a = aggregate(g);
  assert.equal(a.players.p1.seconds, 180);
  assert.equal(a.score, 2);
});
test("an event at a stopped clock still counts as an appearance", () => {
  const d = createDemo();
  const g = {
    ...base(),
    status: "finished" as const,
    remaining: 600,
    events: [event("2PM", 0)],
  };
  const row = seasonStats([g], d.players)[0];
  assert.equal(row.gp, 1);
  assert.equal(row.stats.pts, 2);
  assert.equal(row.stats.seconds, 0);
});
