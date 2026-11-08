import { describe, expect, it } from "vitest";
import { newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { emptyDesignWorkflowState, workflowSubmissionBlockers } from "../src/domain/design-workflow-state.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createDesignWorkflowStateService, hydrateDesignWorkflowState, projectOperationalStage, projectStatusWorkflowEvidence, projectInitialPayment, reconcileWorkflowRoomScope,
  requireDesignWorkflowScope, type WorkflowActionInput } from "../src/services/design-workflow-state.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { sha256Hex } from "../src/domain/estimate-client-review.js";
import { quotationSnapshotDigest } from "../src/services/quotation-digest.js";

const AT = "2026-10-30T10:00:00.000Z";
const proof = { storageReference: "synthetic-proof", originalFilename: "dimensions.pdf", mimeType: "application/pdf" as const,
  byteSize: 5, sha256: sha256Hex("proof") };
const media = { id: "synthetic-site", storageReference: "synthetic-site", originalFilename: "site.png", mimeType: "image/png", byteSize: 5, sha256: sha256Hex("photo"), kind: "image" as const };

function setup(options: { locked?: boolean; primary?: boolean; designApproved?: boolean; designQuoteId?: string } = {}) {
  const seed = structuredClone(demoSeedData);
  const project = seed.projects[0];
  const actors: Record<string, PublicUser> = {};
  for (const role of ["designer", "client", "super_admin", "estimator_sales"] as const) {
    const user = seed.users.find(user => user.role === role)!;
    actors[role] = { id: user.id, name: user.name, email: user.email, role };
  }
  const designer = seed.users.find(user => user.id === actors.designer.id)!;
  seed.users.push({ ...designer, id: "secondary-designer", email: "secondary@example.test", emailNormalized: "secondary@example.test" });
  actors.secondary = { ...actors.designer, id: "secondary-designer", email: "secondary@example.test" };
  const client = seed.users.find(user => user.id === actors.client.id)!;
  seed.users.push({ ...client, id: "foreign-client", email: "foreign@example.test", emailNormalized: "foreign@example.test" });
  actors.foreign = { ...actors.client, id: "foreign-client", email: "foreign@example.test" };
  Object.assign(project, { estimationWorkflowVersion: 3, primaryDesignerId: options.primary === false ? null : actors.designer.id,
    secondaryDesignerIds: [actors.secondary.id], assignedDesignerIds: [actors.designer.id, actors.secondary.id],
    clientId: actors.client.id, assignedEstimatorId: actors.estimator_sales.id, designWorkflowStages: createProjectDesignWorkflow(project.id) });
  const lifecycle = { ...newQuotationLifecycle(), phase: "post" as const, status: options.locked === false ? "draft" as const : "client_approved" as const, pricedRevision: options.locked === false ? 3 : 2,
    preApproval: { reviewRoundId: "furniture-pre", estimateVersion: 2, approvedAt: AT },
    finalApproval: { reviewRoundId: "furniture-post", estimateVersion: 4, approvedAt: AT, requirementsVersion: 0,
        designReviewRoundId: null, designPlanVersion: null, designScopeRevision: 1 }, editClosedAt: options.locked === false ? null : AT,
    designApproval: options.designApproved ? { reviewRoundId: "furniture-design", designPlanVersion: 1, designScopeRevision: 1,
      estimateReviewRoundId: options.designQuoteId ?? "furniture-post", approvedAt: AT } : null };
  const lines = [{ id: "quoted-new-work", catalogueId: "CUSTOM", roomId: "living", roomName: "Living room", specification: "New work", unit: "nos", quantity: 1, included: true, amount: 1_000 }];
  seed.estimateSummaries = [{ id: "furniture-estimate", leadId: "furniture-lead", projectId: project.id, version: 5,
    status: "client_approved", propertyType: "2BHK", subtotal: 1_000, gst: 0, total: 1_000, subtotalPaise: 100_000, gstPaise: 0, totalPaise: 100_000, clientDecisionAt: AT, clientDecisionSource: "client_portal",
    assignedAdminId: actors.super_admin.id, approvedBaseline: null, clientReview: null, createdAt: AT, updatedAt: AT,
    rooms: [{ id: "living", label: "Living room" }, { id: "personal-only", label: "Study" }], lineItems: lines, estimation: lifecycle }];
  const snapshot = { clientName: "Synthetic Client", projectName: "Synthetic project", location: "Synthetic location", propertyType: "2BHK",
    rooms: seed.estimateSummaries[0]!.rooms!, scopes: [], lineItems: lines, subtotal: 1_000, gst: 0, total: 1_000, subtotalPaise: 100_000, gstPaise: 0, totalPaise: 100_000 };
  const sourceDigest = quotationSnapshotDigest(snapshot);
  seed.estimateReviewRounds = [2, 4].map(version => ({ id: version === 2 ? "furniture-pre" : "furniture-post", estimateId: "furniture-estimate", projectId: project.id,
    workflowVersion: 3, pricedRevision: version / 2, sourceDigest, estimateSnapshot: snapshot, submittedById: version === 2 ? actors.estimator_sales.id : actors.designer.id,
    salesApproval: version === 2 ? { actorId: actors.estimator_sales.id, estimateVersion: 2, pricedRevision: 1, sourceDigest, approvedAt: AT } : null,
    estimateVersion: version, phase: version === 2 ? "pre" : "post", requirementsVersion: 0, designScopeRevision: 1,
    status: "approved", decision: "approve", decidedById: actors.client.id, decidedAt: AT, decisionSource: "client_portal", lineItems: lines }));
  seed.designWorkflowStates = [];
  if (options.designApproved) seed.designPlanReviewSources = [{ estimateId: "furniture-estimate", projectId: project.id,
    designPlanStatus: "approved", designPlanVersion: 1, approvedAt: AT, approvedById: actors.client.id, approvalSource: "client_portal", frozenAt: AT,
    rounds: [{ id: "furniture-design", estimateId: "furniture-estimate", projectId: project.id, designPlanVersion: 1, designScopeRevision: 1,
      estimateReviewRoundId: options.designQuoteId ?? "furniture-post", status: "approved", decision: "approve", decisionSource: "client_portal",
      decidedById: actors.client.id, decidedByRole: "client", decidedAt: AT, submittedRevisionIds: ["synthetic-drawing-revision"] }],
    drawings: [{ id: "synthetic-drawing", revisions: [{ id: "synthetic-drawing-revision", revisionNumber: 1, reviewStatus: "approved", reviewerId: actors.client.id, reviewedAt: AT }] }], openFeedback: 0 }];
  seed.knowledgeUoms = [{ id: "furniture-cm", code: "cm", name: "Centimetre", decimalScale: 2, status: "active", displayOrder: 0,
    dependencyEpoch: 0, version: 1, createdById: actors.super_admin.id, updatedById: actors.super_admin.id, createdAt: AT, updatedAt: AT }];
  const repository = createMemoryRepository(seed);
  const service = createDesignWorkflowStateService(repository, createAuditService(repository), () => new Date(AT));
  const state = () => repository.findDesignWorkflowState(project.id);
  const stage = (type: string) => project.designWorkflowStages!.find(stage => stage.type === type)!;
  let counter = 0;
  const input = async (action: WorkflowActionInput["action"], data: Record<string, unknown> = {}): Promise<WorkflowActionInput> => {
    const type = action.startsWith("internal") ? "internal_kickoff" : action.startsWith("client_kickoff") ? "client_kickoff" : action.startsWith("keys") ? "key_collection" : action.startsWith("measurement") ? "site_measurement" : "existing_furniture_dimensions";
    return { action, data, expectedVersion: (await state())?.version ?? 0, ...(action === "confirm_initial_payment" ? {} : { stageId: stage(type).id }), note: "Synthetic confirmation", idempotencyKey: `furniture-action-${++counter}` };
  };
  const act = async (actor: string, action: WorkflowActionInput["action"], data: Record<string, unknown> = {}, evidence: typeof proof | null = null) =>
    service.act(actors[actor], project.id, await input(action, data), evidence, action === "measurement_complete" ? [media] : []);
  const prerequisites = async () => {
    await act("designer", "internal_kickoff_complete", { meetingAt: AT, designHandoverAcknowledged: true }, proof);
    await act("client", "client_kickoff_complete", { reviewedDocumentEventId: (await state())!.history.find(event => event.action === "internal_kickoff_complete")!.id });
    await act("client", "keys_handed_over"); await act("designer", "keys_received");
    await act("secondary", "measurement_complete");
  };
  const request = () => act("designer", "furniture_request", { roomIds: ["personal-only"] });
  const upload = (confirmed = true) => ({ ...(confirmed ? { confirmed: true } : {}), rooms: [{ roomId: "personal-only", items: [
    { id: "personal-desk", name: "Existing desk", uomId: "furniture-cm", measurementType: "dimensions", length: 120, width: 60, height: 75 }
  ] }] });
  return { repository, service, actors, project, state, act, input, prerequisites, request, upload, stage };
}

