import { describe, expect, it } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { emptyDesignWorkflowState, type WorkflowStageState } from "../src/domain/design-workflow-state.js";
import { deriveProjectStatus, type ProjectStatusInput } from "../src/domain/project-status.js";
import { projectWorkflowBlueprints } from "../src/domain/project-workflow.js";
import type { ProjectCompletionSummary } from "../src/domain/project-completion.js";

const AT = "2026-10-01T12:00:00.000Z";
const BEFORE = "2026-09-30T12:00:00.000Z";
const AFTER = "2026-10-02T12:00:00.000Z";
function fixture(): ProjectStatusInput {
  return {
    project: { id: "project-a", name: "Willow House", status: "active", completionAuthority: "legacy_staff", clientId: "client-a", assignedEstimatorId: "sales-a", initiatingDesignerId: null, assignedDesignerIds: ["designer-a", "designer-b"], managerId: "manager-a", designWorkflowStages: createProjectDesignWorkflow("project-a") },
    participants: [
      { id: "client-a", name: "Client A", role: "client" }, { id: "sales-a", name: "Sales A", role: "estimator_sales" },
      { id: "designer-a", name: "Designer A", role: "designer" }, { id: "designer-b", name: "Designer B", role: "designer" },
      { id: "manager-a", name: "Manager A", role: "design_manager" }, { id: "super-a", name: "Super Admin", role: "super_admin" },
      { id: "admin-a", name: "Sales Manager", role: "admin" }, { id: "procurement-a", name: "Procurement", role: "procurement" },
      { id: "finance-a", name: "Finance", role: "finance_head" }, { id: "site-a", name: "Site", role: "site_manager" },
      { id: "worker-a", name: "Carpenter", role: "worker_carpenter" }
    ],
    estimate: { id: "estimate-a", projectId: "project-a", leadId: "lead-a", ownerId: "sales-a", status: "draft", version: 3, approvalRequired: true, assignedManagerId: "manager-a", assignedDesignerId: "designer-b", designPlanStatus: "assigned", designPlanVersion: 0, designPlanDesignerId: "designer-b", lineItems: [{ id: "item-a", catalogueId: "CA01", roomName: "Room A", specification: "Private line text", unit: "sqft", quantity: 4, amount: 120000, included: true }] },
    salesOwnerIds: ["sales-a"], designAssignmentOwnerIds: ["admin-a"],
    commercial: { state: "none", estimateId: "estimate-a", estimateVersion: 3 },
    workflow: emptyDesignWorkflowState("project-a"), design: null, tasks: [], serverNow: AT
  };
}
function approved(input: ProjectStatusInput) {
  input.estimate!.status = "client_approved";
  input.commercial = { state: "approved", estimateId: "estimate-a", estimateVersion: 2 };
  input.design = { estimateId: "estimate-a", designPlanVersion: 0, reviewRoundId: null, totalImages: 0, approvedImages: 0, readyForCompletion: false, entryBlockingReasons: [], blockingReasons: ["Submit current plan."] };
}
function through(input: ProjectStatusInput, stage: "payment" | "internal" | "kickoff" | "keys" | "measurement" | "furniture" | "design") {
  approved(input);
  const workflow = input.workflow!;
  workflow.initialPaymentAt = BEFORE;
  workflow.initialPaymentEstimateId = "estimate-a";
  workflow.initialPaymentEstimateVersion = 2;
  if (stage === "payment") return;
  workflow.stages.internal_kickoff = { completedAt: BEFORE, calendarAcceptedAt: BEFORE };
  if (stage === "internal") return;
  workflow.stages.client_kickoff = { completedAt: BEFORE, notRequired: true };
  if (stage === "kickoff") return;
  workflow.stages.key_collection = { handedOverAt: BEFORE, receivedAt: BEFORE, completedAt: BEFORE };
  if (stage === "keys") return;
  workflow.stages.site_measurement = { assignedDesignerId: "designer-b", completedAt: BEFORE };
  if (stage === "measurement") return;
  workflow.stages.existing_furniture_dimensions = { acceptedAt: BEFORE, completedAt: BEFORE, noExistingFurniture: true, rooms: [], scopeEstimateId: "estimate-a", scopeEstimateVersion: 2 };
  if (stage === "furniture") return;
  readyDesign(input);
  workflow.stages.space_planning_tentative_look_feel = { completedAt: BEFORE, spacePlanningApproval: { estimateId: "estimate-a", designPlanVersion: 2, reviewRoundId: "round-a" } };
  workflow.history.push({
    id: "space-planning-complete-a", idempotencyKey: "space-planning-complete-a", requestHash: "hash-a",
    action: "space_planning_complete", stageId: input.project.designWorkflowStages!.find(item => item.type === "space_planning_tentative_look_feel")!.id,
    actorId: "client-a", actorName: "Client A", actorRole: "client", onBehalfOfClient: false,
    at: BEFORE, note: "", data: { estimateId: "estimate-a", designPlanVersion: 2, reviewRoundId: "round-a", completedAt: BEFORE }, proof: null
  });
}
function readyDesign(input: ProjectStatusInput) {
  input.estimate!.designPlanStatus = "approved";
  input.estimate!.designPlanVersion = 2;
  input.design = { estimateId: "estimate-a", designPlanVersion: 2, reviewRoundId: "round-a", totalImages: 2, approvedImages: 2, readyForCompletion: true, entryBlockingReasons: [], blockingReasons: [] };
  const people = { procurement: "procurement-a", finance: "finance-a", site_execution: "site-a", trade_execution: "worker-a", design_plan_upload: "designer-b" };
  input.tasks = projectWorkflowBlueprints({ estimateId: "estimate-a", estimateVersion: 2, lineItems: input.estimate!.lineItems }).map((blueprint, index) => ({ id: `task-${index}`, projectId: "project-a", estimateId: "estimate-a", designPlanVersion: 2, kind: blueprint.kind, assigneeRole: blueprint.assigneeRole, assigneeUserId: people[blueprint.kind], sourceSectionId: blueprint.sourceSectionId, sourceLineItemKey: blueprint.sourceLineItemKey, status: "open", dueAt: AFTER, title: "Private task text" }));
}
function furniture(input: ProjectStatusInput, state: WorkflowStageState) {
  through(input, "measurement");
  input.workflow!.stages.existing_furniture_dimensions = { scopeEstimateId: "estimate-a", scopeEstimateVersion: 2, ...state };
}
const furnitureRoom = (id: string, status?: "pending" | "approved" | "changes_requested") => ({ id, name: `Room ${id}`, required: true, uploadedAt: status ? BEFORE : null, proceed: false, ...(status ? { dimensions: { submissionEventId: `submission-${id}`, revision: 1, status, submittedAt: BEFORE, items: [] } } : {}) });

