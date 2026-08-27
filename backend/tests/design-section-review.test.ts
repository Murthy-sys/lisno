import { Readable } from "node:stream";

import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp as createApplication } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { SeedData } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { developmentDemoAuthentication } from "./helpers/development-demo-authentication.js";

const createApp = (dependencies: Parameters<typeof createApplication>[0]) =>
  createApplication({
    ...dependencies,
    developmentDemoAuthorization: developmentDemoAuthentication()
  });

const SECRET = "design-review-test-secret-at-least-32-characters";
const NOW = "2026-07-27T10:00:00.000Z";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwYMEAoAU7oL9W/sIDEAAAAASUVORK5CYII=",
  "base64"
);

class TestStorage {
  readonly objects = new Map<string, Buffer>([["page.png", PNG]]);
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

function reviewSeed(): SeedData {
  const seed = structuredClone(demoSeedData);
  seed.extractionJobs.push({
    id: "job-review",
    designVersionId: "version-aurora-plan-1",
    status: "submitted",
    attemptCount: 1,
    queuedAt: NOW,
    nextAttemptAt: null,
    claimGeneration: 1,
    startedAt: NOW,
    completedAt: NOW,
    leaseExpiresAt: null,
    failureCode: null,
    failureMessage: null,
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
  for (const [index, label] of ["Elevation", "Floor Plan"].entries()) {
    const number = index + 1;
    seed.designSections.push({
      id: `section-${number}`,
      designVersionId: "version-aurora-plan-1",
      sourcePageId: "page-1",
      label,
      active: true,
      source: "ocr",
      ocrConfidence: 0.9,
      createdAt: NOW,
      updatedAt: NOW
    });
    seed.designSectionRevisions.push({
      id: `revision-${number}`,
      sectionId: `section-${number}`,
      revisionNumber: 1,
      sourcePageId: "page-1",
      crop: { x: index, y: 0, width: 1, height: 1 },
      croppedFileReference: "page.png",
      label,
      reviewStatus: "submitted",
      submittedAt: NOW,
      reviewerId: null,
      reviewedAt: null,
      rejectionComment: null,
      createdAt: NOW
    });
  }
  return seed;
}

function setup(seed = reviewSeed()) {
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

const auth = (id: string, role: string) => `Bearer ${token(id, role)}`;

describe("Design Section operations", () => {
  it("gives Super Admin client-safe section and submitted-image reads", async () => {
    const { app, repository, storage } = setup();
    const superAdmin = auth("user-super-admin", "super_admin");
    const beforeRevision = await repository.findSectionRevisionById("revision-1");

    const review = await request(app)
      .get("/api/v1/client/projects/project-aurora-villa/design-sections")
      .set("Authorization", superAdmin);
    const page = await request(app)
      .get("/api/v1/design-source-pages/page-1/image")
      .set("Authorization", superAdmin);
    const revision = await request(app)
      .get("/api/v1/design-section-revisions/revision-1/image")
      .set("Authorization", superAdmin);

    expect(review.status).toBe(200);
    expect(review.body.data.sections).toHaveLength(2);
    expect(review.body.data.sections.every(
      (section: { revision: { reviewStatus: string } }) =>
        section.revision.reviewStatus !== "draft"
    )).toBe(true);
    expect(JSON.stringify(review.body)).not.toContain("croppedFileReference");
    expect(page.status).toBe(200);
    expect(page.headers["content-type"]).toMatch(/^image\/png/);
    expect(revision.status).toBe(200);
    expect(revision.headers["content-type"]).toMatch(/^image\/png/);
    expect(storage.opened).toEqual(["page.png", "page.png"]);
    expect(await repository.findSectionRevisionById("revision-1"))
      .toEqual(beforeRevision);
  });

  it("denies Super Admin client decision before revision state changes", async () => {
    const { app, repository } = setup();
    const before = await repository.findSectionRevisionById("revision-1");

    await request(app)
      .post("/api/v1/design-section-revisions/revision-1/decision")
      .set("Authorization", auth("user-super-admin", "super_admin"))
      .send({ version: 1, decision: "approved", comment: "Looks good" })
      .expect(403);

    expect(await repository.findSectionRevisionById("revision-1")).toEqual(before);
  });

  it("preserves linked Client success for rows 36 through 39", async () => {
    const { app, repository } = setup();
    const client = auth("user-client-aurora", "client");

    const review = await request(app)
      .get("/api/v1/client/projects/project-aurora-villa/design-sections")
      .set("Authorization", client);
    const decision = await request(app)
      .post("/api/v1/design-section-revisions/revision-1/decision")
      .set("Authorization", client)
      .send({ version: 1, decision: "approved", comment: "Looks good" });
    const page = await request(app)
      .get("/api/v1/design-source-pages/page-1/image")
      .set("Authorization", client);
    const revision = await request(app)
      .get("/api/v1/design-section-revisions/revision-1/image")
      .set("Authorization", client);

    expect(review.status).toBe(200);
    expect(review.body.data.sections).toHaveLength(2);
    expect(decision.status).toBe(200);
    expect(page.status).toBe(200);
    expect(revision.status).toBe(200);
    expect(await repository.findSectionRevisionById("revision-1"))
      .toMatchObject({ reviewStatus: "approved", reviewerId: "user-client-aurora" });
  });
});

describe("client design section review", () => {
  it("lists only submitted review material for the linked Client", async () => {
    const { app } = setup();
    const response = await request(app)
      .get("/api/v1/client/projects/project-aurora-villa/design-sections")
      .set("Authorization", auth("user-client-aurora", "client"))
      .expect(200);

    expect(response.body.data).toMatchObject({
      projectId: "project-aurora-villa",
      progress: { approved: 0, rejected: 0, awaitingReview: 2, total: 2 }
    });
    expect(response.body.data.sections).toHaveLength(2);
    expect(response.body.data.sections[0].sourcePageUrl)
      .toBe("/api/v1/design-source-pages/page-1/image");
    expect(response.body.data.sections[0].revision).not.toHaveProperty("croppedFileReference");

    await request(app)
      .get("/api/v1/client/projects/project-aurora-villa/design-sections")
      .set("Authorization", auth("user-manager-aarav", "design_manager"))
      .expect(403);
    await request(app)
      .get("/api/v1/client/projects/project-aurora-villa/design-sections")
      .set("Authorization", auth("user-head", "design_head"))
      .expect(403);
    await request(app)
      .get("/api/v1/client/projects/project-aurora-villa/design-sections")
      .set("Authorization", auth("user-client-celeste", "client"))
      .expect(404);
  });

  it("lets only the owning designer reload submitted sections and comments", async () => {
    const seed = reviewSeed();
    seed.designSectionRevisions[0] = {
      ...seed.designSectionRevisions[0]!,
      reviewStatus: "rejected",
      reviewerId: "user-client-aurora",
      reviewedAt: NOW,
      rejectionComment: "Show the full roof line."
    };
    seed.extractionJobs[0]!.status = "changes_requested";
    const { app } = setup(seed);

    const response = await request(app)
      .get("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", auth("user-designer-ananya", "designer"))
      .expect(200);
    expect(response.body.data.sections[0].revision).toMatchObject({
      reviewStatus: "rejected",
      rejectionComment: "Show the full roof line."
    });
    expect(response.body.data.sections[0].history).toEqual([
      expect.objectContaining({
        reviewStatus: "rejected",
        rejectionComment: "Show the full roof line."
      })
    ]);

    await request(app)
      .get("/api/v1/design-versions/version-aurora-plan-1/sections")
      .set("Authorization", auth("user-designer-vikram", "designer"))
      .expect(404);
  });

  it("allows only the assigned property client to decide", async () => {
    const identities = [
      ["user-designer-ananya", "designer", 403],
      ["user-manager-aarav", "design_manager", 403],
      ["user-head", "design_head", 403],
      ["user-client-celeste", "client", 404]
    ] as const;

    for (const [id, role, status] of identities) {
      const { app } = setup();
      await request(app)
        .post("/api/v1/design-section-revisions/revision-1/decision")
        .set("Authorization", auth(id, role))
        .send({ version: 1, decision: "approved" })
        .expect(status);
    }
  });

  it("requires a trimmed rejection comment with the documented field error", async () => {
    const { app } = setup();
    for (const comment of [undefined, "", "   "]) {
      const response = await request(app)
        .post("/api/v1/design-section-revisions/revision-1/decision")
        .set("Authorization", auth("user-client-aurora", "client"))
        .send({ version: 1, decision: "rejected", ...(comment === undefined ? {} : { comment }) })
        .expect(400);
      expect(response.body).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "A rejection comment is required.",
          fields: { comment: "Explain what the designer should modify." }
        }
      });
    }
  });

  it("trims rejection comments before enforcing the 1000-character limit", async () => {
    const accepted = setup();
    await request(accepted.app)
      .post("/api/v1/design-section-revisions/revision-1/decision")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({ version: 1, decision: "rejected", comment: ` ${"x".repeat(1000)} ` })
      .expect(200);
    expect(await accepted.repository.findSectionRevisionById("revision-1")).toMatchObject({
      rejectionComment: "x".repeat(1000)
    });

    const rejected = setup();
    const response = await request(rejected.app)
      .post("/api/v1/design-section-revisions/revision-1/decision")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({ version: 1, decision: "rejected", comment: ` ${"x".repeat(1001)} ` })
      .expect(400);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { comment: expect.any(String) }
    });
  });

