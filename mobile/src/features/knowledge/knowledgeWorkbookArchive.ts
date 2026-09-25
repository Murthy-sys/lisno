const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 32 * 1024 * 1024;
const MAX_MEMBERS = 2000;
const MAX_INSPECTION_MS = 20_000;
const INPUT_CHUNK_BYTES = 1024;
const OUTPUT_CHUNK_BYTES = 4096;

interface ArchiveMember {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly expandedSize: number;
  readonly crc: number;
  readonly start: number;
  readonly dataStart: number;
  readonly end: number;
}
interface RawInflate {
  readonly err: number;
  readonly ended: boolean;
  readonly strm: { readonly avail_in: number; readonly total_in: number };
  onData: (chunk: Uint8Array) => void;
  push: (chunk: Uint8Array, finish: false) => boolean;
}
type Crc32 = (crc: number, bytes: Uint8Array, length: number, offset: number) => number;
const malformed = () => new Error("The workbook archive is incomplete or inconsistent. Save a fresh .xlsx copy.");
const expandedLimit = () => new Error("The expanded workbook is too large. Remove unused sheets and formatting.");
const unsupported = () => new Error("This workbook archive format is not supported. Save a fresh .xlsx copy.");
const now = () => globalThis.performance?.now?.() ?? Date.now();
const yieldToNative = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * Validate actual ZIP expansion before ExcelJS creates its workbook model. Output
 * chunks are counted and discarded, never concatenated or retained by this layer.
 */
export async function inspectQualityWorkbookArchive(buffer: ArrayBuffer): Promise<void> {
  const started = now();
  const checkTime = () => { if (now() - started > MAX_INSPECTION_MS) throw new Error("The workbook took too long to inspect. Remove unused sheets and formatting."); };
  const members = inspectMembers(buffer, checkTime);
  checkTime();
  const { Inflate }: { Inflate: new (options: { raw: true; chunkSize: number }) => RawInflate } = require("pako");
  const crc32: Crc32 = require("pako/lib/zlib/crc32");
  const bytes = new Uint8Array(buffer);
  let totalExpanded = 0;
  for (const member of members) {
    await yieldToNative();
    checkTime();
    let expanded = 0;
    let crc = 0;
    const count = (chunk: Uint8Array) => {
      checkTime();
      expanded += chunk.byteLength;
      totalExpanded += chunk.byteLength;
      if (totalExpanded > MAX_EXPANDED_BYTES) throw expandedLimit();
      if (expanded > member.expandedSize) throw malformed();
      crc = crc32(crc, chunk, chunk.byteLength, 0);
    };
    if (member.method === 0) {
      for (let offset = 0; offset < member.compressedSize; offset += OUTPUT_CHUNK_BYTES) {
        count(bytes.subarray(member.dataStart + offset, member.dataStart + Math.min(offset + OUTPUT_CHUNK_BYTES, member.compressedSize)));
        await yieldToNative();
      }
    } else {
      const inflater = new Inflate({ raw: true, chunkSize: OUTPUT_CHUNK_BYTES });
      inflater.onData = count;
      let delivered = 0;
      while (delivered < member.compressedSize) {
        checkTime();
        if (inflater.ended) throw malformed();
        const end = Math.min(delivered + INPUT_CHUNK_BYTES, member.compressedSize);
        // Do not pass Z_FINISH: pako 1 can otherwise mark a truncated stream ended.
        const accepted = inflater.push(bytes.subarray(member.dataStart + delivered, member.dataStart + end), false);
        delivered = end;
        if (!accepted || inflater.err || (inflater.ended && (inflater.strm.avail_in !== 0 || delivered !== member.compressedSize))) throw malformed();
        await yieldToNative();
      }
      if (!inflater.ended || inflater.err || inflater.strm.total_in !== member.compressedSize || inflater.strm.avail_in !== 0) throw malformed();
    }
    checkTime();
    if (expanded !== member.expandedSize || (crc >>> 0) !== member.crc) throw malformed();
  }
}

