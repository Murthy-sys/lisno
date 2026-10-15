import { describe, expect, it } from "vitest";
import { normalizeDesignRules } from "../src/domain/main-line-design-rules.js";
import { designRequirementsDigest, type DesignRequirementsSource, type DesignRequirementActionInput } from "../src/domain/design-requirements.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createDesignRequirementsService, assertDesignRequirementsSubmissionAllowed } from "../src/services/design-requirements.service.js";
import { assertDesignWorkflowSubmissionAllowed } from "../src/services/design-workflow-state.service.js";
import type { PublicUser } from "../src/services/auth.service.js";

function fixture() {
  const seed = structuredClone(demoSeedData);
  const project = seed.projects[0]!;
  const actor = (role: string): PublicUser => { const user = seed.users.find(row => row.role === role)!; return { id: user.id, role: user.role, name: user.name, email: user.email }; };
  const designer = actor("designer"), client = actor("client"), procurement = actor("procurement"), admin = actor("super_admin");
  project.assignedDesignerIds = [designer.id]; project.clientId = client.id;
  project.designWorkflowStages = undefined;
  seed.projectWorkflowAssignments = [{ projectId: project.id, kind: "procurement", assigneeRole: "procurement", assigneeUserId: procurement.id }];
  const rules = normalizeDesignRules({ answers: { physicalSampleApproval: true, clientFinishApproval: true, installationMethod: true, stockCheck: true, designerPoApproval: true, vendorPreDiscussed: true },
    details: { clientFinishApproval: "Select the finish from the sample", vendorPreDiscussed: "Confidential vendor discussion", installationMethod: "Hidden fixing system" }, discussedVendorId: "secret-vendor", poApprovalChecklist: [{ id: "dimensions", text: "Dimensions verified" }, { id: "finish", text: "Finish specified" }] });
  const source: DesignRequirementsSource = { projectId: project.id, estimateId: "estimate-one", estimateVersion: 5, clientId: client.id, designerIds: [designer.id], procurementIds: [procurement.id],
    initialPaymentAt: "2026-10-14T10:00:00.000Z", issues: [], lines: [{ lineItemId: "line-a", mainLineId: "main-a", lineName: "Joinery", designRules: rules, sourceDigest: designRequirementsDigest(rules) }] };
  seed.designRequirementsSources = [source];
  const repository = createMemoryRepository(seed);
  const service = createDesignRequirementsService({ repository, audit: createAuditService(repository), clock: () => new Date("2026-10-15T10:00:00.000Z") });
  let serial = 0;
  async function input(user: PublicUser, key: string, action: DesignRequirementActionInput["action"], note = "Recorded supporting evidence") {
    const view = await service.get(user, project.id);
    return { expectedVersion: view.version, sourceToken: view.sourceToken, entryId: view.entries.find(row => row.ruleKey === key)!.id,
      action, note, checkedPointIds: [], idempotencyKey: `requirement-key-${++serial}` } satisfies DesignRequirementActionInput;
  }
  return { seed, project, designer, client, procurement, admin, source, repository, service, input };
}

