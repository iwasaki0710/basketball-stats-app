"use client";
import { useRef, useState } from "react";
import {
  Cloud,
  Download,
  Upload,
  ShieldCheck,
  Save,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Workspace, workspaceSchema } from "@/lib/model";
import { download, supabase, supabaseConfigError } from "@/lib/storage";
import { createDemo } from "@/lib/demo";
import { CloudState } from "@/lib/cloud";
import { Panel, Modal } from "./ui";
export default function SettingsView({
  data,
  onReplace,
  notify,
  email,
  cloud,
  beforeLogout,
}: {
  data: Workspace;
  onReplace: (w: Workspace) => void;
  notify: (s: string) => void;
  email: string | null;
  cloud: CloudState;
  beforeLogout?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<"empty" | "demo" | "load" | null>(null),
    [teamId, setTeamId] = useState(""),
    [teams, setTeams] = useState<
      { team_id: string; role: string; teams: { name: string } | null }[]
    >([]),
    [cloudError, setCloudError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  async function loadTeams() {
    if (!supabase) return;
    setBusy(true);
    const { data: rows, error } = await supabase
      .from("memberships")
      .select("team_id,role,teams(name)");
    setBusy(false);
    if (error) {
      setCloudError(error.message);
      return;
    }
    const normalized = (rows ?? []).map((r) => ({
      ...r,
      teams: (Array.isArray(r.teams) ? r.teams[0] : r.teams) as {
        name: string;
      } | null,
    }));
    setTeams(normalized);
    if (normalized[0]) setTeamId(normalized[0].team_id);
  }
  async function attach(create = false) {
    if (!supabase) return;
    setBusy(true);
    setCloudError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw Error("ログインしてください");
      let id = teamId,
        role = "admin";
      if (create) {
        const { data: idResult, error } = await supabase.rpc("create_team", {
          p_name: data.teamName,
        });
        if (error) throw error;
        id = String(idResult);
      } else role = teams.find((t) => t.team_id === id)?.role ?? "viewer";
      if (!id) throw Error("チームを選択してください");
      const { data: row, error } = await supabase
        .from("workspaces")
        .select("revision,data")
        .eq("team_id", id)
        .single();
      if (error) throw error;
      if (create || !row.data) {
        cloud.connect({
          teamId: id,
          userId: auth.user.id,
          revision: row.revision,
          hash: "",
          role,
        });
        notify("チームに接続しました。端末データを自動同期します。");
      } else {
        const w = workspaceSchema.parse(row.data);
        download(
          "courtvision-before-cloud-load.json",
          JSON.stringify(data, null, 2),
        );
        onReplace(w);
        cloud.connect({
          teamId: id,
          userId: auth.user.id,
          revision: row.revision,
          hash: JSON.stringify(w),
          role,
        });
        notify(
          "クラウドを読み込みました。変更前の端末データをバックアップしました。",
        );
      }
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : "接続に失敗しました");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE SETTINGS</div>
          <h1>
            設定・データ管理<span className="title-dot">.</span>
          </h1>
          <p>チームの記録を、安全に、長く。</p>
        </div>
        <span className="status-tag">LOCAL-FIRST</span>
      </div>
      <div className="settings-grid">
        <div>
          <Panel title="チーム設定" subtitle="TEAM PROFILE">
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                onReplace({
                  ...data,
                  teamName: String(f.get("name")).trim(),
                  season: String(f.get("season")),
                });
              }}
            >
              <label>
                チーム名
                <input
                  name="name"
                  defaultValue={data.teamName}
                  readOnly={!!cloud.link && cloud.link.role !== "admin"}
                  required
                  maxLength={80}
                />
              </label>
              <label>
                シーズン
                <input
                  name="season"
                  defaultValue={data.season}
                  pattern="[0-9]{4}"
                  required
                />
              </label>
              <button className="primary">
                <Save size={16} />
                設定を保存
              </button>
            </form>
          </Panel>
          <Panel title="バックアップ・復元" subtitle="DATA OWNERSHIP">
            <div className="settings-body">
              <p>
                全選手・試合・プレー履歴を JSON
                形式で保存します。端末のデータを削除する前に必ずバックアップしてください。
              </p>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      `courtvision-backup-${new Date().toISOString().slice(0, 10)}.json`,
                      JSON.stringify(data, null, 2),
                    )
                  }
                >
                  <Download size={16} />
                  バックアップ
                </button>
                <button
                  className="secondary"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={16} />
                  復元
                </button>
              </div>
              <input
                ref={fileRef}
                className="hidden-input"
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    if (f.size > 20 * 1024 * 1024)
                      throw Error("20MB以内のファイルを選択してください");
                    const w = workspaceSchema.parse(JSON.parse(await f.text()));
                    download(
                      "courtvision-before-restore.json",
                      JSON.stringify(data, null, 2),
                    );
                    cloud.disconnect();
                    onReplace(w);
                    notify(
                      "バックアップを復元しました。以前のデータもダウンロードしています。",
                    );
                  } catch {
                    notify(
                      "復元できませんでした。JSONの形式・ID・時刻・交代履歴を確認してください。",
                    );
                  }
                  e.target.value = "";
                }}
              />
              <p className="hint">
                復元時は現在のデータもバックアップします。イベントの整合性を検証し、不正なファイルは読み込みません。
              </p>
            </div>
          </Panel>
          <Panel title="データの初期化" subtitle="DEMO / NEW WORKSPACE">
            <div className="settings-body">
              <p>実際のチームを登録する前に架空データを削除できます。</p>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => setConfirm("demo")}
                >
                  デモデータを再生成
                </button>
                <button className="danger" onClick={() => setConfirm("empty")}>
                  <Trash2 size={15} />
                  空のチームで始める
                </button>
              </div>
            </div>
          </Panel>
        </div>
        <div>
          <Panel
            title="クラウド・アカウント"
            subtitle="SUPABASE AUTH & SYNC"
            action={<Cloud size={18} className="accent" />}
          >
            <div className="settings-body">
              {!supabase ? (
                <>
                  {supabaseConfigError && (
                    <p className="error-text" role="alert">
                      {supabaseConfigError}
                    </p>
                  )}
                  <span className="status-tag">ローカルモード</span>
                  <p>
                    この端末に自動保存しています。クラウド保存・複数端末の利用には
                    Supabase の接続設定が必要です。
                  </p>
                  <div className="notice">
                    README の手順で SQL マイグレーションを適用し、
                    <code>NEXT_PUBLIC_SUPABASE_URL</code> と{" "}
                    <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
                    を設定して再起動してください。秘密鍵はブラウザに設定しないでください。
                  </div>
                </>
              ) : !email ? (
                <form
                  className="form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    const f = new FormData(e.currentTarget);
                    const { error } = await supabase!.auth.signInWithOtp({
                      email: String(f.get("email")),
                      options: { emailRedirectTo: window.location.origin },
                    });
                    setBusy(false);
                    notify(
                      error
                        ? error.message
                        : "ログインリンクをメールで送信しました",
                    );
                  }}
                >
                  <p>メールのマジックリンクでログインします。</p>
                  <label>
                    メールアドレス
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="manager@example.com"
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    ログインリンクを送信
                  </button>
                </form>
              ) : (
                <>
                  <p className="accent">{email}</p>
                  <p>同期状態：{cloud.status}</p>
                  {cloud.link && (
                    <div className="notice">
                      チームID：<code>{cloud.link.teamId}</code>
                      <br />
                      権限：{cloud.link.role} / revision {cloud.link.revision}
                      <br />
                      変更は自動送信します。閲覧中の最新データは10秒ごとに確認します。オフライン中は端末に保持し、接続回復後に再送します。
                    </div>
                  )}
                  {cloud.conflict && (
                    <p className="error-text">
                      同じプレーの訂正、または交代順序が競合しています。自動統合できないため、ローカルの変更を保持しています。バックアップしてから「クラウドを読み込む」で最新状態を取得してください。
                    </p>
                  )}
                  <div className="button-row">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={loadTeams}
                    >
                      <RefreshCw size={15} />
                      チーム一覧を取得
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => attach(true)}
                    >
                      <Plus size={15} />
                      新規クラウドチーム
                    </button>
                  </div>
                  {teams.length > 0 && (
                    <div className="form">
                      <label>
                        所属チーム
                        <select
                          value={teamId}
                          onChange={(e) => setTeamId(e.target.value)}
                        >
                          {teams.map((t) => (
                            <option key={t.team_id} value={t.team_id}>
                              {t.teams?.name} ({t.role})
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => setConfirm("load")}
                      >
                        クラウドを読み込む
                      </button>
                    </div>
                  )}
                  {cloud.link && (
                    <div className="button-row">
                      <button className="secondary" onClick={cloud.retry}>
                        <RefreshCw size={15} />
                        同期を再試行
                      </button>
                      <button className="secondary" onClick={cloud.disconnect}>
                        同期を解除
                      </button>
                    </div>
                  )}
                  <button
                    className="text-link"
                    onClick={async () => {
                      try {
                        await beforeLogout?.();
                        cloud.disconnect();
                        const { error } = await supabase!.auth.signOut();
                        if (error)
                          throw new Error(
                            "ログアウトできませんでした。通信状態を確認してください",
                          );
                        notify(
                          "ログアウトしました。端末データは保持しています。",
                        );
                      } catch (e) {
                        notify(
                          e instanceof Error
                            ? e.message
                            : "ログアウトできませんでした",
                        );
                      }
                    }}
                  >
                    <LogOut size={15} />
                    ログアウト
                  </button>
                  {cloudError && (
                    <p className="error-text" role="alert">
                      {cloudError}
                    </p>
                  )}
                </>
              )}
            </div>
          </Panel>
          <Panel
            title="チームメンバーの権限"
            subtitle="ROLE-BASED ACCESS"
            action={<ShieldCheck size={18} className="accent" />}
          >
            <div className="settings-body">
              <div className="role-row">
                <b>管理者</b>
                <span>チーム管理・記録・閲覧</span>
              </div>
              <div className="role-row">
                <b>記録担当</b>
                <span>記録・訂正・閲覧</span>
              </div>
              <div className="role-row">
                <b>閲覧者</b>
                <span>クラウド読み取りのみ</span>
              </div>
              <p className="hint">
                権限はデータベースの RLS
                と同期関数でも検証します。閲覧者のローカル操作はクラウドへ送信されません。
              </p>
              {email && cloud.link?.role === "admin" && (
                <form
                  className="form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const { error } = await supabase!.rpc("add_team_member", {
                      p_team: cloud.link!.teamId,
                      p_email: String(f.get("email")),
                      p_role: String(f.get("role")),
                    });
                    notify(error ? error.message : "メンバーを追加しました");
                  }}
                >
                  <label>
                    登録済みユーザーのメール
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    権限
                    <select name="role">
                      <option value="recorder">記録担当</option>
                      <option value="viewer">閲覧者</option>
                      <option value="admin">管理者</option>
                    </select>
                  </label>
                  <button className="secondary">メンバーを追加・更新</button>
                </form>
              )}
            </div>
          </Panel>
          <Panel title="オフラインでの利用" subtitle="PROGRESSIVE WEB APP">
            <div className="settings-body">
              <p>
                ブラウザの「ホーム画面に追加」からインストールできます。一度開いた画面をキャッシュし、通信が切れてもプレー入力と端末保存を続けられます。
              </p>
              <p className="hint">
                ブラウザのストレージ削除・端末故障に備え、定期的に JSON
                バックアップも保管してください。
              </p>
            </div>
          </Panel>
        </div>
      </div>
      {confirm && (
        <Modal
          title={
            confirm === "load"
              ? "クラウドデータを読み込みますか？"
              : "データを切り替えますか？"
          }
          onClose={() => setConfirm(null)}
        >
          <div className="form">
            <p>現在の端末データを JSON にバックアップしてから切り替えます。</p>
            <button
              className="primary full"
              disabled={busy}
              onClick={() => {
                if (confirm === "load") {
                  attach();
                  return;
                }
                download(
                  "courtvision-before-reset.json",
                  JSON.stringify(data, null, 2),
                );
                cloud.disconnect();
                onReplace(
                  confirm === "demo"
                    ? createDemo()
                    : {
                        version: 1,
                        teamName: "新しいチーム",
                        season: "2026",
                        players: [],
                        games: [],
                      },
                );
                setConfirm(null);
              }}
            >
              {busy ? "接続中…" : "バックアップして続ける"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
