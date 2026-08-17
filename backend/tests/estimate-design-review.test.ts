import { Readable } from "node:stream";

import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import {
  annotationDocumentSchema,
  type AnnotationDocumentV1
} from "../src/domain/estimate-design.js";
import { EstimateDesignAnnotationDraftModel } from "../src/models/EstimateDesignAnnotationDraft.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignExtractionJobModel } from "../src/models/EstimateDesignExtractionJob.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createEstimateDesignService } from "../src/services/estimate-design.service.js";
import { createAuditService } from "../src/services/audit.service.js";

const SECRET = "estimate-design-review-secret-at-least-32-characters";
const NOW = new Date("2026-07-30T14:00:00.000Z");
let PNG: Buffer;
let NOISY_JPEG: Buffer;
let NOISY_PNG: Buffer;

class TestStorage {
  private sequence = 0;
  readonly objects = new Map<string, Buffer>();

  async save(input: { data: Buffer; extension: string }) {
    const reference = `stored-${++this.sequence}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async saveGenerated(input: { data: Buffer; extension: string }) {
    const reference = `generated-${++this.sequence}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async read(reference: string) {
    const value = this.objects.get(reference);
    if (!value) throw new Error("missing object");
    return Buffer.from(value);
  }

  async open(reference: string) {
    return Readable.from(await this.read(reference));
  }

  async delete(reference: string) {
    this.objects.delete(reference);
  }
}

function query<T>(value: T) {
  const result = {
    sort: vi.fn(),
    session: vi.fn(),
    lean: vi.fn(async () => value),
    exec: vi.fn(async () => value)
  };
  result.sort.mockReturnValue(result);
  result.session.mockReturnValue(result);
  return result;
}

function matches(record: Record<string, any>, filter: Record<string, any>): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    const actual = record[key];
    if (expected && typeof expected === "object") {
      if ("$in" in expected && !expected.$in.includes(actual)) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function applyUpdate(record: Record<string, any>, update: Record<string, any>) {
  Object.assign(record, update.$set ?? {});
  for (const [key, amount] of Object.entries(update.$inc ?? {})) {
    record[key] = Number(record[key] ?? 0) + Number(amount);
  }
}

function auth(id: string, role: string) {
  return `Bearer ${jwt.sign({ id, role }, SECRET, { expiresIn: 900 })}`;
}

const annotations = (): AnnotationDocumentV1 => ({
  schemaVersion: 1,
  imageWidth: 50,
  imageHeight: 80,
  elements: [{
    id: "note-1",
    type: "text",
    x: 0.25,
    y: 0.5,
    text: "Extend this line",
    color: "#ef4444",
    strokeWidth: 2
  }]
});

function minimalTiff(width: number, height: number) {
  const value = Buffer.alloc(8 + 2 + 2 * 12 + 4);
  value.write("II", 0, "ascii");
  value.writeUInt16LE(42, 2);
  value.writeUInt32LE(8, 4);
  value.writeUInt16LE(2, 8);
  value.writeUInt16LE(256, 10);
  value.writeUInt16LE(4, 12);
  value.writeUInt32LE(1, 14);
  value.writeUInt32LE(width, 18);
  value.writeUInt16LE(257, 22);
  value.writeUInt16LE(4, 24);
  value.writeUInt32LE(1, 26);
  value.writeUInt32LE(height, 30);
  value.writeUInt32LE(0, 34);
  return value;
}

function setup(maxUploadBytes = 10_000_000) {
  const storage = new TestStorage();
  vi.spyOn(AuditEventModel, "create").mockImplementation(async (input) =>
    (input as Array<Record<string, any>>).map((event) => ({
      toObject: () => ({ ...event, id: event._id })
    })) as never
  );
  storage.objects.set("drawing-1.png", PNG);
  storage.objects.set("drawing-2.png", PNG);
  const estimates: Array<Record<string, any>> = [{
    _id: "estimate-1",
    leadId: "lead-1",
    ownerId: "user-estimator-sales",
    status: "sent_to_client",
    designLifecycleVersion: 0,
    designFrozenAt: null,
    rooms: [{ id: "room-living", label: "Living Room" }],
    scopes: ["FC"]
  }];
  const leads: Array<Record<string, any>> = [{
    _id: "lead-1",
    ownerId: "user-estimator-sales",
    clientEmail: "client@aurora.example"
  }];
  const uploads: Array<Record<string, any>> = [{
    _id: "upload-1",
    estimateId: "estimate-1",
    leadId: "lead-1",
    originalFilename: "plans.png",
    storedFileReference: "drawing-1.png",
    mimeType: "image/png",
    sizeBytes: PNG.length,
    uploaderId: "user-estimator-sales",
    uploadedAt: NOW,
    extractionStatus: "submitted",
    failureCode: null,
    failureMessage: null
  }];
  const jobs: Array<Record<string, any>> = [{
    _id: "job-1",
    uploadId: "upload-1",
    status: "submitted"
  }];
  const pages: Array<Record<string, any>> = [{
    _id: "page-1",
    uploadId: "upload-1",
    pageNumber: 1,
    normalizedFileReference: "drawing-1.png",
    width: 100,
    height: 80
  }];
  const drawings: Array<Record<string, any>> = [
    {
      _id: "drawing-1",
      uploadId: "upload-1",
      sourcePageId: "page-1",
      estimateId: "estimate-1",
      active: true,
      verified: true,
      roomId: "room-living",
      scopeSectionId: "FC",
      catalogueId: "FC01",
      mappingStatus: "auto_mapped",
      detectedTitle: "Living ceiling",
      displayTitle: "Living ceiling",
      source: "ocr"
    },
    {
      _id: "drawing-2",
      uploadId: "upload-1",
      sourcePageId: "page-1",
      estimateId: "estimate-1",
      active: true,
      verified: true,
      roomId: "room-living",
      scopeSectionId: "FC",
      catalogueId: "FC01",
      mappingStatus: "auto_mapped",
      detectedTitle: "Living detail",
      displayTitle: "Living detail",
      source: "ocr"
    }
  ];
  const revisions: Array<Record<string, any>> = [
    {
      _id: "revision-1",
      drawingId: "drawing-1",
      revisionNumber: 1,
      sourcePageId: "page-1",
      crop: { x: 0, y: 0, width: 50, height: 80 },
      croppedFileReference: "drawing-1.png",
      roomId: "room-living",
      scopeSectionId: "FC",
      catalogueId: "FC01",
      mappingStatus: "auto_mapped",
      label: "Living ceiling",
      reviewStatus: "submitted",
      submittedAt: NOW,
      reviewerId: null,
      reviewedAt: null,
      changeSummary: null,
      annotations: null,
      replacementUploadId: null,
      replacesRevisionId: null
    },
    {
      _id: "revision-2",
      drawingId: "drawing-2",
      revisionNumber: 1,
      sourcePageId: "page-1",
      crop: { x: 50, y: 0, width: 50, height: 80 },
      croppedFileReference: "drawing-2.png",
      roomId: "room-living",
      scopeSectionId: "FC",
      catalogueId: "FC01",
      mappingStatus: "auto_mapped",
      label: "Living detail",
      reviewStatus: "submitted",
      submittedAt: NOW,
      reviewerId: null,
      reviewedAt: null,
      changeSummary: null,
      annotations: null,
      replacementUploadId: null,
      replacesRevisionId: null
    }
  ];
  const drafts: Array<Record<string, any>> = [];
  const auditEvents: Array<Record<string, any>> = [];
  const snapshots = () => structuredClone({
    estimates,
    uploads,
    jobs,
    pages,
    drawings,
    revisions,
    drafts
  });
  const restore = (snapshot: ReturnType<typeof snapshots>) => {
    for (const [target, source] of [
      [estimates, snapshot.estimates],
      [uploads, snapshot.uploads],
      [jobs, snapshot.jobs],
      [pages, snapshot.pages],
      [drawings, snapshot.drawings],
      [revisions, snapshot.revisions],
      [drafts, snapshot.drafts]
    ] as const) target.splice(0, target.length, ...structuredClone(source));
  };
  const session = {
    withTransaction: vi.fn(async (operation: () => Promise<unknown>) => {
      const snapshot = snapshots();
      try {
        return await operation();
      } catch (error) {
        restore(snapshot);
        throw error;
      }
    }),
    endSession: vi.fn(async () => undefined)
  };
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);
  vi.spyOn(AuditEventModel, "create").mockImplementation(async (input) => {
    const events = structuredClone(input as Array<Record<string, any>>);
    auditEvents.push(...events);
    return events.map((event) => ({
      toObject: () => ({ ...event, id: event._id })
    })) as never;
  });
  vi.spyOn(EstimateModel, "findById").mockImplementation((id) =>
    query(estimates.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateModel, "findOne").mockImplementation((filter) =>
    query(estimates.find((item) => matches(item, filter as never)) ?? null) as never
  );
  vi.spyOn(EstimateModel, "updateOne").mockImplementation(async (filter, update) => {
    const item = estimates.find((candidate) => matches(candidate, filter as never));
    if (item) applyUpdate(item, update as never);
    return { matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 } as never;
  });
  vi.spyOn(LeadModel, "findById").mockImplementation((id) =>
    query(leads.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(LeadModel, "findOne").mockImplementation((filter) =>
    query(leads.find((item) => item._id === filter._id) ?? null) as never
  );
  vi.spyOn(UserModel, "findOne").mockImplementation((filter) =>
    query(
      filter.role === "client" && filter.emailNormalized === "client@aurora.example"
        ? { _id: "user-client-aurora", role: "client", active: true }
        : null
    ) as never
  );
  vi.spyOn(EstimateDesignUploadModel, "findById").mockImplementation((id) =>
    query(uploads.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignUploadModel, "find").mockImplementation((filter) =>
    query(uploads.filter((item) => matches(item, filter as never))) as never
  );
  vi.spyOn(EstimateDesignUploadModel, "updateOne").mockImplementation(async (filter, update) => {
    const item = uploads.find((candidate) => matches(candidate, filter as never));
    if (item) applyUpdate(item, update as never);
    return { matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 } as never;
  });
  vi.spyOn(EstimateDesignUploadModel, "create").mockImplementation(async (input) => {
    uploads.push(...structuredClone(input as Array<Record<string, any>>));
    return input as never;
  });
  vi.spyOn(EstimateDesignExtractionJobModel, "findOne").mockImplementation((filter) =>
    query(jobs.find((item) => matches(item, filter as never)) ?? null) as never
  );
  vi.spyOn(EstimateDesignExtractionJobModel, "findById").mockImplementation((id) =>
    query(jobs.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignExtractionJobModel, "findOneAndUpdate").mockImplementation((filter, update) => {
    const item = jobs.find((candidate) => matches(candidate, filter as never)) ?? null;
    if (item) applyUpdate(item, update as never);
    return query(item) as never;
  });
  vi.spyOn(EstimateDesignExtractionJobModel, "updateOne").mockImplementation(async (filter, update) => {
    const item = jobs.find((candidate) => matches(candidate, filter as never));
    if (item) applyUpdate(item, update as never);
    return { matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 } as never;
  });
  vi.spyOn(EstimateDesignExtractionJobModel, "create").mockImplementation(async (input) => {
    jobs.push(...structuredClone(input as Array<Record<string, any>>));
    return input as never;
  });
  vi.spyOn(EstimateDesignSourcePageModel, "findById").mockImplementation((id) =>
    query(pages.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignSourcePageModel, "find").mockImplementation((filter) =>
    query(pages.filter((item) =>
      filter.uploadId?.$in
        ? filter.uploadId.$in.includes(item.uploadId)
        : item.uploadId === filter.uploadId
    )) as never
  );
  vi.spyOn(EstimateDesignSourcePageModel, "create").mockImplementation(async (input) => {
    pages.push(...structuredClone(input as Array<Record<string, any>>));
    return input as never;
  });
  vi.spyOn(EstimateDesignDrawingModel, "findById").mockImplementation((id) =>
    query(drawings.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignDrawingModel, "find").mockImplementation((filter) =>
    query(drawings.filter((item) => matches(item, filter as never))) as never
  );
  vi.spyOn(EstimateDesignDrawingModel, "updateOne").mockImplementation(async (filter, update) => {
    const item = drawings.find((candidate) => matches(candidate, filter as never));
    if (item) applyUpdate(item, update as never);
    return { matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 } as never;
  });
  vi.spyOn(EstimateDesignRevisionModel, "findById").mockImplementation((id) =>
    query(revisions.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateDesignRevisionModel, "find").mockImplementation((filter) =>
    query(revisions.filter((item) =>
      filter.drawingId?.$in
        ? filter.drawingId.$in.includes(item.drawingId)
        : filter.drawingId
          ? item.drawingId === filter.drawingId
          : true
    )) as never
  );
  vi.spyOn(EstimateDesignRevisionModel, "findOne").mockImplementation((filter) => {
    const values = revisions
      .filter((item) => item.drawingId === filter.drawingId)
      .sort((left, right) => right.revisionNumber - left.revisionNumber);
    return query(values[0] ?? null) as never;
  });
  vi.spyOn(EstimateDesignRevisionModel, "updateOne").mockImplementation(async (filter, update) => {
    const item = revisions.find((candidate) => matches(candidate, filter as never));
    if (item) applyUpdate(item, update as never);
    return { matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 } as never;
  });
  vi.spyOn(EstimateDesignRevisionModel, "create").mockImplementation(async (input) => {
    revisions.push(...structuredClone(input as Array<Record<string, any>>));
    return input as never;
  });
  vi.spyOn(EstimateDesignRevisionModel, "updateMany").mockImplementation(async (filter, update) => {
    const items = revisions.filter((item) =>
      filter._id.$in.includes(item._id) &&
      filter.reviewStatus.$in.includes(item.reviewStatus)
    );
    items.forEach((item) => applyUpdate(item, update as never));
    return { matchedCount: items.length, modifiedCount: items.length } as never;
  });
  vi.spyOn(EstimateDesignAnnotationDraftModel, "findOne").mockImplementation((filter) =>
    query(drafts.find((item) => matches(item, filter as never)) ?? null) as never
  );
  vi.spyOn(EstimateDesignAnnotationDraftModel, "findOneAndUpdate").mockImplementation((filter, update) => {
    let item = drafts.find((candidate) => matches(candidate, filter as never));
    if (!item && filter.version === 0) {
      item = {
        _id: String(update.$setOnInsert._id),
        revisionId: filter.revisionId,
        clientId: filter.clientId,
        version: 0
      };
      drafts.push(item);
    }
    if (item) applyUpdate(item, update as never);
    return query(item ?? null) as never;
  });
  vi.spyOn(EstimateDesignAnnotationDraftModel, "deleteOne").mockImplementation(async (filter) => {
    const index = drafts.findIndex((item) => matches(item, filter as never));
    if (index >= 0) drafts.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 } as never;
  });

  const seed = structuredClone(demoSeedData);
  seed.users.push({
    ...seed.users[0]!,
    id: "user-super-admin",
    name: "Global Administrator",
    email: "super-admin@lisno.example",
    emailNormalized: "super-admin@lisno.example",
    role: "super_admin",
    managerId: null,
    authorizedClientIds: []
  });
  const repository = createMemoryRepository(seed);
  const projectGrantSpies = [
    vi.spyOn(repository, "findActiveProjectAccessGrant"),
    vi.spyOn(repository, "listProjectsForUserInModule"),
    vi.spyOn(repository, "pageProjectsForUserInModule")
  ] as const;
  const app = createApp({
    repository,
    auth: { jwtSecret: SECRET, jwtExpiresInSeconds: 900 },
    clock: () => new Date(NOW),
    storage,
    maxUploadBytes
  });
  const service = createEstimateDesignService({
    storage,
    audit: createAuditService(createMemoryRepository(demoSeedData)),
    maxUploadBytes,
    now: () => new Date(NOW)
  });
  return {
    app,
    service,
    storage,
    estimates,
    uploads,
    jobs,
    pages,
    drawings,
    revisions,
    drafts,
    auditEvents,
    projectGrantSpies
  };
}

beforeAll(async () => {
  PNG = await sharp({
    create: { width: 100, height: 80, channels: 3, background: "#ffffff" }
  }).png().toBuffer();
  const noise = Buffer.alloc(128 * 128 * 3);
  for (let index = 0; index < noise.length; index += 1) {
    noise[index] = (index * 73 + 41) % 256;
  }
  NOISY_JPEG = await sharp(noise, {
    raw: { width: 128, height: 128, channels: 3 }
  }).jpeg({ quality: 35 }).toBuffer();
  NOISY_PNG = await sharp(NOISY_JPEG).png().toBuffer();
});

afterEach(() => vi.restoreAllMocks());

describe("estimate drawing annotation schema", () => {
  it("accepts every strict normalized discriminator without rewriting text", () => {
    const document = {
      schemaVersion: 1,
      imageWidth: 1000,
      imageHeight: 800,
      elements: [
        { id: "e", type: "ellipse", x: 0.1, y: 0.2, width: 0.3, height: 0.4, color: "#112233", strokeWidth: 1 },
        { id: "r", type: "rectangle", x: 0.2, y: 0.3, width: 0.4, height: 0.5, color: "#223344", strokeWidth: 2 },
        { id: "a", type: "arrow", x1: 0, y1: 0, x2: 1, y2: 1, color: "#334455", strokeWidth: 3 },
        { id: "f", type: "freehand", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#445566", strokeWidth: 4 },
        { id: "t", type: "text", x: 0.5, y: 0.5, text: " keep my spaces ", color: "#556677", strokeWidth: 5 }
      ]
    };

    expect(annotationDocumentSchema.parse(document)).toEqual(document);
  });

  it.each([
    ["coordinate", () => ({ ...annotations(), elements: [{ ...annotations().elements[0], x: 1.01 }] })],
    ["shape extent", () => ({ ...annotations(), elements: [{ id: "r", type: "rectangle", x: 0.8, y: 0, width: 0.3, height: 1, color: "#112233", strokeWidth: 1 }] })],
    ["shape count", () => ({ ...annotations(), elements: Array.from({ length: 201 }, (_, index) => ({ id: `t-${index}`, type: "text", x: 0, y: 0, text: "x", color: "#112233", strokeWidth: 1 })) })],
    ["point count", () => ({ ...annotations(), elements: [{ id: "f", type: "freehand", points: Array.from({ length: 5001 }, () => ({ x: 0.5, y: 0.5 })), color: "#112233", strokeWidth: 1 }] })],
    ["text length", () => ({ ...annotations(), elements: [{ ...annotations().elements[0], text: "x".repeat(501) }] })],
    ["empty text", () => ({ ...annotations(), elements: [{ ...annotations().elements[0], text: "   " }] })],
    ["unknown key", () => ({ ...annotations(), extra: true })],
    ["payload bytes", () => ({ ...annotations(), elements: Array.from({ length: 200 }, (_, index) => ({ id: `t-${index}-${"x".repeat(900)}`, type: "text", x: 0, y: 0, text: "x".repeat(500), color: "#112233", strokeWidth: 1 })) })]
  ])("rejects invalid %s", (_name, build) => {
    expect(annotationDocumentSchema.safeParse(build()).success).toBe(false);
  });
});

describe("estimate drawing client review", () => {
  it("uses the related Client draft identity for a Super Admin client-shaped read", async () => {
    const { app, drafts } = setup();
    drafts.push({
      _id: "annotation-draft-related-client",
      revisionId: "revision-1",
      clientId: "user-client-aurora",
      version: 3,
      annotations: annotations()
    });

    const response = await request(app)
      .get("/api/v1/client/estimates/estimate-1/design-drawings")
      .set("Authorization", auth("user-super-admin", "super_admin"))
      .expect(200);

    expect(response.body.data.revisions).toContainEqual(expect.objectContaining({
      id: "revision-1",
      annotationDraft: expect.objectContaining({
        id: "annotation-draft-related-client",
        version: 3
      })
    }));
    expect(EstimateDesignAnnotationDraftModel.findOne).toHaveBeenCalledWith({
      revisionId: "revision-1",
      clientId: "user-client-aurora"
    });
    expect(EstimateDesignAnnotationDraftModel.findOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "user-super-admin" })
    );
  });

  it("allows Super Admin global Estimate Design reads without project grants", async () => {
    const { app, projectGrantSpies } = setup();
    const authorization = auth("user-super-admin", "super_admin");

    await request(app)
      .get("/api/v1/estimates/estimate-1/design-uploads")
      .set("Authorization", authorization)
      .expect(200);
    await request(app)
      .get("/api/v1/estimate-design-source-pages/page-1/image")
      .set("Authorization", authorization)
      .expect(200);
    await request(app)
      .get("/api/v1/estimate-design-revisions/revision-1/image")
      .set("Authorization", authorization)
      .expect(200);
    await request(app)
      .get("/api/v1/client/estimates/estimate-1/design-drawings")
      .set("Authorization", authorization)
      .expect(200);

    for (const spy of projectGrantSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("exposes submitted drawings only to the exact lead-email client", async () => {
    const { app } = setup();

    const visible = await request(app)
      .get("/api/v1/client/estimates/estimate-1/design-drawings")
      .set("Authorization", auth("user-client-aurora", "client"));
    expect(visible.status).toBe(200);
    expect(visible.body.data.drawings).toHaveLength(2);

    const hidden = await request(app)
      .get("/api/v1/client/estimates/estimate-1/design-drawings")
      .set("Authorization", auth("user-client-celeste", "client"));
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe("ESTIMATE_NOT_FOUND");
  });

  it("builds client drawing metadata from the latest visible revision, not a hidden draft", async () => {
    const { app, pages, drawings, revisions } = setup();
    revisions[1]!.reviewStatus = "changes_requested";
    pages.push({
      _id: "page-hidden-draft",
      uploadId: "upload-hidden",
      pageNumber: 1,
      normalizedFileReference: "hidden.png",
      width: 120,
      height: 90
    });
    revisions.push({
      ...structuredClone(revisions[1]!),
      _id: "revision-hidden-draft",
      revisionNumber: 2,
      sourcePageId: "page-hidden-draft",
      roomId: "room-hidden",
      scopeSectionId: "EL",
      catalogueId: "EL01",
      label: "Hidden draft title",
      reviewStatus: "draft",
      replacesRevisionId: "revision-2"
    });
    Object.assign(drawings[1]!, {
      sourcePageId: "page-hidden-draft",
      roomId: "room-hidden",
      scopeSectionId: "EL",
      catalogueId: "EL01",
      displayTitle: "Hidden draft title",
      verified: false
    });

    const response = await request(app)
      .get("/api/v1/client/estimates/estimate-1/design-drawings")
      .set("Authorization", auth("user-client-aurora", "client"));

    expect(response.status).toBe(200);
    expect(response.body.data.drawings).toContainEqual(expect.objectContaining({
      id: "drawing-2",
      sourcePageId: "page-1",
      roomId: "room-living",
      scopeSectionId: "FC",
      displayTitle: "Living detail",
      verified: false
    }));
    expect(response.body.data.pages).not.toContainEqual(
      expect.objectContaining({ id: "page-hidden-draft" })
    );
  });

  it("exposes a submitted Misc drawing with true-null revision mapping", async () => {
    const { app, drawings, revisions } = setup();
    Object.assign(drawings[0]!, {
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc",
      verified: true
    });
    Object.assign(revisions[0]!, {
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc",
      reviewStatus: "submitted"
    });

    const response = await request(app)
      .get("/api/v1/client/estimates/estimate-1/design-drawings")
      .set("Authorization", auth("user-client-aurora", "client"));

    expect(response.status).toBe(200);
    expect(response.body.data.drawings[0]).toMatchObject({
      roomId: null,
      scopeSectionId: null,
      catalogueId: null,
      mappingStatus: "misc",
      verified: true
    });
    expect(JSON.stringify(response.body.data.drawings[0])).not.toContain(':""');
  });

  it("keeps client verification independent from a visible revision status", async () => {
    const { app, drawings, revisions } = setup();
    drawings[0]!.verified = false;
    revisions[0]!.reviewStatus = "submitted";

    const response = await request(app)
      .get("/api/v1/client/estimates/estimate-1/design-drawings")
      .set("Authorization", auth("user-client-aurora", "client"));

    expect(response.status).toBe(200);
    expect(response.body.data.drawings[0]).toMatchObject({ verified: false });
  });

  it("saves drafts optimistically for clients and forbids estimator writes", async () => {
    const { app, drafts, revisions } = setup();
    const first = await request(app)
      .put("/api/v1/client/estimate-design-revisions/revision-1/annotation-draft")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({ version: 0, annotations: annotations() });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ revisionId: "revision-1", version: 1 });
    expect(revisions[0]!.reviewStatus).toBe("submitted");
    expect(drafts).toHaveLength(1);

    const stale = await request(app)
      .put("/api/v1/client/estimate-design-revisions/revision-1/annotation-draft")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({ version: 0, annotations: annotations() });
    expect(stale.status).toBe(409);

    await request(app)
      .put("/api/v1/client/estimate-design-revisions/revision-1/annotation-draft")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .send({ version: 0, annotations: annotations() })
      .expect(403);
  });

  it("rejects annotation drafts whose dimensions do not match the reviewed crop", async () => {
    const { app, drafts, revisions } = setup();

    const response = await request(app)
      .put("/api/v1/client/estimate-design-revisions/revision-1/annotation-draft")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({
        version: 0,
        annotations: { ...annotations(), imageWidth: 1000 }
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ANNOTATION_DIMENSIONS");
    expect(revisions[0]!.reviewStatus).toBe("submitted");
    expect(drafts).toEqual([]);
  });

  it("does not recreate a draft when the submitted revision locks concurrently", async () => {
    const { app, revisions, drafts } = setup();
    vi.mocked(EstimateDesignRevisionModel.updateOne).mockImplementationOnce(
      async () => {
        revisions[0]!.reviewStatus = "approved";
        return { matchedCount: 0, modifiedCount: 0 } as never;
      }
    );

    const response = await request(app)
      .put("/api/v1/client/estimate-design-revisions/revision-1/annotation-draft")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({ version: 0, annotations: annotations() });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("STALE_ESTIMATE_ANNOTATION");
    expect(drafts).toEqual([]);
  });

  it("rejects a late annotation save after final approval freezes the lifecycle", async () => {
    const { app, estimates, drafts } = setup();
    vi.mocked(EstimateModel.updateOne).mockImplementationOnce(async () => {
      estimates[0]!.status = "client_approved";
      estimates[0]!.designLifecycleVersion = 1;
      estimates[0]!.designFrozenAt = NOW;
      return { matchedCount: 0, modifiedCount: 0 } as never;
    });

    const response = await request(app)
      .put("/api/v1/client/estimate-design-revisions/revision-1/annotation-draft")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({ version: 0, annotations: annotations() });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ESTIMATE_DESIGN_LIFECYCLE_CONFLICT");
    expect(drafts).toEqual([]);
  });

  it("returns not found for guessed hidden draft revision mutations", async () => {
    const { app, revisions } = setup();
    revisions.push({
      ...structuredClone(revisions[0]!),
      _id: "revision-hidden",
      revisionNumber: 2,
      reviewStatus: "draft",
      replacesRevisionId: "revision-1"
    });
    const client = auth("user-client-aurora", "client");
    const attempts = [
      request(app)
        .put("/api/v1/client/estimate-design-revisions/revision-hidden/annotation-draft")
        .set("Authorization", client)
        .send({ version: 0, annotations: annotations() }),
      request(app)
        .post("/api/v1/client/estimate-design-revisions/revision-hidden/decision")
        .set("Authorization", client)
        .send({ version: 2, decision: "approve" }),
      request(app)
        .post("/api/v1/client/estimate-design-revisions/revision-hidden/decision")
        .set("Authorization", client)
        .send({
          version: 2,
          decision: "request_changes",
          summary: "Change it",
          annotations: annotations()
        })
    ];

    for (const attempt of attempts) {
      const response = await attempt;
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("ESTIMATE_NOT_FOUND");
    }
  });

  it("copies a change request into immutable history and updates aggregate state", async () => {
    const { app, drafts, revisions, uploads } = setup();
    await request(app)
      .put("/api/v1/client/estimate-design-revisions/revision-2/annotation-draft")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({ version: 0, annotations: annotations() })
      .expect(200);

    await request(app)
      .post("/api/v1/client/estimate-design-revisions/revision-1/decision")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({ version: 1, decision: "approve" })
      .expect(200);
    const changed = await request(app)
      .post("/api/v1/client/estimate-design-revisions/revision-2/decision")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({
        version: 1,
        decision: "request_changes",
        summary: "Extend the detail.",
        annotations: annotations()
      });

    expect(changed.status).toBe(200);
    expect(revisions[0]).toMatchObject({ reviewStatus: "approved" });
    expect(revisions[1]).toMatchObject({
      reviewStatus: "changes_requested",
      changeSummary: "Extend the detail.",
      annotations: annotations()
    });
    expect(drafts).toEqual([]);
    expect(uploads[0]!.extractionStatus).toBe("changes_requested");

    const ownerView = await request(app)
      .get("/api/v1/estimates/estimate-1/design-uploads")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"));
    expect(ownerView.body.data.revisions).toContainEqual(expect.objectContaining({
      id: "revision-2",
      annotations: annotations()
    }));
  });

  it("rejects change requests whose annotation dimensions do not match the reviewed crop", async () => {
    const { app, drafts, revisions } = setup();

    const response = await request(app)
      .post("/api/v1/client/estimate-design-revisions/revision-1/decision")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({
        version: 1,
        decision: "request_changes",
        summary: "Extend the detail.",
        annotations: { ...annotations(), imageHeight: 800 }
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ANNOTATION_DIMENSIONS");
    expect(revisions[0]).toMatchObject({
      reviewStatus: "submitted",
      changeSummary: null,
      annotations: null
    });
    expect(drafts).toEqual([]);
  });

  it("makes equivalent change-request retries idempotent and conflicts on differences", async () => {
    const { app } = setup();
    const client = auth("user-client-aurora", "client");
    const body = {
      version: 1,
      decision: "request_changes",
      summary: "Extend the detail.",
      annotations: annotations()
    };
    const first = await request(app)
      .post("/api/v1/client/estimate-design-revisions/revision-2/decision")
      .set("Authorization", client)
      .send(body);
    const same = await request(app)
      .post("/api/v1/client/estimate-design-revisions/revision-2/decision")
      .set("Authorization", client)
      .send(body);
    const different = await request(app)
      .post("/api/v1/client/estimate-design-revisions/revision-2/decision")
      .set("Authorization", client)
      .send({ ...body, summary: "A different request." });

    expect(first.status).toBe(200);
    expect(same.status).toBe(200);
    expect(same.body.data).toEqual(first.body.data);
    expect(different.status).toBe(409);
  });

  it("requires a summary and either a marking or text note for change requests", async () => {
    const { app } = setup();
    for (const body of [
      { version: 1, decision: "request_changes", summary: "", annotations: annotations() },
      { version: 1, decision: "request_changes", summary: "Change it", annotations: { ...annotations(), elements: [] } }
    ]) {
      const response = await request(app)
        .post("/api/v1/client/estimate-design-revisions/revision-1/decision")
        .set("Authorization", auth("user-client-aurora", "client"))
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("creates a section-specific draft replacement while preserving approved siblings", async () => {
    const { app, revisions, uploads, jobs } = setup();
    revisions[0]!.reviewStatus = "approved";
    revisions[1]!.reviewStatus = "changes_requested";
    uploads[0]!.extractionStatus = "changes_requested";
    jobs[0]!.status = "changes_requested";

    const response = await request(app)
      .post("/api/v1/estimate-design-drawings/drawing-2/replacement")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .attach("file", PNG, { filename: "replacement.png", contentType: "image/png" })
      .field("version", "1");

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.data.revision).toMatchObject({
      drawingId: "drawing-2",
      revisionNumber: 2,
      roomId: "room-living",
      scopeSectionId: "FC",
      reviewStatus: "draft",
      replacesRevisionId: "revision-2"
    });
    expect(revisions.find((item) => item._id === "revision-1")).toMatchObject({
      reviewStatus: "approved"
    });
    expect(uploads[0]!.extractionStatus).toBe("estimator_review");

    const replacementDrawing = response.body.data;
    const verified = await request(app)
      .patch("/api/v1/estimate-design-drawings/drawing-2")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .send({ version: 2, verified: true });
    expect(verified.status).toBe(200);
    const submitted = await request(app)
      .post("/api/v1/estimates/estimate-1/design-drawings/submit")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .send();
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.submittedCount).toBe(1);
    expect(revisions.find((item) => item._id === "revision-1")).toMatchObject({
      reviewStatus: "approved"
    });
    expect(revisions.find((item) => item._id === replacementDrawing.revision.id))
      .toMatchObject({ reviewStatus: "draft" });
    expect(revisions.filter((item) => item.drawingId === "drawing-2").at(-1))
      .toMatchObject({ revisionNumber: 3, reviewStatus: "submitted" });
  });

  it.each([
    [
      "a mapped tuple",
      {
        roomId: "room-living",
        scopeSectionId: "FC",
        catalogueId: "FC01",
        mappingStatus: "auto_mapped"
      },
      {
        roomId: "room-living",
        scopeSectionId: "FC",
        catalogueId: "FC01",
        mappingStatus: "auto_mapped"
      }
    ],
    [
      "a true-null Misc tuple",
      {
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc"
      },
      {
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc"
      }
    ]
  ] as const)("preserves %s on a synchronous replacement", async (_label, storedMapping, expectedMapping) => {
    const { app, drawings, revisions, uploads, jobs } = setup();
    Object.assign(drawings[1]!, storedMapping);
    Object.assign(revisions[1]!, storedMapping, { reviewStatus: "changes_requested" });
    uploads[0]!.extractionStatus = "changes_requested";
    jobs[0]!.status = "changes_requested";

    const response = await request(app)
      .post("/api/v1/estimate-design-drawings/drawing-2/replacement")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .attach("file", PNG, { filename: "replacement.png", contentType: "image/png" })
      .field("version", "1");

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.data.revision).toMatchObject(expectedMapping);
    const replacement = revisions.filter((item) => item.drawingId === "drawing-2").at(-1)!;
    expect(replacement).toMatchObject(expectedMapping);
    expect(replacement.roomId).not.toBe("null");
    expect(replacement.scopeSectionId).not.toBe("null");
    expect(replacement.catalogueId).not.toBe("null");
  });

  it("rejects synchronous replacement images above the worker-equivalent pixel limit", async () => {
    const { service, revisions, uploads, jobs } = setup();
    revisions[1]!.reviewStatus = "changes_requested";
    uploads[0]!.extractionStatus = "changes_requested";
    jobs[0]!.status = "changes_requested";
    const oversizedTiff = minimalTiff(10_000, 5_000);

    await expect(service.replaceDrawing({
      id: "user-estimator-sales",
      name: "Sales",
      email: "sales@lisno.example",
      role: "estimator_sales"
    }, "drawing-2", {
      version: 1,
      file: {
        data: oversizedTiff,
        extension: ".tif",
        originalFilename: "oversized.tif",
        mimeType: "image/tiff",
        sizeBytes: oversizedTiff.length
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "INVALID_REPLACEMENT_IMAGE"
    });
  });

  it("rejects pathological dimensions even below the total pixel limit", async () => {
    const { service, revisions, uploads, jobs } = setup();
    revisions[1]!.reviewStatus = "changes_requested";
    uploads[0]!.extractionStatus = "changes_requested";
    jobs[0]!.status = "changes_requested";
    const oversizedTiff = minimalTiff(50_000, 1);

    await expect(service.replaceDrawing({
      id: "user-estimator-sales",
      name: "Sales",
      email: "sales@lisno.example",
      role: "estimator_sales"
    }, "drawing-2", {
      version: 1,
      file: {
        data: oversizedTiff,
        extension: ".tif",
        originalFilename: "wide.tif",
        mimeType: "image/tiff",
        sizeBytes: oversizedTiff.length
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "INVALID_REPLACEMENT_IMAGE"
    });
  });

  it("rejects normalized replacement output above the configured byte limit", async () => {
    expect(NOISY_PNG.length).toBeGreaterThan(NOISY_JPEG.length);
    const maximumBytes = Math.floor((NOISY_JPEG.length + NOISY_PNG.length) / 2);
    const { service, revisions, uploads, jobs } = setup(maximumBytes);
    revisions[1]!.reviewStatus = "changes_requested";
    uploads[0]!.extractionStatus = "changes_requested";
    jobs[0]!.status = "changes_requested";

    await expect(service.replaceDrawing({
      id: "user-estimator-sales",
      name: "Sales",
      email: "sales@lisno.example",
      role: "estimator_sales"
    }, "drawing-2", {
      version: 1,
      file: {
        data: NOISY_JPEG,
        extension: ".jpg",
        originalFilename: "noise.jpg",
        mimeType: "image/jpeg",
        sizeBytes: NOISY_JPEG.length
      }
    })).rejects.toMatchObject({
      status: 400,
      code: "INVALID_REPLACEMENT_IMAGE"
    });
  });

  it("reports readiness from active latest revisions", async () => {
    const { service, revisions } = setup();
    revisions[0]!.reviewStatus = "approved";
    revisions[1]!.reviewStatus = "changes_requested";

    await expect(service.approvalReadiness({
      id: "user-client-aurora",
      name: "Aurora",
      email: "client@aurora.example",
      role: "client"
    }, "estimate-1")).resolves.toEqual({
      ready: false,
      total: 2,
      approved: 1,
      awaitingReview: 0,
      changesRequested: 1
    });
  });

  it.each([
    ["PDF", "application/pdf", ".pdf"],
    ["HEIC", "image/heic", ".heic"]
  ] as const)("queues %s replacement decoding without narrowing the upload contract", async (
    _label,
    mimeType,
    extension
  ) => {
    const { service, revisions, uploads, jobs, auditEvents } = setup();
    revisions[1]!.reviewStatus = "changes_requested";
    uploads[0]!.extractionStatus = "changes_requested";
    jobs[0]!.status = "changes_requested";

    const response = await service.replaceDrawing({
      id: "user-estimator-sales",
      name: "Sales",
      email: "sales@lisno.example",
      role: "estimator_sales"
    }, "drawing-2", {
      version: 1,
      file: {
        data: Buffer.from("queued decoder input"),
        extension,
        originalFilename: `replacement${extension}`,
        mimeType,
        sizeBytes: 20
      }
    });

    expect(response).toMatchObject({
      queued: true,
      upload: { extractionStatus: "queued", mimeType }
    });
    expect(revisions).toHaveLength(2);
    expect(revisions[1]!.replacementUploadId).toEqual(expect.any(String));
    expect(uploads.at(-1)).toMatchObject({
      replacementDrawingId: "drawing-2",
      replacesRevisionId: "revision-2",
      extractionStatus: "queued"
    });
    expect(jobs.at(-1)).toMatchObject({ status: "queued" });
    expect(auditEvents).toContainEqual(expect.objectContaining({
      action: "estimate_design_replacement_queued",
      entityId: "estimate-1"
    }));
  });

  it("re-reserves a failed queued replacement so retry can complete the exact rejected revision", async () => {
    const { service, estimates, revisions, uploads, jobs } = setup();
    estimates[0]!.status = "client_changes_requested";
    revisions[1]!.reviewStatus = "changes_requested";
    uploads[0]!.extractionStatus = "changes_requested";
    jobs[0]!.status = "changes_requested";
    const estimator = {
      id: "user-estimator-sales",
      name: "Sales",
      email: "sales@lisno.example",
      role: "estimator_sales" as const
    };

    const queued = await service.replaceDrawing(estimator, "drawing-2", {
      version: 1,
      file: {
        data: Buffer.from("%PDF-1.7 queued replacement"),
        extension: ".pdf",
        originalFilename: "replacement.pdf",
        mimeType: "application/pdf",
        sizeBytes: 27
      }
    });
    const replacementUploadId = String(
      (queued as { upload: { id: string } }).upload.id
    );
    const replacementJob = jobs.find(
      (item) => item.uploadId === replacementUploadId
    )!;
    const firstClaim = await service.claimWorkerJob(
      replacementJob._id,
      "2026-07-30T14:00:01.000Z",
      "2026-07-30T14:05:01.000Z"
    );
    expect(firstClaim).toMatchObject({ id: replacementJob._id });

    await service.failWorkerJob(
      replacementJob._id,
      (firstClaim as { claimId: string }).claimId,
      "2026-07-30T14:00:02.000Z",
      "OCR_FAILED",
      "OCR failed."
    );
    expect(revisions[1]!.replacementUploadId).toBeNull();

    await service.retryUpload(estimator, replacementUploadId);
    expect(revisions[1]!.replacementUploadId).toBe(replacementUploadId);

    const retryClaim = await service.claimWorkerJob(
      replacementJob._id,
      "2026-07-30T14:00:03.000Z",
      "2026-07-30T14:05:03.000Z"
    );
    await service.completeWorkerJob(
      replacementJob._id,
      (retryClaim as { claimId: string }).claimId,
      "2026-07-30T14:00:04.000Z",
      {
        resultId: "replacement-result-after-retry",
        pages: [{
          pageNumber: 1,
          width: 100,
          height: 80,
          imageBase64: PNG.toString("base64"),
          sections: []
        }]
      }
    );

    expect(revisions.filter((item) => item.drawingId === "drawing-2").at(-1))
      .toMatchObject({
        revisionNumber: 2,
        reviewStatus: "draft",
        replacesRevisionId: "revision-2"
      });
    expect(uploads.find((item) => item._id === replacementUploadId))
      .toMatchObject({ extractionStatus: "estimator_review" });
    expect(replacementJob).toMatchObject({ status: "estimator_review" });
  });

  it.each([
    [
      "a mapped tuple",
      {
        roomId: "room-living",
        scopeSectionId: "FC",
        catalogueId: "FC01",
        mappingStatus: "auto_mapped"
      },
      {
        roomId: "room-living",
        scopeSectionId: "FC",
        catalogueId: "FC01",
        mappingStatus: "auto_mapped"
      }
    ],
    [
      "a true-null Misc tuple",
      {
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc"
      },
      {
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc"
      }
    ]
  ] as const)("preserves %s when queued replacement completion creates its revision", async (
    _label,
    storedMapping,
    expectedMapping
  ) => {
    const { service, drawings, revisions, uploads, jobs } = setup();
    Object.assign(drawings[1]!, storedMapping);
    Object.assign(revisions[1]!, storedMapping, { reviewStatus: "changes_requested" });
    uploads[0]!.extractionStatus = "changes_requested";
    jobs[0]!.status = "changes_requested";
    const estimator = {
      id: "user-estimator-sales",
      name: "Sales",
      email: "sales@lisno.example",
      role: "estimator_sales" as const
    };

    const queued = await service.replaceDrawing(estimator, "drawing-2", {
      version: 1,
      file: {
        data: Buffer.from("%PDF-1.7 queued replacement"),
        extension: ".pdf",
        originalFilename: "replacement.pdf",
        mimeType: "application/pdf",
        sizeBytes: 27
      }
    });
    const uploadId = String((queued as { upload: { id: string } }).upload.id);
    const replacementJob = jobs.find((item) => item.uploadId === uploadId)!;
    const claimed = await service.claimWorkerJob(
      replacementJob._id,
      "2026-07-30T14:00:01.000Z",
      "2026-07-30T14:05:01.000Z"
    );
    await service.completeWorkerJob(
      replacementJob._id,
      (claimed as { claimId: string }).claimId,
      "2026-07-30T14:00:02.000Z",
      {
        resultId: "queued-replacement-result",
        pages: [{
          pageNumber: 1,
          width: 100,
          height: 80,
          imageBase64: PNG.toString("base64"),
          sections: []
        }]
      }
    );

    const replacement = revisions.filter((item) => item.drawingId === "drawing-2").at(-1)!;
    expect(replacement).toMatchObject(expectedMapping);
    expect(replacement.roomId).not.toBe("null");
    expect(replacement.scopeSectionId).not.toBe("null");
    expect(replacement.catalogueId).not.toBe("null");
  });

  it("submits both the original aggregate and a queued replacement upload", async () => {
    const { app, drawings, revisions, uploads, jobs, pages } = setup();
    revisions[0]!.reviewStatus = "approved";
    revisions[1]!.reviewStatus = "changes_requested";
    revisions.push({
      ...structuredClone(revisions[1]!),
      _id: "revision-queued-replacement",
      revisionNumber: 2,
      sourcePageId: "page-queued-replacement",
      reviewStatus: "draft",
      submittedAt: null,
      reviewedAt: null,
      reviewerId: null,
      replacesRevisionId: "revision-2"
    });
    pages.push({
      _id: "page-queued-replacement",
      uploadId: "upload-queued-replacement",
      pageNumber: 1,
      normalizedFileReference: "drawing-2.png",
      width: 100,
      height: 80
    });
    drawings[1]!.sourcePageId = "page-queued-replacement";
    drawings[1]!.verified = true;
    uploads[0]!.extractionStatus = "estimator_review";
    jobs[0]!.status = "estimator_review";
    uploads.push({
      ...structuredClone(uploads[0]!),
      _id: "upload-queued-replacement",
      extractionStatus: "estimator_review",
      replacementDrawingId: "drawing-2",
      replacesRevisionId: "revision-2",
      replacementVersion: 1
    });
    jobs.push({
      ...structuredClone(jobs[0]!),
      _id: "job-queued-replacement",
      uploadId: "upload-queued-replacement",
      status: "estimator_review"
    });

    const response = await request(app)
      .post("/api/v1/estimates/estimate-1/design-drawings/submit")
      .set("Authorization", auth("user-estimator-sales", "estimator_sales"))
      .send();

    expect(response.status).toBe(200);
    expect(response.body.data.submittedCount).toBe(1);
    expect(uploads.map((upload) => upload.extractionStatus)).toEqual([
      "submitted",
      "submitted"
    ]);
    expect(jobs.map((job) => job.status)).toEqual(["submitted", "submitted"]);
  });
});
