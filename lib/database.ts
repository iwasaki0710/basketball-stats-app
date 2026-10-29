import { Workspace, workspaceSchema } from "./model";
import { fingerprint } from "./merge";
let connection: Promise<IDBDatabase> | undefined;
function database() {
  if (!connection)
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("courtvision", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("documents"))
          request.result.createObjectStore("documents");
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        connection = undefined;
        reject(request.error);
      };
      request.onblocked = () => {
        connection = undefined;
        reject(Error("他のタブを閉じて保存を再試行してください"));
      };
    });
  return connection;
}
export async function readDocument<T>(key: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readonly"),
      request = tx.objectStore("documents").get(key);
    let value: T | undefined;
    request.onsuccess = () => {
      value = request.result as T | undefined;
    };
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
export async function writeDocument(
  key: string,
  value: unknown,
): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite", {
      durability: "strict",
    });
    if (value === undefined) tx.objectStore("documents").delete(key);
    else tx.objectStore("documents").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
export class LocalConflict extends Error {}
/** Read/compare/write share a transaction, including across tabs. */
export async function saveWorkspaceAtomic(
  w: Workspace,
  base: Workspace | null,
  key: string,
  force = false,
): Promise<Workspace> {
  const checked = workspaceSchema.parse(w),
    db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite", {
        durability: "strict",
      }),
      store = tx.objectStore("documents"),
      request = store.get(key);
    let error: unknown;
    request.onsuccess = () => {
      try {
        const previous = request.result as Workspace | undefined;
        if (
          !force &&
          (previous ? fingerprint(previous) : null) !==
            (base ? fingerprint(base) : null)
        ) {
          if (previous && fingerprint(previous) === fingerprint(checked))
            return;
          throw new LocalConflict("別のタブでデータが変更されました");
        }
        store.put(checked, key);
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(checked);
    tx.onabort = () => reject(error ?? tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
