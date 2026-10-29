import { test, expect } from "@playwright/test";
import { savedWorkspace } from "./workspace";
test("offline reload preserves data and recording remains available", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((r) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => r(),
          { once: true },
        ),
      );
  });
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await page.getByRole("button", { name: "3P 成功 ＋", exact: true }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("3");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await cdp.detach();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("3");
  await page.getByRole("button", { name: "2P 成功 ＋", exact: true }).click();
  await expect(
    page.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("5");
  await context.setOffline(false);
});
test("clock, quarter transition and finish persist consistent time", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "試合を記録する" }).click();
  await page.getByRole("button", { name: "時計を開始", exact: true }).click();
  await expect
    .poll(async () => page.locator(".score-clock > button").textContent())
    .not.toBe("10:00");
  await page.getByRole("button", { name: "時計を停止", exact: true }).click();
  await page.getByTitle("時計を修正").click();
  await page.getByRole("dialog").getByLabel("残り分").fill("0");
  await page.getByRole("dialog").getByLabel("秒", { exact: true }).fill("0");
  await page.getByRole("button", { name: "時計を更新" }).click();
  await page.getByRole("button", { name: "次のQ" }).click();
  await expect(page.locator(".score-clock > span")).toHaveText("2Q");
  await expect(page.locator(".score-clock > button")).toHaveText("10:00");
  await page.getByRole("button", { name: "試合を終了する" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "試合を終了", exact: true })
    .click();
  await expect(page.getByText("FINAL", { exact: true })).toBeVisible();
});
test("another tab cannot silently overwrite recorded plays", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "試合を記録する" }).click();
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "試合を記録する" }).click();
  await other.getByRole("button", { name: "3P 成功 ＋", exact: true }).click();
  await expect(
    other.locator(".score-team").first().locator(":scope > strong"),
  ).toHaveText("3");
  await page.getByRole("button", { name: "2P 成功 ＋", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("別のタブ");
  const saved = (await savedWorkspace(page)).games.find(
    (g) => g.id === "next-game",
  )!.events;
  expect(saved).toHaveLength(1);
  expect(saved[0].kind).toBe("3PM");
  await other.close();
});
