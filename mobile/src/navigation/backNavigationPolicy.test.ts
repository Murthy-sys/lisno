import {
  AUTHORIZATION_POLICY_VERSION,
  PERMISSION_CODES,
  ROLE_CODES,
  type PermissionCode,
  type Role
} from "../contracts/authorization";
import type { AuthenticatedSession } from "../contracts/session";
import {
  appDestination,
  BackEntryOwnership,
  destinationAllowed,
  parseEstimateRouteId,
  readAppStack,
  resolveBackAction,
  type AppStack,
  type NavigationEntry
} from "./backNavigationPolicy";

const fence = "qa:user-a:designer:generation-1";
const homeByRole: Record<Role, string> = {
  super_admin: "dashboard",
  admin: "projects",
  estimator_sales: "leads",
  designer: "projects",
  procurement: "work",
  finance_head: "work",
  site_manager: "work",
  worker_electrician: "work",
  worker_plumber: "work",
  worker_carpenter: "work",
  worker_painter: "work",
  worker_civil: "work",
  worker_other: "work",
  design_manager: "team",
  design_head: "organization",
  client: "projects"
};

function session(
  role: Role = "designer",
  permissions: readonly PermissionCode[] = PERMISSION_CODES
): AuthenticatedSession {
  return {
    user: { id: "user-a", name: "Test user", email: "test@example.invalid", role },
    authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions }
  };
}

function feature(featureId: string, key = `feature-${featureId}`): NavigationEntry {
  return { key, name: "feature/[featureId]", params: { featureId } };
}

function record(featureId: string, recordId = "record-a", key = `record-${recordId}`): NavigationEntry {
  return { key, name: "record/[featureId]/[recordId]", params: { featureId, recordId } };
}

function estimate(estimateId = "estimate-a", key = `estimate-${estimateId}`): NavigationEntry {
  return { key, name: "estimate/[estimateId]", params: { estimateId } };
}

function stack(routes: readonly NavigationEntry[], index = routes.length - 1): AppStack {
  return { key: "app-stack", routes, index };
}

function observedHistory(routes: readonly NavigationEntry[], ownerFence = fence): BackEntryOwnership {
  const ownership = new BackEntryOwnership();
  routes.forEach((_, index) => ownership.observe(ownerFence, stack(routes.slice(0, index + 1))));
  return ownership;
}

describe("mobile Back route state", () => {
  it("finds the app stack inside the focused nested navigator", () => {
    const app = stack([feature("projects"), record("projects")]);
    expect(readAppStack({
      key: "root",
      index: 1,
      routes: [
        { name: "inactive", state: stack([feature("messages")]) },
        { name: "active", state: { key: "layout", routes: [{ name: "(app)", state: app }] } }
      ]
    })).toEqual(app);
  });

  it("uses only the active nested stack, including its current index", () => {
    const app = stack([feature("projects"), feature("messages"), record("messages")], 1);
    expect(readAppStack(app)).toEqual(app);
    expect(readAppStack({ key: "root", index: 0, routes: [
      { name: "unrecognized" },
      { name: "inactive", state: app }
    ] })).toBeNull();
  });

  it("returns no stack/action while router state is absent or has no active entry", () => {
    expect(readAppStack(undefined)).toBeNull();
    expect(readAppStack({ routes: [] })).toBeNull();
    const ownership = new BackEntryOwnership();
    expect(resolveBackAction(null, session(), fence, ownership)).toEqual({ kind: "none" });
    expect(resolveBackAction(stack([]), session(), fence, ownership)).toEqual({ kind: "none" });
  });

  it("keeps stable route IDs and safely encodes a record ID", () => {
    expect(appDestination(record("projects", "project #2?view=private"))).toEqual({
      kind: "record",
      featureId: "projects",
      path: "/record/projects/project%20%232%3Fview%3Dprivate"
    });
    expect(appDestination({ key: "more", name: "more" })).toEqual({ kind: "more", path: "/more" });
    expect(appDestination(estimate("estimate #2?view=private"))).toEqual({
      kind: "record", featureId: "estimates", path: "/estimate/estimate%20%232%3Fview%3Dprivate"
    });
    expect(parseEstimateRouteId("estimate%20%232")).toBe("estimate #2");
  });

  it.each([
    feature("../projects"),
    record("projects", "nested/project"),
    record("projects", "nested\\project"),
    record("projects", "bad\u0000id"),
    record("projects", ""),
    estimate("nested/estimate"),
    estimate("nested\\estimate"),
    estimate("nested%2Festimate"),
    estimate("nested%252Festimate"),
    estimate("bad%ZZ"),
    estimate(""),
    estimate(".."),
    { name: "estimate/[estimateId]", params: { estimateId: ["estimate-a"] } },
    { name: "feature/[featureId]", params: { featureId: ["projects"] } },
    { name: "external", params: { href: "https://example.invalid" } }
  ])("does not create a Back destination from malformed or unrecognized route %j", (entry) => {
    expect(appDestination(entry)).toBeNull();
  });
});

