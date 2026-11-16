import { describe, expect, it } from "vitest";
import { demoSeedData } from "../src/seed/data.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { RepositoryConflictError } from "../src/repositories/types.js";
import { readProjectInitiationDefaults, resolveProjectManagerDefault } from "../src/services/project-initiation-default-resolution.js";
import { defaultProjectManagerId, withProjectInitiationDefault } from "./helpers/project-initiation-defaults.js";

const record = { projectManagerId: defaultProjectManagerId, version: 1, updatedById: "admin", updatedAt: "2026-11-15T00:00:00.000Z" };

describe("Project initiation default repository and resolution", () => {
  it("does not invent a default even if an active Project Manager exists", async () => {
    const repository = createMemoryRepository(demoSeedData);
    await expect(readProjectInitiationDefaults(repository)).resolves.toEqual({ version: 0, status: "unconfigured", projectManager: null });
    await expect(resolveProjectManagerDefault(repository)).rejects.toMatchObject({ code: "PROJECT_INITIATION_DEFAULT_UNCONFIGURED" });
  });

  it("returns only the configured stable identity and checks the observed version", async () => {
    const repository = createMemoryRepository(withProjectInitiationDefault(demoSeedData));
    await expect(resolveProjectManagerDefault(repository, 1)).resolves.toEqual({ projectManagerId: defaultProjectManagerId, version: 1 });
    await expect(resolveProjectManagerDefault(repository, 0)).rejects.toMatchObject({ code: "PROJECT_INITIATION_DEFAULT_VERSION_CONFLICT" });
  });

  it.each(["inactive", "deleted", "wrong_role", "missing"])("hides unavailable manager details: %s", async reason => {
    const seed = withProjectInitiationDefault(demoSeedData);
    const manager = seed.users.find(user => user.id === defaultProjectManagerId)!;
    if (reason === "inactive") manager.active = false;
    if (reason === "deleted") manager.deletedAt = "2026-11-15T01:00:00.000Z";
    if (reason === "wrong_role") manager.role = "admin";
    if (reason === "missing") seed.users = seed.users.filter(user => user.id !== manager.id);
    const repository = createMemoryRepository(seed);
    await expect(readProjectInitiationDefaults(repository)).resolves.toEqual({ version: 1, status: "unavailable", projectManager: null });
    await expect(resolveProjectManagerDefault(repository)).rejects.toMatchObject({ code: "PROJECT_INITIATION_DEFAULT_UNAVAILABLE" });
  });

  it("requires a transaction and rolls settings back with its transaction", async () => {
    const repository = createMemoryRepository(demoSeedData);
    await expect(repository.saveProjectInitiationDefaults(record, 0)).rejects.toThrow("require a transaction");
    await expect(repository.runInTransaction(async transaction => {
      await transaction.saveProjectInitiationDefaults(record, 0);
      throw new Error("abort");
    })).rejects.toThrow("abort");
    await expect(repository.findProjectInitiationDefaults()).resolves.toBeNull();
  });

  it("commits one competing initial save and rejects a stale replacement", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const attempts = await Promise.allSettled(["pm-a", "pm-b"].map(projectManagerId => repository.runInTransaction(transaction =>
      transaction.saveProjectInitiationDefaults({ ...record, projectManagerId }, 0))));
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
    await expect(repository.runInTransaction(transaction => transaction.saveProjectInitiationDefaults({ ...record, version: 2 }, 0))).rejects.toBeInstanceOf(RepositoryConflictError);
    expect((await repository.findProjectInitiationDefaults())?.version).toBe(1);
  });

  it("does not expose another creator's project through the Sales summary", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const actor = (await repository.findUserById("user-estimator-sales"))!;
    const project = demoSeedData.projects[0]!;
    await expect(repository.findSalesInitiatedProject(actor, project.id)).resolves.toBeNull();
  });
});
