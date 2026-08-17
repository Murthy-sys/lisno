import { Readable } from "node:stream";
import { deflateSync, inflateSync } from "node:zlib";

import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { Role } from "../src/contracts/domain.js";
import { isValidPdfDocument } from "../src/middleware/upload.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

const JWT_SECRET = "upload-test-secret-with-at-least-32-characters";
const auth = {
  jwtSecret: JWT_SECRET,
  jwtExpiresInSeconds: 900
};
const TEST_NOW = "2026-07-16T12:00:00.000Z";
const clock = () => new Date(TEST_NOW);
let PDF: Buffer;
let XREF_STREAM_PDF: Buffer;
let UNCOMPRESSED_XREF_STREAM_PDF: Buffer;
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00
]);
// The upload boundary verifies file signatures rather than fully decoding images.
// These include JPEG SOI/EOI and a RIFF/WebP header whose declared size matches.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x16, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TIFF_LE = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
const TIFF_BE = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);
const HEIC = Buffer.from([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x68, 0x65, 0x69, 0x63,
  0x00, 0x00, 0x00, 0x00,
  0x68, 0x65, 0x69, 0x63,
  0x6d, 0x69, 0x66, 0x31
]);

function rewriteXrefStream(
  data: Buffer,
  options: {
    compressed?: boolean;
    dictionary?: (value: string) => string;
    payload?: (value: Buffer) => Buffer;
  } = {}
) {
  const source = data.toString("latin1");
  const startXref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(source);
  if (!startXref) throw new Error("Expected an xref-stream PDF fixture.");
  const xrefOffset = Number(startXref[1]);
  const candidate = source.slice(xrefOffset);
  const header = /^(\d+\s+\d+\s+obj\s*<<[\s\S]*?>>)\s*stream\r?\n/.exec(
    candidate
  );
  if (!header) throw new Error("Expected an xref stream object.");
  const payloadStart = xrefOffset + header[0].length;
  const payloadEnd = source.indexOf("\nendstream", payloadStart);
  if (payloadEnd < 0) throw new Error("Expected an xref stream terminator.");

  const decoded = inflateSync(data.subarray(payloadStart, payloadEnd));
  const decodedPayload = options.payload?.(decoded) ?? decoded;
  const payload = options.compressed
    ? deflateSync(decodedPayload)
    : decodedPayload;
  let dictionary = header[1];
  if (!options.compressed) {
    dictionary = dictionary.replace(/\n\/Filter\s+\/FlateDecode\b/, "");
  }
  dictionary = dictionary.replace(
    /\/Length\s+\d+\b/,
    `/Length ${payload.byteLength}`
  );
  dictionary = options.dictionary?.(dictionary) ?? dictionary;
  return Buffer.concat([
    data.subarray(0, xrefOffset),
    Buffer.from(`${dictionary}\nstream\n`, "latin1"),
    payload,
    Buffer.from(source.slice(payloadEnd), "latin1")
  ]);
}

beforeAll(async () => {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  PDF = Buffer.from(await document.save({ useObjectStreams: false }));

  const xrefStreamDocument = await PDFDocument.create();
  xrefStreamDocument.addPage([612, 792]);
  XREF_STREAM_PDF = Buffer.from(await xrefStreamDocument.save());
  UNCOMPRESSED_XREF_STREAM_PDF = rewriteXrefStream(XREF_STREAM_PDF);
});

const users = {
  superAdmin: ["user-super-admin", "super_admin"],
  head: ["user-head", "design_head"],
  managerAarav: ["user-manager-aarav", "design_manager"],
  managerMeera: ["user-manager-meera", "design_manager"],
  ananya: ["user-designer-ananya", "designer"],
  kabir: ["user-designer-kabir", "designer"],
  auroraClient: ["user-client-aurora", "client"],
  celesteClient: ["user-client-celeste", "client"]
} as const satisfies Record<string, readonly [string, Role]>;

