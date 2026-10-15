import { AUTHORIZATION_POLICY_VERSION, PERMISSION_CODES, type PermissionCode, type Role } from "../contracts/authorization";
import type { AuthenticatedSession } from "../contracts/session";
import { resolveProcurementNavigation } from "./procurementMenuModel";

function session(permissions: readonly PermissionCode[] = PERMISSION_CODES, role: Role = "procurement"): AuthenticatedSession {
  return { user: { id: "procurement-one", name: "Procurement", email: "qa@example.invalid", role },
    authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions } };
}

describe("web-aligned procurement navigation", () => {
  it("preserves ordered top-level sections and all three procurement children", () => {
    const entries = resolveProcurementNavigation(session(), "my-requests");
    expect(entries.map((entry) => entry.label)).toEqual([
      "Execution", "Project messages", "Procurement", "Work order approvals", "My access requests", "Home"
    ]);
    const group = entries.find((entry) => entry.kind === "group");
    expect(group?.selected).toBe(true);
    if (group?.kind !== "group") throw new Error("Expected procurement group");
    expect(group.children.map((entry) => [entry.label, entry.destination.path, entry.selected])).toEqual([
      ["Projects", "/feature/procurement", false],
      ["Vendors", "/feature/procurement-vendors", false],
      ["All my requests", "/feature/my-requests", true]
    ]);
  });

  it("filters every child independently without requiring dashboard or home access", () => {
    const entries = resolveProcurementNavigation(session(["procurement.vendor_directory.read"]), "procurement");
    expect(entries).toHaveLength(1);
    const group = entries[0];
    if (group?.kind !== "group") throw new Error("Expected procurement group");
    expect(group.children.map((entry) => entry.id)).toEqual(["procurement-vendors", "my-requests"]);
    expect(group.selected).toBe(false);
  });

  it("omits empty groups and unrelated unauthorized destinations", () => {
    const entries = resolveProcurementNavigation(session(["workflow.tasks.read", "chat.read"]), "work");
    expect(entries.map((entry) => entry.label)).toEqual(["Project messages", "Home"]);
    expect(entries.at(-1)?.selected).toBe(true);
    expect(resolveProcurementNavigation(session([]))).toEqual([]);
  });

  it("does not apply this shell to other roles or stale authorization", () => {
    expect(resolveProcurementNavigation(session(PERMISSION_CODES, "super_admin"))).toEqual([]);
    const current = session();
    expect(resolveProcurementNavigation({ ...current, authorization: { ...current.authorization, role: "client" } })).toEqual([]);
    expect(resolveProcurementNavigation({ ...current, authorization: { ...current.authorization, policyVersion: "stale" } })).toEqual([]);
  });
});
