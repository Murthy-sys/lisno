import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "lisno.auth.login-review.v1";
const TOKEN_KEY = "lisno.auth.token";
const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");

function installLocks() {
  let queue: Promise<unknown> = Promise.resolve();
  const request = vi.fn((_name: string, operation: () => unknown) => {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
  return request;
}

async function newTab() {
  vi.resetModules();
  return import("./loginReviewSession");
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  installLocks();
  localStorage.setItem(TOKEN_KEY, "accepted-session-token");
});

afterEach(() => {
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
  else Reflect.deleteProperty(navigator, "locks");
  vi.unstubAllGlobals();
});

describe("login review presentation sessions", () => {
  it("rotates every explicit accepted login even with the same user and token", async () => {
    const tab = await newTab();
    const first = (await tab.establishLoginReviewSession("a", "accepted-session-token", () => true))!;
    expect(await tab.consumeLoginReview(first, () => true)).toBe(true);
    const next = (await tab.establishLoginReviewSession("a", "accepted-session-token", () => true))!;
    expect(next.id).not.toBe(first.id);
    expect(tab.getLoginReviewState(first)).toBe("stale");
    expect(tab.getLoginReviewState(next)).toBe("pending");
  });

  it("retains a consumed login across restores and a newly loaded module", async () => {
    const tab = await newTab();
    const first = (await tab.establishLoginReviewSession("a", "accepted-session-token", () => true))!;
    await tab.consumeLoginReview(first, () => true);
    expect(await tab.restoreLoginReviewSession("a", "accepted-session-token", () => true)).toEqual(first);
    const reloaded = await newTab();
    const restored = (await reloaded.restoreLoginReviewSession("a", "accepted-session-token", () => true))!;
    expect(restored).toEqual(first);
    expect(reloaded.getLoginReviewState(restored)).toBe("consumed");
  });

  it("initializes one marker and allows one claim across two independent tabs", async () => {
    const firstTab = await newTab();
    const secondTab = await newTab();
    const [first, second] = await Promise.all([
      firstTab.restoreLoginReviewSession("a", "accepted-session-token", () => true),
      secondTab.restoreLoginReviewSession("a", "accepted-session-token", () => true)
    ]);
    expect(first).toEqual(second);
    expect(first).not.toBeNull();
    const results = await Promise.all([
      firstTab.consumeLoginReview(first!, () => true),
      secondTab.consumeLoginReview(second!, () => true)
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(firstTab.getLoginReviewState(first!)).toBe("consumed");
    expect(secondTab.getLoginReviewState(second!)).toBe("consumed");
  });

  it("does not consume an aborted or replaced caller", async () => {
    const tab = await newTab();
    const session = (await tab.establishLoginReviewSession("a", "accepted-session-token", () => true))!;
    expect(await tab.consumeLoginReview(session, () => false)).toBe(false);
    expect(tab.getLoginReviewState(session)).toBe("pending");
    localStorage.setItem(TOKEN_KEY, "other-token");
    expect(await tab.consumeLoginReview(session, () => true)).toBe(false);
    expect(tab.getLoginReviewState(session)).toBe("stale");
  });

  it("does not establish superseded or unaccepted token sessions", async () => {
    const tab = await newTab();
    expect(await tab.establishLoginReviewSession("a", "accepted-session-token", () => false)).toBeNull();
    expect(await tab.establishLoginReviewSession("b", "unaccepted-token", () => true)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does not let old cleanup remove a newer login, even for the same user/token", async () => {
    const firstTab = await newTab();
    const secondTab = await newTab();
    const first = (await firstTab.establishLoginReviewSession("a", "accepted-session-token", () => true))!;
    const second = (await secondTab.establishLoginReviewSession("a", "accepted-session-token", () => true))!;
    await firstTab.clearLoginReviewSession(first);
    expect(secondTab.getLoginReviewState(second)).toBe("pending");
    expect(firstTab.getLoginReviewState(first)).toBe("stale");
  });

  it("uses separate identities for a different user and changed token", async () => {
    const tab = await newTab();
    const first = (await tab.establishLoginReviewSession("a", "accepted-session-token", () => true))!;
    await tab.consumeLoginReview(first, () => true);
    localStorage.setItem(TOKEN_KEY, "user-b-token");
    const second = (await tab.restoreLoginReviewSession("b", "user-b-token", () => true))!;
    expect(second.userId).toBe("b");
    expect(second.id).not.toBe(first.id);
    expect(tab.getLoginReviewState(second)).toBe("pending");
    expect(tab.isLoginReviewSessionCurrent(first)).toBe(false);
  });

  it("notifies consumers of consumption, session replacement and external logout", async () => {
    const firstTab = await newTab();
    const secondTab = await newTab();
    const first = (await firstTab.restoreLoginReviewSession("a", "accepted-session-token", () => true))!;
    const second = (await secondTab.restoreLoginReviewSession("a", "accepted-session-token", () => true))!;
    const changes: string[] = [];
    const unsubscribe = secondTab.subscribeLoginReviewSession(() => changes.push(secondTab.getLoginReviewState(second)));
    await firstTab.consumeLoginReview(first, () => true);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, storageArea: localStorage }));
    await firstTab.establishLoginReviewSession("a", "accepted-session-token", () => true);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, storageArea: localStorage }));
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_KEY, storageArea: localStorage }));
    expect(changes).toEqual(["consumed", "stale", "stale"]);
    unsubscribe();
    window.dispatchEvent(new StorageEvent("storage", { key: TOKEN_KEY }));
    expect(changes).toHaveLength(3);
  });

  it("clears only the owned presentation record on logout", async () => {
    const tab = await newTab();
    const session = (await tab.establishLoginReviewSession("a", "accepted-session-token", () => true))!;
    await tab.clearLoginReviewSession(session);
    expect(tab.getLoginReviewState(session)).toBe("stale");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("accepted-session-token");
  });

  it("persists bounded metadata with a SHA-256 fingerprint, never the token or content", async () => {
    const tab = await newTab();
    await tab.establishLoginReviewSession("a", "accepted-session-token", () => true);
    const raw = localStorage.getItem(STORAGE_KEY)!;
    const record = JSON.parse(raw);
    expect(Object.keys(record).sort()).toEqual(["consumed", "id", "tokenFingerprint", "userId", "version"]);
    expect(record.tokenFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(raw).not.toContain("accepted-session-token");
    expect(raw.length).toBeLessThan(512);
  });

  it.each(["read", "write", "lock", "digest", "missing-lock"])(
    "uses a single-app memory fallback without rejecting auth when %s fails",
    async (failure) => {
      const tab = await newTab();
      const read = Storage.prototype.getItem;
      const write = Storage.prototype.setItem;
      if (failure === "read") vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
        if (key === STORAGE_KEY) throw new DOMException("Denied", "SecurityError");
        return read.call(this, key);
      });
      if (failure === "write") vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
        if (key === STORAGE_KEY) throw new DOMException("Full", "QuotaExceededError");
        write.call(this, key, value);
      });
      if (failure === "lock") Object.defineProperty(navigator, "locks", { configurable: true, value: { request: () => Promise.reject(new Error("Locks unavailable")) } });
      if (failure === "missing-lock") Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
      if (failure === "digest") vi.stubGlobal("crypto", { randomUUID: webcrypto.randomUUID.bind(webcrypto), getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
      const session = (await tab.establishLoginReviewSession("a", "accepted-session-token", () => true))!;
      expect(session).not.toBeNull();
      expect(await tab.restoreLoginReviewSession("a", "accepted-session-token", () => true)).toEqual(session);
      expect(await Promise.all([tab.consumeLoginReview(session, () => true), tab.consumeLoginReview(session, () => true)])).toEqual([true, false]);
      expect(tab.getLoginReviewState(session)).toBe("consumed");
    }
  );

  it("replaces malformed presentation metadata after authorized restoration", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, id: "bad", userId: "a", consumed: false }));
    const tab = await newTab();
    const restored = await tab.restoreLoginReviewSession("a", "accepted-session-token", () => true);
    expect(restored?.id).not.toBe("bad");
    expect(tab.getLoginReviewState(restored!)).toBe("pending");
  });
});
