import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { Writable, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Exclusive, private, bounded-memory writes; rejection leaves no partial target. */
export async function writePrivateStream(filename: string, source: Readable, options: {
  signal?: AbortSignal; maxBytes?: number; expectedBytes?: number; sha256?: string;
} = {}) {
  source.once("error", () => {});
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let pendingWrite: Promise<void> | undefined;
  let completed = false;
  let created = false;
  let sizeBytes = 0;
  const hash = createHash("sha256");
  try {
    options.signal?.throwIfAborted();
    handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
    const destination = new Writable({ highWaterMark: 64 * 1024, write(chunk: Buffer, _encoding, done) {
      sizeBytes += chunk.length;
      if (!Number.isSafeInteger(sizeBytes) || options.maxBytes !== undefined && sizeBytes > options.maxBytes || options.expectedBytes !== undefined && sizeBytes > options.expectedBytes) {
        done(Object.assign(new Error("The file exceeds its allowed byte size."), { code: "FILE_SIZE_LIMIT" })); return;
      }
      hash.update(chunk);
      pendingWrite = (async () => {
        let offset = 0;
        while (offset < chunk.length) {
          options.signal?.throwIfAborted();
          const { bytesWritten } = await handle!.write(chunk, offset, chunk.length - offset);
          if (!bytesWritten) throw new Error("File write did not advance.");
          offset += bytesWritten;
        }
      })();
      pendingWrite.then(() => done(), error => done(error as Error));
    } });
    await pipeline(source, destination, { signal: options.signal });
    const sha256 = hash.digest("hex");
    if (options.expectedBytes !== undefined && sizeBytes !== options.expectedBytes || options.sha256 !== undefined && sha256 !== options.sha256) throw new Error("The streamed file does not match its inspected evidence.");
    await handle.sync(); options.signal?.throwIfAborted();
    await handle.close(); handle = undefined;
    completed = true;
    return { sizeBytes, sha256 };
  } finally {
    source.destroy();
    await pendingWrite?.catch(() => {});
    try { await handle?.close(); }
    finally { if (created && !completed) await unlink(filename).catch(() => {}); }
  }
}
