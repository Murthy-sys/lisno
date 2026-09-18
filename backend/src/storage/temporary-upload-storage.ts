import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdtemp, open as openFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import type { ManagedFileStorage } from "./managed-storage.js";
import { writePrivateStream } from "./stream-file.js";

export interface TemporaryUpload { reference: string; sizeBytes: number; sha256: string }
export interface TemporaryUploadStorage extends Pick<ManagedFileStorage, "open" | "readRange"> {
  write(source: Readable, options: { signal: AbortSignal; maxBytes?: number }): Promise<TemporaryUpload>;
  cleanup(): Promise<void>;
}

/** One private directory per request; no client-supplied filesystem paths. */
export async function createTemporaryUploadStorage(): Promise<TemporaryUploadStorage> {
  const directory = await mkdtemp(path.join(tmpdir(), "lisno-workflow-evidence-"));
  const active = new Set<Promise<unknown>>();
  let closing = false;
  let cleanup: Promise<void> | undefined;
  const resolve = (reference: string) => {
    if (!/^[0-9a-f-]{36}\.upload$/.test(reference)) throw new Error("Invalid temporary upload reference.");
    return path.join(directory, reference);
  };
  return {
    async write(source, options) {
      if (closing) { source.destroy(); throw new Error("The temporary upload is closed."); }
      const reference = `${randomUUID()}.upload`;
      const pending = writePrivateStream(resolve(reference), source, options);
      active.add(pending);
      try { return { reference, ...await pending }; } finally { active.delete(pending); }
    },
    async open(reference, options = {}) {
      options.signal?.throwIfAborted();
      const handle = await openFile(resolve(reference), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        options.signal?.throwIfAborted();
        return handle.createReadStream({ start: options.start, end: options.endExclusive === undefined ? undefined : options.endExclusive - 1, highWaterMark: 64 * 1024, signal: options.signal });
      } catch (error) { await handle.close(); throw error; }
    },
    async readRange(reference, { offset, length, signal }) {
      signal?.throwIfAborted();
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || length > 1024 * 1024) throw new Error("Invalid bounded inspection read.");
      const handle = await openFile(resolve(reference), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const bytes = Buffer.alloc(length); let received = 0;
        while (received < length) {
          signal?.throwIfAborted();
          const { bytesRead } = await handle.read(bytes, received, length - received, offset + received);
          if (!bytesRead) break;
          received += bytesRead;
        }
        return bytes.subarray(0, received);
      } finally { await handle.close(); }
    },
    cleanup() {
      closing = true;
      return cleanup ??= (async () => {
        await Promise.allSettled([...active]);
        await rm(directory, { recursive: true, force: true });
      })();
    }
  };
}