describe("mobile Back home and fallback policy", () => {
  it.each(ROLE_CODES)("hides Back only on %s's exact authorized home feature", (role) => {
    const homeId = homeByRole[role];
    const routes = [feature("messages"), feature(homeId)];
    const ownership = observedHistory(routes);
    expect(resolveBackAction(stack(routes), session(role), fence, ownership)).toEqual({ kind: "none" });

    const detail = stack([record(homeId)]);
    expect(resolveBackAction(detail, session(role), fence, new BackEntryOwnership())).toEqual({
      kind: "replace", path: `/feature/${homeId}`
    });
  });

  it.each(ROLE_CODES)("returns secondary Messages and More screens to %s's home on direct entry", (role) => {
    for (const current of [feature("messages"), { key: "more", name: "more" }]) {
      expect(resolveBackAction(stack([current]), session(role), fence, new BackEntryOwnership())).toEqual({
        kind: "replace", path: `/feature/${homeByRole[role]}`
      });
    }
  });

  it("treats Projects as a secondary tab for Super Admin but as home for Admin", () => {
    const current = stack([feature("projects")]);
    expect(resolveBackAction(current, session("super_admin"), fence, new BackEntryOwnership())).toEqual({
      kind: "replace", path: "/feature/dashboard"
    });
    expect(resolveBackAction(current, session("admin"), fence, new BackEntryOwnership())).toEqual({ kind: "none" });
  });

  it("returns a cold-linked record to its authorized feature using replacement", () => {
    expect(resolveBackAction(stack([record("design-plans")]), session(), fence, new BackEntryOwnership())).toEqual({
      kind: "replace", path: "/feature/design-plans"
    });
  });

  it("returns a Client estimate to its authorized Estimates list", () => {
    expect(resolveBackAction(stack([estimate()]), session("client"), fence, new BackEntryOwnership(), "/feature/estimates")).toEqual({
      kind: "replace", path: "/feature/estimates"
    });
    const routes = [feature("estimates"), estimate()];
    expect(resolveBackAction(stack(routes), session("client"), fence, observedHistory(routes), "/feature/estimates")).toEqual({ kind: "pop", count: 1 });
    expect(resolveBackAction(stack([estimate()]), session("client", ["projects.client_summary.read"]), fence, new BackEntryOwnership(), "/feature/estimates")).toEqual({
      kind: "replace", path: "/feature/projects"
    });
  });

  it("uses home when a record's feature permission has been revoked", () => {
    expect(resolveBackAction(stack([record("design-plans")]), session("designer", ["projects.list"]), fence, new BackEntryOwnership())).toEqual({
      kind: "replace", path: "/feature/projects"
    });
  });

  it("returns recognized app routes to access-denied recovery when no authorized fallback exists", () => {
    const noLanding = session("designer", []);
    for (const entry of [feature("messages"), record("projects"), { key: "more", name: "more" }]) {
      expect(resolveBackAction(stack([entry]), noLanding, fence, new BackEntryOwnership())).toEqual({
        kind: "replace", path: "/access-denied"
      });
    }
    expect(resolveBackAction(stack([{ name: "access-denied" }]), noLanding, fence, new BackEntryOwnership())).toEqual({ kind: "none" });
    expect(destinationAllowed({ kind: "more", path: "/more" }, noLanding)).toBe(false);
  });

  it("returns a chat-only designer from a direct Messages entry to recovery", () => {
    const chatOnly = session("designer", ["chat.read"]);
    expect(resolveBackAction(stack([feature("messages")]), chatOnly, fence, new BackEntryOwnership())).toEqual({
      kind: "replace", path: "/access-denied"
    });
  });

  it("keeps access denied terminal without a landing even when earlier Messages is owned and authorized", () => {
    const routes = [feature("messages"), { key: "denied", name: "access-denied" }];
    const ownership = observedHistory(routes);
    const chatOnly = session("designer", ["chat.read"]);
    expect(ownership.owns(routes[0]!, fence)).toBe(true);
    expect(destinationAllowed(appDestination(routes[0])!, chatOnly)).toBe(true);
    expect(resolveBackAction(stack(routes), chatOnly, fence, ownership)).toEqual({ kind: "none" });
  });

  it("allows access-denied recovery to an available home and sign-in after session loss", () => {
    const current = stack([{ key: "denied", name: "access-denied" }]);
    expect(resolveBackAction(current, session(), fence, new BackEntryOwnership())).toEqual({
      kind: "replace", path: "/feature/projects"
    });
    expect(resolveBackAction(current, null, null, new BackEntryOwnership())).toEqual({ kind: "sign-in" });
  });

  it.each(["forgot-password", "reset-password", "accept-invitation"])("returns %s directly to sign-in without replaying prior routes", (name) => {
    const routes = [record("projects"), { key: "account", name, params: { token: "test-only-token" } }];
    const ownership = observedHistory(routes);
    expect(resolveBackAction(stack(routes), null, null, ownership)).toEqual({ kind: "sign-in" });
    expect(resolveBackAction(stack(routes), session(), fence, ownership)).toEqual({ kind: "sign-in" });
  });

  it.each(["index", "sign-in", "welcome", "startup-recovery", "unknown"])("leaves entry or unrelated flow %s to its existing routing", (name) => {
    expect(resolveBackAction(stack([{ name }]), session(), fence, new BackEntryOwnership())).toEqual({ kind: "none" });
  });
});

