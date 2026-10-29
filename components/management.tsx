"use client";
import { useState } from "react";
import { Plus, Search, ArrowUpRight, ChevronRight } from "lucide-react";
import {
  Game,
  Player,
  Workspace,
  aggregate,
  seasonStats,
  clock,
  metrics,
} from "@/lib/model";
import { Panel, Avatar, Empty, Modal } from "./ui";
import { preparePhoto } from "@/lib/photos";
import { Court, PlayerTrend } from "./charts";
export function PlayerForm({
  season,
  existing,
  onSave,
  initial,
}: {
  season: string;
  existing: Player[];
  onSave: (p: Player) => void;
  initial?: Player;
}) {
  const [error, setError] = useState(""),
    [photo, setPhoto] = useState<string | undefined>(initial?.photo),
    [photoBusy, setPhotoBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (!String(f.get("name")).trim()) {
          setError("選手名を入力してください");
          return;
        }
        const number = Number(f.get("number"));
        if (
          existing.some(
            (p) =>
              p.id !== initial?.id &&
              p.season === f.get("season") &&
              p.number === number,
          )
        ) {
          setError("同じシーズンの背番号が重複しています");
          return;
        }
        onSave({
          id: initial?.id ?? crypto.randomUUID(),
          name: String(f.get("name")).trim(),
          number,
          position: f.get("position") as Player["position"],
          year: Number(f.get("year")),
          height: Number(f.get("height")),
          season: String(f.get("season")),
          ...(photo ? { photo } : {}),
        });
      }}
    >
      <label>
        選手名
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={initial?.name}
          placeholder="例：藤井 悠真"
        />
      </label>
      <div className="form-row">
        <label>
          背番号
          <input
            name="number"
            type="number"
            min="0"
            max="99"
            required
            defaultValue={initial?.number}
          />
        </label>
        <label>
          ポジション
          <select name="position" defaultValue={initial?.position ?? "PG"}>
            {["PG", "SG", "SF", "PF", "C"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          学年
          <select name="year" defaultValue={initial?.year ?? 1}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}年
              </option>
            ))}
          </select>
        </label>
        <label>
          身長 (cm)
          <input
            name="height"
            type="number"
            min="100"
            max="250"
            required
            defaultValue={initial?.height ?? 180}
          />
        </label>
        <label>
          シーズン
          <input
            name="season"
            required
            defaultValue={initial?.season ?? season}
            pattern="[0-9]{4}"
          />
        </label>
      </div>
      <label>
        選手写真（任意）
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setPhotoBusy(true);
            try {
              setPhoto(await preparePhoto(f));
              setError("");
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "画像を読み込めません",
              );
            } finally {
              setPhotoBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      {photo && (
        <div className="photo-preview">
          <img src={photo} alt="選手写真のプレビュー" width="80" height="80" />
          <button
            type="button"
            className="secondary compact"
            onClick={() => setPhoto(undefined)}
          >
            写真を削除
          </button>
        </div>
      )}
      <p className="hint">
        写真は256pxに縮小し、位置情報などのメタデータを除去します。クラウドではチームの権限で保護されます。
      </p>
      {error && <p className="error-text">{error}</p>}
      <button className="primary full" type="submit" disabled={photoBusy}>
        {initial ? "変更を保存" : "選手を登録する"}
        <ArrowUpRight size={16} />
      </button>
    </form>
  );
}
export function GameForm({
  players,
  season,
  onSave,
}: {
  players: Player[];
  season: string;
  onSave: (g: Game) => void;
}) {
  const roster = players.filter((p) => p.season === season);
  const [selected, setSelected] = useState<string[]>(roster.map((p) => p.id)),
    [starters, setStarters] = useState<string[]>(
      roster.slice(0, 5).map((p) => p.id),
    ),
    [error, setError] = useState("");
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (starters.length !== 5) {
          setError("スタメンを5人選択してください");
          return;
        }
        const f = new FormData(e.currentTarget);
        if (!String(f.get("opponent")).trim()) {
          setError("対戦相手を入力してください");
          return;
        }
        const sec = Number(f.get("minutes")) * 60;
        onSave({
          id: crypto.randomUUID(),
          opponent: String(f.get("opponent")).trim(),
          date: String(f.get("date")),
          venue: String(f.get("venue")),
          competition: String(f.get("competition")),
          season: String(f.get("season")),
          home: f.get("home") === "home",
          status: "scheduled",
          quarterSeconds: sec,
          quarters: Number(f.get("quarters")),
          starters,
          roster: selected,
          events: [],
          quarter: 1,
          remaining: sec,
          opponentStatsComplete: f.get("opponentDetails") === "on",
        });
      }}
    >
      <label>
        対戦相手
        <input
          name="opponent"
          required
          maxLength={100}
          placeholder="例：桜丘大学"
        />
      </label>
      <div className="form-row">
        <label>
          試合日時
          <input
            name="date"
            type="datetime-local"
            required
            defaultValue={
              new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 10) + "T14:00"
            }
          />
        </label>
        <label>
          ホーム / アウェー
          <select name="home">
            <option value="home">ホーム</option>
            <option value="away">アウェー</option>
          </select>
        </label>
      </div>
      <label>
        会場
        <input name="venue" maxLength={100} placeholder="例：第一体育館" />
      </label>
      <div className="form-row">
        <label>
          大会名
          <input
            name="competition"
            maxLength={100}
            defaultValue="関東大学リーグ"
          />
        </label>
        <label>
          シーズン
          <input name="season" value={season} readOnly />
        </label>
      </div>
      <div className="form-row">
        <label>
          クォーター時間 (分)
          <input
            name="minutes"
            type="number"
            min="1"
            max="20"
            defaultValue="10"
            required
          />
        </label>
        <label>
          クォーター数
          <select name="quarters">
            <option value="4">4 クォーター</option>
            <option value="2">2 ハーフ</option>
          </select>
        </label>
      </div>
      <label className="check-label">
        <input name="opponentDetails" type="checkbox" defaultChecked />
        相手チームの詳細スタッツも記録する
      </label>
      <div className="field-label">
        出場選手とスタメン <small>スタメン {starters.length} / 5</small>
      </div>
      <div className="roster-picker">
        {roster.map((p) => (
          <div key={p.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={(e) => {
                  setSelected((s) =>
                    e.target.checked
                      ? [...s, p.id]
                      : s.filter((id) => id !== p.id),
                  );
                  if (!e.target.checked)
                    setStarters((s) => s.filter((id) => id !== p.id));
                }}
              />
              #{p.number} {p.name}
            </label>
            <button
              type="button"
              disabled={
                !selected.includes(p.id) ||
                (!starters.includes(p.id) && starters.length >= 5)
              }
              className={`starter-toggle ${starters.includes(p.id) ? "selected" : ""}`}
              onClick={() =>
                setStarters((s) =>
                  s.includes(p.id)
                    ? s.filter((id) => id !== p.id)
                    : [...s, p.id],
                )
              }
            >
              {starters.includes(p.id) ? "STARTER" : "スタメンにする"}
            </button>
          </div>
        ))}
      </div>
      {roster.length < 5 && (
        <p className="error-text">
          先にこのシーズンの選手を5人以上登録してください。
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
      <button className="primary full" disabled={roster.length < 5}>
        試合を登録する
        <ArrowUpRight size={16} />
      </button>
    </form>
  );
}
export function GamesView({
  data,
  onGame,
  onNew,
  query = "",
  onUpdate,
}: {
  data: Workspace;
  onUpdate?: (g: Game) => void;
  onGame: (g: Game) => void;
  onNew: () => void;
  query?: string;
}) {
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [result, setResult] = useState("all"),
    [competition, setCompetition] = useState("all");
  const games = data.games
    .filter(
      (g) =>
        g.season === data.season &&
        g.opponent.includes(query) &&
        g.opponent.includes(search) &&
        (status === "all" || g.status === status) &&
        (competition === "all" || g.competition === competition),
    )
    .filter((g) => {
      const s = aggregate(g);
      return (
        result === "all" ||
        (g.status === "finished" &&
          (result === "win"
            ? s.score > s.opponent
            : result === "draw"
              ? s.score === s.opponent
              : s.score < s.opponent))
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">GAME CENTER</div>
          <h1>
            試合一覧<span className="title-dot">.</span>
          </h1>
          <p>一試合ずつの記録が、チームの財産になる。</p>
        </div>
        <button className="primary" onClick={onNew}>
          <Plus size={17} />
          試合を登録
        </button>
      </div>
      <Panel>
        <div className="filter-bar">
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="対戦相手を検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="試合状態"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">すべての状態</option>
            <option value="scheduled">予定</option>
            <option value="live">記録中</option>
            <option value="finished">終了</option>
          </select>
          <select
            aria-label="勝敗"
            value={result}
            onChange={(e) => setResult(e.target.value)}
          >
            <option value="all">すべての結果</option>
            <option value="win">勝利</option>
            <option value="loss">敗北</option>
            <option value="draw">引き分け</option>
          </select>
          <select
            aria-label="大会"
            value={competition}
            onChange={(e) => setCompetition(e.target.value)}
          >
            <option value="all">すべての大会</option>
            {[...new Set(data.games.map((g) => g.competition))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span className="muted">{games.length} GAMES</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>試合日</th>
                <th>対戦相手</th>
                <th>大会 / 会場</th>
                <th>スコア</th>
                <th>状態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {games.map((g) => {
                const s = aggregate(g);
                return (
                  <tr key={g.id}>
                    <td>
                      {g.date.slice(0, 10)}
                      <small>{g.date.slice(11, 16)}</small>
                    </td>
                    <td>
                      <strong>{g.opponent}</strong>
                      <small>{g.home ? "HOME" : "AWAY"}</small>
                    </td>
                    <td>
                      {g.competition}
                      <small>{g.venue}</small>
                    </td>
                    <td className="score-cell">
                      {g.status === "scheduled"
                        ? "—"
                        : `${s.score} – ${s.opponent}`}
                    </td>
                    <td>
                      <span className={`status-tag ${g.status}`}>
                        {g.status === "finished"
                          ? "終了"
                          : g.status === "live"
                            ? "● 記録中"
                            : "予定"}
                      </span>
                    </td>
                    <td>
                      {onUpdate && (
                        <button
                          className="secondary compact"
                          onClick={() => setEditingGame(g)}
                        >
                          編集
                        </button>
                      )}
                      <button
                        className="secondary compact"
                        onClick={() => onGame(g)}
                      >
                        {g.status === "finished" ? "分析" : "記録"}
                        <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!games.length && <Empty text="条件に一致する試合がありません。" />}
          {editingGame && onUpdate && (
            <Modal title="試合情報を編集" onClose={() => setEditingGame(null)}>
              <GameMetadataForm
                game={editingGame}
                onSave={(g) => {
                  onUpdate(g);
                  setEditingGame(null);
                }}
              />
            </Modal>
          )}
        </div>
      </Panel>
    </>
  );
}
export function PlayersView({
  data,
  onNew,
  query = "",
  onUpdate,
}: {
  data: Workspace;
  onNew: () => void;
  query?: string;
  onUpdate?: (p: Player) => void;
}) {
  const [position, setPosition] = useState("ALL"),
    [selected, setSelected] = useState<Player | null>(null),
    [editing, setEditing] = useState(false);
  const rows = seasonStats(
    data.games.filter((g) => g.season === data.season),
    data.players.filter(
      (p) =>
        p.season === data.season &&
        p.name.includes(query) &&
        (position === "ALL" || p.position === position),
    ),
  );
  const profile = selected
    ? seasonStats(
        data.games.filter((g) => g.season === data.season),
        [selected],
      )[0]
    : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE ROSTER</div>
          <h1>
            選手管理<span className="title-dot">.</span>
          </h1>
          <p>一人ひとりの成長を、チームの力に。</p>
        </div>
        <button className="primary" onClick={onNew}>
          <Plus size={17} />
          選手を追加
        </button>
      </div>
      <div className="tabs">
        {["ALL", "PG", "SG", "SF", "PF", "C"].map((p) => (
          <button
            key={p}
            onClick={() => setPosition(p)}
            className={position === p ? "selected" : ""}
          >
            {p === "ALL" ? "すべての選手" : p}
          </button>
        ))}
      </div>
      <div className="player-grid">
        {rows.map(({ player: p, stats: s, gp }) => (
          <button
            key={p.id}
            className="player-card panel"
            onClick={() => setSelected(p)}
          >
            <div className="player-card-top">
              <span className="player-position">{p.position}</span>
              <ArrowUpRight size={17} />
            </div>
            <div className="player-shirt">
              {p.photo ? (
                <img className="player-photo" src={p.photo} alt={p.name} />
              ) : (
                p.number
              )}
              <svg viewBox="0 0 150 140">
                <path
                  d="M40 10L10 35l18 33 13-10v75h68V58l13 10 18-33-30-25-15 10H55z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            </div>
            <h3>{p.name}</h3>
            <p>
              #{p.number} · {p.year}年 · {p.height} cm
            </p>
            <div className="player-stats">
              {[
                ["PTS", s.pts],
                ["REB", s.oreb + s.dreb],
                ["AST", s.ast],
              ].map(([k, v]) => (
                <div key={k}>
                  <strong>{gp ? (Number(v) / gp).toFixed(1) : "—"}</strong>
                  <small>{k}</small>
                </div>
              ))}
            </div>
            <div className="player-card-bottom">
              {gp} GAMES PLAYED{" "}
              <span>
                プロフィールを見る <ChevronRight size={12} />
              </span>
            </div>
          </button>
        ))}
      </div>
      {!rows.length && (
        <Empty text="該当する選手がいません。選手を追加してください。" />
      )}
      {selected && profile && (
        <Modal
          title={
            editing
              ? "選手情報を編集"
              : `${selected.name} / #${selected.number}`
          }
          onClose={() => {
            setSelected(null);
            setEditing(false);
          }}
        >
          {editing ? (
            <PlayerForm
              initial={selected}
              season={data.season}
              existing={data.players}
              onSave={(p) => {
                onUpdate?.(p);
                setSelected(p);
                setEditing(false);
              }}
            />
          ) : (
            <div className="profile-content">
              <div className="profile-top">
                <Avatar
                  name={selected.name}
                  number={selected.number}
                  size="large"
                  photo={selected.photo}
                />
                <div>
                  <h3>{selected.name}</h3>
                  <p>
                    {selected.position} · {selected.year}年 · {selected.height}
                    cm · {selected.season}
                  </p>
                  <p>
                    {profile.gp} 試合 / スタメン{" "}
                    {
                      data.games.filter(
                        (g) =>
                          g.status === "finished" &&
                          g.starters.includes(selected.id),
                      ).length
                    }{" "}
                    回
                  </p>
                </div>
                {onUpdate && (
                  <button
                    className="secondary compact"
                    onClick={() => setEditing(true)}
                  >
                    編集
                  </button>
                )}
              </div>
              <div className="stat-mini-grid">
                {[
                  ["PTS", profile.stats.pts],
                  ["REB", profile.stats.oreb + profile.stats.dreb],
                  ["AST", profile.stats.ast],
                  ["MIN", profile.stats.seconds / 60],
                ].map(([k, v]) => (
                  <div key={k}>
                    <small>{k} / GAME</small>
                    <strong>
                      {profile.gp ? (Number(v) / profile.gp).toFixed(1) : "—"}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="stat-mini-grid">
                {[
                  ["FG%", metrics(profile.stats).fg],
                  ["3P%", metrics(profile.stats).three],
                  ["FT%", metrics(profile.stats).ft],
                  ["STL/G", profile.stats.stl / (profile.gp || 1)],
                  ["BLK/G", profile.stats.blk / (profile.gp || 1)],
                  ["TOV/G", profile.stats.tov / (profile.gp || 1)],
                  ["PF/G", profile.stats.pf / (profile.gp || 1)],
                  ["+/− /G", profile.stats.pm / (profile.gp || 1)],
                ].map(([label, v]) => (
                  <div key={label}>
                    <small>{label}</small>
                    <strong>{Number(v).toFixed(1)}</strong>
                  </div>
                ))}
              </div>
              <h3 className="section-title">試合別の成績推移</h3>
              <PlayerTrend
                games={data.games.filter((g) => g.season === data.season)}
                playerId={selected.id}
              />
              <h3 className="section-title">ショットチャート</h3>
              <Court
                events={data.games
                  .filter((g) => g.season === data.season)
                  .flatMap((g) => g.events)
                  .filter((e) => e.playerId === selected.id)}
              />
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>試合</th>
                      <th>PTS</th>
                      <th>REB</th>
                      <th>AST</th>
                      <th>MIN</th>
                      <th>+/−</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.games
                      .filter(
                        (g) =>
                          g.season === data.season &&
                          g.status === "finished" &&
                          g.roster.includes(selected.id),
                      )
                      .map((g) => {
                        const s = aggregate(g).players[selected.id];
                        return (
                          <tr key={g.id}>
                            <td>
                              {g.opponent}
                              <small>{g.date.slice(0, 10)}</small>
                            </td>
                            <td>{s.pts}</td>
                            <td>{s.oreb + s.dreb}</td>
                            <td>{s.ast}</td>
                            <td>{clock(s.seconds)}</td>
                            <td>
                              {s.pm > 0 ? "+" : ""}
                              {s.pm}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function GameMetadataForm({
  game: g,
  onSave,
}: {
  game: Game;
  onSave: (g: Game) => void;
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          ...g,
          opponent: String(f.get("opponent")).trim(),
          date: String(f.get("date")),
          venue: String(f.get("venue")),
          competition: String(f.get("competition")),
          home: f.get("home") === "home",
        });
      }}
    >
      <label>
        対戦相手
        <input
          name="opponent"
          required
          maxLength={100}
          defaultValue={g.opponent}
        />
      </label>
      <label>
        試合日時
        <input
          name="date"
          type="datetime-local"
          required
          defaultValue={g.date}
        />
      </label>
      <label>
        会場
        <input name="venue" maxLength={100} defaultValue={g.venue} />
      </label>
      <label>
        大会名
        <input
          name="competition"
          maxLength={100}
          defaultValue={g.competition}
        />
      </label>
      <label>
        ホーム・アウェー
        <select name="home" defaultValue={g.home ? "home" : "away"}>
          <option value="home">ホーム</option>
          <option value="away">アウェー</option>
        </select>
      </label>
      <p className="notice">
        記録の整合性を保つため、登録済み試合のスタメン・出場選手・試合形式はこの画面では変更しません。出場メンバーの変更はライブ記録の交代機能を利用してください。
      </p>
      <button className="primary full">試合情報を保存</button>
    </form>
  );
}
