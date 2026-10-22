import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  evaluateStorageWarning,
  getStorageStatus,
  requestPersistenceOnce,
} from "../src/features/ipfs/lib/storage-persistence.ts";

const saved = new Map();

function setGlobal(name, value) {
  if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function fakeLocalStorage() {
  const data = new Map();
  setGlobal("localStorage", {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => void data.set(key, String(value)),
  });
  return data;
}

function fakeStorageManager({ persisted = false, persist = true, estimate = {} } = {}) {
  const manager = {
    persistCalls: 0,
    persisted: async () => persisted,
    persist: async () => {
      manager.persistCalls += 1;
      if (persist instanceof Error) throw persist;
      return persist;
    },
    estimate: async () => estimate,
  };
  setGlobal("navigator", { storage: manager });
  return manager;
}

beforeEach(() => {
  fakeLocalStorage();
});

afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  saved.clear();
});

describe("requestPersistenceOnce", () => {
  test("asks the browser once and remembers a grant", async () => {
    const data = fakeLocalStorage();
    const storage = fakeStorageManager({ persist: true });

    expect(await requestPersistenceOnce()).toBe("granted");
    expect(await requestPersistenceOnce()).toBe("granted");

    expect(storage.persistCalls).toBe(1);
    expect(data.get("vault:storage_persist:v1")).toBe("granted");
  });

  test("remembers a denial and does not ask again", async () => {
    const data = fakeLocalStorage();
    const storage = fakeStorageManager({ persist: false });

    expect(await requestPersistenceOnce()).toBe("denied");
    expect(await requestPersistenceOnce()).toBe("denied");

    expect(storage.persistCalls).toBe(1);
    expect(data.get("vault:storage_persist:v1")).toBe("denied");
  });

  test("skips the request when the browser already persists storage", async () => {
    const data = fakeLocalStorage();
    const storage = fakeStorageManager({ persisted: true });

    expect(await requestPersistenceOnce()).toBe("granted");

    expect(storage.persistCalls).toBe(0);
    expect(data.get("vault:storage_persist:v1")).toBe("granted");
  });

  test("concurrent publishes share a single request", async () => {
    const storage = fakeStorageManager({ persist: true });

    const results = await Promise.all([requestPersistenceOnce(), requestPersistenceOnce()]);

    expect(results).toEqual(["granted", "granted"]);
    expect(storage.persistCalls).toBe(1);
  });

  test("reports unavailable without a storage manager and remembers nothing", async () => {
    const data = fakeLocalStorage();
    setGlobal("navigator", {});

    expect(await requestPersistenceOnce()).toBe("unavailable");
    expect(data.size).toBe(0);
  });

  test("a failing request is not remembered, so it can be retried", async () => {
    const data = fakeLocalStorage();
    fakeStorageManager({ persist: new Error("blocked") });

    expect(await requestPersistenceOnce()).toBe("unavailable");
    expect(data.size).toBe(0);
  });

  test("still returns the result when localStorage throws", async () => {
    setGlobal("localStorage", {
      getItem: () => {
        throw new Error("disabled");
      },
      setItem: () => {
        throw new Error("disabled");
      },
    });
    fakeStorageManager({ persist: true });

    expect(await requestPersistenceOnce()).toBe("granted");
  });
});

describe("getStorageStatus", () => {
  test("combines persistence and the usage estimate", async () => {
    fakeStorageManager({ persisted: true, estimate: { usage: 50, quota: 200 } });

    expect(await getStorageStatus()).toEqual({
      persisted: true,
      usage: 50,
      quota: 200,
      usedRatio: 0.25,
    });
  });

  test("reports unknown values when the estimate fails", async () => {
    const manager = fakeStorageManager({ persisted: false });
    manager.estimate = async () => {
      throw new Error("unsupported");
    };

    expect(await getStorageStatus()).toEqual({
      persisted: false,
      usage: null,
      quota: null,
      usedRatio: null,
    });
  });

  test("reports unknown values without a storage manager", async () => {
    setGlobal("navigator", {});

    expect(await getStorageStatus()).toEqual({
      persisted: null,
      usage: null,
      quota: null,
      usedRatio: null,
    });
  });

  test("has no usage ratio when the quota is zero", async () => {
    fakeStorageManager({ estimate: { usage: 10, quota: 0 } });

    expect((await getStorageStatus()).usedRatio).toBeNull();
  });
});

describe("evaluateStorageWarning", () => {
  const options = { hasItems: true, warnRatio: 0.8 };
  const status = (overrides) => ({
    persisted: true,
    usage: 10,
    quota: 100,
    usedRatio: 0.1,
    ...overrides,
  });

  test("stays quiet for an empty vault", () => {
    const risky = status({ persisted: false, usedRatio: 0.95 });

    expect(evaluateStorageWarning(risky, { ...options, hasItems: false })).toBeNull();
  });

  test("warns when persistence was not granted", () => {
    expect(evaluateStorageWarning(status({ persisted: false }), options)).toBe("not-persisted");
  });

  test("warns once usage reaches the threshold", () => {
    expect(evaluateStorageWarning(status({ usedRatio: 0.8 }), options)).toBe("usage-high");
    expect(evaluateStorageWarning(status({ usedRatio: 0.79 }), options)).toBeNull();
  });

  test("reports low storage ahead of missing persistence", () => {
    const both = status({ persisted: false, usedRatio: 0.9 });

    expect(evaluateStorageWarning(both, options)).toBe("usage-high");
  });

  test("does not warn when the browser says nothing", () => {
    const unknown = { persisted: null, usage: null, quota: null, usedRatio: null };

    expect(evaluateStorageWarning(unknown, options)).toBeNull();
  });
});
