"use client";
import { useEffect, useRef, useState } from "react";
import {
  Play as PlayIcon,
  Pause,
  Undo2,
  ArrowRightLeft,
  Flag,
  Pencil,
  Trash2,
  Check,
  Plus,
  ChevronRight,
} from "lucide-react";
import {
  Game,
  Workspace,
  Play,
  Kind,
  aggregate,
  labels,
  clock,
  gameElapsed,
  periodSeconds,
  quarterStart,
  workspaceSchema,
  isOpponent,
  clockAt,
} from "@/lib/model";
import { Panel, Avatar, Modal } from "./ui";
import { Court } from "./charts";
export default function LiveRecorder({
  game: g,
  data,
  onUpdate,
  notify,
  onSelect,
  onNew,
  readOnly = false,
}: {
  game: Game;
  data: Workspace;
  onUpdate: (g: Game) => void;
  notify: (s: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState(g.starters[0] ?? ""),
    [side, setSide] = useState<"own" | "opponent">("own"),
    [spot, setSpot] = useState<{ x: number; y: number } | null>(null),
    [sub, setSub] = useState(false),
    [edit, setEdit] = useState<Play | null>(null),
    [editClock, setEditClock] = useState(false),
    [finish, setFinish] = useState(false),
    [historyLimit, setHistoryLimit] = useState(50);
  const latest = useRef(g);
  const running = !!g.clockTarget && g.remaining > 0;
  latest.current = g;
  const commit = (next: Game) => {
    latest.current = next;
    onUpdate(next);
  };
  useEffect(() => {
    setSide("own");
    setSelected(g.starters[0] ?? "");
    setSpot(null);
    setHistoryLimit(50);
  }, [g.id]);
  useEffect(() => setSpot(null), [side]);
  const pauseClock = () => {
    const current = clockAt(latest.current);
    commit({ ...current, clockTarget: undefined });
  };
  const a = aggregate(g),
    players = data.players.filter((p) => g.roster.includes(p.id)),
    active = players.find((p) => p.id === selected),
    readonly = readOnly || g.status === "finished";
  const validateEvents = (events: Play[]) => {
    const next = { ...g, events };
    const result = workspaceSchema.safeParse({
      ...data,
      games: data.games.map((x) => (x.id === g.id ? next : x)),
    });
    if (!result.success) {
      notify(
        "交代や時刻との整合性が保てないため変更できません。関連するイベントを先に訂正してください。",
      );
      return false;
    }
    commit(next);
    return true;
  };
  const record = (kind: Kind) => {
    if (readonly) return;
    if (
      side === "own" &&
      !kind.startsWith("OPP") &&
      !a.onCourt.includes(selected)
    ) {
      notify("出場中の選手を選択してください");
      return;
    }
    const current = clockAt(latest.current);
    const e: Play = {
      id: crypto.randomUUID(),
      kind,
      playerId: side === "opponent" || kind.startsWith("OPP") ? "" : selected,
      ...(side === "opponent" ? { side } : {}),
      quarter: current.quarter,
      elapsed: gameElapsed(current),
      ...((kind.startsWith("2P") || kind.startsWith("3P")) && spot ? spot : {}),
    };
    commit({ ...current, status: "live", events: [...current.events, e] });
    if (e.x !== undefined) setSpot(null);
  };
  const toggle = () => {
    if (running) pauseClock();
    else
      commit({
        ...g,
        status: "live",
        clockTarget: Date.now() + g.remaining * 1000,
      });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> LIVE GAME CENTER
          </div>
          <h1>
            ライブ記録<span className="title-dot">.</span>
          </h1>
          <p>プレーを逃さない。タップで、正確に。</p>
        </div>
        <div className="heading-actions">
          <select
            aria-label="記録する試合"
            value={g.id}
            onChange={(e) => {
              pauseClock();
              onSelect(e.target.value);
            }}
          >
            {data.games
              .filter((x) => x.season === data.season)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.opponent} ·{" "}
                  {x.status === "finished" ? "終了" : x.date.slice(0, 10)}
                </option>
              ))}
          </select>
          <button className="secondary" onClick={onNew}>
            <Plus size={16} />
            新規試合
          </button>
        </div>
      </div>
      <section className="scoreboard">
        <div className="scoreboard-label">
          <span className={`status-tag ${g.status}`}>
            {g.status === "finished" ? "FINAL" : running ? "● LIVE" : "PAUSED"}
          </span>
          <span>
            {g.competition} · {g.venue}
          </span>
          <span className="save-label">
            <Check size={12} />
            端末に自動保存
          </span>
        </div>
        <div className="scoreboard-main">
          <div className="score-team">
            <span className="team-emblem">
              A<span>TECH</span>
            </span>
            <div>
              <h2>{data.teamName}</h2>
              <small>{g.home ? "HOME" : "AWAY"}</small>
            </div>
            <strong>{a.score}</strong>
          </div>
          <div className="score-clock">
            <span>
              {g.quarter > g.quarters
                ? `OT${g.quarter - g.quarters}`
                : `${g.quarter}Q`}
            </span>
            <button
              disabled={readonly}
              onClick={() => {
                pauseClock();
                setEditClock(true);
              }}
              title="時計を修正"
            >
              {clock(g.remaining)}
            </button>
            <small>
              TEAM FOULS{" "}
              <b>
                {
                  g.events.filter(
                    (e) =>
                      e.quarter === g.quarter &&
                      e.kind === "PF" &&
                      !isOpponent(e),
                  ).length
                }
              </b>
            </small>
          </div>
          <div className="score-team away">
            <strong>{a.opponent}</strong>
            <div>
              <h2>{g.opponent}</h2>
              <small>{g.home ? "AWAY" : "HOME"}</small>
              <small>
                FOULS{" "}
                {
                  g.events.filter(
                    (e) =>
                      e.quarter === g.quarter &&
                      e.kind === "PF" &&
                      isOpponent(e),
                  ).length
                }
              </small>
            </div>
            <span className="team-emblem opponent">
              {g.opponent.slice(0, 1)}
              <span>UNIV.</span>
            </span>
          </div>
        </div>
        <div className="scoreboard-bottom">
          <div className="quarter-scores">
            <span>QUARTER</span>
            {Array.from({ length: Math.max(g.quarters, g.quarter) }, (_, i) => {
              const s = aggregate(g, i + 1);
              return (
                <div key={i} className={g.quarter === i + 1 ? "current" : ""}>
                  <small>
                    {i + 1 > g.quarters
                      ? `OT${i + 1 - g.quarters}`
                      : `${i + 1}Q`}
                  </small>
                  <b>
                    {s.score} <span>–</span> {s.opponent}
                  </b>
                </div>
              );
            })}
          </div>
          <div className="clock-actions">
            <button
              className="secondary compact"
              disabled={readonly || g.remaining === 0}
              onClick={toggle}
            >
              {running ? <Pause size={14} /> : <PlayIcon size={14} />}時計を
              {running ? "停止" : "開始"}
            </button>
            <button
              className="secondary compact"
              disabled={readonly || running || g.quarter >= 20}
              onClick={() => {
                if (g.remaining > 0) {
                  notify(
                    "時計を 00:00 に修正してから次のクォーターへ進んでください",
                  );
                  return;
                }
                const q = g.quarter + 1;
                commit({
                  ...g,
                  clockTarget: undefined,
                  quarter: q,
                  remaining: periodSeconds(g, q),
                });
              }}
            >
              次のQ
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </section>
      {readOnly && (
        <div className="notice">
          閲覧モードです。記録や訂正には管理者・記録担当の権限が必要です。
        </div>
      )}
      {!readOnly && readonly && (
        <div className="notice">
          この試合は終了しています。記録を訂正する場合は{" "}
          <button
            className="text-link"
            onClick={() => commit({ ...g, status: "live" })}
          >
            記録を再開
          </button>{" "}
          してください。
        </div>
      )}
      <div className="live-layout">
        <div>
          <Panel
            title="コート上の選手"
            subtitle="選手を選んで、スタッツをタップ"
            action={
              <button
                className="secondary compact"
                disabled={readonly || running}
                onClick={() => setSub(true)}
              >
                <ArrowRightLeft size={14} />
                選手交代
              </button>
            }
          >
            <div className="on-court">
              {players
                .filter((p) => a.onCourt.includes(p.id))
                .map((p) => (
                  <button
                    className={`court-player ${selected === p.id ? "selected" : ""}`}
                    key={p.id}
                    onClick={() => {
                      setSelected(p.id);
                      setSide("own");
                    }}
                  >
                    <span className="on-court-dot" />
                    <Avatar name={p.name} number={p.number} />
                    <strong>{p.name}</strong>
                    <small>
                      {p.position}{" "}
                      <span>· {a.players[p.id]?.pts ?? 0} PTS</span>
                    </small>
                    <span className="foul-dots">
                      {Array.from({ length: 5 }, (_, i) => (
                        <i
                          key={i}
                          className={
                            i < (a.players[p.id]?.pf ?? 0) ? "filled" : ""
                          }
                        />
                      ))}
                    </span>
                  </button>
                ))}
            </div>
          </Panel>
          <Panel
            className="record-panel"
            title={
              side === "opponent"
                ? `${g.opponent} の記録`
                : active
                  ? `#${active.number} ${active.name}`
                  : "選手を選択"
            }
            subtitle="連続入力できます。ショット位置の指定は任意です。"
            action={
              <span className="selected-label">
                {side === "own" ? "SELECTED PLAYER" : "OPPONENT TEAM"}
              </span>
            }
          >
            <div className="record-side tabs">
              <button
                className={side === "own" ? "selected" : ""}
                onClick={() => setSide("own")}
              >
                自チーム
              </button>
              <button
                className={side === "opponent" ? "selected" : ""}
                onClick={() => setSide("opponent")}
              >
                相手チーム
              </button>
              <span className="hint">
                {g.opponentStatsComplete
                  ? "両チームの全プレーを記録してください"
                  : "相手の詳細集計は参考値（過去の試投が未記録）"}
              </span>
            </div>
            <div className="record-buttons">
              {(["2PM", "2PX", "3PM", "3PX", "FTM", "FTX"] as Kind[]).map(
                (k) => (
                  <button
                    key={k}
                    disabled={readonly}
                    className={`stat-button ${k.endsWith("M") ? "made-btn" : "miss-btn"}`}
                    onClick={() => record(k)}
                  >
                    <strong>{k.startsWith("FT") ? "FT" : k.slice(0, 2)}</strong>
                    <span>{k.endsWith("M") ? "成功 ＋" : "失敗 −"}</span>
                  </button>
                ),
              )}
            </div>
            <div className="other-buttons">
              {(
                ["OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF"] as Kind[]
              ).map((k) => (
                <button
                  key={k}
                  disabled={readonly}
                  onClick={() => record(k)}
                  className={k === "PF" || k === "TOV" ? "negative" : ""}
                >
                  <strong>{k}</strong>
                  <small>{labels[k]}</small>
                </button>
              ))}
            </div>
            <div className="record-toolbar">
              <button
                className="secondary"
                disabled={readonly || !g.events.length}
                onClick={() => {
                  if (validateEvents(g.events.slice(0, -1)))
                    notify("最後の操作を取り消しました");
                }}
              >
                <Undo2 size={15} />
                Undo
              </button>
              <span>相手の得点</span>
              {(["OPP2", "OPP3", "OPPFT"] as Kind[]).map((k) => (
                <button
                  key={k}
                  className="opponent-score"
                  disabled={readonly}
                  onClick={() => record(k)}
                >
                  +{k === "OPP2" ? 2 : k === "OPP3" ? 3 : 1}
                </button>
              ))}
            </div>
          </Panel>
          <Panel
            title="ボックススコア"
            subtitle="イベントからリアルタイムに自動集計"
          >
            <div className="table-scroll">
              <table className="compact-table">
                <thead>
                  <tr>
                    <th>選手</th>
                    <th>MIN</th>
                    <th>PTS</th>
                    <th>REB</th>
                    <th>AST</th>
                    <th>PF</th>
                    <th>+/−</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => {
                    const s = a.players[p.id];
                    return (
                      <tr key={p.id}>
                        <td>
                          <span
                            className={a.onCourt.includes(p.id) ? "accent" : ""}
                          >
                            #{p.number}
                          </span>{" "}
                          {p.name}
                        </td>
                        <td>{clock(s.seconds)}</td>
                        <td>
                          <strong>{s.pts}</strong>
                        </td>
                        <td>{s.oreb + s.dreb}</td>
                        <td>{s.ast}</td>
                        <td className={s.pf >= 5 ? "error-text" : ""}>
                          {s.pf}
                        </td>
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
          </Panel>
        </div>
        <div>
          <Panel
            title="ショット位置"
            subtitle="コートをタップして、次のシュート位置を選択"
            action={
              spot ? (
                <button className="text-link" onClick={() => setSpot(null)}>
                  クリア
                </button>
              ) : undefined
            }
          >
            <Court
              events={g.events.filter(
                (e) =>
                  (side === "opponent"
                    ? isOpponent(e)
                    : !isOpponent(e) && e.playerId === selected) &&
                  e.quarter === g.quarter,
              )}
              interactive={!readonly}
              selected={spot}
              onPoint={(x, y) => setSpot({ x, y })}
            />
            <p className="court-caption">
              {spot
                ? "位置を選択済み → 2P / 3P の成功・失敗を入力"
                : "同じ攻撃方向に統一 · FT は位置を記録しません"}
            </p>
          </Panel>
          <Panel
            title="プレー履歴"
            subtitle={`${g.events.length} EVENTS`}
            className="timeline-panel"
          >
            <div className="timeline">
              {[...g.events]
                .reverse()
                .slice(0, historyLimit)
                .map((e) => {
                  const p = players.find((p) => p.id === e.playerId);
                  return (
                    <div className="timeline-item" key={e.id}>
                      <div className="timeline-time">
                        <strong>
                          {e.quarter > g.quarters ? "OT" : `${e.quarter}Q`}
                        </strong>
                        <small>
                          {clock(
                            periodSeconds(g, e.quarter) -
                              (e.elapsed - quarterStart(g, e.quarter)),
                          )}
                        </small>
                      </div>
                      <span
                        className={`event-dot ${e.kind.endsWith("M") ? "made" : ""}`}
                      />
                      <div className="timeline-text">
                        <strong>
                          {isOpponent(e) ? "相手 · " : ""}
                          {labels[e.kind]}
                        </strong>
                        <small>
                          {e.kind === "SUB"
                            ? `${p?.name} → ${players.find((p) => p.id === e.inId)?.name}`
                            : isOpponent(e)
                              ? g.opponent
                              : p?.name}
                        </small>
                      </div>
                      <button
                        className="icon-button"
                        disabled={readonly || running}
                        aria-label={`${labels[e.kind]}の履歴を編集`}
                        onClick={() => setEdit(e)}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  );
                })}
              {!g.events.length && (
                <div className="empty">最初のプレーを記録しましょう。</div>
              )}
            </div>
            {g.events.length > historyLimit && (
              <button
                className="secondary full"
                onClick={() => setHistoryLimit((n) => n + 50)}
              >
                以前の履歴を50件表示
              </button>
            )}
            <button
              className="secondary full finish-btn"
              disabled={readonly || running}
              onClick={() => setFinish(true)}
            >
              <Flag size={15} />
              試合を終了する
            </button>
          </Panel>
        </div>
      </div>
      {sub && (
        <Modal title="選手交代" onClose={() => setSub(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const ev: Play = {
                id: crypto.randomUUID(),
                kind: "SUB",
                playerId: String(f.get("out")),
                inId: String(f.get("in")),
                quarter: g.quarter,
                elapsed: gameElapsed(g),
              };
              if (validateEvents([...g.events, ev])) {
                setSelected(ev.inId!);
                setSub(false);
                notify("交代を記録しました");
              }
            }}
          >
            <p className="notice">時計を停止した状態で交代を記録します。</p>
            <label>
              OUT
              <select name="out">
                {players
                  .filter((p) => a.onCourt.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number} {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              IN
              <select name="in" required>
                {players
                  .filter((p) => !a.onCourt.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number} {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary full" disabled={players.length <= 5}>
              <ArrowRightLeft size={16} />
              交代を確定
            </button>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal title="プレー履歴を訂正" onClose={() => setEdit(null)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const q = Number(f.get("quarter")),
                remaining =
                  Number(f.get("minutes")) * 60 + Number(f.get("seconds"));
              if (remaining > periodSeconds(g, q)) {
                notify("クォーターの時間を超えています");
                return;
              }
              const ev: Play = {
                ...edit,
                kind: f.get("kind") as Kind,
                quarter: q,
                elapsed: quarterStart(g, q) + periodSeconds(g, q) - remaining,
                playerId: isOpponent(edit) ? "" : String(f.get("playerId")),
              };
              if (ev.kind === "SUB") ev.inId = String(f.get("inId"));
              if (
                (ev.kind.startsWith("2P") || ev.kind.startsWith("3P")) &&
                f.has("x") &&
                String(f.get("x")) !== "" &&
                String(f.get("y")) !== ""
              ) {
                ev.x = Number(f.get("x"));
                ev.y = Number(f.get("y"));
              } else {
                delete ev.x;
                delete ev.y;
              }
              if (
                validateEvents(
                  g.events
                    .map((x) => (x.id === ev.id ? ev : x))
                    .sort((a, b) => a.elapsed - b.elapsed),
                )
              )
                setEdit(null);
            }}
          >
            <p>
              {labels[edit.kind]} / {edit.quarter}Q
            </p>
            <div className="form-row">
              <label>
                クォーター
                <select name="quarter" defaultValue={edit.quarter}>
                  {Array.from({ length: g.quarter }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}Q
                    </option>
                  ))}
                </select>
              </label>
              <label>
                残り分
                <input
                  name="minutes"
                  type="number"
                  min="0"
                  max="20"
                  required
                  defaultValue={Math.floor(
                    (periodSeconds(g, edit.quarter) -
                      (edit.elapsed - quarterStart(g, edit.quarter))) /
                      60,
                  )}
                />
              </label>
              <label>
                残り秒
                <input
                  name="seconds"
                  type="number"
                  min="0"
                  max="59"
                  required
                  defaultValue={
                    (periodSeconds(g, edit.quarter) -
                      (edit.elapsed - quarterStart(g, edit.quarter))) %
                    60
                  }
                />
              </label>
            </div>
            {!isOpponent(edit) && (
              <label>
                {edit.kind === "SUB" ? "OUT 選手" : "記録選手"}
                <select name="playerId" defaultValue={edit.playerId}>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number} {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {edit.kind === "SUB" && (
              <label>
                IN 選手
                <select name="inId" defaultValue={edit.inId}>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number} {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {edit.kind !== "SUB" && (
              <label>
                イベント
                <select name="kind" defaultValue={edit.kind}>
                  {(edit.kind.startsWith("OPP")
                    ? (["OPP2", "OPP3", "OPPFT"] as Kind[])
                    : ([
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
                      ] as Kind[])
                  ).map((k) => (
                    <option key={k} value={k}>
                      {labels[k]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {edit.kind === "SUB" && (
              <>
                <input type="hidden" name="kind" value="SUB" />
                <p className="notice">
                  交代の選手・時刻も訂正できます。後続イベントとの整合性が保てない変更は拒否します。
                </p>
              </>
            )}
            {(edit.kind.startsWith("2P") || edit.kind.startsWith("3P")) && (
              <div className="form-row">
                <label>
                  位置 X (0–100)
                  <input
                    type="number"
                    name="x"
                    min="0"
                    max="100"
                    step="any"
                    defaultValue={edit.x}
                  />
                </label>
                <label>
                  位置 Y (0–100)
                  <input
                    type="number"
                    name="y"
                    min="0"
                    max="100"
                    step="any"
                    defaultValue={edit.y}
                  />
                </label>
              </div>
            )}
            <button className="primary full">訂正を保存</button>
            <button
              type="button"
              className="danger full"
              onClick={() => {
                if (validateEvents(g.events.filter((e) => e.id !== edit.id)))
                  setEdit(null);
              }}
            >
              <Trash2 size={16} />
              イベントを削除
            </button>
          </form>
        </Modal>
      )}
      {editClock && (
        <Modal title="試合時計を修正" onClose={() => setEditClock(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                remaining =
                  Number(f.get("minutes")) * 60 + Number(f.get("seconds"));
              const next = {
                ...g,
                clockTarget: undefined,
                remaining,
                ...(g.status === "scheduled" && !g.events.length
                  ? {
                      recordingStart:
                        quarterStart(g, g.quarter) +
                        periodSeconds(g, g.quarter) -
                        remaining,
                    }
                  : {}),
              };
              if (
                remaining > periodSeconds(g, g.quarter) ||
                gameElapsed(next) <
                  Math.max(g.events.at(-1)?.elapsed ?? 0, g.recordingStart ?? 0)
              ) {
                notify(
                  "記録済みイベントより前の時刻、またはクォーター時間を超える値には戻せません",
                );
                return;
              }
              commit(next);
              setEditClock(false);
            }}
          >
            <div className="form-row">
              <label>
                残り分
                <input
                  name="minutes"
                  type="number"
                  required
                  min="0"
                  max="20"
                  defaultValue={Math.floor(g.remaining / 60)}
                />
              </label>
              <label>
                秒
                <input
                  name="seconds"
                  type="number"
                  required
                  min="0"
                  max="59"
                  defaultValue={g.remaining % 60}
                />
              </label>
            </div>
            <p className="notice">
              途中から記録する場合は、最初の入力・時計開始より前に残り時間を設定します。出場時間はその時点から計算し、それ以前のプレーは集計しません。
            </p>
            <button className="primary full">時計を更新</button>
          </form>
        </Modal>
      )}
      {finish && (
        <Modal title="試合を終了しますか？" onClose={() => setFinish(false)}>
          <div className="form">
            <p>
              {data.teamName}{" "}
              <b>
                {a.score} – {a.opponent}
              </b>{" "}
              {g.opponent}
            </p>
            <p className="notice">
              現在の時刻までを出場時間に反映し、シーズン成績に加算します。終了後も記録を再開して訂正できます。
            </p>
            <button
              className="primary full"
              onClick={() => {
                commit({ ...g, clockTarget: undefined, status: "finished" });
                setFinish(false);
                notify("試合を終了しました。分析画面で結果を確認できます");
              }}
            >
              <Flag size={16} />
              試合を終了
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
