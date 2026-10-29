/** Public browser keys only. Never bundle a service_role or sb_secret key. */
export function isPublicSupabaseKey(key: string): boolean {
  if (key.startsWith("sb_publishable_")) return key.length > 20;
  if (key.startsWith("sb_secret_")) return false;
  try {
    const body = JSON.parse(
      atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return key.split(".").length === 3 && body.role === "anon";
  } catch {
    return false;
  }
}
export function supabaseConfigurationError(
  url?: string,
  key?: string,
): string | null {
  if (!url && !key) return null;
  if (!url || !key) return "Supabase の URL と公開キーの両方を設定してください";
  try {
    const u = new URL(url);
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      )
    )
      return "Supabase URL は HTTPS を指定してください";
    if (u.username || u.password) return "URL に認証情報を含めないでください";
  } catch {
    return "Supabase URL の形式を確認してください";
  }
  if (!isPublicSupabaseKey(key))
    return "Supabase の公開用 anon / publishable キーを設定してください。秘密キーは使用できません";
  return null;
}
