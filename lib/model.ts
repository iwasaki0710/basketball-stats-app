import { z } from "zod";
export const statKinds = [
  "2PM",
  "2PX",
  "3PM",
  "3PX",
  "FTM",
  "FTX",
  "OREB",
  "DREB",
  "AST",
  "STL",
  "BLK",
  "TOV",
  "PF",
  "OPP2",
  "OPP3",
  "OPPFT",
  "SUB",
] as const;
export type Kind = (typeof statKinds)[number];
export const labels: Record<Kind, string> = {
  "2PM": "2P 成功",
  "2PX": "2P 失敗",
  "3PM": "3P 成功",
  "3PX": "3P 失敗",
  FTM: "FT 成功",
  FTX: "FT 失敗",
  OREB: "オフェンスREB",
  DREB: "ディフェンスREB",
  AST: "アシスト",
  STL: "スティール",
  BLK: "ブロック",
  TOV: "ターンオーバー",
  PF: "ファウル",
  OPP2: "相手 2P",
  OPP3: "相手 3P",
  OPPFT: "相手 FT",
  SUB: "選手交代",
};
export interface Player {
  id: string;
  name: string;
  number: number;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  year: number;
  height: number;
  season: string;
  photo?: string;
}
export interface Play {
  id: string;
  kind: Kind;
  playerId: string;
  quarter: number;
  elapsed: number;
  x?: number;
  y?: number;
  inId?: string;
  side?: "own" | "opponent";
}
export interface Game {
  id: string;
  opponent: string;
  date: string;
  venue: string;
  competition: string;
  season: string;
  home: boolean;
  status: "scheduled" | "live" | "finished";
  quarterSeconds: number;
  quarters: number;
  starters: string[];
  roster: string[];
  events: Play[];
  quarter: number;
  remaining: number;
  recordingStart?: number;
  clockTarget?: number;
  opponentStatsComplete?: boolean;
}
export interface Workspace {
  version: 1;
  teamName: string;
  season: string;
  players: Player[];
  games: Game[];
}
const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  number: z.number().int().min(0).max(99),
  position: z.enum(["PG", "SG", "SF", "PF", "C"]),
  year: z.number().int().min(1).max(6),
  height: z.number().int().min(100).max(250),
  season: z.string().min(1),
  photo: z
    .string()
    .max(100000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
    .optional(),
});
const playSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(statKinds),
  playerId: z.string(),
  quarter: z.number().int().min(1).max(20),
  elapsed: z.number().min(0),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  inId: z.string().optional(),
  side: z.enum(["own", "opponent"]).optional(),
});
const gameSchema = z.object({
  id: z.string().min(1),
  opponent: z.string().min(1).max(100),
  date: z.string().refine((v) => Number.isFinite(Date.parse(v))),
  venue: z.string().max(100),
  competition: z.string().max(100),
  season: z.string(),
  home: z.boolean(),
  status: z.enum(["scheduled", "live", "finished"]),
  quarterSeconds: z.number().int().min(60).max(1200),
  quarters: z.number().int().min(1).max(8),
  starters: z.array(z.string()).length(5),
  roster: z.array(z.string()),
  events: z.array(playSchema).max(100000),
  quarter: z.number().int().min(1).max(20),
  remaining: z.number().int().min(0).max(1200),
  recordingStart: z.number().min(0).optional(),
  clockTarget: z.number().int().min(0).optional(),
  opponentStatsComplete: z.boolean().optional(),
});
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    teamName: z.string().min(1).max(80),
    season: z.string().min(1),
    players: z.array(playerSchema).max(100),
    games: z.array(gameSchema).max(1000),
  })
  .superRefine((w, ctx) => {
    const ids = new Set(w.players.map((p) => p.id));
    if (
      w.players.some((p, i) =>
        w.players.some(
          (x, j) => j > i && x.season === p.season && x.number === p.number,
        ),
      )
    )
      ctx.addIssue({ code: "custom", message: "背番号が重複しています" });
    if (
      ids.size !== w.players.length ||
      new Set(w.games.map((g) => g.id)).size !== w.games.length
    )
      ctx.addIssue({ code: "custom", message: "ID が重複しています" });
    for (const g of w.games) {
      if (
        new Set(g.events.map((e) => e.id)).size !== g.events.length ||
        new Set(g.starters).size !== g.starters.length ||
        new Set(g.roster).size !== g.roster.length
      )
        ctx.addIssue({
          code: "custom",
          message: "試合内の ID が重複しています",
        });
      if ((g.recordingStart ?? 0) > gameElapsed(g))
        ctx.addIssue({ code: "custom", message: "記録開始時刻が不正です" });
      if (
        g.remaining > periodSeconds(g, g.quarter) ||
        g.events.some(
          (e) => e.elapsed > gameElapsed(g) || e.quarter > g.quarter,
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "時計とイベント時刻が一致しません",
        });
      if (
        g.roster.some((id) => !ids.has(id)) ||
        g.starters.some((id) => !g.roster.includes(id))
      )
        ctx.addIssue({ code: "custom", message: "出場選手が不正です" });
      const on = new Set(g.starters);
      let last = g.recordingStart ?? 0;
      for (const e of g.events) {
        if (
          (e.x === undefined) !== (e.y === undefined) ||
          (e.x !== undefined &&
            !(e.kind.startsWith("2P") || e.kind.startsWith("3P")))
        )
          ctx.addIssue({ code: "custom", message: "ショット位置が不正です" });
        if (
          e.elapsed < last ||
          e.elapsed > quarterEnd(g, e.quarter) ||
          e.elapsed < quarterStart(g, e.quarter)
        )
          ctx.addIssue({ code: "custom", message: "イベント時刻が不正です" });
        last = e.elapsed;
        if (e.kind === "SUB") {
          if (e.side === "opponent")
            ctx.addIssue({
              code: "custom",
              message: "相手の交代イベントは入力対象外です",
            });
          if (
            !on.has(e.playerId) ||
            !e.inId ||
            !g.roster.includes(e.inId) ||
            on.has(e.inId)
          )
            ctx.addIssue({ code: "custom", message: "交代履歴が不正です" });
          on.delete(e.playerId);
          if (e.inId) on.add(e.inId);
        } else if (!isOpponent(e) && !on.has(e.playerId))
          ctx.addIssue({
            code: "custom",
            message: "コート外の選手のイベントがあります",
          });
      }
    }
  });