function inspectMembers(buffer: ArrayBuffer, checkTime: () => void): readonly ArchiveMember[] {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("The workbook must be 5 MiB or smaller.");
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (view.byteLength < 22 || view.getUint32(0, true) !== 0x04034b50) throw malformed();
  let end = -1;
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65_557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === view.byteLength) { end = offset; break; }
  }
  if (end < 0) throw malformed();
  const entries = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryStart = view.getUint32(end + 16, true);
  if (!entries || entries > MAX_MEMBERS || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 || view.getUint16(end + 8, true) !== entries || directoryStart + directorySize !== end) throw unsupported();
  const names = new Set<string>();
  const members: ArchiveMember[] = [];
  let offset = directoryStart;
  let declaredTotal = 0;
  for (let index = 0; index < entries; index++) {
    checkTime();
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw malformed();
    const version = view.getUint16(offset + 6, true);
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const expandedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const start = view.getUint32(offset + 42, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (version > 20 || (flags & ~0x080e) !== 0 || ![0, 8].includes(method) || (method === 0 && (flags & 6) !== 0) || view.getUint16(offset + 34, true) !== 0 || compressedSize === 0xffffffff || expandedSize === 0xffffffff || start === 0xffffffff) throw unsupported();
    if (!nameLength || next > end || start + 30 > directoryStart) throw malformed();
    inspectExtra(view, offset + 46 + nameLength, extraLength);
    const encodedName = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = decodeName(encodedName, flags);
    if (names.has(name) || name.includes("..") || name.startsWith("/") || name.includes("\\") || /[\u0000-\u001f\u007f:]/u.test(name)) throw malformed();
    if (/vbaproject|macrosheets|externallinks|embeddings|activex/iu.test(name)) throw new Error("Remove macros, embedded objects and external links before importing.");
    names.add(name);
    if (name.endsWith("/") && expandedSize !== 0) throw malformed();
    declaredTotal += expandedSize;
    if (declaredTotal > MAX_EXPANDED_BYTES) throw expandedLimit();
    if (method === 0 && compressedSize !== expandedSize) throw malformed();
    if (view.getUint32(start, true) !== 0x04034b50 || view.getUint16(start + 4, true) !== version || view.getUint16(start + 6, true) !== flags || view.getUint16(start + 8, true) !== method || view.getUint32(start + 10, true) !== view.getUint32(offset + 12, true)) throw malformed();
    const localNameLength = view.getUint16(start + 26, true);
    const localExtraLength = view.getUint16(start + 28, true);
    const dataStart = start + 30 + localNameLength + localExtraLength;
    if (localNameLength !== nameLength || dataStart > directoryStart || dataStart + compressedSize > directoryStart) throw malformed();
    for (let nameIndex = 0; nameIndex < nameLength; nameIndex++) if (bytes[start + 30 + nameIndex] !== encodedName[nameIndex]) throw malformed();
    inspectExtra(view, start + 30 + localNameLength, localExtraLength);
    const localValues = [view.getUint32(start + 14, true), view.getUint32(start + 18, true), view.getUint32(start + 22, true)];
    const expected = [crc, compressedSize, expandedSize];
    const descriptor = (flags & 8) !== 0;
    if (localValues.some((value, valueIndex) => value !== expected[valueIndex] && (!descriptor || value !== 0))) throw malformed();
    let memberEnd = dataStart + compressedSize;
    if (descriptor) {
      const matches = (descriptorStart: number) => descriptorStart + 12 <= directoryStart && expected.every((value, valueIndex) => view.getUint32(descriptorStart + valueIndex * 4, true) === value);
      if (memberEnd + 4 <= directoryStart && view.getUint32(memberEnd, true) === 0x08074b50 && matches(memberEnd + 4)) memberEnd += 16;
      else if (matches(memberEnd)) memberEnd += 12;
      else throw malformed();
    }
    members.push({ name, method, compressedSize, expandedSize, crc, start, dataStart, end: memberEnd });
    offset = next;
  }
  if (offset !== end || !names.has("xl/workbook.xml") || !names.has("[content_types].xml")) throw malformed();
  members.sort((left, right) => left.start - right.start);
  let previousEnd = 0;
  for (const member of members) {
    // Reject overlap, unlisted local records and hidden padding between ZIP members.
    if (member.start !== previousEnd) throw malformed();
    previousEnd = member.end;
  }
  if (previousEnd !== directoryStart) throw malformed();
  return members;
}

function inspectExtra(view: DataView, start: number, size: number) {
  const end = start + size;
  const fields = new Set<number>();
  for (let offset = start; offset < end;) {
    if (offset + 4 > end) throw malformed();
    const id = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    if (fields.has(id)) throw malformed();
    fields.add(id);
    // These change offsets/sizes or can override the name consumed by ExcelJS.
    if (id === 0x0001 || id === 0x7075 || id === 0x6375) throw unsupported();
    offset += 4 + length;
    if (offset > end) throw malformed();
  }
}

function decodeName(bytes: Uint8Array, flags: number): string {
  if (!(flags & 0x0800) && bytes.some(byte => byte > 0x7f)) throw unsupported();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).toLocaleLowerCase("en-US"); }
  catch { throw malformed(); }
}
