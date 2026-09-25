import {
  AUTHORIZATION_POLICY_VERSION,
  PERMISSION_CODES,
  ROLE_CODES,
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
  it.each(ROLE_CODES)("provides %s with an authorized landing destination", (role) => {
    const landing = landingDestination(role, snapshot(role));
    expect(landing).not.toBeNull();
    expect(snapshot(role).permissions).toContain(landing?.permission);
  });

  it("uses at most five persistent destinations", () => {
    for (const role of ROLE_CODES) {
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
});
