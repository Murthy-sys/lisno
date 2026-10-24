import { inflateSync } from "node:zlib";
import {
  PDFArray, PDFContext, PDFDict, PDFName, PDFNumber, PDFObject,
  PDFObjectParser, PDFParser, PDFRawStream, PDFRef, decodePDFRawStream
} from "pdf-lib";

export interface PdfValidationLimits {
  maxDecodedStreamBytes: number;
  maxDecodedBytes: number;
  maxObjects: number;
  maxDepth: number;
  maxMilliseconds: number;
}

const defaults: PdfValidationLimits = {
  maxDecodedStreamBytes: 8 * 1024 * 1024,
  maxDecodedBytes: 32 * 1024 * 1024,
  maxObjects: 100_000,
  maxDepth: 64,
  maxMilliseconds: 5_000
};

class Budget {
  readonly limits: PdfValidationLimits;
  private readonly deadline: number;
  private objects = 0;
  private decoded = 0;
  depth = 0;

  constructor(limits: Partial<PdfValidationLimits> = {}) {
    this.limits = { ...defaults, ...limits };
    for (const value of Object.values(this.limits)) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid PDF validation budget.");
    }
    this.deadline = performance.now() + this.limits.maxMilliseconds;
  }

  check() {
    if (performance.now() > this.deadline) throw new Error("PDF validation deadline exceeded.");
  }

  object() {
    this.check();
    if (++this.objects > this.limits.maxObjects || this.depth > this.limits.maxDepth) {
      throw new Error("PDF structure exceeds its validation budget.");
    }
  }

  remainingStreamBytes() {
    this.check();
    const available = Math.min(this.limits.maxDecodedStreamBytes, this.limits.maxDecodedBytes - this.decoded);
    if (available <= 0) throw new Error("PDF decoded-byte budget exceeded.");
    return available;
  }

  charge(bytes: number) {
    if (bytes > this.remainingStreamBytes()) throw new Error("PDF decoded-byte budget exceeded.");
    this.decoded += bytes;
  }
}

/** Guard only this parser instance; never change pdf-lib's shared prototypes. */
function guardParser(parser: PDFObjectParser, budget: Budget, streams = false) {
  const parse = parser.parseObject.bind(parser);
  parser.parseObject = () => {
    budget.depth += 1;
    try {
      budget.object();
      const object = parse();
      return streams && object instanceof PDFRawStream ? prepareStructuralStream(object, budget) : object;
    } finally { budget.depth -= 1; }
  };
  return parser;
}

export function parseBoundedPdfObject(bytes: Uint8Array, context: PDFContext) {
  return guardParser(PDFObjectParser.forBytes(bytes, context, true), new Budget());
}

function integer(dict: PDFDict, name: string, maximum: number, minimum = 0) {
  const value = dict.lookup(PDFName.of(name), PDFNumber).asNumber();
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error("Invalid PDF structural integer.");
  return value;
}

function decodeStructuralStream(raw: PDFRawStream, budget: Budget) {
  const filter = raw.dict.lookup(PDFName.of("Filter"));
  const params = raw.dict.lookup(PDFName.of("DecodeParms"));
  const filters = filter instanceof PDFArray
    ? Array.from({ length: Math.min(filter.size(), 5) }, (_, i) => filter.lookup(i, PDFName))
    : filter instanceof PDFName ? [filter] : [];
  if ((filter && !(filter instanceof PDFArray) && !(filter instanceof PDFName)) || filters.length > 4) {
    throw new Error("Unsupported PDF filter chain.");
  }
  let bytes = raw.contents;
  if (!filters.length) budget.charge(bytes.length);
  for (let i = 0; i < filters.length; i += 1) {
    const maximum = budget.remainingStreamBytes();
    if (filters[i] === PDFName.of("FlateDecode")) {
      bytes = inflateSync(bytes, { maxOutputLength: maximum });
    } else {
      const dict = raw.dict.clone();
      dict.set(PDFName.of("Filter"), filters[i]);
      dict.delete(PDFName.of("DecodeParms"));
      const parameter = params instanceof PDFArray ? params.lookup(i) : params;
      if (parameter) dict.set(PDFName.of("DecodeParms"), parameter);
      // Decode one filter at a time so constructing a filter chain cannot cause
      // an inner decoder to allocate before its own budget is installed.
      const decoder = decodePDFRawStream(PDFRawStream.of(dict, bytes));
      const ensure = Reflect.get(decoder, "ensureBuffer");
      if (typeof ensure !== "function") throw new Error("Unsupported PDF decoder boundary.");
      Reflect.set(decoder, "ensureBuffer", (requested: number) => {
        budget.check();
        if (!Number.isSafeInteger(requested) || requested < 0 || requested > maximum) {
          throw new Error("PDF decoded-byte budget exceeded.");
        }
        const result: Uint8Array = ensure.call(decoder, requested);
        // pdf-lib doubles allocations. The requested length is bounded above,
        // and its backing allocation is therefore less than twice that bound.
        if (result.length > Math.max(512, maximum * 2)) throw new Error("Unsupported PDF decoder allocation.");
        return result;
      });
      bytes = decoder.decode();
    }
    budget.charge(bytes.length);
  }
  return bytes;
}

