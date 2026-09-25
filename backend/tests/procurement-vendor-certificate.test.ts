import { Readable } from "node:stream";
import express from "express";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ApiError, errorHandler } from "../src/middleware/errors.js";
import type { ValidatedUpload } from "../src/middleware/upload.js";
import { createProcurementVendorCertificateRouter } from "../src/routes/procurement-vendor-certificate.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import { validateProcurementVendorCertificate, type ProcurementVendorCertificateService } from "../src/services/procurement-vendor-certificate.service.js";

const actor: PublicUser = { id: "certificate-test-admin", name: "Synthetic Admin", email: "admin@example.invalid", role: "super_admin" };
const base = "/api/v1/admin/ai-estimator-knowledge/vendors";
const maxUploadBytes = 2048;
const descriptor = { id: "synthetic-certificate", originalFilename: "synthetic certificate.pdf", mimeType: "application/pdf" as const, byteSize: 4, uploadedAt: "2026-09-25T12:00:00.000Z", url: `${base}/v1/msme-certificate?v=synthetic-certificate` };
const policy = { maxUploadBytes, allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const, uploadLifetimeSeconds: 3600 };
async function pdf(): Promise<ValidatedUpload> {
  const document = await PDFDocument.create(); document.addPage([100, 100]);
  const data = Buffer.from(await document.save());
  return { data, sizeBytes: data.length, extension: ".pdf", mimeType: "application/pdf", originalFilename: "synthetic.pdf" };
}
function harness(user = actor) {
  const service = {
    authorize: vi.fn(async () => {}), policy: vi.fn(async () => ({ ...policy, allowedMimeTypes: [...policy.allowedMimeTypes] })),
    stage: vi.fn(async () => ({ uploadId: "staged-certificate", originalFilename: "synthetic.pdf", mimeType: "application/pdf" as const, byteSize: 100, expiresAt: "2026-09-25T13:00:00.000Z" })),
    open: vi.fn(async () => ({ descriptor, stream: Readable.from(Buffer.from("file")) })),
    cleanup: vi.fn(async () => ({ deleted: 0, failed: 0 }))
  } satisfies ProcurementVendorCertificateService;
  const auth = { authenticate: vi.fn(async () => user) } as unknown as AuthService;
  const app = express(); app.use(express.json());
  app.use("/api/v1", createProcurementVendorCertificateRouter({ authService: auth, certificateService: service, maxUploadBytes }));
  app.use(errorHandler);
  return { app, service };
}

