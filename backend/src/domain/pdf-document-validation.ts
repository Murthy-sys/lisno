import { inflateSync } from "node:zlib";
import { PDFArray, PDFContext, PDFName, PDFNumber, PDFObjectParser, PDFRawStream } from "pdf-lib";
import { hasBoundedPdfPages, parseBoundedPdfObject, type PdfValidationLimits } from "./pdf-validation-budget.js";

const MAX_XREF_FIELD_WIDTH_BYTES = 8;
const MAX_XREF_OBJECTS = 1_000_000;
const MAX_XREF_INDEX_VALUES = 4_096;
const MAX_DECODED_XREF_BYTES = 32 * 1024 * 1024;
const MAX_XREF_DICTIONARY_BYTES = 256 * 1024;

export async function validatePdfDocumentInWorker(data: Buffer, limits: Partial<PdfValidationLimits> = {}) {
  const source = data.toString("latin1");
  if (!/^%PDF-\d\.\d/.test(source)) return false;

  const eofOffset = source.lastIndexOf("%%EOF");
  if (
    eofOffset < 0 ||
    source.slice(eofOffset + "%%EOF".length).trim().length > 0
  ) {
    return false;
  }

  const startXrefOffset = source.lastIndexOf("startxref", eofOffset);
  if (startXrefOffset < 0) return false;
  const startXref = /^startxref\s+(\d+)\s*$/.exec(
    source.slice(startXrefOffset, eofOffset)
  );
  if (!startXref) return false;

  const xrefOffset = Number(startXref[1]);
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset <= 0 || xrefOffset >= startXrefOffset) {
    return false;
  }

  const pointsToClassicXref = /^xref(?=\s)/.test(source.slice(xrefOffset));
  const hasValidXrefTarget = pointsToClassicXref
    ? hasValidClassicXref(source, xrefOffset)
    : hasValidXrefStream(data, source, xrefOffset);
  if (!hasValidXrefTarget) return false;

  try {
    return await hasBoundedPdfPages(data, limits);
  } catch {
    return false;
  }
}

function hasValidXrefStream(
  data: Buffer,
  source: string,
  xrefOffset: number
) {
  const candidate = source.slice(xrefOffset);
  const header = /^(\d+)\s+(\d+)\s+obj\b/.exec(candidate);
  if (!header) return false;

  try {
    const parser = parseBoundedPdfObject(
      data.subarray(xrefOffset + header[0].length),
      PDFContext.create()
    );
    const parsed = parser.parseObject();
    if (!(parsed instanceof PDFRawStream)) return false;
    const parserOffset = pdfObjectParserOffset(parser);
    const objectOverhead =
      parserOffset === null
        ? null
        : parserOffset - parsed.contents.byteLength;
    if (
      objectOverhead === null ||
      objectOverhead < 0 ||
      objectOverhead > MAX_XREF_DICTIONARY_BYTES
    ) {
      return false;
    }

    const type = parsed.dict.lookupMaybe(PDFName.Type, PDFName);
    const widths = parsed.dict.lookupMaybe(PDFName.of("W"), PDFArray);
    const size = parsed.dict.lookupMaybe(PDFName.of("Size"), PDFNumber);
    const objectCount = size?.asNumber();
    if (
      type?.asString() !== "/XRef" ||
      widths?.size() !== 3 ||
      !Number.isSafeInteger(objectCount) ||
      (objectCount ?? 0) <= 0 ||
      (objectCount ?? 0) > MAX_XREF_OBJECTS
    ) {
      return false;
    }
    const widthValues = pdfIntegerArray(
      widths,
      3,
      MAX_XREF_FIELD_WIDTH_BYTES
    );
    if (!widthValues) return false;
    const rowWidth = widthValues.reduce((total, width) => total + width, 0);
    if (rowWidth <= 0) return false;

    const indexName = PDFName.of("Index");
    const index = parsed.dict.lookupMaybe(indexName, PDFArray);
    if (parsed.dict.has(indexName) && !index) return false;
    const entryCount = index
      ? xrefIndexEntryCount(index, objectCount as number)
      : objectCount as number;
    if (entryCount === null) return false;

    const expectedBytes = entryCount * rowWidth;
    if (
      !Number.isSafeInteger(expectedBytes) ||
      expectedBytes <= 0 ||
      expectedBytes > MAX_DECODED_XREF_BYTES
    ) {
      return false;
    }
    const decoded = decodeXrefStream(parsed, expectedBytes);
    return decoded?.byteLength === expectedBytes;
  } catch {
    return false;
  }
}

