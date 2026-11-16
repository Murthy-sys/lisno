import type { SeedData } from "../../src/repositories/types.js";
import { PROJECT_INITIATION_DEFAULTS_ID } from "../../src/contracts/project-initiation-defaults.js";
import { ProjectInitiationDefaultsModel } from "../../src/models/ProjectInitiationDefaults.js";
import { UserModel } from "../../src/models/User.js";

export const defaultProjectManagerId = "test-default-project-manager";

/** Explicit opt-in for successful creation fixtures; never modifies application seeds. */
export function withProjectInitiationDefault(seed: SeedData): SeedData {
  const result = structuredClone(seed);
  const template = result.users[0]!;
  result.users.push({ ...template, id: defaultProjectManagerId, name: "Default Project Manager", role: "site_manager",
    email: "default-pm@example.test", emailNormalized: "default-pm@example.test", active: true,
    accountKind: "standard", deletedAt: null, managerId: null, vendorId: null });
  result.projectInitiationDefaults = { projectManagerId: defaultProjectManagerId, version: 1,
    updatedById: "test-default-admin", updatedAt: "2026-11-15T00:00:00.000Z" };
  return result;
}

export async function insertProjectInitiationDefault(projectManagerId = defaultProjectManagerId): Promise<void> {
  if (!await UserModel.exists({ _id: projectManagerId })) await UserModel.create({ _id: projectManagerId, name: "Default Project Manager", role: "site_manager",
    email: `${projectManagerId}@example.test`, emailNormalized: `${projectManagerId}@example.test`,
    passwordHash: "unused-test-password", active: true, accountKind: "standard" });
  await ProjectInitiationDefaultsModel.create({ _id: PROJECT_INITIATION_DEFAULTS_ID, projectManagerId, version: 1,
    updatedById: "test-default-admin", updatedAt: new Date("2026-11-15T00:00:00.000Z") });
}
