import { readDocument, saveWorkspaceAtomic } from "./database";
import { supabaseConfigurationError } from "./config";
import { createClient } from "@supabase/supabase-js";
import { Workspace, workspaceSchema } from "./model";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigError = supabaseConfigurationError(url, key);
export const supabase =
  url && key && !supabaseConfigError ? createClient(url, key) : null;
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
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