function bearer([id, role]: readonly [string, Role]) {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

class TestStorage {
  private sequence = 0;
  readonly objects = new Map<string, Buffer>();
  readonly deleted: string[] = [];
  readonly opened: string[] = [];
  failSave = false;

  async save(input: { data: Buffer; extension: string }) {
    if (this.failSave) throw new Error("simulated storage outage");
    this.sequence += 1;
    const reference = `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async delete(reference: string) {
    this.deleted.push(reference);
    this.objects.delete(reference);
  }

  async open(reference: string) {
    this.opened.push(reference);
    const data = this.objects.get(reference);
    if (!data) throw new Error("stored object missing");
    return Readable.from(data);
  }
}

function superAdminDesignSeed() {
  const seed = structuredClone(demoSeedData);
  const template = structuredClone(seed.users[0]!);
  seed.users.push({
    ...template,
    id: users.superAdmin[0],
    name: "Super Admin",
    email: "super-admin@lisno.example",
    emailNormalized: "super-admin@lisno.example",
    role: users.superAdmin[1],
    managerId: null,
    authorizedClientIds: []
  });
  seed.designVersions.push({
    ...structuredClone(seed.designVersions[0]!),
    id: "version-super-admin-submitted",
    versionNumber: 2,
    originalFilename: "submitted-plan.pdf",
    storedFileReference: "seed/submitted-plan.pdf",
    approvalStatus: "in_review",
    reviewerId: null,
    approvedAt: null,
    clientVisible: false
  });
  seed.extractionJobs.push({
    id: "job-approved-version",
    designVersionId: "version-aurora-plan-1",
    status: "approved",
    attemptCount: 1,
    queuedAt: TEST_NOW,
    nextAttemptAt: null,
    claimGeneration: 1,
    startedAt: TEST_NOW,
    completedAt: TEST_NOW,
    leaseExpiresAt: null,
    failureCode: null,
    failureMessage: null,
    claimId: null,
    workerResultId: "worker-result-approved-version",
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW
  });
  return seed;
}

function setup(options: {
  repository?: AppRepository;
  storage?: TestStorage;
  maxUploadBytes?: number;
} = {}) {
  const repository =
    options.repository ??
    createMemoryRepository(structuredClone(demoSeedData));
  const storage = options.storage ?? new TestStorage();
  const dependencies = {
    repository,
    auth,
    clock,
    storage,
    maxUploadBytes: options.maxUploadBytes
  } as Parameters<typeof createApp>[0] & {
    storage: TestStorage;
    maxUploadBytes?: number;
  };
  return {
    repository,
    storage,
    app: createApp(dependencies)
  };
}

function upload(
  app: ReturnType<typeof createApp>,
  actor: readonly [string, Role],
  taskId: string,
  data: Buffer,
  filename: string,
  mimeType: string
) {
  return request(app)
    .post(`/api/v1/tasks/${taskId}/design-versions`)
    .set("Authorization", bearer(actor))
    .attach("file", data, { filename, contentType: mimeType });
}

function rawMultipartUploadWithoutFileContentType(
  app: ReturnType<typeof createApp>,
  actor: readonly [string, Role],
  taskId: string,
  data: Buffer,
  filename: string
) {
  const boundary = "lisno-upload-without-file-content-type";
  const opening = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n\r\n`
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`);

  return request(app)
    .post(`/api/v1/tasks/${taskId}/design-versions`)
    .set("Authorization", bearer(actor))
    .set("Content-Type", `multipart/form-data; boundary=${boundary}`)
    .send(Buffer.concat([opening, data, closing]));
}

function approval(
  app: ReturnType<typeof createApp>,
  actor: readonly [string, Role],
  versionId: string,
  body: Record<string, unknown>
) {
  return request(app)
    .patch(`/api/v1/design-versions/${versionId}/approval`)
    .set("Authorization", bearer(actor))
    .send(body);
}

function binaryParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void
) {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", callback);
}

function failDesignVersionMetadataWrites(base: AppRepository): AppRepository {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "runInTransaction") {
        return Reflect.get(target, property, receiver);
      }
      return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
        target.runInTransaction((transaction) =>
          operation(
            new Proxy(transaction, {
              get(transactionTarget, transactionProperty, transactionReceiver) {
                if (transactionProperty === "createNextDesignVersion") {
                  return async () => {
                    throw new Error("simulated metadata failure");
                  };
                }
                return Reflect.get(
                  transactionTarget,
                  transactionProperty,
                  transactionReceiver
                );
              }
            })
          )
        );
    }
  });
}

function failExtractionJobEnqueues(base: AppRepository): AppRepository {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "runInTransaction") {
        return Reflect.get(target, property, receiver);
      }
      return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
        target.runInTransaction((transaction) =>
          operation(
            new Proxy(transaction, {
              get(transactionTarget, transactionProperty, transactionReceiver) {
                if (transactionProperty === "enqueueExtractionJob") {
                  return async () => {
                    throw new Error("simulated extraction enqueue failure");
                  };
                }
                return Reflect.get(
                  transactionTarget,
                  transactionProperty,
                  transactionReceiver
                );
              }
            })
          )
        );
    }
  });
}

function failAuditWrites(base: AppRepository): AppRepository {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "runInTransaction") {
        return Reflect.get(target, property, receiver);
      }
      return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
        target.runInTransaction((transaction) =>
          operation(
            new Proxy(transaction, {
              get(transactionTarget, transactionProperty, transactionReceiver) {
                if (transactionProperty === "appendAuditEvent") {
                  return async () => {
                    throw new Error("simulated audit failure");
                  };
                }
                return Reflect.get(
                  transactionTarget,
                  transactionProperty,
                  transactionReceiver
                );
              }
            })
          )
        );
    }
  });
}

describe("design-version uploads", () => {
  it("Busboy maps a file part without Content-Type to text/plain", async () => {
    const app = express();
    const parse = multer({ storage: multer.memoryStorage() }).single("file");
    app.post("/upload", parse, (request, response) => {
      response.json({ mimeType: request.file?.mimetype });
    });
    const boundary = "lisno-busboy-missing-file-content-type";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="plan.pdf"\r\n\r\n`
      ),
      PDF,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const response = await request(app)
      .post("/upload")
      .set("Content-Type", `multipart/form-data; boundary=${boundary}`)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ mimeType: "text/plain" });
  });

  it("accepts signature-valid JPEG/WebP bytes, rejects claimed MIME mismatches, and strips directional filename controls", async () => {
    const { app } = setup();
    const jpeg = await upload(app, users.ananya, "task-furniture-layout", JPEG, "render\u202E\u200E\u200F\u061Cgpj.jpg", "image/jpeg");
    const webp = await upload(app, users.ananya, "task-furniture-layout", WEBP, "render.webp", "image/webp");
    const mismatch = await upload(app, users.ananya, "task-furniture-layout", JPEG, "not-a-png.png", "image/png");

    expect(jpeg.status).toBe(201);
    expect(jpeg.body.data).toMatchObject({ mimeType: "image/jpeg", originalFilename: "rendergpj.jpg" });
    expect(webp.status).toBe(201);
    expect(webp.body.data.mimeType).toBe("image/webp");
    expect(mismatch.status).toBe(415);
    expect(mismatch.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it.each([
    ["little-endian TIFF", TIFF_LE, "drawing.tif", "image/tiff"],
    ["big-endian TIFF", TIFF_BE, "drawing.tiff", "image/tiff"],
    ["HEIC", HEIC, "drawing.heic", "image/heic"]
  ])("accepts a valid %s signature", async (_kind, data, filename, mimeType) => {
    const { app } = setup();

    const response = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      data,
      filename,
      mimeType
    );

    expect(response.status).toBe(201);
    expect(response.body.data.mimeType).toBe(
      mimeType === "image/heic" ? "image/heic" : "image/tiff"
    );
  });

  it("does not mistake an ISO BMFF minor version for a supported HEIF brand", async () => {
    const { app } = setup();
    const unsupportedBrand = Buffer.from([
      0x00, 0x00, 0x00, 0x10,
      0x66, 0x74, 0x79, 0x70,
      0x61, 0x76, 0x69, 0x66,
      0x68, 0x65, 0x69, 0x63
    ]);

    const response = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      unsupportedBrand,
      "not-heic.heic",
      "image/heic"
    );

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("accepts PDF and image magic bytes and allocates monotonic task versions", async () => {
    const { app, repository, storage } = setup();

    const pdf = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "floor plan.pdf",
      "application/pdf"
    );
    const png = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PNG,
      "floor-plan.png",
      "image/png"
    );

    expect(pdf.status).toBe(201);
    expect(pdf.body.data.extractionStatus).toBe("queued");
    expect(
      await repository.findExtractionJobByVersionId(pdf.body.data.id)
    ).toMatchObject({ status: "queued", attemptCount: 0 });
    expect(pdf.body.data).toMatchObject({
      taskId: "task-furniture-layout",
      projectId: "project-aurora-villa",
      versionNumber: 2,
      originalFilename: "floor plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.byteLength,
      approvalStatus: "draft",
      clientVisible: false
    });
    expect(png.status).toBe(201);
    expect(png.body.data).toMatchObject({
      versionNumber: 3,
      mimeType: "image/png"
    });
    expect(pdf.body.data).not.toHaveProperty("storedFileReference");
    expect([...storage.objects.keys()]).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9]{12}\.pdf$/
      ),
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9]{12}\.png$/
      )
    ]);
    expect(await repository.listDesignVersions("project-aurora-villa")).toHaveLength(3);
  });

  it("accepts PDF magic bytes with generic multipart MIME metadata but rejects invalid or mismatched content", async () => {
    const { app, storage } = setup();

    const missingContentTypePdf = await rawMultipartUploadWithoutFileContentType(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "missing-content-type.pdf"
    );
    const octetStreamPdf = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "generic-octet.pdf",
      "application/octet-stream"
    );
    const malformedMissingContentTypePdf =
      await rawMultipartUploadWithoutFileContentType(
        app,
        users.ananya,
        "task-furniture-layout",
        Buffer.from("not really a PDF"),
        "malformed-missing-content-type.pdf"
      );
    const malformedPdf = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      Buffer.from("not really a PDF"),
      "malformed.pdf",
      "application/octet-stream"
    );
    const mismatchedPng = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PNG,
      "actually-png.pdf",
      "application/pdf"
    );

    expect(missingContentTypePdf.status).toBe(201);
    expect(missingContentTypePdf.body.data.mimeType).toBe("application/pdf");
    expect(octetStreamPdf.status).toBe(201);
    expect(octetStreamPdf.body.data.mimeType).toBe("application/pdf");
    expect([...storage.objects.keys()]).toEqual([
      expect.stringMatching(/\.pdf$/),
      expect.stringMatching(/\.pdf$/)
    ]);
    expect(malformedMissingContentTypePdf.status).toBe(415);
    expect(malformedMissingContentTypePdf.body.error.code).toBe(
      "UNSUPPORTED_FILE_TYPE"
    );
    expect(malformedPdf.status).toBe(415);
    expect(malformedPdf.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(mismatchedPng.status).toBe(415);
    expect(mismatchedPng.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects signature-only, truncated, invalid-xref, and malformed-object PDFs", async () => {
    const { app } = setup();
    const invalidXref = Buffer.from(
      PDF.toString("latin1").replace(/startxref\s+\d+/, "startxref\n0"),
      "latin1"
    );
    const malformedObject = Buffer.from(
      PDF.toString("latin1").replace(/\bendobj\b/, "broken"),
      "latin1"
    );
    const fixtures = [
      Buffer.from("%PDF-not a document"),
      PDF.subarray(0, Math.floor(PDF.byteLength / 2)),
      invalidXref,
      malformedObject
    ];

    for (const [index, fixture] of fixtures.entries()) {
      const response = await upload(
        app,
        users.ananya,
        "task-furniture-layout",
        fixture,
        `invalid-${index}.pdf`,
        "application/pdf"
      );

      expect(response.status).toBe(415);
      expect(response.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    }
  });

  it("accepts classic and xref-stream PDFs but rejects startxref targets that are not xref structures", async () => {
    const { app } = setup();
    const ordinaryObjectTarget = Buffer.from(
      PDF.toString("latin1").replace(
        /startxref\s+\d+/,
        "startxref\n16"
      ),
      "latin1"
    );
    const fakeXrefStream = Buffer.from(
      XREF_STREAM_PDF.toString("latin1").replace(
        "/Type /XRef",
        "/Type /Fake"
      ),
      "latin1"
    );

    expect(PDF.toString("latin1").slice(16)).toMatch(/^\d+\s+\d+\s+obj\b/);
    expect(XREF_STREAM_PDF.toString("latin1")).toContain("/Type /XRef");
    expect(fakeXrefStream.toString("latin1")).toContain("/Type /Fake");
    await expect(isValidPdfDocument(PDF)).resolves.toBe(true);
    await expect(isValidPdfDocument(XREF_STREAM_PDF)).resolves.toBe(true);
    await expect(
      isValidPdfDocument(UNCOMPRESSED_XREF_STREAM_PDF)
    ).resolves.toBe(true);
    await expect(isValidPdfDocument(ordinaryObjectTarget)).resolves.toBe(false);
    await expect(isValidPdfDocument(fakeXrefStream)).resolves.toBe(false);

    const responses = await Promise.all([
      upload(
        app,
        users.ananya,
        "task-furniture-layout",
        PDF,
        "classic.pdf",
        "application/pdf"
      ),
      upload(
        app,
        users.ananya,
        "task-furniture-layout",
        XREF_STREAM_PDF,
        "xref-stream.pdf",
        "application/pdf"
      ),
      upload(
        app,
        users.ananya,
        "task-furniture-layout",
        UNCOMPRESSED_XREF_STREAM_PDF,
        "uncompressed-xref-stream.pdf",
        "application/pdf"
      ),
      upload(
        app,
        users.ananya,
        "task-furniture-layout",
        ordinaryObjectTarget,
        "ordinary-object-target.pdf",
        "application/pdf"
      ),
      upload(
        app,
        users.ananya,
        "task-furniture-layout",
        fakeXrefStream,
        "fake-xref-stream.pdf",
        "application/pdf"
      )
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      201,
      201,
      201,
      415,
      415
    ]);
  });

  it("rejects unsafe xref stream widths, indexes, and decoded payload lengths", async () => {
    const { app } = setup();
    const fixtures = [
      rewriteXrefStream(XREF_STREAM_PDF, {
        dictionary: (value) =>
          value.replace(/\/W\s*\[[^\]]+\]/, "/W [ 999999 999999 999999 ]")
      }),
      rewriteXrefStream(XREF_STREAM_PDF, {
        dictionary: (value) =>
          value.replace(/\/Index\s*\[[^\]]+\]/, "/Index [ 0 1000001 ]")
      }),
      rewriteXrefStream(XREF_STREAM_PDF, {
        dictionary: (value) =>
          value.replace(/\/Index\s*\[[^\]]+\]/, "/Index [ 0 7 3 ]")
      }),
      rewriteXrefStream(XREF_STREAM_PDF, {
        payload: () => Buffer.alloc(0)
      }),
      rewriteXrefStream(XREF_STREAM_PDF, {
        payload: (value) => value.subarray(0, value.byteLength - 1)
      }),
      rewriteXrefStream(XREF_STREAM_PDF, {
        compressed: true,
        payload: () => Buffer.alloc(1024 * 1024)
      }),
      rewriteXrefStream(XREF_STREAM_PDF, {
        compressed: true,
        dictionary: (value) =>
          value.replace("/Filter /FlateDecode", "/Filter /LZWDecode")
      }),
      rewriteXrefStream(XREF_STREAM_PDF, {
        compressed: true,
        dictionary: (value) =>
          value.replace(
            />>$/,
            "/DecodeParms << /Predictor 12 >>\n>>"
          )
      })
    ];

    for (const [index, fixture] of fixtures.entries()) {
      await expect(isValidPdfDocument(fixture)).resolves.toBe(false);
      const response = await upload(
        app,
        users.ananya,
        "task-furniture-layout",
        fixture,
        `unsafe-xref-${index}.pdf`,
        "application/pdf"
      );
      expect(response.status).toBe(415);
      expect(response.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    }
  });

  it("accepts a one-name FlateDecode filter array and rejects other filter arrays", async () => {
    const { app } = setup();
    const oneFlateFilter = rewriteXrefStream(XREF_STREAM_PDF, {
      compressed: true,
      dictionary: (value) =>
        value.replace(
          "/Filter /FlateDecode",
          "/Filter [ /FlateDecode ]"
        )
    });
    const invalidFilters = [
      "[ /FlateDecode /FlateDecode ]",
      "[ 1 ]",
      "[ /LZWDecode ]"
    ].map((filter) =>
      rewriteXrefStream(XREF_STREAM_PDF, {
        compressed: true,
        dictionary: (value) =>
          value.replace("/Filter /FlateDecode", `/Filter ${filter}`)
      })
    );

    await expect(isValidPdfDocument(oneFlateFilter)).resolves.toBe(true);
    const accepted = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      oneFlateFilter,
      "one-flate-filter.pdf",
      "application/pdf"
    );
    expect(accepted.status).toBe(201);

    for (const [index, fixture] of invalidFilters.entries()) {
      await expect(isValidPdfDocument(fixture)).resolves.toBe(false);
      const rejected = await upload(
        app,
        users.ananya,
        "task-furniture-layout",
        fixture,
        `invalid-filter-array-${index}.pdf`,
        "application/pdf"
      );
      expect(rejected.status).toBe(415);
    }
  });

  it("rejects an xref stream with a 300 KiB comment prefix despite an early stream token", async () => {
    const { app } = setup();
    const oversizedPrefix = rewriteXrefStream(XREF_STREAM_PDF, {
      dictionary: (value) =>
        value.replace(
          /\bobj\b/,
          `obj\n% stream\n%${"x".repeat(300 * 1024)}\n`
        )
    });

    await expect(isValidPdfDocument(XREF_STREAM_PDF)).resolves.toBe(true);
    await expect(isValidPdfDocument(oversizedPrefix)).resolves.toBe(false);
    const response = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      oversizedPrefix,
      "oversized-xref-prefix.pdf",
      "application/pdf"
    );
    expect(response.status).toBe(415);
  });

  it("rolls back the version and deletes the original when extraction enqueue fails", async () => {
    const baseRepository = createMemoryRepository(structuredClone(demoSeedData));
    const storage = new TestStorage();
    const { app } = setup({
      repository: failExtractionJobEnqueues(baseRepository),
      storage
    });

    const response = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "enqueue-failure.pdf",
      "application/pdf"
    );

    expect(response.status).toBe(500);
    expect(storage.deleted).toHaveLength(1);
    expect(storage.objects.size).toBe(0);
    expect(
      await baseRepository.listDesignVersions("project-aurora-villa")
    ).toHaveLength(1);
  });

  it("returns extraction status only to users with project access", async () => {
    const { app } = setup();
    const uploaded = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "status.pdf",
      "application/pdf"
    );

    const owner = await request(app)
      .get(`/api/v1/design-versions/${uploaded.body.data.id}/extraction`)
      .set("Authorization", bearer(users.ananya));
    const unrelated = await request(app)
      .get(`/api/v1/design-versions/${uploaded.body.data.id}/extraction`)
      .set("Authorization", bearer(users.celesteClient));

    expect(owner.status).toBe(200);
    expect(owner.body.data).toMatchObject({
      designVersionId: uploaded.body.data.id,
      status: "queued",
      attemptCount: 0
    });
    expect(unrelated.status).toBe(404);
  });

  it("allocates distinct monotonic versions under concurrent uploads", async () => {
    const { app } = setup();

    const responses = await Promise.all([
      upload(
        app,
        users.ananya,
        "task-future-concept",
        PDF,
        "concept-a.pdf",
        "application/pdf"
      ),
      upload(
        app,
        users.ananya,
        "task-future-concept",
        PNG,
        "concept-b.png",
        "image/png"
      )
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(
      responses
        .map((response) => response.body.data.versionNumber as number)
        .sort()
    ).toEqual([1, 2]);
  });

  it("rejects MIME spoofing, unsupported files, missing files, and oversized uploads", async () => {
    const { app } = setup({ maxUploadBytes: PDF.byteLength - 1 });

    const spoofed = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      Buffer.from("not really a PDF"),
      "spoofed.pdf",
      "application/pdf"
    );
    expect(spoofed.status).toBe(415);
    expect(spoofed.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");

    const unsupported = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      Buffer.from("PK\u0003\u0004"),
      "drawing.zip",
      "application/zip"
    );
    expect(unsupported.status).toBe(415);
    expect(unsupported.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");

    const missing = await request(app)
      .post("/api/v1/tasks/task-furniture-layout/design-versions")
      .set("Authorization", bearer(users.ananya));
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { file: expect.any(String) }
    });

    const tooLarge = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "too-large.pdf",
      "application/pdf"
    );
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("allows only a task-owning designer assigned to its project to upload", async () => {
    const { app } = setup();

    const projectColleague = await upload(
      app,
      users.kabir,
      "task-furniture-layout",
      PDF,
      "colleague.pdf",
      "application/pdf"
    );
    const wrongTaskOwner = await upload(
      app,
      users.ananya,
      "task-circulation",
      PDF,
      "wrong-owner.pdf",
      "application/pdf"
    );
    const manager = await upload(
      app,
      users.managerAarav,
      "task-furniture-layout",
      PDF,
      "manager.pdf",
      "application/pdf"
    );

    expect(projectColleague.status).toBe(403);
    expect(wrongTaskOwner.status).toBe(403);
    expect(manager.status).toBe(403);
  });

  it("creates no metadata after storage failure and deletes the object after metadata failure", async () => {
    const storageFailure = new TestStorage();
    storageFailure.failSave = true;
    const first = setup({ storage: storageFailure });

    const failedStorage = await upload(
      first.app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "storage-failure.pdf",
      "application/pdf"
    );
    expect(failedStorage.status).toBe(503);
    expect(failedStorage.body.error.code).toBe("FILE_STORAGE_ERROR");
    expect(
      await first.repository.listDesignVersions("project-aurora-villa")
    ).toHaveLength(1);

    const baseRepository = createMemoryRepository(structuredClone(demoSeedData));
    const metadataStorage = new TestStorage();
    const second = setup({
      repository: failDesignVersionMetadataWrites(baseRepository),
      storage: metadataStorage
    });
    const failedMetadata = await upload(
      second.app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "metadata-failure.pdf",
      "application/pdf"
    );

    expect(failedMetadata.status).toBe(500);
    expect(metadataStorage.deleted).toHaveLength(1);
    expect(metadataStorage.objects.size).toBe(0);
    expect(
      await baseRepository.listDesignVersions("project-aurora-villa")
    ).toHaveLength(1);
  });
});

