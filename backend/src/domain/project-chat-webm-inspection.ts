import { ApiError } from "../middleware/errors.js";

interface ContainerReader {
  readonly size: number;
  readonly signal?: AbortSignal;
  read(offset: number, length: number): Promise<Buffer>;
}
interface Element {id: number; start: number; data: number; end: number; unknown: boolean}
const EBML = 0x1a45dfa3, SEGMENT = 0x18538067, CLUSTER = 0x1f43b675, TRACKS = 0x1654ae6b;
const MAX_METADATA = 256 * 1024, MAX_ELEMENTS = 65_536;
const segmentChildren = new Set([0x114d9b74, 0x1549a966, TRACKS, CLUSTER, 0x1c53bb6b, 0x1941a469, 0x1043a770, 0x1254c367]);
// Only these finite metadata masters are handed to music-metadata. Other
// metadata is opaque and skipped, after checking its declared file bounds.
const trackMasters = new Set([TRACKS, 0xae, 0xe0, 0xe1, 0x6d80, 0x6240, 0x5034, 0x5035]);
const invalid = (): never => {throw new ApiError(400, "CHAT_ATTACHMENT_INVALID", "The file contents do not match a supported format.");};

function vint(bytes: Buffer, offset: number, maxWidth: number, keepMarker = false) {
  const first = bytes[offset];
  if (!first) return invalid();
  let width = 1, marker = 0x80;
  while (!(first & marker)) {width++; marker >>= 1;}
  if (width > maxWidth || offset + width > bytes.length) return invalid();
  let value = BigInt(keepMarker ? first : first & (marker - 1));
  for (let index = 1; index < width; index++) value = (value << 8n) | BigInt(bytes[offset + index]!);
  return {width, value, unknown: !keepMarker && value === (1n << BigInt(7 * width)) - 1n};
}

/**
 * Validate the original WebM and return a small, finite metadata-only envelope.
 * MediaRecorder emits unknown-size Segment/Cluster masters, which the installed
 * metadata parser mistakes for numeric skip lengths. Resolving them here keeps
 * its general tokenizer guards intact, including one-byte unknown-size VINTs
 * whose eventual length cannot fit into a same-width numeric replacement.
 * No stored bytes change; codec packets are bounded/skipped, never decoded.
 */