describe("project status commercial responsibility", () => {
  it("shows assigned Sales before any estimate without leaking future work", () => {
    const input = fixture(); input.estimate = null; input.commercial = { state: "none", estimateId: null, estimateVersion: null };
    expect(deriveProjectStatus(input)).toMatchObject({ state: "active", currentStage: { key: "estimate_preparation" }, pendingActions: [{ responsibleRole: "estimator_sales", people: [{ id: "sales-a" }] }] });
  });
  it.each([
    ["draft", "estimate_preparation", "sales-a"], ["client_changes_requested", "estimate_preparation", "sales-a"],
    ["designer_changes_requested", "estimate_preparation", "sales-a"], ["pending_manager_assignment", "estimate_internal_review", "manager-a"],
    ["pending_designer_approval", "estimate_internal_review", "designer-b"], ["ready_for_client", "estimate_submission", "sales-a"]
  ])("resolves %s to the current responsible assignment", (status, stage, person) => {
    const input = fixture(); input.estimate!.status = status!;
    const output = deriveProjectStatus(input);
    expect(output.currentStage?.key).toBe(stage);
    expect(output.pendingActions).toHaveLength(1);
    expect(output.pendingActions[0]!.people.map(item => item.id)).toEqual([person]);
  });
  it("requires validated immutable evidence for Client review", () => {
    const input = fixture(); input.estimate!.status = "sent_to_client";
    expect(deriveProjectStatus(input).state).toBe("unavailable");
    input.commercial.state = "pending";
    expect(deriveProjectStatus(input).pendingActions[0]).toMatchObject({ responsibleRole: "client", people: [{ id: "client-a" }] });
  });
  it("projects validated approval to receipt confirmation without claiming the Client has not paid", () => {
    const input = fixture(); approved(input);
    expect(deriveProjectStatus(input).pendingActions[0]).toMatchObject({
      stageKey: "initial_payment", responsibleRole: "finance_head", state: "pending",
      people: [{ id: "finance-a", role: "finance_head" }, { id: "super-a", role: "super_admin" }],
      action: "Record confirmation that the initial payment was received."
    });
  });
  it("names the sole Super Admin when there is no participating Finance Head, and leaves payment unassigned when neither can act", () => {
    const input = fixture(); approved(input);
    input.participants = input.participants.filter(person => person.role !== "finance_head");
    expect(deriveProjectStatus(input).pendingActions[0]).toMatchObject({ responsibleRole: "super_admin", people: [{ id: "super-a", role: "super_admin" }] });
    input.participants = input.participants.filter(person => person.role !== "super_admin");
    expect(deriveProjectStatus(input).pendingActions[0]).toMatchObject({ state: "unassigned", people: [] });
  });
  it("lists all participating Finance Heads without making both confirmations mandatory", () => {
    const input = fixture(); approved(input);
    input.participants = [...input.participants, { id: "finance-b", name: "Finance B", role: "finance_head" }];
    const actions = deriveProjectStatus(input).pendingActions;
    expect(actions).toHaveLength(1);
    expect(actions[0]!.people.map(person => person.id)).toEqual(["finance-a", "finance-b", "super-a"]);
  });
  it("never chooses an arbitrary Sales member when assignment candidates conflict", () => {
    const input = fixture(); input.project.assignedEstimatorId = null; input.salesOwnerIds = ["sales-a", "sales-b"];
    input.participants = [...input.participants, { id: "sales-b", name: "Sales B", role: "estimator_sales" }];
    expect(deriveProjectStatus(input).pendingActions[0]).toMatchObject({ state: "unassigned", people: [], blocker: "Assignment needed." });
  });
  it("does not expose removed or role-changed owners", () => {
    const input = fixture(); input.participants = input.participants.filter(person => person.id !== "sales-a");
    expect(deriveProjectStatus(input).pendingActions[0]!.people).toEqual([]);
    input.participants = [...input.participants, { id: "sales-a", name: "Changed role", role: "admin" }];
    expect(deriveProjectStatus(input).pendingActions[0]!.people).toEqual([]);
  });
  it.each(["conflict", "wrong-project", "wrong-estimate", "wrong-version"])("fails closed for %s sources", kind => {
    const input = fixture();
    if (kind === "conflict") input.commercial.state = "conflict";
    if (kind === "wrong-project") input.estimate!.projectId = "project-b";
    if (kind === "wrong-estimate") input.commercial.estimateId = "estimate-b";
    if (kind === "wrong-version") input.commercial.estimateVersion = 10;
    expect(deriveProjectStatus(input)).toMatchObject({ state: "unavailable", pendingActions: [], issue: expect.stringMatching(/needs review/) });
  });
});

