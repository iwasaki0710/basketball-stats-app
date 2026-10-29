import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { savedWorkspace } from "./workspace";
async function settings(
  page: import("@playwright/test").Page,
  mobile: boolean,
) {
  if (mobile)
    await page.getByRole("button", { name: "メニュー", exact: true }).click();
  await page
    .getByRole("button", { name: "設定・データ管理", exact: true })
    .click();
}
test("backup, empty workspace, and validated restore work", async ({
  page,
}, info) => {
  await page.goto("/");
  await settings(page, info.project.name === "mobile");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "バックアップ", exact: true }).click();
  const file = await pending;
  const path = await file.path();
  const content = await readFile(path!);
  expect(JSON.parse(content.toString()).players).toHaveLength(10);
  await page
    .getByRole("button", { name: "空のチームで始める", exact: true })
    .click();
  await page.getByRole("button", { name: "バックアップして続ける" }).click();
  await expect
    .poll(async () => (await savedWorkspace(page)).players.length)
    .toBe(0);
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: content,
  });
  await expect(page.getByRole("status")).toContainText("復元しました");
  await expect
    .poll(async () => (await savedWorkspace(page)).players.length)
    .toBe(10);
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":1}'),
  });
  await expect(page.getByRole("status")).toContainText("復元できませんでした");
  expect((await savedWorkspace(page)).players.length).toBe(10);
});
