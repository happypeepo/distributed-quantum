export type PersistenceResult = "granted" | "denied" | "unavailable";

export type StorageWarning = "usage-high" | "not-persisted";

export interface StorageStatus {
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
  usedRatio: number | null;
}

const PERSIST_RESULT_KEY = "vault:storage_persist:v1";

let pending: Promise<PersistenceResult> | null = null;

function getStorageManager(): StorageManager | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.storage;
}

function readRemembered(): "granted" | "denied" | null {
  try {
    const value = localStorage.getItem(PERSIST_RESULT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

function remember(result: "granted" | "denied"): void {
  try {
    localStorage.setItem(PERSIST_RESULT_KEY, result);
  } catch {
    // Private browsing or quota exceeded: we may ask again next session.
  }
}

async function attempt<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function requestPersistence(): Promise<PersistenceResult> {
  const storage = getStorageManager();
  if (!storage || typeof storage.persist !== "function") return "unavailable";

  const remembered = readRemembered();
  if (remembered) return remembered;

  try {
    // Some browsers grant persistence on their own; only ask if they did not.
    const granted = (await storage.persisted()) || (await storage.persist());
    const result = granted ? "granted" : "denied";
    remember(result);
    return result;
  } catch {
    return "unavailable";
  }
}

/**
 * Ask the browser not to evict the vault. The request is made once per browser
 * profile and its outcome is remembered, because Firefox shows a permission
 * prompt on every `persist()` call. Never rejects.
 */
export function requestPersistenceOnce(): Promise<PersistenceResult> {
  if (!pending) {
    pending = requestPersistence().finally(() => {
      pending = null;
    });
  }
  return pending;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = getStorageManager();
  if (!storage) return { persisted: null, usage: null, quota: null, usedRatio: null };

  const [persisted, estimate] = await Promise.all([
    attempt(() => storage.persisted()),
    attempt(() => storage.estimate()),
  ]);

  const usage = estimate?.usage ?? null;
  const quota = estimate?.quota ?? null;
  const usedRatio = usage !== null && quota !== null && quota > 0 ? usage / quota : null;

  return { persisted, usage, quota, usedRatio };
}

/**
 * Nothing to lose in an empty vault, so only warn once it holds items. Low
 * storage wins over missing persistence because it is the more urgent failure.
 */
export function evaluateStorageWarning(
  status: StorageStatus,
  options: { hasItems: boolean; warnRatio: number },
): StorageWarning | null {
  if (!options.hasItems) return null;
  if (status.usedRatio !== null && status.usedRatio >= options.warnRatio) return "usage-high";
  if (status.persisted === false) return "not-persisted";
  return null;
}