describe("design-version approval and client visibility", () => {
  it("allows the responsible manager or head to approve and audits the atomic transition", async () => {
    const { app, repository } = setup();
    const uploaded = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "approval.pdf",
      "application/pdf"
    );

    const wrongManager = await approval(
      app,
      users.managerMeera,
      uploaded.body.data.id,
      { approvalStatus: "approved", clientVisible: true }
    );
    expect(wrongManager.status).toBe(403);

    const approved = await approval(
      app,
      users.managerAarav,
      uploaded.body.data.id,
      { approvalStatus: "approved", clientVisible: true }
    );
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({
      approvalStatus: "approved",
      clientVisible: true,
      reviewerId: "user-manager-aarav",
      approvedAt: TEST_NOW
    });

    const audits = await repository.listAuditEvents({
      entityType: "design_version",
      entityId: uploaded.body.data.id
    });
    expect(audits.at(-1)).toMatchObject({
      actorId: "user-manager-aarav",
      action: "design_version_approval_changed",
      oldValues: {
        approvalStatus: "draft",
        clientVisible: false
      },
      newValues: {
        approvalStatus: "approved",
        clientVisible: true
      }
    });

    const headUpload = await upload(
      app,
      users.ananya,
      "task-future-concept",
      PNG,
      "head-approval.png",
      "image/png"
    );
    const headApproved = await approval(
      app,
      users.head,
      headUpload.body.data.id,
      { approvalStatus: "approved", clientVisible: false }
    );
    expect(headApproved.status).toBe(200);
  });

  it("rejects designer approval and prevents client visibility unless approved", async () => {
    const { app } = setup();
    const uploaded = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "internal.pdf",
      "application/pdf"
    );

    const designer = await approval(
      app,
      users.ananya,
      uploaded.body.data.id,
      { approvalStatus: "approved", clientVisible: true }
    );
    expect(designer.status).toBe(403);

    const invalidVisibility = await approval(
      app,
      users.managerAarav,
      uploaded.body.data.id,
      { approvalStatus: "in_review", clientVisible: true }
    );
    expect(invalidVisibility.status).toBe(400);
    expect(invalidVisibility.body.error).toMatchObject({
      code: "INVALID_DESIGN_VERSION_STATE",
      fields: { clientVisible: expect.any(String) }
    });
  });

  it("rolls back approval and visibility when audit persistence fails", async () => {
    const baseRepository = createMemoryRepository(structuredClone(demoSeedData));
    const storage = new TestStorage();
    const initial = setup({ repository: baseRepository, storage });
    const uploaded = await upload(
      initial.app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "audit-rollback.pdf",
      "application/pdf"
    );
    const failing = setup({
      repository: failAuditWrites(baseRepository),
      storage
    });

    const response = await approval(
      failing.app,
      users.managerAarav,
      uploaded.body.data.id,
      { approvalStatus: "approved", clientVisible: true }
    );

    expect(response.status).toBe(500);
    expect(
      await baseRepository.findDesignVersionById(uploaded.body.data.id)
    ).toMatchObject({
      approvalStatus: "draft",
      clientVisible: false,
      reviewerId: null,
      approvedAt: null
    });
  });

  it("paginates internal listings but exposes clients only to approved visible redacted records", async () => {
    const { app } = setup();
    const draft = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "draft.pdf",
      "application/pdf"
    );
    const visible = await upload(
      app,
      users.ananya,
      "task-future-concept",
      PNG,
      "visible.png",
      "image/png"
    );
    await approval(app, users.managerAarav, visible.body.data.id, {
      approvalStatus: "approved",
      clientVisible: true
    });

    const internal = await request(app)
      .get("/api/v1/projects/project-aurora-villa/design-versions?limit=1&offset=1")
      .set("Authorization", bearer(users.managerAarav));
    expect(internal.status).toBe(200);
    expect(internal.body.data.pagination).toEqual({
      limit: 1,
      offset: 1,
      total: 3,
      hasMore: true
    });
    expect(internal.body.data.items).toHaveLength(1);
    expect(JSON.stringify(internal.body)).not.toContain("storedFileReference");

    const client = await request(app)
      .get("/api/v1/projects/project-aurora-villa/design-versions?limit=1&offset=1")
      .set("Authorization", bearer(users.auroraClient));
    expect(client.status).toBe(200);
    expect(client.body.data.pagination).toEqual({
      limit: 1,
      offset: 1,
      total: 2,
      hasMore: false
    });
    expect(client.body.data.items).toEqual([
      expect.objectContaining({
        id: visible.body.data.id,
        approvalStatus: "approved",
        clientVisible: true
      })
    ]);
    expect(JSON.stringify(client.body)).not.toContain(draft.body.data.id);
    expect(client.body.data.items[0]).not.toHaveProperty("storedFileReference");
    expect(client.body.data.items[0]).not.toHaveProperty("uploaderId");
    expect(client.body.data.items[0]).not.toHaveProperty("reviewerId");

    const otherClient = await request(app)
      .get("/api/v1/projects/project-aurora-villa/design-versions")
      .set("Authorization", bearer(users.celesteClient));
    expect(otherClient.status).toBe(404);
  });

  it("returns one newest approved update per client project without exposing drafts or staff metadata", async () => {
    const { app } = setup();
    const draft = await upload(app, users.ananya, "task-furniture-layout", PDF, "draft-only.pdf", "application/pdf");
    const visible = await upload(app, users.ananya, "task-future-concept", PNG, "latest-visible.png", "image/png");
    const internal = await upload(app, users.ananya, "task-future-concept", PDF, "approved-internal.pdf", "application/pdf");
    await approval(app, users.managerAarav, visible.body.data.id, { approvalStatus: "approved", clientVisible: true });
    await approval(app, users.managerAarav, internal.body.data.id, { approvalStatus: "approved", clientVisible: false });

    const response = await request(app)
      .get("/api/v1/client/latest-approved-versions")
      .set("Authorization", bearer(users.auroraClient));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([expect.objectContaining({ id: visible.body.data.id, projectId: "project-aurora-villa", originalFilename: "latest-visible.png" })]);
    expect(JSON.stringify(response.body)).not.toContain(draft.body.data.id);
    expect(JSON.stringify(response.body)).not.toContain(internal.body.data.id);
    expect(response.body.data[0]).not.toHaveProperty("uploaderId");
    expect(response.body.data[0]).not.toHaveProperty("reviewerId");

    const otherClient = await request(app)
      .get("/api/v1/client/latest-approved-versions")
      .set("Authorization", bearer(users.celesteClient));
    expect(otherClient.status).toBe(200);
    expect(otherClient.body.data).toEqual([]);
  });

  it("denies client download for drafts and internal approvals, then streams a visible file safely", async () => {
    const { app } = setup();
    const uploaded = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "floor plan final.pdf",
      "application/pdf"
    );

    const draft = await request(app)
      .get(`/api/v1/design-versions/${uploaded.body.data.id}/download`)
      .set("Authorization", bearer(users.auroraClient));
    expect(draft.status).toBe(404);

    await approval(app, users.managerAarav, uploaded.body.data.id, {
      approvalStatus: "approved",
      clientVisible: false
    });
    const internal = await request(app)
      .get(`/api/v1/design-versions/${uploaded.body.data.id}/download`)
      .set("Authorization", bearer(users.auroraClient));
    expect(internal.status).toBe(404);

    await approval(app, users.managerAarav, uploaded.body.data.id, {
      approvalStatus: "approved",
      clientVisible: true
    });
    const visible = await request(app)
      .get(`/api/v1/design-versions/${uploaded.body.data.id}/download`)
      .set("Authorization", bearer(users.auroraClient))
      .buffer(true)
      .parse(binaryParser);

    expect(visible.status).toBe(200);
    expect(visible.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(visible.headers["content-disposition"]).toContain("attachment;");
    expect(visible.headers["content-disposition"]).toContain("filename*=");
    expect(visible.headers["content-disposition"]).not.toMatch(/[\r\n]/);
    expect(visible.body).toEqual(PDF);

    const otherClient = await request(app)
      .get(`/api/v1/design-versions/${uploaded.body.data.id}/download`)
      .set("Authorization", bearer(users.celesteClient));
    expect(otherClient.status).toBe(404);
  });
});