describe("project status workflow responsibility", () => {
  it("shows independent Designer completion and Sales calendar acceptance", () => {
    const input = fixture(); through(input, "payment");
    const output = deriveProjectStatus(input);
    expect(output.pendingActions.map(action => action.responsibleRole)).toEqual(["designer", "estimator_sales"]);
    expect(output.pendingActions[0]!.people.map(person => person.id)).toEqual(["designer-a", "designer-b"]);
  });
  it("keeps Sales acceptance concurrent after Internal Kick off has completed", () => {
    const input = fixture(); through(input, "internal"); delete input.workflow!.stages.internal_kickoff!.calendarAcceptedAt;
    const output = deriveProjectStatus(input);
    expect(output.currentStage?.key).toBe("client_kickoff");
    expect(output.pendingActions.map(action => action.stageKey)).toEqual(["client_kickoff", "internal_kickoff"]);
  });
  it("does not assign Sales calendar acceptance to an unassigned Lead or estimate owner", () => {
    const input = fixture(); through(input, "payment");
    input.project.assignedEstimatorId = null;
    expect(input.salesOwnerIds).toEqual(["sales-a"]);
    expect(deriveProjectStatus(input).pendingActions.find(action => action.id.endsWith(":internal-kickoff:calendar"))).toMatchObject({
      responsibleRole: "estimator_sales", state: "unassigned", people: []
    });
  });
  it("labels missing signed Internal Kick off evidence at the affected stage", () => {
    const input = fixture(); through(input, "payment"); input.issues = { workflow: true };
    expect(deriveProjectStatus(input)).toMatchObject({ state: "unavailable", currentStage: { key: "internal_kickoff" }, pendingActions: [] });
  });
  it.each(["request", "schedule", "future", "complete"])("resolves Client kickoff %s", step => {
    const input = fixture(); through(input, "internal");
    input.workflow!.stages.client_kickoff = step === "request" ? {} : step === "schedule" ? { requestedAt: BEFORE } : { requestedAt: BEFORE, scheduledAt: step === "future" ? AFTER : BEFORE };
    const output = deriveProjectStatus(input);
    expect(output.pendingActions[0]!.responsibleRole).toBe(step === "request" ? "designer" : "client");
    expect(output.state).toBe(step === "future" ? "scheduled" : "active");
    expect(output.pendingActions[0]!.scheduledAt).toBe(step === "future" ? AFTER : step === "complete" ? BEFORE : null);
  });
  it("shows both missing key confirmations without future measurement work", () => {
    const input = fixture(); through(input, "kickoff");
    expect(deriveProjectStatus(input).pendingActions.map(action => action.responsibleRole)).toEqual(["client", "designer"]);
    input.workflow!.stages.key_collection = { handedOverAt: BEFORE };
    expect(deriveProjectStatus(input).pendingActions.map(action => action.responsibleRole)).toEqual(["designer"]);
  });
  it("uses the actual measurement Designer rather than other assigned Designers", () => {
    const input = fixture(); through(input, "keys"); input.workflow!.stages.site_measurement = { assignedDesignerId: "designer-b" };
    expect(deriveProjectStatus(input).pendingActions[0]!.people.map(person => person.id)).toEqual(["designer-b"]);
    input.project.assignedDesignerIds = ["designer-a"];
    expect(deriveProjectStatus(input).pendingActions[0]!.state).toBe("unassigned");
  });
  it("shows assignment action before a measurement Designer is selected", () => {
    const input = fixture(); through(input, "keys");
    expect(deriveProjectStatus(input).pendingActions[0]!.action).toMatch(/Assign a project Designer/);
  });
  it("shows Client access restoration while paused without assigning measurement completion", () => {
    const input = fixture(); through(input, "keys"); input.workflow!.stages.site_measurement = { assignedDesignerId: "designer-b" }; input.workflow!.pauses = [{ startedAt: BEFORE, endedAt: null }];
    expect(deriveProjectStatus(input)).toMatchObject({ state: "paused", pendingActions: [{ responsibleRole: "client", action: expect.stringMatching(/site access has been restored/) }] });
  });
  it("accepts historical payment confirmation and rejects contradictory recorded lineage", () => {
    const input = fixture(); through(input, "payment"); delete input.workflow!.initialPaymentEstimateId; delete input.workflow!.initialPaymentEstimateVersion;
    expect(deriveProjectStatus(input).state).toBe("active");
    input.workflow!.initialPaymentEstimateVersion = 3;
    expect(deriveProjectStatus(input).state).toBe("unavailable");
  });
  it("does not skip invalid or future completions", () => {
    const input = fixture(); through(input, "internal"); input.workflow!.stages.internal_kickoff!.completedAt = AFTER;
    expect(deriveProjectStatus(input).state).toBe("unavailable");
  });
});

