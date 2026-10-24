import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { isValidPdfDocument } from "../src/middleware/upload.js";

function pdf(extra: Buffer[], pages = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>") {
  const parts = [Buffer.from("%PDF-1.7\n")];
  const offsets: number[] = [];
  const objects = [Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"), Buffer.from(pages), Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>"), ...extra];
  for (const [index, data] of objects.entries()) {
    offsets.push(parts.reduce((n, part) => n + part.length, 0));
    parts.push(Buffer.from(`${index + 1} 0 obj\n`), data, Buffer.from("\nendobj\n"));
  }
  const xref = parts.reduce((n, part) => n + part.length, 0);
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 2} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Buffer.concat(parts);
}

function objectStream(decoded: Buffer, options: { escaped?: boolean; chain?: boolean; count?: number } = {}) {
  const compressed = deflateSync(decoded);
  const payload = options.chain ? Buffer.from(`${compressed.toString("hex")}>`) : compressed;
  const type = options.escaped ? "/Ty#70e /Obj#53tm" : "/Type /ObjStm";
  const filters = options.chain ? "[ /ASCIIHexDecode /FlateDecode ]" : "/FlateDecode";
  return Buffer.concat([Buffer.from(`<< ${type} /N ${options.count ?? 1} /First 4 /Length ${payload.length} /Filter ${filters} >>\nstream\n`), payload, Buffer.from("\nendstream")]);
}

describe("PDF structural parsing budgets", () => {
  it("retains ordinary compressed object and xref PDFs", async () => {
    const document = await PDFDocument.create(); document.addPage([100, 100]);
    expect(await isValidPdfDocument(Buffer.from(await document.save()))).toBe(true);
    expect(await isValidPdfDocument(pdf([objectStream(Buffer.from("5 0 0"), { chain: true })]))).toBe(true);
  });

  it.each([{ escaped: false }, { escaped: true }, { chain: true }])("rejects decompression amplification before allocating the full stream (%j)", async options => {
    const decoded = Buffer.concat([Buffer.from("5 0 %"), Buffer.alloc(8192, 65), Buffer.from("\n0")]);
    const data = pdf([objectStream(decoded, options)]);
    expect(data.length).toBeLessThan(1500);
    expect(await isValidPdfDocument(data, { maxDecodedStreamBytes: 1024 })).toBe(false);
    expect(await isValidPdfDocument(data, { maxDecodedStreamBytes: 16384 })).toBe(true);
  });

  it("charges every structural stream against an aggregate decoded budget", async () => {
    const decoded = Buffer.concat([Buffer.from("5 0 %"), Buffer.alloc(2048, 65), Buffer.from("\n0")]);
    expect(await isValidPdfDocument(pdf([objectStream(decoded), objectStream(decoded)]), {
      maxDecodedStreamBytes: 4096, maxDecodedBytes: 3000
    })).toBe(false);
  });

  it("bounds object count and nested dictionaries inside compressed streams", async () => {
    expect(await isValidPdfDocument(pdf([objectStream(Buffer.from("5 0 0"), { count: 100_001 })]))).toBe(false);
    const nested = Buffer.from(`5 0 ${"[".repeat(80)}0${"]".repeat(80)}`);
    expect(await isValidPdfDocument(pdf([objectStream(nested)]))).toBe(false);
    expect(await isValidPdfDocument(pdf([Buffer.from(`${"[".repeat(80)}0${"]".repeat(80)}`)]))).toBe(false);
  });

  it("rejects cyclic page trees and invalid object-stream offsets without recursing", async () => {
    expect(await isValidPdfDocument(pdf([], "<< /Type /Pages /Kids [2 0 R] /Count 1 >>"))).toBe(false);
    expect(await isValidPdfDocument(pdf([objectStream(Buffer.from("5 9 0"))]))).toBe(false);
  });

  it("keeps budgets local to a request", async () => {
    const data = pdf([objectStream(Buffer.from("5 0 0"))]);
    const outcomes = await Promise.all([isValidPdfDocument(data, { maxObjects: 1 }), isValidPdfDocument(data)]);
    expect(outcomes).toEqual([false, true]);
  });

  it("terminates expired workers and releases admission for subsequent documents", async () => {
    const data = pdf([]);
    const expired = await Promise.all([
      isValidPdfDocument(data, { maxMilliseconds: 1 }),
      isValidPdfDocument(data, { maxMilliseconds: 1 })
    ]);
    expect(expired).toEqual([false, false]);
    expect(await isValidPdfDocument(data)).toBe(true);
  });

  it("rejects excess queued work without losing active or waiting admission slots", async () => {
    const data = pdf([]);
    const outcomes = await Promise.allSettled(Array.from({ length: 7 }, () => isValidPdfDocument(data)));
    expect(outcomes.slice(0, 6)).toEqual(Array.from({ length: 6 }, () => ({ status: "fulfilled", value: true })));
    expect(outcomes[6]).toMatchObject({ status: "rejected", reason: { status: 503, code: "PDF_VALIDATION_BUSY" } });
    expect(await isValidPdfDocument(data)).toBe(true);
  });
});
