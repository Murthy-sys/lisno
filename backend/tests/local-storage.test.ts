import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buffer } from "node:stream/consumers";

import { afterEach, describe, expect, it } from "vitest";

import { createLocalStorage } from "../src/storage/local-storage.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), "lisno-storage-"));
  temporaryDirectories.push(directory);
  return {
    directory,
    storage: createLocalStorage(directory)
  };
}

describe("local file storage", () => {
  it("stores exact bytes under a server-generated UUID filename and deletes them", async () => {
    const { directory, storage } = await setup();
    const data = Buffer.from("%PDF-1.7\nlocal adapter");

    const saved = await storage.save({ data, extension: ".pdf" });

    expect(saved.reference).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/
    );
    expect(await readdir(directory)).toEqual([saved.reference]);
    expect(await buffer(await storage.open(saved.reference))).toEqual(data);
    expect(await storage.read(saved.reference)).toEqual(data);

    await storage.delete(saved.reference);
    expect(await readdir(directory)).toEqual([]);
  });

  it.each([".gif", ".mp4", ".mov", ".webm"] as const)("stores measurement %s bytes under opaque references", async extension => {
    const { storage, directory } = await setup(); const data = Buffer.from("synthetic media bytes");
    const saved = await storage.save({ data, extension });
    expect(saved.reference.endsWith(extension)).toBe(true); expect(await storage.read(saved.reference)).toEqual(data);
    expect(await buffer(await storage.open(saved.reference))).toEqual(data);
    await storage.delete(saved.reference); expect(await readdir(directory)).toEqual([]);
    await expect(storage.read(`../outside${extension}`)).rejects.toThrow("Invalid storage reference.");
  });

  it("imports a stream without calling the buffered save/read methods", async () => {
    const { storage } = await setup(); const part = Buffer.alloc(64 * 1024, 0x61); const hash = createHash("sha256");
    for (let index = 0; index < 512; index++) hash.update(part);
    const sha256 = hash.digest("hex");
    const saved = await storage.importStream!({ source: Readable.from((function* () { for (let index = 0; index < 512; index++) yield part; })()), extension: ".mp4", expectedBytes: part.length * 512, sha256 });
    let size = 0; let largest = 0; const actual = createHash("sha256");
    for await (const chunk of await storage.open(saved.reference)) { size += chunk.length; largest = Math.max(largest, chunk.length); actual.update(chunk); }
    expect(size).toBe(32 * 1024 * 1024); expect(largest).toBeLessThanOrEqual(64 * 1024); expect(actual.digest("hex")).toBe(sha256);
  });
  it.each(["abort", "source error", "wrong size", "wrong hash"])("removes partial streamed targets after %s", async mode => {
    const { directory, storage } = await setup(); const controller = new AbortController();
    const part = Buffer.alloc(64 * 1024, 0x62); const hash = createHash("sha256").update(part).digest("hex");
    const source = Readable.from((async function* () {
      yield part;
      if (mode === "abort") { controller.abort(); yield part; }
      if (mode === "source error") throw new Error("Source failed");
    })());
    await expect(storage.importStream!({ source, extension: ".mp4", expectedBytes: mode === "wrong size" ? part.length + 1 : part.length, sha256: mode === "wrong hash" ? "0".repeat(64) : hash, signal: controller.signal })).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]); expect(source.destroyed).toBe(true);
  });

  it("stores generated images through the same opaque, immutable adapter", async () => {
    const { directory, storage } = await setup();
    const generated = Buffer.from("generated crop");

    const saved = await storage.saveGenerated({
      data: generated,
      extension: ".png"
    });

    expect(saved.reference).toMatch(/\.png$/);
    expect(await storage.read(saved.reference)).toEqual(generated);
    expect(await readdir(directory)).toEqual([saved.reference]);
  });

  it("rejects path traversal references for reads and deletes", async () => {
    const { storage } = await setup();

    await expect(storage.open("../outside.pdf")).rejects.toThrow(
      "Invalid storage reference."
    );
    await expect(storage.read("../outside.pdf")).rejects.toThrow(
      "Invalid storage reference."
    );
    await expect(storage.delete("../../outside.pdf")).rejects.toThrow(
      "Invalid storage reference."
    );
  });

  it("rejects a missing safe reference before a stream is returned", async () => {
    const { storage } = await setup();

    await expect(
      storage.open("00000000-0000-4000-8000-000000000001.pdf")
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
