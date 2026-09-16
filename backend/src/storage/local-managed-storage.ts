import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, rename } from "node:fs/promises";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp, { type OutputInfo } from "sharp";
import type { ManagedFileStorage } from "./managed-storage.js";

const referencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.blob$/i;
const MAX_INSPECTION_BYTES = 1024 * 1024;
let activePreviews = 0;

function missingArtifact(): NodeJS.ErrnoException {
  return Object.assign(new Error("The stored artifact is unavailable."), { code: "ENOENT" });
}
function positiveInteger(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function validOffset(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }

export function createLocalManagedStorage(rootDirectory: string): ManagedFileStorage {
  const root = path.resolve(rootDirectory, "managed-chat");
  const resolve = (reference: string) => {
    if (!referencePattern.test(reference) || path.basename(reference) !== reference) throw new Error("Invalid managed storage reference.");
    return path.join(root, reference);
  };
  const ensureRoot = () => mkdir(root, { recursive: true, mode: 0o700 });
  const openReadable = async (reference: string) => {
    const handle = await open(resolve(reference), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size === 0) throw missingArtifact();
      return { handle, sizeBytes: info.size };
    } catch (error) { await handle.close(); throw error; }
  };
  const storage: ManagedFileStorage = {
    allocateTarget: () => `${randomUUID()}.blob`,
    async write(reference, source, options) {
      const filename = resolve(reference);
      if (!positiveInteger(options.expectedBytes) || !positiveInteger(options.maxBytes) || options.expectedBytes > options.maxBytes || !positiveInteger(options.timeoutMs)) {
        source.destroy();
        throw new Error("Invalid managed upload limits.");
      }
      const controller = new AbortController();
      const abort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
      const timer = setTimeout(() => controller.abort(new Error("Upload timed out.")), options.timeoutMs);
      timer.unref();
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      let pendingWrite: Promise<void> | undefined;
      const hash = createHash("sha256");
      let sizeBytes = 0;
      try {
        controller.signal.throwIfAborted();
        await ensureRoot();
        controller.signal.throwIfAborted();
        handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        controller.signal.throwIfAborted();
        const destination = new Writable({
          write(chunk: Buffer, _encoding, done) {
            sizeBytes += chunk.length;
            if (sizeBytes > options.expectedBytes || sizeBytes > options.maxBytes) return done(new Error("Upload exceeds its reserved byte size."));
            hash.update(chunk);
            pendingWrite = (async () => {
              let offset = 0;
              while (offset < chunk.length) {
                controller.signal.throwIfAborted();
                const { bytesWritten } = await handle!.write(chunk, offset, chunk.length - offset);
                if (!bytesWritten) throw new Error("Stored artifact write did not advance.");
                offset += bytesWritten;
              }
            })();
            pendingWrite.then(() => done(), error => done(error as Error));
          }
        });
        await pipeline(source, destination, { signal: controller.signal });
        if (sizeBytes !== options.expectedBytes) throw new Error("Upload does not match its reserved byte size.");
        await handle.sync();
        controller.signal.throwIfAborted();
        return { sizeBytes, sha256: hash.digest("hex") };
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        source.destroy();
        await pendingWrite?.catch(() => {});
        await handle?.close();
      }
    },
    async stat(reference) {
      const { handle, sizeBytes } = await openReadable(reference);
      await handle.close();
      return { sizeBytes };
    },
    async open(reference, options = {}) {
      options.signal?.throwIfAborted();
      if (options.start !== undefined && !validOffset(options.start)) throw new Error("Invalid stream range.");
      if (options.endExclusive !== undefined && (!positiveInteger(options.endExclusive) || options.endExclusive <= (options.start ?? 0))) throw new Error("Invalid stream range.");
      const { handle, sizeBytes } = await openReadable(reference);
      try {
        options.signal?.throwIfAborted();
        if ((options.start ?? 0) >= sizeBytes || (options.endExclusive ?? sizeBytes) > sizeBytes) throw new Error("Stream range exceeds artifact size.");
        return handle.createReadStream({
          start: options.start,
          end: options.endExclusive === undefined ? undefined : options.endExclusive - 1,
          signal: options.signal,
          highWaterMark: 64 * 1024
        });
      } catch (error) { await handle.close(); throw error; }
    },
    async readRange(reference, options) {
      if (!validOffset(options.offset) || !validOffset(options.length) || options.length > MAX_INSPECTION_BYTES) throw new Error("Invalid inspection range.");
      options.signal?.throwIfAborted();
      const { handle, sizeBytes } = await openReadable(reference);
      try {
        options.signal?.throwIfAborted();
        if (options.offset > sizeBytes || options.length > sizeBytes - options.offset) throw new Error("Inspection range exceeds artifact size.");
        const result = Buffer.alloc(options.length);
        let read = 0;
        while (read < result.length) {
          options.signal?.throwIfAborted();
          const { bytesRead } = await handle.read(result, read, result.length - read, options.offset + read);
          if (!bytesRead) throw new Error("Stored artifact was truncated.");
          read += bytesRead;
        }
        return result;
      } finally { await handle.close(); }
    },
    async remove(reference) {
      const target = resolve(reference);
      await ensureRoot();
      // This permanent pathname blocks delayed wx opens. Existing writers hold an
      // unlinked inode after rename and cannot resurrect the published pathname.
      const marker = `${target}.tombstone`;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const handle = await open(marker, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
          await handle.sync();
          await handle.close();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
        try { await rename(marker, target); return; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      throw new Error("Could not settle artifact cleanup.");
    },
    async createImagePreview(sourceReference, targetReference, options = {}) {
      options.signal?.throwIfAborted();
      const source = resolve(sourceReference);
      resolve(targetReference);
      await storage.stat(sourceReference);
      // Saturated/unsupported decoding is a truthful file-tile fallback. Originals
      // remain intact and downloadable; never queue unbounded decoder work.
      if (activePreviews >= 2) return null;
      activePreviews += 1;
      const decoder = sharp(source, { limitInputPixels: 40_000_000, pages: 1, sequentialRead: true, failOn: "error" })
        .timeout({ seconds: 10 }).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 });
      const abort = () => decoder.destroy();
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        let result: { data: Buffer; info: OutputInfo };
        try {
          result = await decoder.toBuffer({ resolveWithObject: true });
        } catch (error) {
          options.signal?.throwIfAborted();
          // Distinguish lost storage from a format/codec/pixel-limit fallback.
          await storage.stat(sourceReference);
          return null;
        }
        options.signal?.throwIfAborted();
        if (result.data.length === 0 || result.data.length > MAX_INSPECTION_BYTES) return null;
        await storage.write(targetReference, Readable.from(result.data), { expectedBytes: result.data.length, maxBytes: MAX_INSPECTION_BYTES, timeoutMs: 15_000, signal: options.signal });
        return { mimeType: "image/webp", byteSize: result.data.length, width: result.info.width, height: result.info.height };
      } finally {
        options.signal?.removeEventListener("abort", abort);
        decoder.destroy();
        activePreviews -= 1;
      }
    }
  };
  return storage;
}
