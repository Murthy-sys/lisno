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

    await storage.delete(saved.reference);
    expect(await readdir(directory)).toEqual([]);
  });

  it("rejects path traversal references for reads and deletes", async () => {
    const { storage } = await setup();

    await expect(storage.open("../outside.pdf")).rejects.toThrow(
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
