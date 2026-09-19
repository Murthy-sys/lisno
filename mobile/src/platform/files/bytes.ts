import { File, Paths } from "expo-file-system";

export const DEFAULT_MAX_WORKBOOK_BYTES = 5 * 1024 * 1024;

export class FileByteLimitError extends Error {
  readonly code = "FILE_BYTE_LIMIT";

  constructor(readonly maxBytes: number) {
    super(`The file exceeds the ${maxBytes} byte limit.`);
    this.name = "FileByteLimitError";
  }
}

export async function readFileBytes(
  uri: string,
  maxBytes = DEFAULT_MAX_WORKBOOK_BYTES
): Promise<Uint8Array> {
  if (!/^(?:file|content):\/\//u.test(uri)) {
    throw new Error("Only local file references can be read.");
  }
  if (maxBytes < 1) throw new Error("The byte limit must be positive.");
  const file = new File(uri);
  if (!file.exists) throw new Error("The selected file is no longer available.");
  if (file.size !== null && file.size > maxBytes) throw new FileByteLimitError(maxBytes);
  const bytes = await file.bytes();
  if (bytes.byteLength > maxBytes) throw new FileByteLimitError(maxBytes);
  return bytes;
}

export function writePrivateFileBytes(
  bytes: Uint8Array,
  filename: string,
  maxBytes = DEFAULT_MAX_WORKBOOK_BYTES
): string {
  if (bytes.byteLength > maxBytes) throw new FileByteLimitError(maxBytes);
  const safeName = filename.replace(/[^A-Za-z0-9._-]/gu, "_").replace(/^\.+/u, "");
  if (!safeName) throw new Error("A safe file name is required.");
  const file = new File(Paths.cache, `lisno-${Date.now()}-${safeName}`);
  file.create({ overwrite: false, intermediates: true });
  file.write(bytes);
  return file.uri;
}
