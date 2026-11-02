import { describe, expect, it } from "vitest";
import { newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { adminProjectSummary } from "../src/repositories/admin-project-summary.js";
import { memorySuperAdminDashboardOverview, memorySuperAdminDashboardProjects } from "../src/repositories/super-admin-dashboard.js";
import type { EstimateSummaryRecord, LeadRecord } from "../src/repositories/types.js";
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
    const summary = () => adminProjectSummary(project, [], [], [estimate], { id: "super", role: "super_admin" });
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
