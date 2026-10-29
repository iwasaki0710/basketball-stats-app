import { demoStorageKey } from "../lib/demo";
import { test } from "node:test";
import assert from "node:assert/strict";
import { supabaseConfigurationError, isPublicSupabaseKey } from "../lib/config";
import { workspaceStorageKey, csvCell } from "../lib/storage";
const jwt = (role: string) =>
  `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ role }))}.testsignature`;
test("public configuration accepts anon and publishable, never service-role or secret keys", () => {
  assert.equal(isPublicSupabaseKey(jwt("anon")), true);
  assert.equal(isPublicSupabaseKey(jwt("service_role")), false);
  assert.equal(isPublicSupabaseKey("sb_secret_not-a-real-test-key"), false);
  assert.equal(isPublicSupabaseKey("sb_publishable_not-a-real-test-key"), true);
  assert.equal(supabaseConfigurationError(), null);
  assert.match(
    supabaseConfigurationError("https://project.supabase.co")!,
    /両方/,
  );
  assert.match(
    supabaseConfigurationError("http://project.supabase.co", jwt("anon"))!,
    /HTTPS/,
  );
  assert.match(
    supabaseConfigurationError(
      "https://user:password@project.supabase.co",
      jwt("anon"),
    )!,
    /認証情報/,
  );
  assert.equal(
    supabaseConfigurationError("https://project.supabase.co", jwt("anon")),
    null,
  );
});
test("different accounts have different local workspace storage", () => {
  assert.notEqual(workspaceStorageKey("user-a"), workspaceStorageKey("user-b"));
  assert.notEqual(demoStorageKey, workspaceStorageKey("user-a"));
  assert.notEqual(demoStorageKey, workspaceStorageKey());
  assert.notEqual(workspaceStorageKey("user-a"), workspaceStorageKey());
  assert.equal(workspaceStorageKey(), "courtvision.workspace.v1");
});
test("CSV treats whitespace-prefixed formulas as text", () => {
  assert.equal(csvCell(-5), '"-5"');
  assert.equal(csvCell("  =SUM(1,2)"), '"\'  =SUM(1,2)"');
  assert.equal(csvCell("\n+1"), '"\'\n+1"');
});
