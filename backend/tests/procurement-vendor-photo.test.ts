import { Readable } from "node:stream";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { ApiError, errorHandler } from "../src/middleware/errors.js";
import type { ValidatedUpload } from "../src/middleware/upload.js";
import { createProcurementVendorPhotoRouter } from "../src/routes/procurement-vendor-photo.js";
import { validateProcurementVendorPhoto, type ProcurementVendorPhotoService } from "../src/services/procurement-vendor-photo.service.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";

const actor: PublicUser = { id: "synthetic-admin", name: "Admin", email: "admin@example.invalid", role: "super_admin" };
const png = async () => sharp({ create: { width: 16, height: 12, channels: 3, background: "#aabbcc" } }).png().toBuffer();
const file = (data: Buffer): ValidatedUpload => ({ data, extension: ".png", mimeType: "image/png", originalFilename: "synthetic.png", sizeBytes: data.length });
const descriptor = { id: "opaque-photo-id", url: "/api/v1/admin/ai-estimator-knowledge/vendors/v1/photo?v=opaque-photo-id", mimeType: "image/png" as const, byteSize: 10, uploadedAt: "2026-09-24T00:00:00.000Z" };
function harness(user = actor) {
  const service = { authorize: vi.fn(async () => {}), replace: vi.fn(async () => ({ vendorId: "v1", version: 2, geoTaggedPicture: descriptor })), remove: vi.fn(async () => ({ vendorId: "v1", version: 3, geoTaggedPicture: null })), open: vi.fn(async () => ({ descriptor, stream: Readable.from(Buffer.alloc(10)) })), cleanup: vi.fn() } satisfies ProcurementVendorPhotoService;
  const auth = { authenticate: vi.fn(async () => user) } as unknown as AuthService;
  const app = express(); app.use(express.json());
  app.use("/api/v1", createProcurementVendorPhotoRouter({ authService: auth, photoService: service, maxUploadBytes: 1024 }));
  app.use(errorHandler);
  return { service, app };
}
const path = "/api/v1/admin/ai-estimator-knowledge/vendors/v1/photo";
describe("vendor photo validation and HTTP", () => {
  it("validates decoding and retains original bytes and metadata", async () => {
    const jpeg = await sharp(await png()).withExif({ IFD0: { Copyright: "Synthetic original metadata" } }).jpeg().toBuffer();
    const result = await validateProcurementVendorPhoto({ ...file(jpeg), mimeType: "image/jpeg", extension: ".jpg", originalFilename: "original.jpg" }, 100_000);
    expect(result.data.equals(jpeg)).toBe(true);
    expect((await sharp(result.data).metadata()).exif?.length).toBeGreaterThan(0);
    expect(await validateProcurementVendorPhoto(file(await png()), 100_000)).toMatchObject({ mimeType: "image/png" });
  });
  it("rejects forged MIME, corrupt decodes, oversized files, and excessive dimensions", async () => {
    const valid = await png();
    await expect(validateProcurementVendorPhoto({ ...file(valid), mimeType: "image/jpeg" }, 100_000)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE_TYPE" });
    await expect(validateProcurementVendorPhoto(file(valid.subarray(0, 30)), 100_000)).rejects.toMatchObject({ code: "VENDOR_PHOTO_INVALID" });
    await expect(validateProcurementVendorPhoto(file(valid), 10)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    const wide = await sharp({ create: { width: 16_385, height: 1, channels: 3, background: "#fff" } }).png().toBuffer();
    await expect(validateProcurementVendorPhoto(file(wide), 100_000)).rejects.toMatchObject({ code: "VENDOR_PHOTO_INVALID" });
  });
  it("authorizes before multipart parsing for unauthenticated, Procurement, and revoked users", async () => {
    const { app, service } = harness();
    expect((await request(app).put(path).attach("photo", Buffer.alloc(2048), "invalid.png")).status).toBe(401);
    const procurement = harness({ ...actor, role: "procurement" });
    expect((await request(procurement.app).put(path).set("Authorization", "Bearer token").attach("photo", Buffer.alloc(2048), "invalid.png")).status).toBe(403);
    service.authorize.mockRejectedValueOnce(new ApiError(401, "INVALID_TOKEN", "Invalid token."));
    expect((await request(app).put(path).set("Authorization", "Bearer token").attach("photo", Buffer.alloc(2048), "invalid.png")).status).toBe(401);
    expect(service.replace).not.toHaveBeenCalled();
  });
  it("uses bounded multipart, strict command fields, private authenticated response and expected versions", async () => {
    const { app, service } = harness();
    const body = await png();
    const response = await request(app).put(path).set("Authorization", "Bearer token").field("expectedVersion", "1").field("idempotencyKey", "request-123").attach("photo", body, "synthetic.png");
    expect(response.status).toBe(200);
    expect(service.replace).toHaveBeenCalledWith(actor, "v1", { expectedVersion: 1, idempotencyKey: "request-123" }, expect.objectContaining({ data: body }));
    expect((await request(app).put(path).set("Authorization", "Bearer token").field("expectedVersion", "1").attach("photo", body, "synthetic.png")).status).toBe(400);
    expect((await request(app).delete(path).set("Authorization", "Bearer token").send({ expectedVersion: 2 })).status).toBe(200);
    const fetched = await request(app).get(`${path}?v=opaque-photo-id`).set("Authorization", "Bearer token");
    expect(fetched.status).toBe(200);
    expect(fetched.headers["cache-control"]).toBe("private, no-store");
    expect(fetched.headers["x-content-type-options"]).toBe("nosniff");
  });
});