describe("project status furniture and Design", () => {
  it.each([false, true])("shows Designer preparation for missing/returned scope (%s)", returned => {
    const input = fixture(); furniture(input, returned ? { rooms: [furnitureRoom("room-a", "changes_requested")], scopeReturn: { reason: "Private internal text", at: BEFORE } } : {});
    const output = deriveProjectStatus(input);
    expect(output.currentStage?.key).toBe("existing_furniture_dimensions");
    expect(output.pendingActions[0]!.responsibleRole).toBe("designer");
    expect(output.pendingActions.some(action => action.stageKey === "space_planning_tentative_look_feel")).toBe(true);
    expect(JSON.stringify(output)).not.toContain("Private internal text");
  });
  it.each([undefined, "combined-submission"])("supports legacy and combined Client requirements review (%s)", submission => {
    const input = fixture(); furniture(input, { rooms: [furnitureRoom("room-a", "pending")], ...(submission ? { requirementsSubmissionEventId: submission } : {}) });
    expect(deriveProjectStatus(input).pendingActions[0]).toMatchObject({ responsibleRole: "client", stageKey: "existing_furniture_dimensions" });
  });
  it("shows concurrent legacy outstanding submissions and pending Client dimension reviews", () => {
    const input = fixture(); furniture(input, { acceptedAt: BEFORE, rooms: [furnitureRoom("room-a", "pending"), furnitureRoom("room-b", "changes_requested"), furnitureRoom("room-c", "approved")] });
    const actions = deriveProjectStatus(input).pendingActions.filter(action => action.stageKey === "existing_furniture_dimensions");
    expect(actions.map(action => action.responsibleRole)).toEqual(["client", "client", "designer"]);
    expect(actions.some(action => action.id.includes("room-c"))).toBe(false);
  });
  it("preserves completed legacy furniture without inventing approval for unfinished legacy uploads", () => {
    const input = fixture(); furniture(input, { acceptedAt: BEFORE, completedAt: BEFORE, rooms: [{ ...furnitureRoom("room-a"), uploadedAt: BEFORE }] });
    expect(deriveProjectStatus(input).currentStage?.key).toBe("space_planning_tentative_look_feel");
    delete input.workflow!.stages.existing_furniture_dimensions!.completedAt;
    expect(deriveProjectStatus(input).currentStage?.key).toBe("existing_furniture_dimensions");
    expect(deriveProjectStatus(input).pendingActions[0]!.action).toMatch(/dimensions/);
  });
  it("rejects furniture completion with unapproved dimensions or a stale estimate", () => {
    const input = fixture(); furniture(input, { acceptedAt: BEFORE, completedAt: BEFORE, rooms: [furnitureRoom("room-a", "pending")] });
    expect(deriveProjectStatus(input).state).toBe("unavailable");
    input.workflow!.stages.existing_furniture_dimensions = { acceptedAt: BEFORE, completedAt: BEFORE, rooms: [], noExistingFurniture: true, scopeEstimateId: "other-estimate" };
    expect(deriveProjectStatus(input).state).toBe("unavailable");
  });
  it("assigns pending Design assignment to the assigned Sales Manager role", () => {
    const input = fixture(); through(input, "furniture"); input.estimate!.designPlanStatus = "pending_assignment"; input.design = null;
    const output = deriveProjectStatus(input);
    expect(output.pendingActions).toHaveLength(1);
    expect(output.pendingActions[0]).toMatchObject({ responsibleRole: "admin", people: [{ id: "admin-a" }] });
  });
  it.each([false, true])("shows pending Designer assignment alongside the earliest prerequisite after approval (payment confirmed: %s)", paymentConfirmed => {
    const input = fixture();
    if (paymentConfirmed) through(input, "payment"); else approved(input);
    input.estimate!.designPlanStatus = "pending_assignment";
    input.estimate!.designPlanDesignerId = null;
    input.project.assignedDesignerIds = [];
    input.design = null;
    const output = deriveProjectStatus(input);
    expect(output.currentStage?.key).toBe(paymentConfirmed ? "internal_kickoff" : "initial_payment");
    expect(output.pendingActions.filter(action => action.id.endsWith(":assign-design"))).toEqual([
      expect.objectContaining({ action: "Assign a Designer to prepare the Design plan.", responsibleRole: "admin", people: [{ id: "admin-a", name: "Sales Manager", role: "admin" }] })
    ]);
    expect(output.pendingActions.some(action => action.id.endsWith(":prepare-design"))).toBe(false);
    if (paymentConfirmed) expect(output.pendingActions[0]).toMatchObject({ stageKey: "internal_kickoff", state: "unassigned", people: [] });
  });
  it("does not unlock future preparation when the Designer is assigned before measurement", () => {
    const input = fixture(); through(input, "payment");
    const output = deriveProjectStatus(input);
    expect(output.currentStage?.key).toBe("internal_kickoff");
    expect(output.pendingActions.some(action => action.stageKey === "space_planning_tentative_look_feel")).toBe(false);
  });
  it.each(["assigned", "in_progress", "changes_requested", "ready_for_client"])("resolves Design %s", status => {
    const input = fixture(); through(input, "furniture"); input.estimate!.designPlanStatus = status;
    expect(deriveProjectStatus(input).pendingActions[0]).toMatchObject({ responsibleRole: status === "ready_for_client" ? "client" : "designer", people: [{ id: status === "ready_for_client" ? "client-a" : "designer-b" }] });
  });
  it("keeps separate Client acknowledgement alongside already generated execution work", () => {
    const input = fixture(); through(input, "furniture"); readyDesign(input);
    const output = deriveProjectStatus(input);
    expect(output.pendingActions[0]).toMatchObject({ responsibleRole: "client", action: expect.stringMatching(/Acknowledge/) });
    expect(output.pendingActions.filter(action => action.stageKey === "execution")).toHaveLength(4);
  });
  it("keeps Client Design acknowledgement primary when an earlier Sales calendar acceptance is outstanding", () => {
    const input = fixture(); through(input, "furniture"); readyDesign(input);
    delete input.workflow!.stages.internal_kickoff!.calendarAcceptedAt;
    const output = deriveProjectStatus(input);
    expect(output.currentStage?.key).toBe("space_planning_tentative_look_feel");
    expect(output.pendingActions[0]).toMatchObject({ stageKey: "space_planning_tentative_look_feel", responsibleRole: "client", action: expect.stringMatching(/Acknowledge/) });
    expect(output.pendingActions.at(-1)).toMatchObject({ stageKey: "internal_kickoff", responsibleRole: "estimator_sales", people: [{ id: "sales-a" }] });
  });
  it("does not accept a completion acknowledgement for another Design round", () => {
    const input = fixture(); through(input, "design"); input.workflow!.stages.space_planning_tentative_look_feel!.spacePlanningApproval!.reviewRoundId = "old-round";
    expect(deriveProjectStatus(input).state).toBe("unavailable");
  });
  it.each(["missing", "wrong-client", "on-behalf", "wrong-stage", "wrong-round", "duplicate"])("does not advance Design completion without matching immutable Client evidence (%s)", kind => {
    const input = fixture(); through(input, "design");
    const event = input.workflow!.history[0]!;
    if (kind === "missing") input.workflow!.history = [];
    if (kind === "wrong-client") event.actorId = "other-client";
    if (kind === "on-behalf") event.onBehalfOfClient = true;
    if (kind === "wrong-stage") event.stageId = "other-stage";
    if (kind === "wrong-round") event.data = { ...event.data, reviewRoundId: "old-round" };
    if (kind === "duplicate") input.workflow!.history.push({ ...event, id: "duplicate" });
    const output = deriveProjectStatus(input);
    expect(output).toMatchObject({ state: "unavailable", currentStage: { key: "space_planning_tentative_look_feel" }, pendingActions: [] });
    expect(output.pendingActions.some(action => action.stageKey === "execution")).toBe(false);
  });
});

