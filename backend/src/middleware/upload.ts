import path from "node:path";

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
  mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
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
  "application/octet-stream",
  // Busboy uses text/plain when a multipart file part omits Content-Type.
  "text/plain"
]);

export function uploadSingleFile(maxUploadBytes: number): RequestHandler {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes,
      files: 1,
      fields: 0
    },
    fileFilter: (_request, file, callback) => {
      if (!allowedClaimedMimeTypes.has(file.mimetype.toLowerCase())) {
        callback(
          new ApiError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "Only PDF, PNG, JPEG, and WebP files are supported.",
            { file: "Choose a PDF, PNG, JPEG, or WebP file." }
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
        (!claimIsGeneric && detected.mimeType !== claimed)
      ) {
        next(
          new ApiError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "The file contents do not match an allowed file type.",
            { file: "Choose a valid PDF, PNG, JPEG, or WebP file." }
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
  return null;
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
    const parsed = PDFObjectParser.forBytes(
      data.subarray(xrefOffset + header[0].length),
      PDFContext.create(),
      true
    ).parseObject();
    if (!(parsed instanceof PDFRawStream)) return false;

    const type = parsed.dict.lookupMaybe(PDFName.Type, PDFName);
    const widths = parsed.dict.lookupMaybe(PDFName.of("W"), PDFArray);
    const size = parsed.dict.lookupMaybe(PDFName.of("Size"), PDFNumber);
    const objectCount = size?.asNumber();
    if (
      type?.asString() !== "/XRef" ||
      widths?.size() !== 3 ||
      !Number.isSafeInteger(objectCount) ||
      (objectCount ?? 0) <= 0
    ) {
      return false;
    }
    const widthValues = widths.asArray();
    return (
      widthValues.some(
        (width) => width instanceof PDFNumber && width.asNumber() > 0
      ) &&
      widthValues.every(
        (width) =>
          width instanceof PDFNumber &&
          Number.isSafeInteger(width.asNumber()) &&
          width.asNumber() >= 0
      )
    );
  } catch {
    return false;
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
