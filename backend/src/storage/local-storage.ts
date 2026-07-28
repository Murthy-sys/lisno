import { randomUUID } from "node:crypto";
import type { ReadStream } from "node:fs";
import { mkdir, open as openFile, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  FileStorage,
  SaveFileInput,
  StoredFile
} from "./storage.js";

const safeReference =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:pdf|png|jpg|webp)$/i;

export function createLocalStorage(rootDirectory: string): FileStorage {
  const root = path.resolve(rootDirectory);

  const save = async (input: SaveFileInput): Promise<StoredFile> => {
      await mkdir(root, { recursive: true });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const reference = `${randomUUID()}${input.extension}`;
        try {
          await writeFile(resolveReference(root, reference), input.data, {
            flag: "wx",
            mode: 0o600
          });
          return { reference };
        } catch (error) {
          if (
            typeof error !== "object" ||
            error === null ||
            !("code" in error) ||
            error.code !== "EEXIST"
          ) {
            throw error;
          }
        }
      }
      throw new Error("Could not allocate a unique storage filename.");
  };

  return {
    save,
    saveGenerated: save,
    async read(reference: string) {
      return readFile(resolveReference(root, reference));
    },
    async delete(reference: string) {
      try {
        await unlink(resolveReference(root, reference));
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return;
        }
        throw error;
      }
    },

    async open(reference: string): Promise<ReadStream> {
      const handle = await openFile(resolveReference(root, reference), "r");
      return handle.createReadStream();
    }
  };
}

function resolveReference(root: string, reference: string) {
  if (!safeReference.test(reference) || path.basename(reference) !== reference) {
    throw new Error("Invalid storage reference.");
  }
  const resolved = path.resolve(root, reference);
  if (path.dirname(resolved) !== root) {
    throw new Error("Invalid storage reference.");
  }
  return resolved;
}
