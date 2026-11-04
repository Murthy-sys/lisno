import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createHierarchyService } from "../src/services/hierarchy.service.js";
import { createSuperAdminDashboardService } from "../src/services/super-admin-dashboard.service.js";
import { createChatFixture, chatLead } from "./helpers/project-chat.js";
import { statusFixture } from "./helpers/project-status.js";

describe("generated project identity in authorized feature projections", () => {
  it("keeps same-named chat projects distinct and denies the other Client", async () => {
    const f = createChatFixture(({ seed }) => {
      seed.projects.forEach(project => { project.name = "Same project name"; });
      seed.leads = [chatLead("lead-a", "a"), chatLead("lead-b", "b")].map(lead => ({ ...lead, projectNumber: lead.projectId === "a" ? "Lisno000012" : "Lisno000087" }));
    });
    const a = await f.service.summary(f.actor("client-a"), "a");
    const b = await f.service.summary(f.actor("client-b"), "b");
    expect(a.project).toMatchObject({ id: "a", name: "Same project name", projectNumber: "Lisno000012" });
    expect(b.project).toMatchObject({ id: "b", name: "Same project name", projectNumber: "Lisno000087" });
    await expect(f.service.summary(f.actor("client-b"), "a")).rejects.toMatchObject({ status: 404 });
    expect(a.project).not.toHaveProperty("clientEmail");
    expect((await f.repository.pageAuditEvents({}, { limit: 100, offset: 0 })).items).toEqual([]);
  });

  it("distinguishes a missing number from invalid stored identity", async () => {
    const missing = createChatFixture();
    expect((await missing.service.summary(missing.actor("client-b"), "b")).project.projectNumber).toBeNull();
    const unrelated = createChatFixture(({ seed }) => {
      seed.leads = [chatLead("lead-a", "a"), chatLead("lead-b", "b")].map(lead => ({ ...lead, projectNumber: lead.projectId === "b" ? "invalid" : null }));
    });
    await expect(unrelated.service.summary(unrelated.actor("client-b"), "b")).rejects.toMatchObject({ code: "PROJECT_NUMBER_STATE_CONFLICT" });
  });

  it("returns the same live reference to authorized status readers without writing", async () => {
    const f = statusFixture(({ seed }) => {
      seed.leads = seed.leads.map(lead => ({ ...lead, projectNumber: lead.projectId === "a" ? "Lisno000012" : "Lisno000087" }));
    });
    const mutate = vi.spyOn(f.chatRepository, "mutate");
    expect(await f.service.get(f.actor("client-a"), "a")).toMatchObject({ projectId: "a", projectNumber: "Lisno000012" });
    expect(await f.service.get(f.actor("sales-a"), "a")).toMatchObject({ projectNumber: "Lisno000012" });
    await expect(f.service.get(f.actor("client-b"), "a")).rejects.toMatchObject({ status: 404 });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("decorates dashboard rows in one batch without changing their source identities", async () => {
    const seed = structuredClone(demoSeedData);
    seed.leads = seed.projects.map((project, index) => ({ ...chatLead(`identity-${index}`, project.id), projectNumber: `Lisno${String(index + 1).padStart(6, "0")}` }));
    const repository = createMemoryRepository(seed);
    const read = vi.spyOn(repository, "findProjectNumbers");
    const service = createSuperAdminDashboardService(repository, () => new Date("2026-11-04T00:00:00Z"));
    const admin = seed.users.find(user => user.role === "super_admin")!;
    const page = await service.projects(admin, 30, { limit: 100, offset: 0, sort: "name_asc" });
    expect(page.items.length).toBeGreaterThan(1);
    expect(read).toHaveBeenCalledTimes(1);
    for (const item of page.items) expect(item.projectNumber).toBe(seed.leads.find(lead => lead.projectId === item.projectId)?.projectNumber);
    const overview = await service.overview(admin, 30);
    for (const item of overview.risk.topProjects) expect(item.projectNumber).toBe(seed.leads.find(lead => lead.projectId === item.projectId)?.projectNumber);
    read.mockClear();
    await expect(service.projects(seed.users.find(user => user.role === "client")!, 30, { limit: 20, offset: 0, sort: "name_asc" })).rejects.toMatchObject({ status: 401 });
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps generated identity in management's scoped project list", async () => {
    const seed = structuredClone(demoSeedData);
    seed.leads = seed.projects.map((project, index) => ({ ...chatLead(`identity-${index}`, project.id), projectNumber: `Lisno${String(index + 1).padStart(6, "0")}` }));
    const repository = createMemoryRepository(seed);
    const service = createHierarchyService(repository, () => new Date("2026-11-04T00:00:00Z"));
    const designer = seed.users.find(user => user.role === "designer")!;
    const summary = await service.designerSummary(seed.users.find(user => user.role === "super_admin")!, designer.id);
    expect(summary.projects.length).toBeGreaterThan(0);
    for (const project of summary.projects) expect(project.projectNumber).toBe(seed.leads.find(lead => lead.projectId === project.id)?.projectNumber);
  });
});
