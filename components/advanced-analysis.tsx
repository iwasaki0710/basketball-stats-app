"use client";
import {
  Workspace,
  Game,
  aggregate,
  metrics,
  percent,
  clock,
  isOpponent,
  emptyStats,
  gameElapsed,
  scoringRuns,
  quarterStart,
  quarterEnd,
} from "@/lib/model";
import { Panel, Empty } from "./ui";
export function OpponentRecords({
  games,
  quarter = 0,
}: {
  games: Game[];
  quarter?: number;
}) {
  const finished = games.filter((g) => g.status === "finished");
  const names = [...new Set(finished.map((g) => g.opponent))];
  return (
    <Panel title="対戦相手別成績" subtitle="OPPONENT SCOUTING · 1試合平均">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "対戦相手",
                "試合",
                "勝",
                "敗",
                "分",
                "得点",
                "失点",
                "得失点差",
                "FG%",
                "REB",
                "TOV",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {names.map((name) => {
              const gs = finished.filter((g) => g.opponent === name),
                ss = gs.map((g) => aggregate(g, quarter || undefined)),
                sum = (f: (s: (typeof ss)[number]) => number) =>
                  ss.reduce((n, s) => n + f(s), 0);
              return (
                <tr key={name}>
                  <td>
                    <strong>{name}</strong>
                  </td>
                  <td>{gs.length}</td>
                  <td>
                    {
                      gs.filter(
                        (g) => aggregate(g).score > aggregate(g).opponent,
                      ).length
                    }
                  </td>
                  <td>
                    {
                      gs.filter(
                        (g) => aggregate(g).score < aggregate(g).opponent,
                      ).length
                    }
                  </td>
                  <td>
                    {
                      gs.filter(
                        (g) => aggregate(g).score === aggregate(g).opponent,
                      ).length
                    }
                  </td>
                  {[
                    (sum((s) => s.score) / gs.length).toFixed(1),
                    (sum((s) => s.opponent) / gs.length).toFixed(1),
                    (sum((s) => s.score - s.opponent) / gs.length).toFixed(1),
                    percent(
                      sum((s) => s.team.fgm),
                      sum((s) => s.team.fga),
                    ).toFixed(1),
                    (sum((s) => s.team.oreb + s.team.dreb) / gs.length).toFixed(
                      1,
                    ),
                    (sum((s) => s.team.tov) / gs.length).toFixed(1),
                  ].map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!names.length && (
        <Empty text="終了した試合の対戦相手別成績を表示します。" />
      )}
    </Panel>
  );
}
export function TeamComparison({
  games,
  quarter = 0,
  teamName,
}: {
  games: Game[];
  quarter?: number;
  teamName: string;
}) {
  const own = games.map((g) => aggregate(g, quarter || undefined).team),
    opponent = games.map(
      (g) => aggregate(g, quarter || undefined).opponentTeam,
    ),
    complete = games.length > 0 && games.every((g) => g.opponentStatsComplete);
  const sum = (list: typeof own) => {
    const result = emptyStats();
    for (const s of list)
      for (const k of Object.keys(s) as (keyof typeof s)[]) result[k] += s[k];
    return result;
  };
  const a = sum(own),
    b = sum(opponent);
  const rows: [string, string, string][] = [
    [
      "得点",
      String(
        games.reduce((n, g) => n + aggregate(g, quarter || undefined).score, 0),
      ),
      String(
        games.reduce(
          (n, g) => n + aggregate(g, quarter || undefined).opponent,
          0,
        ),
      ),
    ],
    ...(["REB", "AST", "STL", "BLK", "TOV", "PF"] as const).map(
      (k) =>
        [
          k,
          String(k === "REB" ? a.oreb + a.dreb : a[k.toLowerCase() as "ast"]),
          complete
            ? String(
                k === "REB" ? b.oreb + b.dreb : b[k.toLowerCase() as "ast"],
              )
            : "未記録",
        ] as [string, string, string],
    ),
    [
      "FG%",
      `${metrics(a).fg.toFixed(1)}%`,
      complete ? `${metrics(b).fg.toFixed(1)}%` : "未記録",
    ],
    [
      "3P%",
      `${metrics(a).three.toFixed(1)}%`,
      complete ? `${metrics(b).three.toFixed(1)}%` : "未記録",
    ],
    [
      "FT%",
      `${metrics(a).ft.toFixed(1)}%`,
      complete ? `${metrics(b).ft.toFixed(1)}%` : "未記録",
    ],
  ];
  return (
    <Panel title="チーム比較" subtitle="TEAM vs OPPONENT · 選択範囲の合計">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>指標</th>
              <th>{teamName}</th>
              <th>相手チーム</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, x, y]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{x}</td>
                <td>{y}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint padding">
        {complete
          ? `リバウンド獲得率：自チーム ${percent(a.oreb + a.dreb, a.oreb + a.dreb + b.oreb + b.dreb).toFixed(1)}% / 相手 ${percent(b.oreb + b.dreb, a.oreb + a.dreb + b.oreb + b.dreb).toFixed(1)}%`
          : "相手の詳細記録を有効にした試合だけで、成功率・リバウンドなどを比較します。過去の相手得点だけから試投数は推定しません。"}
      </p>
    </Panel>
  );
}
export function TacticalWindows({
  games,
  data,
  quarter = 0,
}: {
  games: Game[];
  data: Workspace;
  quarter?: number;
}) {
  return (
    <Panel
      title="時間帯別のプレー・出場選手"
      subtitle="2 MINUTE WINDOWS · Qをまたぐ区間を含む"
    >
      <div className="table-scroll advanced-scroll">
        <table>
          <thead>
            <tr>
              <th>試合 / 時間帯</th>
              <th>得点</th>
              <th>失点</th>
              <th>TOV</th>
              <th>出場選手</th>
            </tr>
          </thead>
          <tbody>
            {games.flatMap((g) => {
              const begin = quarter
                ? Math.max(g.recordingStart ?? 0, quarterStart(g, quarter))
                : (g.recordingStart ?? 0);
              const end = Math.min(
                gameElapsed(g),
                quarter ? quarterEnd(g, quarter) : gameElapsed(g),
              );
              return Array.from(
                { length: Math.max(0, Math.ceil((end - begin) / 120)) },
                (_, i) => {
                  const start = begin + i * 120,
                    events = g.events.filter(
                      (e) =>
                        e.elapsed >= start &&
                        (e.elapsed < Math.min(end, start + 120) ||
                          (start + 120 >= end && e.elapsed === end)) &&
                        (!quarter || e.quarter === quarter),
                    );
                  let on = [...g.starters];
                  for (const e of g.events) {
                    if (e.elapsed >= start) break;
                    if (e.kind === "SUB") {
                      on = on.filter((id) => id !== e.playerId);
                      if (e.inId) on.push(e.inId);
                    }
                  }
                  const participants = new Set(on);
                  for (const e of events)
                    if (e.kind === "SUB" && e.inId) participants.add(e.inId);
                  const point = (e: (typeof events)[number]) =>
                    e.kind === "2PM" || e.kind === "OPP2"
                      ? 2
                      : e.kind === "3PM" || e.kind === "OPP3"
                        ? 3
                        : e.kind === "FTM" || e.kind === "OPPFT"
                          ? 1
                          : 0;
                  return (
                    <tr key={`${g.id}-${i}`}>
                      <td>
                        {g.opponent}
                        <small>
                          {clock(start)}–{clock(Math.min(end, start + 120))}
                        </small>
                      </td>
                      <td>
                        {events
                          .filter((e) => !isOpponent(e))
                          .reduce((n, e) => n + point(e), 0)}
                      </td>
                      <td>
                        {events
                          .filter(isOpponent)
                          .reduce((n, e) => n + point(e), 0)}
                      </td>
                      <td>
                        {
                          events.filter(
                            (e) => !isOpponent(e) && e.kind === "TOV",
                          ).length
                        }
                      </td>
                      <td>
                        {[...participants]
                          .map(
                            (id) => data.players.find((p) => p.id === id)?.name,
                          )
                          .join(" / ")}
                      </td>
                    </tr>
                  );
                },
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
export function RunsChart({
  games,
  quarter = 0,
}: {
  games: Game[];
  quarter?: number;
}) {
  return (
    <Panel
      title="得点ランの可視化"
      subtitle="連続する得点イベント · 時刻は試合開始からの経過"
    >
      <div className="run-charts">
        {games.map((g) => {
          const runs = scoringRuns(g, quarter),
            max = Math.max(1, ...runs.map((r) => r.points));
          return (
            <div key={g.id}>
              <h4>
                {g.opponent} <small>{g.date.slice(0, 10)}</small>
              </h4>
              <div className="run-strip">
                {runs.map((r, i) => (
                  <div
                    key={i}
                    className={r.side}
                    title={`${r.side === "own" ? "自チーム" : "相手"} ${r.points}点 ${clock(r.start)}–${clock(r.end)}`}
                    style={{ height: `${18 + (r.points / max) * 65}px` }}
                  >
                    <strong>{r.points}</strong>
                    <small>{clock(r.start)}</small>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="court-caption">
        ライム：自チーム ／
        ピンク：相手。途中の無得点プレーではランはリセットされません。
      </p>
    </Panel>
  );
}