describe("Client-owned furniture in quotation workflow v3", () => {
  it("blocks new parallel furniture writes for historical skipped kickoffs without changing the request", async () => {
    const h = setup(); await h.request();
    const old = (await h.state())!;
    old.stages.client_kickoff = { completedAt: AT, notRequired: true };
    await h.repository.saveDesignWorkflowState(h.project.id, old.version, old);
    const before = await h.state();
    const audits = await h.repository.listAuditEvents({});
    await expect(h.act("client", "furniture_choice", { hasFurniture: false })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await h.state()).toEqual(before);
    expect(await h.repository.listAuditEvents({})).toEqual(audits);
  });
  it("records Client No early but waits for preceding operational confirmations before completing", async () => {
    const h = setup(); await h.request(); await h.act("client", "furniture_choice", { hasFurniture: false });
    expect((await h.state())?.stages.existing_furniture_dimensions).toMatchObject({ noExistingFurniture: true, acceptedAt: AT,
      clientFurnitureRequest: { hasFurniture: false, needsAssistance: null, assistanceFeePaise: null } });
    expect((await h.state())?.stages.existing_furniture_dimensions?.completedAt).toBeUndefined();
    await h.prerequisites();
    expect((await h.state())?.stages.existing_furniture_dimensions?.completedAt).toBe(AT);
    expect((await h.state())?.initialPaymentAt).toBeNull();
  });
  it("accepts self-confirmed personal furniture independent of quotation lines and preserves provenance", async () => {
    const h = setup(); await h.prerequisites(); await h.request();
    await h.act("client", "furniture_choice", { hasFurniture: true, needsAssistance: false });
    await h.act("client", "furniture_upload", h.upload());
    const state = (await h.state())!;
    const furniture = state.stages.existing_furniture_dimensions!;
    expect(furniture.completedAt).toBe(AT);
    expect(furniture.rooms?.find(room => room.id === "personal-only")?.dimensions).toMatchObject({ status: "approved", provenance: "client_self", clientConfirmedAt: AT,
      items: [{ id: "personal-desk", name: "Existing desk", unit: "cm", length: 120 }] });
    expect(furniture.rooms?.find(room => room.id === "personal-only")?.dimensions?.items[0]).not.toHaveProperty("estimateItemId");
    expect(projectStatusWorkflowEvidence(state, h.project.designWorkflowStages!).furniture).toBe(false);
    expect(workflowSubmissionBlockers(state)).toEqual([]);
  });
  it("keeps assistance pending and fee unknown until Designer evidence and Client approval", async () => {
    const h = setup(); await h.prerequisites(); await h.request();
    await h.act("client", "furniture_choice", { hasFurniture: true, needsAssistance: true });
    expect((await h.state())?.stages.existing_furniture_dimensions?.completedAt).toBeUndefined();
    await expect(h.act("client", "furniture_upload", h.upload())).rejects.toMatchObject({ status: 403 });
    await expect(h.act("secondary", "furniture_upload", h.upload(false))).rejects.toMatchObject({ code: "WORKFLOW_PROOF_REQUIRED" });
    await h.act("secondary", "furniture_upload", h.upload(false), proof);
    const pending = (await h.state())!.stages.existing_furniture_dimensions!;
    const dimensions = pending.rooms!.find(room => room.id === "personal-only")!.dimensions!;
    expect(dimensions).toMatchObject({ status: "pending", provenance: "designer_assisted", submittedById: h.actors.secondary.id });
    expect(pending.clientFurnitureRequest?.assistanceFeePaise).toBeNull();
    await h.act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "personal-only", submissionEventId: dimensions.submissionEventId }] });
    expect((await h.state())?.stages.existing_furniture_dimensions?.completedAt).toBe(AT);
  });
  it("allows primary Designer to return invalid self-entry and retains old evidence on resubmission", async () => {
    const h = setup(); await h.prerequisites(); await h.request();
    await h.act("client", "furniture_choice", { hasFurniture: true, needsAssistance: false });
    await h.act("client", "furniture_upload", h.upload());
    const first = (await h.state())!.stages.existing_furniture_dimensions!.rooms!.find(room => room.id === "personal-only")!.dimensions!;
    const review = { submissions: [{ roomId: "personal-only", submissionEventId: first.submissionEventId }] };
    await expect(h.act("secondary", "furniture_dimensions_return", review)).rejects.toMatchObject({ status: 403 });
    await h.act("designer", "furniture_dimensions_return", review);
    expect((await h.state())?.stages.existing_furniture_dimensions?.completedAt).toBeUndefined();
    await h.act("client", "furniture_upload", h.upload());
    const current = (await h.state())!;
    expect(current.stages.existing_furniture_dimensions!.rooms!.find(room => room.id === "personal-only")!.dimensions?.revision).toBe(2);
    expect(current.history.find(event => event.id === first.submissionEventId)?.data).toMatchObject({ confirmed: true, provenance: "client_self" });
  });
  it("invalidates pending assisted submissions when the Client changes assistance choice", async () => {
    const h = setup(); await h.request(); await h.act("client", "furniture_choice", { hasFurniture: true, needsAssistance: true });
    await h.act("designer", "furniture_upload", h.upload(false), proof);
    const old = (await h.state())!.stages.existing_furniture_dimensions!.rooms!.find(room => room.id === "personal-only")!.dimensions!;
    await h.act("client", "furniture_choice", { hasFurniture: true, needsAssistance: false });
    await expect(h.act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "personal-only", submissionEventId: old.submissionEventId }] })).rejects.toMatchObject({ status: 409 });
    await h.act("client", "furniture_upload", h.upload());
    const current = (await h.state())!;
    expect(current.history.some(event => event.id === old.submissionEventId && event.proof)).toBe(true);
    expect(current.stages.existing_furniture_dimensions!.rooms!.find(room => room.id === "personal-only")!.dimensions?.revision).toBe(2);
  });
  it("rejects foreign actors, secondary requests, fabricated fees and foreign rooms without saving", async () => {
    const h = setup();
    await expect(h.act("secondary", "furniture_request", { roomIds: ["personal-only"] })).rejects.toMatchObject({ status: 403 });
    await expect(h.act("designer", "furniture_request", { roomIds: ["foreign-room"] })).rejects.toMatchObject({ status: 400 });
    await h.request(); const before = await h.state();
    await expect(h.act("foreign", "furniture_choice", { hasFurniture: false })).rejects.toMatchObject({ status: 404 });
    await expect(h.act("super_admin", "furniture_choice", { hasFurniture: false })).rejects.toMatchObject({ status: 403 });
    await expect(h.act("client", "furniture_choice", { hasFurniture: true, needsAssistance: true, assistanceFeePaise: 0 })).rejects.toMatchObject({ status: 400 });
    expect(await h.state()).toEqual(before);
  });
  it("enforces stale-version and idempotency fences on concurrent Client choices", async () => {
    const h = setup(); await h.request();
    const first = await h.input("furniture_choice", { hasFurniture: false });
    const second = { ...first, idempotencyKey: "second-furniture-choice", data: { hasFurniture: true, needsAssistance: false } };
    const results = await Promise.allSettled([h.service.act(h.actors.client, h.project.id, first, null), h.service.act(h.actors.client, h.project.id, second, null)]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect((await h.state())?.history.filter(row => row.action === "furniture_choice")).toHaveLength(1);
    const winner = results[0].status === "fulfilled" ? first : second;
    expect(await h.service.act(h.actors.client, h.project.id, winner, null)).toMatchObject({ replayed: true });
  });
  it("blocks operational actions when quotation is reopened and preserves the original timing anchor", async () => {
    const h = setup({ locked: false });
    await expect(h.request()).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    const state = await hydrateDesignWorkflowState(h.repository, h.project.id, { ...emptyDesignWorkflowState(h.project.id), designStartedAt: "2026-10-29T10:00:00.000Z" });
    expect(state).toMatchObject({ designStartedAt: "2026-10-29T10:00:00.000Z", quotationLocked: false });
    expect(workflowSubmissionBlockers(state)).toContain("The Client must approve the current Designer-revised quotation before design work continues.");
  });
  it("projects the Client task and assistance controls from backend capabilities", async () => {
    const h = setup(); await h.request();
    const state = (await h.state())!;
    const { capabilities } = await requireDesignWorkflowScope(h.repository, h.actors.client, h.project.id);
    const view = projectOperationalStage(h.stage("existing_furniture_dimensions"), state, capabilities, new Date(AT), h.actors.client.id,
      undefined, { projectId: h.project.id, paymentStatus: "awaiting_estimate_approval" });
    expect(view).toMatchObject({ workflowVersion: 3, clientFurnitureRequest: { roomIds: ["personal-only"], assistanceFeePaise: null },
      availableActions: [{ id: "furniture_choice", actor: "client", requiresProof: false }] });
  });
  it.each([
    { id: "personal-desk", name: "Desk", uomId: "furniture-cm", length: 0, width: 60 },
    { id: "personal-desk", name: "Desk", uomId: "furniture-cm", measurementType: "count", quantity: 1.5 },
    { id: "personal-desk", name: "Desk", uomId: "furniture-cm", measurementType: "count", quantity: Number.MAX_SAFE_INTEGER + 1 },
    { id: "personal-desk", name: " ", uomId: "furniture-cm", length: 120, width: 60 },
    { id: "personal-desk", name: "Desk", uomId: "foreign-uom", length: 120, width: 60 }
  ])("rejects invalid personal measurements or unknown units without changing evidence: %j", async item => {
    const h = setup(); await h.request(); await h.act("client", "furniture_choice", { hasFurniture: true, needsAssistance: false });
    const before = await h.state();
    await expect(h.act("client", "furniture_upload", { confirmed: true, rooms: [{ roomId: "personal-only", items: [item] }] })).rejects.toMatchObject({ status: 400 });
    expect(await h.state()).toEqual(before);
  });
  it("requires explicit self confirmation and unique personal IDs", async () => {
    const h = setup(); await h.request(); await h.act("client", "furniture_choice", { hasFurniture: true, needsAssistance: false });
    await expect(h.act("client", "furniture_upload", h.upload(false))).rejects.toMatchObject({ status: 403 });
    const duplicate = h.upload(); duplicate.rooms[0].items.push({ ...duplicate.rooms[0].items[0] });
    await expect(h.act("client", "furniture_upload", duplicate)).rejects.toMatchObject({ code: "INVALID_FURNITURE_DIMENSIONS" });
    expect((await h.state())?.history.some(event => event.action === "furniture_upload")).toBe(false);
  });
  it("does not accept fabricated assisted approval without its Client decision event", async () => {
    const h = setup(); await h.prerequisites(); await h.request();
    await h.act("client", "furniture_choice", { hasFurniture: true, needsAssistance: true });
    await h.act("designer", "furniture_upload", h.upload(false), proof);
    const state = (await h.state())!;
    const furniture = state.stages.existing_furniture_dimensions!;
    Object.assign(furniture.rooms!.find(room => room.id === "personal-only")!.dimensions!, { status: "approved", clientConfirmedAt: AT, reviewedAt: AT });
    furniture.completedAt = AT;
    expect(projectStatusWorkflowEvidence(state, h.project.designWorkflowStages!).furniture).toBe(true);
  });
  it("requires renewed Client choice when a prior no-furniture room scope changes", async () => {
    const h = setup(); await h.request(); await h.act("client", "furniture_choice", { hasFurniture: false });
    const state = (await h.state())!;
    const furniture = state.stages.existing_furniture_dimensions!;
    furniture.scopeEstimateVersion = furniture.scopeEstimateVersion! - 1;
    furniture.scopeRoomFingerprints!["personal-only"] = "previous-room-geometry";
    await h.repository.saveDesignWorkflowState(h.project.id, state.version, state);
    await h.repository.runInTransaction(tx => reconcileWorkflowRoomScope(tx, h.project.id, AT));
    const reconciled = (await h.state())!;
    expect(reconciled.stages.existing_furniture_dimensions?.clientFurnitureRequest).toMatchObject({ hasFurniture: null, needsAssistance: null });
    expect(reconciled.stages.existing_furniture_dimensions?.acceptedAt).toBeUndefined();
    expect(reconciled.history).toEqual(state.history);
    await h.request(); await h.act("client", "furniture_choice", { hasFurniture: false });
    expect(projectStatusWorkflowEvidence((await h.state())!, h.project.designWorkflowStages!).furniture).toBe(false);
  });
  it("freezes furniture mutations after approval of the current design", async () => {
    const h = setup({ designApproved: true });
    await expect(h.request()).rejects.toMatchObject({ code: "DESIGN_APPROVAL_LOCKED" });
    expect(await h.state()).toBeNull();
    const state = await hydrateDesignWorkflowState(h.repository, h.project.id, emptyDesignWorkflowState(h.project.id));
    const { capabilities } = await requireDesignWorkflowScope(h.repository, h.actors.designer, h.project.id);
    expect(projectOperationalStage(h.stage("existing_furniture_dimensions"), state, capabilities, new Date(AT), h.actors.designer.id).availableActions).toEqual([]);
  });
  it("binds initial payment to both approved quotation and later approved drawing", async () => {
    const beforeDesign = setup();
    await expect(beforeDesign.act("super_admin", "confirm_initial_payment")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    const h = setup({ designApproved: true });
    await h.act("super_admin", "confirm_initial_payment");
    const state = (await h.state())!;
    expect(state).toMatchObject({ initialPaymentEstimateId: "furniture-estimate", initialPaymentEstimateVersion: 4,
      initialPaymentReviewRoundId: "furniture-post", initialPaymentDesignReviewRoundId: "furniture-design" });
    expect(await projectInitialPayment(h.repository, h.project.id, state, true, "super_admin")).toMatchObject({ status: "received", canConfirm: false });
    const staleDesign = setup({ designApproved: true, designQuoteId: "previous-quotation" });
    await expect(staleDesign.act("super_admin", "confirm_initial_payment")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await staleDesign.state()).toBeNull();
  });
});
