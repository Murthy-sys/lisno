import {
  AUTHORIZATION_POLICY_VERSION,
  PERMISSION_CODES,
  ACTIVE_ROLE_CODES,
  type AuthorizationSnapshot,
  type Role
} from "../contracts/authorization";
import {
  destinationsForAuthorization,
  landingDestination,
  resolveAuthorizedFeature,
  rootTabsForAuthorization
} from "./registry";

function snapshot(role: Role): AuthorizationSnapshot {
  return {
    role,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    permissions: PERMISSION_CODES
  };
}

describe("authorized mobile navigation", () => {
  it("exposes private Ask Lisno only to authorized Clients without changing their dock", () => {
    const client = snapshot("client");
    expect(resolveAuthorizedFeature("ask-lisno", "client", client)?.path).toBe("/feature/ask-lisno");
    expect(resolveAuthorizedFeature("ask-lisno", "client", { ...client, permissions: client.permissions.filter(permission => permission !== "ask_lisno.request") })).toBeNull();
    expect(resolveAuthorizedFeature("ask-lisno", "admin", snapshot("admin"))).toBeNull();
    expect(rootTabsForAuthorization("client", client).map(tab => tab.destination?.id ?? tab.id)).toEqual(["projects", "messages", "profile", "more"]);
  });
  it.each(ACTIVE_ROLE_CODES)("provides %s with an authorized landing destination", (role) => {
    const landing = landingDestination(role, snapshot(role));
    expect(landing).not.toBeNull();
    expect(snapshot(role).permissions).toContain(landing?.permission);
  });

  it("uses one Project Manager operational landing and retains existing work and approvals", () => {
    const manager = snapshot("site_manager");
    expect(landingDestination("site_manager", manager)?.id).toBe("execution");
    expect(destinationsForAuthorization("site_manager", manager).map(value => value.id)).toEqual(expect.arrayContaining(["execution", "projects", "work", "work-order-approvals", "performance"]));
    expect(landingDestination("program_manager", snapshot("program_manager"))).toBeNull();
    expect(destinationsForAuthorization("program_manager", snapshot("program_manager"))).toEqual([]);
    expect(rootTabsForAuthorization("program_manager", snapshot("program_manager"))).toEqual([]);
  });

  it("uses at most five persistent destinations", () => {
    for (const role of ACTIVE_ROLE_CODES) {
      const tabs = rootTabsForAuthorization(role, snapshot(role));
      expect(tabs.length).toBeGreaterThanOrEqual(3);
      expect(tabs.length).toBeLessThanOrEqual(5);
      expect(tabs.at(-2)).toEqual({ id: "profile", label: "Profile", destination: null });
      expect(tabs.at(-1)).toEqual({ id: "more", label: "More", destination: null });
    }
  });

  it("orders root tabs as landing, domain, messages, profile, then more", () => {
    expect(rootTabsForAuthorization("designer", snapshot("designer")).map((tab) => tab.id)).toEqual([
      "landing",
      "domain",
      "messages",
      "profile",
      "more"
    ]);
    const designerWithoutChat: AuthorizationSnapshot = {
      ...snapshot("designer"),
      permissions: snapshot("designer").permissions.filter((permission) => permission !== "chat.read")
    };
    expect(rootTabsForAuthorization("designer", designerWithoutChat).map((tab) => tab.id)).toEqual([
      "landing",
      "domain",
      "profile",
      "more"
    ]);
  });

  it("fails closed for mismatched roles and policy versions", () => {
    const authorization = snapshot("designer");
    expect(destinationsForAuthorization("client", authorization)).toEqual([]);
    expect(
      destinationsForAuthorization("designer", {
        ...authorization,
        policyVersion: "unknown-policy"
      })
    ).toEqual([]);
  });

  it("hides messages when chat permission is absent", () => {
    const authorization = snapshot("client");
    const withoutChat = {
      ...authorization,
      permissions: authorization.permissions.filter((permission) => permission !== "chat.read")
    };
    expect(rootTabsForAuthorization("client", withoutChat).map((tab) => tab.id)).toEqual([
      "landing",
      "profile",
      "more"
    ]);
  });

  it("uses chat.read, rather than identity access, for notifications", () => {
    const identityOnly: AuthorizationSnapshot = {
      role: "designer",
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      permissions: ["projects.list", "identity.self.read"]
    };
    expect(
      destinationsForAuthorization("designer", identityOnly).map(({ id }) => id)
    ).not.toContain("notifications");

    const withNotifications: AuthorizationSnapshot = {
      ...identityOnly,
      permissions: [...identityOnly.permissions, "chat.read"]
    };
    expect(
      destinationsForAuthorization("designer", withNotifications).map(({ id }) => id)
    ).toContain("notifications");
  });

  it("does not expose personal access-request navigation to Super Admin", () => {
    expect(
      destinationsForAuthorization("super_admin", snapshot("super_admin")).map(({ id }) => id)
    ).not.toContain("access-self");
  });

  it("does not resolve destinations by route input alone", () => {
    const authorization = snapshot("client");
    expect(resolveAuthorizedFeature("finance", "client", authorization)).toBeNull();
    expect(resolveAuthorizedFeature("projects", "client", authorization)?.id).toBe("projects");
  });

  it("allows authorized Super Admin and Procurement vendor access and preserves one Procurement root tab", () => {
    const full = snapshot("procurement");
    expect(resolveAuthorizedFeature("procurement-vendors", "procurement", full)?.path).toBe("/feature/procurement-vendors");
    expect(resolveAuthorizedFeature("procurement-vendors", "super_admin", snapshot("super_admin"))?.id).toBe("procurement-vendors");
    const onlyDashboard = { ...full, permissions: ["workflow.tasks.read", "procurement.workspace.read"] as const };
    const onlyVendors = { ...full, permissions: ["workflow.tasks.read", "procurement.vendor_directory.read"] as const };
    const neither = { ...full, permissions: ["workflow.tasks.read"] as const };
    expect(rootTabsForAuthorization("procurement", onlyDashboard).find((tab) => tab.id === "domain")?.destination?.id).toBe("procurement");
    expect(rootTabsForAuthorization("procurement", onlyVendors).find((tab) => tab.id === "domain")?.destination?.id).toBe("procurement-vendors");
    expect(rootTabsForAuthorization("procurement", onlyVendors).find((tab) => tab.id === "domain")?.label).toBe("Procurement");
    expect(rootTabsForAuthorization("procurement", neither).some((tab) => tab.id === "domain")).toBe(false);
    expect(resolveAuthorizedFeature("procurement-vendors", "procurement", onlyDashboard)).toBeNull();
  });
});