describe("project status execution and safe projection", () => {
  it("does not invent payment or kickoff stages for legacy projects", () => {
    const input = fixture(); approved(input); delete input.project.designWorkflowStages;
    expect(deriveProjectStatus(input).pendingActions.map(action => action.stageKey)).toEqual(["space_planning_tentative_look_feel"]);
    input.estimate!.designPlanStatus = null; input.design = null;
    expect(deriveProjectStatus(input)).toMatchObject({ state: "no_pending", currentStage: null, pendingActions: [] });
  });
  it("shows legacy generated execution without inventing a separate stage acknowledgement", () => {
    const input = fixture(); approved(input); readyDesign(input); input.project.designWorkflowStages = [];
    expect(deriveProjectStatus(input).pendingActions.map(action => action.stageKey)).toEqual(["execution", "execution", "execution", "execution"]);
    expect(deriveProjectStatus(input).currentStage?.key).toBe("execution");
  });
  it("respects canonical project hold state while retaining actual pending responsibility", () => {
    const input = fixture(); input.project.status = "on_hold";
    expect(deriveProjectStatus(input)).toMatchObject({ state: "paused", issue: "The project is on hold.", pendingActions: [{ responsibleRole: "estimator_sales" }] });
  });
  it("shows all independent execution owners and recorded deadlines", () => {
    const input = fixture(); through(input, "design");
    const output = deriveProjectStatus(input);
    expect(output.currentStage?.key).toBe("execution");
    expect(output.pendingActions.map(action => action.people[0]!.id).sort()).toEqual(["finance-a", "procurement-a", "site-a", "worker-a"]);
    expect(output.pendingActions.every(action => action.deadlineAt === AFTER)).toBe(true);
    const json = JSON.stringify(output);
    expect(json).not.toMatch(/Private|120000|quantity|lineItems|clientEmail|storageReference/);
  });
  it("shows execution as the current stage after Client Design completion even if Sales calendar acceptance is still pending", () => {
    const input = fixture(); through(input, "design");
    delete input.workflow!.stages.internal_kickoff!.calendarAcceptedAt;
    const output = deriveProjectStatus(input);
    expect(output.currentStage?.key).toBe("execution");
    expect(output.pendingActions[0]).toMatchObject({ stageKey: "execution", responsibleRole: "finance_head" });
    expect(output.pendingActions.at(-1)).toMatchObject({ stageKey: "internal_kickoff", responsibleRole: "estimator_sales", people: [{ id: "sales-a" }] });
  });
  it("heads the outstanding Sales calendar action when all later execution tasks are finished", () => {
    const input = fixture(); through(input, "design");
    delete input.workflow!.stages.internal_kickoff!.calendarAcceptedAt;
    input.tasks = input.tasks.map(task => ({ ...task, status: "completed" }));
    const output = deriveProjectStatus(input);
    expect(output.currentStage?.key).toBe("internal_kickoff");
    expect(output.pendingActions).toHaveLength(1);
    expect(output.pendingActions[0]!.stageKey).toBe("internal_kickoff");
  });
  it("does not substitute an arbitrary worker for a missing task assignment", () => {
    const input = fixture(); through(input, "design"); input.tasks = input.tasks.map(task => task.kind === "trade_execution" ? { ...task, assigneeUserId: null } : task);
    expect(deriveProjectStatus(input).pendingActions.find(action => action.responsibleRole === "worker_carpenter")).toMatchObject({ state: "unassigned", people: [] });
  });
  it.each(["stale", "foreign", "duplicate", "missing", "wrong-role"])("rejects %s generated task lineage", kind => {
    const input = fixture(); through(input, "design");
    if (kind === "stale") input.tasks = input.tasks.map(task => ({ ...task, designPlanVersion: 1 }));
    if (kind === "foreign") input.tasks = input.tasks.map(task => ({ ...task, projectId: "project-b" }));
    if (kind === "duplicate") input.tasks = [...input.tasks, { ...input.tasks[0]!, id: "duplicate" }];
    if (kind === "missing") input.tasks = input.tasks.slice(1);
    if (kind === "wrong-role") input.tasks = input.tasks.map(task => task.kind === "trade_execution" ? { ...task, assigneeRole: "worker_plumber" } : task);
    expect(deriveProjectStatus(input).state).toBe("unavailable");
  });
  it("distinguishes no pending tracked actions from canonical completion", () => {
    const input = fixture(); through(input, "design"); input.tasks = input.tasks.map(task => ({ ...task, status: "completed" }));
    expect(deriveProjectStatus(input)).toMatchObject({ state: "no_pending", pendingActions: [], currentStage: null });
    input.project.status = "completed";
    expect(deriveProjectStatus(input).state).toBe("completed");
  });
  it("does not let a canonical completed label hide recorded outstanding work", () => {
    const input = fixture(); through(input, "design"); input.project.status = "completed";
    expect(deriveProjectStatus(input).state).toBe("active");
  });
  it("is deterministic, does not mutate sources and never returns another project's assignees", () => {
    const input = fixture(); through(input, "keys"); input.workflow!.stages.site_measurement = { assignedDesignerId: "designer-b" };
    const before = structuredClone(input);
    const first = deriveProjectStatus(input);
    expect(deriveProjectStatus(input)).toEqual(first);
    expect(input).toEqual(before);
    const other = fixture(); other.project.id = "project-b"; other.project.name = "Unequal House"; other.project.assignedEstimatorId = "sales-b"; other.estimate!.projectId = "project-b"; other.participants = [{ id: "sales-b", name: "Other Sales", role: "estimator_sales" }];
    expect(deriveProjectStatus(other).pendingActions[0]!.people).toEqual([{ id: "sales-b", name: "Other Sales", role: "estimator_sales" }]);
    expect(JSON.stringify(first)).not.toContain("Other Sales");
  });
});

