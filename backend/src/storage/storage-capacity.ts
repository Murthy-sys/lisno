import { statfs } from "node:fs/promises";
import path from "node:path";

export class StorageCapacityError extends Error {
  constructor() {
    super("File storage is temporarily unavailable. Please try again later.");
    this.name = "StorageCapacityError";
  }
}

export type StorageWriteGuard = (filename: string, bytes: number, write: () => Promise<void>) => Promise<void>;
export const STORAGE_FREE_SPACE_RESERVE_BYTES = 64 * 1024 * 1024;

/** Serialize each bounded chunk's capacity check and write across this process.
 * This protects a free-space reserve without imposing a media size/count cap.
 * Other processes still require filesystem quotas/monitoring at deployment.
 */
export function createStorageWriteGuard(options: {
  reserveBytes?: number;
  availableBytes?: (directory: string) => Promise<bigint>;
} = {}): StorageWriteGuard {
  const reserve = options.reserveBytes ?? STORAGE_FREE_SPACE_RESERVE_BYTES;
  if (!Number.isSafeInteger(reserve) || reserve < 0) throw new Error("Invalid storage reserve.");
  const available = options.availableBytes ?? (async directory => {
    const stats = await statfs(directory, { bigint: true });
    return stats.bavail * stats.bsize;
  });
  let tail = Promise.resolve();
  return async (filename, bytes, write) => {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Invalid storage write length.");
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      if (await available(path.dirname(filename)) < BigInt(reserve) + BigInt(bytes)) throw new StorageCapacityError();
      await write();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOSPC" || code === "EDQUOT") throw new StorageCapacityError();
      throw error;
    } finally { release(); }
  };
}

export const guardStorageWrite = createStorageWriteGuard();
