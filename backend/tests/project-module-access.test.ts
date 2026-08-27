import { describe, expect, it } from "vitest";

import { AuthorizationConfigurationError } from "../src/domain/authorization.js";
import type { Role } from "../src/contracts/domain.js";
import { runWithHumanOperation } from "../src/domain/operation-context.js";
import { ApiError } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type {
  ProjectAccessGrantRecord,
  SeedData,
  UserRecord
} from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import type { PublicUser } from "../src/services/auth.service.js";
import {
  canAccessProjectForCurrentOperation,
  requireProjectOperationAccess
} from "../src/services/workflow.js";

function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

const PROJECT_OPERATION = "GET /projects/:projectId" as const;
const DESIGN_OPERATION = "GET /projects/:projectId/design-versions" as const;
const TEST_NOW = "2026-08-17T08:00:00.000Z";

function addUser(
  seed: SeedData,
  id: string,
  role: Role,
  active = true
): UserRecord {
  const record: UserRecord = {
    ...structuredClone(seed.users[0]!),
    id,
    name: id,
    email: `${id}@project-module.test`,
    emailNormalized: `${id}@project-module.test`,
    role,
    active,
    accountKind: "standard",
    managerId: null,
    authorizedClientIds: []
  };
  seed.users.push(record);
  return record;
}

function grant(
  id: string,
  userId: string,
  module: ProjectAccessGrantRecord["module"],
  source: ProjectAccessGrantRecord["source"],
  active = true
): ProjectAccessGrantRecord {
  return {
    id,
    projectId: "project-aurora-villa",
    userId,
    module,
    source,
    accessRequestId: source === "access_request" ? `request-${id}` : null,
    grantedById: "user-head",
    active,
    grantedAt: TEST_NOW,
    revokedAt: active ? null : TEST_NOW,
    revokedById: active ? null : "user-head",
    revocationReason: active ? null : "Revoked test grant",
    version: active ? 1 : 2,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW
  };
}

async function currentOperationAccess(
  seed: SeedData,
  userId: string,
  operation: typeof PROJECT_OPERATION | typeof DESIGN_OPERATION,
  projectId = "project-aurora-villa"
): Promise<boolean> {
  const repository = createMemoryRepository(structuredClone(seed));
  const actor = await repository.findUserById(userId);
  if (!actor) throw new Error(`Missing test actor ${userId}`);
  return runWithHumanOperation(operation, () =>
    canAccessProjectForCurrentOperation(
      repository,
      publicUser(actor),
      projectId
    )
  );
}

