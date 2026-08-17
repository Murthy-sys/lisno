import { Readable } from "node:stream";

import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { SeedData } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

const SECRET = "design-section-test-secret-at-least-32-characters";
const NOW = "2026-07-27T10:00:00.000Z";
const PAGE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwYMEAoAU7oL9W/sIDEAAAAASUVORK5CYII=",
  "base64"
);

class TestStorage {
  readonly objects = new Map<string, Buffer>([["page.png", PAGE_PNG]]);
  readonly opened: string[] = [];
  private next = 0;
  async save(input: { data: Buffer; extension: string }) {
    return this.saveGenerated(input);
  }
  async saveGenerated(input: { data: Buffer; extension: string }) {
    const reference = `generated-${++this.next}${input.extension}`;
    this.objects.set(reference, Buffer.from(input.data));
    return { reference };
  }
  async read(reference: string) {
    const value = this.objects.get(reference);
    if (!value) throw new Error("missing");
    return Buffer.from(value);
  }
  async open(reference: string) {
    this.opened.push(reference);
    return Readable.from(await this.read(reference));
  }
  async delete(reference: string) {
    this.objects.delete(reference);
  }
}

function token(id: string, role: string) {
  return jwt.sign({ id, role }, SECRET, { expiresIn: 900 });
}

function sectionSeed(status: "designer_review" | "processing_failed" = "designer_review"): SeedData {
  const seed = structuredClone(demoSeedData);
  seed.users.push({
    ...structuredClone(seed.users[0]!),
    id: "user-super-admin",
    name: "Super Admin",
    email: "super-admin@lisno.example",
    emailNormalized: "super-admin@lisno.example",
    role: "super_admin",
    managerId: null,
    authorizedClientIds: []
  });
  seed.projectAccessGrants.push({
    id: "grant-vikram-aurora-design-sections",
    projectId: "project-aurora-villa",
    userId: "user-designer-vikram",
    module: "design",
    source: "access_request",
    accessRequestId: "request-vikram-aurora-design-sections",
    grantedById: "user-super-admin",
    active: true,
    grantedAt: NOW,
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW
  });
  seed.extractionJobs.push({
    id: "job-review",
    designVersionId: "version-aurora-plan-1",
    status,
    attemptCount: 1,
    queuedAt: NOW,
    nextAttemptAt: status === "queued" ? NOW : null,
    claimGeneration: 1,
    startedAt: NOW,
    completedAt: NOW,
    leaseExpiresAt: null,
    failureCode: status === "processing_failed" ? "OCR_FAILED" : null,
    failureMessage: status === "processing_failed" ? "Could not read labels." : null,
    claimId: null,
    workerResultId: "result-1",
    createdAt: NOW,
    updatedAt: NOW
  });
  seed.sourcePages.push({
    id: "page-1",
    designVersionId: "version-aurora-plan-1",
    pageNumber: 1,
    renderedFileReference: "page.png",
    width: 2,
    height: 2,
    createdAt: NOW,
    updatedAt: NOW
  });
  seed.designSections.push({
    id: "section-1",
    designVersionId: "version-aurora-plan-1",
    sourcePageId: "page-1",
    label: "Elevation",
    active: true,
    source: "ocr",
    ocrConfidence: 0.8,
    createdAt: NOW,
    updatedAt: NOW
  });
  seed.designSectionRevisions.push({
    id: "revision-1",
    sectionId: "section-1",
    revisionNumber: 1,
    sourcePageId: "page-1",
    crop: { x: 0, y: 0, width: 1, height: 1 },
    croppedFileReference: "page.png",
    label: "Elevation",
    reviewStatus: "draft",
    submittedAt: null,
    reviewerId: null,
    reviewedAt: null,
    rejectionComment: null,
    createdAt: NOW
  });
  return seed;
}

