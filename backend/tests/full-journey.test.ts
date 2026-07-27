import { Readable } from "node:stream";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";

const password = "LisnoDemo2026!";
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");

class JourneyStorage {
  readonly files = new Map<string, Buffer>();
  async save(input: { data: Buffer; extension: string }) { const reference = `journey${input.extension}`; this.files.set(reference, input.data); return { reference }; }
  async delete(reference: string) { this.files.delete(reference); }
  async open(reference: string) { const data = this.files.get(reference); if (!data) throw new Error("missing file"); return Readable.from(data); }
}

describe("complete cross-role journey", () => {
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