describe("registry-bound project module access", () => {
  it("does not fabricate legacy access from null team fields but honors the exact Admin grant", async () => {
    const seed = structuredClone(demoSeedData);
    const designer = addUser(seed, "null-team-designer", "designer");
    const manager = addUser(seed, "null-team-manager", "design_manager");
    const admin = addUser(seed, "null-team-admin", "admin");
    const project = seed.projects.find((candidate) => candidate.id === "project-aurora-villa")!;
    project.initiatingDesignerId = null;
    project.assignedEstimatorId = null;
    project.assignedDesignerIds = [];
    project.managerId = null;
    seed.projectAccessGrants.push(grant(
      "grant-null-team-admin",
      admin.id,
      "projects",
      "admin_initiator"
    ));

    await expect(currentOperationAccess(seed, designer.id, PROJECT_OPERATION)).resolves.toBe(false);
    await expect(currentOperationAccess(seed, manager.id, PROJECT_OPERATION)).resolves.toBe(false);
    await expect(currentOperationAccess(seed, admin.id, PROJECT_OPERATION)).resolves.toBe(true);
  });

  it.each([
    ["super_admin", true, true],
    ["admin", false, false],
    ["estimator_sales", false, false],
    ["designer", false, false],
    ["procurement", false, false],
    ["finance_head", false, false],
    ["site_manager", false, false],
    ["worker_electrician", false, false],
    ["worker_plumber", false, false],
    ["worker_carpenter", false, false],
    ["worker_painter", false, false],
    ["worker_civil", false, false],
    ["worker_other", false, false],
    ["design_manager", false, false],
    ["design_head", true, true],
    ["client", false, false]
  ] as const)(
    "applies the literal unlinked %s baseline for Projects and Design",
    async (role, projectsExpected, designExpected) => {
      const seed = structuredClone(demoSeedData);
      const actor = role === "super_admin"
        ? seed.users.find(({ id }) => id === "user-super-admin")!
        : addUser(seed, `isolated-${role}`, role);

      await expect(
        currentOperationAccess(seed, actor.id, PROJECT_OPERATION)
      ).resolves.toBe(projectsExpected);
      await expect(
        currentOperationAccess(seed, actor.id, DESIGN_OPERATION)
      ).resolves.toBe(designExpected);
    }
  );

  it("keeps Designer, Manager, and Client legacy relationships exact in both modules", async () => {
    const seed = structuredClone(demoSeedData);
    const designer = addUser(seed, "relationship-designer", "designer");
    const manager = addUser(seed, "relationship-manager", "design_manager");
    const client = addUser(seed, "relationship-client", "client");
    const project = seed.projects.find(
      (candidate) => candidate.id === "project-aurora-villa"
    )!;
    project.initiatingDesignerId = designer.id;
    project.assignedDesignerIds = [];
    project.managerId = manager.id;
    project.clientId = client.id;

    for (const [actor, projectsExpected, designExpected] of [
      [designer, true, true],
      [manager, true, true],
      [client, true, true]
    ] as const) {
      await expect(
        currentOperationAccess(seed, actor.id, PROJECT_OPERATION)
      ).resolves.toBe(projectsExpected);
      await expect(
        currentOperationAccess(seed, actor.id, DESIGN_OPERATION)
      ).resolves.toBe(designExpected);
      await expect(
        currentOperationAccess(
          seed,
          actor.id,
          PROJECT_OPERATION,
          "project-aurora-studio"
        )
      ).resolves.toBe(false);
      await expect(
        currentOperationAccess(
          seed,
          actor.id,
          DESIGN_OPERATION,
          "project-aurora-studio"
        )
      ).resolves.toBe(false);
    }
  });

  it("accepts only exact policy-eligible Designer and Admin grants", async () => {
    const seed = structuredClone(demoSeedData);
    const designer = addUser(seed, "granted-designer", "designer");
    const admin = addUser(seed, "granted-admin", "admin");
    seed.projectAccessGrants.push(
      grant(
        "grant-designer-design",
        designer.id,
        "design",
        "access_request"
      ),
      grant(
        "grant-admin-projects",
        admin.id,
        "projects",
        "admin_initiator"
      )
    );

    await expect(
      currentOperationAccess(seed, designer.id, DESIGN_OPERATION)
    ).resolves.toBe(true);
    await expect(
      currentOperationAccess(seed, designer.id, PROJECT_OPERATION)
    ).resolves.toBe(false);
    await expect(
      currentOperationAccess(seed, admin.id, PROJECT_OPERATION)
    ).resolves.toBe(true);
    await expect(
      currentOperationAccess(seed, admin.id, DESIGN_OPERATION)
    ).resolves.toBe(false);
  });

  it.each([
    ["estimator_sales", "estimation"],
    ["procurement", "procurement"],
    ["finance_head", "finance"],
    ["site_manager", "execution"],
    ["worker_electrician", "execution"],
    ["worker_plumber", "execution"],
    ["worker_carpenter", "execution"],
    ["worker_painter", "execution"],
    ["worker_civil", "execution"],
    ["worker_other", "execution"]
  ] as const)(
    "denies %s in Projects and Design despite a nonmatching %s grant",
    async (role, module) => {
      const seed = structuredClone(demoSeedData);
      const actor = addUser(seed, `future-${role}`, role);
      seed.projectAccessGrants.push(
        grant(
          `grant-future-${role}`,
          actor.id,
          module,
          "access_request"
        )
      );

      await expect(
        currentOperationAccess(seed, actor.id, PROJECT_OPERATION)
      ).resolves.toBe(false);
      await expect(
        currentOperationAccess(seed, actor.id, DESIGN_OPERATION)
      ).resolves.toBe(false);
    }
  );

  it.each([
    ["direct assignment", "designer-direct", "designer", "design", "direct_assignment", true],
    ["inactive grant", "designer-inactive-grant", "designer", "design", "access_request", false],
    ["Designer module mismatch", "designer-module-mismatch", "designer", "projects", "access_request", true],
    ["Admin access-request source", "admin-access-request", "admin", "projects", "access_request", true],
    ["Admin module mismatch", "admin-module-mismatch", "admin", "design", "admin_initiator", true]
  ] as const)(
    "rejects %s instead of widening project scope",
    async (_label, userId, role, module, source, active) => {
      const seed = structuredClone(demoSeedData);
      const actor = addUser(seed, userId, role);
      seed.projectAccessGrants.push(
        grant(`grant-${userId}`, actor.id, module, source, active)
      );

      await expect(
        currentOperationAccess(seed, actor.id, PROJECT_OPERATION)
      ).resolves.toBe(false);
      await expect(
        currentOperationAccess(seed, actor.id, DESIGN_OPERATION)
      ).resolves.toBe(false);
    }
  );

  it("derives scope from the registered operation instead of a caller string", async () => {
    const seed = structuredClone(demoSeedData);
    const designer = seed.users.find((user) => user.id === "user-designer-kabir")!;
    seed.projectAccessGrants.push({
      id: "grant-kabir-celeste-design",
      projectId: "project-celeste-office",
      userId: designer.id,
      module: "design",
      source: "access_request",
      accessRequestId: "request-kabir-celeste-design",
      grantedById: "user-head",
      active: true,
      grantedAt: "2026-08-17T08:00:00.000Z",
      revokedAt: null,
      revokedById: null,
      revocationReason: null,
      version: 1,
      createdAt: "2026-08-17T08:00:00.000Z",
      updatedAt: "2026-08-17T08:00:00.000Z"
    });
    const repository = createMemoryRepository(seed);
    const actor = publicUser(designer);

    await expect(
      runWithHumanOperation(
        "GET /projects/:projectId/design-versions",
        () => canAccessProjectForCurrentOperation(repository, actor, "project-celeste-office")
      )
    ).resolves.toBe(true);

    await expect(
      runWithHumanOperation(
        "GET /projects/:projectId",
        () => canAccessProjectForCurrentOperation(repository, actor, "project-celeste-office")
      )
    ).resolves.toBe(false);
  });

  it("fails closed without a registered project operation", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const designer = (await repository.findUserById("user-designer-ananya"))!;

    await expect(
      canAccessProjectForCurrentOperation(
        repository,
        publicUser(designer),
        "project-aurora-villa"
      )
    ).rejects.toBeInstanceOf(AuthorizationConfigurationError);

    await expect(
      runWithHumanOperation("GET /auth/me", () =>
        requireProjectOperationAccess(
          repository,
          publicUser(designer),
          "project-aurora-villa"
        )
      )
    ).rejects.toBeInstanceOf(AuthorizationConfigurationError);
  });

  it("revalidates active state and the exact stored role before revealing project scope", async () => {
    const seed = structuredClone(demoSeedData);
    const designer = seed.users.find((user) => user.id === "user-designer-ananya")!;
    const actor = publicUser(designer);
    designer.active = false;
    const inactiveRepository = createMemoryRepository(seed);

    await expect(
      runWithHumanOperation("GET /projects/:projectId", () =>
        canAccessProjectForCurrentOperation(
          inactiveRepository,
          actor,
          "project-aurora-villa"
        )
      )
    ).resolves.toBe(false);

    const staleRoleSeed = structuredClone(demoSeedData);
    staleRoleSeed.users.find(
      (user) => user.id === "user-designer-ananya"
    )!.role = "design_manager";
    const staleRoleRepository = createMemoryRepository(staleRoleSeed);
    await expect(
      runWithHumanOperation("GET /projects/:projectId", () =>
        canAccessProjectForCurrentOperation(
          staleRoleRepository,
          actor,
          "project-aurora-villa"
        )
      )
    ).resolves.toBe(false);
  });

  it("returns the same non-disclosing 404 for missing and inaccessible projects", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const designer = (await repository.findUserById("user-designer-kabir"))!;
    const actor = publicUser(designer);

    for (const projectId of ["project-celeste-office", "project-missing"]) {
      const error = await runWithHumanOperation(
        "GET /projects/:projectId",
        () => requireProjectOperationAccess(repository, actor, projectId)
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 404,
        code: "NOT_FOUND",
        message: "The requested resource was not found."
      });
    }
  });
});
