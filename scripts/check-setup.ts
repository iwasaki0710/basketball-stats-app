import { existsSync } from "node:fs";
import { supabaseConfigurationError } from "../lib/config";
async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  console.log("Supabase URL:", url ? "set" : "missing");
  console.log("Supabase public key:", key ? "set" : "missing");
  if (!url || !key) {
    console.error(
      "未設定です。docs/launch-guide.md の手順で2つの公開用接続設定を登録してください。",
    );
    process.exit(1);
  }
  const error = supabaseConfigurationError(url, key);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log("公開用接続設定の形式: OK");
  console.log("接続先ホスト:", new URL(url).hostname);
  if (process.argv.includes("--network")) {
    try {
      const response = await fetch(
        `${url.replace(/\/$/, "")}/auth/v1/settings`,
        { headers: { apikey: key }, signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) {
        console.error(
          `認証サービスへの接続失敗: HTTP ${response.status}。公開キー・プロジェクト・許可ドメインを確認してください。`,
        );
        process.exit(1);
      }
      console.log(
        "Supabase Auth endpoint: OK（メール送信とRLSはブラウザで別途確認）",
      );
    } catch {
      console.error(
        "接続できません。プロジェクトの稼働状態と環境設定の許可ドメインを確認してください。",
      );
      process.exit(1);
    }
  }
}
main().catch(() => {
  console.error("接続設定の確認に失敗しました");
  process.exitCode = 1;
});
