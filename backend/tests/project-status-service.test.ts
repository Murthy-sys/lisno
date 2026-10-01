import { describe, expect, it, vi } from "vitest";
import { statusFixture } from "./helpers/project-status.js";
import { CHAT_NOW } from "./helpers/project-chat.js";
import { workflowSpacePlanningSource } from "../src/domain/workflow-space-planning.js";
import { projectStatusWorkflowEvidence } from "../src/services/design-workflow-state.service.js";
import { emptyDesignWorkflowState } from "../src/domain/design-workflow-state.js";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";

describe("project status participant-safe source projection", () => {
  it("returns the same safe Client approval owner to current participants outside sending hours without writes", async () => {
    const f = statusFixture();
    const mutate = vi.spyOn(f.chatRepository, "mutate");
    const before = await f.chatRepository.snapshot(async tx => ({ messages: await tx.messages({ projectId: "a", userId: "client-a", filter: "all", limit: 100 }), selections: await tx.selections("a") }));
    const client = await f.service.get(f.actor("client-a"), "a");
    expect(client).toMatchObject({ state: "active", currentStage: { key: "estimate_approval" }, pendingActions: [{ responsibleRole: "client", people: [{ id: "client-a", name: "Client A", role: "client" }] }] });
    expect(await f.service.get(f.actor("sales-a"), "a")).toEqual(client);
    expect(await f.service.get(f.actor("admin-a"), "a")).toEqual(client);
    expect(await f.service.get(f.actor("super"), "a")).toEqual(client);
    expect(Object.keys(client).sort()).toEqual(["projectId", "projectName", "projectStatus", "serverNow", "state", "currentStage", "pendingActions", "issue"].sort());
    expect(JSON.stringify(client)).not.toMatch(/chat\.test|subtotal|total|lineItems|proof|storageReference|clientEmail|nextActionAt/);
    expect(mutate).not.toHaveBeenCalled();
    expect(await f.chatRepository.snapshot(async tx => ({ messages: await tx.messages({ projectId: "a", userId: "client-a", filter: "all", limit: 100 }), selections: await tx.selections("a") }))).toEqual(before);
    expect((await f.repository.pageAuditEvents({}, { limit: 100, offset: 0 })).items).toEqual([]);
  });

  it("isolates asymmetric projects and denies unrelated or removed people without details", async () => {
    const f = statusFixture();
    for (const id of ["client-b", "admin-b", "head", "electric-b"]) await expect(f.service.get(f.actor(id), "a")).rejects.toMatchObject({ status: 404 });
    const second = await f.service.get(f.actor("client-b"), "b");
    expect(second).toMatchObject({ projectId: "b", currentStage: { key: "estimate_preparation" }, pendingActions: [{ state: "unassigned", people: [] }] });
    await f.chatRepository.mutate(tx => tx.saveExclusion({ id: "removed-sales", projectId: "a", userId: "sales-a", person: { id: "sales-a", name: "Sales", role: "estimator_sales" }, active: true, version: 1, history: [] }));
    await expect(f.service.get(f.actor("sales-a"), "a")).rejects.toMatchObject({ status: 404 });
  });

  it("checks active identity, role, session version and expiry on every read", async () => {
    const f = statusFixture();
    await expect(f.service.get({ ...f.actor("client-a"), sessionVersion: 2 }, "a")).rejects.toMatchObject({ status: 401 });
    await expect(f.service.get({ ...f.actor("client-a"), role: "super_admin" }, "a")).rejects.toMatchObject({ status: 401 });
    await expect(f.service.get({ ...f.actor("client-a"), expiresAt: 1 }, "a")).rejects.toMatchObject({ status: 401 });
    await f.repository.updateUser("sales-a", 1, { active: false, updatedAt: CHAT_NOW });
    await expect(f.service.get(f.actor("sales-a"), "a")).rejects.toMatchObject({ status: 401 });
  });

  it("honors explicit participant additions then revocations without broadening project module access", async () => {
    const f = statusFixture();
    const selection = { id: "selected-procurement", projectId: "a", userId: "procurement", selectedRole: "procurement" as const, active: true, version: 1,
      selectedBy: { id: "super", name: "Super", role: "super_admin" as const }, selectedAt: CHAT_NOW, reason: "Support", tradeReference: null, revokedBy: null, revokedAt: null, revocationReason: null };
    await f.chatRepository.mutate(tx => tx.saveSelection(selection));
    expect((await f.service.get(f.actor("procurement"), "a")).projectId).toBe("a");
    await f.chatRepository.mutate(tx => tx.saveSelection({ ...selection, active: false, version: 2 }));
    await expect(f.service.get(f.actor("procurement"), "a")).rejects.toMatchObject({ status: 404 });
  });

  it.each(["missing", "stale", "cross-project", "wrong-lead", "duplicate", "orphan", "mutable-version"])("fails closed for %s published evidence", async kind => {
    const f = statusFixture((data, evidence) => {
      if (kind === "missing") evidence.rounds = [];
      if (kind === "stale") evidence.rounds[0]!.estimateVersion -= 1;
      if (kind === "cross-project") evidence.rounds[0]!.projectId = "b";
      if (kind === "wrong-lead") evidence.rounds[0]!.leadId = "lead-b";
      if (kind === "duplicate") evidence.rounds.push({ ...evidence.rounds[0]!, id: "duplicate" });
      if (kind === "orphan") evidence.rounds.push({ ...evidence.rounds[0]!, id: "orphan", estimateId: "foreign-estimate" });
      if (kind === "mutable-version") data.estimates[0]!.version += 1;
    });
    expect(await f.service.get(f.actor("client-a"), "a")).toMatchObject({ state: "unavailable", pendingActions: [], issue: expect.stringContaining("Status needs review") });
  });

  it.each(["client_portal", "admin_proof"])("uses immutable %s approval to move to payment confirmation", async source => {
    const f = statusFixture((data, evidence) => {
      data.estimates[0]!.status = evidence.estimates[0]!.status = "client_approved";
      data.estimates[0]!.version = evidence.estimates[0]!.version = 5;
      evidence.estimates[0]!.clientDecisionAt = CHAT_NOW;
      Object.assign(evidence.rounds[0]!, { status: "approved", decision: "approve", decisionSource: source, decidedAt: CHAT_NOW, decidedById: source === "client_portal" ? "client-a" : "admin-a", proofValid: source === "admin_proof" });
      data.seed.estimateSummaries = [{ id: "estimate-a", leadId: "lead-a", projectId: "a", version: 5, status: "client_approved", subtotal: 99999, gst: 100, total: 100099,
        clientDecisionAt: CHAT_NOW, clientDecisionSource: source as "client_portal" | "admin_proof", approvedBaseline: null, clientReview: null, assignedAdminId: "admin-a", createdAt: CHAT_NOW, updatedAt: CHAT_NOW }];
    });
    const client = await f.service.get(f.actor("client-a"), "a");
    expect(client).toMatchObject({ state: "active", currentStage: { key: "initial_payment" }, pendingActions: [{ responsibleRole: "super_admin", people: [{ id: "super" }] }] });
    for (const participant of ["sales-a", "designer-a", "manager-a", "admin-a", "super"]) {
      expect(await f.service.get(f.actor(participant), "a")).toEqual(client);
    }
  });

  it("does not accept a live approved flag without matching immutable proof", async () => {
    const f = statusFixture((data, evidence) => {
      data.estimates[0]!.status = evidence.estimates[0]!.status = "client_approved";
      data.estimates[0]!.version = evidence.estimates[0]!.version = 5;
      evidence.estimates[0]!.clientDecisionAt = CHAT_NOW;
      Object.assign(evidence.rounds[0]!, { status: "approved", decision: "approve", decisionSource: "admin_proof", decidedAt: CHAT_NOW, decidedById: "admin-a", proofValid: false });
    });
    expect((await f.service.get(f.actor("client-a"), "a")).state).toBe("unavailable");
  });

  it("identifies Sales revision for Design-origin changes without inventing a commercial decision", async () => {
    const f = statusFixture((data, evidence) => { data.estimates[0]!.status = evidence.estimates[0]!.status = "client_changes_requested"; });
    expect(await f.service.get(f.actor("client-a"), "a")).toMatchObject({ currentStage: { key: "estimate_preparation" }, pendingActions: [{ responsibleRole: "estimator_sales", people: [{ id: "sales-a" }] }] });
  });

  it("provides a typed conflict discriminator separate from pending Designer assignment", () => {
    const data = { estimateId: "e", projectId: "a", designPlanStatus: "pending_assignment", designPlanVersion: 0, approvedAt: null, approvedById: null, approvalSource: null, frozenAt: null, rounds: [], drawings: [], openFeedback: 0 };
    expect(workflowSpacePlanningSource(data)?.sourceIssue).toBeUndefined();
    expect(workflowSpacePlanningSource({ ...data, frozenAt: CHAT_NOW })?.sourceIssue).toBe("source_conflict");
  });

  it("rejects missing kickoff evidence and malformed furniture bundles while preserving legacy pending rooms", () => {
    const stages = createProjectDesignWorkflow("a");
    const state = emptyDesignWorkflowState("a");
    state.initialPaymentAt = CHAT_NOW;
    state.stages.internal_kickoff = { completedAt: CHAT_NOW };
    state.stages.existing_furniture_dimensions = { rooms: [{ id: "room-a", name: "Hall", required: true, uploadedAt: null, proceed: false }] };
    expect(projectStatusWorkflowEvidence(state, stages)).toEqual({ workflow: true, furniture: false });
    state.history.push({ id: "kickoff", idempotencyKey: "kickoff", requestHash: "hash", action: "internal_kickoff_complete", stageId: stages[0]!.id, actorId: "designer-a", actorName: "Designer A", actorRole: "designer", onBehalfOfClient: false, at: CHAT_NOW, note: "private note", proof: { storageReference: "private-reference", originalFilename: "signed.pdf", mimeType: "application/pdf", byteSize: 10, sha256: "a".repeat(64) } });
    expect(projectStatusWorkflowEvidence(state, stages)).toEqual({ workflow: false, furniture: false });
    state.stages.existing_furniture_dimensions.requirementsSubmissionEventId = "missing-bundle";
    expect(projectStatusWorkflowEvidence(state, stages)).toEqual({ workflow: false, furniture: true });
  });
});
