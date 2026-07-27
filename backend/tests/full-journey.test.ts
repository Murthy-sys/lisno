import { Readable } from "node:stream";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";

const password = "LisnoDemo2026!";
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwYMEAoAU7oL9W/sIDEAAAAASUVORK5CYII=",
  "base64"
);
const CROP_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const workerToken = "journey-worker-token-that-is-at-least-32-characters";

class JourneyStorage {
  readonly files = new Map<string, Buffer>();
  private sequence = 0;
  async save(input: { data: Buffer; extension: string }) {
    const reference = `journey-${++this.sequence}${input.extension}`;
    this.files.set(reference, input.data);
    return { reference };
  }
  async saveGenerated(input: { data: Buffer; extension: string }) {
    return this.save(input);
  }
  async delete(reference: string) { this.files.delete(reference); }
  async read(reference: string) {
    const data = this.files.get(reference);
    if (!data) throw new Error("missing file");
    return Buffer.from(data);
  }
  async open(reference: string) { const data = this.files.get(reference); if (!data) throw new Error("missing file"); return Readable.from(data); }
}

describe("complete cross-role journey", () => {
  it("preserves approved sections while a rejected section is replaced and approved", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const app = createApp({
      repository,
      storage: new JourneyStorage(),
      auth: {
        jwtSecret: "journey-secret-that-is-at-least-thirty-two-characters",
        jwtExpiresInSeconds: 900
      },
      clock: () => new Date("2026-07-27T12:00:00.000Z"),
      ocrWorkerToken: workerToken
    });
    const login = async (email: string) => {
      const response = await request(app).post("/api/v1/auth/login").send({ email, password });
      expect(response.status).toBe(200);
      return `Bearer ${response.body.data.token}`;
    };
    const designer = await login("ananya@lisno.example");
    const client = await login("client@aurora.example");

    const upload = await request(app)
      .post("/api/v1/tasks/task-furniture-layout/design-versions")
      .set("Authorization", designer)
      .attach("file", PDF, { filename: "review-plan.pdf", contentType: "application/pdf" })
      .expect(201);
    const job = await repository.findExtractionJobByVersionId(upload.body.data.id);
    expect(job).not.toBeNull();
    const claim = await request(app)
      .post("/api/v1/internal/extraction-jobs/claim")
      .set("Authorization", `Bearer ${workerToken}`)
      .send()
      .expect(200);
    await request(app)
      .post(`/api/v1/internal/extraction-jobs/${job!.id}/complete`)
      .set("Authorization", `Bearer ${workerToken}`)
      .set("X-Extraction-Claim-Token", claim.body.data.claimToken)
      .send({
        resultId: "journey-result",
        pages: [{
          pageNumber: 1,
          width: 2,
          height: 2,
          imageBase64: PNG.toString("base64"),
          sections: [
            {
              label: "Elevation",
              confidence: 0.96,
              crop: { x: 0, y: 0, width: 1, height: 1 },
              imageBase64: CROP_PNG.toString("base64")
            },
            {
              label: "Plan",
              confidence: 0.94,
              crop: { x: 1, y: 0, width: 1, height: 1 },
              imageBase64: CROP_PNG.toString("base64")
            }
          ]
        }]
      })
      .expect(200);

    const drafts = await request(app)
      .get(`/api/v1/design-versions/${upload.body.data.id}/sections`)
      .set("Authorization", designer)
      .expect(200);
    const [sectionA, sectionB] = drafts.body.data.sections;
    const correctedA = await request(app)
      .patch(`/api/v1/design-sections/${sectionA.id}`)
      .set("Authorization", designer)
      .send({ version: 1, label: "Front Elevation" })
      .expect(200);
    await request(app)
      .post(`/api/v1/design-versions/${upload.body.data.id}/submit-sections`)
      .set("Authorization", designer)
      .expect(200);

    const review = await request(app)
      .get("/api/v1/client/projects/project-aurora-villa/design-sections")
      .set("Authorization", client)
      .expect(200);
    const submittedA = review.body.data.sections.find(
      (item: { id: string }) => item.id === sectionA.id
    );
    const submittedB = review.body.data.sections.find(
      (item: { id: string }) => item.id === sectionB.id
    );
    await request(app)
      .post(`/api/v1/design-section-revisions/${submittedA.revision.id}/decision`)
      .set("Authorization", client)
      .send({ version: submittedA.revision.revisionNumber, decision: "approved" })
      .expect(200);
    await request(app)
      .post(`/api/v1/design-section-revisions/${submittedB.revision.id}/decision`)
      .set("Authorization", client)
      .send({ version: 1, decision: "rejected", comment: "Include the complete plan boundary." })
      .expect(200);

    const replacement = await request(app)
      .patch(`/api/v1/design-sections/${sectionB.id}`)
      .set("Authorization", designer)
      .send({ version: 1, crop: { x: 0, y: 1, width: 2, height: 1 } })
      .expect(200);
    await request(app)
      .post(`/api/v1/design-versions/${upload.body.data.id}/submit-sections`)
      .set("Authorization", designer)
      .expect(200);
    const finalDecision = await request(app)
      .post(`/api/v1/design-section-revisions/${replacement.body.data.revision.id}/decision`)
      .set("Authorization", client)
      .send({ version: 2, decision: "approved" })
      .expect(200);

    expect(finalDecision.body.data).toMatchObject({
      extractionStatus: "approved",
      progress: { approved: 2, rejected: 0, awaitingReview: 0, total: 2 }
    });
    expect(await repository.listSectionRevisions(sectionA.id)).toEqual([
      expect.objectContaining({ revisionNumber: 1, reviewStatus: "draft" }),
      expect.objectContaining({
        id: correctedA.body.data.revision.id,
        revisionNumber: 2,
        reviewStatus: "approved"
      })
    ]);
    expect(correctedA.body.data.revision.id).toBe(submittedA.revision.id);
    expect(await repository.listSectionRevisions(sectionB.id)).toEqual([
      expect.objectContaining({
        id: submittedB.revision.id,
        revisionNumber: 1,
        reviewStatus: "rejected",
        rejectionComment: "Include the complete plan boundary."
      }),
      expect.objectContaining({ id: replacement.body.data.revision.id, revisionNumber: 2, reviewStatus: "approved" })
    ]);
    expect(
      await repository.findExtractionJobByVersionId(upload.body.data.id)
    ).toMatchObject({ status: "approved" });

    const auditActions = (await repository.listAuditEvents({})).map((event) => event.action);
    expect(auditActions).toEqual(expect.arrayContaining([
      "design_version_uploaded",
      "design_extraction_completed",
      "design_section_edited",
      "design_sections_submitted",
      "design_section_approved",
      "design_section_rejected",
      "design_section_replaced"
    ]));
    expect(
      auditActions.filter((action) => action === "design_sections_submitted")
    ).toHaveLength(2);
    expect(
      auditActions.filter((action) => action === "design_section_approved")
    ).toHaveLength(2);
    expect(
      await repository.listAuditEvents({ entityIds: [submittedB.revision.id] })
    ).toEqual([
      expect.objectContaining({
        action: "design_section_rejected",
        entityType: "design_section_revision",
        entityId: submittedB.revision.id,
        newValues: expect.objectContaining({
          reviewStatus: "rejected",
          revisionNumber: 1,
          comment: "Include the complete plan boundary."
        })
      })
    ]);
  });

  it("moves a designer upload through manager/head review into the client portal", async () => {
    const app = createApp({ repository: createMemoryRepository(structuredClone(demoSeedData)), storage: new JourneyStorage(), auth: { jwtSecret: "journey-secret-that-is-at-least-thirty-two-characters", jwtExpiresInSeconds: 900 }, clock: () => new Date("2026-07-20T12:00:00.000Z") });
    const login = async (email: string) => {
      const response = await request(app).post("/api/v1/auth/login").send({ email, password });
      expect(response.status).toBe(200);
      return `Bearer ${response.body.data.token}`;
    };
    const designer = await login("ananya@lisno.example");
    const updated = await request(app).patch("/api/v1/tasks/task-furniture-layout").set("Authorization", designer).send({ version: 1, progress: 80, note: "Client-ready layout" });
    expect(updated.status).toBe(200);
    const uploaded = await request(app).post("/api/v1/tasks/task-furniture-layout/design-versions").set("Authorization", designer).attach("file", PDF, { filename: "client-plan.pdf", contentType: "application/pdf" });
    expect(uploaded.status).toBe(201);

    const manager = await login("aarav@lisno.example");
    const approved = await request(app).patch(`/api/v1/design-versions/${uploaded.body.data.id}/approval`).set("Authorization", manager).send({ approvalStatus: "approved", clientVisible: true });
    expect(approved.status).toBe(200);
    const kpiAfterApproval = await request(app)
      .get("/api/v1/kpis/users/user-designer-ananya?from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z&limit=20&offset=0")
      .set("Authorization", designer);
    expect(kpiAfterApproval.status).toBe(200);
    expect(kpiAfterApproval.body.data.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "quality", eligibleCount: expect.any(Number) }),
      expect.objectContaining({ key: "revisionEfficiency", eligibleCount: expect.any(Number) })
    ]));
    expect(kpiAfterApproval.body.data.components.find((component: { key: string }) => component.key === "quality").eligibleCount).toBeGreaterThan(0);
    expect(kpiAfterApproval.body.data.components.find((component: { key: string }) => component.key === "revisionEfficiency").eligibleCount).toBeGreaterThan(0);
    const draft = await request(app).post("/api/v1/tasks/task-furniture-layout/design-versions").set("Authorization", designer).attach("file", PDF, { filename: "draft-plan.pdf", contentType: "application/pdf" });
    expect(draft.status).toBe(201);
    const internal = await request(app).post("/api/v1/tasks/task-furniture-layout/design-versions").set("Authorization", designer).attach("file", PDF, { filename: "internal-plan.pdf", contentType: "application/pdf" });
    expect(internal.status).toBe(201);
    expect((await request(app).patch(`/api/v1/design-versions/${internal.body.data.id}/approval`).set("Authorization", manager).send({ approvalStatus: "approved", clientVisible: false })).status).toBe(200);
    const deadline = await request(app).patch("/api/v1/tasks/task-furniture-layout/deadline").set("Authorization", manager).send({ version: updated.body.data.version, currentDeadlineAt: "2026-08-02T17:00:00.000Z", reason: "Client review window" });
    expect(deadline.status).toBe(200);
    expect((await request(app).post("/api/v1/evaluations").set("Authorization", manager).send({ subjectUserId: "user-designer-ananya", periodStartAt: "2026-07-01T00:00:00.000Z", periodEndAt: "2026-07-31T23:59:59.999Z", score: 88, comments: "Clear client handoff" })).status).toBe(201);

    const celesteDesigner = await login("ishita@lisno.example");
    const celesteVersion = await request(app).post("/api/v1/tasks/task-overdue-measurement/design-versions").set("Authorization", celesteDesigner).attach("file", PDF, { filename: "celeste-plan.pdf", contentType: "application/pdf" });
    expect(celesteVersion.status).toBe(201);
    const celesteManager = await login("meera@lisno.example");
    expect((await request(app).patch(`/api/v1/design-versions/${celesteVersion.body.data.id}/approval`).set("Authorization", celesteManager).send({ approvalStatus: "approved", clientVisible: true })).status).toBe(200);

    const head = await login("head@lisno.example");
    expect((await request(app).get("/api/v1/organization/tree").set("Authorization", head)).status).toBe(200);
    expect((await request(app).post("/api/v1/evaluations").set("Authorization", head).send({ subjectUserId: "user-manager-aarav", periodStartAt: "2026-07-01T00:00:00.000Z", periodEndAt: "2026-07-31T23:59:59.999Z", score: 90, comments: "Reliable delivery oversight" })).status).toBe(201);

    const client = await login("client@aurora.example");
    const versions = await request(app).get("/api/v1/projects/project-aurora-villa/design-versions?limit=100&offset=0").set("Authorization", client);
    expect(versions.status).toBe(200);
    expect(versions.body.data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: uploaded.body.data.id, approvalStatus: "approved", clientVisible: true })]));
    const auroraClientVersionIds = versions.body.data.items.map((version: { id: string }) => version.id);
    expect(auroraClientVersionIds).not.toContain(draft.body.data.id);
    expect(auroraClientVersionIds).not.toContain(internal.body.data.id);
    expect((await request(app).get(`/api/v1/design-versions/${uploaded.body.data.id}/download`).set("Authorization", client)).status).toBe(200);
    expect((await request(app).get(`/api/v1/design-versions/${draft.body.data.id}/download`).set("Authorization", client)).status).toBe(404);
    expect((await request(app).get(`/api/v1/design-versions/${internal.body.data.id}/download`).set("Authorization", client)).status).toBe(404);
    expect((await request(app).get("/api/v1/projects/project-celeste-office/design-versions?limit=100&offset=0").set("Authorization", client)).status).toBe(404);
    expect((await request(app).get(`/api/v1/design-versions/${celesteVersion.body.data.id}/download`).set("Authorization", client)).status).toBe(404);
    const latest = await request(app).get("/api/v1/client/latest-approved-versions").set("Authorization", client);
    const latestClientVersionIds = latest.body.data.map((version: { id: string }) => version.id);
    expect(latestClientVersionIds).not.toContain(celesteVersion.body.data.id);
  });
});
