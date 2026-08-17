import { describe, expect, it } from "vitest";

import { AuthorizationConfigurationError } from "../src/domain/authorization.js";
import { runWithHumanOperation } from "../src/domain/operation-context.js";
import { ApiError } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { UserRecord } from "../src/repositories/types.js";
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

describe("registry-bound project module access", () => {
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