function validateObjectStream(raw: PDFRawStream, bytes: Uint8Array, budget: Budget) {
  const count = integer(raw.dict, "N", budget.limits.maxObjects);
  const first = integer(raw.dict, "First", bytes.length);
  const header = Buffer.from(bytes.subarray(0, first)).toString("latin1");
  const entries: Array<{ id: number; offset: number }> = [];
  const ids = new Set<number>();
  let position = 0;
  const readInteger = () => {
    while (position < header.length) {
      if (/\s|\x00/.test(header[position])) { position += 1; continue; }
      if (header[position] === "%") {
        while (position < header.length && header[position] !== "\n" && header[position] !== "\r") position += 1;
        continue;
      }
      break;
    }
    const start = position;
    while (position < header.length && header.charCodeAt(position) >= 48 && header.charCodeAt(position) <= 57) position += 1;
    const value = Number(header.slice(start, position));
    if (position === start || !Number.isSafeInteger(value)) throw new Error("Invalid PDF object stream header.");
    return value;
  };
  for (let i = 0; i < count; i += 1) {
    budget.check();
    const id = readInteger();
    const offset = readInteger();
    if (id <= 0 || ids.has(id) || offset >= bytes.length - first || (i > 0 && offset <= entries[i - 1].offset)) {
      throw new Error("Invalid PDF object stream offsets.");
    }
    ids.add(id); entries.push({ id, offset });
  }
  for (let i = 0; i < entries.length; i += 1) {
    const start = first + entries[i].offset;
    const end = i + 1 < entries.length ? first + entries[i + 1].offset : bytes.length;
    const parser = guardParser(PDFObjectParser.forBytes(bytes.subarray(start, end), raw.dict.context, true), budget);
    const object = parser.parseObject();
    if (object instanceof PDFRawStream) throw new Error("Nested PDF streams are not permitted.");
  }
}

function validateXrefStream(raw: PDFRawStream, bytes: Uint8Array, budget: Budget) {
  const size = integer(raw.dict, "Size", 1_000_000, 1);
  const widths = raw.dict.lookup(PDFName.of("W"), PDFArray);
  if (widths.size() !== 3) throw new Error("Invalid PDF cross-reference widths.");
  let width = 0;
  for (let i = 0; i < 3; i += 1) {
    const value = widths.lookup(i, PDFNumber).asNumber();
    if (!Number.isInteger(value) || value < 0 || value > 8) throw new Error("Invalid PDF cross-reference width.");
    width += value;
  }
  const index = raw.dict.lookup(PDFName.of("Index"));
  let count = size;
  if (index) {
    if (!(index instanceof PDFArray) || index.size() % 2 !== 0 || index.size() > 4096) throw new Error("Invalid PDF cross-reference index.");
    count = 0;
    for (let i = 0; i < index.size(); i += 2) {
      const start = index.lookup(i, PDFNumber).asNumber();
      const length = index.lookup(i + 1, PDFNumber).asNumber();
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > size) throw new Error("Invalid PDF cross-reference range.");
      count += length;
    }
  }
  if (width === 0 || count > budget.limits.maxObjects || count * width !== bytes.length) throw new Error("PDF cross-reference budget exceeded.");
}

function prepareStructuralStream(raw: PDFRawStream, budget: Budget): PDFRawStream {
  const type = raw.dict.lookup(PDFName.of("Type"));
  if (type !== PDFName.of("ObjStm") && type !== PDFName.of("XRef")) return raw;
  const bytes = decodeStructuralStream(raw, budget);
  if (type === PDFName.of("ObjStm")) validateObjectStream(raw, bytes, budget);
  else validateXrefStream(raw, bytes, budget);
  const dict = raw.dict.clone();
  dict.delete(PDFName.of("Filter")); dict.delete(PDFName.of("DecodeParms"));
  dict.set(PDFName.of("Length"), PDFNumber.of(bytes.length));
  // The library's subsequent structural parser receives only bounded,
  // uncompressed bytes. No unchecked second decompression occurs.
  return PDFRawStream.of(dict, bytes);
}

/** Parse with request-local budgets, then traverse pages iteratively with cycle checks. */
export async function hasBoundedPdfPages(data: Uint8Array, limits: Partial<PdfValidationLimits> = {}) {
  const budget = new Budget(limits);
  const parser = new PDFParser(data, 64, true, true);
  guardParser(parser, budget, true);
  const context = await parser.parseDocument();
  if (context.lookup(context.trailerInfo.Encrypt)) return false;
  const catalog = context.lookup(context.trailerInfo.Root, PDFDict);
  if (catalog.lookup(PDFName.of("Type")) !== PDFName.of("Catalog")) return false;
  const pages = catalog.get(PDFName.of("Pages"));
  if (!pages) return false;
  const pending: Array<{ object: PDFObject; depth: number }> = [{ object: pages, depth: 0 }];
  const visited = new Set<PDFDict>();
  let pageCount = 0;
  while (pending.length) {
    budget.object();
    const entry = pending.pop()!;
    if (entry.depth > budget.limits.maxDepth) return false;
    const node = context.lookup(entry.object, PDFDict);
    if (visited.has(node)) return false;
    visited.add(node);
    const type = node.lookup(PDFName.of("Type"));
    if (type === PDFName.of("Page")) { pageCount += 1; continue; }
    if (type !== PDFName.of("Pages")) return false;
    const kids = node.lookup(PDFName.of("Kids"), PDFArray);
    if (kids.size() + pending.length > budget.limits.maxObjects) return false;
    for (let i = 0; i < kids.size(); i += 1) {
      const child = kids.get(i);
      if (!(child instanceof PDFRef) && !(child instanceof PDFDict)) return false;
      pending.push({ object: child, depth: entry.depth + 1 });
    }
  }
  return pageCount > 0;
}