export function periodSeconds(g: Game, q: number) {
  return q > g.quarters ? 300 : g.quarterSeconds;
}
export function quarterStart(g: Game, q: number) {
  return q <= g.quarters
    ? (q - 1) * g.quarterSeconds
    : g.quarters * g.quarterSeconds + (q - g.quarters - 1) * 300;
}
export function quarterEnd(g: Game, q: number) {
  return quarterStart(g, q) + periodSeconds(g, q);
}
export function gameElapsed(g: Game) {
  return quarterStart(g, g.quarter) + periodSeconds(g, g.quarter) - g.remaining;
}
export function points(kind: Kind) {
  return kind === "2PM" || kind === "OPP2"
    ? 2
    : kind === "3PM" || kind === "OPP3"
      ? 3
      : kind === "FTM" || kind === "OPPFT"
        ? 1
        : 0;
}
export interface Stats {
  pts: number;
  fgm: number;
  fga: number;
  twom: number;
  twoa: number;
  threem: number;
  threea: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  seconds: number;
  pm: number;
}
export const emptyStats = (): Stats => ({
  pts: 0,
  fgm: 0,
  fga: 0,
  twom: 0,
  twoa: 0,
  threem: 0,
  threea: 0,
  ftm: 0,
  fta: 0,
  oreb: 0,
  dreb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  tov: 0,
  pf: 0,
  seconds: 0,
  pm: 0,
});
export function isOpponent(e: Play) {
  return e.side === "opponent" || e.kind.startsWith("OPP");
}
export function addPlay(s: Stats, input: Play) {
  const kind =
    input.kind === "OPP2"
      ? "2PM"
      : input.kind === "OPP3"
        ? "3PM"
        : input.kind === "OPPFT"
          ? "FTM"
          : input.kind;
  const e = { ...input, kind };
  if (e.kind === "SUB") return;
  s.pts += points(e.kind);
  if (["2PM", "2PX", "3PM", "3PX"].includes(e.kind)) s.fga++;
  if (["2PM", "3PM"].includes(e.kind)) s.fgm++;
  if (e.kind.startsWith("2P")) s.twoa++;
  if (e.kind === "2PM") s.twom++;
  if (e.kind.startsWith("3P")) s.threea++;
  if (e.kind === "3PM") s.threem++;
  if (e.kind.startsWith("FT")) s.fta++;
  if (e.kind === "FTM") s.ftm++;
  const map: Partial<Record<Kind, keyof Stats>> = {
    OREB: "oreb",
    DREB: "dreb",
    AST: "ast",
    STL: "stl",
    BLK: "blk",
    TOV: "tov",
    PF: "pf",
  };
  const k = map[e.kind];
  if (k) s[k]++;
}
export function aggregate(g: Game, quarter?: number) {
  const players: Record<string, Stats> = Object.create(null);
  for (const id of g.roster) players[id] = emptyStats();
  let on = [...g.starters],
    last = g.recordingStart ?? 0,
    score = 0,
    opponent = 0;
  const team = emptyStats();
  const opponentTeam = emptyStats();
  const lineups: Record<
    string,
    { ids: string[]; seconds: number; pm: number }
  > = {};
  const line = () => {
    const key = [...on].sort().join(",");
    return lineups[key] ?? (lineups[key] = { ids: [...on], seconds: 0, pm: 0 });
  };
  const accrue = (end: number) => {
    const a = quarter ? Math.max(last, quarterStart(g, quarter)) : last;
    const b = quarter ? Math.min(end, quarterEnd(g, quarter)) : end;
    const dt = Math.max(0, b - a);
    for (const id of on) if (players[id]) players[id].seconds += dt;
    line().seconds += dt;
    last = end;
  };
  for (const e of g.events) {
    accrue(e.elapsed);
    if (e.kind === "SUB") {
      on = on.filter((id) => id !== e.playerId);
      if (e.inId) on.push(e.inId);
      continue;
    }
    if (quarter && e.quarter !== quarter) continue;
    const pts = points(e.kind),
      opp = isOpponent(e);
    if (opp) {
      opponent += pts;
      addPlay(opponentTeam, e);
    } else {
      score += pts;
      addPlay(team, e);
      if (players[e.playerId]) addPlay(players[e.playerId], e);
    }
    const pm = opp ? -pts : pts;
    for (const id of on) if (players[id]) players[id].pm += pm;
    line().pm += pm;
  }
  accrue(Math.max(last, gameElapsed(g)));
  return {
    team,
    opponentTeam,
    players,
    score,
    opponent,
    onCourt: on,
    lineups: Object.values(lineups),
  };
}
export function percent(m: number, a: number) {
  return a ? (100 * m) / a : 0;
}
export function metrics(s: Stats) {
  return {
    fg: percent(s.fgm, s.fga),
    three: percent(s.threem, s.threea),
    ft: percent(s.ftm, s.fta),
    efg: percent(s.fgm + 0.5 * s.threem, s.fga),
    ts: s.fga + 0.44 * s.fta ? (100 * s.pts) / (2 * (s.fga + 0.44 * s.fta)) : 0,
    astTo: s.tov ? s.ast / s.tov : null,
  };
}
export function seasonStats(games: Game[], players: Player[]) {
  return players.map((player) => {
    const s = emptyStats();
    let gp = 0;
    for (const g of games.filter((g) => g.status === "finished")) {
      const p = aggregate(g).players[player.id];
      if (
        p &&
        (p.seconds > 0 ||
          g.events.some(
            (e) =>
              (e.playerId === player.id &&
                e.kind !== "SUB" &&
                !isOpponent(e)) ||
              (e.kind === "SUB" && e.inId === player.id),
          ))
      ) {
        gp++;
        for (const k of Object.keys(s) as (keyof Stats)[]) s[k] += p[k];
      }
    }
    return { player, stats: s, gp };
  });
}
export function clock(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

/** The countdown deadline survives navigation, suspension and reload. */
export function clockAt(g: Game, now = Date.now()): Game {
  if (!g.clockTarget || g.status !== "live") return g;
  const remaining = Math.max(
    0,
    Math.min(
      periodSeconds(g, g.quarter),
      Math.ceil((g.clockTarget - now) / 1000),
    ),
  );
  return remaining === g.remaining ? g : { ...g, remaining };
}
export interface ScoringRun {
  side: "own" | "opponent";
  points: number;
  start: number;
  end: number;
}
export function scoringRuns(g: Game, quarter = 0): ScoringRun[] {
  const runs: ScoringRun[] = [];
  for (const e of g.events) {
    if (quarter && e.quarter !== quarter) continue;
    const n = points(e.kind);
    if (!n) continue;
    const side = isOpponent(e) ? "opponent" : "own",
      last = runs.at(-1);
    if (last?.side === side) {
      last.points += n;
      last.end = e.elapsed;
    } else runs.push({ side, points: n, start: e.elapsed, end: e.elapsed });
  }
  return runs;
}
