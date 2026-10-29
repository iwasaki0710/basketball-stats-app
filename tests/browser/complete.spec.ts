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
test("photo upload, growth chart, radar and opponent records work", async ({
  page,
}, info) => {
  await page.goto("/");
  await nav(page, "選手管理", info.project.name === "mobile");
  await page.locator(".player-card").first().click();
  await page.getByRole("button", { name: "編集", exact: true }).click();
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const x = c.getContext("2d")!;
    x.fillStyle = "#c1f36b";
    x.fillRect(0, 0, 32, 32);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("選手写真（任意）", { exact: true }).setInputFiles({
    name: "player.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(page.getByAltText("選手写真のプレビュー")).toBeVisible();
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page.locator(".profile-top .avatar img")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "試合別の成績推移" }),
  ).toBeVisible();
  await expect(
    page.locator(".profile-content .recharts-surface").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await nav(page, "チーム分析", info.project.name === "mobile");
  await expect(
    page.getByRole("heading", { name: "対戦相手別成績" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "選手比較", exact: true }).click();
  await expect(
    page.locator(".radar-chart .recharts-surface").first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
test("clock continues through navigation and reload", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await page.getByRole("button", { name: "時計を開始", exact: true }).click();
  const deadline = (await savedWorkspace(page)).games.find(
    (g) => g.id === "next-game",
  )!.clockTarget;
  await nav(page, "選手管理", info.project.name === "mobile");
  await expect
    .poll(
      async () =>
        (await savedWorkspace(page)).games.find((g) => g.id === "next-game")!
          .remaining,
    )
    .toBeLessThan(600);
  await page.reload();
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await expect(
    page.getByRole("button", { name: "時計を停止", exact: true }),
  ).toBeVisible();
  expect(
    (await savedWorkspace(page)).games.find((g) => g.id === "next-game")!
      .clockTarget,
  ).toBe(deadline);
  await page.getByRole("button", { name: "時計を停止", exact: true }).click();
});
test("detailed opponent input and event time correction reconcile", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await page.getByRole("button", { name: "新規試合", exact: true }).click();
  await page.getByLabel("対戦相手", { exact: true }).fill("比較大学");
  await page
    .getByRole("button", { name: "試合を登録する", exact: true })
    .click();
  await page.getByRole("button", { name: "2P 成功 ＋", exact: true }).click();
  await page.getByRole("button", { name: "相手チーム", exact: true }).click();
  await page.getByRole("button", { name: "3P 成功 ＋", exact: true }).click();
  await page.getByRole("button", { name: "3P 失敗 −", exact: true }).click();
  await page
    .getByRole("button", { name: "DREB ディフェンスREB", exact: true })
    .click();
  await expect(page.locator(".score-team.away > strong")).toHaveText("3");
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("2");
  await page.getByTitle("時計を修正").click();
  await page.getByRole("dialog").getByLabel("残り分").fill("9");
  await page.getByRole("dialog").getByLabel("秒", { exact: true }).fill("0");
  await page.getByRole("button", { name: "時計を更新" }).click();
  await page
    .getByRole("button", { name: "3P 失敗の履歴を編集", exact: true })
    .click();
  await page.getByRole("dialog").getByLabel("残り分").fill("9");
  await page.getByRole("dialog").getByLabel("残り秒").fill("45");
  await page.getByRole("button", { name: "訂正を保存" }).click();
  await expect
    .poll(
      async () =>
        (await savedWorkspace(page)).games
          .find((g) => g.opponent === "比較大学")!
          .events.find((e) => e.kind === "3PX")!.elapsed,
    )
    .toBe(15);
  await nav(page, "チーム分析", info.project.name === "mobile");
  const comparison = page.locator("section").filter({
    has: page.getByRole("heading", { name: "チーム比較", exact: true }),
  });
  await expect(
    comparison.getByRole("row").filter({ hasText: "FG%" }),
  ).toContainText("50.0%");
  await expect(
    comparison.getByRole("row").filter({ hasText: "REB" }),
  ).toContainText("1");
});