function vendorFlow(owner: ProjectCompletionSummary["pendingOwner"]): ProjectStatusInput {
  const input = fixture();
  through(input, "design");
  input.project.completionAuthority = "vendor_client";
  input.project.completionAuthorityVersion = 3;
  input.project.completionDecisionId = null;
  input.participants = [...input.participants, { id: "vendor-a", name: "Vendor A", role: "vendor" }];
  input.execution = {
    hasApprovedOrder: true, procurementOwnerIds: ["procurement-a"], pendingVendorUserIds: ["vendor-a"],
    completion: {
      projectId: "project-a", projectName: "Willow House", projectStatus: "active", completionAuthority: "vendor_client",
      completionAuthorityVersion: 3,
      estimateSource: { estimateId: "estimate-a", estimateVersion: 2, estimateReviewRoundId: "estimate-round-a" },
      scope: [], approvedOrders: [{ orderId: "po-a", revisionId: "revision-a", revision: 1, lineCount: 1, netPaise: 100, gstPaise: 0, totalPaise: 100 }],
      vendorWork: { totalAssignments: 1, approvedAssignments: owner === "super_admin" ? 1 : 0,
        pendingAssignments: owner === "super_admin" ? 0 : 1, openReviews: owner === "client" ? 1 : 0 },
      blockers: owner === "procurement" ? [{ code: "SCOPE_UNCOVERED", message: "Uncovered scope" }]
        : owner === "client" ? [{ code: "CLIENT_REVIEW_PENDING", message: "Review pending" }]
        : owner === "vendor" ? [{ code: "VENDOR_WORK_PENDING", message: "Work pending" }] : [],
      pendingOwner: owner, readyForCompletion: owner === "super_admin", completedAt: null, completionDecisionId: null
    }
  };
  return input;
}

