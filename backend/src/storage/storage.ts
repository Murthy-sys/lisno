import type { Readable } from "node:stream";

export interface SaveFileInput {
  data: Buffer;
  extension: ".pdf" | ".png" | ".jpg" | ".webp" | ".tif" | ".heic" | ".gif" | ".mp4" | ".mov" | ".webm";
}

export interface StoredFile {
  reference: string;
}

export interface FileStorage {
  save(input: SaveFileInput): Promise<StoredFile>;
  /** Optional bounded-memory import. Must delete any partial target on rejection. */
  importStream?(input: { source: Readable; extension: SaveFileInput["extension"]; expectedBytes: number; sha256: string; signal?: AbortSignal }): Promise<StoredFile>;
  saveGenerated(input: SaveFileInput): Promise<StoredFile>;
  read(reference: string): Promise<Buffer>;
  delete(reference: string): Promise<void>;
  open(reference: string): Promise<Readable>;
}

export type Storage = FileStorage;
