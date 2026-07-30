import path from "node:path";
import { inflateSync } from "node:zlib";

import multer, { MulterError } from "multer";
import {
  PDFArray,
  PDFContext,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObjectParser,
  PDFRawStream
} from "pdf-lib";
import type { RequestHandler } from "express";

import { ApiError } from "./errors.js";
import type { SaveFileInput } from "../storage/storage.js";

export interface ValidatedUpload extends SaveFileInput {
  originalFilename: string;
  mimeType:
    | "application/pdf"
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/tiff"
    | "image/heic";
  sizeBytes: number;
}

declare global {
  namespace Express {
    interface Request {
      validatedUpload?: ValidatedUpload;
    }
  }
}

const allowedClaimedMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "application/octet-stream",
  // Busboy uses text/plain when a multipart file part omits Content-Type.
  "text/plain"
]);
const MAX_XREF_FIELD_WIDTH_BYTES = 8;
const MAX_XREF_OBJECTS = 1_000_000;
const MAX_XREF_INDEX_VALUES = 4_096;
const MAX_DECODED_XREF_BYTES = 32 * 1024 * 1024;
const MAX_XREF_DICTIONARY_BYTES = 256 * 1024;

export function uploadSingleFile(
  maxUploadBytes: number,
  maxFields = 0
): RequestHandler {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes,
      files: 1,
      fields: maxFields
    },
    fileFilter: (_request, file, callback) => {
      if (!allowedClaimedMimeTypes.has(file.mimetype.toLowerCase())) {
        callback(
          new ApiError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "Only PDF, PNG, JPEG, WebP, TIFF, and HEIC files are supported.",
            { file: "Choose a PDF, PNG, JPEG, WebP, TIFF, or HEIC file." }
          )
        );
        return;
      }
      callback(null, true);
    }
  }).single("file");

  return (request, _response, next) => {
    parse(request, _response, async (error) => {
      if (error) {
        if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
          next(
            new ApiError(
              413,
              "FILE_TOO_LARGE",
              "The uploaded file exceeds the configured size limit.",
              { file: "Choose a smaller file." }
            )
          );
          return;
        }
        if (error instanceof ApiError) {
          next(error);
          return;
        }
        if (error instanceof MulterError) {
          next(
            new ApiError(
              400,
              "VALIDATION_ERROR",
              "Request validation failed.",
              { file: "Provide one file in the file field." }
            )
          );
          return;
        }
        next(error);
        return;
      }

      if (!request.file) {
        next(
          new ApiError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed.",
            { file: "A file is required." }
          )
        );
        return;
      }

      const detected = detectFileType(request.file.buffer);
      const claimed = request.file.mimetype.toLowerCase();
      // This is advisory only: all generic claims must still match magic bytes.
      const claimIsGeneric =
        claimed === "application/octet-stream" ||
        claimed === "text/plain" ||
        claimed === "";
      const contentIsValid =
        detected?.mimeType !== "application/pdf" ||
        (await isValidPdfDocument(request.file.buffer));
      if (
        !detected ||
        !contentIsValid ||
        (!claimIsGeneric && !claimMatchesDetected(claimed, detected.mimeType))
      ) {
        next(
          new ApiError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "The file contents do not match an allowed file type.",
            { file: "Choose a valid PDF, PNG, JPEG, WebP, TIFF, or HEIC file." }
          )
        );
        return;
      }

      request.validatedUpload = {
        data: request.file.buffer,
        extension: detected.extension,
        originalFilename: safeOriginalFilename(
          request.file.originalname,
          detected.extension
        ),
        mimeType: detected.mimeType,
        sizeBytes: request.file.size
      };
      next();
    });
  };
}

function detectFileType(data: Buffer): Pick<
  ValidatedUpload,
  "extension" | "mimeType"
> | null {
  if (data.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    return { extension: ".pdf", mimeType: "application/pdf" };
  }
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return { extension: ".png", mimeType: "image/png" };
  }
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP" &&
    data.readUInt32LE(4) === data.length - 8
  ) {
    return { extension: ".webp", mimeType: "image/webp" };
  }
  if (
    data.length >= 4 &&
    ((data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2a && data[3] === 0x00) ||
      (data[0] === 0x4d && data[1] === 0x4d && data[2] === 0x00 && data[3] === 0x2a) ||
      (data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2b && data[3] === 0x00) ||
      (data[0] === 0x4d && data[1] === 0x4d && data[2] === 0x00 && data[3] === 0x2b))
  ) {
    return { extension: ".tif", mimeType: "image/tiff" };
  }
  if (isHeifFile(data)) {
    return { extension: ".heic", mimeType: "image/heic" };
  }
  return null;
}

function claimMatchesDetected(claimed: string, detected: ValidatedUpload["mimeType"]) {
  return detected === claimed || (detected === "image/heic" && claimed === "image/heif");
}

function isHeifFile(data: Buffer) {
  if (data.length < 16 || data.subarray(4, 8).toString("ascii") !== "ftyp") {
    return false;
  }
  const boxSize = data.readUInt32BE(0);
  if (boxSize !== 0 && (boxSize < 16 || boxSize > data.length)) return false;
  const brandEnd = boxSize === 0 ? data.length : boxSize;
  const heifBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
  if (heifBrands.has(data.subarray(8, 12).toString("ascii"))) return true;
  for (let offset = 16; offset + 4 <= brandEnd; offset += 4) {
    if (heifBrands.has(data.subarray(offset, offset + 4).toString("ascii"))) {
      return true;
    }
  }
  return false;
}

export async function isValidPdfDocument(data: Buffer) {
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
    const document = await PDFDocument.load(data, {
      throwOnInvalidObject: true,
      updateMetadata: false
    });
    return document.getPageCount() > 0;
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
    const parser = PDFObjectParser.forBytes(
      data.subarray(xrefOffset + header[0].length),
      PDFContext.create(),
      true
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

function safeOriginalFilename(
  originalFilename: string,
  extension: ValidatedUpload["extension"]
) {
  const decodedFilename = Buffer.from(originalFilename, "latin1").toString("utf8");
  const filename = path
    .basename((decodedFilename.includes("\uFFFD") ? originalFilename : decodedFilename).replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f\u007f\u061c\u200e-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim()
    .slice(0, 255);
  return filename || `upload${extension}`;
}
