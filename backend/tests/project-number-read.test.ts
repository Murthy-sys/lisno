import type { ClientSession } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runWithHumanOperation } from "../src/domain/operation-context.js";
import { projectNumbersForProjectIds } from "../src/domain/project-number.js";
import { LeadModel } from "../src/models/Lead.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import type { LeadRecord } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import { readProjectNumbers } from "../src/services/project-number-read.service.js";
import { createProjectService } from "../src/services/project.service.js";

afterEach(() => vi.restoreAllMocks());
const conflict = expect.objectContaining({ code: "PROJECT_NUMBER_STATE_CONFLICT", status: 409 });
const projectA = "project-aurora-villa", projectB = "project-aurora-studio", unrelatedProject = "project-celeste-office";

function lead(id: string, projectId: string | null, projectNumber: string | null): LeadRecord {
  return { id, projectId, projectNumber, ownerId: "user-estimator-sales", clientName: "Synthetic client",
    clientEmail: "synthetic@example.test", clientMobile: "0000000000", projectName: "Same name", location: "Test city",
    propertyType: "Apartment", budgetMin: null, budgetMax: null, source: "test", stage: "new_lead", nextAction: "Estimate",
    nextActionAt: "2026-11-04T00:00:00Z", builder: null, areaSqft: null, targetHandoverAt: null, notes: null,
    latestActivityAt: null, createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" };
}

function setup() {
  const seed = structuredClone(demoSeedData);
  seed.projects = seed.projects.map(project => ({ ...project, name: "Same name" }));
  seed.leads = [lead("lead-a", projectA, "Lisno000012"), lead("lead-b", projectB, "Lisno000087"),
    lead("lead-other", unrelatedProject, "Lisno000105")];
  const repository = createMemoryRepository(seed);
  const service = createProjectService(repository, createAuditService(repository), () => new Date("2026-11-04T00:00:00Z"));
  const client = seed.users.find(user => user.id === "user-client-aurora")!;
  const designer = seed.users.find(user => user.id === "user-designer-ananya")!;
  return { seed, repository, service, client, designer };
}

describe("canonical project-number read resolution", () => {
  it("maps stable IDs, normalizes missing values and ignores unrequested/unlinked records", () => {
    const result = projectNumbersForProjectIds(["a", "b", "missing", "a"], [
      { projectId: "b", projectNumber: "Lisno000087" }, { projectId: "a", projectNumber: "Lisno000012" },
      { projectId: "outside", projectNumber: "invalid" }, { projectId: null, projectNumber: "Lisno000222" }
    ]);
    expect([...result]).toEqual([["a", "Lisno000012"], ["b", "Lisno000087"], ["missing", null]]);
    expect(projectNumbersForProjectIds([], [{ projectId: "outside", projectNumber: "invalid" }]).size).toBe(0);
    expect(projectNumbersForProjectIds(["old"], [{ projectId: "old" }, { projectId: "old", projectNumber: null }]).get("old")).toBeNull();
  });

  it.each([
    [{ projectId: "a", projectNumber: "invalid" }],
    [{ projectId: "a", projectNumber: "Lisno000001" }, { projectId: "a", projectNumber: null }],
    [{ projectId: "a", projectNumber: null }, { projectId: "a", projectNumber: "Lisno000001" }],
    [{ projectId: "a", projectNumber: "Lisno000001" }, { projectId: "b", projectNumber: "Lisno000001" }]
  ])("rejects invalid or ambiguous numbered identity %#", (...rows) => {
    expect(() => projectNumbersForProjectIds(["a", "b"], rows)).toThrow(conflict);
  });

  it("uses one metadata-only Mongo read and preserves a provided transaction session", async () => {
    const query = { select: vi.fn(), session: vi.fn(), lean: vi.fn(), exec: vi.fn().mockResolvedValue([
      { projectId: "b", projectNumber: "Lisno000087" }, { projectId: "a", projectNumber: "Lisno000012" }
    ]) };
    query.select.mockReturnValue(query); query.session.mockReturnValue(query); query.lean.mockReturnValue(query);
    const find = vi.spyOn(LeadModel, "find").mockReturnValue(query as never);
    const session = { id: "synthetic-session" } as unknown as ClientSession;
    expect(await createMongoRepository(session).findProjectNumbers(["a", "b", "missing", "a"]))
      .toEqual(new Map([["a", "Lisno000012"], ["b", "Lisno000087"], ["missing", null]]));
    expect(find).toHaveBeenCalledExactlyOnceWith({ projectId: { $in: ["a", "b", "missing"] } });
    expect(query.select).toHaveBeenCalledExactlyOnceWith({ _id: 0, projectId: 1, projectNumber: 1 });
    expect(query.session).toHaveBeenCalledExactlyOnceWith(session);
    find.mockClear();
    expect(await readProjectNumbers([])).toEqual(new Map());
    expect(find).not.toHaveBeenCalled();
  });

  it("keeps memory results aligned and detached from source persistence", async () => {
    const { repository } = setup();
    const first = await repository.findProjectNumbers([projectB, projectA, "missing"]);
    expect([...first]).toEqual([[projectB, "Lisno000087"], [projectA, "Lisno000012"], ["missing", null]]);
    first.set(projectA, "Lisno000999");
    expect((await repository.findProjectNumbers([projectA])).get(projectA)).toBe("Lisno000012");
    expect(await repository.findProjectById(projectA)).not.toHaveProperty("projectNumber");
    expect(await repository.findLeadById("lead-a")).toMatchObject({ projectNumber: "Lisno000012" });
  });
});

describe("authorized project identity projections", () => {
  it("adds only the matching identity to Client list/detail/summaries and staff detail", async () => {
    const { repository, service, client, designer } = setup();
    const lookup = vi.spyOn(repository, "findProjectNumbers");
    const page = await runWithHumanOperation("GET /projects", () => service.list(client, { limit: 20, offset: 0 }));
    expect(page.items.map(project => [project.id, project.projectNumber])).toEqual([
      [projectB, "Lisno000087"], [projectA, "Lisno000012"]
    ]);
    expect(lookup).toHaveBeenCalledExactlyOnceWith([projectB, projectA]);
    expect(JSON.stringify(page)).not.toContain("synthetic@example.test");
    expect(page.items[0]).not.toHaveProperty("ownerId");
    expect(page.items[0]).not.toHaveProperty("assignedDesignerIds");

    const summaries = await runWithHumanOperation("GET /client/project-summaries", () => service.clientSummaries(client, { limit: 20, offset: 0 }));
    expect(summaries.items.map(project => [project.id, project.projectNumber])).toEqual(page.items.map(project => [project.id, project.projectNumber]));
    for (const actor of [client, designer]) {
      const detail = await runWithHumanOperation("GET /projects/:projectId", () => service.get(actor, projectA));
      expect(detail).toMatchObject({ id: projectA, projectNumber: "Lisno000012", name: "Same name" });
    }
    expect(await repository.findProjectById(projectA)).not.toHaveProperty("projectNumber");
  });

  it("does not look up an unrelated project's number before rejecting its read", async () => {
    const { repository, service, client } = setup();
    const lookup = vi.spyOn(repository, "findProjectNumbers");
    await expect(runWithHumanOperation("GET /projects/:projectId", () => service.get(client, unrelatedProject)))
      .rejects.toMatchObject({ status: 404 });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns null for unnumbered projects and an explicit conflict for inconsistent numbered linkage", async () => {
    const { seed, client } = setup();
    seed.leads = [];
    const repository = createMemoryRepository(seed);
    const service = createProjectService(repository, createAuditService(repository), () => new Date("2026-11-04T00:00:00Z"));
    expect(await runWithHumanOperation("GET /projects/:projectId", () => service.get(client, projectA)))
      .toMatchObject({ id: projectA, projectNumber: null });
    expect(await repository.findProjectById(projectA)).not.toHaveProperty("projectNumber");
    expect(await repository.findLeadById("lead-a")).toBeNull();

    seed.leads = [lead("duplicate-a", projectA, null), lead("duplicate-b", projectA, "Lisno000001")];
    const inconsistentRepository = createMemoryRepository(seed);
    const inconsistent = createProjectService(inconsistentRepository, createAuditService(inconsistentRepository), () => new Date());
    await expect(runWithHumanOperation("GET /projects/:projectId", () => inconsistent.get(client, projectA))).rejects.toMatchObject({ code: "PROJECT_NUMBER_STATE_CONFLICT" });
  });
});
