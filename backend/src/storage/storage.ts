import type { Readable } from "node:stream";

export interface SaveFileInput {
  data: Buffer;
  extension: ".pdf" | ".png" | ".jpg" | ".webp";
}

export interface StoredFile {
  reference: string;
}

export interface FileStorage {
  save(input: SaveFileInput): Promise<StoredFile>;
  saveGenerated(input: SaveFileInput): Promise<StoredFile>;
  read(reference: string): Promise<Buffer>;
  delete(reference: string): Promise<void>;
  open(reference: string): Promise<Readable>;
}