export async function webmInspectionMetadata(reader: ContainerReader): Promise<Buffer> {
  let count = 0, cachedStart = -1, windowBytes = 4096;
  let cached: Buffer = Buffer.alloc(0);
  const read = async (offset: number, length: number) => {
    reader.signal?.throwIfAborted();
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || length < 0 || offset < 0 || offset + length > reader.size) return invalid();
    if (offset >= cachedStart && offset + length <= cachedStart + cached.length) return cached.subarray(offset - cachedStart, offset - cachedStart + length);
    // Reuse a small window for dense audio blocks without spending one storage
    // request per packet. All reads still consume the caller's global budget.
    if (length <= 4096) {
      cachedStart = offset;
      cached = await reader.read(offset, Math.min(Math.max(length, windowBytes), reader.size - offset));
      return cached.subarray(0, length);
    }
    return reader.read(offset, length);
  };
  const element = async (start: number, limit: number): Promise<Element> => {
    if (++count > MAX_ELEMENTS || start >= limit) return invalid();
    const bytes = await read(start, Math.min(12, limit - start));
    const id = vint(bytes, 0, 4, true), size = vint(bytes, id.width, 8);
    const data = start + id.width + size.width;
    if (!size.unknown && size.value > BigInt(limit - data)) return invalid();
    return {id: Number(id.value), start, data, end: size.unknown ? limit : data + Number(size.value), unknown: size.unknown};
  };
  const uint = async (item: Element) => {
    if (item.unknown || item.end - item.data < 1 || item.end - item.data > 8) return invalid();
    let value = 0n;
    for (const byte of await read(item.data, item.end - item.data)) value = (value << 8n) | BigInt(byte);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return invalid();
    return Number(value);
  };
  const tracks = new Map<number, number>(), mediaBlocks = new Set<number>();
  let metadataBytes = 0;
  const snapshot = async (item: Element) => {
    metadataBytes += item.end - item.start;
    if (metadataBytes > MAX_METADATA) return invalid();
    return read(item.start, item.end - item.start);
  };
  const metadata = async (parent: Element, depth = 0): Promise<void> => {
    if (parent.unknown || depth > 8) return invalid();
    let position = parent.data, number = 0, type = 0, codec = "", audio = false, video = false;
    const unique = new Set<number>();
    while (position < parent.end) {
      const child = await element(position, parent.end);
      if (child.unknown) return invalid();
      if ([0xd7, 0x83, 0x86, 0xe0, 0xe1].includes(child.id) && parent.id === 0xae) {
        if (unique.has(child.id)) return invalid();
        unique.add(child.id);
        if (child.id === 0xd7) number = await uint(child);
        if (child.id === 0x83) type = await uint(child);
        if (child.id === 0x86) {
          if (child.end - child.data < 1 || child.end - child.data > 128) return invalid();
          codec = (await read(child.data, child.end - child.data)).toString("ascii");
        }
        if (child.id === 0xe0) video = true;
        if (child.id === 0xe1) audio = true;
      }
      if (child.id === 0xae && parent.id !== TRACKS || [0xe0, 0xe1].includes(child.id) && parent.id !== 0xae || child.id === TRACKS) return invalid();
      if (trackMasters.has(child.id)) await metadata(child, depth + 1);
      position = child.end;
    }
    if (parent.id === 0xae) {
      if (!number || !type || !codec || tracks.has(number) || tracks.size >= 128) return invalid();
      if (type === 1 && (!video || audio || !codec.startsWith("V_")) || type === 2 && (!audio || video || !codec.startsWith("A_"))) return invalid();
      tracks.set(number, type);
    }
  };
  const block = async (item: Element) => {
    if (item.unknown || item.end - item.data < 5) return invalid();
    const bytes = await read(item.data, Math.min(12, item.end - item.data));
    const track = vint(bytes, 0, 8);
    if (!track.value || track.unknown || track.value > BigInt(Number.MAX_SAFE_INTEGER) || item.end - item.data <= track.width + 3) return invalid();
    const lacing = (bytes[track.width + 2]! >> 1) & 3;
    if (lacing) {
      let position = item.data + track.width + 3;
      const frames = (await read(position++, 1))[0]! + 1;
      if (position >= item.end) return invalid();
      if (lacing === 2) {
        if ((item.end - position) % frames) return invalid();
      } else {
        let total = 0, previous = 0;
        for (let frame = 0; frame < frames - 1; frame++) {
          let size = 0;
          if (lacing === 1) {
            let part: number;
            do {
              if (++count > MAX_ELEMENTS || position >= item.end) return invalid();
              part = (await read(position++, 1))[0]!; size += part;
            } while (part === 255);
          } else {
            const lace = vint(await read(position, Math.min(8, item.end - position)), 0, 8);
            position += lace.width;
            const value = frame ? BigInt(previous) + lace.value - ((1n << BigInt(lace.width * 7 - 1)) - 1n) : lace.value;
            if (value < 1n || value > BigInt(item.end - position)) return invalid();
            size = Number(value);
          }
          if (size < 1 || (total += size) >= item.end - position) return invalid();
          previous = size;
        }
      }
    }
    // The full finite Block length is checked against its enclosing Cluster.
    // Its compressed payload is opaque; packet signatures cannot end a Cluster.
    mediaBlocks.add(Number(track.value));
    if (mediaBlocks.size > 128) return invalid();
    // A window just larger than the preceding packet normally spans two Block
    // headers. Avoid reading every compressed byte merely to find boundaries.
    windowBytes = Math.min(4096, item.end - item.start + 64);
  };
  const cluster = async (parent: Element) => {
    let position = parent.data, timestamp = false;
    while (position < parent.end) {
      const child = await element(position, parent.end);
      if (segmentChildren.has(child.id)) {
        if (!parent.unknown) return invalid();
        break;
      }
      if (child.unknown || child.id === EBML || child.id === SEGMENT) return invalid();
      if (child.id === 0xe7) {if (timestamp) return invalid(); await uint(child); timestamp = true;}
      if (child.id === 0xa3) await block(child);
      if (child.id === 0xa0) {
        let blockPosition = child.data, blocks = 0;
        while (blockPosition < child.end) {
          const part = await element(blockPosition, child.end);
          if (part.unknown) return invalid();
          if (part.id === 0xa1) {await block(part); blocks++;}
          blockPosition = part.end;
        }
        if (blocks !== 1) return invalid();
      }
      position = child.end;
    }
    if (!timestamp) return invalid();
    return position;
  };

  const header = await element(0, reader.size);
  if (header.id !== EBML || header.unknown || header.end > 4096) return invalid();
  let position = header.data, docType = false;
  while (position < header.end) {
    const child = await element(position, header.end);
    if (child.unknown) return invalid();
    if (child.id === 0x4282) {
      if (docType || child.end - child.data !== 4 || (await read(child.data, 4)).toString("ascii") !== "webm") return invalid();
      docType = true;
    }
    if (child.id === 0x42f2 && await uint(child) !== 4 || child.id === 0x42f3 && await uint(child) !== 8) return invalid();
    position = child.end;
  }
  if (!docType) return invalid();
  const headerBytes = await snapshot(header);
  // Global Void / CRC elements may precede the Segment.
  let segment = await element(header.end, reader.size);
  while (!segment.unknown && [0xec, 0xbf].includes(segment.id)) segment = await element(segment.end, reader.size);
  if (segment.id !== SEGMENT) return invalid();
  position = segment.data;
  let trackBytes: Buffer | undefined, info = false, clusters = 0;
  while (position < segment.end) {
    const child = await element(position, segment.end);
    if (child.unknown && child.id !== CLUSTER || child.id === EBML || child.id === SEGMENT) return invalid();
    if (child.id === TRACKS) {
      if (trackBytes || child.end - child.start > MAX_METADATA) return invalid();
      await metadata(child);
      trackBytes = await snapshot(child);
    }
    if (child.id === 0x1549a966) {
      if (info) return invalid();
      // Info is required, but duration/tags are not needed for classification.
      await metadata(child);
      info = true;
    }
    if (child.id === CLUSTER) {position = await cluster(child); clusters++;}
    else position = child.end;
  }
  if (!info || !trackBytes || !clusters || !mediaBlocks.size || ![...mediaBlocks].some(id => [1, 2].includes(tracks.get(id) ?? 0)) || [...mediaBlocks].some(id => !tracks.has(id))) return invalid();
  while (position < reader.size) {
    const trailing = await element(position, reader.size);
    if (trailing.unknown || ![0xec, 0xbf].includes(trailing.id)) return invalid();
    position = trailing.end;
  }
  const finiteSegment = Buffer.alloc(12);
  finiteSegment.writeUInt32BE(SEGMENT);
  finiteSegment.writeBigUInt64BE((1n << 56n) | BigInt(trackBytes.length), 4);
  return Buffer.concat([headerBytes, finiteSegment, trackBytes]);
}