describe("vendor-managed project status", () => {
  it("routes Site Manager submission, Client completion review, and final approval to the actual owners", () => {
    const input = vendorFlow("site_manager");
    input.execution!.completion!.blockers = [{ code: "SITE_COMPLETION_PENDING", message: "Site completion pending" }];
    expect(deriveProjectStatus(input)).toMatchObject({ currentStage: { key: "site_execution" },
      pendingActions: [{ responsibleRole: "site_manager", people: [{ id: "site-a" }] }] });
    input.execution!.completion!.pendingOwner = "client";
    input.execution!.completion!.siteCompletion = { status: "pending_client", progress: 100, round: 1, reviewId: "site-review-a" };
    expect(deriveProjectStatus(input)).toMatchObject({ currentStage: { key: "client_completion" },
      pendingActions: [{ responsibleRole: "client", people: [{ id: "client-a" }] }] });
    input.execution!.completion!.pendingOwner = "super_admin";
    input.execution!.completion!.siteCompletion.status = "client_approved";
    input.execution!.completion!.blockers = [];
    input.execution!.completion!.readyForCompletion = true;
    expect(deriveProjectStatus(input)).toMatchObject({ currentStage: { key: "final_completion" },
      pendingActions: [{ responsibleRole: "super_admin", people: [{ id: "super-a" }] }] });
  });

  it("shows Procurement as the owner while current approved-source items need a project order request", () => {
    const input = fixture();
    through(input, "design");
    input.execution = { completion: null, hasApprovedOrder: false, hasCurrentProcurementItems: true,
      procurementOwnerIds: ["procurement-a"], pendingVendorUserIds: [] };
    expect(deriveProjectStatus(input)).toMatchObject({ currentStage: { key: "purchase_order" },
      pendingActions: [{ responsibleRole: "procurement", people: [{ id: "procurement-a" }], action: expect.stringContaining("project purchase order request") }] });
  });

  it.each([
    ["procurement", "purchase_order", "procurement", "procurement-a"],
    ["super_admin", "final_completion", "super_admin", "super-a"],
    ["vendor", "vendor_work", "vendor", "vendor-a"],
    ["client", "client_vendor_review", "client", "client-a"]
  ] as const)("shows %s as the current work owner", (owner, stageKey, role, personId) => {
    const output = deriveProjectStatus(vendorFlow(owner));
    expect(output).toMatchObject({ state: "active", currentStage: { key: stageKey }, pendingActions: [{ stageKey, responsibleRole: role, people: [{ id: personId }] }] });
    expect(output.pendingActions.some(action => action.responsibleRole.startsWith("worker_"))).toBe(false);
  });

  it("shows Super Admin purchase-order approval distinctly from final completion", () => {
    const input = vendorFlow("super_admin");
    input.execution!.completion!.readyForCompletion = false;
    input.execution!.completion!.blockers = [{ code: "ORDER_PENDING", message: "Order pending" }];
    expect(deriveProjectStatus(input)).toMatchObject({ currentStage: { key: "purchase_order" }, pendingActions: [{ responsibleRole: "super_admin", action: expect.stringContaining("purchase order") }] });
  });

  it("fails closed on missing authority, stale approved-estimate source, or missing completion lineage", () => {
    const input = vendorFlow("vendor");
    input.execution!.completion!.estimateSource.estimateVersion = 1;
    expect(deriveProjectStatus(input)).toMatchObject({ state: "unavailable", pendingActions: [] });
    input.execution!.completion!.estimateSource.estimateVersion = 2;
    input.execution!.completion = null;
    expect(deriveProjectStatus(input).state).toBe("unavailable");
    input.project.completionAuthority = undefined;
    expect(deriveProjectStatus(input).state).toBe("unavailable");
  });

  it("preserves recorded final completion without reporting historical staff tasks", () => {
    const input = vendorFlow("none");
    input.project.status = "completed";
    input.project.completionDecisionId = "completion-a";
    input.execution!.completion!.projectStatus = "completed";
    input.execution!.completion!.completionDecisionId = "completion-a";
    input.execution!.completion!.completedAt = AT;
    input.execution!.completion!.readyForCompletion = false;
    expect(deriveProjectStatus(input)).toMatchObject({ state: "completed", pendingActions: [], currentStage: null });
  });
});
