import { describe, expect, it } from "vitest";
import { newEstimationLifecycle, newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { adminProjectSummary } from "../src/repositories/admin-project-summary.js";
import { memorySuperAdminDashboardOverview, memorySuperAdminDashboardProjects } from "../src/repositories/super-admin-dashboard.js";
import type { EstimateSummaryRecord, LeadRecord } from "../src/repositories/types.js";
import type { WorkflowEstimateApproval } from "../src/domain/workflow-estimate-items.js";
import { openApiDocument } from "../src/openapi.js";
import { demoSeedData } from "../src/seed/data.js";

const at = "2026-08-25T00:00:00.000Z";
function numberLeadFixture(): LeadRecord {
  return { id: "fixture-lead", projectId: null, ownerId: "user-estimator-sales", clientName: "Synthetic client", clientEmail: "number@example.test", clientMobile: "0000000000", projectName: "Numbered home", location: "Pune", propertyType: "2BHK", budgetMin: null, budgetMax: null, source: "test", stage: "new_lead", nextAction: "Estimation", nextActionAt: at, builder: null, areaSqft: null, targetHandoverAt: null, notes: null, latestActivityAt: null, createdAt: at, updatedAt: at };
}
function fixture() {
  const seed = structuredClone(demoSeedData);
  const project = { ...seed.projects[0]!, estimationWorkflowVersion: 3 as const };
  const estimate: EstimateSummaryRecord = {
    id: "quotation-summary", projectId: project.id, leadId: "quotation-lead", version: 12,
    status: "client_approved", subtotal: 9999, gst: 1800, total: 11799,
    clientDecisionAt: at, clientDecisionSource: "client_portal", clientReview: null,
    assignedAdminId: null, designPlanStatus: "assigned", designPlanVersion: 0, designPlanDesignerId: null,
    createdAt: at, updatedAt: at,
    approvedBaseline: { estimateVersion: 7, reviewRoundId: "quote-round", subtotal: 100, gst: 18, total: 118,
      subtotalPaise: 10000, gstPaise: 1800, totalPaise: 11800, decisionAt: at, decisionSource: "client_portal" },
    estimation: { ...newQuotationLifecycle(), phase: "post", status: "draft",
      preApproval: { reviewRoundId: "pre-round", estimateVersion: 2, approvedAt: at },
      finalApproval: { reviewRoundId: "quote-round", estimateVersion: 7, approvedAt: at,
        requirementsVersion: 0, designScopeRevision: 1, designReviewRoundId: null, designPlanVersion: null } }
  };
  seed.projects = [project]; seed.leads = []; seed.tasks = []; seed.estimateSummaries = [estimate];
  return { seed, project, estimate };
}

describe("quotation administrative summaries", () => {
  it("exposes current quotation phase/status and only marks the currently locked approval complete", () => {
    const { project, estimate } = fixture();
    const summary = () => {
      const lifecycle = estimate.estimation!;
      const current = lifecycle.workflowVersion === 3 && !!lifecycle.editClosedAt &&
        lifecycle.status === "client_approved" && lifecycle.finalApproval?.designScopeRevision === lifecycle.designScopeRevision;
      const quotationApproval = current ? {
        quotationApprovalState: "revision_current" as const, currentQuotationApproved: true, requiresClientReapproval: false,
        quotationApprovalSource: "designer_revision" as const, currentQuotationApproval: { kind: "designer_revision" as const,
          reviewRoundId: lifecycle.finalApproval!.reviewRoundId, estimateVersion: lifecycle.finalApproval!.estimateVersion,
          approvedAt: lifecycle.finalApproval!.approvedAt, requirementsVersion: lifecycle.requirementsVersion,
          pricedRevision: lifecycle.pricedRevision, designScopeRevision: lifecycle.designScopeRevision }
      } : {
        quotationApprovalState: lifecycle.editClosedAt ? "source_issue" as const : "revision_draft" as const,
        currentQuotationApproved: false, requiresClientReapproval: !lifecycle.editClosedAt,
        quotationApprovalSource: null, currentQuotationApproval: null
      };
      return adminProjectSummary(project, [], [], [{ ...estimate, quotationApproval }], { id: "super", role: "super_admin" });
    };
    expect(summary()).toMatchObject({ estimationWorkflowVersion: 3, estimate: {
      status: "draft", estimationPhase: "post", finalEstimateApproved: false,
      approvedBaseline: { estimateVersion: 7, subtotalPaise: 10000 }
    } });
    estimate.estimation!.editClosedAt = at;
    estimate.estimation!.status = "client_approved";
    expect(summary().estimate?.finalEstimateApproved).toBe(true);
    estimate.designPlanStatus = "approved";
    estimate.designPlanVersion = 2;
    if (estimate.estimation!.workflowVersion !== 3) throw new Error("Expected quotation lifecycle");
    estimate.estimation!.designApproval = { reviewRoundId: "drawing-round", designPlanVersion: 2,
      designScopeRevision: 1, estimateReviewRoundId: "quote-round", approvedAt: at };
    expect(summary().estimate?.designApproved).toBe(true);
    estimate.estimation!.designApproval.estimateReviewRoundId = "old-quote-round";
    expect(summary().estimate?.designApproved).toBe(false);
    estimate.estimation!.designScopeRevision = 2;
    expect(summary().estimate?.finalEstimateApproved).toBe(false);
  });

  it("keeps approved finance amounts while dashboard counts and filters follow current quotation status", () => {
    const { seed, estimate } = fixture();
    estimate.estimation!.status = "client_changes_requested";
    const overview = memorySuperAdminDashboardOverview(seed, { observedAt: "2026-08-30T00:00:00.000Z", startAt: at, endAt: "2026-08-31T00:00:00.000Z", periodDays: 7 });
    expect(overview.estimation).toMatchObject({ clientApproved: 0, changesRequested: 1 });
    expect(overview.finance).toMatchObject({ approvedSubtotalPaise: 10000, approvedGstPaise: 1800, approvedContractTotalPaise: 11800 });
    const page = memorySuperAdminDashboardProjects(seed, "2026-08-30T00:00:00.000Z", { module: "estimation", moduleStatus: "client_changes_requested", sort: "name_asc", offset: 0, limit: 20 });
    expect(page.total).toBe(1);
    expect(page.items[0]?.risk.factors).toContainEqual(expect.objectContaining({ reasonCode: "estimate_changes_requested" }));
  });
});


describe("canonical project number projections", () => {
  it("joins two unequal numbers by stable Project IDs and preserves historical nulls", async () => {
    const seed = structuredClone(demoSeedData);
    const template = numberLeadFixture();
    const first = seed.projects[0]!;
    const second = seed.projects[1]!;
    seed.leads = [
      { ...template, id: "numbered-a", projectId: first.id, projectName: "Same display name", projectNumber: "Lisno000019" },
      { ...template, id: "numbered-b", projectId: second.id, projectName: "Same display name", projectNumber: "Lisno1000000" },
      { ...template, id: "historic", projectId: null }
    ];
    const actor = { id: "user-super-admin", role: "super_admin" as const };
    expect(adminProjectSummary(first, seed.users, seed.leads, [], actor).projectNumber).toBe("Lisno000019");
    expect(adminProjectSummary(second, seed.users, seed.leads, [], actor).projectNumber).toBe("Lisno1000000");
    const repository = createMemoryRepository(seed);
    const page = await repository.pageAllLeads({}, { offset: 0, limit: 20 });
    expect(Object.fromEntries(page.items.map(lead => [lead.id, lead.projectNumber])))
      .toEqual({ "numbered-a": "Lisno000019", "numbered-b": "Lisno1000000", historic: null });
    expect((await repository.pageLeadsForOwner(template.ownerId, {}, { offset: 0, limit: 20 })).items)
      .toEqual(page.items);
    expect((await repository.updateLead("numbered-a", { notes: "Unrelated update" })).projectNumber).toBe("Lisno000019");
    expect((await repository.findLeadById("numbered-b"))?.projectNumber).toBe("Lisno1000000");
    await expect(repository.createLead({ ...template, id: "forged", projectId: null, projectNumber: "Lisno000001" } as never))
      .rejects.toThrow("Project numbers are assigned only");
    for (const projectNumber of [null, undefined, "Lisno000001"]) {
      await expect(repository.updateLead("numbered-a", { projectNumber } as never)).rejects.toThrow("Project numbers cannot be changed");
    }
    expect((await repository.findLeadById("numbered-a"))?.projectNumber).toBe("Lisno000019");
  });

  it("rejects ambiguous numbered lineage while preserving historical unnumbered duplicates", () => {
    const seed = structuredClone(demoSeedData);
    const project = seed.projects[0]!;
    const lead = { ...numberLeadFixture(), id: "a", projectId: project.id };
    const other = { ...lead, id: "b" };
    const actor = { id: "user-super-admin", role: "super_admin" as const };
    expect(adminProjectSummary(project, [], [other, lead], [], actor)).toMatchObject({ projectNumber: null, lead: { id: "a" } });
    expect(() => adminProjectSummary(project, [], [{ ...other, projectNumber: "Lisno000001" }, lead], [], actor))
      .toThrow("numbered Lead identity is inconsistent");
    const { estimate } = fixture();
    expect(() => adminProjectSummary(project, [], [{ ...lead, projectNumber: "Lisno000001" }], [{ ...estimate, projectId: project.id }], actor))
      .toThrow("identify different Leads");
  });
});

function assignmentFixture() {
  const { seed, project, estimate } = fixture();
  project.estimateRequirementsVersion = 0;
  estimate.estimation!.finalApproval = null;
  estimate.designPlanStatus = "pending_assignment";
  estimate.approvedBaseline = { ...estimate.approvedBaseline!, estimateVersion: 2, reviewRoundId: "pre-round" };
  const lead = { ...numberLeadFixture(), id: estimate.leadId, projectId: project.id };
  const round: WorkflowEstimateApproval = {
    id: "pre-round", estimateId: estimate.id, projectId: project.id, estimateVersion: 2,
    phase: "pre", status: "approved", decision: "approve", decidedById: "client-a",
    decidedAt: at, decisionSource: "client_portal", lineItems: []
  };
  seed.leads = [lead]; seed.estimateReviewRounds = [round];
  const summary = (role: "super_admin" | "admin" | "designer" | "client" | "estimator_sales" = "super_admin") =>
    adminProjectSummary(project, [], seed.leads, seed.estimateSummaries!, { id: "actor", role }, seed.estimateReviewRounds);
  return { seed, project, estimate, lead, round, summary };
}

describe("initial approval and Designer assignment projection", () => {
  it("allows Super Admin assignment after initial approval while the Designer quotation remains draft", async () => {
    const { seed, summary, project } = assignmentFixture();
    expect(summary().estimate).toMatchObject({ status: "draft", estimationPhase: "post", finalEstimateApproved: false,
      initialEstimateApproval: { reviewRoundId: "pre-round", estimateVersion: 2, approvedAt: at },
      canAssignDesigner: true, designerAssignmentBlockedReason: null,
      approvedBaseline: { total: 118 } });
    const repository = createMemoryRepository(seed);
    const actor = { ...seed.users.find(user => user.role === "super_admin")!, id: "user-super-admin" };
    expect((await repository.findAdminProject(actor, project.id))?.estimate).toEqual(summary().estimate);
    expect((await repository.pageAdminProjects(actor, { limit: 20, offset: 0 })).items[0]?.estimate).toEqual(summary().estimate);
  });

  it.each(["admin", "designer", "client", "estimator_sales"] as const)("does not advertise v3 assignment to %s", role => {
    const { summary } = assignmentFixture();
    expect(summary(role).estimate).toMatchObject({ canAssignDesigner: false,
      designerAssignmentBlockedReason: "Only Super Admin can assign the Designer." });
  });

  it.each([
    ["wrong project", { projectId: "other-project" }],
    ["wrong estimate", { estimateId: "other-estimate" }],
    ["wrong version", { estimateVersion: 1 }],
    ["wrong phase", { phase: "post" }],
    ["not approved", { status: "superseded" }],
    ["changes requested", { decision: "request_changes" }],
    ["missing actor", { decidedById: null }],
    ["unknown source", { decisionSource: "unknown" }],
    ["invalid date", { decidedAt: "invalid" }],
    ["mismatched date", { decidedAt: "2026-08-26T00:00:00.000Z" }]
  ])("fails closed for %s approval evidence", (_name, change) => {
    const { round, summary } = assignmentFixture();
    Object.assign(round, change);
    expect(summary().estimate).toMatchObject({ initialEstimateApproval: null, canAssignDesigner: false,
      designerAssignmentBlockedReason: "The initial Client approval could not be verified." });
  });

  it("does not infer approval from phase, status, duplicated rounds or an unchecked reference", () => {
    const { seed, estimate, summary } = assignmentFixture();
    seed.estimateReviewRounds = [];
    expect(summary().estimate).toMatchObject({ initialEstimateApproval: null, canAssignDesigner: false });
    estimate.estimation!.preApproval = null;
    expect(summary().estimate).toMatchObject({ initialEstimateApproval: null, canAssignDesigner: false });
    const valid = assignmentFixture();
    valid.seed.estimateReviewRounds!.push({ ...valid.round });
    expect(valid.summary().estimate).toMatchObject({ initialEstimateApproval: null, canAssignDesigner: false });
  });

  it("matches assignment blockers for stale requirements, workflow mismatch, missing Lead and ambiguous estimates", () => {
    const { project, seed, estimate, summary } = assignmentFixture();
    project.estimateRequirementsVersion = 1;
    expect(summary().estimate).toMatchObject({ canAssignDesigner: false, designerAssignmentBlockedReason: "Project requirements changed. Refresh this estimate." });
    project.estimateRequirementsVersion = 0;
    Object.assign(project, { estimationWorkflowVersion: 2 });
    expect(summary().estimate?.canAssignDesigner).toBe(false);
    project.estimationWorkflowVersion = 3; seed.leads = [];
    expect(summary().estimate?.designerAssignmentBlockedReason).toBe("The estimate and Lead must belong to this project.");
    seed.leads = [{ ...numberLeadFixture(), id: estimate.leadId, projectId: project.id }];
    seed.estimateSummaries!.push({ ...estimate, id: "other-approved" });
    expect(summary().estimate).toMatchObject({ canAssignDesigner: false,
      designerAssignmentBlockedReason: "Resolve the project's conflicting approved estimates before assigning a Designer." });
  });

  it.each(["ready_for_client", "approved"])("keeps %s design locked", status => {
    const { estimate, summary } = assignmentFixture(); estimate.designPlanStatus = status;
    expect(summary().estimate).toMatchObject({ canAssignDesigner: false,
      designerAssignmentBlockedReason: "The current Design stage cannot be reassigned." });
  });

  it("keeps initial approval and approved money isolated across unequal projects and a reopened quotation", () => {
    const first = assignmentFixture(); const second = assignmentFixture();
    second.project.id = "second-project"; second.lead.projectId = second.project.id;
    second.lead.id = "second-lead"; second.estimate.leadId = second.lead.id;
    second.estimate.id = "second-estimate"; second.estimate.projectId = second.project.id;
    second.round = { ...second.round, id: "second-pre", estimateId: second.estimate.id, projectId: second.project.id };
    second.estimate.estimation!.preApproval = { ...second.estimate.estimation!.preApproval!, reviewRoundId: second.round.id };
    second.estimate.approvedBaseline = { ...second.estimate.approvedBaseline!, subtotal: 300, gst: 54, total: 354,
      subtotalPaise: 30000, gstPaise: 5400, totalPaise: 35400, reviewRoundId: second.round.id };
    second.estimate.estimation!.status = "client_changes_requested";
    const estimates = [first.estimate, second.estimate]; const leads = [first.lead, second.lead]; const rounds = [first.round, second.round];
    const summaries = [first.project, second.project].map(project =>
      adminProjectSummary(project, [], leads, estimates, { id: "super", role: "super_admin" }, rounds));
    expect(summaries[0]?.estimate).toMatchObject({ initialEstimateApproval: { reviewRoundId: "pre-round" }, approvedBaseline: { total: 118 }, canAssignDesigner: true });
    expect(summaries[1]?.estimate).toMatchObject({ initialEstimateApproval: { reviewRoundId: "second-pre" }, status: "client_changes_requested", approvedBaseline: { total: 354 }, canAssignDesigner: true });
  });

  it("preserves legacy Admin assignment and the v2 open-edit-window constraint", () => {
    const { estimate, project, summary } = assignmentFixture();
    Object.assign(project, { estimationWorkflowVersion: 2 });
    estimate.estimation = { ...newEstimationLifecycle(), phase: "post", preApproval: estimate.estimation!.preApproval };
    expect(summary("admin").estimate?.canAssignDesigner).toBe(true);
    estimate.estimation.editClosedAt = at;
    expect(summary("admin").estimate?.canAssignDesigner).toBe(false);
    delete estimate.estimation; Reflect.deleteProperty(project, "estimationWorkflowVersion");
    expect(summary("admin").estimate).toMatchObject({ initialEstimateApproval: null, canAssignDesigner: true });
  });

  it("accepts retained legacy approval without phase only for v2 and still validates its lineage", () => {
    const { estimate, project, round, summary } = assignmentFixture();
    delete round.phase;
    expect(summary().estimate).toMatchObject({ initialEstimateApproval: null, canAssignDesigner: false });
    Object.assign(project, { estimationWorkflowVersion: 2 });
    estimate.estimation = { ...newEstimationLifecycle(), phase: "post", preApproval: estimate.estimation!.preApproval };
    expect(summary("admin").estimate).toMatchObject({
      initialEstimateApproval: { reviewRoundId: round.id, estimateVersion: 2 }, canAssignDesigner: true
    });
    round.phase = "post";
    expect(summary("admin").estimate).toMatchObject({ initialEstimateApproval: null, canAssignDesigner: false });
    delete round.phase; round.projectId = "foreign-project";
    expect(summary("admin").estimate).toMatchObject({ initialEstimateApproval: null, canAssignDesigner: false });
  });

  it("documents the same additive contract for Admin list and detail without changing current status meaning", () => {
    const schemas = openApiDocument.components.schemas;
    expect(schemas.AdminProjectEstimateSummary).toHaveProperty("required", expect.arrayContaining([
      "status", "initialEstimateApproval", "canAssignDesigner", "designerAssignmentBlockedReason"
    ]));
    expect(schemas.AdminProjectEstimateSummary).toHaveProperty("properties.initialEstimateApproval.nullable", true);
    expect(schemas.AdminProjectPage).toHaveProperty("properties.items.items.$ref", "#/components/schemas/AdminProjectSummary");
    expect(openApiDocument.paths["/admin/projects/{projectId}"]!.get).toHaveProperty(
      "responses.2XX.content.application/json.schema.properties.data.$ref", "#/components/schemas/AdminProjectSummary");
  });
});
