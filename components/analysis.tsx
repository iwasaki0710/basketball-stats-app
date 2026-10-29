"use client";
import { useState } from "react";
import { Download, Printer, Info } from "lucide-react";
import {
  Workspace,
  aggregate,
  emptyStats,
  Stats,
  metrics,
  percent,
  seasonStats,
  clock,
  Game,
  isOpponent,
} from "@/lib/model";
import { download, csvCell } from "@/lib/storage";
import { Panel, Empty } from "./ui";
import {
  OpponentRecords,
  TeamComparison,
  TacticalWindows,
  RunsChart,
} from "./advanced-analysis";
import {
  Court,
  Trend,
  ComparisonChart,
  RadarComparison,
  MetricTrend,
} from "./charts";
export default function Analysis({
  data,
  gameId,
  onSelect,
}: {
  data: Workspace;
  gameId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [quarter, setQuarter] = useState(0),
    [player, setPlayer] = useState("all"),
    [compare, setCompare] = useState<string[]>(
      data.players.slice(0, 3).map((p) => p.id),
    ),
    [rank, setRank] = useState("pts"),
    [tab, setTab] = useState("overview");
  const seasonGames = data.games.filter(
    (g) => g.season === data.season && g.status === "finished",
  );
  const game = data.games.find((g) => g.id === gameId);
  const games = game ? [game] : seasonGames;
  const aggregations = games.map((g) => aggregate(g, quarter || undefined));
  const total = emptyStats();
  for (const a of aggregations)
    for (const k of Object.keys(total) as (keyof Stats)[])
      total[k] += a.team[k];
  const m = metrics(total),
    n = games.length;
  const players = seasonStats(
    games.map((g) => ({ ...g, status: "finished" })),
    data.players.filter((p) => p.season === data.season),
  );
  const filteredPlayers = players
    .map((row) => {
      const s = emptyStats();
      for (const a of aggregations) {
        const p = a.players[row.player.id];
        if (p) for (const k of Object.keys(s) as (keyof Stats)[]) s[k] += p[k];
      }
      return { ...row, stats: s };
    })
    .filter((p) => p.gp || p.stats.seconds);
  const events = games
    .flatMap((g) => g.events)
    .filter(
      (e) =>
        (!quarter || e.quarter === quarter) &&
        (player === "all" || e.playerId === player),
    );
  const shots = events.filter(
    (e) =>
      !isOpponent(e) &&
      e.x !== undefined &&
      (e.kind.startsWith("2P") || e.kind.startsWith("3P")),
  );
  const top = [...filteredPlayers].sort((a, b) => {
    const val = (p: typeof a) =>
      rank === "fg"
        ? metrics(p.stats).fg
        : rank === "reb"
          ? (p.stats.oreb + p.stats.dreb) / (p.gp || 1)
          : p.stats[rank as "pts" | "ast"] / (p.gp || 1);
    return val(b) - val(a);
  });
  const exportCsv = () => {
    const header = [
      "選手",
      "背番号",
      "試合数",
      "PTS",
      "REB",
      "OREB",
      "DREB",
      "AST",
      "STL",
      "BLK",
      "TOV",
      "PF",
      "MIN",
      "FGM",
      "FGA",
      "3PM",
      "3PA",
      "FTM",
      "FTA",
      "FG%",
      "eFG%",
      "TS%",
      "PlusMinus",
    ];
    const rows = filteredPlayers.map((p) => {
      const s = p.stats;
      return [
        p.player.name,
        p.player.number,
        p.gp,
        s.pts,
        s.oreb + s.dreb,
        s.oreb,
        s.dreb,
        s.ast,
        s.stl,
        s.blk,
        s.tov,
        s.pf,
        (s.seconds / 60).toFixed(1),
        s.fgm,
        s.fga,
        s.threem,
        s.threea,
        s.ftm,
        s.fta,
        metrics(s).fg.toFixed(1),
        metrics(s).efg.toFixed(1),
        metrics(s).ts.toFixed(1),
        s.pm,
      ];
    });
    download(
      `courtvision-${data.season}-${game?.opponent ?? "season"}.csv`,
      "\uFEFF" +
        [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
  };
  const points = aggregations.reduce((v, a) => v + a.score, 0);
  const wins = games.filter(
      (g) =>
        g.status === "finished" && aggregate(g).score > aggregate(g).opponent,
    ),
    losses = games.filter(
      (g) =>
        g.status === "finished" && aggregate(g).score < aggregate(g).opponent,
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PERFORMANCE LAB</div>
          <h1>
            {game ? "試合分析" : "チーム分析"}
            <span className="title-dot">.</span>
          </h1>
          <p>
            {game
              ? `${game.date.slice(0, 10)} / vs ${game.opponent}`
              : "データから、次の一手を見つける。"}
          </p>
        </div>
        <div className="heading-actions">
          <button className="secondary" onClick={exportCsv}>
            <Download size={15} />
            CSV出力
          </button>
          <button className="secondary" onClick={() => window.print()}>
            <Printer size={15} />
            印刷
          </button>
        </div>
      </div>
      <div className="analysis-filters">
        <select
          aria-label="分析対象試合"
          value={gameId ?? "all"}
          onChange={(e) => {
            onSelect(e.target.value === "all" ? null : e.target.value);
            setQuarter(0);
          }}
        >
          <option value="all">{data.season} シーズン全体</option>
          {data.games
            .filter((g) => g.season === data.season)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.date.slice(5, 10)} vs {g.opponent}
                {g.status !== "finished" ? "（途中記録）" : ""}
              </option>
            ))}
        </select>
        <select
          aria-label="クォーターで絞り込み"
          value={quarter}
          onChange={(e) => setQuarter(Number(e.target.value))}
        >
          <option value="0">すべてのクォーター</option>
          {Array.from(
            {
              length: Math.max(
                game?.quarters ?? 4,
                ...games.map((g) => g.quarter),
              ),
            },
            (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1 > (game?.quarters ?? 4)
                  ? `OT${i + 1 - (game?.quarters ?? 4)}`
                  : `${i + 1}Q`}
              </option>
            ),
          )}
        </select>
        <span className="muted">
          {n} GAMES · {data.season} SEASON
        </span>
      </div>
      <div className="tabs">
        {[
          ["overview", "パフォーマンス"],
          ["players", "選手比較"],
          ["tactics", "戦術・ラインナップ"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <>
          <div className="analysis-metrics">
            {[
              ["平均得点", n ? (points / n).toFixed(1) : "—", "PTS"],
              ["FG 成功率", total.fga ? m.fg.toFixed(1) : "—", "%"],
              ["実効FG率", total.fga ? m.efg.toFixed(1) : "—", "eFG%"],
              [
                "トゥルーシュート率",
                total.fga || total.fta ? m.ts.toFixed(1) : "—",
                "TS%",
              ],
              [
                "平均リバウンド",
                n ? ((total.oreb + total.dreb) / n).toFixed(1) : "—",
                "REB",
              ],
              ["AST / TO", m.astTo?.toFixed(2) ?? "—", "RATIO"],
            ].map(([label, val, unit]) => (
              <div className="panel analysis-metric" key={label}>
                <small>{label}</small>
                <strong>
                  {val}
                  <span>{unit}</span>
                </strong>
              </div>
            ))}
          </div>
          <div className="analysis-two">
            <Panel
              title={game ? "クォーター別パフォーマンス" : "得点・失点の推移"}
              subtitle={game ? "QUARTER BREAKDOWN" : "SEASON TREND"}
            >
              {game ? <QuarterTable games={games} /> : <Trend games={games} />}
            </Panel>
            <Panel title="シュート効率" subtitle="SHOOTING EFFICIENCY">
              <div className="efficiency">
                {[
                  ["2P", total.twom, total.twoa, "lime"],
                  ["3P", total.threem, total.threea, "blue"],
                  ["FT", total.ftm, total.fta, "purple"],
                ].map(([name, made, attempts, color]) => (
                  <div key={name}>
                    <div>
                      <strong>{name}</strong>
                      <span>
                        {made} / {attempts}
                      </span>
                      <b>
                        {percent(Number(made), Number(attempts)).toFixed(1)}
                        <small>%</small>
                      </b>
                    </div>
                    <div className="progress-track">
                      <span
                        className={String(color)}
                        style={{
                          width: `${percent(Number(made), Number(attempts))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <div className="analysis-two">
            <Panel
              title="ショットチャート"
              subtitle="全試合で同じ攻撃方向に統一"
              action={
                <select
                  aria-label="ショット表示選手"
                  value={player}
                  onChange={(e) => setPlayer(e.target.value)}
                >
                  <option value="all">全選手</option>
                  {data.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number} {p.name}
                    </option>
                  ))}
                </select>
              }
            >
              <Court events={shots} />
              <p className="court-caption">
                ● 成功 / × 失敗 · 位置記録あり {shots.length} 本
              </p>
              <div className="zone-grid">
                {[
                  ["左サイド", 0, 33],
                  ["中央", 33, 67],
                  ["右サイド", 67, 101],
                ].map(([name, min, max]) => {
                  const ss = shots.filter(
                    (e) => e.x! >= Number(min) && e.x! < Number(max),
                  );
                  return (
                    <div key={name}>
                      <small>{name}</small>
                      <strong>
                        {ss.length
                          ? percent(
                              ss.filter((e) => e.kind.endsWith("M")).length,
                              ss.length,
                            ).toFixed(1)
                          : "—"}
                        %
                      </strong>
                      <span>{ss.length} 試投</span>
                    </div>
                  );
                })}
              </div>
              <p className="hint center">
                エリアはコート横幅の3等分。位置未記録のシュートは除外。
              </p>
            </Panel>
            <Panel
              title="選手ランキング"
              subtitle="PER GAME · 平均値で比較"
              action={
                <select
                  aria-label="ランキング指標"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                >
                  <option value="pts">得点</option>
                  <option value="reb">リバウンド</option>
                  <option value="ast">アシスト</option>
                  <option value="fg">FG%</option>
                </select>
              }
            >
              <div className="ranking-list">
                {top.slice(0, 7).map((p, i) => {
                  const v =
                    rank === "fg"
                      ? metrics(p.stats).fg
                      : rank === "reb"
                        ? (p.stats.oreb + p.stats.dreb) / (p.gp || 1)
                        : p.stats[rank as "pts" | "ast"] / (p.gp || 1);
                  return (
                    <div key={p.player.id}>
                      <span className="rank">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="ranking-player">
                        <strong>{p.player.name}</strong>
                        <small>
                          #{p.player.number} · {p.gp} GAMES
                        </small>
                      </span>
                      <strong className="accent">
                        {v.toFixed(1)}
                        {rank === "fg" ? "%" : ""}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
          <Panel
            title="ボックススコア"
            subtitle={game ? "GAME TOTALS" : "SEASON TOTALS"}
          >
            <BoxTable rows={filteredPlayers} />
          </Panel>
          <Panel title="チームスタッツの推移" subtitle="FG / REB / TOV / AST">
            <MetricTrend games={games} quarter={quarter} />
          </Panel>
          <TeamComparison
            games={games}
            quarter={quarter}
            teamName={data.teamName}
          />
          <OpponentRecords games={games} quarter={quarter} />
          <Panel title="クォーター・前後半の比較" subtitle="PERIOD ANALYSIS">
            <QuarterTable games={games} />
          </Panel>
          {!game && (
            <Panel
              title="勝利試合・敗北試合の比較"
              subtitle="試合数が異なるため1試合平均で表示"
            >
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>結果</th>
                      <th>試合数</th>
                      <th>得点</th>
                      <th>失点</th>
                      <th>REB</th>
                      <th>TOV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["勝利", wins],
                      ["敗北", losses],
                    ].map(([label, gs]) => {
                      const arr = gs as Game[];
                      const aa = arr.map((g) => aggregate(g));
                      return (
                        <tr key={String(label)}>
                          <td>{String(label)}</td>
                          <td>{arr.length}</td>
                          {[
                            (a: ReturnType<typeof aggregate>) => a.score,
                            (a: ReturnType<typeof aggregate>) => a.opponent,
                            (a: ReturnType<typeof aggregate>) =>
                              a.team.oreb + a.team.dreb,
                            (a: ReturnType<typeof aggregate>) => a.team.tov,
                          ].map((fn, i) => (
                            <td key={i}>
                              {arr.length
                                ? (
                                    aa.reduce((s, a) => s + fn(a), 0) /
                                    arr.length
                                  ).toFixed(1)
                                : "—"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          <Panel
            title="指標の計算方法"
            action={<Info size={16} className="muted" />}
          >
            <div className="formula-grid">
              <p>
                <b>eFG%</b> = (FGM + 0.5 × 3PM) / FGA × 100
              </p>
              <p>
                <b>TS%</b> = PTS / [2 × (FGA + 0.44 × FTA)] × 100
              </p>
              <p>
                <b>AST / TO</b> = AST / TOV（TOV が0なら未定義）
              </p>
              <p>
                <b>+/−</b> = 出場中の自チーム得点 − 相手得点
              </p>
              <p>
                <b>REB構成比</b> = OREB / (OREB + DREB)：
                {percent(total.oreb, total.oreb + total.dreb).toFixed(1)}%
              </p>
              <p>
                <b>参考・推定得点効率</b> = 100 × PTS / (FGA + 0.44 × FTA − OREB
                + TOV)：
                {total.fga + 0.44 * total.fta - total.oreb + total.tov > 0
                  ? (
                      (100 * total.pts) /
                      (total.fga + 0.44 * total.fta - total.oreb + total.tov)
                    ).toFixed(1)
                  : "—"}
              </p>
            </div>
            <p className="notice">
              0.44
              は推定係数です。推定得点効率は実測ポゼッションに基づく値ではありません。相手の詳細記録を有効にした試合では相手のスタッツも比較します。得点のみの過去試合から相手の試投数は推測しません。
            </p>
          </Panel>
        </>
      )}
      {tab === "players" && (
        <>
          <Panel
            title="比較する選手を選択"
            subtitle="2〜5人を選択 · 同一シーズンの1試合平均"
          >
            <div className="compare-picker">
              {data.players
                .filter((p) => p.season === data.season)
                .map((p) => (
                  <button
                    key={p.id}
                    disabled={!compare.includes(p.id) && compare.length >= 5}
                    className={compare.includes(p.id) ? "selected" : ""}
                    onClick={() =>
                      setCompare((s) =>
                        s.includes(p.id)
                          ? s.filter((id) => id !== p.id)
                          : [...s, p.id],
                      )
                    }
                  >
                    #{p.number} {p.name}
                  </button>
                ))}
            </div>
          </Panel>
          {compare.length >= 2 ? (
            <>
              <Panel title="得点・リバウンド・アシスト">
                <ComparisonChart
                  data={filteredPlayers
                    .filter((p) => compare.includes(p.player.id))
                    .map((p) => ({
                      name: p.player.name.split(" ")[0],
                      PTS: Number((p.stats.pts / (p.gp || 1)).toFixed(1)),
                      REB: Number(
                        ((p.stats.oreb + p.stats.dreb) / (p.gp || 1)).toFixed(
                          1,
                        ),
                      ),
                      AST: Number((p.stats.ast / (p.gp || 1)).toFixed(1)),
                    }))}
                />
              </Panel>
              <Panel title="プレースタイル比較">
                <RadarComparison
                  rows={filteredPlayers
                    .filter((p) => compare.includes(p.player.id))
                    .map((p) => ({
                      name: p.player.name,
                      pts: p.stats.pts / (p.gp || 1),
                      reb: (p.stats.oreb + p.stats.dreb) / (p.gp || 1),
                      ast: p.stats.ast / (p.gp || 1),
                      fg: metrics(p.stats).fg,
                      minutes: p.stats.seconds / 60 / (p.gp || 1),
                    }))}
                />
              </Panel>
              <Panel title="選手比較表" subtitle="PER GAME / PER 40 MINUTES">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>選手</th>
                        <th>GP</th>
                        <th>PTS</th>
                        <th>REB</th>
                        <th>AST</th>
                        <th>TOV</th>
                        <th>FG%</th>
                        <th>MIN</th>
                        <th>+/−</th>
                        <th>PTS / 40MIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers
                        .filter((p) => compare.includes(p.player.id))
                        .map((p) => {
                          const s = p.stats,
                            gp = p.gp || 1;
                          return (
                            <tr key={p.player.id}>
                              <td>{p.player.name}</td>
                              <td>{p.gp}</td>
                              {[
                                s.pts / gp,
                                (s.oreb + s.dreb) / gp,
                                s.ast / gp,
                                s.tov / gp,
                                metrics(s).fg,
                                s.seconds / 60 / gp,
                                s.pm / gp,
                                s.seconds ? (s.pts / (s.seconds / 60)) * 40 : 0,
                              ].map((v, i) => (
                                <td key={i}>{v.toFixed(1)}</td>
                              ))}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          ) : (
            <Empty text="比較する選手を2人以上選択してください。" />
          )}
        </>
      )}
      {tab === "tactics" && (
        <>
          <RunsChart games={games} quarter={quarter} />
          <TacticalWindows games={games} data={data} quarter={quarter} />
          <div className="analysis-two">
            <Panel title="データから読み取れる事実" subtitle="OBSERVATIONS">
              <div className="insight-content">
                <p>
                  <span className="accent">01</span> 3Pによる得点の割合は{" "}
                  <b>{percent(total.threem * 3, total.pts).toFixed(1)}%</b>。
                </p>
                <p>
                  <span className="accent">02</span> ターンオーバーは1試合平均{" "}
                  <b>{n ? (total.tov / n).toFixed(1) : "—"}回</b>。
                </p>
                <p>
                  <span className="accent">03</span>{" "}
                  オフェンスリバウンドは全リバウンドの{" "}
                  <b>
                    {percent(total.oreb, total.oreb + total.dreb).toFixed(1)}%
                  </b>
                  。
                </p>
              </div>
            </Panel>
            <Panel
              title="ミーティングで検討する仮説"
              subtitle="HYPOTHESES · 因果関係は未検証"
            >
              <div className="insight-content">
                <p>
                  3Pの試投比率と成功率を見ながら、ペイントへのアタックとの配分を検討する。
                </p>
                <p>
                  ターンオーバーが集中する時間帯の映像を確認し、ボール運びとパス選択を振り返る。
                </p>
                <p className="hint">
                  記録データだけで戦術の有効性を断定しません。
                </p>
              </div>
            </Panel>
          </div>
          <Panel
            title="ラインナップ別 Plus / Minus"
            subtitle="交代順序と得点イベントから算出 · 同じ5人を合算"
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ラインナップ</th>
                    <th>MIN</th>
                    <th>+/−</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(
                    aggregations
                      .flatMap((a) => a.lineups)
                      .reduce<
                        Record<
                          string,
                          { ids: string[]; seconds: number; pm: number }
                        >
                      >((acc, l) => {
                        const key = [...l.ids].sort().join(",");
                        if (!acc[key])
                          acc[key] = { ids: l.ids, seconds: 0, pm: 0 };
                        acc[key].seconds += l.seconds;
                        acc[key].pm += l.pm;
                        return acc;
                      }, {}),
                  )
                    .sort((a, b) => b.pm - a.pm)
                    .map((l, i) => (
                      <tr key={i}>
                        <td>
                          {l.ids
                            .map(
                              (id) =>
                                data.players.find((p) => p.id === id)?.name ??
                                id,
                            )
                            .join(" / ")}
                        </td>
                        <td>{clock(l.seconds)}</td>
                        <td className={l.pm >= 0 ? "accent" : "error-text"}>
                          {l.pm > 0 ? "+" : ""}
                          {l.pm}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="hint padding">
              出場時間と対戦条件が異なるため、+/−だけでラインナップの優劣は確定できません。
            </p>
          </Panel>
          <Panel
            title="連続得点・失点のラン"
            subtitle="各試合の得点イベントを順序で分析"
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>試合</th>
                    <th>最大連続得点</th>
                    <th>最大連続失点</th>
                    <th>最多TOVのQ</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => {
                    let own = 0,
                      away = 0,
                      maxOwn = 0,
                      maxAway = 0;
                    for (const e of g.events) {
                      const pts =
                        e.kind === "2PM" || e.kind === "OPP2"
                          ? 2
                          : e.kind === "3PM" || e.kind === "OPP3"
                            ? 3
                            : e.kind === "FTM" || e.kind === "OPPFT"
                              ? 1
                              : 0;
                      if (!pts) continue;
                      if (isOpponent(e)) {
                        own = 0;
                        away += pts;
                        maxAway = Math.max(maxAway, away);
                      } else {
                        away = 0;
                        own += pts;
                        maxOwn = Math.max(maxOwn, own);
                      }
                    }
                    const qs = Array.from({ length: g.quarter }, (_, i) => ({
                      q: i + 1,
                      n: g.events.filter(
                        (e) =>
                          e.quarter === i + 1 &&
                          e.kind === "TOV" &&
                          !isOpponent(e),
                      ).length,
                    })).sort((a, b) => b.n - a.n);
                    return (
                      <tr key={g.id}>
                        <td>{g.opponent}</td>
                        <td>{maxOwn}–0</td>
                        <td>0–{maxAway}</td>
                        <td>
                          {qs[0]?.q}Q ({qs[0]?.n}回)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
      {!n && <Empty text="試合を記録すると分析データが表示されます。" />}
    </>
  );
}
function BoxTable({ rows }: { rows: ReturnType<typeof seasonStats> }) {
  return (
    <div className="table-scroll">
      <table className="compact-table">
        <thead>
          <tr>
            {[
              "選手",
              "GP",
              "PTS",
              "REB",
              "AST",
              "STL",
              "BLK",
              "TOV",
              "PF",
              "MIN",
              "FG",
              "3P",
              "FT",
              "FG%",
              "+/−",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const s = p.stats;
            return (
              <tr key={p.player.id}>
                <td>
                  <strong>
                    #{p.player.number} {p.player.name}
                  </strong>
                </td>
                {[
                  p.gp,
                  s.pts,
                  s.oreb + s.dreb,
                  s.ast,
                  s.stl,
                  s.blk,
                  s.tov,
                  s.pf,
                  clock(s.seconds),
                  `${s.fgm}/${s.fga}`,
                  `${s.threem}/${s.threea}`,
                  `${s.ftm}/${s.fta}`,
                  `${metrics(s).fg.toFixed(1)}%`,
                  s.pm,
                ].map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function QuarterTable({ games }: { games: Game[] }) {
  const regulation =
    games.length && games.every((g) => g.quarters === 2)
      ? 2
      : Math.max(4, ...games.map((g) => g.quarters));
  const max = Math.max(regulation, ...games.map((g) => g.quarter));
  const ranges = [
    ...Array.from({ length: max }, (_, i) => ({
      name: i + 1 > regulation ? `OT${i + 1 - regulation}` : `${i + 1}Q`,
      qs: [i + 1],
    })),
    {
      name: "前半",
      qs: Array.from({ length: Math.ceil(regulation / 2) }, (_, i) => i + 1),
    },
    {
      name: "後半",
      qs: Array.from(
        { length: Math.floor(regulation / 2) },
        (_, i) => Math.ceil(regulation / 2) + i + 1,
      ),
    },
  ];
  return (
    <div className="table-scroll">
      <table className="compact-table">
        <thead>
          <tr>
            <th>期間</th>
            <th>得点</th>
            <th>失点</th>
            <th>差</th>
            <th>FG%</th>
            <th>3P%</th>
            <th>FT%</th>
            <th>REB</th>
            <th>AST</th>
            <th>TOV</th>
          </tr>
        </thead>
        <tbody>
          {ranges.map((r) => {
            const a = games.flatMap((g) => r.qs.map((q) => aggregate(g, q)));
            const sum = (fn: (a: ReturnType<typeof aggregate>) => number) =>
              a.reduce((s, v) => s + fn(v), 0);
            return (
              <tr key={r.name}>
                <td>
                  <strong>{r.name}</strong>
                </td>
                <td>{sum((v) => v.score)}</td>
                <td>{sum((v) => v.opponent)}</td>
                <td className="accent">{sum((v) => v.score - v.opponent)}</td>
                <td>
                  {percent(
                    sum((v) => v.team.fgm),
                    sum((v) => v.team.fga),
                  ).toFixed(1)}
                </td>
                <td>
                  {percent(
                    sum((v) => v.team.threem),
                    sum((v) => v.team.threea),
                  ).toFixed(1)}
                </td>
                <td>
                  {percent(
                    sum((v) => v.team.ftm),
                    sum((v) => v.team.fta),
                  ).toFixed(1)}
                </td>
                <td>{sum((v) => v.team.oreb + v.team.dreb)}</td>
                <td>{sum((v) => v.team.ast)}</td>
                <td>{sum((v) => v.team.tov)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