describe("Design Section operations", () => {
  it("lets Super Admin read draft sections and their images without mutation", async () => {
    const { app, repository, storage } = setup();
    const beforeSections = await repository.listDesignSections("version-aurora-plan-1");
    const beforeJob = await repository.findExtractionJobByVersionId("version-aurora-plan-1");
    const superAdmin = `Bearer ${token("user-super-admin", "super_admin")}`;

    const drafts = await request(app)
      .get("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", superAdmin);
    const page = await request(app)
      .get("/api/v1/design-source-pages/page-1/image")
      .set("Authorization", superAdmin);
    const revision = await request(app)
      .get("/api/v1/design-section-revisions/revision-1/image")
      .set("Authorization", superAdmin);

    expect(drafts.status).toBe(200);
    expect(drafts.body.data.sections).toEqual([
      expect.objectContaining({ id: "section-1" })
    ]);
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toMatch(/^image\/png/);
    expect(revision.status).toBe(200);
    expect(revision.headers["content-type"]).toMatch(/^image\/png/);
    expect(storage.opened).toEqual(["page.png", "page.png"]);
    expect(await repository.listDesignSections("version-aurora-plan-1"))
      .toEqual(beforeSections);
    expect(await repository.findExtractionJobByVersionId("version-aurora-plan-1"))
      .toEqual(beforeJob);
  });

  it("denies every Super Admin draft mutation before handler state changes", async () => {
    const { app, repository, storage } = setup("processing_failed");
    const superAdmin = `Bearer ${token("user-super-admin", "super_admin")}`;
    const beforeSections = await repository.listDesignSections("version-aurora-plan-1");
    const beforeRevisions = await repository.listSectionRevisions("section-1");
    const beforeJob = await repository.findExtractionJobByVersionId("version-aurora-plan-1");
    const beforeObjects = new Map(storage.objects);

    await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", superAdmin)
      .send({
        sourcePageId: "page-1",
        label: "Kitchen",
        crop: { x: 0, y: 0, width: 1, height: 1 }
      })
      .expect(403);
    await request(app)
      .patch("/api/v1/design-sections/section-1")
      .set("Authorization", superAdmin)
      .send({ version: 1, label: "Updated kitchen" })
      .expect(403);
    await request(app)
      .delete("/api/v1/design-sections/section-1")
      .set("Authorization", superAdmin)
      .send({ version: 1 })
      .expect(403);
    await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/retry-extraction")
      .set("Authorization", superAdmin)
      .expect(403);
    await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/submit-sections")
      .set("Authorization", superAdmin)
      .expect(403);

    expect(await repository.listDesignSections("version-aurora-plan-1"))
      .toEqual(beforeSections);
    expect(await repository.listSectionRevisions("section-1"))
      .toEqual(beforeRevisions);
    expect(await repository.findExtractionJobByVersionId("version-aurora-plan-1"))
      .toEqual(beforeJob);
    expect(storage.objects).toEqual(beforeObjects);
  });

  it("does not let a Design grant replace draft ownership", async () => {
    const { app, repository, storage } = setup("processing_failed");
    const grantedDesigner = `Bearer ${token("user-designer-vikram", "designer")}`;
    const beforeSections = await repository.listDesignSections("version-aurora-plan-1");
    const beforeRevisions = await repository.listSectionRevisions("section-1");
    const beforeJob = await repository.findExtractionJobByVersionId("version-aurora-plan-1");
    const beforeObjects = new Map(storage.objects);

    await request(app)
      .get("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", grantedDesigner)
      .expect(404);
    await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", grantedDesigner)
      .send({
        sourcePageId: "page-1",
        label: "Kitchen",
        crop: { x: 0, y: 0, width: 1, height: 1 }
      })
      .expect(404);
    await request(app)
      .patch("/api/v1/design-sections/section-1")
      .set("Authorization", grantedDesigner)
      .send({ version: 1, label: "Updated kitchen" })
      .expect(404);
    await request(app)
      .delete("/api/v1/design-sections/section-1")
      .set("Authorization", grantedDesigner)
      .send({ version: 1 })
      .expect(404);
    await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/retry-extraction")
      .set("Authorization", grantedDesigner)
      .expect(404);
    await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/submit-sections")
      .set("Authorization", grantedDesigner)
      .expect(404);

    expect(await repository.listDesignSections("version-aurora-plan-1"))
      .toEqual(beforeSections);
    expect(await repository.listSectionRevisions("section-1"))
      .toEqual(beforeRevisions);
    expect(await repository.findExtractionJobByVersionId("version-aurora-plan-1"))
      .toEqual(beforeJob);
    expect(storage.objects).toEqual(beforeObjects);
  });
});