describe("mobile Back eligible native history", () => {
  it("pops to a known in-session predecessor instead of discarding the actual origin", () => {
    const routes = [{ key: "more", name: "more" }, feature("design-plans"), record("design-plans")];
    const ownership = observedHistory(routes);
    expect(resolveBackAction(stack(routes), session(), fence, ownership)).toEqual({ kind: "pop", count: 1 });
    expect(resolveBackAction(stack(routes.slice(0, 2)), session(), fence, ownership)).toEqual({ kind: "pop", count: 1 });
  });

  it("skips adjacent copies of the same logical screen with one native pop", () => {
    const routes = [feature("projects"), feature("messages", "messages-old"), feature("messages", "messages-new")];
    expect(resolveBackAction(stack(routes), session(), fence, observedHistory(routes))).toEqual({ kind: "pop", count: 2 });
  });

  it("replaces with home when a replaced root tab has no known predecessor", () => {
    const ownership = observedHistory([feature("projects")]);
    const current = stack([feature("messages")]);
    ownership.observe(fence, current);
    expect(ownership.owns(feature("projects"), fence)).toBe(false);
    expect(resolveBackAction(current, session(), fence, ownership)).toEqual({ kind: "replace", path: "/feature/projects" });
  });

  it("does not trust restored native history merely because the entries are present", () => {
    const routes = [feature("design-plans"), feature("messages")];
    const ownership = new BackEntryOwnership();
    ownership.observe(fence, stack(routes));
    expect(resolveBackAction(stack(routes), session(), fence, ownership)).toEqual({ kind: "replace", path: "/feature/projects" });
  });

  it.each([
    { key: "unrecognized", name: "unknown" },
    { key: "auth", name: "reset-password", params: { token: "test-only-token" } },
    feature("finance")
  ])("does not jump across an unknown, auth, or unauthorized predecessor %j", (previous) => {
    const routes = [feature("projects"), previous, feature("messages")];
    expect(resolveBackAction(stack(routes), session(), fence, observedHistory(routes))).toEqual({ kind: "replace", path: "/feature/projects" });
  });

  it("re-checks current permissions for an earlier owned route", () => {
    const routes = [feature("design-plans"), feature("messages")];
    const ownership = observedHistory(routes);
    expect(resolveBackAction(stack(routes), session("designer", ["projects.list", "chat.read"]), fence, ownership)).toEqual({
      kind: "replace", path: "/feature/projects"
    });
  });

  it("does not trust a predecessor whose feature params changed under the same native key", () => {
    const prior = feature("design-plans", "reused-key");
    const ownership = observedHistory([prior, feature("messages")]);
    const changedPrior = feature("projects", "reused-key");
    expect(ownership.owns(changedPrior, fence)).toBe(false);
    expect(resolveBackAction(stack([changedPrior, feature("messages")]), session(), fence, ownership)).toEqual({
      kind: "replace", path: "/feature/projects"
    });
  });

  it("does not trust a different record ID under the same native key", () => {
    const previous = record("projects", "project-a", "reused-record-key");
    const ownership = observedHistory([previous, feature("messages")]);
    expect(ownership.owns(record("projects", "project-b", "reused-record-key"), fence)).toBe(false);
  });

  it.each([
    ["identity", "qa:user-b:designer:generation-1"],
    ["role", "qa:user-a:client:generation-1"],
    ["environment", "production:user-a:designer:generation-1"],
    ["session generation", "qa:user-a:designer:generation-2"],
    ["sign-out", null]
  ])("excludes retained native keys after %s changes", (_, changedFence) => {
    const routes = [feature("design-plans"), feature("messages")];
    const ownership = observedHistory(routes);
    ownership.observe(changedFence, stack(routes));
    ownership.observe(changedFence, stack(routes, 0));
    expect(ownership.owns(routes[0]!, changedFence)).toBe(false);
    expect(ownership.owns(routes[1]!, changedFence)).toBe(false);
    expect(ownership.owns(routes[0]!, fence)).toBe(false);
    expect(resolveBackAction(stack(routes), session(), changedFence, ownership)).toEqual({ kind: "replace", path: "/feature/projects" });
  });

  it("accepts fresh entries after a fence change while excluding retained keys", () => {
    const routes = [feature("projects"), feature("messages")];
    const ownership = observedHistory(routes);
    const nextFence = "qa:user-b:designer:generation-2";
    ownership.observe(nextFence, stack(routes));
    const fresh = feature("design-plans", "new-session-design-plans");
    ownership.observe(nextFence, stack([...routes, fresh]));
    expect(ownership.owns(fresh, nextFence)).toBe(true);
    expect(ownership.owns(routes[1]!, nextFence)).toBe(false);
    const nextRoutes = [...routes, fresh, record("design-plans", "new-session-record")];
    ownership.observe(nextFence, stack(nextRoutes));
    expect(resolveBackAction(stack(nextRoutes), session(), nextFence, ownership)).toEqual({ kind: "pop", count: 1 });
  });

  it("does not reuse observed history after session loss", () => {
    const routes = [feature("design-plans"), feature("messages")];
    expect(resolveBackAction(stack(routes), null, null, observedHistory(routes))).toEqual({ kind: "none" });
  });
});

