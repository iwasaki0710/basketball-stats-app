import { expect, Page } from "@playwright/test";
import type { Workspace } from "../../lib/model";
export async function savedWorkspace(page: Page): Promise<Workspace> {
  let value: Workspace | undefined;
  await expect
    .poll(async () => {
      value = await page.evaluate(
        () =>
          new Promise<Workspace | undefined>((resolve, reject) => {
            const open = indexedDB.open("courtvision", 1);
            open.onsuccess = () => {
              const db = open.result,
                request = db
                  .transaction("documents")
                  .objectStore("documents")
                  .get("courtvision.workspace.v1");
              request.onsuccess = () => {
                db.close();
                resolve(request.result);
              };
              request.onerror = () => reject(request.error);
            };
            open.onerror = () => reject(open.error);
          }),
      );
      return !!value;
    })
    .toBe(true);
  return value!;
}