  it("approves idempotently, rejects stale decisions, and keeps approved revisions immutable", async () => {
    const { app, repository } = setup();
    const client = auth("user-client-aurora", "client");
    const first = await request(app)
      .post("/api/v1/design-section-revisions/revision-1/decision")
      .set("Authorization", client)
      .send({ version: 1, decision: "approved" })
      .expect(200);
    const duplicate = await request(app)
      .post("/api/v1/design-section-revisions/revision-1/decision")
      .set("Authorization", client)
      .send({ version: 1, decision: "approved" })
      .expect(200);

    expect(duplicate.body.data).toEqual(first.body.data);
    expect((await repository.listAuditEvents({ entityIds: ["revision-1"] }))).toHaveLength(1);

    const immutable = await request(app)
      .post("/api/v1/design-section-revisions/revision-1/decision")
      .set("Authorization", client)
      .send({ version: 1, decision: "rejected", comment: "Change it." })
      .expect(409);
    expect(immutable.body.error.code).toBe("SECTION_REVISION_LOCKED");

    const stale = await request(app)
      .post("/api/v1/design-section-revisions/revision-2/decision")
      .set("Authorization", client)
      .send({ version: 2, decision: "approved" })
      .expect(409);
    expect(stale.body.error.code).toBe("STALE_SECTION_VERSION");
  });

