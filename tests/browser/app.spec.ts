import { test, expect } from "@playwright/test";
async function navigate(
  page: import("@playwright/test").Page,
  name: string,
  mobile: boolean,
) {
  if (mobile)
    await page.getByRole("button", { name: "メニュー", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).first().click();
}
test("dashboard renders, navigation works, and the layout fits", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "チームダッシュボード." }),
  ).toBeVisible();
  await expect(page.getByText("シーズン成績", { exact: true })).toBeVisible();
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: `/tmp/courtvision-${info.project.name}.png`,
    fullPage: true,
  });
  await navigate(page, "選手管理", info.project.name === "mobile");
  await expect(page.locator(".player-card")).toHaveCount(10);
  await page.locator(".player-card").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await navigate(page, "チーム分析", info.project.name === "mobile");
  await expect(
    page.getByRole("heading", { name: "チーム分析." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "選手比較", exact: true }).click();
  await expect(page.getByRole("heading", { name: "選手比較表" })).toBeVisible();
  await page
    .getByRole("button", { name: "戦術・ラインナップ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ラインナップ別 Plus / Minus" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("records scoring, undo, edit, substitution and persistence", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await expect(
    page.getByRole("heading", { name: "ライブ記録." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "2P 成功 ＋", exact: true }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("2");
  await page.getByRole("button", { name: "3P 成功 ＋", exact: true }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("5");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("2");
  await page.getByRole("button", { name: "2P 成功の履歴を編集" }).click();
  await page.getByRole("dialog").getByLabel("イベント").selectOption("2PX");
  await page.getByRole("button", { name: "訂正を保存" }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("0");
  await page.getByRole("button", { name: "選手交代", exact: true }).click();
  await page.getByRole("button", { name: "交代を確定" }).click();
  await expect(page.locator(".court-player.selected")).toContainText(
    "小林 海斗",
  );
  await page.getByRole("button", { name: "FT 成功 ＋", exact: true }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("1");
  await page.reload();
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("1");
  await expect(page.locator(".court-player")).toHaveCount(5);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
test("registers a player and game with selected starters", async ({
  page,
}, info) => {
  await page.goto("/");
  await navigate(page, "選手管理", info.project.name === "mobile");
  await page.getByRole("button", { name: "選手を追加", exact: true }).click();
  await page.getByLabel("選手名", { exact: true }).fill("テスト 選手");
  await page.getByLabel("背番号", { exact: true }).fill("99");
  await page.getByRole("button", { name: "選手を登録する" }).click();
  await expect(
    page.locator(".player-card").filter({ hasText: "テスト 選手" }),
  ).toBeVisible();
  await navigate(page, "試合一覧", info.project.name === "mobile");
  await page.getByRole("button", { name: "試合を登録", exact: true }).click();
  await page.getByLabel("対戦相手", { exact: true }).fill("テスト大学");
  await page
    .getByRole("button", { name: "試合を登録する", exact: true })
    .click();
  await expect(page.locator(".score-team.away")).toContainText("テスト大学");
  await expect(page.locator(".court-player")).toHaveCount(5);
});