describe("source-linked Design requirements", () => {
  it("reads without materializing state, separates Client payload and fixes payment deadline", async () => {
    const f = fixture();
    const staff = await f.service.get(f.designer, f.project.id);
    expect(staff.entries).toHaveLength(5);
    expect(staff.entries.find(row => row.ruleKey === "stockCheck")).toMatchObject({ dueAt: "2026-10-18T10:00:00.000Z", availableActions: [] });
    expect(await f.repository.findDesignRequirementsState(f.project.id)).toBeNull();
    const client = await f.service.get(f.client, f.project.id);
    expect(client.entries.map(row => row.ruleKey)).toEqual(["clientFinishApproval"]);
    expect(client.canReadInternal).toBe(false);
    expect(JSON.stringify(client)).not.toContain("secret-vendor");
    expect(JSON.stringify(client)).not.toContain("Hidden fixing");
    expect(JSON.stringify(client)).not.toContain("Dimensions verified");
  });

  it("permits actual Client approval only and keeps reasoned deferral open after submission", async () => {
    const f = fixture();
    const pretend = await f.input(f.designer, "clientFinishApproval", "approve");
    await expect(f.service.act(f.designer, f.project.id, pretend)).rejects.toMatchObject({ status: 403 });
    const deferral = await f.input(f.designer, "clientFinishApproval", "defer", "Vendor confidential delay");
    await f.service.act(f.designer, f.project.id, deferral);
    const clientDeferred = (await f.service.get(f.client, f.project.id)).entries[0]!;
    expect(clientDeferred).toMatchObject({ status: "deferred", note: "", deferredReason: null, availableActions: ["approve"] });
    await f.service.act(f.designer, f.project.id, await f.input(f.designer, "physicalSampleApproval", "defer", "Selection during project execution"));
    await f.service.act(f.designer, f.project.id, await f.input(f.designer, "installationMethod", "complete"));
    const frozen = await assertDesignRequirementsSubmissionAllowed(f.repository, f.project.id);
    expect(frozen.entries.filter(row => row.status === "deferred")).toHaveLength(2);
    await f.service.act(f.client, f.project.id, await f.input(f.client, "clientFinishApproval", "approve"));
    expect(frozen.entries.find(row => row.ruleKey === "clientFinishApproval")?.status).toBe("deferred");
    expect((await f.repository.findDesignRequirementsState(f.project.id))?.history).toHaveLength(4);
  });

  it("requires critical checklist even without legacy workflow and never blocks uploads", async () => {
    const f = fixture();
    await expect(assertDesignWorkflowSubmissionAllowed(f.repository, f.project.id)).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_BLOCKED" });
    await expect(assertDesignWorkflowSubmissionAllowed(f.repository, f.project.id, { phase: "upload" })).resolves.toBeUndefined();
    await expect(f.service.act(f.designer, f.project.id, await f.input(f.designer, "installationMethod", "defer"))).rejects.toMatchObject({ status: 403 });
  });

  it("requires every current PO point and rejects duplicate or stale request semantics", async () => {
    const f = fixture();
    const action = await f.input(f.designer, "designerPoApproval", "approve");
    await expect(f.service.act(f.designer, f.project.id, { ...action, checkedPointIds: ["finish"] })).rejects.toMatchObject({ code: "DESIGN_PO_CHECKLIST_INCOMPLETE" });
    const full = { ...action, checkedPointIds: ["finish", "dimensions"] };
    const result = await f.service.act(f.designer, f.project.id, full);
    expect(result.entries.find(row => row.ruleKey === "designerPoApproval")).toMatchObject({ status: "approved", completedById: f.designer.id });
    expect((await f.service.act(f.designer, f.project.id, full)).replayed).toBe(true);
    await expect(f.service.act(f.designer, f.project.id, { ...full, note: "Different approval" })).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_CONFLICT" });
    await expect(f.service.act(f.designer, f.project.id, { ...full, idempotencyKey: "another-request-key" })).rejects.toMatchObject({ code: "DESIGN_REQUIREMENTS_CONFLICT" });
    expect((await f.repository.findDesignRequirementsState(f.project.id))?.history).toHaveLength(1);
  });

  it("allows only assigned Procurement to close stock and denies Super Admin signoff", async () => {
    const f = fixture();
    await expect(f.service.act(f.designer, f.project.id, await f.input(f.designer, "stockCheck", "complete"))).rejects.toMatchObject({ status: 403 });
    await expect(f.service.act(f.admin, f.project.id, await f.input(f.admin, "designerPoApproval", "approve"))).rejects.toMatchObject({ status: 404 });
    const closed = await f.service.act(f.procurement, f.project.id, await f.input(f.procurement, "stockCheck", "complete"));
    expect(closed.entries.find(row => row.ruleKey === "stockCheck")).toMatchObject({ status: "completed", dueAt: "2026-10-18T10:00:00.000Z" });
  });

  it("invalidates completion after source or assignment change without destroying history", async () => {
    const f = fixture();
    await f.service.act(f.designer, f.project.id, await f.input(f.designer, "installationMethod", "complete"));
    f.seed.designRequirementsStates = [(await f.repository.findDesignRequirementsState(f.project.id))!];
    f.source.lines[0]!.sourceDigest = "changed-current-revision";
    const repository = createMemoryRepository(f.seed);
    const service = createDesignRequirementsService({ repository, audit: createAuditService(repository) });
    const view = await service.get(f.designer, f.project.id);
    expect(view.entries.find(row => row.ruleKey === "installationMethod")?.status).toBe("pending");
    expect((await repository.findDesignRequirementsState(f.project.id))?.history).toHaveLength(1);
  });

  it("does not manufacture requirements for historical all-No lines", async () => {
    const f = fixture();
    f.source.lines[0]!.designRules = normalizeDesignRules();
    const repository = createMemoryRepository(f.seed);
    await expect(assertDesignRequirementsSubmissionAllowed(repository, f.project.id)).resolves.toMatchObject({ entries: [] });
    expect(await repository.findDesignRequirementsState(f.project.id)).toBeNull();
  });
});
