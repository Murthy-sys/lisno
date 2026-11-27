import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errors.js";
import { createDesignWorkflowStateRouter } from "../src/routes/design-workflow-state.js";
import type { AuthService } from "../src/services/auth.service.js";
import type { WorkflowEvidenceStorage } from "../src/services/workflow-evidence-storage.js";
import { openApiDocument } from "../src/openapi.js";
import { executionChoiceFixture } from "./fixtures/execution-choice.js";

function setup(configure?: Parameters<typeof executionChoiceFixture>[0]) {
  const f = executionChoiceFixture(configure), app = express(); app.use(express.json());
  const storage = { saveProof: vi.fn(), saveMedia: vi.fn(), deleteQuietly: vi.fn() };
  app.use(createDesignWorkflowStateRouter({ authenticate: async (token: string) => Object.values(f.users).find(user => user.id === token)! } as unknown as AuthService,
    f.service, storage as unknown as WorkflowEvidenceStorage, 1024 * 1024));
  app.use(errorHandler);
  return { ...f, app, storage, path: `/projects/${f.project.id}/design-workflow/actions`, auth: (role: string) => `Bearer ${f.users[role]!.id}` };
}

describe("Execution choice HTTP contract", () => {
  it("saves and replays privately, then rejects a fresh replacement", async () => {
    const f = setup();
    const response = await request(f.app).post(f.path).set("Authorization", f.auth("client")).send(f.command).expect(200);
    expect(response.body).toEqual({ data: { version: 4 } }); expect(response.headers["cache-control"]).toBe("private, no-store");
    await request(f.app).post(f.path).set("Authorization", f.auth("client")).send(f.command).expect(200);
    const replacement = await request(f.app).post(f.path).set("Authorization", f.auth("client")).send({ ...f.command, expectedVersion: 4, idempotencyKey: "fresh-choice-change" }).expect(409);
    expect(replacement.body.error.code).toBe("EXECUTION_PATH_ALREADY_SELECTED");
    expect((await f.state())!.history).toHaveLength(1);
  });

  it("rejects unauthenticated, foreign and staff decisions through the real service", async () => {
    const f = setup(), before = await f.state();
    await request(f.app).post(f.path).send(f.command).expect(401);
    for (const role of ["designer", "admin", "super_admin", "finance_head", "design_manager", "estimator_sales"]) {
      await request(f.app).post(f.path).set("Authorization", f.auth(role)).send(f.command).expect(403);
    }
    await request(f.app).post(f.path).set("Authorization", f.auth("other")).send(f.command).expect(404);
    expect(await f.state()).toEqual(before);
  });

  it("rejects stale or incomplete key state and invalid command fields", async () => {
    const f = setup();
    await request(f.app).post(f.path).set("Authorization", f.auth("client")).send({ ...f.command, expectedVersion: 2 }).expect(409);
    for (const patch of [{ optionId: "invalid" }, { definitionVersion: 99 }, { acknowledgedIrreversible: false }, { selectedAt: "forged" }]) {
      await request(f.app).post(f.path).set("Authorization", f.auth("client")).send({ ...f.command, data: { ...f.command.data, ...patch } }).expect(400);
    }
    const waiting = setup(seed => { delete seed.designWorkflowStates![0]!.stages.key_collection!.completedAt; });
    await request(waiting.app).post(waiting.path).set("Authorization", waiting.auth("client")).send(waiting.command).expect(409);
  });

  it("rejects uploaded proof without storing a file or a decision", async () => {
    const f = setup(), before = await f.state();
    await request(f.app).post(f.path).set("Authorization", f.auth("client"))
      .field("action", f.command.action).field("expectedVersion", String(f.command.expectedVersion)).field("stageId", f.command.stageId!)
      .field("idempotencyKey", f.command.idempotencyKey).field("data", JSON.stringify(f.command.data))
      .attach("file", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==", "base64"), { filename: "proof.png", contentType: "image/png" }).expect(400);
    expect(f.storage.saveProof).not.toHaveBeenCalled(); expect(f.storage.saveMedia).not.toHaveBeenCalled(); expect(await f.state()).toEqual(before);
  });

  it("advertises the same action, exact data, and safe read projection in OpenAPI", () => {
    const schemas = openApiDocument.components.schemas as Record<string, any>;
    expect(schemas.DesignWorkflowActionRequest.properties.action.enum).toContain("execution_path_select");
    expect(schemas.ExecutionChoiceData).toMatchObject({ additionalProperties: false, required: ["optionId", "definitionVersion", "acknowledgedIrreversible"] });
    expect(schemas.DesignWorkflow.properties.executionChoice).toEqual({ $ref: "#/components/schemas/ExecutionChoiceView" });
    expect(schemas.ExecutionChoiceView.properties.selection.properties).not.toHaveProperty("selectedById");
  });
});
