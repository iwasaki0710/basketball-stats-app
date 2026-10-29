import { Workspace, Game, Play, workspaceSchema } from "./model";
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sorted(v)]),
    );
  return value;
}
export function canonical(value: unknown) {
  return JSON.stringify(sorted(value));
}
/** Clock ticks do not make a writer dirty; the absolute deadline is the source of truth. */
export function fingerprint(w: Workspace) {
  return canonical({
    ...w,
    games: w.games.map((g) => (g.clockTarget ? { ...g, remaining: 0 } : g)),
  });
}
export class MergeConflict extends Error {}
function pick<T>(
  base: T | undefined,
  ours: T | undefined,
  theirs: T | undefined,
  label: string,
): T | undefined {
  if (canonical(ours) === canonical(theirs)) return ours;
  if (canonical(ours) === canonical(base)) return theirs;
  if (canonical(theirs) === canonical(base)) return ours;
  throw new MergeConflict(`${label} が両方の端末で変更されました`);
}
function entities<T extends { id: string }>(
  base: T[],
  ours: T[],
  theirs: T[],
  label: string,
  merge?: (b: T, o: T, t: T) => T,
) {
  const b = new Map(base.map((v) => [v.id, v])),
    o = new Map(ours.map((v) => [v.id, v])),
    t = new Map(theirs.map((v) => [v.id, v]));
  return [...new Set([...b.keys(), ...t.keys(), ...o.keys()])].flatMap((id) => {
    const bb = b.get(id),
      oo = o.get(id),
      tt = t.get(id);
    const result =
      bb && oo && tt && merge ? merge(bb, oo, tt) : pick(bb, oo, tt, label);
    return result ? [result] : [];
  });
}
function fields<T extends object>(b: T, o: T, t: T, label: string): T {
  const keys = new Set([
    ...Object.keys(b),
    ...Object.keys(o),
    ...Object.keys(t),
  ]);
  return Object.fromEntries(
    [...keys].map((k) => [
      k,
      pick(b[k as keyof T], o[k as keyof T], t[k as keyof T], label),
    ]),
  ) as T;
}
function mergeGame(base: Game, ours: Game, theirs: Game): Game {
  const normalize = (g: Game) => ({
    ...g,
    events: [],
    ...(g.clockTarget ? { remaining: 0 } : {}),
  });
  const meta = fields(
    normalize(base),
    normalize(ours),
    normalize(theirs),
    `試合「${ours.opponent}」の設定`,
  );
  const old = new Set(base.events.map((e) => e.id)),
    oursNew = ours.events.filter((e) => !old.has(e.id)),
    theirsNew = theirs.events.filter((e) => !old.has(e.id));
  for (const a of oursNew)
    for (const b of theirsNew)
      if (
        a.id !== b.id &&
        a.elapsed === b.elapsed &&
        (a.kind === "SUB" || b.kind === "SUB")
      )
        throw new MergeConflict(
          "同じ時刻の交代と別端末のプレーは順序を確認してください",
        );
  const events = entities<Play>(
    base.events,
    ours.events,
    theirs.events,
    "同じプレー",
  );
  // Preserve every branch's same-clock order using a DAG; never guess across a cycle.
  const byId = new Map(events.map((e) => [e.id, e])),
    edges = new Map(events.map((e) => [e.id, new Set<string>()])),
    degree = new Map(events.map((e) => [e.id, 0]));
  for (const branch of [base.events, theirs.events, ours.events]) {
    const surviving = branch.filter((e) => byId.has(e.id));
    for (let i = 1; i < surviving.length; i++) {
      const from = byId.get(surviving[i - 1].id)!,
        to = byId.get(surviving[i].id)!;
      if (from.elapsed === to.elapsed && !edges.get(from.id)!.has(to.id)) {
        edges.get(from.id)!.add(to.id);
        degree.set(to.id, degree.get(to.id)! + 1);
      }
    }
  }
  const ordered: Play[] = [];
  let remaining = [...events].sort((a, b) => a.elapsed - b.elapsed);
  while (remaining.length) {
    const time = remaining[0].elapsed;
    const i = remaining.findIndex(
      (e) => e.elapsed === time && degree.get(e.id) === 0,
    );
    if (i < 0) throw new MergeConflict("同じ時刻のプレー順序が競合しています");
    const [e] = remaining.splice(i, 1);
    ordered.push(e);
    for (const id of edges.get(e.id)!) degree.set(id, degree.get(id)! - 1);
  }
  return {
    ...meta,
    remaining: meta.clockTarget
      ? Math.min(ours.remaining, theirs.remaining)
      : meta.remaining,
    events: ordered,
  };
}
export function mergeWorkspaces(
  base: Workspace,
  ours: Workspace,
  theirs: Workspace,
): Workspace {
  const merged: Workspace = {
    version: 1,
    teamName: pick(base.teamName, ours.teamName, theirs.teamName, "チーム名")!,
    season: pick(base.season, ours.season, theirs.season, "シーズン")!,
    players: entities(
      base.players,
      ours.players,
      theirs.players,
      "選手",
      (b, o, t) => fields(b, o, t, "選手情報"),
    ),
    games: entities(base.games, ours.games, theirs.games, "試合", mergeGame),
  };
  const checked = workspaceSchema.safeParse(merged);
  if (!checked.success)
    throw new MergeConflict(
      "交代・時刻・出場選手の整合性が保てません。端末のバックアップとクラウドを比較してください",
    );
  return checked.data;
}
