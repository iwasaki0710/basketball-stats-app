"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Trophy,
  Target,
  Activity,
  CalendarDays,
  MapPin,
  ChevronRight,
  Flame,
  TrendingUp,
} from "lucide-react";
import {
  Workspace,
  aggregate,
  seasonStats,
  percent,
  Game,
  isOpponent,
} from "@/lib/model";
import { Avatar, Panel, SectionLink, Empty } from "./ui";
import { Court, Trend } from "./charts";
export default function Dashboard({
  data,
  onGames,
  onLive,
  onPlayers,
  onAnalysis,
  onGame,
}: {
  data: Workspace;
  onGames: () => void;
  onLive: () => void;
  onPlayers: () => void;
  onAnalysis: () => void;
  onGame: (g: Game) => void;
}) {
  const [leaderMetric, setLeaderMetric] = useState<
    "pts" | "reb" | "ast" | "fg"
  >("pts");
  const leaderValue = (p: ReturnType<typeof seasonStats>[number]) =>
    leaderMetric === "fg"
      ? percent(p.stats.fgm, p.stats.fga)
      : leaderMetric === "reb"
        ? (p.stats.oreb + p.stats.dreb) / (p.gp || 1)
        : p.stats[leaderMetric] / (p.gp || 1);
  const games = data.games.filter((g) => g.season === data.season),
    finished = games
      .filter((g) => g.status === "finished")
      .sort((a, b) => a.date.localeCompare(b.date));
  const n = finished.length;
  const totals = finished.map(aggregateGame);
  const wins = totals.filter((s) => s.score > s.opponent).length;
  const draws = totals.filter((s) => s.score === s.opponent).length;
  const avg = (k: "score" | "opponent") =>
    n ? totals.reduce((a, s) => a + s[k], 0) / n : 0;
  const players = seasonStats(finished, data.players)
    .filter((p) => p.gp)
    .sort((a, b) => b.stats.pts / b.gp - a.stats.pts / a.gp);
  const shots = finished
    .flatMap((g) => g.events)
    .filter((e) => e.x !== undefined && !isOpponent(e));
  const fgm = totals.reduce((a, s) => a + s.team.fgm, 0),
    fga = totals.reduce((a, s) => a + s.team.fga, 0);
  const next = games
    .filter((g) => g.status !== "finished")
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const recent = finished.slice(-5).reverse();
  const totalPts = totals.reduce((a, s) => a + s.score, 0);
  const three = totals.reduce((a, s) => a + s.team.threem * 3, 0),
    two = totals.reduce((a, s) => a + s.team.twom * 2, 0),
    ft = totalPts - three - two;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-dot" /> TEAM OVERVIEW
          </div>
          <h1>
            チームダッシュボード<span className="title-dot">.</span>
          </h1>
          <p>すべてのプレーを、次の勝利につなげよう。</p>
        </div>
        <button className="primary" onClick={onLive}>
          <Activity size={17} />
          試合を記録する
          <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="season-strip">
        <span className="season-pill">
          <span /> {data.season} SEASON
        </span>
        <span>
          {data.teamName}{" "}
          <span className="muted">/ 男子バスケットボール部</span>
        </span>
        <span className="strip-right">
          <span className="tiny-dot" /> ローカル自動保存
        </span>
      </div>
      <div className="metric-grid">
        <Metric
          label="シーズン成績"
          value={`${wins}`}
          suffix={`勝 ${n - wins - draws}敗${draws ? ` ${draws}分` : ``}`}
          detail={`${n} GAMES PLAYED`}
          icon={<Trophy size={18} />}
          bottom={
            <div className="form-dots">
              {finished.slice(-5).map((g) => {
                const s = aggregate(g);
                return (
                  <span
                    key={g.id}
                    className={s.score > s.opponent ? "win" : "loss"}
                  >
                    {s.score > s.opponent
                      ? "W"
                      : s.score === s.opponent
                        ? "D"
                        : "L"}
                  </span>
                );
              })}
            </div>
          }
        />
        <Metric
          label="勝率"
          value={percent(wins, n).toFixed(1)}
          suffix="%"
          detail="WIN PERCENTAGE"
          icon={<TrendingUp size={18} />}
          bottom={
            <span className="metric-note">
              {wins} 勝 / {n} 試合
            </span>
          }
        />
        <Metric
          label="平均得点"
          value={avg("score").toFixed(1)}
          suffix="PTS"
          detail="POINTS PER GAME"
          icon={<Target size={18} />}
          bottom={
            <span className="metric-note accent">
              <ArrowUpRight size={14} /> 得失点差{" "}
              {avg("score") - avg("opponent") >= 0 ? "+" : ""}
              {(avg("score") - avg("opponent")).toFixed(1)}
            </span>
          }
        />
        <Metric
          label="平均失点"
          value={avg("opponent").toFixed(1)}
          suffix="PTS"
          detail="OPPONENT POINTS PER GAME"
          icon={<Activity size={18} />}
          bottom={
            <span className="metric-note">
              ディフェンスから、流れをつくる。
            </span>
          }
        />
      </div>
      <div className="team-average-strip">
        <span>TEAM AVERAGES</span>
        {[
          [
            "REB",
            n
              ? (
                  totals.reduce((a, s) => a + s.team.oreb + s.team.dreb, 0) / n
                ).toFixed(1)
              : "—",
          ],
          [
            "AST",
            n
              ? (totals.reduce((a, s) => a + s.team.ast, 0) / n).toFixed(1)
              : "—",
          ],
          [
            "TOV",
            n
              ? (totals.reduce((a, s) => a + s.team.tov, 0) / n).toFixed(1)
              : "—",
          ],
          ["FG%", percent(fgm, fga).toFixed(1)],
          [
            "3P%",
            percent(
              totals.reduce((a, s) => a + s.team.threem, 0),
              totals.reduce((a, s) => a + s.team.threea, 0),
            ).toFixed(1),
          ],
          [
            "FT%",
            percent(
              totals.reduce((a, s) => a + s.team.ftm, 0),
              totals.reduce((a, s) => a + s.team.fta, 0),
            ).toFixed(1),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="dashboard-main">
        <Panel
          title="得点・失点の推移"
          subtitle="試合ごとのパフォーマンスを振り返る"
          action={
            <div className="chart-legend">
              <span>
                <i className="green" />
                得点
              </span>
              <span>
                <i />
                失点
              </span>
            </div>
          }
        >
          <div className="chart-summary">
            <strong>
              {avg("score").toFixed(1)}
              <small> PTS</small>
            </strong>
            <span>シーズン平均得点</span>
            <button onClick={onAnalysis} className="chart-period">
              シーズン全体 <ChevronRight size={13} />
            </button>
          </div>
          {n ? (
            <Trend games={finished} />
          ) : (
            <Empty text="試合を記録すると推移を表示します。" />
          )}
        </Panel>
        <Panel
          title="次の試合"
          action={<CalendarDays size={17} className="muted" />}
          className="next-game"
        >
          {next ? (
            <>
              <div className="competition-tag">{next.competition}</div>
              <div className="matchup">
                <div>
                  <div className="team-emblem">
                    A<span>TECH</span>
                  </div>
                  <strong>{data.teamName}</strong>
                  <small>{next.home ? "HOME" : "AWAY"}</small>
                </div>
                <span className="vs">VS</span>
                <div>
                  <div className="team-emblem opponent">
                    {next.opponent.slice(0, 1)}
                    <span>UNIV.</span>
                  </div>
                  <strong>{next.opponent}</strong>
                  <small>{next.home ? "AWAY" : "HOME"}</small>
                </div>
              </div>
              <div className="match-info">
                <span>
                  <CalendarDays size={14} />
                  {new Date(next.date).toLocaleDateString("ja-JP", {
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  })}{" "}
                  <b>{next.date.slice(11, 16)}</b>
                </span>
                <span>
                  <MapPin size={14} />
                  {next.venue || "会場未定"}
                </span>
              </div>
              <button className="secondary full" onClick={() => onGame(next)}>
                試合詳細・記録へ <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <Empty text="試合一覧から次の試合を登録しましょう。" />
          )}
        </Panel>
      </div>
      <div className="dashboard-secondary">
        <Panel
          title="最近の試合"
          subtitle="RECENT GAMES"
          action={<SectionLink onClick={onGames}>すべての試合</SectionLink>}
        >
          <div className="table-scroll">
            <table className="games-table">
              <thead>
                <tr>
                  <th>試合日 / 対戦相手</th>
                  <th>結果</th>
                  <th>スコア</th>
                  <th className="desktop-cell">大会</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.map((g) => {
                  const s = aggregate(g),
                    w = s.score > s.opponent;
                  return (
                    <tr
                      key={g.id}
                      onClick={() => onGame(g)}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && onGame(g)}
                    >
                      <td>
                        <div className="opponent-cell">
                          <span className="date-box">
                            {new Date(g.date)
                              .toLocaleDateString("en-US", { month: "short" })
                              .toUpperCase()}
                            <b>{Number(g.date.slice(8, 10))}</b>
                          </span>
                          <div>
                            <strong>{g.opponent}</strong>
                            <small>
                              {g.home ? "HOME" : "AWAY"}{" "}
                              <span>· {g.venue}</span>
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`result ${w ? "win" : "loss"}`}>
                          {w ? "WIN" : s.score === s.opponent ? "DRAW" : "LOSS"}
                        </span>
                      </td>
                      <td className="score-cell">
                        <strong>{s.score}</strong>
                        <span> – </span>
                        {s.opponent}
                      </td>
                      <td className="muted desktop-cell">{g.competition}</td>
                      <td>
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!n && <Empty text="記録した試合がここに表示されます。" />}
          </div>
        </Panel>
        <Panel
          title={
            {
              pts: "スコアリングリーダー",
              reb: "リバウンドリーダー",
              ast: "アシストリーダー",
              fg: "FG 成功率リーダー",
            }[leaderMetric]
          }
          subtitle={leaderMetric === "fg" ? "FG MADE / ATTEMPTED" : "PER GAME"}
          action={<SectionLink onClick={onPlayers}>選手一覧</SectionLink>}
        >
          <div className="leaderboard-tabs">
            {(
              [
                ["pts", "得点"],
                ["reb", "REB"],
                ["ast", "AST"],
                ["fg", "FG%"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={leaderMetric === key ? "selected" : ""}
                onClick={() => setLeaderMetric(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="leader-list">
            {[...players]
              .sort((a, b) => leaderValue(b) - leaderValue(a))
              .slice(0, 5)
              .map((p, i) => (
                <button
                  key={p.player.id}
                  onClick={onPlayers}
                  className="leader-row"
                >
                  <span className={`rank ${i === 0 ? "first" : ""}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Avatar name={p.player.name} number={p.player.number} />
                  <span className="leader-name">
                    <strong>{p.player.name}</strong>
                    <small>
                      #{p.player.number}{" "}
                      <span>
                        {" "}
                        / {p.player.position} · {p.player.year}年
                      </span>
                    </small>
                  </span>
                  <span className="leader-score">
                    {leaderValue(p).toFixed(1)}
                    <small>
                      {leaderMetric.toUpperCase()}
                      {leaderMetric === "fg" ? "%" : ""}
                    </small>
                  </span>
                </button>
              ))}
          </div>
          {!players.length && (
            <Empty text="試合終了後にランキングを表示します。" />
          )}
        </Panel>
      </div>
      <div className="dashboard-bottom">
        <Panel
          title="チームのショットマップ"
          subtitle={`${shots.length} SHOTS · ${data.season} SEASON`}
          action={<SectionLink onClick={onAnalysis}>詳細分析</SectionLink>}
        >
          <div className="shot-preview">
            <Court events={shots} />
            <div>
              <span className="eyebrow">FIELD GOAL</span>
              <strong className="big-percentage">
                {percent(fgm, fga).toFixed(1)}
                <small>%</small>
              </strong>
              <p>
                {fgm} / {fga} 成功
              </p>
              <div className="shot-legend">
                <span>
                  <i className="made" />
                  成功
                </span>
                <span>
                  <i className="missed" />
                  失敗
                </span>
              </div>
              <span className="hint">すべて同じ攻撃方向で表示</span>
            </div>
          </div>
        </Panel>
        <Panel title="得点構成" subtitle="SCORING BREAKDOWN">
          <div className="scoring-layout">
            <div
              className="donut"
              style={{
                background: `conic-gradient(#c1f36b 0 ${percent(two, totalPts)}%, #83a0e8 ${percent(two, totalPts)}% ${percent(two + three, totalPts)}%, #647082 ${percent(two + three, totalPts)}% 100%)`,
              }}
            >
              <div>
                <span>TOTAL POINTS</span>
                <strong>{totalPts.toLocaleString()}</strong>
              </div>
            </div>
            <div className="scoring-legend">
              {[
                ["2ポイント", two, "lime"],
                ["3ポイント", three, "blue"],
                ["フリースロー", ft, "gray"],
              ].map(([label, val, c]) => (
                <div key={label}>
                  <span>
                    <i className={String(c)} />
                    {label}
                  </span>
                  <strong>
                    {percent(Number(val), totalPts).toFixed(1)}
                    <small>%</small>
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
      <div className="insight-banner">
        <span className="insight-icon">
          <Flame size={20} />
        </span>
        <div>
          <strong>数字の先に、チームの可能性がある。</strong>
          <p>試合を記録して、あなたのチームだけのインサイトを見つけよう。</p>
        </div>
        <button className="text-link" onClick={onAnalysis}>
          シーズン分析を見る <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
function aggregateGame(g: Game) {
  return aggregate(g);
}
function Metric({
  label,
  value,
  suffix,
  detail,
  icon,
  bottom,
}: {
  label: string;
  value: string;
  suffix: string;
  detail: string;
  icon: React.ReactNode;
  bottom: React.ReactNode;
}) {
  return (
    <section className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        <span>{suffix}</span>
      </div>
      <div className="metric-detail">{detail}</div>
      <div className="metric-bottom">{bottom}</div>
    </section>
  );
}
