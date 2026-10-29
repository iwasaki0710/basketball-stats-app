"use client";
import { useState } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/storage";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <main className="login-screen">
      <div className="login-card panel">
        <div className="eyebrow">COURTVISION / TEAM WORKSPACE</div>
        <h1>
          チームの次の一歩へ<span className="title-dot">.</span>
        </h1>
        <p>登録したメールアドレスで、安全にログイン。</p>
        <div className="portfolio-login">
          <a className="secondary full" href="/demo">
            ログインせずデモを試す <ArrowUpRight size={16} />
          </a>
          <a
            className="text-link"
            href="https://github.com/iwasaki0710/basketball-stats-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHubでソースコードを見る <ArrowUpRight size={13} />
          </a>
        </div>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage("");
            try {
              const { error } = await supabase!.auth.signInWithOtp({
                email: String(f.get("email")).trim(),
                options: { emailRedirectTo: window.location.origin },
              });
              setMessage(
                error
                  ? "ログインメールを送信できませんでした。接続設定・メールアドレス・送信制限を確認してください。"
                  : "ログインリンクを送信しました。メールを開いて、このブラウザでログインしてください。",
              );
            } catch {
              setMessage(
                "接続できませんでした。通信状態を確認して再試行してください。",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            メールアドレス
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="manager@example.com"
            />
          </label>
          <button className="primary full" disabled={busy}>
            {busy ? "送信中…" : "ログインリンクを送信"}
            <ArrowUpRight size={16} />
          </button>
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
        </form>
        <p className="login-note">
          <ShieldCheck size={15} />
          データはチーム単位の権限で保護されます。初めての方はメールログイン後、チームを作成または管理者に追加してもらってください。
        </p>
      </div>
    </main>
  );
}
