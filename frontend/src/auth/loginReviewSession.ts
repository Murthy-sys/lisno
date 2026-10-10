import { tokenStorage } from "../api/client";

export interface LoginReviewSession {
  readonly id: string;
  readonly userId: string;
}

interface ReviewRecord extends LoginReviewSession {
  version: 1;
  tokenFingerprint: string;
  consumed: boolean;
}

const STORAGE_KEY = "lisno.auth.login-review.v1";
const LOCK_NAME = "lisno.auth.login-review.v1";
const listeners = new Set<() => void>();
let listening = false;
let durable = true;
let memoryRecord: ReviewRecord | null = null;
let binding: { session: LoginReviewSession; token: string } | null = null;
let memoryQueue: Promise<unknown> = Promise.resolve();

function notify() {
  for (const listener of listeners) listener();
}

function parseRecord(value: string | null): ReviewRecord | null {
  if (!value || value.length > 2048) return null;
  try {
    const record = JSON.parse(value) as Partial<ReviewRecord>;
    if (
      record.version === 1 &&
      typeof record.id === "string" && record.id.length > 0 && record.id.length <= 128 &&
      typeof record.userId === "string" && record.userId.length > 0 && record.userId.length <= 256 &&
      typeof record.tokenFingerprint === "string" && /^[a-f0-9]{64}$/.test(record.tokenFingerprint) &&
      typeof record.consumed === "boolean"
    ) return record as ReviewRecord;
  } catch { /* Invalid presentation metadata is replaced on accepted restoration. */ }
  return null;
}

function readRecord(): ReviewRecord | null {
  if (durable) {
    try {
      memoryRecord = parseRecord(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      durable = false;
    }
  }
  return memoryRecord;
}

function writeRecord(record: ReviewRecord | null) {
  memoryRecord = record;
  if (durable) {
    try {
      if (record) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      durable = false;
    }
  }
  notify();
}

function sameSession(record: LoginReviewSession | null, session: LoginReviewSession) {
  return record?.id === session.id && record.userId === session.userId;
}

function tokenIsCurrent(token: string) {
  try { return tokenStorage.get() === token; }
  catch { return binding?.token === token; }
}

function serially<T>(operation: () => T): Promise<T> {
  const result = memoryQueue.then(operation);
  memoryQueue = result.catch(() => undefined);
  return result;
}

async function atomically<T>(operation: () => T): Promise<T> {
  if (durable && navigator.locks?.request) {
    // Every record initialization, replacement and claim uses the same origin lock.
    // Storage events notify readers; they are deliberately not used as a lock.
    let entered = false;
    try {
      return await navigator.locks.request(LOCK_NAME, () => {
        entered = true;
        return operation();
      });
    } catch (error) {
      if (entered) throw error;
      durable = false;
    }
  } else {
    durable = false;
  }
  // Without browser locking/storage, guarantees are limited to this loaded app.
  // Authentication and manual review remain available; reload/other tabs can retry.
  return serially(operation);
}

async function fingerprint(token: string): Promise<string | null> {
  try {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    durable = false;
    return null;
  }
}

function opaqueId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Untrusted presentation identity captured only to invalidate exactly that record. */
export function captureLoginReviewSession(): LoginReviewSession | null {
  const record = readRecord();
  return record ? { id: record.id, userId: record.userId } : null;
}

async function acceptSession(
  userId: string,
  token: string,
  fresh: boolean,
  isCurrent: () => boolean
): Promise<LoginReviewSession | null> {
  const tokenFingerprint = await fingerprint(token);
  return atomically(() => {
    if (!isCurrent() || !tokenIsCurrent(token)) return null;
    const previous = readRecord();
    const canRestore = !fresh && previous?.userId === userId && (
      tokenFingerprint !== null
        ? previous.tokenFingerprint === tokenFingerprint
        : binding?.token === token && sameSession(binding.session, previous)
    );
    const record: ReviewRecord = canRestore ? previous : {
      version: 1,
      id: opaqueId(),
      userId,
      tokenFingerprint: tokenFingerprint ?? "",
      consumed: false
    };
    const session = { id: record.id, userId: record.userId };
    binding = { session, token };
    if (!canRestore) writeRecord(record);
    return session;
  });
}

export function establishLoginReviewSession(userId: string, token: string, isCurrent: () => boolean) {
  return acceptSession(userId, token, true, isCurrent);
}

export function restoreLoginReviewSession(userId: string, token: string, isCurrent: () => boolean) {
  return acceptSession(userId, token, false, isCurrent);
}

export function isLoginReviewSessionCurrent(session: LoginReviewSession): boolean {
  return Boolean(binding && sameSession(binding.session, session) &&
    tokenIsCurrent(binding.token) && sameSession(readRecord(), session));
}

export function getLoginReviewState(session: LoginReviewSession): "pending" | "consumed" | "stale" {
  if (!isLoginReviewSessionCurrent(session)) return "stale";
  return readRecord()?.consumed ? "consumed" : "pending";
}

export function consumeLoginReview(session: LoginReviewSession, isCurrent: () => boolean): Promise<boolean> {
  return atomically(() => {
    if (!isCurrent() || getLoginReviewState(session) !== "pending") return false;
    const record = readRecord();
    if (!record || !sameSession(record, session)) return false;
    writeRecord({ ...record, consumed: true });
    return true;
  });
}

export async function clearLoginReviewSession(session: LoginReviewSession | null): Promise<void> {
  if (!session) return;
  // Make this tab stale immediately, even while waiting for a different tab's lock.
  if (binding && sameSession(binding.session, session)) binding = null;
  notify();
  await atomically(() => {
    if (sameSession(readRecord(), session)) writeRecord(null);
  });
}

export function subscribeLoginReviewSession(listener: () => void): () => void {
  listeners.add(listener);
  if (!listening) {
    window.addEventListener("storage", handleStorage);
    listening = true;
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && listening) {
      window.removeEventListener("storage", handleStorage);
      listening = false;
    }
  };
}

function handleStorage(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== window.localStorage) return;
  // A token replacement/logout also invalidates the local presentation binding.
  if (event.key === STORAGE_KEY || event.key === "lisno.auth.token" || event.key === null) notify();
}
