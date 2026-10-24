import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createStorageWriteGuard, StorageCapacityError } from "../src/storage/storage-capacity.js";
import { writePrivateStream } from "../src/storage/stream-file.js";
import { createLocalStorage } from "../src/storage/local-storage.js";
import { createWorkflowUploadAdmission } from "../src/middleware/workflow-upload-admission.js";

const roots: string[] = [];
async function directory() { const root = await mkdtemp(path.join(os.tmpdir(), "lisno-capacity-test-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("streamed storage capacity", () => {
  it("stops a live stream when available space drops and removes its partial file", async () => {
    const root = await directory(); let free = 1028n;
    const guard = createStorageWriteGuard({ reserveBytes: 1024, availableBytes: async () => free });
    let writes = 0;
    const source = Readable.from([Buffer.from("abc"), Buffer.from("def")]);
    await expect(writePrivateStream(path.join(root, "media"), source, { capacityGuard: (filename, size, write) => guard(filename, size, async () => {
      await write(); writes += 1; free -= BigInt(size);
    }) })).rejects.toBeInstanceOf(StorageCapacityError);
    expect(writes).toBe(1);
    expect(source.destroyed).toBe(true); expect(await readdir(root)).toEqual([]);
  });

  it("serializes concurrent checks with writes so both cannot spend the same remaining space", async () => {
    let free = 15n; let writes = 0;
    const guard = createStorageWriteGuard({ reserveBytes: 10, availableBytes: async () => free });
    const write = async () => { await Promise.resolve(); writes += 1; free -= 4n; };
    const results = await Promise.allSettled([guard("/tmp/one", 4, write), guard("/tmp/two", 4, write)]);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(writes).toBe(1);
    free = 30n; await guard("/tmp/three", 4, write); expect(writes).toBe(2);
  });

  it("protects permanent imports and leaves no orphan after capacity rejection", async () => {
    const root = await directory();
    const storage = createLocalStorage(root, { capacityGuard: createStorageWriteGuard({ reserveBytes: 10, availableBytes: async () => 11n }) });
    const bytes = Buffer.from("media"); const source = Readable.from(bytes);
    await expect(storage.importStream({ source, extension: ".mp4", expectedBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })).rejects.toBeInstanceOf(StorageCapacityError);
    expect(source.destroyed).toBe(true); expect(await readdir(root)).toEqual([]);
  });

  it("does not retain the capacity lock after a filesystem failure", async () => {
    const guard = createStorageWriteGuard({ reserveBytes: 1, availableBytes: async () => 100n });
    await expect(guard("/tmp/fail", 1, async () => { throw Object.assign(new Error("private path"), { code: "ENOSPC" }); })).rejects.toBeInstanceOf(StorageCapacityError);
    await expect(guard("/tmp/next", 1, async () => {})).resolves.toBeUndefined();
  });
});

describe("workflow upload admission", () => {
  it("bounds active actors and global uploads with idempotent slot cleanup", () => {
    const admit = createWorkflowUploadAdmission({ total: 2, perActor: 1 });
    const releaseA = admit("a");
    expect(() => admit("a")).toThrow("Evidence uploads are busy");
    const releaseB = admit("b");
    expect(() => admit("c")).toThrow("Evidence uploads are busy");
    releaseA(); releaseA(); const releaseC = admit("c");
    expect(() => admit("d")).toThrow("Evidence uploads are busy");
    releaseB(); releaseC(); expect(() => admit("a")()).not.toThrow();
  });
});
