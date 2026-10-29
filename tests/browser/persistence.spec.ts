import { test, expect } from "@playwright/test";
import { savedWorkspace } from "./workspace";
test("legacy storage migrates into IndexedDB without losing data", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("legacy-seeded")) return;
    localStorage.setItem(
      "courtvision.workspace.v1",
      JSON.stringify({
        version: 1,
        teamName: "以前のチーム",
        season: "2026",
        players: [],
        games: [],
      }),
    );
    sessionStorage.setItem("legacy-seeded", "1");
  });
  await page.goto("/");
  await expect(page.locator(".team-switch")).toContainText("以前のチーム");
  expect((await savedWorkspace(page)).teamName).toBe("以前のチーム");
  expect(
    await page.evaluate(() => localStorage.getItem("courtvision.workspace.v1")),
  ).toBeNull();
  await page.reload();
  await expect(page.locator(".team-switch")).toContainText("以前のチーム");
});
test("large season backup persists beyond localStorage size", async ({
  page,
}, info) => {
  await page.goto("/");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "メニュー", exact: true }).click();
  await page
    .getByRole("button", { name: "設定・データ管理", exact: true })
    .click();
  const photo = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 120;
    c.height = 120;
    const ctx = c.getContext("2d")!,
      image = ctx.createImageData(120, 120);
    let seed = 12;
    for (let i = 0; i < image.data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      image.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
    }
    ctx.putImageData(image, 0, 0);
    return c.toDataURL("image/png");
  });
  const workspace = {
    version: 1,
    teamName: "大容量シーズン",
    season: "2026",
    players: Array.from({ length: 100 }, (_, i) => ({
      id: `bulk-${i}`,
      name: `架空選手 ${i}`,
      number: i,
      position: "PG",
      year: 1,
      height: 180,
      season: "2026",
      photo,
    })),
    games: [],
  };
  const content = JSON.stringify(workspace);
  expect(content.length).toBeGreaterThan(5 * 1024 * 1024);
  await page.locator("input[type=file]").setInputFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  await expect(page.getByRole("status")).toContainText("復元しました");
  await expect
    .poll(async () => {
      const w = await savedWorkspace(page);
      return w.players.length;
    })
    .toBe(100);
  await page.reload();
  await expect(page.locator(".team-switch")).toContainText("大容量シーズン");
  expect((await savedWorkspace(page)).players).toHaveLength(100);
});
