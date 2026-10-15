import { describe, expect, it } from "vitest";
import { normalizeDesignRules } from "../src/domain/main-line-design-rules.js";
import { designRequirementsDigest, type DesignRequirementsSource } from "../src/domain/design-requirements.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createMemoryProjectChatRepository } from "../src/repositories/project-chat-memory.js";
import { createDailyCriticalTasksService } from "../src/services/daily-critical-tasks.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createDesignRequirementsService } from "../src/services/design-requirements.service.js";
import { CHAT_NOW, chatFixtureData } from "./helpers/project-chat.js";
import type { ChatActor } from "../src/contracts/project-chat.js";

describe("Design requirements daily critical projection", () => {
  it("shows only assigned open work, retains deferred selections, and never invents stock deadlines", async () => {
    const f = chatFixtureData();
    const rules = normalizeDesignRules({ answers: { installationMethod: true, physicalSampleApproval: true, stockCheck: true } });
    const source = (projectId: string): DesignRequirementsSource => ({ projectId, estimateId: `estimate-${projectId}`, estimateVersion: 4,
      clientId: `client-${projectId}`, designerIds: ["designer-a"], procurementIds: ["procurement"], initialPaymentAt: null, issues: [],
      lines: [{ lineItemId: `line-${projectId}`, mainLineId: "main-one", lineName: projectId === "a" ? "Joinery" : "Private project item", sourceDigest: designRequirementsDigest(rules), designRules: rules }] });
    f.seed.designRequirementsSources = [source("a"), source("b")];
    f.seed.projectWorkflowAssignments = [{ projectId: "a", kind: "procurement", assigneeRole: "procurement", assigneeUserId: "procurement" }];
    f.workflowTasks.push({ id: "procurement-assignment", projectId: "a", estimateId: "estimate-a", designPlanVersion: 2, kind: "procurement", assigneeRole: "procurement", assigneeUserId: "procurement", preparationOnly: true });
    const repository = createMemoryRepository(f.seed);
    const chatRepository = createMemoryProjectChatRepository(repository, { estimates: f.estimates, workflowTasks: f.workflowTasks });
    const clock = () => new Date(CHAT_NOW);
    const daily = createDailyCriticalTasksService({ chatRepository, clock });
    const requirements = createDesignRequirementsService({ repository, audit: createAuditService(repository), clock });
    const actor = (id: string): ChatActor => ({ id, role: f.seed.users.find(user => user.id === id)!.role, sessionVersion: 1, expiresAt: Date.parse(CHAT_NOW) / 1000 + 3600 });
    const initial = await daily.current(actor("designer-a"));
    expect(initial.items.filter(item => item.kind === "design_requirement")).toHaveLength(2);
    expect(JSON.stringify(initial)).not.toContain("Private project item");
    const stock = (await daily.current(actor("procurement"))).items;
    expect(stock).toContainEqual(expect.objectContaining({ kind: "design_requirement", category: "stock", dueAt: null }));
    const designer = { id: "designer-a", name: "Designer A", email: "designer-a@chat.test", role: "designer" as const };
    let view = await requirements.get(designer, "a");
    await requirements.act(designer, "a", { expectedVersion: view.version, sourceToken: view.sourceToken, entryId: view.entries.find(entry => entry.ruleKey === "physicalSampleApproval")!.id,
      action: "defer", note: "During-project sample selection", checkedPointIds: [], idempotencyKey: "daily-defer-selection" });
    view = await requirements.get(designer, "a");
    await requirements.act(designer, "a", { expectedVersion: view.version, sourceToken: view.sourceToken, entryId: view.entries.find(entry => entry.ruleKey === "installationMethod")!.id,
      action: "complete", note: "Installation verified", checkedPointIds: [], idempotencyKey: "daily-complete-installation" });
    const updated = (await daily.current(actor("designer-a"))).items.filter(item => item.kind === "design_requirement");
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ status: "deferred", category: "selection" });
    expect(await chatRepository.snapshot(tx => tx.digestReceipts("designer-a", "2026-09-16"))).toEqual([]);
  });
});
