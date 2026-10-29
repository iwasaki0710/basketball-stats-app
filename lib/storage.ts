import { readDocument, saveWorkspaceAtomic } from "./database";
import { supabaseConfigurationError } from "./config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Workspace, workspaceSchema } from "./model";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigError = supabaseConfigurationError(url, key);
// Instantiate only when team-mode code actually accesses the SDK.
// A public demo must not restore or refresh an existing private session.
let client: SupabaseClient | undefined;
export const supabase: SupabaseClient | null =
  url && key && !supabaseConfigError
    ? new Proxy({} as SupabaseClient, {
        get(_target, property) {
          client ??= createClient(url, key);
          const value = Reflect.get(client, property, client);
          return typeof value === "function" ? value.bind(client) : value;
        },
      })
    : null;
export const storageKey = "courtvision.workspace.v1";
export function workspaceStorageKey(userId?: string) {
  return userId ? `${storageKey}:${userId}` : storageKey;
}
export async function readWorkspace(
  key = storageKey,
): Promise<Workspace | null> {
  const stored = await readDocument<Workspace>(key);
  if (stored) return workspaceSchema.parse(stored);
  const legacy = localStorage.getItem(key);
  if (!legacy) return null;
  const parsed = workspaceSchema.parse(JSON.parse(legacy));
  try {
    await saveWorkspaceAtomic(parsed, null, key);
    if (localStorage.getItem(key) === legacy) localStorage.removeItem(key);
    return parsed;
  } catch (e) {
    const migrated = await readDocument<Workspace>(key);
    if (migrated) return workspaceSchema.parse(migrated);
    throw e;
  }
}
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (typeof value !== "number" && /^[\s]*[=+@-]|^[\t\r\n]/.test(s))
    s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
