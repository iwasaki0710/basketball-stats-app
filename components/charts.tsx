"use client";
import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  LineChart,
  Line,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { Game, Play, aggregate, points, metrics } from "@/lib/model";
export function Trend({ games }: { games: Game[] }) {
  const data = games
    .filter((g) => g.status === "finished")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => {
      const s = aggregate(g);
      return {
        date: `${Number(g.date.slice(5, 7))}/${Number(g.date.slice(8, 10))}`,
        得点: s.score,
        失点: s.opponent,
      };
    });
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 12, bottom: 0, left: -22 }}
        >
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c1f36b" stopOpacity={0.19} />
              <stop offset="100%" stopColor="#c1f36b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#242b33"
            vertical={false}
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#7d8795", fontSize: 11 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#7d8795", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: "#1b222c",
              border: "1px solid #374151",
              borderRadius: 10,
              color: "#fff",
            }}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="得点"
            stroke="#c1f36b"
            fill="url(#scoreFill)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#c1f36b", strokeWidth: 0 }}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="失点"
            stroke="#818b9d"
            fill="transparent"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 2, fill: "#818b9d", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ComparisonChart({
  data,
}: {
  data: { name: string; PTS: number; REB: number; AST: number }[];
}) {
  return (
    <div className="chart">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="#29313b" />
          <XAxis dataKey="name" tick={{ fill: "#8c96a4", fontSize: 11 }} />
          <YAxis tick={{ fill: "#8c96a4", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "#1b222c",
              border: "1px solid #374151",
              borderRadius: 10,
            }}
          />
          <Legend />
          <Bar
            isAnimationActive={false}
            dataKey="PTS"
            fill="#c1f36b"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="REB"
            fill="#64b8d4"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="AST"
            fill="#9e8bda"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Court({
  events = [],
  interactive = false,
  onPoint,
  selected,
}: {
  events?: Play[];
  interactive?: boolean;
  onPoint?: (x: number, y: number) => void;
  selected?: { x: number; y: number } | null;
}) {
  return (
    <svg
      className={`court ${interactive ? "interactive" : ""}`}
      viewBox="0 0 500 440"
      role={interactive ? "button" : "img"}
      aria-label={
        interactive
          ? "ショット位置を選択（タップまたは矢印キーで移動、Enterで確定）"
          : "ショットチャート"
      }
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interactive) return;
        const x = selected?.x ?? 50,
          y = selected?.y ?? 50;
        if (["Enter", " "].includes(e.key)) {
          e.preventDefault();
          onPoint?.(x, y);
        } else if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          onPoint?.(
            Math.max(
              0,
              Math.min(
                100,
                x +
                  (e.key === "ArrowRight" ? 3 : e.key === "ArrowLeft" ? -3 : 0),
              ),
            ),
            Math.max(
              0,
              Math.min(
                100,
                y + (e.key === "ArrowDown" ? 3 : e.key === "ArrowUp" ? -3 : 0),
              ),
            ),
          );
        }
      }}
      onClick={(e) => {
        if (!interactive) return;
        const b = e.currentTarget.getBoundingClientRect();
        const s = Math.min(b.width / 500, b.height / 440),
          ox = (b.width - 500 * s) / 2,
          oy = (b.height - 440 * s) / 2;
        onPoint?.(
          Math.max(
            0,
            Math.min(100, (((e.clientX - b.left - ox) / s - 20) / 460) * 100),
          ),
          Math.max(
            0,
            Math.min(100, (((e.clientY - b.top - oy) / s - 20) / 400) * 100),
          ),
        );
      }}
    >
      <defs>
        <linearGradient id="courtbg" x2="0" y2="1">
          <stop stopColor="#1c2925" />
          <stop offset="1" stopColor="#151f20" />
        </linearGradient>
        <pattern
          id="courtgrid"
          width="23"
          height="23"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 23 0 L 0 0 0 23"
            fill="none"
            stroke="#294036"
            strokeWidth=".4"
          />
        </pattern>
      </defs>
      <rect
        x="20"
        y="20"
        width="460"
        height="400"
        rx="3"
        fill="url(#courtbg)"
        stroke="#536459"
      />
      <rect x="20" y="20" width="460" height="400" fill="url(#courtgrid)" />
      <g fill="none" stroke="#657a68" strokeWidth="1.3">
        <path d="M 180 20 V 188 H 320 V 20 M 180 188 A70 70 0 0 0 320 188 M 180 188 A70 70 0 0 1 320 188" />
        <path d="M 50 20 V 88 A 205 205 0 0 0 450 88 V 20" />
        <path d="M 210 53 H 290" />
        <circle cx="250" cy="68" r="13" />
        <path d="M 180 420 A70 70 0 0 1 320 420" />
        <path d="M 243 20 V 420" strokeDasharray="3 9" strokeOpacity=".18" />
      </g>
      {events
        .filter((e) => e.x !== undefined && e.y !== undefined)
        .map((e) => {
          const x = 20 + e.x! * 4.6,
            y = 20 + e.y! * 4;
          return points(e.kind) > 0 ? (
            <circle
              key={e.id}
              cx={x}
              cy={y}
              r="5"
              fill="#c1f36b"
              fillOpacity=".7"
            />
          ) : (
            <path
              key={e.id}
              d={`M ${x - 3} ${y - 3} l 6 6 m 0 -6 l -6 6`}
              stroke="#ee8b7a"
              strokeWidth="1.7"
            />
          );
        })}
      {selected && (
        <g>
          <circle
            cx={20 + selected.x * 4.6}
            cy={20 + selected.y * 4}
            r="10"
            fill="#c1f36b"
            fillOpacity=".3"
            stroke="#d7ff9b"
            strokeWidth="2"
          />
          <circle
            cx={20 + selected.x * 4.6}
            cy={20 + selected.y * 4}
            r="3"
            fill="#fff"
          />
        </g>
      )}
      <text
        x="250"
        y="390"
        fill="#6a7e70"
        fontSize="10"
        textAnchor="middle"
        letterSpacing="5"
      >
        COURTVISION
      </text>
    </svg>
  );
}
export function PlayerTrend({
  games,
  playerId,
}: {
  games: Game[];
  playerId: string;
}) {
  const data = games
    .filter((g) => g.status === "finished" && g.roster.includes(playerId))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => {
      const s = aggregate(g).players[playerId];
      return {
        date: g.date.slice(5, 10),
        得点: s.pts,
        リバウンド: s.oreb + s.dreb,
        アシスト: s.ast,
      };
    });
  return (
    <div className="chart">
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ left: -20, right: 10, top: 10, bottom: 5 }}
        >
          <CartesianGrid vertical={false} stroke="#29313b" />
          <XAxis dataKey="date" tick={{ fill: "#8c96a4", fontSize: 10 }} />
          <YAxis tick={{ fill: "#8c96a4", fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: "#1b222c",
              border: "1px solid #374151",
            }}
          />
          <Legend />
          {[
            ["得点", "#c1f36b"],
            ["リバウンド", "#83a0e8"],
            ["アシスト", "#b1a0e4"],
          ].map(([key, color]) => (
            <Line
              key={key}
              isAnimationActive={false}
              dataKey={key}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function RadarComparison({
  rows,
}: {
  rows: {
    name: string;
    pts: number;
    reb: number;
    ast: number;
    fg: number;
    minutes: number;
  }[];
}) {
  const axes = [
    ["得点", "pts"],
    ["リバウンド", "reb"],
    ["アシスト", "ast"],
    ["FG%", "fg"],
    ["出場時間", "minutes"],
  ] as const;
  const data = axes.map(([label, key]) => {
    const max = Math.max(0, ...rows.map((p) => p[key]));
    return Object.fromEntries([
      ["metric", label],
      ...rows.map((p, i) => [`p${i}`, max ? (p[key] / max) * 100 : 0]),
    ]);
  });
  return (
    <>
      <div className="chart radar-chart">
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="68%">
            <PolarGrid stroke="#334151" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: "#9aa8bb", fontSize: 10 }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            {rows.map((p, i) => (
              <Radar
                key={i}
                name={p.name}
                dataKey={`p${i}`}
                stroke={
                  ["#c1f36b", "#83a0e8", "#b1a0e4", "#ee9589", "#56cbbc"][i]
                }
                fill={
                  ["#c1f36b", "#83a0e8", "#b1a0e4", "#ee9589", "#56cbbc"][i]
                }
                fillOpacity={0.08}
                isAnimationActive={false}
              />
            ))}
            <Legend />
            <Tooltip
              contentStyle={{
                background: "#1b222c",
                border: "1px solid #374151",
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="court-caption">
        選択選手内の各指標の最大値を100として正規化。値の大小を能力の優劣とは断定しません。
      </p>
    </>
  );
}
export function MetricTrend({
  games,
  quarter = 0,
}: {
  games: Game[];
  quarter?: number;
}) {
  const [metric, setMetric] = useState("fg");
  const names: Record<string, string> = {
    fg: "FG 成功率 (%)",
    reb: "リバウンド (回)",
    tov: "ターンオーバー (回)",
    ast: "アシスト (回)",
  };
  const data = games
    .filter((g) => g.status === "finished")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => {
      const s = aggregate(g, quarter || undefined).team;
      return {
        date: g.date.slice(5, 10),
        value:
          metric === "fg"
            ? Number(metrics(s).fg.toFixed(1))
            : metric === "reb"
              ? s.oreb + s.dreb
              : metric === "tov"
                ? s.tov
                : s.ast,
      };
    });
  return (
    <>
      <div className="filter-bar">
        <label>
          表示指標{" "}
          <select
            aria-label="推移グラフの指標"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {Object.entries(names).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="chart">
        <ResponsiveContainer>
          <LineChart
            data={data}
            margin={{ left: -18, right: 15, top: 8, bottom: 5 }}
          >
            <CartesianGrid vertical={false} stroke="#29313b" />
            <XAxis dataKey="date" tick={{ fill: "#8c96a4", fontSize: 10 }} />
            <YAxis
              domain={metric === "fg" ? [0, 100] : [0, "auto"]}
              tick={{ fill: "#8c96a4", fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                background: "#1b222c",
                border: "1px solid #374151",
              }}
            />
            <Line
              name={names[metric]}
              dataKey="value"
              stroke="#c1f36b"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
