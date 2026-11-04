import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { responsibilityCategories, hasIncompatibleResponsibility } from "../src/domain/user-responsibilities.js";
import { responsibilityCounts, responsibilitySeed, responsibilityUserId } from "./fixtures/user-responsibility-data.js";

describe("user responsibility enumeration", () => {
  it("explains all eleven guarded categories without changing terminal and retained-relationship rules", async () => {
    const repository = createMemoryRepository(responsibilitySeed());
    const page = await repository.pageUserResponsibilities(responsibilityUserId, { currentRole: "designer", destinationRole: "procurement", limit: 100, offset: 0 });
    expect(page.counts).toEqual(responsibilityCounts);
    expect(await repository.countUserResponsibilities(responsibilityUserId)).toEqual(page.counts);
    expect(page.total).toBe(15);
    expect(page.items).toHaveLength(15);
    expect(page.blockingCount).toBe(15);
    for (const category of responsibilityCategories) expect(page.items.filter(row => row.category === category)).toHaveLength(page.counts[category]);
    expect(page.items.find(row => row.sourceId === "inactive-report")).toMatchObject({ relatedUser: { id: "inactive-report", name: "Inactive report" }, contextState: "not_applicable" });
    expect(page.items.filter(row => row.sourceId === "project-completed").map(row => row.category)).toEqual(["linkedClientProjects"]);
    expect(page.items.some(row => /workflow-(superseded|completed)|task-completed|estimate-completed|lead-won|lead-other-owner/.test(row.sourceId))).toBe(false);
  });

  it("uses stable lineage and keeps missing/conflicting links visible", async () => {
    const repository = createMemoryRepository(responsibilitySeed());
    const page = await repository.pageUserResponsibilities(responsibilityUserId, { currentRole: "designer", limit: 100, offset: 0 });
    expect(page.items.find(row => row.sourceId === "estimate-alpha")).toMatchObject({ projectId: "project-alpha", project: null });
    for (const id of ["estimate-conflicting", "estimate-orphan"]) expect(page.items.find(row => row.sourceId === id)).toMatchObject({ projectId: null, contextState: "unavailable" });
    expect(page.items.find(row => row.sourceId === "lead-unlinked")).toMatchObject({ contextState: "unlinked", projectId: null, label: "Sales lead owner · Unlinked loft", workStage: { key: "site_visit", label: "Site visit" } });
    expect(page.items.find(row => row.sourceId === "task-alpha")).toMatchObject({ label: "Review kitchen layout", workStatus: "in_progress", workStage: { key: "stage-alpha", label: "Layout review" } });
  });

  it("pages blockers first and keeps complete counts, including compatible entries on later pages", async () => {
    const repository = createMemoryRepository(responsibilitySeed());
    const query = { currentRole: "admin" as const, destinationRole: "designer" as const, limit: 2, offset: 0 };
    const whole = await repository.pageUserResponsibilities(responsibilityUserId, { ...query, limit: 100 });
    const items = [];
    for (let offset = 0; offset < whole.total; offset += 2) {
      const page = await repository.pageUserResponsibilities(responsibilityUserId, { ...query, offset });
      expect(page.blockingCount).toBe(12);
      expect(page.counts).toEqual(whole.counts);
      expect(page.total).toBe(15);
      items.push(...page.items);
    }
    expect(items).toEqual(whole.items);
    expect(items.slice(0, 12).every(row => row.blocksRoleChange)).toBe(true);
    expect(items.slice(12).every(row => !row.blocksRoleChange)).toBe(true);
    expect(hasIncompatibleResponsibility(whole.counts, "designer")).toBe(true);
  });

  it("does not report a blocker when no role change is requested and isolates target users", async () => {
    const repository = createMemoryRepository(responsibilitySeed());
    for (const destinationRole of [undefined, "designer"] as const) {
      const page = await repository.pageUserResponsibilities(responsibilityUserId, { currentRole: "designer", destinationRole, limit: 20, offset: 0 });
      expect(page.blockingCount).toBe(0);
      expect(page.items.every(row => !row.blocksRoleChange)).toBe(true);
    }
    const other = await repository.pageUserResponsibilities("someone-else", { currentRole: "estimator_sales", limit: 20, offset: 0 });
    expect(other.items.map(row => row.sourceId)).toEqual(["lead-other-owner"]);
    expect(other.total).toBe(1);
    const empty = await repository.pageUserResponsibilities("nobody", { currentRole: "designer", limit: 20, offset: 0 });
    expect(empty).toMatchObject({ items: [], total: 0, blockingCount: 0 });
  });
});