describe("Design Version operations", () => {
  it("lets the task-owning initiating Designer upload when not assigned", async () => {
    const seed = structuredClone(demoSeedData);
    const project = seed.projects.find(
      (candidate) => candidate.id === "project-aurora-villa"
    )!;
    project.assignedDesignerIds = project.assignedDesignerIds.filter(
      (designerId) => designerId !== users.ananya[0]
    );
    const repository = createMemoryRepository(seed);
    const storage = new TestStorage();
    const { app } = setup({ repository, storage });
    const before = await repository.listDesignVersions(project.id);

    const response = await upload(
      app,
      users.ananya,
      "task-furniture-layout",
      PDF,
      "initiator-plan.pdf",
      "application/pdf"
    );

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      projectId: project.id,
      taskId: "task-furniture-layout",
      uploaderId: users.ananya[0],
      originalFilename: "initiator-plan.pdf"
    });
    expect(await repository.listDesignVersions(project.id)).toHaveLength(
      before.length + 1
    );
    expect(storage.objects.size).toBe(1);
  });

  it("Super Admin reads latest approved versions without exposing drafts", async () => {
    const repository = createMemoryRepository(superAdminDesignSeed());
    const { app } = setup({ repository });

    const response = await request(app)
      .get("/api/v1/client/latest-approved-versions?limit=20&offset=0")
      .set("Authorization", bearer(users.superAdmin));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: "version-aurora-plan-1",
        approvalStatus: "approved",
        clientVisible: true
      })
    ]);
    expect(JSON.stringify(response.body)).not.toContain("version-super-admin-submitted");
    expect(response.body.data[0]).not.toHaveProperty("uploaderId");
    expect(response.body.data[0]).not.toHaveProperty("reviewerId");
  });

  it("Super Admin cannot upload a Design Version before file handling", async () => {
    const repository = createMemoryRepository(superAdminDesignSeed());
    const storage = new TestStorage();
    const { app } = setup({ repository, storage });
    const before = await repository.listDesignVersions("project-aurora-villa");

    await upload(
      app,
      users.superAdmin,
      "task-furniture-layout",
      PDF,
      "forbidden.pdf",
      "application/pdf"
    ).expect(403);

    expect(await repository.listDesignVersions("project-aurora-villa")).toEqual(before);
    expect(storage.objects.size).toBe(0);
  });

  it("Super Admin lists project Design Versions and reads extraction state", async () => {
    const repository = createMemoryRepository(superAdminDesignSeed());
    const { app } = setup({ repository });
    const before = await repository.findExtractionJobByVersionId("version-aurora-plan-1");

    const versions = await request(app)
      .get("/api/v1/projects/project-aurora-villa/design-versions?limit=20&offset=0")
      .set("Authorization", bearer(users.superAdmin));
    const extraction = await request(app)
      .get("/api/v1/design-versions/version-aurora-plan-1/extraction")
      .set("Authorization", bearer(users.superAdmin));

    expect(versions.status).toBe(200);
    expect(versions.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "version-aurora-plan-1" }),
        expect.objectContaining({ id: "version-super-admin-submitted" })
      ])
    );
    expect(extraction.status).toBe(200);
    expect(extraction.body.data).toMatchObject({
      id: "job-approved-version",
      designVersionId: "version-aurora-plan-1",
      status: "approved"
    });
    expect(await repository.findExtractionJobByVersionId("version-aurora-plan-1"))
      .toEqual(before);
  });

  it("Super Admin approves with workflow checks and its own audit identity", async () => {
    const repository = createMemoryRepository(superAdminDesignSeed());
    const { app } = setup({ repository });

    const response = await approval(
      app,
      users.superAdmin,
      "version-super-admin-submitted",
      { approvalStatus: "approved", clientVisible: true }
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: "version-super-admin-submitted",
      approvalStatus: "approved",
      clientVisible: true,
      reviewerId: "user-super-admin",
      approvedAt: TEST_NOW
    });
    expect(await repository.listAuditEvents({
      entityType: "design_version",
      entityId: "version-super-admin-submitted"
    })).toEqual([
      expect.objectContaining({
        actorId: "user-super-admin",
        action: "design_version_approval_changed"
      })
    ]);
  });

  it("Super Admin downloads a Design Version without mutating it", async () => {
    const seed = superAdminDesignSeed();
    seed.designVersions.find(
      (version) => version.id === "version-aurora-plan-1"
    )!.sizeBytes = PDF.byteLength;
    const repository = createMemoryRepository(seed);
    const storage = new TestStorage();
    storage.objects.set("seed/aurora-ground-plan-v1.pdf", PDF);
    const { app } = setup({ repository, storage });
    const before = await repository.findDesignVersionById("version-aurora-plan-1");

    const response = await request(app)
      .get("/api/v1/design-versions/version-aurora-plan-1/download")
      .set("Authorization", bearer(users.superAdmin))
      .buffer(true)
      .parse(binaryParser);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(response.headers["content-disposition"]).toContain("attachment;");
    expect(response.body).toEqual(PDF);
    expect(storage.opened).toEqual(["seed/aurora-ground-plan-v1.pdf"]);
    expect(await repository.findDesignVersionById("version-aurora-plan-1")).toEqual(before);
  });
});
