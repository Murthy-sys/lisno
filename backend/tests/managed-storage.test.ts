import { createHash } from "node:crypto";
import { mkdtemp, rm, stat as fileStat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalStorage } from "../src/storage/local-storage.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "lisno-managed-storage-"));
  roots.push(root);
  return { root, storage: createLocalStorage(root).managed };
}
const options = (size: number) => ({ expectedBytes: size, maxBytes: size, timeoutMs: 1000 });

describe("managed chat storage", () => {
  it("streams exact bytes and checksum privately with bounded random access", async () => {
    const { storage, root } = await setup();
    const data = Buffer.from("private synthetic media");
    const ref = storage.allocateTarget();
    expect(await storage.write(ref, Readable.from(data), options(data.length))).toEqual({ sizeBytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
    expect((await fileStat(path.join(root, "managed-chat", ref))).mode & 0o777).toBe(0o600);
    expect(await buffer(await storage.open(ref))).toEqual(data);
    expect(await storage.readRange(ref, { offset: 8, length: 9 })).toEqual(data.subarray(8, 17));
    expect(await buffer(await storage.open(ref, { start: 8, endExclusive: 17 }))).toEqual(data.subarray(8, 17));
    await expect(storage.readRange(ref, { offset: 0, length: 1024 * 1024 + 1 })).rejects.toThrow("Invalid inspection");
    await expect(storage.open(ref, { start: -1 })).rejects.toThrow("Invalid stream");
    await expect(storage.write(ref, Readable.from(data), options(data.length))).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("retains tombstones so cleanup prevents delayed creation across adapters", async () => {
    const { storage, root } = await setup();
    const second = createLocalStorage(root).managed;
    const ref = storage.allocateTarget();
    await Promise.all([storage.remove(ref), second.remove(ref)]);
    await expect(second.write(ref, Readable.from("late"), options(4))).rejects.toMatchObject({ code: "EEXIST" });
    await expect(storage.stat(ref)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(storage.open(ref)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("an already-open writer cannot resurrect a target after cleanup", async () => {
    const { storage } = await setup();
    const ref = storage.allocateTarget();
    const source = new PassThrough();
    const write = storage.write(ref, source, options(6));
    source.write("abc");
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await storage.stat(ref).then(() => true, () => false)) break;
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    await storage.remove(ref);
    source.end("def");
    await write;
    await expect(storage.open(ref)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["../escape.blob", "/tmp/escape.blob", "abc.blob", "00000000-0000-4000-8000-000000000001.pdf"])("rejects invalid opaque reference %s", async ref => {
    const { storage } = await setup();
    await expect(storage.open(ref)).rejects.toThrow("Invalid managed");
    await expect(storage.remove(ref)).rejects.toThrow("Invalid managed");
  });

  it("rejects truncated, excessive, stalled and cancelled streams and releases sources", async () => {
    const { storage } = await setup();
    await expect(storage.write(storage.allocateTarget(), Readable.from("x"), options(2))).rejects.toThrow("reserved byte size");
    await expect(storage.write(storage.allocateTarget(), Readable.from("xx"), options(1))).rejects.toThrow("reserved byte size");
    const stalled = new PassThrough();
    await expect(storage.write(storage.allocateTarget(), stalled, { ...options(1), timeoutMs: 10 })).rejects.toMatchObject({ name: "AbortError" });
    expect(stalled.destroyed).toBe(true);
    const source = new PassThrough();
    const controller = new AbortController();
    const write = storage.write(storage.allocateTarget(), source, { ...options(1), signal: controller.signal });
    controller.abort();
    await expect(write).rejects.toMatchObject({ name: "AbortError" });
    expect(source.destroyed).toBe(true);
  });

  it("creates a bounded image preview and preserves original bytes", async () => {
    const { storage } = await setup();
    const source = storage.allocateTarget();
    const preview = storage.allocateTarget();
    const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#448866" } }).png().toBuffer();
    await storage.write(source, Readable.from(png), options(png.length));
    const metadata = await storage.createImagePreview(source, preview);
    expect(metadata).toMatchObject({ mimeType: "image/webp", width: 640, height: 427 });
    expect(metadata!.byteSize).toBeLessThan(1024 * 1024);
    expect(await buffer(await storage.open(source))).toEqual(png);
    await storage.remove(preview);
    await expect(storage.createImagePreview(source, preview)).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("writes a large synthetic stream without retaining the original in memory", async () => {
    const { storage } = await setup();
    const chunk = Buffer.alloc(64 * 1024, 3);
    const baseline = process.memoryUsage().arrayBuffers;
    let peak = baseline;
    const size = 50 * 1024 * 1024;
    const data = Readable.from((function* () {
      for (let written = 0; written < size; written += chunk.length) {
        peak = Math.max(peak, process.memoryUsage().arrayBuffers);
        yield chunk;
      }
    })());
    await storage.write(storage.allocateTarget(), data, { ...options(size), timeoutMs: 30_000 });
    expect(peak - baseline).toBeLessThan(16 * 1024 * 1024);
  });
});
