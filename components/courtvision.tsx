"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  ChartNoAxesCombined,
  Radio,
  Settings,
  ChevronDown,
  Search,
  Menu,
  X,
  Check,
  CloudOff,
  ArrowUpRight,
  CircleHelp,
  Bell,
  Download,
} from "lucide-react";
import { createDemo } from "@/lib/demo";
import { Workspace, Game, workspaceSchema, clockAt } from "@/lib/model";
import { fingerprint } from "@/lib/merge";
import { saveWorkspaceAtomic, LocalConflict } from "@/lib/database";
import { useCloud } from "@/lib/cloud";
import {
  readWorkspace,
  download,
  supabase,
  storageKey,
  workspaceStorageKey,
} from "@/lib/storage";
import type { Session } from "@supabase/supabase-js";
import Login from "./login";
import Dashboard from "./dashboard";
import { PlayersView, GamesView, PlayerForm, GameForm } from "./management";
import LiveRecorder from "./live";
import Analysis from "./analysis";
import SettingsView from "./settings";
import { Modal } from "./ui";
type Page =
  "dashboard" | "games" | "live" | "players" | "analysis" | "settings";
const nav = [
  { id: "dashboard", name: "ダッシュボード", icon: LayoutDashboard },
  { id: "games", name: "試合一覧", icon: CalendarDays },
  { id: "live", name: "ライブ記録", icon: Radio },
  { id: "players", name: "選手管理", icon: Users },
  { id: "analysis", name: "チーム分析", icon: ChartNoAxesCombined },
] as const;
export default function Courtvision() {
  const [data, setData] = useState<Workspace>(() => createDemo()),
    [loaded, setLoaded] = useState(false),
    [saving, setSaving] = useState(false),
    [page, setPage] = useState<Page>("dashboard"),
    [sidebar, setSidebar] = useState(false),
    [modal, setModal] = useState<
      "player" | "game" | "help" | "notifications" | null
    >(null),
    [toast, setToast] = useState(""),
    [activeId, setActiveId] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [storageError, setStorageError] = useState(false),
    [sessionEmail, setSessionEmail] = useState<string | null>(null),
    [authReady, setAuthReady] = useState(!supabase);
  const activeStorageKey = useRef(storageKey),
    activeUser = useRef<string | null | undefined>(undefined);
  const saveQueue = useRef<Promise<void>>(Promise.resolve()),
    documentGeneration = useRef(0),
    forceSaveGeneration = useRef<number | null>(null),
    pendingSaves = useRef(0);
  const skipSave = useRef(false),
    savedSnapshot = useRef<string | null>(null);
  useEffect(() => {
    const applySession = async (session: Session | null) => {
      const id = session?.user.id ?? null;
      setSessionEmail(session?.user.email ?? (id || null));
      setAuthReady(true);
      if (activeUser.current === id) return;
      activeUser.current = id;
      const generation = ++documentGeneration.current;
      setLoaded(false);
      setPage("dashboard");
      setActiveId(null);
      setModal(null);
      setSidebar(false);
      if (supabase && !id) return;
      activeStorageKey.current = workspaceStorageKey(
        supabase ? id! : undefined,
      );
      skipSave.current = false;
      setStorageError(false);
      try {
        const key = activeStorageKey.current;
        const stored = await readWorkspace(key);
        if (generation !== documentGeneration.current) return;
        savedSnapshot.current = stored ? JSON.stringify(stored) : null;
        setData(
          stored ??
            (supabase
              ? {
                  version: 1,
                  teamName: "新しいチーム",
                  season: "2026",
                  players: [],
                  games: [],
                }
              : createDemo()),
        );
      } catch {
        skipSave.current = true;
        setStorageError(true);
        setToast(
          "保存データを読み込めませんでした。設定からバックアップを復元してください。元データは上書きしていません。",
        );
      }
      setLoaded(true);
    };
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (!supabase) {
      applySession(null);
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => setAuthReady(true));
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setInterval(
      () =>
        setData((d) => {
          let changed = false;
          const games = d.games.map((g) => {
            const next = clockAt(g);
            if (next !== g) changed = true;
            return next;
          });
          return changed ? { ...d, games } : d;
        }),
      200,
    );
    return () => clearInterval(t);
  }, [loaded]);
  useEffect(() => {
    if (!loaded || skipSave.current) return;
    const snapshot = data,
      key = activeStorageKey.current,
      generation = documentGeneration.current;
    pendingSaves.current++;
    setSaving(true);
    saveQueue.current = saveQueue.current
      .then(async () => {
        if (generation !== documentGeneration.current || skipSave.current)
          return;
        try {
          const force = forceSaveGeneration.current === generation;
          const saved = await saveWorkspaceAtomic(
            snapshot,
            savedSnapshot.current ? JSON.parse(savedSnapshot.current) : null,
            key,
            force,
          );
          if (generation !== documentGeneration.current) return;
          forceSaveGeneration.current = null;
          savedSnapshot.current = JSON.stringify(saved);
          setStorageError(false);
        } catch (e) {
          if (generation !== documentGeneration.current) return;
          skipSave.current = true;
          setStorageError(true);
          setToast(
            e instanceof LocalConflict
              ? "別のタブでデータが変更されました。自動保存を停止しています。現在のデータをバックアップしてから再読み込みしてください。"
              : "端末への保存に失敗しました。バックアップをダウンロードしてください。",
          );
        }
      })
      .finally(() => {
        pendingSaves.current--;
        if (pendingSaves.current === 0) setSaving(false);
      });
  }, [data, loaded]);
  useEffect(() => {
    if (!saving && !storageError) return;
    const guard = (e: BeforeUnloadEvent) => {
      if (
        !storageError &&
        savedSnapshot.current &&
        fingerprint(data) === fingerprint(JSON.parse(savedSnapshot.current))
      )
        return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [saving, storageError, data]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  const navigate = (p: Page) => {
    setPage(p);
    setSidebar(false);
    setSearch("");
  };
  const openGame = (g: Game) => {
    setActiveId(g.id);
    navigate(g.status === "finished" ? "analysis" : "live");
  };
  const goLive = () => {
    const g =
      data.games.find((g) => g.season === data.season && g.status === "live") ??
      data.games.find(
        (g) => g.season === data.season && g.status === "scheduled",
      );
    if (g) {
      setActiveId(g.id);
      navigate("live");
    } else create("game");
  };
  const updateGame = (g: Game) =>
    setData((d) => ({
      ...d,
      games: d.games.map((x) => (x.id === g.id ? g : x)),
    }));
  const replace = (w: Workspace) => {
    workspaceSchema.parse(w);
    skipSave.current = false;
    documentGeneration.current++;
    forceSaveGeneration.current = documentGeneration.current;
    setData(w);
    setActiveId(null);
    setToast("データを更新しました");
  };
  const receiveCloud = useCallback((w: Workspace) => {
    setData(w);
    setToast("クラウドの最新データを読み込みました");
  }, []);
  const cloud = useCloud(
    data,
    loaded && !storageError && !saving,
    receiveCloud,
  );
  const canEdit = cloud.link?.role !== "viewer";
  const create = (kind: "player" | "game") => {
    if (!canEdit) {
      setToast("閲覧者は記録や選手の変更ができません");
      return;
    }
    setModal(kind);
  };
  const games = data.games.filter((g) => g.season === data.season),
    active =
      games.find((g) => g.id === activeId) ??
      games.find((g) => g.status === "live") ??
      games[games.length - 1];
  if (supabase && !authReady)
    return (
      <main className="login-screen">
        <p role="status">セッションを確認しています…</p>
      </main>
    );
  if (supabase && !sessionEmail) return <Login />;
  if (!loaded)
    return (
      <main className="login-screen">
        <p role="status">記録を読み込んでいます…</p>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-mark">
            <svg viewBox="0 0 32 32" fill="none">
              <path
                d="M27 8A13 13 0 1 0 27 24M5 8l17 16M5 24L22 8M2 16h21"
                stroke="currentColor"
                strokeWidth="2.5"
              />
              <path
                d="M24 11l6 5-6 5"
                stroke="currentColor"
                strokeWidth="2.5"
              />
            </svg>
          </span>
          <span>
            COURT<span className="brand-light">VISION</span>
            <small>BASKETBALL ANALYTICS</small>
          </span>
        </a>
        <button className="team-switch" onClick={() => navigate("settings")}>
          <span className="team-mini">A</span>
          <span>
            <strong>{data.teamName}</strong>
            <small>バスケットボール部</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() =>
                item.id === "live" ? goLive() : navigate(item.id)
              }
            >
              <item.icon size={18} />
              <span>{item.name}</span>
              {item.id === "live" && <span className="live-dot" />}
              {page === item.id && <span className="nav-selected" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="season-card">
            <span className="season-mini">SEASON {data.season}</span>
            <strong>積み重ねが、強さになる。</strong>
            <p>
              一つひとつのプレーを、
              <br />
              チームの成長へ。
            </p>
            <span className="season-line" />
            <ChartNoAxesCombined size={65} />
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings size={18} />
            設定・データ管理
          </button>
          <button className="nav-item" onClick={() => setModal("help")}>
            <CircleHelp size={18} />
            使い方ガイド
            <ArrowUpRight size={14} />
          </button>
          <button className="user-profile" onClick={() => navigate("settings")}>
            <span className="user-avatar">{sessionEmail ? "U" : "CV"}</span>
            <span>
              <strong>{sessionEmail ?? "デモワークスペース"}</strong>
              <small>
                {sessionEmail ? "アカウント設定" : "ローカルモード"}
              </small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          className="sidebar-overlay"
          aria-label="メニューを閉じる"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="main-wrap">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setSidebar(!sidebar)}
            aria-label="メニュー"
          >
            {sidebar ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="breadcrumb">
            ワークスペース<span>/</span>
            <strong>{nav.find((n) => n.id === page)?.name ?? "設定"}</strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={15} />
              <input
                placeholder="試合・選手を検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>⌕</kbd>
            </label>
            <span className="topbar-divider" />
            <select
              aria-label="シーズン"
              className="season-select"
              value={data.season}
              onChange={(e) => {
                setData((d) => ({ ...d, season: e.target.value }));
                setActiveId(null);
              }}
            >
              {[
                ...new Set([
                  data.season,
                  ...data.games.map((g) => g.season),
                  ...data.players.map((p) => p.season),
                ]),
              ]
                .sort()
                .reverse()
                .map((s) => (
                  <option key={s} value={s}>
                    {s} シーズン
                  </option>
                ))}
            </select>
            <button
              className="notification-button icon-button"
              aria-label="保存・接続状態"
              onClick={() => setModal("notifications")}
            >
              <Bell size={18} />
              <i />
            </button>
          </div>
        </header>
        <main>
          {search ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">SEARCH</div>
                  <h1>検索結果</h1>
                  <p>「{search}」の試合と選手</p>
                </div>
                <button className="secondary" onClick={() => setSearch("")}>
                  検索を閉じる
                </button>
              </div>
              <GamesView
                data={data}
                onGame={openGame}
                onUpdate={canEdit ? updateGame : undefined}
                onNew={() => create("game")}
                query={search}
              />
              <PlayersView
                data={data}
                onNew={() => create("player")}
                query={search}
              />
            </>
          ) : (
            <>
              {page === "dashboard" && (
                <Dashboard
                  data={data}
                  onGames={() => navigate("games")}
                  onPlayers={() => navigate("players")}
                  onLive={goLive}
                  onAnalysis={() => {
                    setActiveId(null);
                    navigate("analysis");
                  }}
                  onGame={openGame}
                />
              )}
              {page === "games" && (
                <GamesView
                  data={data}
                  onGame={openGame}
                  onUpdate={canEdit ? updateGame : undefined}
                  onNew={() => create("game")}
                />
              )}
              {page === "players" && (
                <PlayersView
                  data={data}
                  onNew={() => create("player")}
                  onUpdate={
                    canEdit
                      ? (p) => {
                          setData((d) => ({
                            ...d,
                            players: d.players.map((x) =>
                              x.id === p.id ? p : x,
                            ),
                          }));
                          setToast("選手情報を更新しました");
                        }
                      : undefined
                  }
                />
              )}
              {page === "live" &&
                (active ? (
                  <LiveRecorder
                    game={active}
                    data={data}
                    readOnly={!canEdit}
                    onUpdate={updateGame}
                    notify={setToast}
                    onSelect={setActiveId}
                    onNew={() => create("game")}
                  />
                ) : (
                  <div className="empty">
                    <h2>最初の試合を登録しましょう</h2>
                    <button
                      className="primary"
                      onClick={() => setModal("game")}
                    >
                      試合を登録
                    </button>
                  </div>
                ))}
              {page === "analysis" && (
                <Analysis
                  data={data}
                  gameId={activeId}
                  onSelect={setActiveId}
                />
              )}{" "}
              {page === "settings" && (
                <SettingsView
                  data={data}
                  onReplace={replace}
                  notify={setToast}
                  email={sessionEmail}
                  beforeLogout={async () => {
                    await saveQueue.current;
                    if (skipSave.current)
                      throw new Error(
                        "保存できていない記録があります。先にJSONバックアップを保存してください",
                      );
                  }}
                  cloud={cloud}
                />
              )}
            </>
          )}
          <footer>
            <span>
              <span className="footer-logo">◉</span> COURTVISION{" "}
              <span className="muted">/ PLAY SMARTER. GROW TOGETHER.</span>
            </span>
            <span>
              {storageError
                ? "保存エラー — バックアップしてください"
                : saving
                  ? "端末に保存中…"
                  : loaded
                    ? "この端末に自動保存"
                    : "読み込み中"}{" "}
              <span className={`tiny-dot ${storageError ? "error-dot" : ""}`} />
            </span>
          </footer>
        </main>
      </div>
      {modal === "player" && (
        <Modal title="選手を追加" onClose={() => setModal(null)}>
          <PlayerForm
            season={data.season}
            existing={data.players}
            onSave={(p) => {
              setData((d) => ({ ...d, players: [...d.players, p] }));
              setModal(null);
              setToast("選手を追加しました");
            }}
          />
        </Modal>
      )}
      {modal === "game" && (
        <Modal title="新しい試合を登録" onClose={() => setModal(null)}>
          <GameForm
            players={data.players}
            season={data.season}
            onSave={(g) => {
              setData((d) => ({ ...d, games: [...d.games, g] }));
              setModal(null);
              setActiveId(g.id);
              navigate("live");
              setToast("試合を登録しました");
            }}
          />
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="COURTVISION の使い方" onClose={() => setModal(null)}>
          <div className="guide">
            <p>
              <b>1. 選手と試合を登録</b>
              <br />
              選手管理からメンバーを追加し、試合登録で出場選手とスタメン5人を設定します。
            </p>
            <p>
              <b>2. ライブで記録</b>
              <br />
              時計を開始 → 選手を選択 →
              スタッツをタップ。ショット位置はコートをタップして指定できます。Undo
              と履歴編集で誤入力を訂正できます。
            </p>
            <p>
              <b>3. 分析・共有</b>
              <br />
              終了した試合を分析画面で振り返り。CSV、印刷、JSON
              バックアップに対応しています。
            </p>
            <p className="notice">
              デモデータは架空です。現在の入力は端末内に保存します。複数端末で使うには、設定で
              Supabase
              に接続・ログインし、同期してください。オフライン時はこの端末で記録できます。
            </p>
          </div>
        </Modal>
      )}
      {modal === "notifications" && (
        <Modal title="保存・接続状態" onClose={() => setModal(null)}>
          <div className="guide">
            <p>
              <Check size={18} className="accent" />{" "}
              {storageError
                ? "端末保存に問題があります"
                : "端末内の自動保存が有効です"}
            </p>
            <p>
              <CloudOff size={18} />{" "}
              クラウドは設定画面から接続すると自動同期します。
            </p>
            <button
              className="secondary"
              onClick={() => {
                download(
                  "courtvision-backup.json",
                  JSON.stringify(data, null, 2),
                );
                setToast("バックアップを出力しました");
              }}
            >
              <Download size={16} />
              バックアップを保存
            </button>
            <button
              className="primary"
              onClick={() => {
                setModal(null);
                navigate("settings");
              }}
            >
              設定を開く
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="通知を閉じる" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
