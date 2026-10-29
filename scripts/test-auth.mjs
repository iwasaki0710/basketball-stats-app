// Browser integration against mocked Auth responses, not a live Supabase service.
import { mkdtemp, cp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const root = process.cwd(),
  directory = await mkdtemp(join(tmpdir(), "courtvision-auth-"));
const userA = "11111111-1111-4111-8111-111111111111",
  userB = "22222222-2222-4222-8222-222222222222";
const jwt = (role, sub) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ role, sub, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.mock-signature`;
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://courtvision-test.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon", userA),
  NEXT_TELEMETRY_DISABLED: "1",
};
let server, browser;
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(root, "node_modules/next/dist/bin/next"), ...args],
      { cwd: directory, env, stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`Next.js exited ${code}`)),
    );
  });
try {
  for (const path of [
    "app",
    "components",
    "lib",
    "public",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.ts",
    "postcss.config.mjs",
  ])
    await cp(join(root, path), join(directory, path), { recursive: true });
  await symlink(
    join(root, "node_modules"),
    join(directory, "node_modules"),
    "dir",
  );
  await run(["build"]);
  server = spawn(
    process.execPath,
    [
      join(root, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3101",
    ],
    { cwd: directory, env, stdio: "inherit" },
  );
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3101")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw Error("Auth test server did not start");
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  let sentEmail = "";
  await context.route(
    "https://courtvision-test.supabase.co/**",
    async (route) => {
      const url = route.request().url();
      if (new URL(url).pathname.endsWith("/otp"))
        sentEmail = route.request().postDataJSON().email;
      await route.fulfill({
        status: url.includes("/logout") ? 204 : 200,
        contentType: "application/json",
        body: url.includes("/logout") ? "" : JSON.stringify({}),
      });
    },
  );
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3101");
  await expect(
    page.getByRole("heading", { name: "チームの次の一歩へ." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "チームダッシュボード." }),
  ).toHaveCount(0);
  await page
    .getByLabel("メールアドレス", { exact: true })
    .fill("manager@test.invalid");
  await page
    .getByRole("button", { name: "ログインリンクを送信", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("送信しました");
  expect(sentEmail).toBe("manager@test.invalid");
  console.log("PASS: unauthenticated gate and magic-link request (mocked)");
  const session = (id, email) => ({
    access_token: jwt("authenticated", id),
    refresh_token: "mock-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id,
      email,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: { provider: "email" },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  });
  const privateWorkspace = {
    version: 1,
    teamName: "PRIVATE TEAM A",
    season: "2026",
    players: [],
    games: [],
  };
  await page.evaluate(
    ({ session, workspace }) => {
      localStorage.setItem(
        "sb-courtvision-test-auth-token",
        JSON.stringify(session),
      );
      localStorage.setItem(
        `courtvision.workspace.v1:${session.user.id}`,
        JSON.stringify(workspace),
      );
    },
    { session: session(userA, "a@test.invalid"), workspace: privateWorkspace },
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "チームダッシュボード." }),
  ).toBeVisible();
  await expect(page.locator(".team-switch")).toContainText("PRIVATE TEAM A");
  await page
    .getByRole("button", { name: "設定・データ管理", exact: true })
    .click();
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "チームの次の一歩へ." }),
  ).toBeVisible();
  await expect(page.getByText("PRIVATE TEAM A", { exact: true })).toHaveCount(
    0,
  );
  console.log(
    "PASS: authenticated workspace loads and logout locks it (mocked session)",
  );
  await page.evaluate(
    (session) =>
      localStorage.setItem(
        "sb-courtvision-test-auth-token",
        JSON.stringify(session),
      ),
    session(userB, "b@test.invalid"),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "チームダッシュボード." }),
  ).toBeVisible();
  await expect(page.locator(".team-switch")).toContainText("新しいチーム");
  await expect(page.getByText("PRIVATE TEAM A", { exact: true })).toHaveCount(
    0,
  );
  console.log(
    "PASS: switching accounts does not expose the other account cache (mocked session)",
  );
  console.log(
    "3 mocked Auth browser scenarios passed. Live email delivery and production RLS still require a real project.",
  );
  await context.close();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null || server.signalCode !== null) resolve();
      else server.once("exit", resolve);
    });
  }
  await rm(directory, { recursive: true, force: true });
}
