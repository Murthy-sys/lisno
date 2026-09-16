import type { Readable } from "node:stream";

/** Private artifacts are published only by the owning durable record becoming ready. */
export interface ManagedFileStorage {
  /** Pure opaque identifier allocation. Persist it before calling write. */
  allocateTarget(): string;
  write(reference: string, source: Readable, options: {
    expectedBytes: number;
    maxBytes: number;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<{ sizeBytes: number; sha256: string }>;
  stat(reference: string): Promise<{ sizeBytes: number }>;
  open(reference: string, options?: { start?: number; endExclusive?: number; signal?: AbortSignal }): Promise<Readable>;
  /** Bounded inspection; implementations reject reads larger than one MiB. */
  readRange(reference: string, options: { offset: number; length: number; signal?: AbortSignal }): Promise<Buffer>;
  /** Decode directly from a private source, keeping original bytes out of application memory. */
  createImagePreview(sourceReference: string, targetReference: string, options?: {
    signal?: AbortSignal;
  }): Promise<{ mimeType: "image/webp"; byteSize: number; width: number; height: number } | null>;
  /**
   * Idempotently tombstone the generation's target, including a not-yet-created target.
   * Once this resolves, delayed writers cannot create or publish that reference.
   * Tombstones must not be unlinked while an old writer could still exist.
   */
  remove(reference: string): Promise<void>;
}

/** Optional capability preserves existing FileStorage adapters and consumers. */
export interface ManagedStorageCapability {
  managed: ManagedFileStorage;
}

export function hasManagedStorage(storage: object): storage is object & ManagedStorageCapability {
  return "managed" in storage && typeof storage.managed === "object" && storage.managed !== null;
}