function setup(status?: "designer_review" | "processing_failed") {
  const repository = createMemoryRepository(sectionSeed(status));
  const storage = new TestStorage();
  const app = createApp({
    repository,
    storage,
    auth: { jwtSecret: SECRET, jwtExpiresInSeconds: 900 },
    clock: () => new Date(NOW)
  });
  return { app, repository, storage };
}

function setupRejected() {
  const seed = sectionSeed();
  seed.extractionJobs[0]!.status = "changes_requested";
  seed.designSectionRevisions[0] = {
    ...seed.designSectionRevisions[0]!,
    reviewStatus: "rejected",
    submittedAt: NOW,
    reviewerId: "user-client-aurora",
    reviewedAt: NOW,
    rejectionComment: "Move the crop to include the full facade."
  };
  const repository = createMemoryRepository(seed);
  const storage = new TestStorage();
  return {
    repository,
    storage,
    app: createApp({
      repository,
      storage,
      auth: { jwtSecret: SECRET, jwtExpiresInSeconds: 900 },
      clock: () => new Date(NOW)
    })
  };
}

describe("designer section correction", () => {
  it("shows drafts only to the task-owning designer", async () => {
    const { app } = setup();
    const owner = await request(app)
      .get("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", `Bearer ${token("user-designer-ananya", "designer")}`)
      .expect(200);
    expect(owner.body.data.sections).toHaveLength(1);
    expect(owner.body.data.pages).toHaveLength(1);

    await request(app)
      .get("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", `Bearer ${token("user-designer-kabir", "designer")}`)
      .expect(404);
    await request(app)
      .get("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", `Bearer ${token("user-client-aurora", "client")}`)
      .expect(403);
  });

  it("renames and recrops with optimistic versioning and appends an audit event", async () => {
    const { app, repository, storage } = setup();
    const response = await request(app)
      .patch("/api/v1/design-sections/section-1")
      .set("Authorization", `Bearer ${token("user-designer-ananya", "designer")}`)
      .send({ version: 1, label: "Front Elevation", crop: { x: 1, y: 0, width: 1, height: 2 } })
      .expect(200);

    expect(response.body.data).toMatchObject({
      label: "Front Elevation",
      revision: { revisionNumber: 2, reviewStatus: "draft" }
    });
    expect(response.body.data.revision.imageReference).toBe(
      `/api/v1/design-section-revisions/${response.body.data.revision.id}/image`
    );
    expect(storage.objects.size).toBe(2);
    expect(await repository.listAuditEvents({ entityIds: ["section-1"] })).toEqual([
      expect.objectContaining({ action: "design_section_edited" })
    ]);

    await request(app)
      .patch("/api/v1/design-sections/section-1")
      .set("Authorization", `Bearer ${token("user-designer-ananya", "designer")}`)
      .send({ version: 1, label: "Stale" })
      .expect(409);
  });

  it("rejects non-integer and out-of-page crop coordinates", async () => {
    const { app } = setup();
    const auth = `Bearer ${token("user-designer-ananya", "designer")}`;
    await request(app)
      .patch("/api/v1/design-sections/section-1")
      .set("Authorization", auth)
      .send({ version: 1, crop: { x: 1, y: 1, width: 2, height: 1 } })
      .expect(400);
    await request(app)
      .patch("/api/v1/design-sections/section-1")
      .set("Authorization", auth)
      .send({ version: 1, crop: { x: 0.5, y: 0, width: 1, height: 1 } })
      .expect(400);
  });

  it("adds a missing section and removes a false detection with audit records", async () => {
    const { app, repository } = setup();
    const auth = `Bearer ${token("user-designer-ananya", "designer")}`;
    const added = await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", auth)
      .send({ sourcePageId: "page-1", label: "Kitchen", crop: { x: 0, y: 0, width: 2, height: 1 } })
      .expect(201);
    await request(app)
      .delete("/api/v1/design-sections/section-1")
      .set("Authorization", auth)
      .send({ version: 1 })
      .expect(200);

    expect(added.body.data).toMatchObject({ label: "Kitchen", source: "manual" });
    expect((await repository.listDesignSections("version-aurora-plan-1")).find((item) => item.id === "section-1")?.active).toBe(false);
    expect((await repository.listAuditEvents({})).map((event) => event.action)).toEqual(
      expect.arrayContaining(["design_section_created", "design_section_removed"])
    );
  });

  it("retries failed extraction and audits the transition", async () => {
    const { app, repository } = setup("processing_failed");
    await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/retry-extraction")
      .set("Authorization", `Bearer ${token("user-designer-ananya", "designer")}`)
      .expect(200);
    expect(await repository.findExtractionJobByVersionId("version-aurora-plan-1")).toMatchObject({
      status: "queued",
      failureCode: null,
      failureMessage: null
    });
    expect((await repository.listAuditEvents({})).some((event) => event.action === "design_extraction_retried")).toBe(true);
  });

  it("replaces a rejected section with a new draft while retaining its history", async () => {
    const { app, repository } = setupRejected();
    const replaced = await request(app)
      .patch("/api/v1/design-sections/section-1")
      .set("Authorization", `Bearer ${token("user-designer-ananya", "designer")}`)
      .send({ version: 1, crop: { x: 0, y: 1, width: 2, height: 1 } })
      .expect(200);

    expect(replaced.body.data.revision).toMatchObject({
      revisionNumber: 2,
      reviewStatus: "draft"
    });
    expect(await repository.listSectionRevisions("section-1")).toHaveLength(2);
    expect((await repository.listAuditEvents({ entityIds: ["section-1"] })).at(-1)).toMatchObject({
      action: "design_section_replaced"
    });
  });

  it("preserves approved sections and submits only a rejected section replacement", async () => {
    const seed = sectionSeed();
    seed.extractionJobs[0]!.status = "changes_requested";
    seed.designSectionRevisions[0] = {
      ...seed.designSectionRevisions[0]!,
      reviewStatus: "rejected",
      submittedAt: NOW,
      reviewerId: "user-client-aurora",
      reviewedAt: NOW,
      rejectionComment: "Include the complete elevation."
    };
    seed.designSections.push({
      ...seed.designSections[0]!,
      id: "section-approved",
      label: "Approved Plan"
    });
    seed.designSectionRevisions.push({
      ...seed.designSectionRevisions[0]!,
      id: "revision-approved",
      sectionId: "section-approved",
      label: "Approved Plan",
      reviewStatus: "approved",
      rejectionComment: null
    });
    const repository = createMemoryRepository(seed);
    const storage = new TestStorage();
    const app = createApp({
      repository,
      storage,
      auth: { jwtSecret: SECRET, jwtExpiresInSeconds: 900 },
      clock: () => new Date(NOW)
    });
    const auth = `Bearer ${token("user-designer-ananya", "designer")}`;

    await request(app)
      .patch("/api/v1/design-sections/section-1")
      .set("Authorization", auth)
      .send({ version: 1, crop: { x: 0, y: 1, width: 2, height: 1 } })
      .expect(200);
    const submitted = await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/submit-sections")
      .set("Authorization", auth)
      .expect(200);

    expect(submitted.body.data).toEqual({
      extractionStatus: "submitted",
      submittedCount: 1
    });
    expect((await repository.listSectionRevisions("section-approved")).at(-1)).toMatchObject({
      reviewStatus: "approved",
      revisionNumber: 1
    });
    expect((await repository.listSectionRevisions("section-1")).at(-1)).toMatchObject({
      reviewStatus: "submitted",
      revisionNumber: 2
    });
  });

  it("allows one concurrent same-version edit and returns a documented conflict for the loser", async () => {
    const { app, repository, storage } = setup();
    const auth = `Bearer ${token("user-designer-ananya", "designer")}`;
    const [first, second] = await Promise.all([
      request(app)
        .patch("/api/v1/design-sections/section-1")
        .set("Authorization", auth)
        .send({ version: 1, crop: { x: 0, y: 0, width: 2, height: 1 } }),
      request(app)
        .patch("/api/v1/design-sections/section-1")
        .set("Authorization", auth)
        .send({ version: 1, crop: { x: 0, y: 1, width: 2, height: 1 } })
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body.error.code).toBe("STALE_SECTION_VERSION");
    expect(await repository.listSectionRevisions("section-1")).toHaveLength(2);
    expect(storage.objects.size).toBe(2);
  });

  it("rolls back a failed edit transaction and removes its uncommitted crop artifact", async () => {
    const base = createMemoryRepository(sectionSeed());
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        if (property !== "runInTransaction") return Reflect.get(target, property, receiver);
        return async (operation: (transaction: typeof base) => Promise<unknown>) =>
          target.runInTransaction((transaction) =>
            operation(new Proxy(transaction, {
              get(transactionTarget, transactionProperty, transactionReceiver) {
                if (transactionProperty === "appendAuditEvent") {
                  return async () => {
                    throw new Error("forced audit failure");
                  };
                }
                return Reflect.get(transactionTarget, transactionProperty, transactionReceiver);
              }
            }))
          );
      }
    });
    const storage = new TestStorage();
    const app = createApp({
      repository,
      storage,
      auth: { jwtSecret: SECRET, jwtExpiresInSeconds: 900 },
      clock: () => new Date(NOW)
    });

    await request(app)
      .patch("/api/v1/design-sections/section-1")
      .set("Authorization", `Bearer ${token("user-designer-ananya", "designer")}`)
      .send({ version: 1, crop: { x: 0, y: 1, width: 2, height: 1 } })
      .expect(500);

    expect(await base.listSectionRevisions("section-1")).toHaveLength(1);
    expect(storage.objects.size).toBe(1);
  });

  it("supports manual recovery after OCR failure and then submits the manual section", async () => {
    const { app, repository } = setup("processing_failed");
    const auth = `Bearer ${token("user-designer-ananya", "designer")}`;

    const added = await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", auth)
      .send({ sourcePageId: "page-1", label: "Manual Elevation", crop: { x: 0, y: 0, width: 2, height: 2 } })
      .expect(201);
    expect(added.body.data.label).toBe("Manual Elevation");
    expect(await repository.findExtractionJobByVersionId("version-aurora-plan-1")).toMatchObject({
      status: "designer_review",
      failureCode: null,
      failureMessage: null
    });

    const submitted = await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/submit-sections")
      .set("Authorization", auth)
      .expect(200);
    expect(submitted.body.data).toMatchObject({
      extractionStatus: "submitted",
      submittedCount: 2
    });
  });

  it("rejects submission with no active sections and submits all active drafts atomically", async () => {
    const empty = setup();
    const auth = `Bearer ${token("user-designer-ananya", "designer")}`;
    await request(empty.app)
      .delete("/api/v1/design-sections/section-1")
      .set("Authorization", auth)
      .send({ version: 1 })
      .expect(200);
    await request(empty.app)
      .post("/api/v1/design-versions/version-aurora-plan-1/submit-sections")
      .set("Authorization", auth)
      .expect(400);

    const success = setup();
    await request(success.app)
      .post("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", auth)
      .send({ sourcePageId: "page-1", label: "Kitchen", crop: { x: 0, y: 0, width: 1, height: 2 } })
      .expect(201);
    const submitted = await request(success.app)
      .post("/api/v1/design-versions/version-aurora-plan-1/submit-sections")
      .set("Authorization", auth)
      .expect(200);
    expect(submitted.body.data).toEqual({
      extractionStatus: "submitted",
      submittedCount: 2
    });
    expect((await success.repository.listAuditEvents({})).some((event) => event.action === "design_sections_submitted")).toBe(true);
  });

  it("serves page and crop artifacts only to the owning designer before submission", async () => {
    const { app } = setup();
    const owner = `Bearer ${token("user-designer-ananya", "designer")}`;
    await request(app)
      .get("/api/v1/design-source-pages/page-1/image")
      .set("Authorization", owner)
      .expect(200);
    await request(app)
      .get("/api/v1/design-section-revisions/revision-1/image")
      .set("Authorization", `Bearer ${token("user-client-aurora", "client")}`)
      .expect(404);

    await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/submit-sections")
      .set("Authorization", owner)
      .expect(200);
    await request(app)
      .get("/api/v1/design-source-pages/page-1/image")
      .set("Authorization", `Bearer ${token("user-client-aurora", "client")}`)
      .expect(200);
    await request(app)
      .get("/api/v1/design-section-revisions/revision-1/image")
      .set("Authorization", `Bearer ${token("user-client-aurora", "client")}`)
      .expect(200);
    await request(app)
      .get("/api/v1/design-section-revisions/revision-1/image")
      .set("Authorization", `Bearer ${token("user-client-celeste", "client")}`)
      .expect(404);
  });
});
