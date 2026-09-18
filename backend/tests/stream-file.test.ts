import { mkdtemp, readdir, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { writePrivateStream } from "../src/storage/stream-file.js";
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});
describe("private streamed file cleanup", () => {
  it.each([false, true])("removes unreturned targets when close rejects, earlier pipeline failure=%s", async pipelineFailed => {
    const directory = await mkdtemp(path.join(tmpdir(), "workflow-close-fault-"));
    try {
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      vi.mocked(open).mockImplementationOnce(async (...args) => {
        const handle = await actual.open(...args); const close = handle.close.bind(handle);
        vi.spyOn(handle, "close").mockImplementation(async () => { await close(); throw new Error("Close failed"); });
        return handle;
      });
      const source = Readable.from((async function* () { yield Buffer.from("synthetic bytes"); if (pipelineFailed) throw new Error("Read failed"); })());
      await expect(writePrivateStream(path.join(directory, "private.mp4"), source)).rejects.toThrow();
      expect(await readdir(directory)).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
