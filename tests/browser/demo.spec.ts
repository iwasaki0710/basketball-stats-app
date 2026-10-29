import { test, expect } from "@playwright/test";
import { savedWorkspace } from "./workspace";
async function nav(
  page: import("@playwright/test").Page,
  name: string,
  mobile: boolean,
) {
  if (mobile)
    await page.getByRole("button", { name: "メニュー", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).first().click();
}
test("public demo is editable and isolated from team data", async ({
  page,
}, info) => {
  await page.goto("/");
  const original = await savedWorkspace(page);
  await page.goto("/demo");
  await expect(
    page.getByText("ログイン不要の体験デモ", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "GitHubでコードを見る" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/iwasaki0710/basketball-stats-app",
  );
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await page.getByRole("button", { name: "2P 成功 ＋", exact: true }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("2");
  await expect(page.locator("footer")).toContainText("この端末に自動保存");
  await page.reload();
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("2");
  expect(await savedWorkspace(page)).toEqual(original);
  await nav(page, "設定・データ管理", info.project.name === "mobile");
  await expect(
    page.getByText("デモ専用・クラウド同期なし", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ログインリンクを送信", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "デモをリセット", exact: true })
    .click();
  await page
    .getByRole("button", { name: "初期データに戻す", exact: true })
    .click();
  await expect(page.locator("footer")).toContainText("この端末に自動保存");
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("0");
  expect(await savedWorkspace(page)).toEqual(original);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
test("demo route reloads offline from its own cached document", async ({
  page,
  context,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByText("ログイン不要の体験デモ", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await cdp.detach();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText("ログイン不要の体験デモ", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await page.getByRole("button", { name: "3P 成功 ＋", exact: true }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("3");
  await context.setOffline(false);
});