function pdfObjectParserOffset(parser: PDFObjectParser) {
  // pdf-lib does not expose its cursor publicly. Read it defensively and fail
  // closed if a future version changes this internal shape.
  const byteStream = Reflect.get(parser, "bytes") as
    | { offset?: () => unknown }
    | undefined;
  const offset = byteStream?.offset?.();
  return typeof offset === "number" && Number.isSafeInteger(offset)
    ? offset
    : null;
}

function pdfIntegerArray(
  value: PDFArray,
  expectedLength: number,
  maximum: number
) {
  if (value.size() !== expectedLength) return null;
  const result: number[] = [];
  for (const item of value.asArray()) {
    if (!(item instanceof PDFNumber)) return null;
    const number = item.asNumber();
    if (
      !Number.isSafeInteger(number) ||
      number < 0 ||
      number > maximum
    ) {
      return null;
    }
    result.push(number);
  }
  return result;
}

function xrefIndexEntryCount(index: PDFArray, size: number) {
  if (
    index.size() < 2 ||
    index.size() > MAX_XREF_INDEX_VALUES ||
    index.size() % 2 !== 0
  ) {
    return null;
  }

  let total = 0;
  for (let offset = 0; offset < index.size(); offset += 2) {
    const start = index.get(offset);
    const count = index.get(offset + 1);
    if (!(start instanceof PDFNumber) || !(count instanceof PDFNumber)) {
      return null;
    }
    const startValue = start.asNumber();
    const countValue = count.asNumber();
    if (
      !Number.isSafeInteger(startValue) ||
      !Number.isSafeInteger(countValue) ||
      startValue < 0 ||
      countValue <= 0 ||
      startValue + countValue > size
    ) {
      return null;
    }
    total += countValue;
    if (!Number.isSafeInteger(total) || total > MAX_XREF_OBJECTS) {
      return null;
    }
  }
  return total;
}

function decodeXrefStream(stream: PDFRawStream, expectedBytes: number) {
  const filterName = PDFName.of("Filter");
  const decodeParametersName = PDFName.of("DecodeParms");
  if (stream.dict.has(decodeParametersName)) return null;
  if (!stream.dict.has(filterName)) return stream.contents;

  const filter = stream.dict.get(filterName);
  const arrayFilter =
    filter instanceof PDFArray && filter.size() === 1
      ? filter.get(0)
      : undefined;
  const flateDecode =
    filter instanceof PDFName
      ? filter.asString() === "/FlateDecode"
      : arrayFilter instanceof PDFName &&
        arrayFilter.asString() === "/FlateDecode";
  if (!flateDecode) return null;
  try {
    return inflateSync(stream.contents, {
      maxOutputLength: Math.min(
        expectedBytes,
        MAX_DECODED_XREF_BYTES
      )
    });
  } catch {
    return null;
  }
}

function hasValidClassicXref(source: string, xrefOffset: number) {
  const trailerOffset = source.indexOf("trailer", xrefOffset + 4);
  if (trailerOffset < 0) return false;

  const lines = source
    .slice(xrefOffset + 4, trailerOffset)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const inUseObjects: Array<{
    objectNumber: number;
    generation: number;
    offset: number;
  }> = [];

  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const subsection = /^(\d+)\s+(\d+)$/.exec(lines[lineIndex] ?? "");
    if (!subsection) return false;
    const firstObject = Number(subsection[1]);
    const count = Number(subsection[2]);
    if (!Number.isSafeInteger(firstObject) || !Number.isSafeInteger(count) || count <= 0) {
      return false;
    }
    lineIndex += 1;

    for (let entryIndex = 0; entryIndex < count; entryIndex += 1) {
      const entry = /^(\d{10})\s+(\d{5})\s+([fn])\s*$/.exec(
        lines[lineIndex] ?? ""
      );
      if (!entry) return false;
      if (entry[3] === "n") {
        inUseObjects.push({
          objectNumber: firstObject + entryIndex,
          generation: Number(entry[2]),
          offset: Number(entry[1])
        });
      }
      lineIndex += 1;
    }
  }

  const sorted = inUseObjects.sort((left, right) => left.offset - right.offset);
  return sorted.every((entry, index) => {
    const objectHeader = new RegExp(
      `^${entry.objectNumber}\\s+${entry.generation}\\s+obj\\b`
    );
    const objectSource = source.slice(entry.offset, entry.offset + 68);
    const leadingWhitespace =
      /^[\u0000\u0009\u000a\u000c\u000d\u0020]{0,4}/.exec(objectSource)?.[0]
        .length ?? 0;
    if (!objectHeader.test(objectSource.slice(leadingWhitespace))) {
      return false;
    }
    const nextOffset = sorted[index + 1]?.offset ?? xrefOffset;
    return source.slice(entry.offset, nextOffset).includes("endobj");
  });
}