  it("commits only one of two concurrent conflicting decisions", async () => {
    const { app, repository } = setup();
    const client = auth("user-client-aurora", "client");
    const [approve, reject] = await Promise.all([
      request(app)
        .post("/api/v1/design-section-revisions/revision-1/decision")
        .set("Authorization", client)
        .send({ version: 1, decision: "approved" }),
      request(app)
        .post("/api/v1/design-section-revisions/revision-1/decision")
        .set("Authorization", client)
        .send({ version: 1, decision: "rejected", comment: "Show the complete facade." })
    ]);

    expect([approve.status, reject.status].sort()).toEqual([200, 409]);
    expect(["approved", "rejected"]).toContain(
      (await repository.findSectionRevisionById("revision-1"))?.reviewStatus
    );
    expect(await repository.listAuditEvents({ entityIds: ["revision-1"] })).toHaveLength(1);
  });

  it("moves aggregate status through changes requested and approved after replacement", async () => {
    const { app, repository } = setup();
    const client = auth("user-client-aurora", "client");
    await request(app)
      .post("/api/v1/design-section-revisions/revision-1/decision")
      .set("Authorization", client)
      .send({ version: 1, decision: "approved" })
      .expect(200);
    const rejected = await request(app)
      .post("/api/v1/design-section-revisions/revision-2/decision")
      .set("Authorization", client)
      .send({ version: 1, decision: "rejected", comment: " Include the room dimensions. " })
      .expect(200);

    expect(rejected.body.data.progress).toEqual({
      approved: 1,
      rejected: 1,
      awaitingReview: 0,
      total: 2
    });
    expect(rejected.body.data.extractionStatus).toBe("changes_requested");
    expect(await repository.findSectionRevisionById("revision-2")).toMatchObject({
      reviewStatus: "rejected",
      reviewerId: "user-client-aurora",
      rejectionComment: "Include the room dimensions."
    });

    const designer = auth("user-designer-ananya", "designer");
    const replacement = await request(app)
      .patch("/api/v1/design-sections/section-2")
      .set("Authorization", designer)
      .send({ version: 1, crop: { x: 0, y: 1, width: 2, height: 1 } })
      .expect(200);
    await request(app)
      .post("/api/v1/design-versions/version-aurora-plan-1/submit-sections")
      .set("Authorization", designer)
      .expect(200);
    const approved = await request(app)
      .post(`/api/v1/design-section-revisions/${replacement.body.data.revision.id}/decision`)
      .set("Authorization", client)
      .send({ version: 2, decision: "approved" })
      .expect(200);

    expect(approved.body.data).toMatchObject({
      extractionStatus: "approved",
      progress: { approved: 2, rejected: 0, awaitingReview: 0, total: 2 }
    });
    expect(await repository.findSectionRevisionById("revision-1")).toMatchObject({
      reviewStatus: "approved",
      revisionNumber: 1
    });
  });

  it("rolls back the decision and aggregate transition when audit persistence fails", async () => {
    const base = createMemoryRepository(reviewSeed());
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
    const app = createApp({
      repository,
      storage: new TestStorage(),
      auth: { jwtSecret: SECRET, jwtExpiresInSeconds: 900 },
      clock: () => new Date(NOW)
    });

    await request(app)
      .post("/api/v1/design-section-revisions/revision-1/decision")
      .set("Authorization", auth("user-client-aurora", "client"))
      .send({ version: 1, decision: "approved" })
      .expect(500);
    expect(await base.findSectionRevisionById("revision-1")).toMatchObject({
      reviewStatus: "submitted",
      reviewerId: null
    });
    expect(await base.findExtractionJobByVersionId("version-aurora-plan-1")).toMatchObject({
      status: "submitted"
    });
  });
});
