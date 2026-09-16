import { Readable } from "node:stream";
import { extname } from "node:path";
import { fileTypeFromTokenizer } from "file-type";
import { parseBuffer, parseFromTokenizer } from "music-metadata";
import { AbstractTokenizer, EndOfStreamError, type IReadChunkOptions, type IGetToken } from "strtok3";
import yauzl from "yauzl";
import type { ChatAttachment, ChatAttachmentKind } from "../contracts/project-chat.js";
import { ApiError } from "../middleware/errors.js";
import { isValidPdfDocument } from "../middleware/upload.js";
import type { ManagedFileStorage } from "../storage/managed-storage.js";
import { createProjectChatAttachmentPolicy } from "./project-chat-attachment-policy.js";
import { webmInspectionMetadata } from "./project-chat-webm-inspection.js";

function invalid(message = "The file contents do not match a supported format."): never { throw new ApiError(400, "CHAT_ATTACHMENT_INVALID", message); }
const MAX_READ = 1024 * 1024;
// The established PDF parser needs random access to complete bytes. Only PDFs
// use this bounded buffer, with one parse per API process and no waiting queue.
// Its existing decoder is not a hard-kill sandbox; cancellation is checked on
// streamed input and before/after parsing. Other attachment types stay streamed.
const MAX_PDF_BYTES = 50 * 1024 * 1024;
let activePdfParses = 0;
export function sanitizeChatFilename(input: string): string {
  if (Buffer.from(input, "utf8").toString("utf8") !== input) invalid("Choose a filename with valid Unicode text.");
  const normalized = input.replaceAll("\\", "/").split("/").at(-1)!.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  const suffix = normalized.length > 180 ? extname(normalized) : "";
  const stem = suffix ? normalized.slice(0, -suffix.length) : normalized;
  if (suffix.length > 30) invalid("Choose a file with a supported extension.");
  let result = "";
  for (const point of stem) {if (result.length + point.length > 180 - suffix.length) break; result += point;}
  result += suffix;
  if (!result || result === "." || result === "..") invalid("Choose a file with a valid name.");
  return result;
}
class InspectionReader {
  calls = 0; bytes = 0;
  constructor(readonly storage: ManagedFileStorage, readonly reference: string, readonly size: number, readonly signal?: AbortSignal) {}
  async read(offset: number, length: number): Promise<Buffer> {
    this.signal?.throwIfAborted();
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || length > MAX_READ || offset + length > this.size || ++this.calls > 8192 || (this.bytes += length) > 12 * MAX_READ) invalid("The file exceeds the safe container inspection limit.");
    const value = await this.storage.readRange(this.reference, {offset, length, signal: this.signal});
    if (value.length !== length) invalid("The file is incomplete.");
    return value;
  }
}
class ManagedTokenizer extends AbstractTokenizer {
  fileInfo: {size: number};
  private ended = false;
  constructor(readonly reader: InspectionReader) {super(); this.fileInfo = {size: reader.size};}
  supportsRandomAccess() {return true;}
  setPosition(position: number) {
    if (!Number.isSafeInteger(position) || position < 0 || position > this.reader.size) invalid();
    this.reader.signal?.throwIfAborted();
    this.position = position;
  }
  async readBuffer(buffer: Uint8Array, options: IReadChunkOptions = {}) {
    const position = options.position ?? this.position;
    const count = await this.peekBuffer(buffer, {...options, position});
    this.position = position + count;
    return count;
  }
  async peekBuffer(buffer: Uint8Array, options: IReadChunkOptions = {}) {
    if (this.ended) throw new EndOfStreamError();
    const position = options.position ?? this.position;
    const requested = options.length ?? buffer.length;
    if (!Number.isSafeInteger(position) || position < 0 || position > this.reader.size || requested < 0 || requested > MAX_READ || requested > buffer.length) invalid();
    const length = Math.min(requested, this.reader.size - position);
    if (length < requested && !options.mayBeLess) throw new EndOfStreamError();
    const data = await this.reader.read(position, length);
    buffer.set(data, 0);
    return length;
  }
  async readToken<T>(token: IGetToken<T>, position?: number) {if (token.len > MAX_READ || token.len < 0) invalid(); return super.readToken(token, position);}
  async peekToken<T>(token: IGetToken<T>, position?: number) {if (token.len > MAX_READ || token.len < 0) invalid(); return super.peekToken(token, position);}
  async ignore(length: number) {if (!Number.isSafeInteger(length) || length < 0) invalid(); this.reader.signal?.throwIfAborted(); return super.ignore(length);}
  async abort() {this.ended = true;}
}
const aliases: Record<string, string> = {"image/jpg": "image/jpeg", "image/x-tiff": "image/tiff", "application/x-zip-compressed": "application/zip", "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/x-m4a": "audio/mp4", "application/ogg": "audio/ogg"};
const normalizedMime = (mime: string) => {
  const essence = mime.split(";", 1)[0]!.trim().toLowerCase();
  return aliases[essence] ?? essence;
};
const formatExtensions: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"], "image/gif": [".gif"],
  "image/heic": [".heic", ".heif"], "image/heif": [".heic", ".heif"], "image/tiff": [".tif", ".tiff"],
  "video/mp4": [".mp4"], "video/quicktime": [".mov"], "video/webm": [".webm"],
  "audio/mpeg": [".mp3"], "audio/mp4": [".m4a", ".mp4"], "audio/wav": [".wav"], "audio/ogg": [".ogg", ".opus"], "audio/webm": [".webm"],
  "application/pdf": [".pdf"], "application/zip": [".zip"], "text/plain": [".txt"], "text/csv": [".csv"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"]
};
async function inspectText(reader: InspectionReader, extension: string) {
  const decoder = new TextDecoder("utf-8", {fatal: true});
  let prefix = "";
  let checkedPrefix = false;
  // Text decoding is streamed independently of the bounded random-access metadata budget.
  const stream = await reader.storage.open(reader.reference, {signal: reader.signal});
  try {
    for await (const chunk of stream) {
      reader.signal?.throwIfAborted();
      const value = decoder.decode(chunk, {stream: true});
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid();
      if (!checkedPrefix) {
        prefix = (prefix + value).trimStart().slice(0, 128);
        if (/^(?:<!doctype\s+html|<html\b|<svg\b|<script\b|#!)/i.test(prefix)) invalid();
        checkedPrefix = prefix.length === 128;
      }
    }
    decoder.decode();
  } finally {stream.destroy();}
  return {kind: "document" as const, mimeType: extension === ".csv" ? "text/csv" : "text/plain"};
}
async function inspectZip(reader: InspectionReader) {
  class StorageZipReader extends yauzl.RandomAccessReader {
    _readStreamForRange(start: number, end: number): Readable {
      return Readable.from((async function* () {for (let offset = start; offset < end; offset += 64 * 1024) yield await reader.read(offset, Math.min(64 * 1024, end - offset));})());
    }
  }
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.fromRandomAccessReader(new StorageZipReader(), reader.size, {lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true}, (error, value) => error ? reject(error) : resolve(value!)));
  const entries = new Map<string, yauzl.Entry>();
  let nameBytes = 0;
  try {
    if (zip.entryCount > 10_000) invalid("The archive has too many entries to inspect safely.");
    await new Promise<void>((resolve, reject) => {
      zip.once("error", reject); zip.once("end", resolve);
      zip.on("entry", (entry: yauzl.Entry) => {
        try {
          reader.signal?.throwIfAborted();
          if (entries.has(entry.fileName) || (nameBytes += Buffer.byteLength(entry.fileName)) > MAX_READ || entry.relativeOffsetOfLocalHeader >= reader.size || entry.compressedSize > reader.size) invalid();
          entries.set(entry.fileName, entry); zip.readEntry();
        } catch (error) {reject(error);}
      });
      zip.readEntry();
    });
    const roots = [["word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"],
      ["xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"],
      ["ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"]] as const;
    const matches = roots.filter(([root]) => entries.has(root));
    if (!matches.length) return {kind: "archive" as const, mimeType: "application/zip"};
    if (matches.length !== 1 || !entries.has("_rels/.rels")) invalid();
    const manifest = entries.get("[Content_Types].xml");
    if (!manifest || manifest.uncompressedSize > 256 * 1024 || manifest.isEncrypted() || [...entries.keys()].some(name => /(?:^|\/)vbaProject\.bin$/i.test(name))) invalid();
    const stream = await new Promise<Readable>((resolve, reject) => zip.openReadStream(manifest, (error, value) => error ? reject(error) : resolve(value!)));
    const chunks: Buffer[] = []; let size = 0;
    try {for await (const chunk of stream) {reader.signal?.throwIfAborted(); size += chunk.length; if (size > 256 * 1024) invalid(); chunks.push(chunk);}}
    finally {stream.destroy();}
    const xml = new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks));
    if (/<!doctype|<!entity|macroEnabled|vbaProject/i.test(xml) || !xml.includes(matches[0]![2])) invalid();
    return {kind: "document" as const, mimeType: matches[0]![1]};
  } finally {zip.close();}
}
async function checkIsoBoxes(reader: InspectionReader, requireMovie: boolean) {
  let position = 0, count = 0; const types = new Set<string>();
  while (position < reader.size) {
    if (++count > 1024 || reader.size - position < 8) invalid();
    const header = await reader.read(position, Math.min(16, reader.size - position));
    let length = header.readUInt32BE(0); const type = header.toString("ascii", 4, 8); let headerSize = 8;
    if (length === 1) {if (header.length < 16) invalid(); const extended = header.readBigUInt64BE(8); if (extended > BigInt(Number.MAX_SAFE_INTEGER)) invalid(); length = Number(extended); headerSize = 16;}
    if (length === 0) length = reader.size - position;
    if (length < headerSize || position + length > reader.size) invalid();
    types.add(type); position += length;
  }
  if (requireMovie ? !types.has("moov") || !types.has("mdat") : !types.has("ftyp") || !types.has("meta")) invalid();
}
async function checkImage(reader: InspectionReader, mime: string) {
  const head = await reader.read(0, Math.min(reader.size, 32));
  const tail = await reader.read(Math.max(0, reader.size - 16), Math.min(reader.size, 16));
  if (mime === "image/png" && (head.length < 24 || head.toString("ascii", 12, 16) !== "IHDR" || !head.readUInt32BE(16) || !head.readUInt32BE(20) || !tail.includes(Buffer.from("IEND")))) invalid();
  if (mime === "image/jpeg" && (reader.size < 8 || tail.at(-2) !== 0xff || tail.at(-1) !== 0xd9)) invalid();
  if (mime === "image/gif" && (head.length < 13 || !head.readUInt16LE(6) || !head.readUInt16LE(8) || tail.at(-1) !== 0x3b)) invalid();
  if (mime === "image/webp" && (head.length < 20 || head.readUInt32LE(4) + 8 !== reader.size)) invalid();
  if (mime === "image/heic" || mime === "image/heif") await checkIsoBoxes(reader, false);
  if (mime === "image/tiff") {if (head.length < 8) invalid(); const offset = head.toString("ascii", 0, 2) === "II" ? head.readUInt32LE(4) : head.readUInt32BE(4); if (offset < 8 || offset >= reader.size) invalid();}
}
async function inspectPdf(reader: InspectionReader) {
  const head = await reader.read(0, Math.min(16, reader.size));
  const tail = await reader.read(Math.max(0, reader.size - 4096), Math.min(4096, reader.size));
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail.toString("latin1"));
  if (!/^%PDF-\d\.\d/.test(head.toString("ascii")) || !match) invalid();
  const offset = Number(match[1]);
  if (!Number.isSafeInteger(offset) || offset < 8 || offset >= reader.size) invalid();
  const section = await reader.read(offset, Math.min(48, reader.size - offset));
  if (!/^(?:xref\b|\d+\s+\d+\s+obj\b)/.test(section.toString("ascii"))) invalid();
  if (reader.size > MAX_PDF_BYTES) throw new ApiError(413, "CHAT_ATTACHMENT_LIMIT", "PDF files cannot exceed 50 MiB.");
  if (activePdfParses >= 1) throw new ApiError(503, "CHAT_ATTACHMENT_VALIDATION_BUSY", "Another PDF is being checked. Retry this file shortly.", undefined, {"Retry-After": "2"});
  activePdfParses++;
  let stream: Readable | undefined;
  try {
    reader.signal?.throwIfAborted();
    const bytes = Buffer.allocUnsafe(reader.size);
    let received = 0;
    stream = await reader.storage.open(reader.reference, {signal: reader.signal});
    for await (const chunk of stream) {
      reader.signal?.throwIfAborted();
      if (!(chunk instanceof Uint8Array) || received + chunk.length > bytes.length) invalid("The stored PDF size changed during validation.");
      bytes.set(chunk, received); received += chunk.length;
    }
    if (received !== bytes.length) invalid("The stored PDF is incomplete.");
    reader.signal?.throwIfAborted();
    const valid = await isValidPdfDocument(bytes);
    reader.signal?.throwIfAborted();
    if (!valid) invalid("The PDF structure is invalid or contains no readable pages.");
  } finally {stream?.destroy(); activePdfParses--;}
}
export async function inspectChatAttachment(storage: ManagedFileStorage, reference: string, input: {id: string; filename: string; claimedMimeType: string; byteSize: number; signal?: AbortSignal}): Promise<ChatAttachment> {
  const extension = extname(input.filename).toLowerCase();
  const policy = createProjectChatAttachmentPolicy();
  if (!policy.formats.some(format => format.extensions.includes(extension))) invalid("Supported files are images, MP4/MOV/WebM video, audio, PDF, Office documents, TXT/CSV, and ZIP.");
  const reader = new InspectionReader(storage, reference, input.byteSize, input.signal);
  try {
    const signature = await reader.read(0, Math.min(4, input.byteSize));
    // ZIP identification is followed by our bounded central-directory inspection; do not let a generic detector inflate entries.
    const detected = signature.length === 4 && signature[0] === 0x50 && signature[1] === 0x4b && ((signature[2] === 3 && signature[3] === 4) || (signature[2] === 5 && signature[3] === 6))
      ? {mime: "application/zip"} : await fileTypeFromTokenizer(new ManagedTokenizer(reader));
    let mimeType = normalizedMime(detected?.mime ?? "");
    let kind: ChatAttachmentKind;
    if ([".txt", ".csv"].includes(extension)) {
      if (detected) invalid();
      ({mimeType, kind} = await inspectText(reader, extension));
    } else if (mimeType === "application/zip" || mimeType.startsWith("application/vnd.openxmlformats-officedocument.")) ({mimeType, kind} = await inspectZip(reader));
    else if (mimeType.startsWith("image/")) {kind = "image"; await checkImage(reader, mimeType);}
    else if (mimeType === "application/pdf") {kind = "document"; await inspectPdf(reader);}
    else if (mimeType.startsWith("audio/") || mimeType.startsWith("video/")) {
      if (["video/mp4", "audio/mp4", "video/quicktime"].includes(mimeType)) await checkIsoBoxes(reader, true);
      const options = {skipCovers: true, skipPostHeaders: true, duration: false};
      const parsed = mimeType === "video/webm" || mimeType === "audio/webm"
        ? await parseBuffer(await webmInspectionMetadata(reader), {mimeType: "video/webm"}, options)
        : await parseFromTokenizer(new ManagedTokenizer(reader), options);
      const video = parsed.format.hasVideo || parsed.format.trackInfo?.some(track => Boolean(track.video));
      const audio = parsed.format.hasAudio || Boolean(parsed.format.numberOfChannels) || parsed.format.trackInfo?.some(track => Boolean(track.audio));
      if (!video && !audio) invalid();
      kind = video ? "video" : "audio";
      if (mimeType === "video/webm" || mimeType === "audio/webm") mimeType = `${kind}/webm`;
      if (mimeType === "video/mp4" || mimeType === "audio/mp4") mimeType = `${kind}/mp4`;
      if (mimeType === "audio/opus") mimeType = "audio/ogg";
    } else invalid();
    if (!formatExtensions[mimeType]?.includes(extension)) invalid("The filename extension does not match the file contents.");
    const allowed = policy.formats.find(format => format.kind === kind! && format.extensions.includes(extension) && format.mimeTypes.includes(mimeType));
    if (!allowed) invalid();
    const claimed = normalizedMime(input.claimedMimeType);
    if (!["application/octet-stream", "binary/octet-stream", mimeType].includes(claimed) && !(mimeType === "audio/mp4" && claimed === "video/mp4") && !(mimeType === "audio/webm" && claimed === "video/webm") && !(mimeType === "image/heic" && claimed === "image/heif")) invalid("The file type does not match its contents.");
    return {id: input.id, kind: kind!, filename: input.filename, mimeType, byteSize: input.byteSize, preview: null};
  } catch (error) {
    if (error instanceof ApiError) throw error;
    input.signal?.throwIfAborted();
    throw Object.assign(new ApiError(400, "CHAT_ATTACHMENT_INVALID", "The file contents do not match a supported format."), {cause: error});
  }
}