describe("explicit record parent Back", () => {
  it("returns one pop action when the authorized feature list is immediately previous", () => {
    const routes = [feature("messages"), record("messages", "conversation-a")];
    expect(resolveBackAction(stack(routes), session(), fence, observedHistory(routes), "/feature/messages")).toEqual({ kind: "pop", count: 1 });
  });

  it("returns one replacement action when a different known screen precedes a thread", () => {
    const routes = [feature("projects"), record("messages", "conversation-a")];
    expect(resolveBackAction(stack(routes), session(), fence, observedHistory(routes), "/feature/messages")).toEqual({
      kind: "replace", path: "/feature/messages"
    });
  });

  it("resolves a cold-linked thread to its authorized list", () => {
    expect(resolveBackAction(stack([record("messages", "conversation-a")]), session(), fence, new BackEntryOwnership(), "/feature/messages")).toEqual({
      kind: "replace", path: "/feature/messages"
    });
  });

  it("uses authorized home when the explicit Messages parent permission is revoked", () => {
    const routes = [feature("messages"), record("messages", "conversation-a")];
    expect(resolveBackAction(stack(routes), session("designer", ["projects.list"]), fence, observedHistory(routes), "/feature/messages")).toEqual({
      kind: "replace", path: "/feature/projects"
    });
  });

  it("rejects an unrelated explicit parent even when that authorized route is previous", () => {
    const routes = [feature("projects"), record("messages", "conversation-a")];
    expect(resolveBackAction(stack(routes), session(), fence, observedHistory(routes), "/feature/projects")).toEqual({ kind: "none" });
  });

  it.each(["/feature/finance", "/more", "https://example.invalid", "/feature/projects"])("rejects an unrelated explicit parent %s", (parent) => {
    const routes = [record("messages", "conversation-a")];
    expect(resolveBackAction(stack(routes), session(), fence, observedHistory(routes), parent)).toEqual({ kind: "none" });
  });
});