describe("private MSME certificate validation and HTTP", () => {
  it("preserves valid PDF and image bytes while sanitizing filenames", async () => {
    const certificate = await pdf();
    const validated = await validateProcurementVendorCertificate({ ...certificate, originalFilename: "../../synthetic\u0000.pdf" }, maxUploadBytes);
    expect(validated).toMatchObject({ originalFilename: "synthetic.pdf", mimeType: "application/pdf", sizeBytes: certificate.sizeBytes });
    expect(validated.data).toEqual(certificate.data);
    for (const format of ["jpeg", "png", "webp"] as const) {
      const data = await sharp({ create: { width: 12, height: 10, channels: 3, background: "#abc" } })[format]().toBuffer();
      const image: ValidatedUpload = { data, sizeBytes: data.length, extension: format === "jpeg" ? ".jpg" : `.${format}`, mimeType: `image/${format}`, originalFilename: `synthetic.${format}` };
      expect((await validateProcurementVendorCertificate(image, maxUploadBytes)).data).toEqual(data);
    }
  });

  it("rejects MIME spoofing, invalid PDFs, corrupt images, unsupported images, and oversized input", async () => {
    const certificate = await pdf();
    await expect(validateProcurementVendorCertificate({ ...certificate, mimeType: "image/png" }, maxUploadBytes)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
    await expect(validateProcurementVendorCertificate({ ...certificate, originalFilename: "synthetic.png" }, maxUploadBytes)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
    await expect(validateProcurementVendorCertificate({ ...certificate, data: Buffer.from("%PDF-1.7\nforged\n%%EOF") }, maxUploadBytes)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
    await expect(validateProcurementVendorCertificate(certificate, certificate.sizeBytes - 1)).rejects.toMatchObject({ status: 413, code: "FILE_TOO_LARGE", fields: { msmeCertificate: expect.any(String) } });
    const data = await sharp({ create: { width: 12, height: 10, channels: 3, background: "#abc" } }).png().toBuffer();
    await expect(validateProcurementVendorCertificate({ data: data.subarray(0, 30), sizeBytes: 30, extension: ".png", mimeType: "image/png", originalFilename: "synthetic.png" }, maxUploadBytes)).rejects.toMatchObject({ code: "VENDOR_CERTIFICATE_INVALID" });
    const tiff = await sharp(data).tiff().toBuffer();
    await expect(validateProcurementVendorCertificate({ data: tiff, sizeBytes: tiff.length, extension: ".tif", mimeType: "image/tiff", originalFilename: "synthetic.tif" }, 100_000)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
  });

  it("authorizes policy, staging, and downloads before any multipart processing", async () => {
    const { app, service } = harness();
    for (const route of [`${base}/msme-certificate-uploads`, `${base}/v1/msme-certificate-uploads`]) {
      expect((await request(app).post(route).attach("certificate", Buffer.alloc(4096), "invalid.pdf")).status).toBe(401);
      const denied = harness({ ...actor, role: "procurement" });
      expect((await request(denied.app).post(route).set("Authorization", "Bearer synthetic").attach("certificate", Buffer.alloc(4096), "invalid.pdf")).status).toBe(403);
      expect(denied.service.stage).not.toHaveBeenCalled();
    }
    for (const route of [`${base}/msme-certificate-upload-policy`, `${base}/v1/msme-certificate`]) {
      expect((await request(app).get(route)).status).toBe(401);
      const denied = harness({ ...actor, role: "procurement" });
      expect((await request(denied.app).get(route).set("Authorization", "Bearer synthetic")).status).toBe(403);
    }
    service.authorize.mockRejectedValueOnce(new ApiError(401, "INVALID_TOKEN", "Invalid token."));
    expect((await request(app).post(`${base}/msme-certificate-uploads`).set("Authorization", "Bearer synthetic").attach("certificate", Buffer.alloc(4096), "invalid.pdf")).status).toBe(401);
    expect(service.stage).not.toHaveBeenCalled();
  });

  it("reports server policy and binds staged uploads to strict create/update command fields", async () => {
    const { app, service } = harness();
    const certificate = await pdf();
    const getPolicy = await request(app).get(`${base}/msme-certificate-upload-policy`).set("Authorization", "Bearer synthetic");
    expect(getPolicy.status).toBe(200); expect(getPolicy.body.data).toEqual(policy);
    const created = await request(app).post(`${base}/msme-certificate-uploads`).set("Authorization", "Bearer synthetic").field("idempotencyKey", "new-certificate-key").attach("certificate", certificate.data, "synthetic.pdf");
    expect(created.status).toBe(201);
    expect(service.stage).toHaveBeenLastCalledWith(actor, { idempotencyKey: "new-certificate-key" }, expect.objectContaining({ data: certificate.data }));
    const updated = await request(app).post(`${base}/v1/msme-certificate-uploads`).set("Authorization", "Bearer synthetic").field("expectedVersion", "7").field("idempotencyKey", "edit-certificate-key").attach("certificate", certificate.data, "synthetic.pdf");
    expect(updated.status).toBe(201);
    expect(service.stage).toHaveBeenLastCalledWith(actor, { vendorId: "v1", expectedVersion: 7, idempotencyKey: "edit-certificate-key" }, expect.objectContaining({ data: certificate.data }));
    const calls = service.stage.mock.calls.length;
    expect((await request(app).post(`${base}/v1/msme-certificate-uploads`).set("Authorization", "Bearer synthetic").field("idempotencyKey", "missing-version").attach("certificate", certificate.data, "synthetic.pdf")).status).toBe(400);
    expect((await request(app).post(`${base}/msme-certificate-uploads`).set("Authorization", "Bearer synthetic").field("idempotencyKey", "extra-field-request").field("storageReference", "client-target").attach("certificate", certificate.data, "synthetic.pdf")).status).toBe(400);
    expect((await request(app).post(`${base}/msme-certificate-uploads`).set("Authorization", "Bearer synthetic").field("idempotencyKey", "missing-certificate")).status).toBe(400);
    expect((await request(app).post(`${base}/msme-certificate-uploads`).set("Authorization", "Bearer synthetic").field("idempotencyKey", "oversized-certificate").attach("certificate", Buffer.alloc(4096), "synthetic.pdf")).status).toBe(413);
    expect(service.stage).toHaveBeenCalledTimes(calls);
  });

  it("serves an authenticated attachment with private headers and passes the exact requested revision", async () => {
    const { app, service } = harness();
    const response = await request(app).get(`${base}/v1/msme-certificate?v=synthetic-certificate`).set("Authorization", "Bearer synthetic");
    expect(response.status).toBe(200);
    expect(service.open).toHaveBeenCalledWith(actor, "v1", "synthetic-certificate");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-disposition"]).toContain("attachment;");
    expect(response.headers["content-disposition"]).toContain("synthetic certificate.pdf");
    service.open.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "The requested MSME certificate was not found."));
    expect((await request(app).get(`${base}/v1/msme-certificate?v=old-certificate`).set("Authorization", "Bearer synthetic")).status).toBe(404);
    expect((await request(app).get(`${base}/v1/msme-certificate?v=a&storageReference=private`).set("Authorization", "Bearer synthetic")).status).toBe(400);
  });
});
